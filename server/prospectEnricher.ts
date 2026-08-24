import { generateUnifiedLLM } from "./llm";

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";
const FIRECRAWL_SEARCH_ENDPOINT = "https://api.firecrawl.dev/v1/search";
const GOOGLE_RSS_BASE = "https://news.google.com/rss/search";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProspectIntelligence {
  placeId: string;
  businessName: string;
  category: string;
  address: string;
  mapsUrl: string;
  phone: string | null;
  websiteUrl: string | null;
  discoveredWebsiteUrl: string | null;
  websiteSearchStatus: "found" | "not_found" | "inconclusive" | "not_run";
  websiteSearchEvidence: string | null;
  rating: number | null;
  reviewCount: number;
  photoCount: number;
  likelyUnclaimed: boolean;

  // Enrichment
  ownerName: string | null;         // from About page or LinkedIn search
  ownerLinkedIn: string | null;     // LinkedIn profile URL
  ownerEmail: string | null;        // from website About page
  enrichmentSource: string[];       // which enrichment steps fired

  // Intelligence
  painSummary: string;              // 1-2 sentence summary of their problems
  problemStatement: string;         // detailed problem we detected
  ourSolution: string;              // specific solution we offer
  pitch: string;                    // ready-to-send outreach message
  outreachChannel: "phone" | "email" | "linkedin" | "google_maps";
  estimatedDealValue: number;       // in dollars/year
  urgencyScore: number;             // 0–100
  opportunityScore: number;
  reasons: string[];
}

const DIRECTORY_HOSTS = [
  "google.com", "facebook.com", "instagram.com", "linkedin.com", "yelp.com",
  "bbb.org", "yellowpages.com", "mapquest.com", "angi.com", "homeadvisor.com",
  "thumbtack.com", "nextdoor.com", "chamberofcommerce.com", "buildzoom.com"
];

const normalizeWords = (value: string) => value.toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ")
  .split(/\s+/)
  .filter(word => word.length > 2 && !["the", "and", "llc", "inc", "company", "services", "service", "contractor", "contractors"].includes(word));

export async function searchForOfficialWebsite(
  businessName: string,
  address: string,
  phone: string | null,
  firecrawlKey: string | undefined
): Promise<{ status: "found" | "not_found" | "inconclusive" | "not_run"; url: string | null; evidence: string | null }> {
  if (!firecrawlKey) return { status: "not_run", url: null, evidence: "FIRECRAWL_API_KEY is not configured." };

  try {
    const addressParts = address.split(",").map(part => part.trim()).filter(Boolean);
    const locationTerms = addressParts.slice(1).join(" ") || address;
    const response = await fetch(FIRECRAWL_SEARCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${firecrawlKey}` },
      body: JSON.stringify({
        query: `"${businessName}" ${locationTerms}`,
        limit: 5,
        location: address,
        timeout: 15000,
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true }
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) return { status: "inconclusive", url: null, evidence: `Web search failed (${response.status}).` };

    const body: any = await response.json();
    const results = Array.isArray(body?.data) ? body.data : [];
    if (results.length === 0) return { status: "not_found", url: null, evidence: "No public web results matched the exact business name and address." };

    const nameWords = normalizeWords(businessName);
    const phoneDigits = String(phone || "").replace(/\D/g, "").slice(-10);
    let uncertainUrl: string | null = null;

    for (const result of results) {
      const url = String(result?.url || result?.metadata?.sourceURL || "").trim();
      if (!url) continue;
      let host = "";
      try { host = new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { continue; }
      if (DIRECTORY_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`))) continue;

      const searchable = `${result?.title || ""} ${result?.description || ""} ${result?.markdown || ""}`.toLowerCase();
      const matchedNameWords = nameWords.filter(word => searchable.includes(word) || host.includes(word));
      const strongNameMatch = nameWords.length > 0 && matchedNameWords.length >= Math.min(2, nameWords.length);
      const phoneMatch = phoneDigits.length === 10 && searchable.replace(/\D/g, "").includes(phoneDigits);
      const normalizedAddressParts = address.toLowerCase().split(",").map(part => part.trim()).filter(Boolean);
      const locationMatch = normalizedAddressParts.some(part => part.length > 4 && searchable.includes(part));

      if (strongNameMatch && (phoneMatch || locationMatch)) {
        return { status: "found", url, evidence: `Official-site candidate matched the business name and ${phoneMatch ? "phone number" : "location"}.` };
      }
      if (strongNameMatch && !uncertainUrl) uncertainUrl = url;
    }

    return uncertainUrl
      ? { status: "inconclusive", url: uncertainUrl, evidence: "A non-directory site matched the name, but its phone or location could not be confirmed." }
      : { status: "not_found", url: null, evidence: "Results were directories, social profiles, or did not match the business identity." };
  } catch (error: any) {
    return { status: "inconclusive", url: null, evidence: `Web search could not be completed: ${error?.message || "unknown error"}` };
  }
}

// ─── Website enrichment via Firecrawl ─────────────────────────────────────────

const ABOUT_PAGE_SLUGS = ["/about", "/about-us", "/our-story", "/team", "/who-we-are", "/meet-us", "/owner", "/contact"];

const OWNER_PATTERNS = [
  /(?:owner|founder|president|principal|proprietor|ceo|operator)[:\s,–-]+([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})/gi,
  /(?:I'?m|I am|my name is|this is)\s+([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})/gi,
  /([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})[,\s]*(?:owner|founder|president|principal|ceo|operator)/gi,
  /started by\s+([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})/gi,
];

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b/g;

function extractOwnerFromText(text: string): string | null {
  for (const pattern of OWNER_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match?.[1]) {
      const name = match[1].trim();
      // Sanity check: looks like a real name (2+ words, not all caps)
      if (name.split(" ").length >= 2 && name !== name.toUpperCase()) {
        return name;
      }
    }
  }
  return null;
}

function extractEmailFromText(text: string): string | null {
  const matches = text.match(EMAIL_PATTERN);
  if (!matches) return null;
  // Filter out generic/no-reply addresses
  const filtered = matches.filter(e =>
    !e.startsWith("noreply") &&
    !e.startsWith("no-reply") &&
    !e.includes("example.com") &&
    !e.includes("yourdomain")
  );
  return filtered[0] || null;
}

export async function enrichWebsite(
  websiteUrl: string,
  firecrawlKey: string
): Promise<{ ownerName: string | null; ownerEmail: string | null; source: string }> {
  const base = websiteUrl.replace(/\/$/, "");

  for (const slug of ABOUT_PAGE_SLUGS) {
    const targetUrl = `${base}${slug}`;
    try {
      const res = await fetch(FIRECRAWL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${firecrawlKey}`
        },
        body: JSON.stringify({
          url: targetUrl,
          formats: ["markdown"],
          onlyMainContent: true,
          timeout: 8000
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (!res.ok) continue;
      const data: any = await res.json();
      const text = data?.data?.markdown || data?.markdown || "";
      if (text.length < 50) continue;

      const ownerName = extractOwnerFromText(text);
      const ownerEmail = extractEmailFromText(text);

      if (ownerName || ownerEmail) {
        console.log(`[Enricher] Found on ${targetUrl}: owner="${ownerName}", email="${ownerEmail}"`);
        return { ownerName, ownerEmail, source: `website:${slug}` };
      }
    } catch {
      // Try next slug
    }
  }

  return { ownerName: null, ownerEmail: null, source: "" };
}

// ─── LinkedIn owner search via Google News RSS proxy ─────────────────────────

export async function searchLinkedInOwner(
  businessName: string,
  location: string
): Promise<{ ownerName: string | null; linkedInUrl: string | null }> {
  try {
    const query = `site:linkedin.com "${businessName}" owner OR founder OR president`;
    const feedUrl = `${GOOGLE_RSS_BASE}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OpportunityRadar/1.0)" },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return { ownerName: null, linkedInUrl: null };
    const xml = await res.text();

    // Extract first LinkedIn result
    const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
    if (!itemMatch) return { ownerName: null, linkedInUrl: null };

    const titleMatch = itemMatch[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
    const linkMatch = itemMatch[1].match(/<link>(.*?)<\/link>/);
    const title = titleMatch?.[1] || "";
    const url = linkMatch?.[1] || "";

    if (!url.includes("linkedin.com")) return { ownerName: null, linkedInUrl: null };

    // Try to extract name from title: "John Smith - Owner at Rodriguez HVAC | LinkedIn"
    const nameMatch = title.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})\s*[-–|]/);
    const ownerName = nameMatch?.[1] || null;

    console.log(`[Enricher] LinkedIn hit for "${businessName}": ${ownerName} → ${url}`);
    return { ownerName, linkedInUrl: url || null };
  } catch {
    return { ownerName: null, linkedInUrl: null };
  }
}

// ─── Gemini intelligence generation ──────────────────────────────────────────

export async function generateProspectIntelligence(
  business: {
    businessName: string;
    category: string;
    address: string;
    phone: string | null;
    websiteUrl: string | null;
    rating: number | null;
    reviewCount: number;
    photoCount: number;
    hasHours: boolean;
    hasDescription: boolean;
    likelyUnclaimed: boolean;
    reasons: string[];
    recentEvidence: Array<{ text: string; signals: string[] }>;
    ownerName: string | null;
    ownerEmail: string | null;
    discoveredWebsiteUrl?: string | null;
    websiteSearchStatus?: string;
  }
): Promise<{
  painSummary: string;
  problemStatement: string;
  ourSolution: string;
  pitch: string;
  outreachChannel: "phone" | "email" | "linkedin" | "google_maps";
  estimatedDealValue: number;
  urgencyScore: number;
}> {
  const reviewSnippets = business.recentEvidence
    .map(r => `"${r.text.slice(0, 200)}"`)
    .join("\n");

  const prompt = `You are a business development analyst for a solo web and automation consultant.
Analyze this real local business and produce a prospect intelligence report.

BUSINESS:
- Name: ${business.businessName}
- Category: ${business.category}
- Location: ${business.address}
- Phone: ${business.phone || "NOT LISTED"}
- Website: ${business.websiteUrl || "NO WEBSITE"}
- Website discovered outside Google: ${business.discoveredWebsiteUrl || "NONE CONFIRMED"}
- Independent website search status: ${business.websiteSearchStatus || "not_run"}
- Rating: ${business.rating ?? "No rating"} (${business.reviewCount} reviews)
- Photos: ${business.photoCount}
- Has Hours Listed: ${business.hasHours}
- Has Business Description: ${business.hasDescription}
- Likely Unclaimed Profile: ${business.likelyUnclaimed}
- Profile Issues Detected: ${business.reasons.join("; ")}
- Owner/Decision Maker: ${business.ownerName || "Unknown"}

PRIMARY VERIFIED OPPORTUNITY SIGNAL:
- Google Places returned no website for this business. An independent search may still locate one; use the status above.

RECENT CUSTOMER REVIEWS (last 14 days):
${reviewSnippets || "No recent reviews available."}

Our capabilities & price ranges:
- Google Business Profile claim + full optimization: $300–$500 setup, $75/mo maintenance
- Simple 5-page website build: $800–$1,500 setup, $100/mo hosting/updates
- AI voice receptionist (answers calls 24/7, books jobs): $1,200–$2,000 setup, $200–$300/mo
- Missed-call text-back automation: $400–$600 setup, $75–$100/mo
- Online booking + scheduling system: $600–$1,000 setup, $100–$150/mo
- Full CRM + follow-up automation: $1,500–$2,500 setup, $300–$500/mo
We only pitch what we can build in under 2 weeks with our AI agent fleet.

GROUNDING RULES:
- Treat "no website listed in Google Places" as verified, but do not claim the business has no website anywhere on the internet.
- Do not invent lost revenue, missed leads, operational pain, owner details, or customer complaints.
- Only mention a complaint when it appears verbatim in the supplied recent reviews.
- If there is no complaint evidence, focus the proposed service and outreach on the missing website listing.
- If an official website was discovered outside Google, do not pitch a new website as though none exists. Focus on connecting or correcting the Google profile and ask whether the existing site needs improvement.

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "painSummary": "1-2 sentence plain-English summary of their biggest problem",
  "problemStatement": "2-3 sentences describing the specific operational bottleneck detected",
  "ourSolution": "1-2 sentences describing exactly what we would build and why it fits",
  "suggestedService": "Name of the specific service package (e.g. AI Voice Receptionist, Google Profile Optimization)",
  "setupFee": 0,
  "monthlyRetainer": 0,
  "pitch": "Short natural human outreach message (3-5 sentences). Sound like a real founder, not a robot. No buzzwords. Use owner first name if known. Reference the specific problem noticed. Do NOT mention AI or automation tools by name in the pitch.",
  "callScript": "A 4-6 sentence phone call opener script the founder reads when calling this business. Natural, conversational, mention a specific detail about their business.",
  "outreachChannel": "phone OR email OR google_maps",
  "urgencyScore": 0
}`;

  try {
    const text = await generateUnifiedLLM({
      systemPrompt: "You are a precise business development analyst. Output only valid JSON.",
      prompt,
      responseJson: true,
      temperature: 0.2
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in LLM response");
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("[ProspectEnricher] LLM generation failed:", err);
    // Fallback values
    const hasPhone = Boolean(business.phone);
    const hasDiscoveredWebsite = Boolean(business.discoveredWebsiteUrl);
    return {
      painSummary: hasDiscoveredWebsite
        ? `${business.businessName} has an apparent official website that is not linked from its Google Places profile.`
        : `${business.businessName} has no website listed in its live Google Places profile, and the independent search did not confirm one.`,
      problemStatement: hasDiscoveredWebsite
        ? `Google Places returned no website, while an independent web search found a likely official site. The profile link may be missing or outdated.`
        : `Google Places returned no website for this ${business.category} in ${business.address}. No additional operational problem is assumed without direct review evidence.`,
      ourSolution: hasDiscoveredWebsite
        ? "Confirm the discovered site with the owner, then connect or correct it on the Google Business Profile."
        : "Offer a focused, mobile-friendly business website and connect it to the existing Google profile after the owner confirms their needs.",
      pitch: `Hey${business.ownerName ? ` ${business.ownerName.split(" ")[0]}` : ""} — I came across ${business.businessName} on Google and noticed there isn't a website listed on the profile. Is that something you're looking to fix, or do you already have a site that just needs to be connected?`,
      outreachChannel: hasPhone ? "phone" : "google_maps",
      estimatedDealValue: hasDiscoveredWebsite ? 500 : 1800,
      urgencyScore: hasDiscoveredWebsite ? 45 : (business.likelyUnclaimed ? 75 : 50)
    };
  }
}

// ─── Full enrichment pipeline for one business ───────────────────────────────

export async function runFullEnrichment(
  rawBusiness: any,
  firecrawlKey: string | undefined
): Promise<Partial<ProspectIntelligence>> {
  let ownerName: string | null = null;
  let ownerEmail: string | null = null;
  let ownerLinkedIn: string | null = null;
  const enrichmentSource: string[] = [];

  const websiteSearch = await searchForOfficialWebsite(
    rawBusiness.name,
    rawBusiness.address,
    rawBusiness.phone,
    firecrawlKey
  );
  const discoveredWebsiteUrl = websiteSearch.url;
  if (websiteSearch.status === "found") enrichmentSource.push("web-search:official-site");

  // Step 1: Website scraping (if website exists and Firecrawl key is present)
  const enrichmentWebsite = rawBusiness.websiteUrl || (websiteSearch.status === "found" ? discoveredWebsiteUrl : null);
  if (enrichmentWebsite && firecrawlKey) {
    try {
      const webResult = await enrichWebsite(enrichmentWebsite, firecrawlKey);
      if (webResult.ownerName) { ownerName = webResult.ownerName; enrichmentSource.push(webResult.source); }
      if (webResult.ownerEmail) { ownerEmail = webResult.ownerEmail; enrichmentSource.push("website:email"); }
    } catch (e) {
      console.warn("[Enricher] Website enrichment failed:", e);
    }
  }

  // Step 2: LinkedIn search (if owner name still unknown)
  if (!ownerName) {
    try {
      const liResult = await searchLinkedInOwner(rawBusiness.name, rawBusiness.address);
      if (liResult.ownerName) { ownerName = liResult.ownerName; enrichmentSource.push("linkedin:search"); }
      if (liResult.linkedInUrl) { ownerLinkedIn = liResult.linkedInUrl; }
    } catch (e) {
      console.warn("[Enricher] LinkedIn search failed:", e);
    }
  }

  // Step 3: Gemini intelligence generation
  const intelligence = await generateProspectIntelligence({
    businessName: rawBusiness.name,
    category: rawBusiness.category,
    address: rawBusiness.address,
    phone: rawBusiness.phone,
    websiteUrl: rawBusiness.websiteUrl,
    discoveredWebsiteUrl,
    websiteSearchStatus: websiteSearch.status,
    rating: rawBusiness.rating,
    reviewCount: rawBusiness.reviewCount,
    photoCount: rawBusiness.photoCount,
    hasHours: rawBusiness.hasHours,
    hasDescription: rawBusiness.hasDescription ?? false,
    likelyUnclaimed: rawBusiness.likelyUnclaimed ?? false,
    reasons: rawBusiness.reasons ?? [],
    recentEvidence: rawBusiness.recentEvidence ?? [],
    ownerName,
    ownerEmail
  });

  return {
    ownerName,
    ownerEmail,
    ownerLinkedIn,
    discoveredWebsiteUrl,
    websiteSearchStatus: websiteSearch.status,
    websiteSearchEvidence: websiteSearch.evidence,
    enrichmentSource,
    ...intelligence
  };
}
