import dotenv from "dotenv";
import { getGeminiClient, llmConfig, safeParseJSON, generateUnifiedLLM } from "./llm";
import { DB_FILE, ALERTS_FILE, saveOpportunities, safeReadFile, safeWriteFile, loadOpportunities } from "./db";

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
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i");
  const match = regex.exec(xml);
  if (match) return match[1].trim();
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

    const subs = sectorSubreddits[sector] || ["smallbusiness", "sweatystartup"];
    const allHits: any[] = [];
    const queries = semanticQueries && semanticQueries.length > 0
      ? semanticQueries
      : (keyword ? [keyword] : ["manual", "tedious", "spreadsheet", "workflow", "anyone else", "is there a way", "need help"]);

    const targetSubs = subs.slice(0, 2);
    const targetQueries = queries.slice(0, 2);
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 (OpportunityRadar/1.0 by /u/katycat1313)",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9"
    };

    let directSuccess = false;

    for (const sub of targetSubs) {
      for (const q of targetQueries) {
        if (budget && budget.remaining <= 0) break;
        const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&limit=8`;
        console.log(`Crawling Reddit r/${sub} for query: "${q}" (via Slingshot proxy/direct)...`);

        let response: Response;
        try {
          response = await fetchWithSlingshot(url, { headers }, budget);
        } catch {
          continue;
        }

        if (!response.ok && budget?.remaining !== 0) {
          const fallbackUrl = `https://www.reddit.com/r/${sub}/new.json?limit=8`;
          try {
            response = await fetchWithSlingshot(fallbackUrl, { headers }, budget);
          } catch {
            continue;
          }
        }

        if (response.ok) {
          directSuccess = true;
          const data: any = await response.json();
          const children = data?.data?.children || [];
          for (const child of children) {
            const post = child.data;
            if (post && post.selftext && post.selftext.length > 50) {
              allHits.push({
                id: `reddit-${post.id}`,
                author: post.author || "Reddit_User",
                sourcePlatform: `Reddit (r/${post.subreddit})`,
                sourceUrl: `https://www.reddit.com${post.permalink}`,
                text: `${post.title}\n\n${post.selftext}`.substring(0, 1500),
                title: post.title || "Discussion on Reddit"
              });
            }
          }
        }
      }
    }

    if (!directSuccess || allHits.length === 0) {
      console.log(`[Reddit Scraper] Direct JSON failed. Falling back to Google News RSS...`);
      for (const sub of targetSubs) {
        for (const q of targetQueries) {
          if (budget && budget.remaining <= 0) break;
          const rssQuery = `site:reddit.com/r/${sub} "${q}"`;
          const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(rssQuery)}&hl=en-US&gl=US&ceid=US:en`;
          try {
            const rssHits = await scrapeRSSFeed(feedUrl, `Reddit (r/${sub})`, budget);
            allHits.push(...rssHits);
          } catch (rssErr: any) {
            console.error(`[Reddit RSS Fallback] Error crawling RSS:`, rssErr.message || rssErr);
          }
        }
      }
    }

    scraperCache[cacheKey] = { timestamp: Date.now(), data: allHits };
    return allHits;
  } catch (error) {
    console.log("Error scraping Reddit public JSON:", error);
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
    ? semanticQueries
    : (keyword ? [keyword] : ["manual", "tedious", "spreadsheet", "workflow", "frustrated"]);

  try {
    let cleanDomain = domain.replace(/https?:\/\//i, "").split("/")[0];
    if (!cleanDomain) return [];

    for (const q of queries.slice(0, 2)) {
      if (budget && budget.remaining <= 0) break;
      const url = `https://${cleanDomain}/search.json?q=${encodeURIComponent(q)}`;
      console.log(`[Discourse] Searching ${cleanDomain} for query: "${q}"...`);
      let response: Response;
      try {
        response = await fetchWithSlingshot(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
          }
        }, budget);
      } catch {
        continue;
      }

      if (response.ok) {
        const data: any = await response.json();
        const posts = data?.posts || [];
        const topics = data?.topics || [];
        const topicMap = new Map();
        for (const t of topics) topicMap.set(t.id, t);

        for (const post of posts) {
          const text = post.blurb || post.cooked || "";
          if (text.length > 30) {
            const topic = topicMap.get(post.topic_id) || {};
            results.push({
              id: `discourse-${cleanDomain}-${post.id}`,
              author: post.username || "Discourse_User",
              sourcePlatform: `Discourse (${cleanDomain})`,
              sourceUrl: `https://${cleanDomain}/t/${topic.slug || "topic"}/${post.topic_id}`,
              text: `${topic.title || "Discussion"}\n\n${text}`.substring(0, 1500),
              title: topic.title || "Discussion"
            });
          }
        }
      }
    }

    if (results.length === 0 && consumeSubrequestBudget(budget, `Discourse latest.json -> ${cleanDomain}`)) {
      const url = `https://${cleanDomain}/latest.json`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
      });
      if (response.ok) {
        const data: any = await response.json();
        const topics = data?.topic_list?.topics || [];
        for (const topic of topics) {
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
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "application/rss+xml, application/atom+xml, text/xml, application/xml, */*"
        }
      }, budget);
    } catch {
      return [];
    }

    if (!response.ok) return [];
    const xml = await response.text();
    const items: any[] = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
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
      while ((match = entryRegex.exec(xml)) !== null) {
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
        waitFor: 3000
      })
    });

    if (!res.ok) return [];
    const data: any = await res.json();
    const markdown = data?.data?.markdown || "";
    if (!markdown || markdown.trim().length < 50) return [];

    const results = [{
      id: `fc-${Buffer.from(targetUrl).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}-${Date.now()}`,
      by: "BusinessOperator",
      text: markdown.substring(0, 8000),
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
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=25`;
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
        return messages.map((msg: any) => ({
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

// Bot sweep orchestrator
export async function executeBotFleetSweep(config: any): Promise<{ logs: string[], foundOpps: any[] }> {
  const logs: string[] = [];
  const foundOpps: any[] = [];
  const activeOpps = loadOpportunities();

  currentCrawlStatus.active = true;
  currentCrawlStatus.status = "crawling";
  currentCrawlStatus.startedAt = new Date().toISOString();
  currentCrawlStatus.progress = "Initializing crawler fleet...";
  currentCrawlStatus.logs = logs;
  currentCrawlStatus.foundOppsCount = 0;
  currentCrawlStatus.error = undefined;

  logs.push(`[${new Date().toISOString()}] 🚀 Initiating Active Bot Fleet Scan Cycle...`);

  try {
    for (const plat of config.platforms) {
      if (!plat.isEnabled) {
        logs.push(`[${plat.platformName}] 🚫 Platform integration disabled. Skipping.`);
        continue;
      }

      currentCrawlStatus.progress = `Scanning ${plat.platformName}...`;
      logs.push(`[${plat.platformName}] 🔍 Initializing ${plat.platformName} Bot. Strategy: ${plat.strategy.toUpperCase()}.`);

      if (plat.platformId === "discord") {
        const activeTargets = plat.targets.filter((t: any) => t.isEnabled);
        if (!plat.botToken) {
          logs.push(`[${plat.platformName}] 💡 Discord Bot Token missing. Skipping live Discord fetch.`);
        } else {
          let scrapedMsgs: any[] = [];
          for (const target of activeTargets) {
            try {
              const results = await scrapeDiscordMessages(plat.botToken, target.urlOrPath);
              scrapedMsgs.push(...results);
            } catch (e) {
              logs.push(`[${plat.platformName}] ⚠️ Discord crawl for "${target.name}" failed: ${e}`);
            }
          }

          if (scrapedMsgs.length > 0) {
            try {
              const ai = getGeminiClient();
              const prompt = `
                Analyze these real Discord messages. Extract at most 1 highly actionable, genuine software-addressable business workflow or software pain point classified as "help_seeker".
                CRITICAL REJECTION RULE: Reject promotional pitches ("solution_sharer" or "noise").
                Messages: ${JSON.stringify(scrapedMsgs)}
                Format as JSON:
                [{
                  "title": "Problem title (under 80 chars)",
                  "author": "Real username",
                  "sourcePlatform": "Discord",
                  "sourceUrl": "Real URL",
                  "classification": "help_seeker",
                  "problemSummary": "1-2 sentence summary of manual struggle",
                  "whoIsExperiencing": "Who is experiencing this?",
                  "industry": "Industry sector",
                  "evidence": "Quote of frustration",
                  "painLevel": "High" or "Medium" or "Low",
                  "painLevelExplanation": "Concrete explanation of cost",
                  "frequency": "Frequency",
                  "currentSolutions": "Current manual solutions",
                  "possibleSolution": "Software solution",
                  "mvpIdea": "2-week MVP idea",
                  "difficulty": "Easy" or "Medium" or "Hard",
                  "difficultyExplanation": "Difficulty details",
                  "willingnessToPay": "WTP estimation",
                  "opportunityScore": 85,
                  "responseDraft": "Personalized outreach",
                  "suggestedQuestions": ["Q1"],
                  "valueAdditionIdeas": ["Idea 1"]
                }]
              `;
              const responseText = await generateUnifiedLLM({
                prompt: prompt,
                responseJson: true
              });
              const parsed = safeParseJSON(responseText || "[]");
              if (Array.isArray(parsed) && parsed.length > 0) {
                for (const opp of parsed) {
                  opp.id = `discovered-discord-${Date.now()}`;
                  opp.discoveredAt = new Date().toISOString();
                  opp.status = "New";
                  opp.notes = "Automatically discovered by live Discord crawler.";
                  foundOpps.push(opp);
                  logs.push(`[${plat.platformName}] ⭐ Found real high-pain Discord signal: "${opp.title}"`);
                }
              }
            } catch (err) {
              logs.push(`[${plat.platformName}] ⚠️ Failed to extract Discord pain points: ${err}`);
            }
          }
        }
      } else if (plat.platformId === "reddit") {
        const activeTargets = plat.targets.filter((t: any) => t.isEnabled);
        let scrapedComments: any[] = [];
        for (const target of activeTargets) {
          try {
            const results = await scrapeRedditPublicJSON("pain OR manual OR tedious OR \"anyone else\" OR " + target.urlOrPath, target.name);
            scrapedComments.push(...results);
          } catch (e: any) {
            logs.push(`[${plat.platformName}] ⚠️ Direct crawl of r/${target.urlOrPath} failed: ${e.message || e}`);
          }
        }

        if (scrapedComments.length > 0) {
          try {
            const ai = getGeminiClient();
            const prompt = `
              Analyze these real Reddit posts. Extract at most 1 highly actionable, genuine software-addressable workflow pain point classified as a "help_seeker".
              CRITICAL REJECTION RULE: Reject "solution_sharer" or "noise".
              Posts: ${JSON.stringify(scrapedComments.slice(0, 10))}
              Format as JSON matching this structure:
              [{
                "title": "Problem title (under 80 chars)",
                "author": "Real username",
                "sourcePlatform": "Reddit (r/subreddit)",
                "sourceUrl": "Real URL",
                "classification": "help_seeker",
                "problemSummary": "1-2 sentence summary of manual struggle",
                "whoIsExperiencing": "Who is experiencing this?",
                "industry": "Industry sector",
                "evidence": "Quote of frustration",
                "painLevel": "High" or "Medium" or "Low",
                "painLevelExplanation": "Concrete explanation of cost",
                "frequency": "Frequency",
                "currentSolutions": "Current manual solutions",
                "possibleSolution": "Software solution",
                "mvpIdea": "2-week MVP idea",
                "difficulty": "Easy" or "Medium" or "Hard",
                "difficultyExplanation": "Difficulty details",
                "willingnessToPay": "WTP estimation",
                "opportunityScore": 85,
                "responseDraft": "Personalized outreach",
                "suggestedQuestions": ["Q1"],
                "valueAdditionIdeas": ["Idea 1"]
              }]
            `;
            const responseText = await generateUnifiedLLM({
              prompt: prompt,
              responseJson: true
            });
            const extracted = safeParseJSON(responseText || "[]");
            if (Array.isArray(extracted) && extracted.length > 0) {
              for (const opp of extracted) {
                if (opp.sourceUrl && opp.sourceUrl.includes("reddit.com")) {
                  opp.id = `discovered-reddit-${Date.now()}`;
                  opp.timestamp = new Date().toISOString();
                  opp.status = "New";
                  opp.notes = "Automatically discovered by targeted subreddit scanner.";
                  foundOpps.push(opp);
                  logs.push(`[${plat.platformName}] ⭐ Found real high-pain signal from ${opp.author}: "${opp.title}"`);
                }
              }
            }
          } catch (err) {
            logs.push(`[${plat.platformName}] ⚠️ Failed to extract Reddit pain points: ${err}`);
          }
        }
      } else if (plat.platformId === "discourse" || plat.platformId === "bizwarriors") {
        const activeTargets = plat.targets.filter((t: any) => t.isEnabled);
        let scrapedDiscourseMsgs: any[] = [];
        for (const target of activeTargets) {
          try {
            const results = await scrapeDiscourse(target.urlOrPath, "", target.name);
            scrapedDiscourseMsgs.push(...results);
          } catch (e: any) {
            logs.push(`[${plat.platformName}] ⚠️ Direct crawl of ${target.urlOrPath} failed: ${e.message}`);
          }
        }

        if (scrapedDiscourseMsgs.length > 0) {
          try {
            const ai = getGeminiClient();
            const prompt = `
              Analyze these real forum posts. Extract at most 1 highly actionable software-addressable business pain point.
              Posts: ${JSON.stringify(scrapedDiscourseMsgs.slice(0, 10))}
              Format as JSON matching this structure:
              [{
                "title": "Problem title",
                "author": "Real username",
                "sourcePlatform": "Forum",
                "sourceUrl": "Real URL",
                "classification": "help_seeker",
                "problemSummary": "Summary of manual struggle",
                "whoIsExperiencing": "Who is experiencing this?",
                "industry": "Industry sector",
                "evidence": "Quote of frustration",
                "painLevel": "High" or "Medium" or "Low",
                "painLevelExplanation": "Explanation",
                "frequency": "Frequency",
                "currentSolutions": "Manual solutions",
                "possibleSolution": "Software solution",
                "mvpIdea": "MVP idea",
                "difficulty": "Easy" or "Medium" or "Hard",
                "difficultyExplanation": "Details",
                "willingnessToPay": "WTP estimation",
                "opportunityScore": 85,
                "responseDraft": "Personalized outreach",
                "suggestedQuestions": ["Q1"],
                "valueAdditionIdeas": ["Idea 1"]
              }]
            `;
            const responseText = await generateUnifiedLLM({
              prompt: prompt,
              responseJson: true
            });
            const extracted = safeParseJSON(responseText || "[]");
            if (Array.isArray(extracted) && extracted.length > 0) {
              for (const opp of extracted) {
                opp.id = `discovered-forum-${Date.now()}`;
                opp.timestamp = new Date().toISOString();
                opp.status = "New";
                opp.notes = "Automatically discovered by targeted forum scanner.";
                foundOpps.push(opp);
                logs.push(`[${plat.platformName}] ⭐ Found real high-pain signal: "${opp.title}"`);
              }
            }
          } catch (err) {
            logs.push(`[${plat.platformName}] ⚠️ Failed to extract forum pain points: ${err}`);
          }
        }
      }
    }

    currentCrawlStatus.status = "generating";
    currentCrawlStatus.progress = "Filtering and saving new opportunities...";

    if (foundOpps.length > 0) {
      const mergedOpps = [...activeOpps, ...foundOpps];
      saveOpportunities(mergedOpps);
      logs.push(`[SYSTEM] Syncing database. Saved ${foundOpps.length} new opportunities.`);
    } else {
      logs.push(`[SYSTEM] Fleet cycle completed. No new opportunities found.`);
    }

    currentCrawlStatus.active = false;
    currentCrawlStatus.status = "completed";
    currentCrawlStatus.progress = `Crawl complete. Discovered ${foundOpps.length} cards.`;
    currentCrawlStatus.foundOppsCount = foundOpps.length;

  } catch (error: any) {
    logs.push(`[SYSTEM-ERR] Sweep execution failed: ${error.message}`);
    currentCrawlStatus.active = false;
    currentCrawlStatus.status = "failed";
    currentCrawlStatus.progress = "Crawl failed.";
    currentCrawlStatus.error = error.message;
  }

  return { logs, foundOpps };
}
