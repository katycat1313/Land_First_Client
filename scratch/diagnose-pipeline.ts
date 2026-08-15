import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

console.log("==========================================");
console.log("🔍 STARTING OPPORTUNITY RADAR DIAGNOSTIC TRACE");
console.log("==========================================\n");

// We'll keep track of status for the final summary table
const summary: Record<string, { status: "OK" | "FAIL" | "WARNING" | "SKIPPED"; details: string }> = {};

// ----------------------------------------
// STEP 1: INITIALIZE CONFIGURATION & CLIENTS
// ----------------------------------------
console.log("[STEP 1] Initializing Settings & API Clients...\n");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ ERROR: GEMINI_API_KEY is not defined in the environment!");
  summary["Gemini API Key"] = { status: "FAIL", details: "GEMINI_API_KEY is not defined in .env" };
} else {
  console.log("✅ GEMINI_API_KEY detected.");
  summary["Gemini API Key"] = { status: "OK", details: "Key present in environment" };
}

const firecrawlKey = process.env.FIRECRAWL_API_KEY;
if (firecrawlKey) {
  console.log(`✅ FIRECRAWL_API_KEY detected.`);
  summary["Firecrawl API Key"] = { status: "OK", details: "Key present in environment" };
} else {
  console.log("⚠️ WARNING: FIRECRAWL_API_KEY not configured. Firecrawl targets will be skipped.");
  summary["Firecrawl API Key"] = { status: "WARNING", details: "Not configured (Firecrawl targets skipped)" };
}

// Slingshot / Tunnel URLs
const macUrl = (process.env.CRAWLER_TUNNEL_URL || process.env.MAC_TUNNEL_URL || "").trim().replace(/\/$/, "");
const g14Url = (process.env.G14_TUNNEL_URL || "").trim().replace(/\/$/, "");
console.log(`🔗 Primary Mac Tunnel URL: "${macUrl || "Not Configured"}"`);
console.log(`🔗 Secondary G14 Tunnel URL: "${g14Url || "Not Configured"}"`);

const llmConfig = {
  baseUrl: process.env.OLLAMA_BASE_URL || "https://your-ollama-tunnel.trycloudflare.com",
  crawlerTunnelUrl: macUrl,
  g14TunnelUrl: g14Url,
  model: process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct-q4_k_m",
  provider: (process.env.LLM_PROVIDER || "auto") as "auto" | "ollama" | "gemini",
  useSlingshot: true
};

const getGeminiClient = () => {
  return new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
};

const ai = apiKey ? getGeminiClient() : null;
console.log("✅ Gemini AI client initialized.\n");

// ----------------------------------------
// LOCAL PORT 4000 & TUNNEL HEALTH CHECK
// ----------------------------------------
console.log("--- Checking Local Port 4000 & Tunnel Connection ---");

// Check port 4000
try {
  const localRes = await fetch("http://localhost:4000/health");
  if (localRes.ok) {
    const data: any = await localRes.json();
    console.log(`✅ Local G14 Slingshot server is active on port 4000 (uptime: ${data.uptime?.toFixed(1)}s)`);
    summary["Local Slingshot Bridge (Port 4000)"] = { status: "OK", details: "Running locally" };
  } else {
    console.log(`⚠️ Local G14 Slingshot server on port 4000 returned status ${localRes.status}.`);
    summary["Local Slingshot Bridge (Port 4000)"] = { status: "WARNING", details: `HTTP Status ${localRes.status}` };
  }
} catch (err: any) {
  console.log("❌ G14 Slingshot Crawler Bridge is NOT running locally on port 4000!");
  console.log("   -> Running direct fetches instead of proxying (Reddit will block direct calls).");
  summary["Local Slingshot Bridge (Port 4000)"] = { status: "FAIL", details: "Port 4000 offline. Run npm run slingshot" };
}

// Check Tunnel Reachability
if (macUrl) {
  try {
    const tunnelRes = await fetch(`${macUrl}/health`);
    if (tunnelRes.ok) {
      const data: any = await tunnelRes.json();
      console.log(`✅ Cloudflare Tunnel is REACHABLE & ACTIVE: ${macUrl}`);
      summary["Cloudflare Tunnel Connection"] = { status: "OK", details: "Active and forwarded" };
    } else {
      console.log(`❌ Cloudflare Tunnel returned HTTP ${tunnelRes.status} (likely 530 Tunnel Down)`);
      summary["Cloudflare Tunnel Connection"] = { status: "FAIL", details: `HTTP ${tunnelRes.status} (tunnel disconnected)` };
    }
  } catch (err: any) {
    console.log(`❌ Cloudflare Tunnel is UNREACHABLE: ${err.message || err}`);
    summary["Cloudflare Tunnel Connection"] = { status: "FAIL", details: `Connection failed: ${err.message || err}` };
  }
} else {
  console.log("⚠️ Cloudflare Tunnel URL not configured in .env.");
  summary["Cloudflare Tunnel Connection"] = { status: "WARNING", details: "CRAWLER_TUNNEL_URL missing" };
}
console.log("");

// ----------------------------------------
// PLATFORMS CONFIGURATION
// ----------------------------------------
const loadBotConfig = () => {
  try {
    const configPath = path.join(process.cwd(), "data", "bot-config.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (err) {
    console.error("Error loading bot config:", err);
  }
  return { platforms: [] };
};

const config = loadBotConfig();
console.log("Platforms Configuration loaded from bot-config.json:");
config.platforms.forEach((p: any) => {
  console.log(` - ${p.platformName} (${p.platformId}): ${p.isEnabled ? "ENABLED" : "DISABLED"} (${p.targets?.length || 0} targets)`);
});
console.log("");

// Cache & helpers
const CACHE_TTL_MS = 15 * 60 * 1000;

interface SubrequestBudget {
  remaining: number;
  tunnelDead: { mac: boolean; g14: boolean };
}

function createSubrequestBudget(max: number): SubrequestBudget {
  return { remaining: max, tunnelDead: { mac: false, g14: false } };
}

function consumeSubrequestBudget(budget: SubrequestBudget | undefined, label: string): boolean {
  if (!budget) return true;
  if (budget.remaining <= 0) {
    console.warn(`⚠️ [Subrequest Budget] Exhausted. Skipping: ${label}`);
    return false;
  }
  budget.remaining--;
  return true;
}

// ----------------------------------------
// DEFINE OR REPLICATE TUNNEL FETCH AND SCORING
// ----------------------------------------
async function fetchWithSlingshot(url: string, options?: RequestInit, budget?: SubrequestBudget): Promise<Response> {
  const macTunnel = llmConfig.crawlerTunnelUrl;
  const g14Tunnel = llmConfig.g14TunnelUrl;

  if (llmConfig.useSlingshot !== false) {
    // 1. Try Primary Mac Tunnel
    if (macTunnel && !budget?.tunnelDead.mac) {
      if (consumeSubrequestBudget(budget, `Mac tunnel -> ${url}`)) {
        try {
          console.log(`   [Tunnel Dispatch] Sending request to Mac Tunnel proxy for: ${url}`);
          const proxyUrl = `${macTunnel}/proxy?url=${encodeURIComponent(url)}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const res = await fetch(proxyUrl, {
            headers: options?.headers,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            console.log(`   [Tunnel Success] Mac Tunnel returned HTTP ${res.status}`);
            return res;
          }
          console.warn(`   ⚠️ [Tunnel Warning] Mac Tunnel returned HTTP ${res.status}. trying fallback...`);
        } catch (macErr: any) {
          console.warn(`   ⚠️ [Tunnel Failure] Mac Tunnel unreachable: ${macErr.message || macErr}. Marking dead.`);
          if (budget) budget.tunnelDead.mac = true;
        }
      }
    }

    // 2. Try G14 Tunnel
    if (g14Tunnel && !budget?.tunnelDead.g14) {
      if (consumeSubrequestBudget(budget, `G14 tunnel -> ${url}`)) {
        try {
          console.log(`   [Tunnel Dispatch] Sending request to G14 Tunnel proxy for: ${url}`);
          const proxyUrl = `${g14Tunnel}/proxy?url=${encodeURIComponent(url)}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const res = await fetch(proxyUrl, {
            headers: options?.headers,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            console.log(`   [Tunnel Success] G14 Tunnel returned HTTP ${res.status}`);
            return res;
          }
          console.warn(`   ⚠️ [Tunnel Warning] G14 Tunnel returned HTTP ${res.status}. trying direct fallback...`);
        } catch (g14Err: any) {
          console.warn(`   ⚠️ [Tunnel Failure] G14 Tunnel unreachable: ${g14Err.message || g14Err}. Marking dead.`);
          if (budget) budget.tunnelDead.g14 = true;
        }
      }
    }
  }

  // 3. Direct Fetch
  console.log(`   [Direct Fetch] Fetching url directly: ${url}`);
  if (!consumeSubrequestBudget(budget, `Direct fetch -> ${url}`)) {
    throw new Error(`Subrequest budget exhausted before direct fetch: ${url}`);
  }
  return fetch(url, options);
}

// XML Parsing Helpers
function extractXmlField(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i");
  const match = regex.exec(xml);
  if (match) return match[1].trim();
  return "";
}

function cleanHtmlAndCdata(text: string): string {
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

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ----------------------------------------
// PLATFORM SCRAPERS
// ----------------------------------------
async function testScrapeReddit(budget: SubrequestBudget): Promise<any[]> {
  console.log("\n--- Running Reddit Scraper Test ---");
  const sub = "smallbusiness";
  const q = "tedious";
  const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&limit=3`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 (OpportunityRadar/1.0)",
    "Accept": "application/json"
  };

  let directSuccess = false;
  const hits: any[] = [];

  try {
    const response = await fetchWithSlingshot(url, { headers }, budget);
    console.log(`[Reddit Crawl Status] HTTP Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      directSuccess = true;
      const responseText = await response.text();
      let data = JSON.parse(responseText);
      const children = data?.data?.children || [];
      console.log(`[Reddit Extracted] Found ${children.length} posts.`);
      children.forEach((child: any, idx: number) => {
        const post = child.data;
        if (post && post.selftext) {
          console.log(`   #${idx + 1}: Title: "${post.title}" | Selftext length: ${post.selftext.length}`);
          hits.push({
            id: `reddit-${post.id}`,
            author: post.author || "Reddit_User",
            sourcePlatform: `Reddit (r/${post.subreddit})`,
            sourceUrl: `https://www.reddit.com${post.permalink}`,
            text: `${post.title}\n\n${post.selftext}`.substring(0, 1500),
            title: post.title || "Discussion on Reddit"
          });
        }
      });
      summary["Reddit Scraper"] = { status: "OK", details: `Extracted ${hits.length} posts` };
    } else {
      console.log(`[Reddit Scraper] Direct unauthenticated search returned HTTP ${response.status}. Trying Google News RSS fallback...`);
    }
  } catch (err: any) {
    console.log(`[Reddit Scraper] Direct search failed: ${err.message || err}. Trying Google News RSS fallback...`);
  }

  // Google News RSS Fallback for Reddit
  if (!directSuccess || hits.length === 0) {
    const rssQuery = `site:reddit.com/r/${sub} "${q}"`;
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(rssQuery)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      console.log(`[Reddit Fallback] Fetching RSS feed: ${feedUrl}`);
      const response = await fetchWithSlingshot(feedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "application/rss+xml, application/atom+xml, text/xml, application/xml, */*"
        }
      }, budget);

      if (response.ok) {
        const xml = await response.text();
        const items: any[] = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && items.length < 3) {
          const itemXml = match[1];
          const title = extractXmlField(itemXml, "title");
          const link = extractXmlField(itemXml, "link");
          const description = extractXmlField(itemXml, "description") || extractXmlField(itemXml, "content:encoded");
          const creator = extractXmlField(itemXml, "dc:creator") || extractXmlField(itemXml, "author") || "Reddit_User";
          const guid = extractXmlField(itemXml, "guid") || link || String(Date.now());
          if (title && link) {
            items.push({ title, link, description, creator, guid });
          }
        }

        items.forEach((item: any, idx: number) => {
          const cleanTitle = cleanHtmlAndCdata(item.title);
          const cleanDesc = cleanHtmlAndCdata(item.description || "");
          const cleanCreator = cleanHtmlAndCdata(item.creator);
          console.log(`   #${idx + 1}: (RSS Fallback) Title: "${cleanTitle}" | Author: ${cleanCreator}`);
          hits.push({
            id: `reddit-rss-${hashString(item.guid || item.link)}`,
            author: cleanCreator,
            sourcePlatform: `Reddit (r/${sub})`,
            sourceUrl: item.link.trim(),
            text: `${cleanTitle}\n\n${cleanDesc}`.substring(0, 1500),
            title: cleanTitle
          });
        });
        summary["Reddit Scraper"] = { status: "OK", details: `Extracted ${items.length} posts via Google News RSS fallback` };
      } else {
        console.error(`❌ Reddit RSS fallback request failed. HTTP Status: ${response.status}`);
        summary["Reddit Scraper"] = { status: "FAIL", details: `Direct failed (403) and RSS fallback failed (HTTP ${response.status})` };
      }
    } catch (rssErr: any) {
      console.error("❌ Reddit RSS fallback crawler error:", rssErr.message || rssErr);
      summary["Reddit Scraper"] = { status: "FAIL", details: `Direct failed (403) and RSS fallback error: ${rssErr.message || rssErr}` };
    }
  }

  return hits;
}

async function testScrapeDiscourse(budget: SubrequestBudget): Promise<any[]> {
  console.log("\n--- Running Discourse Scraper Test ---");
  const domain = "community.make.com";
  const q = "automation";
  const url = `https://${domain}/search.json?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetchWithSlingshot(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    }, budget);
    console.log(`[Discourse Crawl Status] HTTP Status: ${response.status} ${response.statusText}`);
    
    const responseText = await response.text();
    if (!response.ok) {
      console.error(`❌ Discourse request failed. Response snippet: "${responseText.substring(0, 200)}"`);
      summary["Discourse Scraper (Make Community)"] = { status: "FAIL", details: `HTTP Status ${response.status}` };
      return [];
    }

    let data = JSON.parse(responseText);
    const posts = data?.posts || [];
    const topics = data?.topics || [];
    const topicMap = new Map();
    for (const t of topics) {
      topicMap.set(t.id, t);
    }

    console.log(`[Discourse Extracted] Found ${posts.length} posts.`);
    const hits: any[] = [];
    posts.slice(0, 3).forEach((post: any, idx: number) => {
      const text = post.blurb || post.cooked || "";
      const topic = topicMap.get(post.topic_id) || {};
      const slug = topic.slug || "topic";
      const topicTitle = topic.title || "Discussion on Discourse";
      console.log(`   #${idx + 1}: Title: "${topicTitle}" | Author: ${post.username}`);

      hits.push({
        id: `discourse-${domain}-${post.id}`,
        author: post.username || "Discourse_User",
        sourcePlatform: `Discourse (${domain})`,
        sourceUrl: `https://${domain}/t/${slug}/${post.topic_id}`,
        text: `${topicTitle}\n\n${text}`.substring(0, 1500),
        title: topicTitle
      });
    });
    summary["Discourse Scraper (Make Community)"] = { status: "OK", details: `Extracted ${hits.length} posts` };
    return hits;
  } catch (err: any) {
    console.error("❌ Discourse crawler error:", err.message || err);
    summary["Discourse Scraper (Make Community)"] = { status: "FAIL", details: `Error: ${err.message || err}` };
    return [];
  }
}

async function testScrapeRSSFeed(budget: SubrequestBudget): Promise<any[]> {
  console.log("\n--- Running RSS Feed Scraper Test ---");
  const feedUrl = "https://news.google.com/rss/search?q=site:community.shopify.com+OR+shopify+small+business+workflow&hl=en-US&gl=US&ceid=US:en";
  try {
    const response = await fetchWithSlingshot(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/atom+xml, text/xml, application/xml, */*"
      }
    }, budget);

    console.log(`[RSS Crawl Status] HTTP Status: ${response.status} ${response.statusText}`);
    const xml = await response.text();
    
    if (!response.ok) {
      console.error(`❌ RSS feed request failed. XML snippet: "${xml.substring(0, 200)}"`);
      summary["RSS Feed Scraper (Shopify)"] = { status: "FAIL", details: `HTTP Status ${response.status}` };
      return [];
    }

    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 3) {
      const itemXml = match[1];
      const title = extractXmlField(itemXml, "title");
      const link = extractXmlField(itemXml, "link");
      const description = extractXmlField(itemXml, "description") || extractXmlField(itemXml, "content:encoded");
      const creator = extractXmlField(itemXml, "dc:creator") || extractXmlField(itemXml, "author") || "RSS_User";
      const guid = extractXmlField(itemXml, "guid") || link || String(Date.now());

      if (title && link) {
        items.push({ title, link, description, creator, guid });
      }
    }

    console.log(`[RSS Extracted] Found ${items.length} RSS entries.`);
    const hits: any[] = [];
    items.forEach((item: any, idx: number) => {
      const cleanTitle = cleanHtmlAndCdata(item.title);
      const cleanDesc = cleanHtmlAndCdata(item.description || "");
      const cleanCreator = cleanHtmlAndCdata(item.creator);

      console.log(`   #${idx + 1}: Title: "${cleanTitle}" | Author: ${cleanCreator}`);
      hits.push({
        id: `rss-${hashString(item.guid || item.link)}`,
        author: cleanCreator,
        sourcePlatform: "Shopify RSS",
        sourceUrl: item.link.trim(),
        text: `${cleanTitle}\n\n${cleanDesc}`.substring(0, 1500),
        title: cleanTitle
      });
    });
    summary["RSS Feed Scraper (Shopify)"] = { status: "OK", details: `Extracted ${hits.length} items` };
    return hits;
  } catch (err: any) {
    console.error("❌ RSS crawler error:", err.message || err);
    summary["RSS Feed Scraper (Shopify)"] = { status: "FAIL", details: `Error: ${err.message || err}` };
    return [];
  }
}

async function testScrapeFirecrawl(): Promise<any[]> {
  console.log("\n--- Running Firecrawl Web Scraper Test ---");
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    console.warn("⚠️ [Firecrawl] FIRECRAWL_API_KEY is not configured. Skipping.");
    summary["Firecrawl Scraper (BizWarriors)"] = { status: "SKIPPED", details: "Key not configured" };
    return [];
  }

  const targetUrl = "https://bizwarriors.com/forum/";
  try {
    console.log(`[Firecrawl] Requesting scrape for target: "${targetUrl}"...`);
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["markdown"]
      })
    });

    console.log(`[Firecrawl Status] HTTP Status: ${res.status} ${res.statusText}`);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Firecrawl failed: ${errText}`);
      summary["Firecrawl Scraper (BizWarriors)"] = { status: "FAIL", details: `Firecrawl failed: HTTP ${res.status}` };
      return [];
    }

    const data: any = await res.json();
    const markdown = data?.data?.markdown || "";
    console.log(`[Firecrawl Extracted] Markdown content length: ${markdown.length} characters.`);

    if (markdown.length < 50) {
      console.warn("⚠️ Firecrawl returned insufficient/empty text.");
      summary["Firecrawl Scraper (BizWarriors)"] = { status: "WARNING", details: "Empty markdown returned" };
      return [];
    }

    const lines = markdown.split("\n").filter((l: string) => l.trim().length > 30).slice(0, 3);
    const hits: any[] = [];
    lines.forEach((line: string, idx: number) => {
      const cleanLine = line.replace(/[#*`_\[\]()]/g, "").trim();
      console.log(`   #${idx + 1}: Snippet: "${cleanLine.substring(0, 100)}..."`);
      hits.push({
        id: `firecrawl-${hashString(targetUrl)}-${idx}`,
        author: "Forum_User",
        sourcePlatform: "BizWarriors Forum (Firecrawl)",
        sourceUrl: targetUrl,
        text: cleanLine,
        title: `Discussion Thread on BizWarriors`
      });
    });

    summary["Firecrawl Scraper (BizWarriors)"] = { status: "OK", details: `Scraped forum successfully (${hits.length} items)` };
    return hits;
  } catch (err: any) {
    console.error("❌ Firecrawl scraper error:", err.message || err);
    summary["Firecrawl Scraper (BizWarriors)"] = { status: "FAIL", details: `Error: ${err.message || err}` };
    return [];
  }
}

// ----------------------------------------
// RUN THE CRAWLERS & PROCESS RESULTS
// ----------------------------------------
async function runDiagnostic() {
  const budget = createSubrequestBudget(20);
  
  console.log("[STEP 2 & 3] Launching crawlers and crawling target sites...");
  const redditHits = await testScrapeReddit(budget);
  const discourseHits = await testScrapeDiscourse(budget);
  const rssHits = await testScrapeRSSFeed(budget);
  
  console.log("\n--- Running LinkedIn RSS Feed Test ---");
  const linkedInFeedUrl = "https://news.google.com/rss/search?q=site:linkedin.com/posts/+%22looking+for+recommendations%22+OR+%22tedious%22+OR+%22workflow%22+OR+%22frustrated%22&hl=en-US&gl=US&ceid=US:en";
  let linkedInHits: any[] = [];
  try {
    const response = await fetchWithSlingshot(linkedInFeedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/atom+xml, text/xml, application/xml, */*"
      }
    }, budget);
    console.log(`[LinkedIn RSS Status] HTTP Status: ${response.status} ${response.statusText}`);
    const xml = await response.text();
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 3) {
      const itemXml = match[1];
      const title = extractXmlField(itemXml, "title");
      const link = extractXmlField(itemXml, "link");
      const description = extractXmlField(itemXml, "description") || extractXmlField(itemXml, "content:encoded");
      const creator = extractXmlField(itemXml, "dc:creator") || extractXmlField(itemXml, "author") || "LinkedIn_User";
      const guid = extractXmlField(itemXml, "guid") || link || String(Date.now());
      if (title && link) items.push({ title, link, description, creator, guid });
    }
    console.log(`[LinkedIn RSS Extracted] Found ${items.length} entries.`);
    items.forEach((item: any, idx: number) => {
      const cleanTitle = cleanHtmlAndCdata(item.title);
      const cleanDesc = cleanHtmlAndCdata(item.description || "");
      const cleanCreator = cleanHtmlAndCdata(item.creator);
      console.log(`   #${idx + 1}: Title: "${cleanTitle}" | Author: ${cleanCreator}`);
      linkedInHits.push({
        id: `rss-linkedin-${hashString(item.guid || item.link)}`,
        author: cleanCreator,
        sourcePlatform: "LinkedIn (via Google News)",
        sourceUrl: item.link.trim(),
        text: `${cleanTitle}\n\n${cleanDesc}`.substring(0, 1500),
        title: cleanTitle
      });
    });
    summary["LinkedIn RSS Scraper (Shopify)"] = { status: "OK", details: `Extracted ${linkedInHits.length} items` };
  } catch (err: any) {
    console.error("❌ LinkedIn RSS crawler error:", err.message || err);
    summary["LinkedIn RSS Scraper (Shopify)"] = { status: "FAIL", details: `Error: ${err.message || err}` };
  }

  const firecrawlHits = await testScrapeFirecrawl();

  // Pool posts
  console.log("\n[STEP 4] Pooling identified posts...");
  const pooledPosts = [...redditHits, ...discourseHits, ...rssHits, ...linkedInHits, ...firecrawlHits];
  console.log(`Pooled ${pooledPosts.length} posts total.`);

  // Pre-scoring
  console.log("\n[STEP 5] Pre-scoring buyer intent and frustration phrases...");
  const URGENCY_PHRASES = ["asap", "urgently", "urgent", "immediately", "right now", "this week"];
  const BUYING_INTENT_PHRASES = ["willing to pay", "budget for", "looking to hire", "paying for", "looking for a solution", "need a developer"];
  const FRUSTRATION_PHRASES = ["so frustrated", "sick of", "tired of", "waste of time", "nightmare", "fed up"];
  const MANUAL_PAIN_PHRASES = ["manually", "by hand", "spreadsheet", "excel", "copy and paste", "copy-paste"];
  const PROMOTIONAL_PHRASES = ["i built", "i made", "i launched", "check out my", "we built", "introducing"];

  function scoreBuyerIntent(text: string): { score: number; signals: string[] } {
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

  const preScored = pooledPosts.map((p) => {
    const { score, signals } = scoreBuyerIntent(p.text);
    return { ...p, _intentScore: score, _intentSignals: signals };
  });

  const filtered = preScored.filter(p => p._intentScore > -3);
  const itemsForAI = filtered.length > 0 ? filtered.slice(0, 10) : preScored.slice(0, 10);

  // Gemini payload construction
  console.log("\n[STEP 6] Formatting and passing payload to Gemini...");
  const prompt = `
    You are an advanced AI crawler and opportunity filter. 
    Analyze the provided raw feed comments and extract genuine workflow problems.
    
    Return a JSON array containing ONLY objects that match the feed comments and are classified as "help_seeker".
    
    JSON Schema:
    [
      {
        "title": "Exact raw title from the post",
        "author": "Author name",
        "sourcePlatform": "Source platform name",
        "sourceUrl": "Source URL",
        "classification": "help_seeker",
        "problemSummary": "1-2 sentence summary of core workflow bottleneck",
        "whoIsExperiencing": "Who is experiencing this pain?",
        "industry": "Traditional real-world industry (e.g. Retail, Real Estate, E-commerce, Marketing agency)",
        "evidence": "Raw EXACT direct quote of frustration from text",
        "painLevel": "High" | "Medium" | "Low",
        "painLevelExplanation": "How much time/money this bottleneck costs them",
        "frequency": "How often does it occur",
        "currentSolutions": "What they do now and why it fails",
        "possibleSolution": "High-level software solution",
        "mvpIdea": "Hyper-focused 2-week MVP idea",
        "difficulty": "Easy" | "Medium" | "Hard",
        "difficultyExplanation": "Technical details on ease of build",
        "willingnessToPay": "Estimated monthly subscription cost with justification",
        "opportunityScore": 82, // 0-100 score
        "responseDraft": "Personalized, empathetic outreach message offering value",
        "suggestedQuestions": ["Q1", "Q2"],
        "valueAdditionIdeas": ["Idea 1"]
      }
    ]

    Raw comments feed:
    ${JSON.stringify(itemsForAI)}
  `;

  if (pooledPosts.length === 0) {
    console.log("❌ Cannot execute Gemini test step: no scraped posts were collected.");
    summary["Gemini API Call"] = { status: "SKIPPED", details: "No input data scraped" };
    printFinalSummary();
    return;
  }

  // Call Gemini
  console.log("\n[STEP 7] Calling Gemini API...");
  if (!ai) {
    console.log("❌ Gemini client not initialized (missing API key).");
    summary["Gemini API Call"] = { status: "FAIL", details: "Gemini API client not initialized" };
    printFinalSummary();
    return;
  }

  const startTime = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const elapsed = Date.now() - startTime;
    console.log(`\n⚡ Gemini finished in ${elapsed}ms.`);

    const rawResponseText = response.text || "[]";
    console.log("✅ Gemini returned a response!");
    summary["Gemini API Call"] = { status: "OK", details: `Responded in ${elapsed}ms` };

    // Parsing and validation
    let parsedOpps = [];
    try {
      let cleaned = rawResponseText.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n/i, "");
        cleaned = cleaned.replace(/\n```$/, "");
      }
      cleaned = cleaned.trim();
      parsedOpps = JSON.parse(cleaned);
      console.log(`✅ Successfully parsed response JSON. Extracted ${parsedOpps.length} opportunities.`);
      summary["Gemini Opportunity Extraction"] = { status: "OK", details: `Extracted ${parsedOpps.length} cards` };
    } catch (pe: any) {
      console.error("❌ JSON PARSE FAILURE:", pe.message);
      summary["Gemini Opportunity Extraction"] = { status: "FAIL", details: `JSON parse error: ${pe.message}` };
    }

  } catch (gemErr: any) {
    console.error("\n❌ ERROR during Gemini call or processing:");
    if (gemErr.status === 429 || String(gemErr.message).includes("quota") || String(gemErr.message).includes("RESOURCE_EXHAUSTED")) {
      console.log("\n⚠️  [DIAGNOSTIC REPORT: GEMINI RATE LIMIT EXCEEDED (429)]");
      console.log("   You are currently using the Gemini Free Tier (limit: 20 requests per day for gemini-3.6-flash).");
      console.log("   To resolve this, you can:");
      console.log("   1. Enable pay-as-you-go billing in Google AI Studio to lift this rate limit.");
      console.log("   2. Wait for the quota period to reset (or retry in ~1 minute if it was a minute-based rate limit).");
      console.log("   3. Configure a fallback LLM model or retry later.\n");
      summary["Gemini API Call"] = { status: "FAIL", details: "Quota Exceeded (429 Resource Exhausted)" };
    } else {
      console.error(gemErr);
      summary["Gemini API Call"] = { status: "FAIL", details: `Gemini API Error: ${gemErr.message || gemErr}` };
    }
  }

  printFinalSummary();
}

function printFinalSummary() {
  console.log("\n======================================================================");
  console.log("📊 OPPORTUNITY RADAR DIAGNOSTIC PIPELINE REPORT");
  console.log("======================================================================\n");
  
  const items = Object.entries(summary);
  items.forEach(([key, val]) => {
    let icon = "❓";
    if (val.status === "OK") icon = "✅";
    if (val.status === "FAIL") icon = "❌";
    if (val.status === "WARNING") icon = "⚠️";
    if (val.status === "SKIPPED") icon = "⏭️";
    
    console.log(`${icon} [${val.status}] ${key.padEnd(40)} | ${val.details}`);
  });

  console.log("\n======================================================================");
  console.log("🎉 DIAGNOSTIC TRACE COMPLETE");
  console.log("======================================================================\n");
}

runDiagnostic();
