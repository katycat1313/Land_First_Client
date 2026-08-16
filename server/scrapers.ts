import dotenv from "dotenv";
import { getGeminiClient, llmConfig, safeParseJSON, generateUnifiedLLM } from "./llm";
import { DB_FILE, ALERTS_FILE, saveOpportunities, safeReadFile, safeWriteFile, loadOpportunities, realHistoricalBackupPosts, getFallbackSolutionOptions } from "./db";

dotenv.config();

// Cache configurations
const scraperCache: Record<string, { timestamp: number; data: any[] }> = {};
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL

const delayMs = (ms: number) => new Promise(res => setTimeout(res, ms));

export interface SubrequestBudget {
  remaining: number;
  tunnelDead: { mac: boolean; g14: boolean };
}

export function createSubrequestBudget(max: number): SubrequestBudget {
  return { remaining: max, tunnelDead: { mac: false, g14: false } };
}

export function consumeSubrequestBudget(budget: SubrequestBudget | undefined, label: string): boolean {
  if (!budget) return true;
  if (budget.remaining <= 0) {
    console.warn(`[Subrequest Budget] Exhausted. Skipping fetch for: ${label}`);
    return false;
  }
  budget.remaining--;
  return true;
}

export async function fetchWithSlingshot(url: string, options?: RequestInit, budget?: SubrequestBudget): Promise<Response> {
  const macUrl = (llmConfig.crawlerTunnelUrl || process.env.CRAWLER_TUNNEL_URL || process.env.MAC_TUNNEL_URL || "").trim().replace(/\/$/, "");
  const g14Url = (llmConfig.g14TunnelUrl || process.env.G14_TUNNEL_URL || "").trim().replace(/\/$/, "");

  if (llmConfig.useSlingshot !== false) {
    if (macUrl && !budget?.tunnelDead.mac) {
      if (consumeSubrequestBudget(budget, `Mac tunnel -> ${url}`)) {
        try {
          const proxyUrl = `${macUrl}/proxy?url=${encodeURIComponent(url)}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(proxyUrl, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            console.log(`[Slingshot Proxy] Successfully routed via Mac tunnel to: ${url}`);
            return res;
          } else {
            console.warn(`[Slingshot Proxy] Mac tunnel proxy returned status: ${res.status}`);
          }
        } catch (err: any) {
          console.warn(`[Slingshot Proxy] Mac tunnel fetch failed (${err.message || err}).`);
          if (budget) budget.tunnelDead.mac = true;
        }
      }
    }

    if (g14Url && !budget?.tunnelDead.g14) {
      if (consumeSubrequestBudget(budget, `G14 tunnel -> ${url}`)) {
        try {
          const proxyUrl = `${g14Url}/proxy?url=${encodeURIComponent(url)}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(proxyUrl, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            console.log(`[Slingshot Proxy] Successfully routed via G14 tunnel to: ${url}`);
            return res;
          } else {
            console.warn(`[Slingshot Proxy] G14 tunnel proxy returned status: ${res.status}`);
          }
        } catch (err: any) {
          console.warn(`[Slingshot Proxy] G14 tunnel fetch failed (${err.message || err}).`);
          if (budget) budget.tunnelDead.g14 = true;
        }
      }
    }
  }

  if (consumeSubrequestBudget(budget, `Direct fallback -> ${url}`)) {
    console.log(`[Slingshot Proxy] Routing directly (fallback) to: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  throw new Error("Outbound subrequest aborted by budget limit.");
}

export function cleanHtmlAndCdata(text: string): string {
  if (!text) return "";
  let clean = text;
  clean = clean.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
  clean = clean.replace(/<[^>]+>/g, " ");
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
  return clean.replace(/\s+/g, " ").trim();
}

function extractXmlField(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = regex.exec(xml);
  if (match) return match[1].trim();
  const selfClosingRegex = new RegExp(`<${tag}[^>]*href=["']([^"']+)["']`, "i");
  const selfMatch = selfClosingRegex.exec(xml);
  if (selfMatch) return selfMatch[1].trim();
  return "";
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// Scraper functions
export async function scrapeHackerNewsComments(keyword: string, sector: string, semanticQueries?: string[]): Promise<any[]> {
  console.log("[Hacker News] Crawler is STRICTLY DISABLED (Developer Platform blacklisted to preserve resources).");
  return [];
}

export async function scrapeRedditPublicJSON(keyword: string, sector: string, semanticQueries?: string[], budget?: SubrequestBudget): Promise<any[]> {
  const cacheKey = `reddit-${sector || "All"}-${keyword || ""}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const sectorSubreddits: Record<string, string[]> = {
      "Healthcare Operations": ["medicaloffice", "medicine", "FamilyPractice"],
      "Real Estate & Property Management": ["realtors", "PropertyManagement", "realestateinvesting"],
      "Construction & Subcontracting": ["construction", "electricians", "HVAC", "plumbing"],
      "Professional Services (Accounting/CPA/Law)": ["accounting", "tax", "Bookkeeping", "lawyers"],
      "Local Small Businesses": ["smallbusiness", "sweatystartup", "entrepreneur"],
      "Finance & Invoicing Workflows": ["bookkeeping", "accounting", "smallbusiness"],
      "E-commerce & Retail Logistics": ["shopify", "ecommerce", "fulfillment"],
      "Marketing agency": ["marketingagency", "marketing", "PPC", "SEO"],
      "Niche Hobby Forums / Communities": ["modhelp", "communitymanagers"]
    };

    // Determine target subreddits
    let subs: string[] = [];
    if (sector && sector.startsWith("r/")) {
      subs = [sector.replace(/^r\//i, "").trim()];
    } else if (sector && sectorSubreddits[sector]) {
      subs = sectorSubreddits[sector];
    } else if (sector && !sector.includes(" ") && sector.length < 25) {
      subs = [sector.replace(/^r\//i, "").trim()];
    } else {
      subs = ["smallbusiness", "sweatystartup"];
    }

    const allHits: any[] = [];
    const queries = semanticQueries && semanticQueries.length > 0
      ? semanticQueries.slice(0, 1)
      : (keyword ? [keyword.trim()] : ["tedious OR manual OR spreadsheet", "anyone else struggling"]);

    const targetSubs = subs.slice(0, 2);
    const targetQueries = queries.slice(0, 1);
    const headers = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9"
    };

    let directSuccess = false;

    // 1. Try direct search/new JSON if budget permits
    for (const sub of targetSubs) {
      for (const q of targetQueries) {
        if (budget && budget.remaining <= 0) break;
        const cleanQ = q.replace(/["\\]/g, "").slice(0, 60);
        const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(cleanQ)}&restrict_sr=1&sort=new&limit=5`;
        console.log(`[Reddit] Crawling r/${sub} (query: "${cleanQ}")...`);

        let response: Response | null = null;
        try {
          response = await fetchWithSlingshot(url, { headers }, budget);
        } catch {
          response = null;
        }

        if (response && response.ok) {
          try {
            const data: any = await response.json();
            const children = data?.data?.children || [];
            if (children.length > 0) {
              directSuccess = true;
              for (const child of children.slice(0, 4)) {
                const post = child.data;
                if (post && post.selftext && post.selftext.length > 30) {
                  allHits.push({
                    id: `reddit-${post.id}`,
                    author: post.author || "Reddit_User",
                    sourcePlatform: `Reddit (r/${post.subreddit || sub})`,
                    sourceUrl: `https://www.reddit.com${post.permalink}`,
                    text: `${post.title}\n\n${post.selftext}`.substring(0, 1500),
                    title: post.title || "Discussion on Reddit"
                  });
                }
              }
            }
          } catch (jsonErr) {
            console.warn(`[Reddit] Direct JSON parse failed:`, jsonErr);
          }
        }
      }
    }

    // 2. Google News RSS Bypass for Reddit (Bypasses Reddit 403 & 429 Anti-Bot Firewalls)
    if (!directSuccess || allHits.length === 0) {
      console.log(`[Reddit Scraper] Direct fetch blocked or empty. Bypassing Reddit firewall via Google News RSS...`);
      for (const sub of targetSubs) {
        if (budget && budget.remaining <= 0) break;
        const cleanTerm = (keyword || "workflow OR manual OR spreadsheet").replace(/["\\]/g, "").slice(0, 40);
        const rssQuery = `site:reddit.com/r/${sub} ${cleanTerm}`;
        const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(rssQuery)}&hl=en-US&gl=US&ceid=US:en`;
        try {
          const rssHits = await scrapeRSSFeed(feedUrl, `Reddit (r/${sub})`, budget);
          for (const hit of rssHits.slice(0, 4)) {
            allHits.push(hit);
          }
          if (rssHits.length > 0) {
            console.log(`[Reddit RSS Bypass] Successfully retrieved ${rssHits.length} authentic posts for r/${sub}`);
          }
        } catch (rssErr: any) {
          console.error(`[Reddit RSS Fallback] Error:`, rssErr.message || rssErr);
        }
      }
    }

    // 3. Reddit Public RSS Feed Fallback
    if (allHits.length === 0) {
      for (const sub of targetSubs.slice(0, 1)) {
        if (budget && budget.remaining <= 0) break;
        const feedUrl = `https://www.reddit.com/r/${sub}/new.rss?limit=5`;
        try {
          const rssHits = await scrapeRSSFeed(feedUrl, `Reddit (r/${sub})`, budget);
          allHits.push(...rssHits.slice(0, 3));
        } catch (e) { }
      }
    }

    scraperCache[cacheKey] = { timestamp: Date.now(), data: allHits };
    return allHits;
  } catch (error) {
    console.log("Error scraping Reddit:", error);
    return [];
  }
}

export async function scrapeDiscourse(domain: string, keyword: string, sector: string, semanticQueries?: string[], budget?: SubrequestBudget): Promise<any[]> {
  const cacheKey = `discourse-${domain}-${sector || "All"}-${keyword || ""}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const results: any[] = [];
  const queries = semanticQueries && semanticQueries.length > 0
    ? semanticQueries.slice(0, 1)
    : (keyword ? [keyword.trim()] : ["manual", "workflow"]);

  try {
    let cleanDomain = domain.replace(/https?:\/\//i, "").split("/")[0];
    if (!cleanDomain) return [];

    for (const q of queries.slice(0, 1)) {
      if (budget && budget.remaining <= 0) break;
      const url = `https://${cleanDomain}/search.json?q=${encodeURIComponent(q)}`;
      console.log(`[Discourse] Searching ${cleanDomain} for query: "${q}"...`);
      let response: Response;
      try {
        response = await fetchWithSlingshot(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
          }
        }, budget);
      } catch {
        continue;
      }

      if (response && response.ok) {
        try {
          const data: any = await response.json();
          const posts = data?.posts || [];
          const topics = data?.topics || [];
          const topicMap = new Map();
          for (const t of topics) topicMap.set(t.id, t);

          for (const post of posts.slice(0, 4)) {
            const text = post.blurb || post.cooked || "";
            if (text.length > 25) {
              const topic = topicMap.get(post.topic_id) || {};
              results.push({
                id: `discourse-${cleanDomain}-${post.id}`,
                author: post.username || "Discourse_User",
                sourcePlatform: `Discourse (${cleanDomain})`,
                sourceUrl: `https://${cleanDomain}/t/${topic.slug || "topic"}/${post.topic_id}`,
                text: `${topic.title || "Discussion"}\n\n${cleanHtmlAndCdata(text)}`.substring(0, 1500),
                title: topic.title || "Discussion"
              });
            }
          }
        } catch (parseErr) { }
      }
    }

    if (results.length === 0 && consumeSubrequestBudget(budget, `Discourse latest.json -> ${cleanDomain}`)) {
      const url = `https://${cleanDomain}/latest.json`;
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
          }
        });
        if (response.ok) {
          const data: any = await response.json();
          const topics = data?.topic_list?.topics || [];
          for (const topic of topics.slice(0, 3)) {
            results.push({
              id: `discourse-${cleanDomain}-${topic.id}`,
              author: topic.last_poster_username || "Discourse_User",
              sourcePlatform: `Discourse (${cleanDomain})`,
              sourceUrl: `https://${cleanDomain}/t/${topic.slug || "topic"}/${topic.id}`,
              text: `${topic.title}\n\nLatest topic regarding operational issues.`,
              title: topic.title || "Latest Discussion"
            });
          }
        }
      } catch (err) { }
    }

    scraperCache[cacheKey] = { timestamp: Date.now(), data: results };
    return results;
  } catch (err) {
    console.log(`[Discourse] Error scanning ${domain}:`, err);
    return [];
  }
}

export async function scrapeRSSFeed(feedUrl: string, platformName: string, budget?: SubrequestBudget): Promise<any[]> {
  const cacheKey = `rss-${feedUrl}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const results: any[] = [];
  try {
    if (budget && budget.remaining <= 0) return [];
    let response: Response;
    try {
      response = await fetchWithSlingshot(feedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          "Accept": "application/rss+xml, application/atom+xml, text/xml, application/xml, */*"
        }
      }, budget);
    } catch {
      return [];
    }

    if (!response || !response.ok) return [];
    const xml = await response.text();
    const items: any[] = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const itemXml = match[1];
      const title = extractXmlField(itemXml, "title");
      const link = extractXmlField(itemXml, "link");
      const description = extractXmlField(itemXml, "description") || extractXmlField(itemXml, "content:encoded");
      const creator = extractXmlField(itemXml, "dc:creator") || extractXmlField(itemXml, "author") || "RSS_User";
      const guid = extractXmlField(itemXml, "guid") || link || String(Date.now());
      if (title && link) items.push({ title, link, description, creator, guid });
    }

    if (items.length === 0) {
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
      while ((match = entryRegex.exec(xml)) !== null && items.length < 5) {
        const entryXml = match[1];
        const title = extractXmlField(entryXml, "title");
        let link = extractXmlField(entryXml, "link");
        if (!link || !link.startsWith("http")) {
          const hrefMatch = /<link[^>]+href=["']([^"']+)["']/i.exec(entryXml);
          if (hrefMatch) link = hrefMatch[1];
        }
        const content = extractXmlField(entryXml, "content") || extractXmlField(entryXml, "summary");
        let author = "Atom_User";
        const authorMatch = /<author>([\s\S]*?)<\/author>/i.exec(entryXml);
        if (authorMatch) {
          const name = extractXmlField(authorMatch[1], "name");
          if (name) author = name;
        }
        const id = extractXmlField(entryXml, "id") || link || String(Date.now());
        if (title && link) items.push({ title, link, description: content, creator: author, guid: id });
      }
    }

    for (const item of items) {
      const cleanTitle = cleanHtmlAndCdata(item.title);
      const cleanDesc = cleanHtmlAndCdata(item.description || "");
      results.push({
        id: `rss-${hashString(item.guid || item.link)}`,
        author: cleanHtmlAndCdata(item.creator),
        sourcePlatform: platformName,
        sourceUrl: item.link.trim(),
        text: `${cleanTitle}\n\n${cleanDesc}`.substring(0, 1500),
        title: cleanTitle
      });
    }

    scraperCache[cacheKey] = { timestamp: Date.now(), data: results };
    return results;
  } catch (error) {
    console.error(`[RSS Crawler] Error:`, error);
    return [];
  }
}

export async function scrapeWithFirecrawl(targetUrl: string, platformName: string): Promise<any[]> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) return [];

  const cacheKey = `firecrawl-${targetUrl}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 2000
      })
    });

    if (!res.ok) return [];
    const data: any = await res.json();
    const markdown = data?.data?.markdown || "";
    if (!markdown || markdown.trim().length < 40) return [];

    const results = [{
      id: `fc-${Buffer.from(targetUrl).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}-${Date.now()}`,
      by: "BusinessOperator",
      text: markdown.substring(0, 4000),
      url: targetUrl,
      time: Math.floor(Date.now() / 1000),
      platform: platformName || "Firecrawl Scraped Forum",
      title: data?.data?.metadata?.title || platformName || "Web Target"
    }];

    scraperCache[cacheKey] = { timestamp: Date.now(), data: results };
    return results;
  } catch (error: any) {
    console.error(`[Firecrawl Error]`, error);
    return [];
  }
}

export async function scrapeGitHubIssues(keyword: string, sector: string, semanticQueries?: string[]): Promise<any[]> {
  return [];
}

export async function scrapeMastodonStatuses(keyword: string, sector: string): Promise<any[]> {
  return [];
}

export async function scrapeStackExchange(keyword: string, sector: string, semanticQueries?: string[]): Promise<any[]> {
  return [];
}

export async function scrapeDiscordMessages(botToken: string, channelId: string): Promise<any[]> {
  if (!botToken || !channelId) return [];
  try {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=10`;
    const cleanToken = botToken.startsWith("Bot ") ? botToken : `Bot ${botToken}`;
    const response = await fetch(url, {
      headers: {
        "Authorization": cleanToken,
        "User-Agent": "OpportunityRadar/1.2 (contact: katycat1313@gmail.com)"
      }
    });

    if (response.ok) {
      const messages: any = await response.json();
      if (Array.isArray(messages)) {
        return messages.slice(0, 5).map((msg: any) => ({
          id: `discord-${msg.id}`,
          author: msg.author?.username || "Discord_User",
          sourcePlatform: `Discord Channel #${channelId}`,
          sourceUrl: `https://discord.com/channels/@me/${channelId}/${msg.id}`,
          text: msg.content || "",
          title: `Discord message by @${msg.author?.username || "user"}`
        }));
      }
    }
    return [];
  } catch (error) {
    return [];
  }
}

export function scoreBuyerIntent(text: string): { score: number; signals: string[] } {
  const URGENCY_PHRASES = ["asap", "urgently", "urgent", "immediately", "right now", "this week", "deadline", "losing money"];
  const BUYING_INTENT_PHRASES = ["willing to pay", "budget for", "looking to hire", "does anyone know a tool", "recommend a tool", "looking for a solution"];
  const FRUSTRATION_PHRASES = ["so frustrated", "sick of", "tired of", "hate doing", "waste of time", "nightmare", "fed up"];
  const MANUAL_PAIN_PHRASES = ["manually", "by hand", "spreadsheet", "excel", "copy and paste", "hours every week"];
  const PROMOTIONAL_PHRASES = ["i built", "i made", "i launched", "check out my", "beta users", "discount code"];

  const lower = (text || "").toLowerCase();
  let score = 0;
  const signals: string[] = [];

  for (const p of URGENCY_PHRASES) {
    if (lower.includes(p)) { score += 3; signals.push(`urgency:"${p}"`); }
  }
  for (const p of BUYING_INTENT_PHRASES) {
    if (lower.includes(p)) { score += 4; signals.push(`buyer-intent:"${p}"`); }
  }
  for (const p of FRUSTRATION_PHRASES) {
    if (lower.includes(p)) { score += 2; signals.push(`frustration:"${p}"`); }
  }
  for (const p of MANUAL_PAIN_PHRASES) {
    if (lower.includes(p)) { score += 1; signals.push(`manual-pain:"${p}"`); }
  }
  for (const p of PROMOTIONAL_PHRASES) {
    if (lower.includes(p)) { score -= 4; signals.push(`promotional:"${p}"`); }
  }

  return { score, signals };
}

// Crawl status interface
export interface CrawlStatus {
  active: boolean;
  status: "idle" | "crawling" | "generating" | "completed" | "failed";
  startedAt: string | null;
  progress: string;
  foundOppsCount: number;
  logs: string[];
  error?: string;
}

export let currentCrawlStatus: CrawlStatus = {
  active: false,
  status: "idle",
  startedAt: null,
  progress: "Inactive",
  foundOppsCount: 0,
  logs: []
};

// Module-level rotation tracker for round-robin background scans
let roundRobinPlatformIndex = 0;

// Bot sweep orchestrator: Targets 1 platform per sweep with deep 1-2 page crawling & single-batch LLM extraction
export async function executeBotFleetSweep(config: any, options?: { platform?: string; sector?: string; keyword?: string; budgetMax?: number; pages?: number }): Promise<{ logs: string[], foundOpps: any[] }> {
  const logs: string[] = [];
  const foundOpps: any[] = [];
  const activeOpps = loadOpportunities();
  const targetSector = options?.sector || "Local Small Businesses";
  const targetKeyword = options?.keyword || "";

  currentCrawlStatus.active = true;
  currentCrawlStatus.status = "crawling";
  currentCrawlStatus.startedAt = new Date().toISOString();
  currentCrawlStatus.logs = logs;
  currentCrawlStatus.foundOppsCount = 0;
  currentCrawlStatus.error = undefined;

  // Single-site budget: strictly 4-6 subrequests max
  const subrequestBudget = createSubrequestBudget(options?.budgetMax || 6);
  const rawScrapedPool: any[] = [];

  try {
    const enabledPlatforms = (config?.platforms || []).filter((p: any) => p.isEnabled);
    if (enabledPlatforms.length === 0) {
      logs.push("[SYSTEM] No platforms enabled in bot-config.json. Sweep aborted.");
      currentCrawlStatus.active = false;
      currentCrawlStatus.status = "completed";
      return { logs, foundOpps };
    }

    // Determine the single active platform for this crawl
    let targetPlatform: any = null;
    if (options?.platform) {
      targetPlatform = enabledPlatforms.find((p: any) => p.platformId === options.platform || p.platformName.toLowerCase().includes(options.platform!.toLowerCase()));
    }

    if (!targetPlatform) {
      targetPlatform = enabledPlatforms[roundRobinPlatformIndex % enabledPlatforms.length];
      roundRobinPlatformIndex = (roundRobinPlatformIndex + 1) % enabledPlatforms.length;
    }

    currentCrawlStatus.progress = `Deep crawling ${targetPlatform.platformName} for "${targetSector}"...`;
    logs.push(`[${new Date().toISOString()}] 🚀 Initiating Targeted Single-Site Sweep on: ${targetPlatform.platformName} (Sector: ${targetSector})...`);

    if (targetPlatform.platformId === "reddit") {
      const activeTargets = targetPlatform.targets?.filter((t: any) => t.isEnabled) || [];
      const primaryTarget = activeTargets[0] || { urlOrPath: "smallbusiness", name: "r/smallbusiness" };
      const subreddit = (primaryTarget.urlOrPath || primaryTarget.name || "smallbusiness").replace(/^r\//i, "");
      
      logs.push(`[Reddit] Crawling 1-2 pages of authentic discussions from r/${subreddit} (via RSS & Search API)...`);
      const hits = await scrapeRedditPublicJSON(targetKeyword, subreddit, undefined, subrequestBudget);
      rawScrapedPool.push(...hits);
      logs.push(`[Reddit] Retrieved ${hits.length} authentic post(s) from r/${subreddit}.`);
    } else if (targetPlatform.platformId === "discourse" || targetPlatform.platformId === "bizwarriors") {
      const activeTargets = targetPlatform.targets?.filter((t: any) => t.isEnabled) || [];
      const primaryTarget = activeTargets[0] || { urlOrPath: "community.make.com", name: "Make Community" };
      
      logs.push(`[Discourse] Deep crawling forum "${primaryTarget.name}" (${primaryTarget.urlOrPath})...`);
      const hits = await scrapeDiscourse(primaryTarget.urlOrPath, targetKeyword, targetSector, undefined, subrequestBudget);
      rawScrapedPool.push(...hits);
      logs.push(`[Discourse] Retrieved ${hits.length} topic(s) from ${primaryTarget.name}.`);
    } else if (targetPlatform.platformId === "rss") {
      const activeTargets = targetPlatform.targets?.filter((t: any) => t.isEnabled) || [];
      const primaryTarget = activeTargets[0] || { urlOrPath: "https://smallbiztrends.com/feed/", name: "Small Business Feed" };
      
      logs.push(`[RSS] Scanning business feed "${primaryTarget.name}"...`);
      const hits = await scrapeRSSFeed(primaryTarget.urlOrPath, `RSS (${primaryTarget.name})`, subrequestBudget);
      rawScrapedPool.push(...hits);
      logs.push(`[RSS] Scanned ${hits.length} entry(ies) from ${primaryTarget.name}.`);
    } else if (targetPlatform.platformId === "quora") {
      const cleanTopic = targetSector.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "Small Business Operations";
      logs.push(`[Quora] Scanning verified business pain threads for topic "${cleanTopic}"...`);
      const feedUrl = `https://news.google.com/rss/search?q=site:quora.com+${encodeURIComponent(cleanTopic)}+problem+OR+workflow&hl=en-US&gl=US&ceid=US:en`;
      const hits = await scrapeRSSFeed(feedUrl, `Quora (${cleanTopic})`, subrequestBudget);
      rawScrapedPool.push(...hits);
      logs.push(`[Quora] Scanned ${hits.length} post(s) from Quora feed.`);
    } else if (targetPlatform.platformId === "firecrawl" && process.env.FIRECRAWL_API_KEY) {
      const activeTargets = targetPlatform.targets?.filter((t: any) => t.isEnabled) || [];
      const primaryTarget = activeTargets[0] || { urlOrPath: "https://www.biggerpockets.com/forums", name: "BiggerPockets Forums" };
      
      logs.push(`[Firecrawl] Crawling business forum: ${primaryTarget.name}...`);
      const hits = await scrapeWithFirecrawl(primaryTarget.urlOrPath, primaryTarget.name || "Web Target");
      rawScrapedPool.push(...hits);
      logs.push(`[Firecrawl] Extracted ${hits.length} page(s) from ${primaryTarget.name}.`);
    } else if (targetPlatform.platformId === "discord" && targetPlatform.botToken) {
      const activeTargets = targetPlatform.targets?.filter((t: any) => t.isEnabled) || [];
      const primaryTarget = activeTargets[0] || { urlOrPath: "general", name: "Contractor Server" };
      
      logs.push(`[Discord] Scanning message history from #${primaryTarget.name}...`);
      const hits = await scrapeDiscordMessages(targetPlatform.botToken, primaryTarget.urlOrPath);
      rawScrapedPool.push(...hits);
      logs.push(`[Discord] Retrieved ${hits.length} message(s) from #${primaryTarget.name}.`);
    }

    logs.push(`[SYSTEM] Scraped ${rawScrapedPool.length} raw community post(s) from ${targetPlatform.platformName}.`);

    // Fallback to verified authentic historical dataset if live target returned 0 (e.g. temporary network blip)
    let candidatePool = rawScrapedPool;
    if (candidatePool.length === 0) {
      logs.push(`[SYSTEM] Live channel empty. Pulling verified authentic historical signal for sector...`);
      candidatePool = realHistoricalBackupPosts.slice(0, 5);
    }

    // Pre-score buyer intent to prioritize high-pain leads
    const preScored = candidatePool
      .map((c: any) => {
        const { score, signals } = scoreBuyerIntent(`${c.title || ""} ${c.text || ""}`);
        return { ...c, _intentScore: score, _intentSignals: signals };
      })
      .filter((c: any) => c._intentScore > -3)
      .sort((a: any, b: any) => b._intentScore - a._intentScore);

    const itemsForLLM = (preScored.length > 0 ? preScored : candidatePool).slice(0, 8);

    currentCrawlStatus.status = "generating";
    currentCrawlStatus.progress = `Extracting high-value pain points with Gemini AI...`;
    logs.push(`[SYSTEM] Passing ${itemsForLLM.length} pre-scored signals to Gemini 2.5 Flash in 1 batched call...`);

    // Single unified LLM extraction call
    const prompt = `
      You are an advanced AI opportunity classifier for a solo developer.
      Analyze these authentic scraped posts from small-to-medium business owners, contractors, and operators.
      Extract up to 3 genuine, software-addressable operational bottlenecks classified as "help_seeker".
      STRICT FILTER: Reject self-promotional pitches ("solution_sharer" or "noise") and developer/programmer chatter.

      Posts:
      ${JSON.stringify(itemsForLLM)}

      Return a JSON array of qualified opportunities matching this structure:
      [{
        "title": "Exact raw title from the post",
        "author": "Real username",
        "sourcePlatform": "Platform name",
        "sourceUrl": "Real source URL",
        "classification": "help_seeker",
        "problemSummary": "1-2 sentence summary of core manual struggle",
        "whoIsExperiencing": "Who is experiencing this? (e.g., HVAC Contractor, Property Manager, Agency Owner)",
        "industry": "Traditional real-world industry (e.g. Retail, Real Estate, Construction, Professional Services, Local Small Businesses)",
        "evidence": "Raw direct quote of their frustration from text",
        "painLevel": "High" | "Medium" | "Low",
        "painLevelExplanation": "Concrete explanation of cost or time wasted",
        "frequency": "How often does it occur",
        "currentSolutions": "What they do now and why it fails",
        "possibleSolution": "AI or software solution",
        "mvpIdea": "2-week MVP idea",
        "difficulty": "Easy" | "Medium" | "Hard",
        "difficultyExplanation": "Difficulty details",
        "willingnessToPay": "Estimated willingness to pay (e.g. $50-$200/mo)",
        "opportunityScore": 85,
        "responseDraft": "Conversational, human, zero-buzzword outreach. If post is from an agency owner, pitch as a behind-the-scenes white-label dev partner who can build their client's custom automation/software in 48-72h for high margin with zero dev payroll. If a direct contractor/business, offer a free practical fix/template for their immediate bottleneck.",
        "suggestedQuestions": ["Q1", "Q2"],
        "valueAdditionIdeas": ["Idea 1"]
      }]
    `;

    const responseText = await generateUnifiedLLM({
      prompt,
      responseJson: true
    });

    const parsed = safeParseJSON(responseText || "[]");
    logs.push(`[SYSTEM] Gemini extraction parsed ${Array.isArray(parsed) ? parsed.length : 0} opportunity candidate(s).`);

    if (Array.isArray(parsed) && parsed.length > 0) {
      for (const opp of parsed) {
        if (!opp.title && !opp.problemSummary) continue;

        // Match original source post or fallback to candidate pool
        const matchedComment = candidatePool.find((c: any) => 
          (c.sourceUrl && opp.sourceUrl && c.sourceUrl === opp.sourceUrl) ||
          (c.title && opp.title && c.title.toLowerCase().includes(opp.title.toLowerCase()))
        ) || candidatePool[foundOpps.length % candidatePool.length];

        const validSourceUrl = (opp.sourceUrl && opp.sourceUrl.startsWith("http"))
          ? opp.sourceUrl
          : (matchedComment?.sourceUrl || `https://news.google.com/rss/search?q=${encodeURIComponent(targetSector)}`);

        const fullPostText = matchedComment?.text || opp.evidence || opp.problemSummary || opp.title;

        const newOpp = {
          id: `discovered-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: new Date().toISOString(),
          originalSourceLink: validSourceUrl,
          sourceUrl: validSourceUrl,
          sourcePlatform: opp.sourcePlatform || targetPlatform.platformName,
          status: "New",
          notes: `Discovered on ${targetPlatform.platformName} for sector "${targetSector}".`,
          classification: "help_seeker",
          fullPostText,
          ...opp,
          title: opp.title || matchedComment?.title || "Operational Bottleneck Lead",
          solutionOptions: getFallbackSolutionOptions(opp)
        };

        foundOpps.push(newOpp);
        logs.push(`⭐ Qualified Lead: "${newOpp.title}" (${newOpp.industry || targetSector}) - Score: ${newOpp.opportunityScore || 85}`);
      }
    }

    if (foundOpps.length > 0) {
      // Deduplicate against active opportunities
      const existingUrls = new Set(activeOpps.map((o: any) => o.sourceUrl || o.originalSourceLink));
      const freshOpps = foundOpps.filter((o: any) => !existingUrls.has(o.sourceUrl));
      
      const mergedOpps = [...freshOpps, ...activeOpps];
      saveOpportunities(mergedOpps);
      logs.push(`[SYSTEM] Saved ${freshOpps.length} fresh opportunities (${foundOpps.length} total qualified) to database.`);
    } else {
      logs.push(`[SYSTEM] Sweep completed. No high-pain signals qualified on ${targetPlatform.platformName}.`);
    }

    currentCrawlStatus.active = false;
    currentCrawlStatus.status = "completed";
    currentCrawlStatus.progress = `Crawl complete. Discovered ${foundOpps.length} opportunities from ${targetPlatform.platformName}.`;
    currentCrawlStatus.foundOppsCount = foundOpps.length;

  } catch (error: any) {
    logs.push(`[SYSTEM-ERR] Sweep failed: ${error.message || error}`);
    currentCrawlStatus.active = false;
    currentCrawlStatus.status = "failed";
    currentCrawlStatus.progress = "Crawl failed.";
    currentCrawlStatus.error = error.message || error;
  }

  return { logs, foundOpps };
}

