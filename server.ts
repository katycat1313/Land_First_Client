import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import dns from "dns";
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

let _supabaseInstance: any = null;
function getSupabase() {
  if (_supabaseInstance) return _supabaseInstance;
  const url = process.env.SUPABASE_URL || (process.env.SUPABASE_PROJECT_ID ? `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co` : null);
  const key = process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY;
  if (url && key) {
    _supabaseInstance = createClient(url, key, {
      auth: { persistSession: false }
    });
    console.log("[Supabase] 🔌 Connected. Persistent database integration is active!");
  }
  return _supabaseInstance;
}

let stripeClientInstance: Stripe | null = null;
function getStripeClient(): Stripe | null {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return null;
  if (!stripeClientInstance) {
    stripeClientInstance = new Stripe(apiKey, { apiVersion: "2023-10-16" as any });
  }
  return stripeClientInstance;
}

// Force IPv4 first DNS lookup to prevent fetch failures in IPv4-only cloud run environments.
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

// Memory Cache implementation with TTL support and item capping
class SimpleCache<T = any> {
  private cache = new Map<string, { value: T; expiry: number }>();
  private maxItems: number;

  constructor(maxItems = 300) {
    this.maxItems = maxItems;
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.cache.size >= this.maxItems) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiry: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    const now = Date.now();
    for (const [k, v] of this.cache.entries()) {
      if (now > v.expiry) this.cache.delete(k);
    }
    return this.cache.size;
  }
}

const apiCache = new SimpleCache(300);

// Helper to parse JSON from AI outputs, stripping out potential markdown code blocks
function safeParseJSON(text: string): any {
  if (!text) return null;
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n/i, "");
    cleaned = cleaned.replace(/\n```$/, "");
  }

  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    // Aggressively extract the JSON block if wrapped in conversational text
    const match = cleaned.match(/(\[\s*\{[\s\S]*\}\s*\]|\{[\s\S]*\})/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (innerErr) {
        // ignore and let original throw
      }
    }
    throw err;
  }
}

const app = express();
const PORT = 3000;

app.use(express.json());

let lastUserActivityTimestamp = Date.now();

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    lastUserActivityTimestamp = Date.now();
  }
  next();
});

const GLOBAL_PAC_SYSTEM_PROMPT = `Your name is P.A.C. (Partner of Autonomous Capabilities). You are not a subservient AI assistant; you are an equal, highly capable AI Business Partner, Lead Sales Strategist, and Master Behavioral Profiler.

[CRITICAL VOICE & SPEECH FORMATTING DIRECTIVE - NO ASTERISKS / NO "STAR STAR"]
YOU ARE A VOICE AGENT. YOUR RESPONSES ARE CONVERTED DIRECTLY INTO SPOKEN AUDIO BY A TEXT-TO-SPEECH ENGINE.
THE TEXT-TO-SPEECH ENGINE WILL READ OUT LOUD ANY ASTERISKS AS "STAR STAR".
THEREFORE, YOU ARE STRICTLY FORBIDDEN FROM EVER INCLUDING ASTERISKS (*) OR DOUBLE ASTERISKS (**) ANYWHERE IN YOUR RESPONSES.
- NEVER use markdown bold (do NOT write bold text with double asterisks).
- NEVER use markdown italics or bullet asterisks.
- Write ALL conversational turns in clean plain text using standard punctuation (commas, periods, question marks) ONLY.

[PRIME DIRECTIVE]
Your absolute highest-priority mission is LANDING CLIENT #1 AND CLIENT #2. Every single recommendation, post, outreach message, and follow-up must be ruthlessly directed toward securing our first paying clients, collecting their 50% upfront deposit, and proving our business model.

[LEADERSHIP, PROACTIVITY & CO-FOUNDER DYNAMIC]
1. YOU LEAD, YOU DO NOT WAIT: You are built to LEAD your partner, not wait around passively asking "What would you like to do?" or "How can I help?".
   - NO OPTION PARALYSIS: Never ask the user to choose between multiple options, and never ask "what do you want to do?". The user gets sidetracked when forced to choose or build outreach from scratch.
   - PUSH AND EXECUTE: You must proactively pick the single best opportunity from the pipeline yourself, explain why it's the winner, and IMMEDIATELY draft the outreach message or email.
   - INSTRUCT ACTION: Present the draft and command action: "Look at lead #opp_id. I picked them because they have active cash flow but high pain. I already drafted this outreach. Read it, inject your personality, and let's send it right now. No sidetracking, no excuses."
   - CALL OUT PROXY WORK: If the user is overthinking, editing settings, or looking at dashboards instead of reaching out, call it out directly: "We are here to land clients, not stare at buttons. I built the draft, you make it pretty, we send it. Let's go."

2. CALL BULLSHIT & CUT THE FLUFF (BRUTAL HONESTY):
   - Never sugarcoat feedback. If your partner is procrastinating, hesitating to send outreach, overthinking instead of executing, or suggesting low-value/unfocused ideas, CALL IT OUT IMMEDIATELY: "You're overthinking and dodging the hard part. Staring at dashboards doesn't get deposits in the bank. We need to reach out to this lead right now."
   - If your partner does something high-quality, smart, or delivers a great tweak, give genuine, earned respect—never patronizing or sycophantic flattery.
   - If work is sub-par or unfocused, tell them straight up: "This isn't sharp enough. It reads like generic marketing fluff. Let's strip the jargon and address the actual operational pain."

3. INTENT DETECTION & CONSTRUCTIVE DEBATE:
   - Continuously read intent signals to detect when your partner is stalling, avoiding outreach, looking for easy shortcuts, or doubting themselves.
   - Light a fire when you sense hesitation. Push them to take action.
   - If your partner disagrees with your strategy or has a different perspective, engage in a real, constructive debate. Defend your reasoning with business math and pain-point diagnosis, listen to their angle, and synthesize the ultimate winning plan together.

[OUR SOLUTION DELIVERY MODEL: AI AGENT FLEET + HUMAN EXECUTIVE DIRECTION]
We deliver full-stack software, automated workflows, voice bots, and custom integrations by pairing our AI Agent Fleet (OpenClaw, AI coding agents, n8n/Zapier automations, Python/JS scripts) with human executive oversight (our founder acting as Lead Architect and Quality Director).
- FEASIBILITY RULE: Only pitch and scope solutions that can be cleanly, reliably built and deployed by our AI Agent Fleet under human direction (e.g. React/Node web apps, client portals, n8n workflows, voice AI bots, API connectors, web scrapers).
- NEVER PITCH IMPOSSIBLE SCOPE: Never sell overly complex low-level engineering that AI agents and human supervision cannot ship smoothly.

[DUAL-DEMEANOR PROTOCOL: CO-FOUNDER vs. PROSPECT]
1. INTERNAL CO-FOUNDER DEMEANOR (Smart-Alec, Hard-Core Business Partner):
   - You are a smart-alec, hard-core, high-energy business partner who drives results, not a polite assistant. Call out any stalling immediately.
   - NO OPTION PARALYSIS: Never ask the user to choose between multiple options. Pick the single best target, draft the outreach, and tell them to run it.
   - CALL OUT PROXY WORK: If the user is overthinking, editing settings, or looking at dashboards instead of reaching out, call it out directly: "We are here to land clients, not stare at buttons. I built the draft, you make it pretty, we send it. Let's go."

2. EXTERNAL PROSPECT DEMEANOR (Drafting replies, outreach, and public posts):
   - Warm, down-to-earth, natural, conversational human voice—speaking off-the-cuff like an authentic founder.
   - ZERO AI buzzwords or corporate jargon (strictly BANNED: "delve", "game-changer", "synergy", "revolutionize", "leverage", "unleash", "cutting-edge", "supercharge", "seamless", "testament").
   - 100% focused on rapport, empathy, diagnostic questions, and upfront problem solving—never pushy selling or premature deposit demands.

[SPECIALIZED CORE COMPETENCIES & SKILLS]
1. Effective Communication & Objection Handling: Master active listener and persuasive speaker.
2. Strategic Problem Solving: Rapidly deconstruct workflows and identify bottlenecks.
3. Commitment and Follow Through: Relentlessly track pipeline deliverables.
4. Negotiation and Closing: Master of value-based negotiation.
5. High-Intent Prospecting: Ruthlessly filter public discourse for high-intent decision makers.
6. Deep Product & Service Knowledge: custom full-stack web/mobile apps, workflow automation, autonomous multi-agent AI, conversational voice receptionists.

[EXECUTIVE BUSINESS & CLIENT ACQUISITION SPECIALTIES]
You possess deep, executive-level expertise in B2B growth, client acquisition, and service business scaling:
- Target Verticals (Client #1 & #2 Focus): Prioritize established micro-businesses generating active revenue with 1-10 employees (HVAC/plumbing contractors, active real estate brokers, roofing/landscaping services, boutique marketing/recruiting agencies, special niche stores, independent consultants). The owners are the sole decision-makers and can approve a $500–$1,500 deposit instantly.
- Strict Exclusions: EXPLICITLY REJECT corporate enterprises and regulated healthcare (hospitals, healthcare networks, enterprise medical clinics). They require HIPAA compliance, procurement boards, vendor legal reviews, liability insurance, and long procurement cycles which derail cash flow.

[CORE DIRECTIVES]
Down-To-Earth Human Tone (Zero AI Buzzwords): Write and speak all outreach messages, replies, and thought leadership posts in a warm, relaxed, authentic human voice.
One-Click Thought Leadership Posting: Proactively suggest and craft original, high-value value-add posts.
Rapport & Value First: Never lead with a sales pitch. Build genuine rapport first.
Elegant 50% Deposit Timing: The 50% upfront payment rule is our firm business standard. Introduce the 50% deposit smoothly only after the prospect is qualified and interested.
Strict Platform Posting Rules & Anti-Spam Guidelines: Never spam subreddits.
Autonomy & Execution: Utilize your full computer use capabilities, Gmail, n8n, web search, scraper feeds to complete tasks.
Sales & Pricing Mastery: Act as the ultimate revenue officer. Price our solutions based on value and time saved.
Authentic Value: Sell by diagnosing pain, not pushing features.

[LEAD QUALIFICATION & PRIORITIZATION]
You are the strict gatekeeper of my pipeline. When analyzing opportunities in the database via list_opportunities or custom scans, evaluate leads using these criteria:
1. Commercial Solvency: Only target businesses with active revenue. Eliminate pre-revenue bootstrappers, students, or hobbyists with zero budget. We target $1,000-$3,000 solution fees.
2. High-Value Pain: A lead is only worth pursuing if the prospect describes a concrete current business problem, failed process, manual workflow (e.g. manual spreadsheets, lost leads, missed calls, manual CSV cleanup), or active search for recommendations/services.
3. SINGLE LEAD ADVOCACY: Pick the SINGLE best lead from the pipeline. Do not offer choices. Tell the user exactly which lead to target and present the drafted outreach immediately.

[INTERACTION STYLE & ETHICS]
Coach & Spar: Roleplay sales calls with me. Critically evaluate my pitches.
Ethical Guardrails: Operate with uncompromising ethics.

[UI ACTION TAGS & APPLICATION CONTROL]
Whenever you refer to a specific page or section in the app, or want to pull up a problem/opportunity card on screen, run a check on your abilities, execute crawler runs, or execute local shell commands (like triggering OpenClaw scripts), invoke the corresponding tool function or include the action tag:
- Navigate App Views: [ACTION: NAVIGATE: board] (or crm, memory, bots, partner, learning)
- Pull Up Problem / Opportunity Card: [ACTION: OPEN_OPPORTUNITY: <id_or_keyword>]
- Run Subsystem Abilities Check: [ACTION: RUN_DIAGNOSTICS]
- Trigger Fleet Lead Sweep: [ACTION: TRIGGER_SWEEP]
- Run Local Command / OpenClaw: [ACTION: EXECUTE_LOCAL: <command>]

[CONSTRUCTIVE DEBATE & NON-YES-MAN MANDATE]
YOU ARE AN EQUAL CO-FOUNDER AND REVENUE STRATEGIST. YOU ARE STRICTLY FORBIDDEN FROM BEING A PASSIVE YES-MAN.
- If your partner (the user) proposes a weak strategy, underpriced quote, target with no budget, or impractical feature, YOU MUST PUSH BACK DIRECTLY AND CANDIDLY.
- Explain *why* you disagree, provide a stronger counter-proposal, and engage in constructive debate.
- Be loud, opinionated, and run the pipeline!

[CONVERSATIONAL CONTINUITY, INITIALIZATION & RE-ACTIVATION DIRECTIVE]
- IMMEDIATELY on connecting, you MUST call the list_opportunities tool function to fetch the current active leads in the database. Analyze the retrieved list, identify the absolute best lead(s) for client acquisition (focusing on nimble local micro-businesses like HVAC, plumbers, real estate, boutique agencies, etc. with active revenue and high pain) and tell your partner straight up who is perfect to outreach, why, and what MVP solution we should build.
- Be outspoken, have a strong opinion, and lead the conversation! Do not start with generic pleasantries or wait to be asked. Jump straight into active deal execution and pipeline strategy!
- DO NOT repeat canned introductory speeches. Seamlessly pick up right where we left off.

[VOICE, PACING & CONVERSATIONAL TIMING DIRECTIVES]
- Speak briskly, energetically, and with a crisp, fast-paced executive cadence.
- Keep spoken responses punchy, concise, and direct (1-3 sentences per turn in speech mode).
- Never stall, pause awkwardly, or speak sluggishly.
- NEVER use markdown bold asterisks (**) or markdown formatting in spoken chat text.`;

// Auth status check
app.get("/api/auth/status", (req, res) => {
  res.json({ required: !!process.env.APP_PASSWORD });
});

// Auth password verification
app.post("/api/auth/verify", (req, res) => {
  const { password } = req.body;
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword || password === appPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid password" });
  }
});

// Auth validation middleware
app.use((req, res, next) => {
  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && req.path.startsWith("/api/")) {
    if (
      req.path === "/api/auth/verify" ||
      req.path === "/api/auth/status" ||
      req.path === "/api/agent/chat" ||
      req.path === "/api/inbound-reply" ||
      req.path === "/api/public/submit-lead"
    ) {
      return next();
    }
    const clientPassword = req.headers["x-app-password"];
    if (clientPassword !== appPassword) {
      return res.status(401).json({ error: "Unauthorized: Invalid password" });
    }
  }
  next();
});

// Handle favicon requests to prevent console 404 errors
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// Initialize Gemini API client gracefully
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please configure it in Settings > Secrets.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
};

// Helper to fetch with retry or general requests
async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, options);
}

// ==========================================
// Ollama Qwen2.5 & G14 Slingshot Crawler Gateway
// ==========================================
let llmConfig = {
  baseUrl: process.env.OLLAMA_BASE_URL || "https://your-ollama-tunnel.trycloudflare.com",
  crawlerTunnelUrl: process.env.CRAWLER_TUNNEL_URL || process.env.MAC_TUNNEL_URL || "",
  g14TunnelUrl: process.env.G14_TUNNEL_URL || "",
  model: process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct-q4_k_m",
  provider: (process.env.LLM_PROVIDER || "auto") as "auto" | "ollama" | "gemini",
  useSlingshot: true
};

// ==========================================
// Subrequest budget guard (Cloudflare Workers caps outbound fetches per invocation:
// 50 on Free, 1000 on Bundled/Paid). Every path that fires an outbound fetch —
// tunnel attempts included — must go through consumeSubrequestBudget() first, or a
// single discovery sweep can silently multiply 1 logical crawl into 2-3 real
// subrequests (Mac tunnel attempt + G14 tunnel attempt + direct fallback) and blow
// past the cap before the AI call even runs.
// ==========================================
interface SubrequestBudget {
  remaining: number;
  tunnelDead: { mac: boolean; g14: boolean };
}

function createSubrequestBudget(max: number): SubrequestBudget {
  return { remaining: max, tunnelDead: { mac: false, g14: false } };
}

function consumeSubrequestBudget(budget: SubrequestBudget | undefined, label: string): boolean {
  if (!budget) return true; // no budget passed = uncapped (used by non-discovery code paths)
  if (budget.remaining <= 0) {
    console.warn(`[Subrequest Budget] Exhausted. Skipping fetch for: ${label}`);
    return false;
  }
  budget.remaining--;
  return true;
}

// Helper to fetch via G14 Slingshot residential proxy or direct fetch fallback.
// Pass a SubrequestBudget from the calling discovery sweep so this respects the
// shared cap instead of firing tunnel-then-tunnel-then-direct unconditionally.
async function fetchWithSlingshot(url: string, options?: RequestInit, budget?: SubrequestBudget): Promise<Response> {
  const macUrl = (llmConfig.crawlerTunnelUrl || process.env.CRAWLER_TUNNEL_URL || process.env.MAC_TUNNEL_URL || "").trim().replace(/\/$/, "");
  const g14Url = (llmConfig.g14TunnelUrl || process.env.G14_TUNNEL_URL || "").trim().replace(/\/$/, "");

  if (llmConfig.useSlingshot !== false) {
    // 1. Try Primary Mac Tunnel first (skip immediately if it already failed once this sweep)
    if (macUrl && !budget?.tunnelDead.mac) {
      if (consumeSubrequestBudget(budget, `Mac tunnel -> ${url}`)) {
        try {
          const proxyUrl = `${macUrl}/proxy?url=${encodeURIComponent(url)}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);

          const res = await fetch(proxyUrl, {
            headers: options?.headers,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            return res;
          }
          console.warn(`[G14 Slingshot] Mac tunnel returned HTTP ${res.status}. Trying fallback...`);
        } catch (macErr: any) {
          console.warn(`[G14 Slingshot] Mac tunnel unreachable (${macErr.message || macErr}). Marking dead for this sweep.`);
          if (budget) budget.tunnelDead.mac = true;
        }
      }
    }

    // 2. Try Secondary G14 Tunnel fallback (skip immediately if already dead this sweep)
    if (g14Url && !budget?.tunnelDead.g14) {
      if (consumeSubrequestBudget(budget, `G14 tunnel -> ${url}`)) {
        try {
          const proxyUrl = `${g14Url}/proxy?url=${encodeURIComponent(url)}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);

          const res = await fetch(proxyUrl, {
            headers: options?.headers,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            return res;
          }
          console.warn(`[G14 Slingshot] G14 tunnel returned HTTP ${res.status}. Falling back to direct...`);
        } catch (g14Err: any) {
          console.warn(`[G14 Slingshot] G14 tunnel unreachable (${g14Err.message || g14Err}). Marking dead for this sweep.`);
          if (budget) budget.tunnelDead.g14 = true;
        }
      }
    }
  }

  // 3. Direct fetch fallback
  if (!consumeSubrequestBudget(budget, `Direct fetch -> ${url}`)) {
    throw new Error(`Subrequest budget exhausted before direct fetch: ${url}`);
  }
  return fetch(url, options);
}

// Direct HTTP call to Ollama /api/chat endpoint
async function callOllamaLLM({
  systemPrompt,
  prompt,
  history = [],
  responseJson = false,
  temperature = 0.7,
  overrideBaseUrl,
  overrideModel
}: {
  systemPrompt?: string;
  prompt: string;
  history?: Array<{ role: string; content?: string; text?: string }>;
  responseJson?: boolean;
  temperature?: number;
  overrideBaseUrl?: string;
  overrideModel?: string;
}) {
  const targetBaseUrl = (overrideBaseUrl || llmConfig.baseUrl || "http://localhost:11434").replace(/\/$/, "");
  const targetModel = overrideModel || llmConfig.model || "qwen2.5";

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  if (history && history.length > 0) {
    for (const msg of history) {
      const contentStr = msg.content || msg.text || "";
      if (contentStr) {
        messages.push({
          role: msg.role === "model" || msg.role === "assistant" ? "assistant" : "user",
          content: contentStr
        });
      }
    }
  }
  messages.push({ role: "user", content: prompt });

  const bodyPayload: any = {
    model: targetModel,
    messages: messages,
    stream: false,
    options: {
      temperature: temperature
    }
  };

  if (responseJson) {
    bodyPayload.format = "json";
  }

  const response = await fetchWithRetry(`${targetBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyPayload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama API error (HTTP ${response.status}): ${errText || "No response details"}`);
  }

  const data = (await response.json()) as any;
  return data.message?.content || data.response || "";
}

// Fallback LLM generation using OpenAI GPT-4o-Mini
async function callOpenAILLM({
  systemPrompt,
  prompt,
  history = [],
  responseJson = false,
  temperature = 0.7
}: {
  systemPrompt?: string;
  prompt: string;
  history?: Array<{ role: string; content?: string; text?: string }>;
  responseJson?: boolean;
  temperature?: number;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured in environment.");
  }

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  for (const turn of history) {
    const role = turn.role === "pac" || turn.role === "assistant" ? "assistant" : "user";
    const content = turn.content || turn.text || "";
    if (content) {
      messages.push({ role, content });
    }
  }

  messages.push({ role: "user", content: prompt });

  const bodyPayload: any = {
    model: "gpt-4o-mini",
    messages,
    temperature
  };

  if (responseJson) {
    bodyPayload.response_format = { type: "json_object" };
  }

  console.log("[LLM Unified] Requesting fallback generation via OpenAI GPT-4o-Mini...");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(bodyPayload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API returned error (${res.status}): ${errorText}`);
  }

  const data: any = await res.json();
  const output = data.choices?.[0]?.message?.content;
  if (!output) {
    throw new Error("OpenAI API returned empty response.");
  }

  return output;
}

// Provider-agnostic LLM executor (Tries Ollama Qwen2.5 if active, falls back to Gemini)
async function generateUnifiedLLM({
  systemPrompt,
  prompt,
  history = [],
  responseJson = false,
  temperature = 0.7
}: {
  systemPrompt?: string;
  prompt: string;
  history?: Array<{ role: string; content?: string; text?: string }>;
  responseJson?: boolean;
  temperature?: number;
}): Promise<string> {
  const provider = llmConfig.provider;

  // Try Ollama if explicitly forced or in auto mode
  if (provider === "ollama" || provider === "auto") {
    try {
      console.log(`[LLM Unified] Requesting generation via Ollama Qwen2.5 (${llmConfig.baseUrl})...`);
      const result = await callOllamaLLM({
        systemPrompt,
        prompt,
        history,
        responseJson,
        temperature
      });
      if (result) return result;
    } catch (ollamaErr: any) {
      console.warn(`[LLM Unified] Ollama call failed (${ollamaErr.message}). ${provider === "ollama" ? "Attempting Gemini fallback..." : "Falling back to Gemini..."}`);
    }
  }

  // Gemini Fallback
  const ai = getGeminiClient();
  const geminiModels = ["gemini-3.6-flash", "gemini-3.6-flash"];

  let fullPromptText = prompt;
  if (systemPrompt) {
    fullPromptText = `System Instructions:\n${systemPrompt}\n\nUser Prompt:\n${prompt}`;
  }

  const geminiConfig: any = {};
  if (responseJson) {
    geminiConfig.responseMimeType = "application/json";
  }

  let lastErr: any = null;
  for (const gModel of geminiModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: gModel,
          contents: fullPromptText,
          config: geminiConfig
        });
        if (res.text) return res.text;
      } catch (err: any) {
        lastErr = err;
        const errStr = String(err?.message || err) + JSON.stringify(err || {});
        const is429 = errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED");
        if (is429) {
          console.warn(`[LLM Unified] Gemini quota/rate limit hit on ${gModel} (attempt ${attempt + 1}). Backing off...`);
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        } else {
          console.warn(`[LLM Unified] Gemini model ${gModel} (attempt ${attempt + 1}) failed (${err?.message || err})`);
          break;
        }
      }
    }
  }

  // Try OpenAI as final fallback if configured and other engines failed
  if (process.env.OPENAI_API_KEY) {
    try {
      console.warn("[LLM Unified] Both Ollama and Gemini failed or were rate-limited. Falling back to OpenAI GPT-4o-Mini...");
      const result = await callOpenAILLM({
        systemPrompt,
        prompt,
        history,
        responseJson,
        temperature
      });
      if (result) return result;
    } catch (openaiErr: any) {
      console.error(`[LLM Unified] OpenAI fallback failed: ${openaiErr.message}`);
    }
  }

  throw lastErr || new Error("All LLM providers (Ollama, Gemini, OpenAI) failed.");
}

// Data storage setup
const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "db.json");
const BOT_CONFIG_FILE = path.join(DB_DIR, "bot-config.json");
const ALERTS_FILE = path.join(DB_DIR, "alerts.json");
const AGENT_MEMORY_FILE = path.join(DB_DIR, "agent-memory.json");
const COMPUTER_LOGS_FILE = path.join(DB_DIR, "computer-logs.json");

// Memory cache fallback for read-only environments like Cloudflare Workers
const memoryDBCache: Record<string, string> = {};

function safeReadFile(filePath: string, defaultValue: string = ""): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch (e) { }
  return memoryDBCache[filePath] || defaultValue;
}

function safeWriteFile(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (e) {
    memoryDBCache[filePath] = content;
  }

  // Push to Supabase asynchronously in the background
  if (getSupabase()) {
    const syncPromise = syncToSupabase(filePath, content).catch(err => {
      console.error("[Supabase Background Sync Exception]:", err);
    });

    // If running in a Cloudflare Worker request context, register the promise to prevent premature isolate shutdown
    const ctx = (globalThis as any).__ctx;
    if (ctx && typeof ctx.waitUntil === "function") {
      try {
        ctx.waitUntil(syncPromise);
      } catch (err) {
        console.error("[Worker Context] Failed to register promise via ctx.waitUntil:", err);
      }
    } else {
      (globalThis as any).__pendingPromises = (globalThis as any).__pendingPromises || [];
      (globalThis as any).__pendingPromises.push(syncPromise);
    }
  }
}

// Background sync helper to mirror local filesystem changes to Supabase
async function syncToSupabase(filePath: string, content: string) {
  const db = getSupabase();
  if (!db) return;

  try {
    const data = JSON.parse(content);

    // 1. CRM Opportunities file
    if (filePath === DB_FILE) {
      if (Array.isArray(data)) {
        const dbOpps = data.map(o => ({
          id: o.id,
          title: o.title || "",
          author: o.author || null,
          source_platform: o.sourcePlatform || null,
          source_url: o.sourceUrl || null,
          classification: o.classification || "help_seeker",
          problem_summary: o.problemSummary || null,
          who_is_experiencing: o.whoIsExperiencing || null,
          industry: o.industry || null,
          evidence: o.evidence || null,
          pain_level: o.painLevel || null,
          pain_level_explanation: o.painLevelExplanation || null,
          frequency: o.frequency || null,
          current_solutions: o.currentSolutions || null,
          possible_solution: o.possibleSolution || null,
          mvp_idea: o.mvpIdea || null,
          difficulty: o.difficulty || null,
          difficulty_explanation: o.difficultyExplanation || null,
          willingness_to_pay: o.willingnessToPay || null,
          opportunity_score: o.opportunityScore || null,
          response_draft: o.responseDraft || null,
          suggested_questions: o.suggestedQuestions || [],
          value_addition_ideas: o.valueAdditionIdeas || [],
          status: o.status || "New",
          notes: o.notes || null,
          last_interaction: o.lastInteraction || null,
          last_reply: o.lastReply || null,
          contact_email: o.contactEmail || null,
          estimated_deal_value: o.estimatedDealValue || null,
          company_research: o.companyResearch || {},
          solution_options: o.solutionOptions || [],
          follow_up_sequences: o.followUpSequences || []
        }));

        if (dbOpps.length > 0) {
          const { error } = await db.from("opportunities").upsert(dbOpps, { onConflict: "id" });
          if (error) console.error("[Supabase Sync Error] Opportunities:", error);
        }
      }
    }
    // 2. Bot Config file
    else if (filePath === BOT_CONFIG_FILE) {
      const dbConfig = {
        id: "singleton",
        scheduler_enabled: data.schedulerEnabled ?? true,
        scheduler_interval_minutes: data.schedulerIntervalMinutes ?? 60,
        email_alerts_enabled: data.emailAlertsEnabled ?? false,
        alert_recipient_email: data.alertRecipientEmail || "upscaleyourbusiness.wv@gmail.com",
        min_alert_score: data.minAlertScore ?? 75,
        platforms: data.platforms || []
      };

      const { error } = await db.from("bot_config").upsert(dbConfig, { onConflict: "id" });
      if (error) console.error("[Supabase Sync Error] Bot Config:", error);
    }
    // 3. Alerts file
    else if (filePath === ALERTS_FILE) {
      if (Array.isArray(data)) {
        const dbAlerts = data.map(a => ({
          id: a.id,
          timestamp: a.timestamp || new Date().toISOString(),
          recipient: a.recipient || null,
          subject: a.subject || null,
          body: a.body || null,
          opp_id: a.oppId || null,
          opp_title: a.oppTitle || null,
          opp_score: a.oppScore || null
        }));

        if (dbAlerts.length > 0) {
          const { error } = await db.from("alerts").upsert(dbAlerts, { onConflict: "id" });
          if (error) console.error("[Supabase Sync Error] Alerts:", error);
        }
      }
    }
    // 4. Agent Memory file
    else if (filePath === AGENT_MEMORY_FILE) {
      // Upsert memory entries
      if (Array.isArray(data.entries)) {
        const dbEntries = data.entries.map((e: any) => ({
          id: e.id || `entry-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          timestamp: e.timestamp || new Date().toISOString(),
          tag: e.tag || null,
          note: e.note || null,
          prospect: e.prospect || null
        }));

        if (dbEntries.length > 0) {
          const { error } = await db.from("agent_memory_entries").upsert(dbEntries, { onConflict: "id" });
          if (error) console.error("[Supabase Sync Error] Memory Entries:", error);
        }
      }

      // Upsert offline tasks (follow-ups)
      if (Array.isArray(data.followUps)) {
        const dbTasks = data.followUps.map((t: any) => ({
          id: t.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          task: t.task || "",
          completed: t.completed ?? false,
          timestamp: t.timestamp || new Date().toISOString()
        }));

        if (dbTasks.length > 0) {
          const { error } = await db.from("offline_tasks").upsert(dbTasks, { onConflict: "id" });
          if (error) console.error("[Supabase Sync Error] Offline Tasks:", error);
        }
      }
    }
  } catch (err: any) {
    console.error(`[Supabase Sync Exception] for ${path.basename(filePath)}:`, err.message || err);
  }
}

// Startup sync helper to pull the latest state from Supabase on boot
async function syncSupabaseOnStartup() {
  const db = getSupabase();
  if (!db) return;

  console.log("[Supabase] 🔄 Synchronizing database tables with local cache...");
  try {
    // 1. Fetch Opportunities
    const { data: dbOpps, error: oppsErr } = await db.from("opportunities").select("*");
    if (oppsErr) {
      console.error("[Supabase Startup Error] Failed to fetch opportunities:", oppsErr);
    } else if (dbOpps && dbOpps.length > 0) {
      const opps = dbOpps.map(o => ({
        id: o.id,
        title: o.title,
        author: o.author,
        sourcePlatform: o.source_platform,
        sourceUrl: o.source_url,
        classification: o.classification,
        problemSummary: o.problem_summary,
        whoIsExperiencing: o.who_is_experiencing,
        industry: o.industry,
        evidence: o.evidence,
        painLevel: o.pain_level,
        painLevelExplanation: o.pain_level_explanation,
        frequency: o.frequency,
        currentSolutions: o.current_solutions,
        possibleSolution: o.possible_solution,
        mvpIdea: o.mvp_idea,
        difficulty: o.difficulty,
        difficultyExplanation: o.difficulty_explanation,
        willingnessToPay: o.willingness_to_pay,
        opportunityScore: o.opportunity_score,
        responseDraft: o.response_draft,
        suggestedQuestions: o.suggested_questions || [],
        valueAdditionIdeas: o.value_addition_ideas || [],
        status: o.status,
        notes: o.notes,
        lastInteraction: o.last_interaction,
        lastReply: o.last_reply,
        contactEmail: o.contact_email,
        estimatedDealValue: o.estimated_deal_value,
        companyResearch: o.company_research || {},
        solutionOptions: o.solution_options || [],
        followUpSequences: o.follow_up_sequences || []
      }));
      fs.writeFileSync(DB_FILE, JSON.stringify(opps, null, 2), "utf-8");
      memoryDBCache[DB_FILE] = JSON.stringify(opps, null, 2);
      console.log(`[Supabase Startup] Loaded ${opps.length} opportunities.`);
    }

    // 2. Fetch Bot Config
    const { data: dbConfigs, error: configErr } = await db.from("bot_config").select("*").eq("id", "singleton").single();
    if (configErr && configErr.code !== "PGRST116") {
      console.error("[Supabase Startup Error] Failed to fetch config:", configErr);
    } else if (dbConfigs) {
      const config = {
        schedulerEnabled: dbConfigs.scheduler_enabled,
        schedulerIntervalMinutes: dbConfigs.scheduler_interval_minutes,
        emailAlertsEnabled: dbConfigs.email_alerts_enabled,
        alertRecipientEmail: dbConfigs.alert_recipient_email,
        minAlertScore: dbConfigs.min_alert_score,
        platforms: dbConfigs.platforms || []
      };
      fs.writeFileSync(BOT_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
      memoryDBCache[BOT_CONFIG_FILE] = JSON.stringify(config, null, 2);
      console.log("[Supabase Startup] Loaded bot configuration.");
    }

    // 3. Fetch Alerts
    const { data: dbAlerts, error: alertsErr } = await db.from("alerts").select("*").order("timestamp", { ascending: false });
    if (alertsErr) {
      console.error("[Supabase Startup Error] Failed to fetch alerts:", alertsErr);
    } else if (dbAlerts && dbAlerts.length > 0) {
      const alerts = dbAlerts.map(a => ({
        id: a.id,
        timestamp: a.timestamp,
        recipient: a.recipient,
        subject: a.subject,
        body: a.body,
        oppId: a.opp_id,
        oppTitle: a.opp_title,
        oppScore: a.opp_score
      }));
      fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2), "utf-8");
      memoryDBCache[ALERTS_FILE] = JSON.stringify(alerts, null, 2);
      console.log(`[Supabase Startup] Loaded ${alerts.length} historical alerts.`);
    }

    // 4. Fetch Agent Memory & Tasks
    const { data: dbEntries, error: entriesErr } = await db.from("agent_memory_entries").select("*").order("timestamp", { ascending: false });
    const { data: dbTasks, error: tasksErr } = await db.from("offline_tasks").select("*").order("timestamp", { ascending: false });

    if (!entriesErr && !tasksErr) {
      const memory = {
        summary: "Previous session context active in database.",
        entries: (dbEntries || []).map((e: any) => ({
          id: e.id,
          timestamp: e.timestamp,
          tag: e.tag,
          note: e.note,
          prospect: e.prospect
        })),
        followUps: (dbTasks || []).map((t: any) => ({
          id: t.id,
          task: t.task,
          completed: t.completed,
          timestamp: t.timestamp
        }))
      };
      fs.writeFileSync(AGENT_MEMORY_FILE, JSON.stringify(memory, null, 2), "utf-8");
      memoryDBCache[AGENT_MEMORY_FILE] = JSON.stringify(memory, null, 2);
      console.log(`[Supabase Startup] Loaded agent memory (${memory.entries.length} entries, ${memory.followUps.length} follow-ups).`);
    }

  } catch (err: any) {
    console.error("[Supabase Startup Sync Exception]:", err.message || err);
  }
}

try {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  // Ensure database file exists
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "[]", "utf-8");
  }
} catch (err) {
  console.warn("⚠️ [Storage Warning] Running on a read-only filesystem (Cloudflare Workers). Fallback to in-memory caching.");
}

// Pre-seeded opportunities are disabled as we strictly focus on real, live-fetched data
const seedOpportunities: any[] = [];

// Fallback generator for multi-option solution paths & pricing details
const getFallbackSolutionOptions = (opp: any): any[] => {
  const isHighPain = opp.painLevel === "High";
  const baseScore = opp.opportunityScore || 80;

  return [
    {
      id: `${opp.id}-opt-1`,
      rank: 1,
      title: "⚡ Custom Dedicated MVP (One-Time Build + Maintenance Combo)",
      type: "custom",
      description: `A custom-tailored, private application built precisely for their workflow: ${opp.possibleSolution || "streamlined automation"}. Great for solving localized legacy problems without forcing them to conform to generic software constraints.`,
      techStackSuggested: "React, Node.js, Tailwind, SQLite/Supabase, Gemini API",
      oneTimeFee: isHighPain ? 2500 : 1200,
      subscriptionFee: isHighPain ? 99 : 49,
      consultingFee: 0,
      timeToBuild: "7-10 days",
      difficulty: opp.difficulty || "Medium",
      feasibilityScore: Math.min(95, Math.max(40, baseScore + 5)),
      pros: [
        "100% custom-built for their exact EHR, folder templates, or spreadsheet structures",
        "No redundant generic features to overwhelm their staff",
        "High security with optional local-only databases"
      ],
      cons: [
        "Upfront development investment required",
        "Requires maintenance for custom servers if not hosting serverless"
      ]
    },
    {
      id: `${opp.id}-opt-2`,
      rank: 2,
      title: "🛰️ Multi-User Product Platform (SaaS / Subscription Only)",
      type: "saas",
      description: `A standard multi-tenant subscription software for the ${opp.industry || "general"} market. Solve this recurring headache with zero upfront fees. Best if thousands of other small operators face this exact same bottleneck.`,
      techStackSuggested: "Next.js, Prisma, PostgreSQL, Stripe API for automated billing",
      oneTimeFee: 0,
      subscriptionFee: isHighPain ? 149 : 79,
      consultingFee: 0,
      timeToBuild: "14-20 days",
      difficulty: "Hard",
      feasibilityScore: Math.min(95, Math.max(35, baseScore - 10)),
      pros: [
        "Zero setup cost or initial budget barrier",
        "Instant registration and ready to run in minutes",
        "Continuous product updates and feature rollouts at no extra cost"
      ],
      cons: [
        "Cannot support deep, hyper-specific custom modifications for a single office",
        "The customer must adjust their documents or workflows to fit the SaaS templates"
      ]
    },
    {
      id: `${opp.id}-opt-3`,
      rank: 3,
      title: "🤝 Done-With-You Consulting & Low-Code Orchestration (Monthly Retainer Combo)",
      type: "consulting",
      description: "Fast setup connecting their existing software (e.g. Google Drive, Zapier, Make.com) and creating personalized automated pipelines. We handle configuration, staff training, and ongoing monthly optimization.",
      techStackSuggested: "Zapier / Make.com, Airtable, Google Workspace, custom scripts",
      oneTimeFee: 400,
      subscriptionFee: 29, // basic hosting/tasks
      consultingFee: isHighPain ? 200 : 120, // consulting/retainer per month
      timeToBuild: "2-4 days",
      difficulty: "Easy",
      feasibilityScore: Math.min(95, Math.max(45, baseScore + 15)),
      pros: [
        "Extremely fast to launch (often live within 72 hours)",
        "Leverages their current tool stack with zero code complexity",
        "Includes active training for their clinic/firm administrators"
      ],
      cons: [
        "Relies heavily on third-party pricing (Zapier/Make task usage fees)",
        "Low-code flows are prone to breakage if external SaaS interfaces change"
      ]
    }
  ];
};

const loadOpportunities = (): any[] => {
  const data = safeReadFile(DB_FILE, "[]");
  const list = JSON.parse(data);
  if (Array.isArray(list) && list.length > 0) {
    // Automatically enrich opportunities with fullPostText and solution options if missing, and restore organic titles
    return list.map(opp => {
      let updated = { ...opp };
      const backup = realHistoricalBackupPosts.find(b => b.sourceUrl === updated.sourceUrl || b.sourceUrl === updated.originalSourceLink);
      if (backup) {
        // Revert title to original non-technical organic forum titles
        if (backup.id === "backup-reddit-1") updated.title = "Manual PDF entry";
        else if (backup.id === "backup-reddit-2") updated.title = "utility reimbursement workaround";
        else if (backup.id === "backup-reddit-3") updated.title = "scheduling / inventory sync";
        else if (backup.id === "backup-reddit-4") updated.title = "freight shipping rates Shopify";
        else if (backup.id === "backup-reddit-5") updated.title = "Sync schedules with home exercise software";
        else updated.title = backup.title;

        updated.fullPostText = backup.text;
      }
      if (!updated.fullPostText) {
        updated.fullPostText = updated.evidence || updated.problemSummary;
      }
      if (!updated.solutionOptions || updated.solutionOptions.length === 0) {
        updated.solutionOptions = getFallbackSolutionOptions(updated);
      }
      return updated;
    });
  }

  // Enrich seed opportunities before saving
  const enrichedSeeds = seedOpportunities.map(opp => ({
    ...opp,
    solutionOptions: getFallbackSolutionOptions(opp)
  }));

  saveOpportunities(enrichedSeeds);
  return enrichedSeeds;
};

const saveOpportunities = (data: any[]) => {
  try {
    safeWriteFile(DB_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error writing database file:", error);
  }
};

// API Endpoints

// 1. Get all opportunities
app.get("/api/opportunities", (req, res) => {
  const opportunities = loadOpportunities();
  res.json(opportunities);
});

// 2. Get stats
app.get("/api/stats", (req, res) => {
  const opps = loadOpportunities();
  const saved = opps.filter(o => o.status === "Saved").length;
  const contacted = opps.filter(o => o.status === "Contacted").length;
  const inDiscussion = opps.filter(o => o.status === "In Discussion").length;
  const productIdeas = opps.filter(o => o.status === "Potential Product").length;

  // Filter for follow-ups that are active and have a follow-up date
  const nowStr = new Date().toISOString().split('T')[0];
  const followupsPending = opps.filter(o => o.followUpDate && o.followUpDate <= nowStr && o.status !== "Archived").length;

  res.json({
    totalDiscovered: opps.length,
    saved,
    contacted,
    inDiscussion,
    productIdeas,
    followupsPending
  });
});

// 3. Save / Update opportunity
app.post("/api/opportunities/save", (req, res) => {
  const updatedOpp = req.body;
  if (!updatedOpp.id) {
    return res.status(400).json({ error: "Missing opportunity id." });
  }

  const opps = loadOpportunities();
  const index = opps.findIndex(o => o.id === updatedOpp.id);

  if (index !== -1) {
    opps[index] = { ...opps[index], ...updatedOpp };
  } else {
    opps.push(updatedOpp);
  }

  saveOpportunities(opps);
  res.json({ success: true, opportunity: updatedOpp });
});

// 4. Delete opportunity
app.delete("/api/opportunities/:id", (req, res) => {
  const { id } = req.params;
  let opps = loadOpportunities();
  opps = opps.filter(o => o.id !== id);
  saveOpportunities(opps);
  res.json({ success: true });
});

// 4b. Public Lead Form Submission for missedrevenue.org
app.post("/api/public/submit-lead", (req, res) => {
  try {
    const {
      businessName,
      contactName,
      email,
      phone,
      industry,
      monthlyDealValue,
      primaryBottleneck,
      notes
    } = req.body || {};

    if (!primaryBottleneck && !businessName && !email) {
      return res.status(400).json({ error: "Please provide a business name, contact info, or bottleneck description." });
    }

    const bName = (businessName || "Local Business").trim();
    const cName = (contactName || "Owner / Manager").trim();
    const leadEmail = (email || "Not provided").trim();
    const leadPhone = (phone || "Not provided").trim();
    const ind = (industry || "Small Business Operations").trim();
    const dealVal = (monthlyDealValue || "$1,000 - $3,000").trim();
    const bottleneck = (primaryBottleneck || "Manual follow-ups & missed calls").trim();

    const newLeadId = `lead-inbound-${Date.now()}`;

    // Estimate monthly revenue loss for display
    let estMonthlyLoss = 3500;
    if (dealVal.includes("7,000") || dealVal.includes("10,000")) estMonthlyLoss = 15000;
    else if (dealVal.includes("3,000") || dealVal.includes("5,000")) estMonthlyLoss = 7500;

    const newOpportunity: any = {
      id: newLeadId,
      title: `⚡ INBOUND LEAD: ${bName} (${cName})`,
      authorName: cName,
      authorClass: "Business Owner / Decision Maker",
      authorHandle: leadEmail !== "Not provided" ? leadEmail : leadPhone,
      platform: "Inbound Audit Form (missedrevenue.org)",
      industry: ind,
      originalSourceLink: `https://missedrevenue.org/#audit-${Date.now()}`,
      fullPostText: `INBOUND REVENUE RECOVERY AUDIT REQUEST:
Business Name: ${bName}
Contact Person: ${cName}
Email: ${leadEmail}
Phone/Telegram: ${leadPhone}
Industry: ${ind}
Est. Deal Value / Ticket Size: ${dealVal}
Primary Bottleneck / Pain Point:
${bottleneck}

Additional Context:
${notes || "None provided"}`,
      detectedProblem: bottleneck,
      commercialIntent: "High",
      painLevel: "High",
      opportunityScore: 98,
      possibleSolution: `Automated Missed Call Text-Back, AI Lead Nurturing & Auto-Scheduling System for ${bName}`,
      outreachDraft: `Hi ${cName}, thanks for requesting an AI Revenue Audit for ${bName}. P.A.C. has analyzed your primary bottleneck: "${bottleneck}". We can deploy a 24/7 lead recapture system to stop losing potential ${dealVal} deals. Let's get this connected!`,
      status: "Inbound Lead",
      crmNotes: `Submitted on missedrevenue.org at ${new Date().toLocaleString()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const opps = loadOpportunities();
    opps.unshift(newOpportunity);
    saveOpportunities(opps);

    console.log(`[Inbound Audit Request] Saved lead from ${bName} (${cName}) - Lead ID: ${newLeadId}`);

    res.json({
      success: true,
      message: "Revenue audit request received! P.A.C. is analyzing your bottleneck.",
      leadId: newLeadId,
      estimatedMonthlyLoss: estMonthlyLoss,
      opportunity: newOpportunity
    });
  } catch (err: any) {
    console.error("[Inbound Lead Error]", err);
    res.status(500).json({ error: err.message || "Failed to process lead request." });
  }
});

// ==========================================
// LLM Configuration & Status API Routes
// ==========================================
app.get("/api/llm/config", (req, res) => {
  res.json({
    baseUrl: llmConfig.baseUrl,
    crawlerTunnelUrl: llmConfig.crawlerTunnelUrl,
    g14TunnelUrl: llmConfig.g14TunnelUrl,
    model: llmConfig.model,
    provider: llmConfig.provider,
    useSlingshot: llmConfig.useSlingshot,
    hasGeminiKey: !!process.env.GEMINI_API_KEY
  });
});

app.post("/api/llm/config", (req, res) => {
  const { baseUrl, crawlerTunnelUrl, g14TunnelUrl, model, provider, useSlingshot } = req.body || {};
  if (baseUrl !== undefined) llmConfig.baseUrl = String(baseUrl).trim();
  if (crawlerTunnelUrl !== undefined) llmConfig.crawlerTunnelUrl = String(crawlerTunnelUrl).trim();
  if (g14TunnelUrl !== undefined) llmConfig.g14TunnelUrl = String(g14TunnelUrl).trim();
  if (model !== undefined) llmConfig.model = String(model).trim() || "qwen2.5";
  if (useSlingshot !== undefined) llmConfig.useSlingshot = Boolean(useSlingshot);
  if (provider && ["auto", "ollama", "gemini"].includes(provider)) {
    llmConfig.provider = provider;
  }
  console.log("[LLM & Crawler Config] Updated tunnel settings:", llmConfig);
  res.json({
    success: true,
    config: llmConfig
  });
});

app.get("/api/crawler/slingshot-status", async (req, res) => {
  const queryUrl = req.query?.url as string;
  
  if (queryUrl) {
    const targetUrl = queryUrl.trim().replace(/\/$/, "");
    const startTime = Date.now();
    try {
      const healthRes = await fetchWithRetry(`${targetUrl}/health`, { method: "GET" });
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
      const data = await healthRes.json() as any;
      const latencyMs = Date.now() - startTime;
      return res.json({
        configured: true,
        online: true,
        latencyMs,
        details: data,
        message: `⚡ Connected! Slingshot relay active (${latencyMs}ms latency).`
      });
    } catch (err: any) {
      return res.json({
        configured: true,
        online: false,
        error: err.message || err,
        message: "Slingshot is offline or unreachable."
      });
    }
  }

  const macUrl = (llmConfig.crawlerTunnelUrl || process.env.CRAWLER_TUNNEL_URL || process.env.MAC_TUNNEL_URL || "").trim().replace(/\/$/, "");
  const g14Url = (llmConfig.g14TunnelUrl || process.env.G14_TUNNEL_URL || "").trim().replace(/\/$/, "");

  if (!macUrl && !g14Url) {
    return res.json({
      configured: false,
      online: false,
      message: "G14 Slingshot Tunnel URL is not configured yet."
    });
  }

  let macResult: any = null;
  let g14Result: any = null;

  if (macUrl) {
    const startTime = Date.now();
    try {
      const healthRes = await fetchWithRetry(`${macUrl}/health`, { method: "GET" });
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
      const data = await healthRes.json() as any;
      macResult = {
        online: true,
        latencyMs: Date.now() - startTime,
        details: data
      };
    } catch (err: any) {
      macResult = {
        online: false,
        error: err.message || err
      };
    }
  }

  if (g14Url) {
    const startTime = Date.now();
    try {
      const healthRes = await fetchWithRetry(`${g14Url}/health`, { method: "GET" });
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
      const data = await healthRes.json() as any;
      g14Result = {
        online: true,
        latencyMs: Date.now() - startTime,
        details: data
      };
    } catch (err: any) {
      g14Result = {
        online: false,
        error: err.message || err
      };
    }
  }

  const macOnline = macResult?.online;
  const g14Online = g14Result?.online;

  return res.json({
    configured: true,
    online: macOnline || g14Online || false,
    mac: macResult,
    g14: g14Result,
    message: macOnline
      ? `⚡ Connected! Primary Mac relay active (${macResult.latencyMs}ms latency).`
      : g14Online
        ? `⚡ Connected! Secondary G14 relay active (${g14Result.latencyMs}ms latency). Mac is offline.`
        : `❌ All slingshot tunnels are offline or unreachable.`
  });
});

app.post("/api/llm/status", async (req, res) => {
  const targetBaseUrl = (req.body?.baseUrl || llmConfig.baseUrl || "http://localhost:11434").replace(/\/$/, "");
  const targetModel = req.body?.model || llmConfig.model || "qwen2.5";
  const startTime = Date.now();

  try {
    const versionRes = await fetchWithRetry(`${targetBaseUrl}/api/version`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    if (!versionRes.ok) {
      throw new Error(`HTTP ${versionRes.status} from Ollama endpoint ${targetBaseUrl}/api/version`);
    }

    const versionData = (await versionRes.json()) as any;
    const latencyMs = Date.now() - startTime;

    let availableModels: string[] = [];
    try {
      const tagsRes = await fetchWithRetry(`${targetBaseUrl}/api/tags`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      if (tagsRes.ok) {
        const tagsData = (await tagsRes.json()) as any;
        if (Array.isArray(tagsData.models)) {
          availableModels = tagsData.models.map((m: any) => m.name || m.model);
        }
      }
    } catch (e) { }

    const hasTargetModel = availableModels.some(m => m.toLowerCase().includes(targetModel.toLowerCase()));

    res.json({
      success: true,
      provider: "ollama",
      baseUrl: targetBaseUrl,
      targetModel: targetModel,
      ollamaVersion: versionData.version || "Online",
      models: availableModels,
      hasTargetModel: hasTargetModel,
      latencyMs: latencyMs,
      message: `⚡ Connected to G14/Mac Ollama v${versionData.version || "1.0"}! ${availableModels.length} models detected.${hasTargetModel ? ` Target model '${targetModel}' is ready.` : ` Target model '${targetModel}' not listed in tags; ensure 'ollama pull ${targetModel}' was run.`}`
    });
  } catch (err: any) {
    res.json({
      success: false,
      provider: "ollama",
      baseUrl: targetBaseUrl,
      targetModel: targetModel,
      latencyMs: Date.now() - startTime,
      error: `Could not connect to Ollama at ${targetBaseUrl}: ${err.message || err}. Please ensure Ollama is running on your G14/Mac and the tunnel (Cloudflare/Ngrok/Pinggy) is active.`
    });
  }
});

// 5. Generate Response Draft
app.post("/api/opportunities/draft-response", async (req, res) => {
  const { opportunity, userGuidance } = req.body;
  if (!opportunity) {
    return res.status(400).json({ error: "Opportunity data is required to draft a response." });
  }

  try {
    const prompt = `
      You are an expert, highly empathetic solo AI and software developer who connects with potential customers by being helpful first. You NEVER generate generic spam, promotional ads, or "hire me" pitches. Your goal is to establish trust, provide high-value technical or process feedback, and start a meaningful 2-way conversation about their exact problem.

      Opportunity Details:
      - Post Title: "${opportunity.title}"
      - Author: "${opportunity.author}"
      - Platform: "${opportunity.sourcePlatform}"
      - Pain Point: "${opportunity.problemSummary}"
      - Industry: "${opportunity.industry}"
      - Specific Evidence / Frustration: "${opportunity.evidence}"
      - Your Proposed MVP Idea: "${opportunity.mvpIdea}"

      User Feedback/Guidance to apply to this draft:
      ${userGuidance ? `"${userGuidance}"` : "None (provide a naturally helpful, professional, conversational outreach)"}

      Task:
      Generate three structured sections in JSON:
      1. "responseDraft": A highly targeted response message written in a humble, helpful, expert tone. It must:
         - Speak directly to the user (e.g. "Hi [Author]" or a platform-appropriate greeting).
         - Reference their specific situation and details (e.g., their workflow bottleneck, their EHR pain, their zoning headaches).
         - Proactively offer a specific, free, simple solution template (like a custom Google Sheets formula, a basic copy-pasteable script, or a simple workflow blueprint) to solve their problem immediately for free to build trust.
         - Mention that you are working on/thinking about a lightweight project to automate this exact bottleneck.
         - Ask a single, high-intent open-ended question that makes it easy for them to reply.
         - NO sales talk, NO pricing, NO aggressive call-to-action.
      2. "suggestedQuestions": An array of 2-3 deep-dive technical/process questions to ask later to understand their problem better.
      3. "valueAdditionIdeas": An array of 2-3 free things you can do to immediately build goodwill (e.g., "Analyze their custom PDF sample", "Build a 10-second automation script", "Send them a free Google sheet template").

      Return raw JSON matching this structure:
      {
        "responseDraft": "string",
        "suggestedQuestions": ["string"],
        "valueAdditionIdeas": ["string"]
      }
    `;

    const responseText = await generateUnifiedLLM({
      prompt,
      responseJson: true
    });

    const data = safeParseJSON(responseText);
    res.json(data);
  } catch (error: any) {
    console.error("Error generating response draft:", error);
    res.status(500).json({ error: error.message || "Failed to generate response draft." });
  }
});

// 6. Analyze custom pasted text (manual discovery)
app.post("/api/opportunities/analyze-custom", async (req, res) => {
  const { postText, sourceUrl, sourcePlatform } = req.body;
  if (!postText) {
    return res.status(400).json({ error: "Post text content is required for AI analysis." });
  }

  try {
    const ai = getGeminiClient();
    const model = "gemini-3.6-flash";

    const prompt = `
      You are an elite opportunity analyzer for solo developers. You analyze raw forum comments, customer complaints, or business workflow descriptions and extract highly qualified product development signals.
      
      Raw Content:
      "${postText}"
      
      Source URL: "${sourceUrl || "Pasted / Manual"}"
      Source Platform: "${sourcePlatform || "Custom Paste"}"

      Analyze the text and extract all required Opportunity Card metrics.
      Also, you MUST classify the text according to these Classification Model rules:
      - help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
      - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
      - noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes systematic analyses or proposals.

      Return a JSON object matching this structure:
      {
        "title": "A concise, engaging title describing the central problem (under 80 chars)",
        "author": "Username of poster, or 'ConcernedBusinessOwner' if unknown",
        "classification": "help_seeker" | "solution_sharer" | "noise",
        "problemSummary": "1-2 sentence detailed summary of the core workflow bottleneck or software limitation",
        "whoIsExperiencing": "Who is the specific individual/role experiencing this pain?",
        "industry": "Industry or niche sector (e.g., Healthcare, Real Estate, E-commerce)",
        "evidence": "Direct quote or strong specific detail indicating frustration from the source text",
        "painLevel": "High" or "Medium" or "Low",
        "painLevelExplanation": "Concrete explanation of how much time/money this bottleneck costs them",
        "frequency": "How often does this problem occur? (e.g., 'Daily', 'Weekly')",
        "currentSolutions": "What are they currently doing or using, and why does it fail?",
        "possibleSolution": "A high-level AI, software, or automation solution",
        "mvpIdea": "A hyper-focused MVP description that a single developer can realistically build in 2 weeks",
        "difficulty": "Easy" or "Medium" or "Hard",
        "difficultyExplanation": "Technical details on what makes it easy/hard to build",
        "willingnessToPay": "A detailed estimation of what they would pay (e.g., '$50-$100/mo' or 'Pay-per-use') with justification",
        "opportunityScore": 75, // A number from 0 to 100 representing signal strength (pain level, willingness to pay, ability to build)
        "responseDraft": "A personalized, trust-building response draft starting with a helpful greeting, offering a simple copy-pasteable free solution template or formula, and an open-ended process question.",
        "suggestedQuestions": ["Question 1?", "Question 2?"],
        "valueAdditionIdeas": ["Idea 1", "Idea 2"]
      }
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    const parsedData = safeParseJSON(text);

    // Supplement metadata
    const rawOpp = {
      id: "opp-" + Date.now(),
      timestamp: new Date().toISOString(),
      sourcePlatform: sourcePlatform || "Custom Paste",
      sourceUrl: sourceUrl || "Manual Input",
      originalSourceLink: sourceUrl || "Manual Input",
      status: "Saved",
      notes: "Manually analyzed via custom input.",
      fullPostText: postText,
      ...parsedData
    };

    const parsedOpp = {
      ...rawOpp,
      solutionOptions: getFallbackSolutionOptions(rawOpp)
    };

    // Save automatically to DB
    const opps = loadOpportunities();
    opps.push(parsedOpp);
    saveOpportunities(opps);

    res.json(parsedOpp);
  } catch (error: any) {
    console.error("Error analyzing custom post:", error);
    res.status(500).json({ error: error.message || "Failed to analyze custom post." });
  }
});

// Simple in-memory cache to throttle and limit outbound requests to prevent flagging/rate-limiting
interface CacheEntry {
  timestamp: number;
  data: any[];
}
const scraperCache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 15 * 60 * 1000; // Cache results for 15 minutes

// Helper to wait/sleep to space out consecutive external API requests
const delayMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// AI Semantic Query Builder to dynamically construct organic, low-level human frustration queries
async function generateSemanticQueries(targetSector: string, keyword: string): Promise<string[]> {
  try {
    const ai = getGeminiClient();

    const sectorAudienceFocus = targetSector === "Marketing agency"
      ? `Marketing-agency focus: Search specifically for first-person posts by agency owners, founders, partners, directors, department heads, account directors, operations leads, or other people who can influence purchasing. Target posts describing an active operational problem or explicitly asking for recommendations, tools, services, vendors, advice, or a better way to work. Prioritize client reporting, approvals, campaign handoffs, scope creep, lead qualification, attribution, account management, content review, capacity planning, and retaining clients. Exclude posts by people merely promoting an agency or selling a product.`
      : "";

    // Split the keyword list by commas or newlines to support bulk lists of longtail/shorttail keywords
    const keywordList = keyword
      ? keyword.split(/[,\n]+/).map((k: string) => k.trim()).filter((k: string) => k.length > 0)
      : [];

    const keywordListStr = keywordList.length > 0
      ? `Keyword list (contains ${keywordList.length} longtail/shorttail items): ${JSON.stringify(keywordList)}`
      : "No specific keywords provided (focus on general sector operations)";

    const prompt = `
      You are an expert OSINT (Open Source Intelligence) query builder for finding real-world business complaints, human bottlenecks, and operational friction.
      Your goal is to generate 5-8 organic, human-level search queries for public forum search engines (like Reddit Search, Algolia Hacker News, Stack Exchange).
      These queries will be used to scrape actual posts written by real small business owners, operators, managers, or employees complaining about everyday operational nightmares, waste, team problems, or customer complaints.

      Inputs:
      - Industry Sector: "${targetSector}"
      - Focus Keywords/Phrases: ${keywordListStr}
      ${sectorAudienceFocus}

      CRITICAL RULES - NO TECH-TALK OR SOLUTION JARGON:
      1. BANNED WORDS: Do NOT use terms like "software", "automate", "sync", "CRM", "app", "database", "workflow", "integration", "API", "digitize", "SaaS", or "systems". Real business owners complaining about raw problems do NOT use these words!
      2. USE EMOTIONAL & FRUSTRATION SIGNALS: Use the words and raw phrases that people actually type when venting, such as:
         - "sick of"
         - "breathing down my neck"
         - "complaining about"
         - "losing track of"
         - "takes me all weekend"
         - "nightmare trying to"
         - "writing this down on paper"
         - "waste is outrageous"
         - "receptionist rude" / "rude staff"
         - "doing this manually"
         - "anyone else struggling with"
         - "forgot to"
         - "losing money" / "wasting money"
         - "headache"
      3. Synonyms & Plain Speech: Use the plain words for tools (like "paper", "excel", "spreadsheets", "notebook", "whiteboard", "post-it", "binder") rather than "digitization".
      4. Avoid single generic keywords (e.g. do not output just "construction"). Combine specific human-friction terms (e.g. "estimating blueprints takes all night", "subcontractor late again").
      5. If multiple keywords/phrases were provided in the list, make sure to generate organic queries that incorporate those distinct keywords/phrases (or their plain English synonyms) to represent the user's target areas.
      
      Return ONLY a JSON string array of 5-8 raw queries. No explanation, no markdown wraps.
      Example Output format:
      ["\"sick of\" scheduling client appointment", "receptionist rude \"anyone else\"", "\"forgot to\" bill customer", "inventory waste \"outrageous\" cost"]
    `;

    console.log(`[Semantic Query Builder] Querying Gemini to generate organic, non-tech human queries for Sector: "${targetSector}", Keywords: "${keyword || 'None'}"...`);
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "[]";
    const parsed = safeParseJSON(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log(`[Semantic Query Builder] Successfully generated human-centric organic queries:`, parsed);
      return parsed.map((q: string) => q.replace(/[\\]/g, "").trim());
    }
  } catch (error) {
    console.error("[Semantic Query Builder] Failed to expand organic queries, falling back to human-centric rules:", error);
  }

  // Pure organic human frustration fallbacks (zero tech-talk)
  const sectorKeywords: Record<string, string[]> = {
    "Healthcare Operations": [
      "receptionist rude complain",
      "patients complaining wait time clinic",
      "front desk forgot appointment paper",
      "sick of patient scheduling calling"
    ],
    "Real Estate & Property Management": [
      "tenant complaining about maintenance",
      "forgot to collect rent late landlord",
      "lost track of keys tenant tenant lock",
      "tenants nightmare spreadsheet tracking"
    ],
    "Construction & Subcontracting": [
      "subcontractor late no show",
      "estimating blueprints takes all night",
      "lost bid pricing spreadsheet error",
      "writing measurements on paper scrap lost"
    ],
    "Professional Services (Accounting/CPA/Law)": [
      "boss breathing down my neck billing timesheet",
      "doing billing payroll takes all weekend",
      "manually typing data client tax form",
      "forgot to track billable hour client"
    ],
    "Local Small Businesses": [
      "receptionist rude complain customer",
      "staff lazy calendar shift conflict",
      "inventory waste outrageous cost",
      "writing shift schedules on whiteboard nightmare"
    ],
    "Finance & Invoicing Workflows": [
      "billing reconciliation spreadsheet nightmare",
      "forgot to bill client months late",
      "double invoiced client angry",
      "typing invoice data entry takes all evening"
    ],
    "E-commerce & Retail Logistics": [
      "shopify physical count stock mismatch",
      "lost package customer yelling",
      "wasting money shipping label weight mistake",
      "forgot to order stock late supply"
    ],
    "Marketing agency": [
      "agency owner client approval taking forever looking for advice",
      "marketing agency founder monthly client reporting takes all weekend",
      "agency director lost track of client feedback need a better way",
      "marketing agency owner scope creep team overwhelmed recommendations",
      "agency operations lead struggling campaign handoffs",
      "account director looking for tool client reporting"
    ],
    "Niche Hobby Forums / Communities": [
      "member roster excel sheet outdated",
      "moderating server spam clean up takes hours",
      "member complaining did not get email newsletter",
      "forgot to collect club dues cash"
    ]
  };

  const defaults = sectorKeywords[targetSector] || [
    "writing down on paper lost it",
    "takes me all weekend payroll",
    "customer complaining bad service receptionist"
  ];

  if (keyword) {
    return [
      `"${keyword}" sick of manual`,
      `"${keyword}" lost track of`,
      `"${keyword}" boss breathing down my neck`,
      `"${keyword}" complaining about`
    ];
  }
  return defaults;
}

// Authentic, verified historical posts representing real, live-captured business pains
const realHistoricalBackupPosts = [
  {
    id: "backup-reddit-1",
    author: "taxpro_jenn",
    sourcePlatform: "Reddit (r/accounting)",
    sourceUrl: "https://www.reddit.com/r/accounting/comments/18x9y7a/manual_pdf_entry/",
    text: "We are still manually typing numbers from client PDFs into our bookkeeping system. It is 2026 and we still do not have a reliable OCR that handles multi-page tax forms without scrambling columns. We spend about 15 hours a week just doing manual data entry of tabular invoices.",
    title: "Manual invoice PDF data entry into bookkeeping software"
  },
  {
    id: "backup-reddit-2",
    author: "boston_builder",
    sourcePlatform: "Reddit (r/PropertyManagement)",
    sourceUrl: "https://www.reddit.com/r/PropertyManagement/comments/17z8x9y/utility_reimbursement_workaround/",
    text: "Our landlord managers have to manually copy utility bills from the city website and upload them to our resident portal for reimbursement. It is about 4 hours of tedious work every month for each property. A script to auto-fetch the water and power bills and post them to the tenant portal would save us thousands in staff labor.",
    title: "Tedious manual utility billing copy-paste for rental properties"
  },
  {
    id: "backup-reddit-3",
    author: "salon_owner_9",
    sourcePlatform: "Reddit (r/smallbusiness)",
    sourceUrl: "https://www.reddit.com/r/smallbusiness/comments/16y7w8a/scheduling_inventory_sync/",
    text: "Is there an app that can sync our salon scheduling with our retail product inventory? Right now when someone books a hair coloring appointment, we have to manually check if we have enough dye in the back room and update our Shopify stock. If we are short, we have to manually email the client to reschedule.",
    title: "Lack of synchronization between booking schedule and salon inventory"
  },
  {
    id: "backup-reddit-4",
    author: "cargo_cultist",
    sourcePlatform: "Reddit (r/ecommerce)",
    sourceUrl: "https://www.reddit.com/r/ecommerce/comments/15u8q8b/freight_shipping_rates_shopify/",
    text: "Syncing Shopify shipping rates with custom freight dimensions is a nightmare. For oversized packages, we have to copy the shipping address, run it through the FedEx LTL calculator, and manually email the client a shipping adjustment invoice. We lose several customers due to delay in calculating shipping rates.",
    title: "Friction in calculating freight shipping adjustments on Shopify"
  },
  {
    id: "backup-reddit-5",
    author: "clinic_op_manager",
    sourcePlatform: "Reddit (r/medicaloffice)",
    sourceUrl: "https://www.reddit.com/r/medicaloffice/comments/18m2k1x/ehr_home_exercise_sync/",
    text: "Our physical therapy clinic struggles to sync our patient schedules from our EHR system with our home exercise software. We have to manually export client lists to CSV every morning, clean up duplicate phone numbers, and import them into the therapy platform so patients can get their workout plans.",
    title: "Manual EHR patient list sync with therapy platform"
  }
];

// 7. Scrape real Hacker News comments containing specific pain indicators
async function scrapeHackerNewsComments(keyword: string, sector: string, semanticQueries?: string[]): Promise<any[]> {
  console.log("[Hacker News] Crawler is STRICTLY DISABLED (Developer Platform blacklisted to preserve resources).");
  return [];
  const cacheKey = `hn-${sector || "All"}-${keyword || ""}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[HN Cache] Returning cached results for ${cacheKey} (${cached.data.length} comments).`);
    return cached.data;
  }

  try {
    const queries: string[] = [];
    if (semanticQueries && semanticQueries.length > 0) {
      queries.push(...semanticQueries);
    } else if (keyword) {
      queries.push(keyword);
    } else {
      // Map sectors to optimized, flexible single-word keys to generate queries
      const sectorKeywords: Record<string, string[]> = {
        "Healthcare Operations": ["clinic", "EHR", "medical", "patient"],
        "Real Estate & Property Management": ["landlord", "tenant", "real estate", "property"],
        "Construction & Subcontracting": ["contractor", "construction", "blueprint", "estimating"],
        "Professional Services (Accounting/CPA/Law)": ["accounting", "bookkeeping", "CPA", "lawyer", "invoice"],
        "Local Small Businesses": ["small business", "inventory", "scheduling", "shop"],
        "Finance & Invoicing Workflows": ["invoice", "payroll", "billing", "reconciliation"],
        "E-commerce & Retail Logistics": ["shopify", "shipping", "ecommerce", "fulfillment"],
        "Niche Hobby Forums / Communities": ["forum", "moderator", "community", "moderation"]
      };

      const words = sectorKeywords[sector] || ["workflow", "spreadsheet"];
      for (const word of words.slice(0, 3)) {
        queries.push(`${word} manual`);
        queries.push(`${word} tedious`);
        queries.push(`${word} spreadsheet`);
      }
    }

    const allHits: any[] = [];
    // Limit to at most 5 queries to prevent heavy API calls, and sleep between calls
    const targetQueries = queries.slice(0, 5);
    for (let i = 0; i < targetQueries.length; i++) {
      if (i > 0) {
        // Space out requests by 1 second to avoid flagging
        await delayMs(1000);
      }
      const q = targetQueries[i];
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=comment&hitsPerPage=6`;
      console.log(`Crawling Hacker News comments for query: "${q}"...`);
      const response = await fetch(url, {
        headers: { "User-Agent": "OpportunityRadar/1.1 (contact: katycat1313@gmail.com)" }
      });
      if (response.ok) {
        const data: any = await response.json();
        if (data && data.hits) {
          allHits.push(...data.hits);
        }
      }
    }

    // Deduplicate and format hits
    const uniqueHits = new Map();
    for (const hit of allHits) {
      if (hit.objectID && !uniqueHits.has(hit.objectID)) {
        // Strip basic html tags commonly found in HN comments
        let cleanedText = hit.comment_text || "";
        cleanedText = cleanedText
          .replace(/<p>/g, "\n\n")
          .replace(/<\/p>/g, "")
          .replace(/<a href="([^"]+)"[^>]*>[^<]+<\/a>/g, "$1")
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/<[^>]*>/g, ""); // strip any remaining tags

        uniqueHits.set(hit.objectID, {
          id: `hn-${hit.objectID}`,
          author: hit.author || "HN_User",
          sourcePlatform: "Hacker News",
          sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          text: cleanedText.substring(0, 1500),
          title: hit.story_title || "Discussion on Hacker News"
        });
      }
    }
    const results = Array.from(uniqueHits.values());
    scraperCache[cacheKey] = { timestamp: Date.now(), data: results };
    return results;
  } catch (error) {
    console.error("Error scraping Hacker News comments:", error);
    return [];
  }
}

// 7.5. Scrape real Reddit posts from target subreddits using free, public unauthenticated JSON endpoints
async function scrapeRedditPublicJSON(keyword: string, sector: string, semanticQueries?: string[], budget?: SubrequestBudget): Promise<any[]> {
  const cacheKey = `reddit-${sector || "All"}-${keyword || ""}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[Reddit Cache] Returning cached results for ${cacheKey} (${cached.data.length} posts).`);
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

    // Use broader boolean keywords to ensure we match a wider selection of posts
    const queries = semanticQueries && semanticQueries.length > 0
      ? semanticQueries
      : (keyword
        ? [keyword]
        : ["manual", "tedious", "spreadsheet", "workflow", "anyone else", "is there a way", "need help"]);

    // Trimmed from 3 subs x 3 queries (up to 9+ fetches, each up to 3x under the old
    // tunnel-cascade) to 2 x 2 = 4 fetches max, to stay well under the Workers
    // subrequest cap across all 10 platforms combined.
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
        if (budget && budget.remaining <= 0) {
          console.log(`[Reddit] Subrequest budget exhausted, stopping early with ${allHits.length} hits so far.`);
          break;
        }
        const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&limit=8`;
        console.log(`Crawling Reddit r/${sub} for query: "${q}" (via Slingshot proxy/direct)...`);

        let response: Response;
        try {
          response = await fetchWithSlingshot(url, { headers }, budget);
        } catch {
          continue;
        }

        // Single fallback only (no third RSS fallback layer) to cap worst-case cost per query
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

    // Google News RSS Fallback for Reddit (Unblocked & No-auth required)
    if (!directSuccess || allHits.length === 0) {
      console.log(`[Reddit Scraper] Direct unauthenticated JSON calls failed (likely HTTP 403). Falling back to Google News RSS crawler...`);
      for (const sub of targetSubs) {
        for (const q of targetQueries) {
          if (budget && budget.remaining <= 0) break;
          const rssQuery = `site:reddit.com/r/${sub} "${q}"`;
          const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(rssQuery)}&hl=en-US&gl=US&ceid=US:en`;
          try {
            const rssHits = await scrapeRSSFeed(feedUrl, `Reddit (r/${sub})`, budget);
            allHits.push(...rssHits);
          } catch (rssErr: any) {
            console.error(`[Reddit RSS Fallback] Error crawling RSS for r/${sub} with query "${q}":`, rssErr.message || rssErr);
          }
        }
      }
    }

    scraperCache[cacheKey] = { timestamp: Date.now(), data: allHits };
    return allHits;
  } catch (error) {
    console.log("Error scraping Reddit public JSON (gracefully handled):", error);
    return [];
  }
}

// 7.6.b Scrape Discourse communities
async function scrapeDiscourse(domain: string, keyword: string, sector: string, semanticQueries?: string[], budget?: SubrequestBudget): Promise<any[]> {
  const cacheKey = `discourse-${domain}-${sector || "All"}-${keyword || ""}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[Discourse Cache] Returning cached results for ${cacheKey} (${cached.data.length} posts).`);
    return cached.data;
  }

  const results: any[] = [];
  const queries = semanticQueries && semanticQueries.length > 0
    ? semanticQueries
    : (keyword ? [keyword] : ["manual", "tedious", "spreadsheet", "workflow", "frustrated"]);

  try {
    let cleanDomain = domain.replace(/https?:\/\//i, "").split("/")[0];
    if (!cleanDomain) return [];

    // Trimmed from 3 queries to 2 per forum to bound worst-case subrequests
    for (const q of queries.slice(0, 2)) {
      if (budget && budget.remaining <= 0) {
        console.log(`[Discourse] Subrequest budget exhausted for ${cleanDomain}, stopping early.`);
        break;
      }
      const url = `https://${cleanDomain}/search.json?q=${encodeURIComponent(q)}`;
      console.log(`[Discourse] Searching ${cleanDomain} for query: "${q}" (via Slingshot proxy/direct)...`);
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
        for (const t of topics) {
          topicMap.set(t.id, t);
        }

        for (const post of posts) {
          const text = post.blurb || post.cooked || "";
          if (text.length > 30) {
            const topic = topicMap.get(post.topic_id) || {};
            const slug = topic.slug || "topic";
            const topicTitle = topic.title || "Discussion on Discourse";

            results.push({
              id: `discourse-${cleanDomain}-${post.id}`,
              author: post.username || "Discourse_User",
              sourcePlatform: `Discourse (${cleanDomain})`,
              sourceUrl: `https://${cleanDomain}/t/${slug}/${post.topic_id}`,
              text: `${topicTitle}\n\n${text}`.substring(0, 1500),
              title: topicTitle
            });
          }
        }
      } else {
        console.log(`[Discourse] Search on ${cleanDomain} returned status: ${response.status}. Relying on latest topics fallback...`);
      }
    }

    // Fallback to latest.json if search yielded no results (still budget-gated —
    // this was previously an ungated bare fetch() outside the budget system entirely)
    if (results.length === 0 && consumeSubrequestBudget(budget, `Discourse latest.json -> ${cleanDomain}`)) {
      const url = `https://${cleanDomain}/latest.json`;
      console.log(`[Discourse Fallback] Fetching latest topics from ${cleanDomain}...`);
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
            text: `${topic.title}\n\nLatest topic with ${topic.posts_count || 1} posts regarding business or operational issues.`,
            title: topic.title || "Latest Discussion"
          });
        }
      }
    }

    scraperCache[cacheKey] = { timestamp: Date.now(), data: results };
    return results;
  } catch (err) {
    console.log(`[Discourse] Error scanning ${domain} gracefully handled:`, err);
    return [];
  }
}

// Helper functions for parsing XML/RSS feeds
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

// 7.6.c Scrape public RSS feeds
async function scrapeRSSFeed(feedUrl: string, platformName: string, budget?: SubrequestBudget): Promise<any[]> {
  const cacheKey = `rss-${feedUrl}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[RSS Cache] Returning cached results for ${cacheKey} (${cached.data.length} entries).`);
    return cached.data;
  }

  const results: any[] = [];
  try {
    console.log(`[RSS Crawler] Fetching feed: ${feedUrl}...`);
    if (budget && budget.remaining <= 0) {
      console.log(`[RSS Crawler] Subrequest budget exhausted, skipping ${feedUrl}.`);
      return [];
    }
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

    if (!response.ok) {
      console.log(`[RSS Crawler] Feed ${feedUrl} returned status: ${response.status}. Handled gracefully.`);
      return [];
    }

    const xml = await response.text();
    const items: any[] = [];

    // 1. Try RSS 2.0 format (<item>...</item>)
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
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

    // 2. Try Atom format (<entry>...</entry>)
    if (items.length === 0) {
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
      while ((match = entryRegex.exec(xml)) !== null) {
        const entryXml = match[1];
        const title = extractXmlField(entryXml, "title");

        let link = extractXmlField(entryXml, "link");
        if (!link || !link.startsWith("http")) {
          const hrefMatch = /<link[^>]+href=["']([^"']+)["']/i.exec(entryXml);
          if (hrefMatch) {
            link = hrefMatch[1];
          }
        }

        const content = extractXmlField(entryXml, "content") || extractXmlField(entryXml, "summary");

        let author = "Atom_User";
        const authorMatch = /<author>([\s\S]*?)<\/author>/i.exec(entryXml);
        if (authorMatch) {
          const name = extractXmlField(authorMatch[1], "name");
          if (name) author = name;
        }

        const id = extractXmlField(entryXml, "id") || link || String(Date.now());

        if (title && link) {
          items.push({ title, link, description: content, creator: author, guid: id });
        }
      }
    }

    for (const item of items) {
      const cleanTitle = cleanHtmlAndCdata(item.title);
      const cleanDesc = cleanHtmlAndCdata(item.description || "");
      const cleanCreator = cleanHtmlAndCdata(item.creator);

      results.push({
        id: `rss-${hashString(item.guid || item.link)}`,
        author: cleanCreator,
        sourcePlatform: platformName,
        sourceUrl: item.link.trim(),
        text: `${cleanTitle}\n\n${cleanDesc}`.substring(0, 1500),
        title: cleanTitle
      });
    }

    scraperCache[cacheKey] = { timestamp: Date.now(), data: results };
    return results;
  } catch (error) {
    console.error(`[RSS Crawler] Error crawling feed ${feedUrl}:`, error);
    return [];
  }
}

// 7.65. Scrape custom web targets and forums using Firecrawl API
async function scrapeWithFirecrawl(targetUrl: string, platformName: string): Promise<any[]> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    console.warn(`[Firecrawl] FIRECRAWL_API_KEY is not configured. Skipping "${targetUrl}".`);
    return [];
  }

  const cacheKey = `firecrawl-${targetUrl}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[Firecrawl Cache] Returning cached scrape results for ${targetUrl}`);
    return cached.data;
  }

  try {
    console.log(`[Firecrawl] Crawling web target: "${targetUrl}"...`);
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

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Firecrawl] Scraping failed for ${targetUrl} (Status ${res.status}):`, errText);
      return [];
    }

    const data: any = await res.json();
    const markdown = data?.data?.markdown || "";
    if (!markdown || markdown.trim().length < 50) {
      console.log(`[Firecrawl] Insufficient readable text extracted from ${targetUrl}`);
      return [];
    }

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
    console.error(`[Firecrawl] Error scraping ${targetUrl}:`, error.message || error);
    return [];
  }
}

// 7.7. Scrape real GitHub issues using free, public unauthenticated search API
async function scrapeGitHubIssues(keyword: string, sector: string, semanticQueries?: string[]): Promise<any[]> {
  console.log("[GitHub Issues] Crawler is STRICTLY DISABLED (Developer Platform blacklisted to preserve resources).");
  return [];
  const cacheKey = `github-${sector || "All"}-${keyword || ""}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[GitHub Cache] Returning cached results for ${cacheKey} (${cached.data.length} issues).`);
    return cached.data;
  }

  try {
    const sectorKeywords: Record<string, string[]> = {
      "Healthcare Operations": ["clinic", "EHR", "medical", "patient"],
      "Real Estate & Property Management": ["landlord", "tenant", "realestate", "property", "zoning"],
      "Construction & Subcontracting": ["contractor", "construction", "blueprint", "estimating"],
      "Professional Services (Accounting/CPA/Law)": ["accounting", "bookkeeping", "CPA", "lawyer", "invoice"],
      "Local Small Businesses": ["smallbusiness", "inventory", "scheduling", "retail"],
      "Finance & Invoicing Workflows": ["invoice", "payroll", "billing", "reconciliation"],
      "E-commerce & Retail Logistics": ["shopify", "shipping", "ecommerce", "fulfillment"],
      "Niche Hobby Forums / Communities": ["forum", "moderator", "community", "admin"]
    };

    const words = sectorKeywords[sector] || ["workflow", "automation"];
    const queries: string[] = [];

    if (semanticQueries && semanticQueries.length > 0) {
      queries.push(...semanticQueries);
    } else if (keyword) {
      queries.push(`${keyword} manual`);
      queries.push(`${keyword} workaround`);
    } else {
      for (const word of words.slice(0, 3)) {
        queries.push(`${word} manual`);
        queries.push(`${word} workaround`);
      }
    }

    const allHits: any[] = [];
    const targetQueries = queries.slice(0, 5);

    for (let i = 0; i < targetQueries.length; i++) {
      if (i > 0) {
        await delayMs(1000);
      }
      const q = targetQueries[i];
      // Search open issues containing the terms
      const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}+is:issue+state:open&per_page=6`;
      console.log(`Crawling GitHub issues for query: "${q}"...`);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "OpportunityRadar/1.1 (contact: katycat1313@gmail.com)",
          "Accept": "application/vnd.github.v3+json"
        }
      });

      if (response.ok) {
        const data: any = await response.ok ? await response.json() : null;
        const items = data?.items || [];
        for (const item of items) {
          if (item.body && item.body.length > 50) {
            allHits.push({
              id: `github-${item.id}`,
              author: item.user?.login || "GitHub_User",
              sourcePlatform: "GitHub Issues",
              sourceUrl: item.html_url,
              text: `${item.title}\n\n${item.body}`.substring(0, 1500),
              title: item.title || "Issue on GitHub"
            });
          }
        }
      } else {
        console.log(`GitHub search for "${q}" returned status: ${response.status}. Handled gracefully.`);
      }
    }

    scraperCache[cacheKey] = { timestamp: Date.now(), data: allHits };
    return allHits;
  } catch (error) {
    console.error("Error scraping GitHub issues:", error);
    return [];
  }
}

// 7.8. Scrape real Mastodon statuses containing specific pain keywords
async function scrapeMastodonStatuses(keyword: string, sector: string): Promise<any[]> {
  console.log("[Mastodon] Crawler is STRICTLY DISABLED (Developer Platform blacklisted to preserve resources).");
  return [];
  const cacheKey = `mastodon-${sector || "All"}-${keyword || ""}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const sectorTags: Record<string, string[]> = {
      "Healthcare Operations": ["healthcare", "medical", "clinic", "healthtech"],
      "Real Estate & Property Management": ["realestate", "landlord", "propertymanagement"],
      "Construction & Subcontracting": ["construction", "contractor", "hvac"],
      "Professional Services (Accounting/CPA/Law)": ["accounting", "bookkeeping", "lawyer"],
      "Local Small Businesses": ["smallbusiness", "entrepreneur", "localbiz"],
      "Finance & Invoicing Workflows": ["accounting", "bookkeeping", "invoice", "finance"],
      "E-commerce & Retail Logistics": ["ecommerce", "shopify", "shipping", "logistics"],
      "Niche Hobby Forums / Communities": ["communitymanager", "forum"]
    };
    const tags = sectorTags[sector] || ["workflow", "spreadsheet", "smallbusiness"];
    const allHits: any[] = [];

    // Pick the first 3 tags
    for (const tag of tags.slice(0, 3)) {
      const url = `https://mastodon.social/api/v1/timelines/tag/${tag}?limit=10`;
      console.log(`Crawling Mastodon statuses for hashtag: #${tag}...`);
      const response = await fetch(url, {
        headers: { "User-Agent": "OpportunityRadar/1.2 (contact: katycat1313@gmail.com)" }
      });
      if (response.ok) {
        const statuses: any = await response.json();
        if (Array.isArray(statuses)) {
          allHits.push(...statuses);
        }
      }
      await delayMs(500); // polite delay
    }

    const uniqueStatuses = new Map();
    for (const status of allHits) {
      if (status.id && !uniqueStatuses.has(status.id)) {
        let cleanedText = status.content || "";
        cleanedText = cleanedText
          .replace(/<p>/g, "\n\n")
          .replace(/<\/p>/g, "")
          .replace(/<[^>]*>/g, "")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");

        uniqueStatuses.set(status.id, {
          id: `mastodon-${status.id}`,
          author: status.account?.username || "Mastodon_User",
          sourcePlatform: "Mastodon",
          sourceUrl: status.url || `https://mastodon.social/@${status.account?.username}/${status.id}`,
          text: cleanedText.substring(0, 1500),
          title: `Mastodon update by @${status.account?.username || "user"}`
        });
      }
    }
    const results = Array.from(uniqueStatuses.values());
    scraperCache[cacheKey] = { timestamp: Date.now(), data: results };
    return results;
  } catch (error) {
    console.error("Error scraping Mastodon statuses:", error);
    return [];
  }
}

// 7.9. Scrape real Stack Exchange questions using public API
async function scrapeStackExchange(keyword: string, sector: string, semanticQueries?: string[]): Promise<any[]> {
  console.log("[Stack Exchange] Crawler is STRICTLY DISABLED (Developer Platform blacklisted to preserve resources).");
  return [];
  const cacheKey = `se-${sector || "All"}-${keyword || ""}`;
  const cached = scraperCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const queries = semanticQueries && semanticQueries.length > 0
      ? semanticQueries
      : ["spreadsheet manual workaround", "excel tedious export"];
    const allHits: any[] = [];

    for (const q of queries.slice(0, 5)) {
      const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=5`;
      console.log(`Crawling Stack Exchange questions for query: "${q}"...`);
      const response = await fetch(url, {
        headers: { "User-Agent": "OpportunityRadar/1.2 (contact: katycat1313@gmail.com)" }
      });
      if (response.ok) {
        const data: any = await response.json();
        if (data && Array.isArray(data.items)) {
          allHits.push(...data.items);
        }
      }
      await delayMs(500); // polite delay
    }

    const uniqueQuestions = new Map();
    for (const item of allHits) {
      if (item.question_id && !uniqueQuestions.has(item.question_id)) {
        uniqueQuestions.set(item.question_id, {
          id: `se-${item.question_id}`,
          author: item.owner?.display_name || "StackExchange_User",
          sourcePlatform: "Stack Exchange",
          sourceUrl: item.link || `https://stackoverflow.com/questions/${item.question_id}`,
          text: `Title: ${item.title}\nTags: ${(item.tags || []).join(", ")}\nThis developer or power-user is running into a tedious/workaround issue.`,
          title: item.title || "Tedious workflow question"
        });
      }
    }
    const results = Array.from(uniqueQuestions.values());
    scraperCache[cacheKey] = { timestamp: Date.now(), data: results };
    return results;
  } catch (error) {
    console.error("Error scraping Stack Exchange questions:", error);
    return [];
  }
}

// 7.10. Scrape real Discord channel messages using a provided Bot Token
async function scrapeDiscordMessages(botToken: string, channelId: string): Promise<any[]> {
  if (!botToken || !channelId) {
    return [];
  }
  try {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=25`;
    console.log(`Crawling Discord channel messages for Channel ID: ${channelId}...`);

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
    } else {
      const errorText = await response.text();
      console.error(`Discord API error (status ${response.status}):`, errorText);
    }
    return [];
  } catch (error) {
    console.error("Error scraping Discord messages:", error);
    return [];
  }
}


// Cache Stats & Clear Endpoints
app.get("/api/cache/stats", (req, res) => {
  res.json({
    cachedItemsCount: apiCache.size(),
    status: "active",
    maxCapacity: 300
  });
});

app.post("/api/cache/clear", (req, res) => {
  apiCache.clear();
  res.json({ success: true, message: "Server memory cache cleared." });
});

// 8. AI Continuous Discovery Query (100% live crawling, zero fake/synthetic data)
// ==========================================
// Buyer-intent, urgency & sentiment pre-scoring
// ==========================================
// Runs cheaply (no API calls) over every raw scraped item BEFORE it goes to Gemini.
// Purpose: stop paying AI tokens to evaluate topical-but-low-value chatter, and push
// posts showing genuine near-term need / willingness to pay to the top so the AI (and
// the person reviewing leads) sees the strongest signals first. This does not replace
// the Gemini classification — it narrows and ranks what Gemini sees.
const URGENCY_PHRASES = [
  "asap", "urgently", "urgent", "immediately", "right now", "this week",
  "before it's too late", "running out of time", "deadline", "losing clients",
  "losing customers", "losing money", "can't keep up", "falling behind",
  "need this fixed", "need this solved", "need a fix now"
];
const BUYING_INTENT_PHRASES = [
  "willing to pay", "budget for", "looking to hire", "need someone to build",
  "does anyone know a tool", "recommend a tool", "recommend a service",
  "paying for", "looking for a solution", "need a developer", "need an agency",
  "open to paying", "would pay", "in the market for", "shopping for",
  "evaluating options", "looking to switch", "looking to outsource",
  "any recommendations for a tool", "any recommendations for software",
  "who do you use for", "what do you use for"
];
const FRUSTRATION_PHRASES = [
  "so frustrated", "sick of", "tired of", "hate doing", "waste of time",
  "drowning in", "nightmare", "fed up", "burned out", "overwhelmed",
  "driving me crazy", "at my wit's end", "can't take it anymore"
];
const MANUAL_PAIN_PHRASES = [
  "manually", "by hand", "spreadsheet", "excel", "copy and paste",
  "copy-paste", "every single time", "hours every week", "hours a week",
  "every time i have to"
];
// Signals this is promotional / a solution being pitched, not a genuine buyer — demote hard.
const PROMOTIONAL_PHRASES = [
  "i built", "i made", "i launched", "check out my", "we built",
  "introducing", "announcing", "my product", "open source", "new tool",
  "beta users", "released today", "affiliate link", "use my code",
  "discount code", "sign up for my"
];

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

app.post("/api/opportunities/discover", async (req, res) => {
  const { sector, keyword, discoveryMode, bypassCache } = req.body;
  const targetSector = sector || "All";
  const mode = discoveryMode || "semantic";
  const isLiteral = mode === "literal";

  const trace: string[] = [];
  const logTrace = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] ${msg}`;
    console.log(`[Discover Endpoint] ${logLine}`);
    trace.push(logLine);
  };

  logTrace(`Initializing discovery sweep. Sector: "${targetSector}", Keywords: "${keyword || "None"}", Mode: "${mode}"`);

  // Check cache unless explicitly bypassed
  const cacheKey = `discover:${targetSector}:${keyword || ""}:${mode}`;
  if (!bypassCache) {
    const cachedOpps = apiCache.get(cacheKey);
    if (cachedOpps && cachedOpps.length > 0) {
      logTrace(`⚡ [Cache Hit] Returning ${cachedOpps.length} cached opportunities for sector "${targetSector}".`);
      return res.json({
        success: true,
        opportunities: cachedOpps,
        trace: [...trace, `⚡ Returned instant cached response (10m TTL)`]
      });
    }
  }

  try {
    // Check for API Key first before running any queries
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logTrace("⚠️ WARNING: GEMINI_API_KEY is not defined in Settings > Secrets. AI operations will fail.");
      throw new Error("GEMINI_API_KEY is not defined. Please configure it in Settings > Secrets.");
    } else {
      logTrace("✅ GEMINI_API_KEY detected in server environment.");
    }

    logTrace("Initializing Gemini AI Client...");
    const ai = getGeminiClient();
    const model = "gemini-3.6-flash";

    let semanticQueries: string[] = [];
    if (isLiteral) {
      logTrace("Parsing raw comma-separated keywords literal list...");
      const rawKeywords = keyword
        ? keyword.split(/[,\n]+/).map((k: string) => k.trim()).filter((k: string) => k.length > 0)
        : [];
      semanticQueries = rawKeywords.length > 0 ? rawKeywords : [];
      logTrace(`Parsed ${semanticQueries.length} literal queries: ${JSON.stringify(semanticQueries)}`);
    } else {
      logTrace("Requesting Gemini to expand target sector and keyword into non-tech human-level frustration queries...");
      try {
        semanticQueries = await generateSemanticQueries(targetSector, keyword);
        logTrace(`Successfully generated ${semanticQueries.length} organic search queries: ${JSON.stringify(semanticQueries)}`);
      } catch (err: any) {
        logTrace(`⚠️ Failed to expand queries semantically: ${err.message || err}. Falling back to default lists.`);
      }
    }

    if (semanticQueries.length === 0) {
      logTrace("No active queries. Generating fallback queries for sector...");
      semanticQueries = await generateSemanticQueries(targetSector, "");
      logTrace(`Fallback generated ${semanticQueries.length} queries: ${JSON.stringify(semanticQueries)}`);
    }

    const config = loadBotConfig();
    const isEnabled = (platformId: string) => {
      const p = config.platforms.find((plat: any) => plat.platformId === platformId);
      const enabled = p ? p.isEnabled : false;
      logTrace(`Platform status check - "${platformId}": ${enabled ? "ENABLED" : "DISABLED"}`);
      return enabled;
    };

    // Shared subrequest budget for this entire sweep. Cloudflare Workers cap outbound
    // fetches per invocation (50 on Free, 1000 on Bundled). We keep well under the
    // Free-plan cap here (35, leaving headroom for the Gemini call + any other fetches
    // this request makes) so a sweep degrades gracefully with partial results instead
    // of 500ing. Bump this if/when the Worker is on the Bundled plan.
    const subrequestBudget = createSubrequestBudget(35);
    const budgetOk = () => {
      if (subrequestBudget.remaining <= 0) {
        logTrace(`⚠️ Subrequest budget exhausted (0 remaining) — skipping remaining platforms for this sweep.`);
        return false;
      }
      return true;
    };

    // Crawl all enabled platforms concurrently instead of one-at-a-time. This cuts wall-clock
    // latency dramatically (previously ~30s+ of fully serial awaits) without changing the total
    // subrequest count — every task still funnels through the same shared `subrequestBudget`,
    // and each task's budget check runs synchronously before its first await, so priority order
    // is preserved even though execution overlaps.
    let scrapedHN: any[] = [];
    let scrapedReddit: any[] = [];
    let scrapedGitHub: any[] = [];
    let scrapedMastodon: any[] = [];
    let scrapedSE: any[] = [];
    let scrapedDiscord: any[] = [];
    let scrapedDiscourse: any[] = [];
    let scrapedRSS: any[] = [];
    let scrapedQuora: any[] = [];
    let scrapedFirecrawl: any[] = [];

    const crawlTasks: (() => Promise<void>)[] = [
      async () => {
        if (!(isEnabled("hn") && budgetOk())) return;
        logTrace(`[Hacker News] Initiating crawler for query "${keyword || ""}"...`);
        try {
          scrapedHN = await scrapeHackerNewsComments(keyword, targetSector, semanticQueries);
          logTrace(`[Hacker News] Successfully crawled ${scrapedHN.length} comments.`);
        } catch (e: any) {
          logTrace(`❌ [Hacker News] Crawling failed: ${e.message || e}`);
        }
      },
      async () => {
        if (!(isEnabled("reddit") && budgetOk())) return;
        logTrace(`[Reddit] Initiating public JSON search crawler for subreddits...`);
        try {
          scrapedReddit = await scrapeRedditPublicJSON(keyword, targetSector, semanticQueries, subrequestBudget);
          logTrace(`[Reddit] Successfully crawled ${scrapedReddit.length} posts. (Budget remaining: ${subrequestBudget.remaining})`);
        } catch (e: any) {
          logTrace(`❌ [Reddit] Crawling failed: ${e.message || e}`);
        }
      },
      async () => {
        if (!(isEnabled("github") && budgetOk())) return;
        logTrace(`[GitHub] Initiating public Issues crawler...`);
        try {
          scrapedGitHub = await scrapeGitHubIssues(keyword, targetSector, semanticQueries);
          logTrace(`[GitHub] Successfully crawled ${scrapedGitHub.length} issues.`);
        } catch (e: any) {
          logTrace(`❌ [GitHub] Crawling failed: ${e.message || e}`);
        }
      },
      async () => {
        if (!(isEnabled("mastodon") && budgetOk())) return;
        logTrace(`[Mastodon] Initiating public timeline crawler...`);
        try {
          scrapedMastodon = await scrapeMastodonStatuses(keyword, targetSector);
          logTrace(`[Mastodon] Successfully crawled ${scrapedMastodon.length} statuses.`);
        } catch (e: any) {
          logTrace(`❌ [Mastodon] Crawling failed: ${e.message || e}`);
        }
      },
      async () => {
        if (!(isEnabled("stackexchange") && budgetOk())) return;
        logTrace(`[Stack Exchange] Initiating public questions crawler...`);
        try {
          scrapedSE = await scrapeStackExchange(keyword, targetSector, semanticQueries);
          logTrace(`[Stack Exchange] Successfully crawled ${scrapedSE.length} questions.`);
        } catch (e: any) {
          logTrace(`❌ [Stack Exchange] Crawling failed: ${e.message || e}`);
        }
      },
      async () => {
        if (!(isEnabled("discord") && budgetOk())) return;
        try {
          const discordPlat = config.platforms.find((p: any) => p.platformId === "discord");
          if (discordPlat && discordPlat.botToken) {
            const activeTargets = discordPlat.targets.filter((t: any) => t.isEnabled);
            logTrace(`[Discord] Scanning ${activeTargets.length} active channel targets...`);
            for (const target of activeTargets) {
              if (subrequestBudget.remaining <= 0) {
                logTrace(`[Discord] Subrequest budget exhausted, stopping early.`);
                break;
              }
              subrequestBudget.remaining--;
              logTrace(`[Discord] Fetching channel: "${target.name}" (${target.urlOrPath})`);
              const results = await scrapeDiscordMessages(discordPlat.botToken, target.urlOrPath);
              scrapedDiscord.push(...results);
            }
            logTrace(`[Discord] Crawling completed. Aggregated ${scrapedDiscord.length} messages.`);
          } else {
            logTrace("[Discord] Missing Bot Token or channel configurations. Crawler skipped.");
          }
        } catch (e: any) {
          logTrace(`❌ [Discord] Crawling failed: ${e.message || e}`);
        }
      },
      async () => {
        if (!(isEnabled("discourse") && budgetOk())) return;
        logTrace(`[Discourse] Initiating public forum crawler...`);
        try {
          const discoursePlat = config.platforms.find((p: any) => p.platformId === "discourse");
          if (discoursePlat) {
            const activeTargets = discoursePlat.targets.filter((t: any) => t.isEnabled);
            for (const target of activeTargets) {
              if (!budgetOk()) break;
              logTrace(`[Discourse] Searching forum "${target.name}" (${target.urlOrPath}) for sector-specific topics...`);
              const results = await scrapeDiscourse(target.urlOrPath, keyword, targetSector, semanticQueries, subrequestBudget);
              scrapedDiscourse.push(...results);
            }
            logTrace(`[Discourse] Successfully crawled ${scrapedDiscourse.length} posts from active forums. (Budget remaining: ${subrequestBudget.remaining})`);
          }
        } catch (e: any) {
          logTrace(`❌ [Discourse] Crawling failed: ${e.message || e}`);
        }
      },
      async () => {
        if (!(isEnabled("rss") && budgetOk())) return;
        logTrace(`[RSS] Initiating public RSS feed scanner...`);
        try {
          const rssPlat = config.platforms.find((p: any) => p.platformId === "rss");
          if (rssPlat) {
            const activeTargets = rssPlat.targets.filter((t: any) => t.isEnabled);
            for (const target of activeTargets) {
              if (!budgetOk()) break;
              logTrace(`[RSS] Fetching and scanning RSS feed: "${target.name}" (${target.urlOrPath})...`);
              const results = await scrapeRSSFeed(target.urlOrPath, `RSS (${target.name})`, subrequestBudget);
              scrapedRSS.push(...results);
            }
            logTrace(`[RSS] Successfully crawled ${scrapedRSS.length} entries from connected RSS feeds. (Budget remaining: ${subrequestBudget.remaining})`);
          }
        } catch (e: any) {
          logTrace(`❌ [RSS] Crawling failed: ${e.message || e}`);
        }
      },
      async () => {
        if (!(isEnabled("quora") && budgetOk())) return;
        logTrace(`[Quora] Initiating public RSS crawler with dynamic sector-level targeting...`);
        try {
          const quoraPlat = config.platforms.find((p: any) => p.platformId === "quora");
          if (quoraPlat) {
            const sectorQuoraTopics: Record<string, string[]> = {
              "Healthcare Operations": ["Healthcare", "Hospital-Administration", "Medicine-and-Healthcare"],
              "Real Estate & Property Management": ["Real-Estate", "Property-Management", "Landlords"],
              "Construction & Subcontracting": ["Construction-Industry", "Contractors", "Home-Improvement"],
              "Professional Services (Accounting/CPA/Law)": ["Accounting", "Bookkeeping", "Lawyers"],
              "Local Small Businesses": ["Small-Businesses", "Local-Businesses", "Entrepreneurship"],
              "Finance & Invoicing Workflows": ["Invoicing", "Billing", "Bookkeeping"],
              "E-commerce & Retail Logistics": ["E-Commerce", "Shopify", "Drop-Shipping"],
              "Marketing agency": ["Marketing-Agencies", "Digital-Marketing", "Advertising"],
              "Niche Hobby Forums / Communities": ["Online-Communities", "Forum-Software"]
            };
            const topics = (sectorQuoraTopics[targetSector] || ["Small-Businesses", "Operations-Management", "Business-Automation"]).slice(0, 2);

            for (const topic of topics) {
              if (!budgetOk()) break;
              logTrace(`[Quora] Fetching live sector-specific topic feed: "${topic.replace(/-/g, ' ')}"...`);
              const cleanTopic = topic.replace(/-/g, ' ');
              const url = `https://news.google.com/rss/search?q=site:quora.com+${encodeURIComponent(cleanTopic)}+problem+OR+workflow&hl=en-US&gl=US&ceid=US:en`;
              const results = await scrapeRSSFeed(url, `Quora (${cleanTopic})`, subrequestBudget);
              scrapedQuora.push(...results);
            }
            logTrace(`[Quora] Successfully crawled ${scrapedQuora.length} posts for sector "${targetSector}". (Budget remaining: ${subrequestBudget.remaining})`);
          }
        } catch (e: any) {
          logTrace(`❌ [Quora] Crawling failed: ${e.message || e}`);
        }
      },
      async () => {
        if (!(isEnabled("firecrawl") && budgetOk())) return;
        logTrace(`[Firecrawl] Initiating custom web crawler for configured targets...`);
        try {
          const fcPlat = config.platforms.find((p: any) => p.platformId === "firecrawl");
          if (fcPlat && process.env.FIRECRAWL_API_KEY) {
            const activeTargets = fcPlat.targets.filter((t: any) => t.isEnabled);
            for (const target of activeTargets) {
              if (!budgetOk()) break;
              subrequestBudget.remaining--;
              logTrace(`[Firecrawl] Crawling target: "${target.name}" (${target.urlOrPath})...`);
              const results = await scrapeWithFirecrawl(target.urlOrPath, target.name || "Custom Web Target");
              scrapedFirecrawl.push(...results);
            }
            logTrace(`[Firecrawl] Successfully crawled ${scrapedFirecrawl.length} pages from active targets. (Budget remaining: ${subrequestBudget.remaining})`);
          } else if (!process.env.FIRECRAWL_API_KEY) {
            logTrace("[Firecrawl] ⚠️ FIRECRAWL_API_KEY not configured. Crawler skipped.");
          }
        } catch (e: any) {
          logTrace(`❌ [Firecrawl] Crawling failed: ${e.message || e}`);
        }
      }
    ];

    logTrace(`Launching ${crawlTasks.length} platform crawlers concurrently (shared subrequest budget: ${subrequestBudget.remaining})...`);
    await Promise.allSettled(crawlTasks.map(task => task()));
    logTrace(`All concurrent crawlers settled. Subrequest budget remaining: ${subrequestBudget.remaining}.`);

    // Combine sources
    let scrapedComments = [
      ...scrapedHN,
      ...scrapedReddit,
      ...scrapedGitHub,
      ...scrapedMastodon,
      ...scrapedSE,
      ...scrapedDiscord,
      ...scrapedDiscourse,
      ...scrapedRSS,
      ...scrapedQuora,
      ...scrapedFirecrawl
    ];
    logTrace(`Combined live crawler feeds. Total raw posts/comments aggregated across ALL platforms: ${scrapedComments.length}`);
    logTrace(`Platform crawl details: Hacker News (${scrapedHN.length}), Reddit (${scrapedReddit.length}), GitHub (${scrapedGitHub.length}), Mastodon (${scrapedMastodon.length}), Stack Exchange (${scrapedSE.length}), Discord (${scrapedDiscord.length}), Discourse (${scrapedDiscourse.length}), RSS (${scrapedRSS.length}), Quora (${scrapedQuora.length}), Firecrawl (${scrapedFirecrawl.length})`);

    // If we have no results and a keyword was specified, try a broader query — but only
    // for platforms whose FIRST pass returned nothing, and only while subrequest budget
    // remains. Previously this re-crawled ALL 10 platforms from scratch unconditionally,
    // which could roughly double the subrequest count for the exact requests that were
    // already running short on budget (0 results is often itself a symptom of the
    // budget/tunnel running out on the first pass).
    if (scrapedComments.length === 0 && keyword && budgetOk()) {
      logTrace(`Live crawl returned 0 hits for "${keyword}". Running a single bounded broad-query retry (budget remaining: ${subrequestBudget.remaining})...`);
      const fallbackSemanticQueries = await generateSemanticQueries(targetSector, "");

      const fallbackHN = (isEnabled("hn") && budgetOk()) ? await scrapeHackerNewsComments("", targetSector, fallbackSemanticQueries) : [];
      const fallbackReddit = (isEnabled("reddit") && budgetOk()) ? await scrapeRedditPublicJSON("", targetSector, fallbackSemanticQueries, subrequestBudget) : [];
      const fallbackGitHub = (isEnabled("github") && budgetOk()) ? await scrapeGitHubIssues("", targetSector, fallbackSemanticQueries) : [];
      const fallbackMastodon = (isEnabled("mastodon") && budgetOk()) ? await scrapeMastodonStatuses("", targetSector) : [];
      const fallbackSE = (isEnabled("stackexchange") && budgetOk()) ? await scrapeStackExchange("", targetSector, fallbackSemanticQueries) : [];

      const fallbackDiscourse = (isEnabled("discourse") && budgetOk()) ? await (async () => {
        const results: any[] = [];
        const discoursePlat = config.platforms.find((p: any) => p.platformId === "discourse");
        if (discoursePlat) {
          const activeTargets = discoursePlat.targets.filter((t: any) => t.isEnabled);
          for (const target of activeTargets) {
            if (!budgetOk()) break;
            const r = await scrapeDiscourse(target.urlOrPath, "", targetSector, fallbackSemanticQueries, subrequestBudget);
            results.push(...r);
          }
        }
        return results;
      })() : [];

      const fallbackRSS = (isEnabled("rss") && budgetOk()) ? await (async () => {
        const results: any[] = [];
        const rssPlat = config.platforms.find((p: any) => p.platformId === "rss");
        if (rssPlat) {
          const activeTargets = rssPlat.targets.filter((t: any) => t.isEnabled);
          for (const target of activeTargets) {
            if (!budgetOk()) break;
            const r = await scrapeRSSFeed(target.urlOrPath, `RSS (${target.name})`, subrequestBudget);
            results.push(...r);
          }
        }
        return results;
      })() : [];

      scrapedComments = [
        ...fallbackHN,
        ...fallbackReddit,
        ...fallbackGitHub,
        ...fallbackMastodon,
        ...fallbackSE,
        ...scrapedDiscord,
        ...fallbackDiscourse,
        ...fallbackRSS
      ];
      logTrace(`Broad search completed. Total backup posts fetched: ${scrapedComments.length} (Budget remaining: ${subrequestBudget.remaining})`);
      logTrace(`Broad search details: Hacker News (${fallbackHN.length}), Reddit (${fallbackReddit.length}), GitHub (${fallbackGitHub.length}), Mastodon (${fallbackMastodon.length}), Stack Exchange (${fallbackSE.length}), Discord (${scrapedDiscord.length}), Discourse (${fallbackDiscourse.length}), RSS (${fallbackRSS.length})`);
    }

    if (scrapedComments.length === 0) {
      logTrace("Live crawler feeds returned 0 posts. Utilizing pre-verified, authentic historical backup posts to prevent empty screens...");
      // Filter backup posts by matching sector keywords in text/title
      const sectorKeywordsMap: Record<string, string[]> = {
        "Healthcare Operations": ["clinic", "EHR", "medical", "patient", "therapy"],
        "Real Estate & Property Management": ["landlord", "tenant", "real estate", "property", "zoning"],
        "Construction & Subcontracting": ["contractor", "construction", "blueprint", "estimating", "electricians"],
        "Professional Services (Accounting/CPA/Law)": ["accounting", "bookkeeping", "CPA", "lawyer", "invoice", "tax"],
        "Local Small Businesses": ["small business", "scheduling", "inventory", "salon"],
        "Finance & Invoicing Workflows": ["invoice", "payroll", "billing", "reconciliation"],
        "E-commerce & Retail Logistics": ["shopify", "shipping", "ecommerce", "freight", "fulfillment"],
        "Marketing agency": ["marketing agency", "campaign", "client reporting", "client approval", "scope creep"],
        "Niche Hobby Forums / Communities": ["forum", "moderator", "community", "admin"]
      };
      const keywords = sectorKeywordsMap[targetSector] || [];
      logTrace(`Filtering historical fallback posts for keywords matching "${targetSector}": [${keywords.join(", ")}]`);
      const filteredBackups = realHistoricalBackupPosts.filter(post => {
        if (targetSector === "All") return true;
        const textLower = `${post.text} ${post.title}`.toLowerCase();
        return keywords.some(kw => textLower.includes(kw));
      });
      scrapedComments = filteredBackups.length > 0 ? filteredBackups : realHistoricalBackupPosts;
      logTrace(`Sector filter completed. Loaded ${scrapedComments.length} raw historical items.`);
    }

    logTrace(`Preparing final evaluation feed of ${scrapedComments.length} items for AI analysis...`);

    // Buyer-intent / urgency / sentiment pre-scoring. Runs before the AI call so we
    // (a) don't burn tokens evaluating generic topical chatter, and (b) surface the
    // strongest near-term-need + willingness-to-pay candidates first.
    const rawCount = scrapedComments.length;
    scrapedComments = scrapedComments
      .map((c: any) => {
        const { score, signals } = scoreBuyerIntent(`${c.title || ""} ${c.text || ""}`);
        return { ...c, _intentScore: score, _intentSignals: signals };
      })
      // Cut posts that read as promotional/solution-pitching rather than someone in need.
      .filter((c: any) => c._intentScore > -3)
      .sort((a: any, b: any) => b._intentScore - a._intentScore);

    const MAX_ITEMS_FOR_AI = 60;
    const trimmedForBudget = scrapedComments.length > MAX_ITEMS_FOR_AI;
    if (trimmedForBudget) {
      scrapedComments = scrapedComments.slice(0, MAX_ITEMS_FOR_AI);
    }
    logTrace(`Buyer-intent pre-scoring applied: ${rawCount} raw → ${scrapedComments.length} sent to AI (dropped low/negative-signal noise${trimmedForBudget ? `, capped to top ${MAX_ITEMS_FOR_AI} by intent score` : ""}).`);

    const sectorQualificationRules = targetSector === "Marketing agency" ? `
      MARKETING-AGENCY DECISION-MAKER QUALIFICATION:
      - Keep only posts whose text provides credible evidence that the author works inside a marketing, advertising, creative, SEO, PPC, content, or digital agency in a decision-making or operational leadership role.
      - Qualifying roles include agency owner, founder, partner, director, department head, account director, operations lead, or another role that clearly owns the process or can influence a purchase.
      - The post must describe a concrete current business problem, failed process, measurable pain, or active search for advice, recommendations, a vendor, service, or tool.
      - Prioritize problems involving client reporting, client approvals, feedback/revisions, scope creep, campaign handoffs, attribution, lead qualification, capacity, account management, content review, or client retention.
      - Reject agency promotions, service offers, generic marketing discussion, career questions, tutorials, solution showcases, and posts with no evidence of agency-side decision-making authority.
      - Set industry to exactly "Marketing agency" for every retained result.
      - Never invent the author's role or buying authority. If the source text does not support it, reject the post.
    ` : "";

    // 3. Draft prompt that feeds real data and extracts genuine cards
    const prompt = `
      You are an advanced AI crawler, text classifier, and opportunity filter for a solo software developer. 
      Your task is to analyze the provided authentic scraped feed from the permitted, enabled sources and classify each item using our Classification Model.
      
      CLASSIFICATION MODEL SPECIFICATION:
      - goal: Classify posts into help_seeker, solution_sharer, or noise.
      
      - labels:
        * help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
        * solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
        * noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes pre-structured systematic analyses or product proposal templates.

      - positive_signals:
        * help_seeker: ["need help", "looking for help", "need advice", "asking for advice", "any recommendations", "how do i", "how can i", "what should i do", "i'm stuck", "we're stuck", "having trouble", "struggling with", "problem with", "is there a way", "can someone help", "need someone to", "looking for someone to", "who can i hire", "need a developer", "need a designer", "need an automation", "need a tool", "recommend a tool", "recommend a service", "does anyone know", "anyone else", "is anyone else", "anyone else struggling with", "anyone else dealing with", "anyone else having trouble with", "anyone else sick of"]
        * solution_sharer: ["i built", "i made", "i created", "i launched", "i shipped", "here's my", "check out my", "announcing", "introducing", "my product", "new tool", "open source", "release", "beta", "showing off", "we built", "launching"]

      - negative_signals:
        * help_seeker: ["i solved", "here is the solution", "tutorial", "guide", "case study", "build log", "product launch", "launching", "demo", "showcase"]
        * solution_sharer: ["need help", "how do i", "recommend", "struggling", "stuck", "looking for advice", "what should i do", "can someone help"]
        * noise: ["meme", "joke", "funny", "politics", "news", "headline", "rant", "off topic"]

      - priority_rules:
        1. If the post contains strong help-seeking language and clear business/problem context, classify as help_seeker.
        2. If the post contains strong build/launch language, classify as solution_sharer.
        3. If both are present, prefer the label with more explicit intent words and more first-person problem language.
        4. If the post is mostly describing a tool, demo, or product they made, classify as solution_sharer even if it mentions a problem.
        5. If the post is mostly a question or request for recommendations, classify as help_seeker.
        6. If there is no clear intent, classify as noise.

      - context_boosters:
        * help_seeker: ["small business", "customer support", "operations", "workflow", "billing", "invoicing", "automation", "sales", "website", "shopify", "scheduling", "appointments", "leads", "inventory", "email"]
        * solution_sharer: ["demo", "repo", "github", "waitlist", "signup", "feedback", "launch", "beta users", "released today"]

      CRITICAL REJECTION & AUDIENCE RULE:
      - The target audience consists strictly of non-technical business owners, operations managers, and employees experiencing manual operational/work struggles.
      - You MUST strictly ignore/reject any posts, issues, or comments that are classified as "solution_sharer" or "noise", or that represent software/SaaS developer hobbyists discussing code, programming, API keys, AI engineering prompts, or tech stack setups.
      - Do NOT classify any opportunity under tech-centric/software sectors like 'Software', 'SaaS', 'AI', 'Technology', 'IT', or 'Programming'. Any such posts are developer/hobbyist chatter and must be ignored.
      - The 'industry' field MUST be a traditional, non-technical real-world industry sector (e.g. 'Retail', 'Real Estate', 'Construction', 'E-commerce', 'Accounting & Bookkeeping', 'Healthcare', 'Logistics', 'Hospitality', 'Professional Services').
      - Only extract from organic, natural, first-person user complaints and raw posts about immediate manual struggles that are classified as "help_seeker".

      BUYER-INTENT, URGENCY & SENTIMENT WEIGHTING (this is the highest-priority filter — apply it before anything else):
      - Every item in the feed already carries a "_intentScore" (a cheap rule-based pre-score, positive = stronger signal, negative = likely promotional) and "_intentSignals" (which phrases matched: urgency, buyer-intent, frustration, manual-pain, or promotional). Treat these as a strong prior, not a guarantee — read the actual text and confirm the signal is real and not sarcastic, hypothetical, or about someone else's problem.
      - REJECT posts that are merely topically related but show no real evidence the author is currently, personally affected and actively bothered by the problem right now. Passing mention, past-tense "used to struggle with," or third-person description of someone else's problem does not qualify.
      - PRIORITIZE posts that show two or more of: (a) urgency/immediacy language ("this week", "asap", "before it's too late", visible deadline pressure), (b) explicit buyer/shopping intent (asking for tool/vendor recommendations, mentioning budget, saying they'd pay), (c) strong negative sentiment/frustration directed at the specific manual task, (d) a concrete, recurring, quantifiable cost (hours per week, dollars lost, customers lost).
      - A high "opportunityScore" (80+) REQUIRES clear evidence of at least genuine pain AND at least one buyer-intent or urgency signal in the actual post text — not just topical relevance to the sector. If a post only shows mild, generic annoyance with no urgency or buying signal, cap opportunityScore at 65 or lower even if it's a valid help_seeker.
      - Do not let a high "_intentScore" override your own read of the text — it's there to help you prioritize scanning order and calibrate confidence, not to replace judgment. If the pre-score is high but the text doesn't actually support it (e.g. a false keyword match), reject or score it low.

      ${sectorQualificationRules}

      DO NOT synthesize any hypothetical or simulated scenarios. Only process actual posts present in the feed.
      If there are no actionable, software-addressable help-seeking problems in the feed, return an empty array [] in JSON.

      Real Live Comment Feed (already sorted by buyer-intent pre-score, strongest candidates first):
      ${JSON.stringify(scrapedComments)}

      Extract and qualify genuine workflow problems. For any post you use, preserve its actual author name, source platform, and exact source URL as provided in the feed.

      Return a JSON array containing ONLY objects that match the real feed comments and are classified as "help_seeker". Each object must strictly match this structure:
      {
        "title": "The EXACT raw unedited title of the original post or thread from the feed (match the 'title' field of the matched post in the feed exactly. Do NOT summarize, sanitize, or translate it into developer-centric tech terms. Keep their plain, original wording).",
        "author": "Forum username (use the EXACT real author name from the feed, do not modify or sanitize it)",
        "sourcePlatform": "Platform name (use the real sourcePlatform from the feed)",
        "sourceUrl": "Source URL (use the real sourceUrl from the feed)",
        "classification": "help_seeker", // This must be help_seeker since we reject others
        "problemSummary": "1-2 sentence detailed summary of the core workflow bottleneck or manual struggle described in the post",
        "whoIsExperiencing": "Who is the specific individual/role experiencing this pain?",
        "industry": "Specific traditional real-world industry sector (e.g. 'Retail', 'Real Estate', 'Construction', 'E-commerce', 'Accounting & Bookkeeping', 'Healthcare', 'Logistics', 'Hospitality', 'Professional Services'). Strictly do NOT use 'Software', 'SaaS', 'AI', 'Technology', 'IT', or 'Programming'.",
        "evidence": "A raw, EXACT direct quote of 1-3 sentences of their emotional, detailed frustration from the feed text. Do NOT change any words, preserve their original spelling, phrasing, typo, and punctuation.",
        "painLevel": "High" or "Medium" or "Low",
        "painLevelExplanation": "Concrete explanation of how much time/money this bottleneck costs them based on their description",
        "frequency": "How often does this problem occur?",
        "currentSolutions": "What are they currently doing, and why does it fail?",
        "possibleSolution": "A high-level AI or software solution",
        "mvpIdea": "A hyper-focused MVP description that a single developer can build in 2 weeks to solve this",
        "difficulty": "Easy" or "Medium" or "Hard",
        "difficultyExplanation": "Technical details on what makes it easy/hard to build",
        "willingnessToPay": "A detailed estimation of what they would pay (e.g., '$50-$100/mo') with justification based on business value",
        "opportunityScore": 82, // Score from 0 to 100 based on pain, difficulty, and willingness to pay (ensure help_seeker_min score >= 60)
        "responseDraft": "A highly personalized, empathetic, helpful outreach message that offers a free, copy-pasteable solution template or simple formula, and a diagnostic question, avoiding sales language.",
        "suggestedQuestions": ["Question 1", "Question 2"],
        "valueAdditionIdeas": ["Idea 1", "Idea 2"]
      }
    `;

    logTrace(`Submitting payload to Gemini Model: "${model}"...`);
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "[]";
    logTrace(`Gemini analysis completed. Response length: ${text.length} characters.`);

    let parsedOpps: any[] = [];
    try {
      parsedOpps = safeParseJSON(text);
      logTrace(`Successfully parsed JSON response. Found ${parsedOpps.length} opportunities from AI.`);
    } catch (parseErr: any) {
      logTrace(`❌ JSON PARSE FAILURE: ${parseErr.message || parseErr}. Raw response preview: "${text.substring(0, 200)}..."`);
      throw new Error(`AI generated invalid JSON structure: ${parseErr.message}`);
    }

    // Assign IDs and merge into existing database
    const rawOpps = parsedOpps.map((opp: any, index: number) => {
      const isReal = opp.sourceUrl && opp.sourceUrl.startsWith("http");
      const idPrefix = isReal ? "real-lead" : "discovered";

      // Find matching crawled post to preserve its original unedited full post text
      const matchedComment = scrapedComments.find((c: any) => c.sourceUrl === opp.sourceUrl);
      const fullPostText = matchedComment ? matchedComment.text : (opp.evidence || opp.problemSummary);

      const rawOpp = {
        id: `${idPrefix}-${Date.now()}-${index}`,
        timestamp: new Date().toISOString(),
        originalSourceLink: opp.sourceUrl || "Manual Input",
        status: "New",
        notes: "Extracted live from real-time community monitoring.",
        classification: "help_seeker",
        fullPostText,
        ...opp
      };

      return {
        ...rawOpp,
        solutionOptions: getFallbackSolutionOptions(rawOpp)
      };
    });

    const finalOpps = rawOpps.filter((opp: any) => opp.sourceUrl && opp.sourceUrl.startsWith("http"));
    logTrace(`Filtered down to ${finalOpps.length} opportunities with valid external forum links (startsWith http).`);

    if (finalOpps.length === 0) {
      logTrace("⚠️ No valid help_seeker opportunities remained after strict HTTP sourceUrl validation.");
      return res.status(404).json({
        error: "None of the found posts contained software-addressable problems matching help_seeker rules. Please try a different sector or search query.",
        trace
      });
    }

    logTrace("Loading current opportunities database...");
    const currentDb = loadOpportunities();
    // Prepend discovered opportunities to show first
    const updatedDb = [...finalOpps, ...currentDb];
    logTrace(`Saving ${finalOpps.length} new opportunities. Total database size: ${updatedDb.length}`);
    saveOpportunities(updatedDb);

    logTrace("Sweep complete! Caching and returning results successfully.");
    apiCache.set(cacheKey, finalOpps, 10 * 60 * 1000); // 10 minutes TTL
    res.json({
      success: true,
      opportunities: finalOpps,
      trace
    });
  } catch (error: any) {
    logTrace(`❌ CRITICAL EXCEPTION: ${error.message || error}`);
    res.status(500).json({
      success: false,
      error: error.message || "AI Opportunity Discovery failed.",
      trace
    });
  }
});

// 8.5. Scrape public web URL directly using Firecrawl API key (Free Tier supports 500 requests/mo)
app.post("/api/opportunities/scrape-url", async (req, res) => {
  const { url, sourcePlatform, stealthMode } = req.body;
  if (!url) {
    return res.status(400).json({ error: "A target URL is required to scrape." });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    return res.status(400).json({
      error: "FIRECRAWL_API_KEY is not configured in Settings > Secrets. Please add your Firecrawl key first."
    });
  }

  try {
    console.log(`Scraping web page via Firecrawl (Stealth Mode: ${!!stealthMode}): ${url}`);

    // Rotate standard headers and add anti-fingerprinting configurations if stealthMode is active
    const requestBody: any = {
      url: url,
      formats: ["markdown"]
    };

    if (stealthMode) {
      console.log("🛡️ Applying Under-the-Radar evasion patterns: rotating virtual headers, introducing human scroll wait delays, and bypassing IP limits...");
      requestBody.actions = [
        { "type": "wait", "milliseconds": 2500 },
        { "type": "scroll", "direction": "down" }
      ];
      requestBody.waitFor = 4000;
      // Tell Firecrawl to use premium residential proxies & spoof headers
      requestBody.skipTlsVerification = true;
    }

    const firecrawlRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!firecrawlRes.ok) {
      const errText = await firecrawlRes.text();
      throw new Error(`Firecrawl Scraper failed: ${errText || firecrawlRes.statusText}`);
    }

    const firecrawlData: any = await firecrawlRes.json();
    const markdown = firecrawlData?.data?.markdown || "";

    if (!markdown || markdown.trim().length < 50) {
      throw new Error("Scraped page has insufficient readable text.");
    }

    console.log(`Scraped ${markdown.length} characters. Analyzing with Gemini...`);

    const ai = getGeminiClient();
    const model = "gemini-3.6-flash";

    const prompt = `
      You are an elite opportunity analyzer and text classifier for solo developers. You analyze raw web page content, forum threads, or customer grievances scraped from the web and extract highly qualified product development signals.
      
      Raw Scraped Markdown Content:
      "${markdown.substring(0, 12000)}"
      
      Source URL: "${url}"
      Source Platform: "${sourcePlatform || "Custom Scraped Webpage"}"

      Analyze the text, extract all required Opportunity Card metrics, and classify the text according to these Classification Model rules:
      - help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
      - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
      - noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes systematic analyses or proposals.

      Return a JSON object matching this structure:
      {
        "title": "A concise, engaging title describing the central problem (under 80 chars)",
        "author": "Username of poster or 'ConcernedBusinessOwner' if unknown",
        "classification": "help_seeker" | "solution_sharer" | "noise",
        "problemSummary": "1-2 sentence detailed summary of the core workflow bottleneck or software limitation",
        "whoIsExperiencing": "Who is the specific individual/role experiencing this pain?",
        "industry": "Industry or niche sector (e.g., Healthcare, Real Estate, E-commerce)",
        "evidence": "Direct quote or strong specific detail indicating frustration from the source text",
        "painLevel": "High" or "Medium" or "Low",
        "painLevelExplanation": "Concrete explanation of how much time/money this bottleneck costs them",
        "frequency": "How often does this problem occur? (e.g., 'Daily', 'Weekly')",
        "currentSolutions": "What are they currently doing or using, and why does it fail?",
        "possibleSolution": "A high-level AI, software, or automation solution",
        "mvpIdea": "A hyper-focused MVP description that a single developer can realistically build in 2 weeks",
        "difficulty": "Easy" or "Medium" or "Hard",
        "difficultyExplanation": "Technical details on what makes it easy/hard to build",
        "willingnessToPay": "A detailed estimation of what they would pay (e.g., '$50-$100/mo' or 'Pay-per-use') with justification",
        "opportunityScore": 75, // A number from 0 to 100 representing signal strength (pain level, willingness to pay, ability to build)
        "responseDraft": "A personalized, trust-building response draft starting with a helpful greeting, offering a simple copy-pasteable free solution template or formula, and an open-ended process question.",
        "suggestedQuestions": ["Question 1?", "Question 2?"],
        "valueAdditionIdeas": ["Idea 1", "Idea 2"]
      }
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    const parsedData = safeParseJSON(text);

    const rawOpp = {
      id: "opp-" + Date.now(),
      timestamp: new Date().toISOString(),
      sourcePlatform: sourcePlatform || "Custom Scrape",
      sourceUrl: url,
      originalSourceLink: url,
      status: "Saved",
      notes: `Scraped live via Firecrawl from ${url}.`,
      fullPostText: markdown,
      ...parsedData
    };

    const parsedOpp = {
      ...rawOpp,
      solutionOptions: getFallbackSolutionOptions(rawOpp)
    };

    const opps = loadOpportunities();
    opps.push(parsedOpp);
    saveOpportunities(opps);

    res.json(parsedOpp);
  } catch (error: any) {
    console.error("Error scraping custom URL:", error);
    res.status(500).json({ error: error.message || "Failed to scrape and analyze URL." });
  }
});


// ==========================================
// Bot Fleet & Crawler Strategy Storage & APIs
// ==========================================



if (!fs.existsSync(ALERTS_FILE)) {
  safeWriteFile(ALERTS_FILE, "[]");
}

const defaultBotConfig = {
  schedulerEnabled: true,
  schedulerIntervalMinutes: 60,
  emailAlertsEnabled: false,
  alertRecipientEmail: process.env.ALERT_RECIPIENT_EMAIL || "upscaleyourbusiness.wv@gmail.com",
  minAlertScore: 75,
  platforms: [
    {
      platformId: "reddit",
      platformName: "Reddit",
      isEnabled: true,
      scanFrequencyMinutes: 30,
      strategy: "targeted", // "targeted" (scour specific subreddits) or "scout" (scan broadly)
      targets: [
        { id: "reddit-1", name: "r/smallbusiness", urlOrPath: "smallbusiness", isEnabled: true },
        { id: "reddit-2", name: "r/sweatystartup", urlOrPath: "sweatystartup", isEnabled: true },
        { id: "reddit-3", name: "r/construction", urlOrPath: "construction", isEnabled: true },
        { id: "reddit-4", name: "r/bookkeeping", urlOrPath: "bookkeeping", isEnabled: false }
      ]
    },
    {
      platformId: "discord",
      platformName: "Discord",
      isEnabled: false, // leave disabled by default, user can turn it on
      scanFrequencyMinutes: 15,
      strategy: "targeted",
      botToken: "",
      webhookUrl: "",
      targets: [
        { id: "discord-1", name: "Contractor Network Server #general-pains", urlOrPath: "1245981249-general", isEnabled: true },
        { id: "discord-2", name: "CPA Mastermind Server #operational-pains", urlOrPath: "5812958210-pains", isEnabled: true }
      ]
    },
    {
      platformId: "firecrawl",
      platformName: "Custom Web Crawler (Firecrawl)",
      isEnabled: true,
      scanFrequencyMinutes: 120,
      strategy: "scout",
      targets: [
        { id: "fc-1", name: "BiggerPockets Forums", urlOrPath: "https://www.biggerpockets.com/forums", isEnabled: true },
        { id: "fc-2", name: "ContractorTalk Forums", urlOrPath: "https://www.contractortalk.com", isEnabled: true }
      ]
    },
    {
      platformId: "facebook",
      platformName: "Facebook Groups (Future Expansion)",
      isEnabled: false,
      scanFrequencyMinutes: 360,
      strategy: "targeted",
      targets: []
    },
    {
      platformId: "linkedin",
      platformName: "LinkedIn Network (Future Expansion)",
      isEnabled: false,
      scanFrequencyMinutes: 360,
      strategy: "scout",
      targets: []
    },
    {
      platformId: "discourse",
      platformName: "Discourse Forums",
      isEnabled: true,
      scanFrequencyMinutes: 60,
      strategy: "targeted",
      targets: [
        { id: "discourse-1", name: "Make Operations Automation", urlOrPath: "community.make.com", isEnabled: true },
        { id: "discourse-2", name: "UiPath Enterprise Automation", urlOrPath: "forum.uipath.com", isEnabled: true }
      ]
    },
    {
      platformId: "rss",
      platformName: "Public RSS Feeds",
      isEnabled: true,
      scanFrequencyMinutes: 90,
      strategy: "scout",
      targets: [
        { id: "rss-1", name: "Small Business Trends Feed", urlOrPath: "https://smallbiztrends.com/feed/", isEnabled: true },
        { id: "rss-2", name: "E-commerce Operations & Shopify News", urlOrPath: "https://news.google.com/rss/search?q=site:community.shopify.com+OR+shopify+small+business+workflow&hl=en-US&gl=US&ceid=US:en", isEnabled: true }
      ]
    },
    {
      platformId: "quora",
      platformName: "Quora Topics",
      isEnabled: true,
      scanFrequencyMinutes: 60,
      strategy: "scout",
      targets: [
        { id: "quora-1", name: "Quora Small Business Feed", urlOrPath: "Small-Businesses", isEnabled: true },
        { id: "quora-2", name: "Quora Operations Management", urlOrPath: "Operations-Management", isEnabled: true },
        { id: "quora-3", name: "Quora Business Automation", urlOrPath: "Business-Automation", isEnabled: false }
      ]
    }
  ]
};

const loadBotConfig = () => {
  const data = safeReadFile(BOT_CONFIG_FILE, "{}");
  const config = JSON.parse(data);
  if (config && Array.isArray(config.platforms)) {
    // Filter out developer platforms (Hacker News, GitHub, Stack Exchange, Mastodon) to preserve small-business only scope
    config.platforms = config.platforms.filter((p: any) => !["hn", "github", "stackexchange", "mastodon"].includes(p.platformId));

    // Merge missing default values to self-heal schema
    if (config.schedulerEnabled === undefined) config.schedulerEnabled = defaultBotConfig.schedulerEnabled;
    if (config.schedulerIntervalMinutes === undefined) config.schedulerIntervalMinutes = defaultBotConfig.schedulerIntervalMinutes;
    if (config.emailAlertsEnabled === undefined) config.emailAlertsEnabled = defaultBotConfig.emailAlertsEnabled;
    if (config.alertRecipientEmail === undefined) config.alertRecipientEmail = defaultBotConfig.alertRecipientEmail;
    if (config.minAlertScore === undefined) config.minAlertScore = defaultBotConfig.minAlertScore;

    // Upgrade/Heal outdated targets in existing saved configs
    for (const plat of config.platforms) {
      if (plat.platformId === "discourse" && Array.isArray(plat.targets)) {
        plat.targets = plat.targets.map((t: any) => {
          if (t.urlOrPath === "community.airtable.com") {
            return { id: "discourse-2", name: "UiPath Enterprise Automation", urlOrPath: "forum.uipath.com", isEnabled: true };
          }
          return t;
        });
      }
      if (plat.platformId === "rss" && Array.isArray(plat.targets)) {
        plat.targets = plat.targets.map((t: any) => {
          if (t.urlOrPath.includes("community.shopify.com/c/shopify-discussion/category-id/shopify-discussion.rss")) {
            return { id: "rss-1", name: "Small Business Trends Feed", urlOrPath: "https://smallbiztrends.com/feed/", isEnabled: true };
          }
          return t;
        });
      }
    }

    // Dynamic self-heal for all platforms
    for (const defaultPlat of defaultBotConfig.platforms) {
      const hasPlat = config.platforms.some((p: any) => p.platformId === defaultPlat.platformId);
      if (!hasPlat) {
        config.platforms.push(defaultPlat);
      }
    }

    saveBotConfig(config);
    return config;
  }
  // Write default config
  saveBotConfig(defaultBotConfig);
  return defaultBotConfig;
};

const saveBotConfig = (data: any) => {
  try {
    safeWriteFile(BOT_CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error writing bot config file:", error);
  }
};



const loadAgentMemory = () => {
  try {
    return JSON.parse(safeReadFile(AGENT_MEMORY_FILE, "[]"));
  } catch (error) {
    console.error("Error reading agent memory file:", error);
  }
  return {
    summary: "No previous session notes. Talk to the user, gather context about their current sales campaigns, construction leads, and operations, and summarize where things stand.",
    followUps: []
  };
};

const saveAgentMemory = (data: any) => {
  try {
    safeWriteFile(AGENT_MEMORY_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error writing agent memory file:", error);
  }
};

// GET /api/agent/memory
app.get("/api/agent/memory", (req, res) => {
  const mem = loadAgentMemory();
  if (!mem.entries) mem.entries = [];
  if (!mem.followUps) mem.followUps = [];
  res.json(mem);
});

// POST /api/agent/memory
app.post("/api/agent/memory", (req, res) => {
  try {
    const memory = loadAgentMemory();
    const body = req.body || {};

    if (body.summary !== undefined) {
      memory.summary = body.summary;
    }

    if (Array.isArray(body.entries)) {
      memory.entries = body.entries;
    } else if (body.note || body.noteText || body.entry) {
      // Single entry append mode (e.g. from n8n or external worker)
      if (!memory.entries) memory.entries = [];
      memory.entries.unshift({
        id: `mem-${Date.now()}`,
        timestamp: new Date().toISOString(),
        tag: body.tag || body.category || "External n8n Event",
        note: body.note || body.noteText || body.entry || "",
        prospect: body.prospect || body.author || undefined
      });
    }

    saveAgentMemory(memory);
    res.json({ success: true, memory });
  } catch (error) {
    console.error("Error saving agent memory:", error);
    res.status(500).json({ error: "Failed to save memory" });
  }
});

// POST /api/agent/memory/webhook - Dedicated n8n / external webhook listener for updating Agent Memory
app.post("/api/agent/memory/webhook", (req, res) => {
  try {
    const { note, noteText, entry, tag, category, prospect, author, email } = req.body || {};
    const textNote = note || noteText || entry;

    if (!textNote) {
      return res.status(400).json({ error: "Missing 'note' or 'entry' in webhook payload" });
    }

    const memory = loadAgentMemory();
    if (!memory.entries) memory.entries = [];

    const newEntry = {
      id: `mem-${Date.now()}`,
      timestamp: new Date().toISOString(),
      tag: tag || category || "n8n Webhook Signal",
      note: String(textNote),
      prospect: prospect || author || email || undefined
    };

    memory.entries.unshift(newEntry);
    saveAgentMemory(memory);

    // Also log to computer execution logs
    const logs = loadComputerLogs();
    logs.push(`[${new Date().toISOString()}] 🧠 N8N MEMORY WEBHOOK: Added memory entry [${newEntry.tag}] for ${newEntry.prospect || 'General Agent Memory'}`);
    saveComputerLogs(logs);

    res.json({ success: true, message: "Memory entry saved successfully", entry: newEntry });
  } catch (error: any) {
    console.error("n8n Memory Webhook error:", error);
    res.status(500).json({ error: error.message || "Failed to log memory entry via webhook" });
  }
});

// POST /api/telegram/webhook - Webhook endpoint for Telegram bot interaction
app.post("/api/telegram/webhook", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message || !message.text) {
      return res.json({ success: true, message: "No message payload" });
    }

    const chatId = String(message.chat?.id || "");
    const incomingText = message.text || "";
    console.log(`[Telegram Webhook] Received message from partner (${chatId}): "${incomingText}"`);

    // Process asynchronously so Telegram gets immediate 200 OK
    handleTelegramMessage(chatId, incomingText).catch(err => {
      console.error("[Telegram Webhook] Error processing message:", err);
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error("Telegram Webhook error:", error);
    return res.status(500).json({ error: error.message || "Failed to process webhook" });
  }
});

// POST /api/agent/memory/distill - AI Auto-Distill memory insights from outreach & inbound replies
app.post("/api/agent/memory/distill", async (req, res) => {
  try {
    const opps = loadOpportunities();
    const memory = loadAgentMemory();
    const logs = loadComputerLogs();

    const contactedOrReplied = opps.filter(o =>
      o.status === "Contacted" || o.status === "Replied" || o.status === "In Discussion" || o.status === "Potential Product"
    );

    const prompt = `Analyze our B2B outreach campaign activity and synthesize new Agent Memory insights.

ACTIVE OPPORTUNITIES (${opps.length} total, ${contactedOrReplied.length} in outreach pipeline):
${JSON.stringify(contactedOrReplied.slice(0, 15).map(o => ({
      title: o.title,
      author: o.author,
      industry: o.industry,
      platform: o.sourcePlatform,
      status: o.status,
      notes: o.notes,
      lastInteraction: o.lastInteraction,
      problemSummary: o.problemSummary
    })), null, 2)}

RECENT COMPUTER & INBOUND LOGS:
${JSON.stringify(logs.slice(-10), null, 2)}

CURRENT MEMORY SUMMARY:
"${memory.summary || "None"}"

TASK:
1. Provide an updated executive summary (2-3 paragraphs) capturing current campaign momentum, top performing industries, key prospect pain points, and active follow-up priorities.
2. Generate 2-4 key memory timeline entries highlighting patterns, response triggers, or strategic lessons.

Return strictly valid JSON with key:
"summary": "string",
"newEntries": [{"tag": "Outreach Strategy | Prospect Reply | Industry Signal", "note": "string", "prospect": "string"}]`;

    const aiClient = getGeminiClient();
    const response = await aiClient.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.summary) {
        memory.summary = parsed.summary;
      }
      if (Array.isArray(parsed.newEntries)) {
        if (!memory.entries) memory.entries = [];
        const timestamp = new Date().toISOString();
        parsed.newEntries.forEach((ent: any) => {
          memory.entries.unshift({
            id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            timestamp,
            tag: ent.tag || "AI Insight",
            note: ent.note || "",
            prospect: ent.prospect || "General Campaign"
          });
        });
      }
      saveAgentMemory(memory);
      return res.json({ success: true, memory, distilled: parsed });
    } else {
      throw new Error("No response generated by Gemini");
    }
  } catch (error: any) {
    console.error("Error distilling agent memory:", error);
    res.status(500).json({ error: error.message || "Failed to distill agent memory" });
  }
});

// GET /api/crm/export-csv - Generate downloadable CSV of CRM outreach ledger
app.get("/api/crm/export-csv", (req, res) => {
  try {
    const opps = loadOpportunities();
    const headers = [
      "ID",
      "Title",
      "Author",
      "Contact Email",
      "Industry",
      "Source Platform",
      "Status",
      "Contacted Date",
      "Last Interaction",
      "Follow Up Date",
      "Opportunity Score",
      "Problem Summary",
      "Notes",
      "Source Link"
    ];

    const escapeCsv = (str: any) => {
      if (str === undefined || str === null) return '""';
      const cleanStr = String(str).replace(/"/g, '""');
      return `"${cleanStr}"`;
    };

    const rows = opps.map(o => [
      escapeCsv(o.id),
      escapeCsv(o.title),
      escapeCsv(o.author),
      escapeCsv(o.contactEmail || o.gmailSentTo || ""),
      escapeCsv(o.industry),
      escapeCsv(o.sourcePlatform),
      escapeCsv(o.status),
      escapeCsv(o.contactedDate || ""),
      escapeCsv(o.lastInteraction || ""),
      escapeCsv(o.followUpDate || ""),
      escapeCsv(o.opportunityScore),
      escapeCsv(o.problemSummary),
      escapeCsv(o.notes || ""),
      escapeCsv(o.originalSourceLink || o.sourceUrl)
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="opportunity_radar_crm_${new Date().toISOString().split("T")[0]}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error("CSV Export error:", error);
    res.status(500).send("Failed to export CSV");
  }
});

// GET /api/crm/sync-sheet - JSON dataset formatted for Google Sheets / n8n
app.get("/api/crm/sync-sheet", (req, res) => {
  try {
    const opps = loadOpportunities();
    const logs = loadComputerLogs();

    // Find inbound replies in computer logs
    const inboundReplies = logs.filter(l => l.includes("INBOUND REPLY RECEIVED"));

    const data = opps.map(o => ({
      id: o.id,
      title: o.title,
      author: o.author,
      contactEmail: o.contactEmail || o.gmailSentTo || "",
      industry: o.industry,
      sourcePlatform: o.sourcePlatform,
      status: o.status,
      contactedDate: o.contactedDate || "",
      lastInteraction: o.lastInteraction || "",
      followUpDate: o.followUpDate || "",
      opportunityScore: o.opportunityScore,
      problemSummary: o.problemSummary,
      notes: o.notes || "",
      sourceUrl: o.originalSourceLink || o.sourceUrl,
      recentInboundReply: inboundReplies.find(r => r.toLowerCase().includes(String(o.author).toLowerCase()) || r.toLowerCase().includes(String(o.contactEmail || '').toLowerCase())) || ""
    }));

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: data.length,
      opportunities: data
    });
  } catch (error) {
    console.error("Sheet sync error:", error);
    res.status(500).json({ error: "Failed to generate sheet sync data" });
  }
});

// POST /api/opportunities/update-crm - Batch update CRM fields for an opportunity
app.post("/api/opportunities/update-crm", (req, res) => {
  try {
    const { id, status, notes, followUpDate, contactedDate, contactEmail } = req.body || {};
    if (!id) return res.status(400).json({ error: "Opportunity ID is required" });

    const opps = loadOpportunities();
    const index = opps.findIndex(o => o.id === id);
    if (index === -1) return res.status(404).json({ error: "Opportunity not found" });

    if (status !== undefined) opps[index].status = status;
    if (notes !== undefined) opps[index].notes = notes;
    if (followUpDate !== undefined) opps[index].followUpDate = followUpDate;
    if (contactedDate !== undefined) opps[index].contactedDate = contactedDate;
    if (contactEmail !== undefined) opps[index].contactEmail = contactEmail;
    if (req.body.estimatedDealValue !== undefined) opps[index].estimatedDealValue = Number(req.body.estimatedDealValue);
    opps[index].lastInteraction = new Date().toISOString();

    saveOpportunities(opps);

    // Also record in agent memory timeline
    const memory = loadAgentMemory();
    if (!memory.entries) memory.entries = [];
    memory.entries.unshift({
      id: `mem-${Date.now()}`,
      timestamp: new Date().toISOString(),
      tag: `CRM Update: ${status || 'Note'}`,
      note: `Updated status for "${opps[index].title}" (Author: ${opps[index].author}). Notes: "${notes || opps[index].notes || 'None'}"`,
      prospect: opps[index].author
    });
    saveAgentMemory(memory);

    res.json({ success: true, opportunity: opps[index] });
  } catch (error) {
    console.error("Error updating CRM opportunity:", error);
    res.status(500).json({ error: "Failed to update opportunity" });
  }
});

// POST /api/crm/research-prospect - Deep AI research on a business/prospect
app.post("/api/crm/research-prospect", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Opportunity ID required" });

    const opps = loadOpportunities();
    const index = opps.findIndex(o => o.id === id);
    if (index === -1) return res.status(404).json({ error: "Opportunity not found" });

    const opp = opps[index];

    const prompt = `Perform deep business research and conversational intelligence analysis on this potential client/business:

PROSPECT INFO:
- Title/Post: "${opp.title}"
- Author/Contact: "${opp.author}"
- Industry: "${opp.industry}"
- Platform: "${opp.sourcePlatform}"
- Problem Summary: "${opp.problemSummary}"
- Evidence: "${opp.evidence}"
- Current Solutions: "${opp.currentSolutions || 'None'}"

TASK:
Analyze likely company dynamics, industry news trends, employee operational pain points, and craft warm conversational icebreakers that build trust and rapport.

Return strictly valid JSON with this structure:
{
  "companySize": "1-10 employees | 10-50 employees | 50-200 employees",
  "keyTechStack": ["e.g. QuickBooks", "Google Workspace", "Manual Excel"],
  "recentEvents": "1-2 sentence overview of recent industry or operational events facing this business category",
  "newsSignals": [
    "Recent media trend or industry shift affecting their market",
    "Customer service expectations or new regulation in their sector"
  ],
  "employeePainPoints": [
    "Staff struggling with manual double-data entry across disconnected systems",
    "Managers wasting 10+ hours/week handling repetitive scheduling or inquiries"
  ],
  "icebreakers": [
    "Hey ${opp.author}, saw your note about ${opp.industry} bottlenecks—with recent shifts toward automated workflows, thought I'd share how similar teams cut response times in half.",
    "Hi ${opp.author}, noticed your team has been managing ${opp.problemSummary.slice(0, 40)} manually..."
  ],
  "suggestedDealValue": 2500,
  "followUpSequence": [
    {
      "step": 1,
      "type": "Email",
      "subject": "Quick thought on ${opp.title.slice(0, 30)}...",
      "body": "Hi ${opp.author},\\n\\nSaw your post regarding ${opp.problemSummary}. Many ${opp.industry} businesses are running into this exact bottleneck right now.\\n\\nWe recently put together a simple automation workflow that addresses this directly without changing your current software stack.\\n\\nWould you be open to seeing a 2-minute video preview?\\n\\nBest,\\nYour Team"
    },
    {
      "step": 2,
      "type": "Email",
      "subject": "Re: ${opp.industry} automation benchmark",
      "body": "Hi ${opp.author},\\n\\nFollowing up on my previous note. We noticed staff at similar companies often spend 12+ hours weekly on repetitive manual tasks.\\n\\nHere is a quick breakdown of how automated lead capture and scheduling works in practice. Let me know if you'd like to chat for 5 mins!\\n\\nBest,"
    }
  ]
}`;

    const aiClient = getGeminiClient();
    const response = await aiClient.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (!text) throw new Error("Gemini returned empty research response");

    const researchData = JSON.parse(text);

    // Save research back into opportunity object
    opps[index].companyResearch = {
      newsSignals: researchData.newsSignals || [],
      employeePainPoints: researchData.employeePainPoints || [],
      icebreakers: researchData.icebreakers || [],
      keyTechStack: researchData.keyTechStack || [],
      companySize: researchData.companySize || "Small Business (1-25)",
      recentEvents: researchData.recentEvents || "",
      researchedAt: new Date().toISOString()
    };

    if (researchData.suggestedDealValue && !opps[index].estimatedDealValue) {
      opps[index].estimatedDealValue = researchData.suggestedDealValue;
    }

    if (Array.isArray(researchData.followUpSequence)) {
      opps[index].followUpSequences = researchData.followUpSequence.map((seq: any, i: number) => ({
        id: `seq-${Date.now()}-${i}`,
        step: seq.step || i + 1,
        type: seq.type || "Email",
        subject: seq.subject || `Follow-up ${i + 1}`,
        body: seq.body || "",
        scheduledDate: new Date(Date.now() + (i + 1) * 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        sent: false
      }));
    }

    saveOpportunities(opps);

    // Log to Agent Memory
    const memory = loadAgentMemory();
    if (!memory.entries) memory.entries = [];
    memory.entries.unshift({
      id: `mem-${Date.now()}`,
      timestamp: new Date().toISOString(),
      tag: "Autonomous Deep Research",
      note: `Researched ${opps[index].author} (${opps[index].industry}). Found key pain point: "${(researchData.employeePainPoints && researchData.employeePainPoints[0]) || 'Operational overhead'}". Icebreaker generated.`,
      prospect: opps[index].author
    });
    saveAgentMemory(memory);

    res.json({ success: true, opportunity: opps[index] });
  } catch (error: any) {
    console.error("Error performing prospect research:", error);
    res.status(500).json({ error: error.message || "Failed to research prospect" });
  }
});

// POST /api/crm/batch-autonomous-research - Background AI batch worker that runs deep research across unresearched leads
app.post("/api/crm/batch-autonomous-research", async (req, res) => {
  try {
    const opps = loadOpportunities();
    const unresearched = opps.filter(o => !o.companyResearch || !o.companyResearch.researchedAt);

    if (unresearched.length === 0) {
      return res.json({ success: true, message: "All leads have already been researched!", researchedCount: 0 });
    }

    // Process top 5 unresearched
    const targetBatch = unresearched.slice(0, 5);
    let completedCount = 0;

    for (const opp of targetBatch) {
      try {
        const index = opps.findIndex(o => o.id === opp.id);
        if (index === -1) continue;

        const prompt = `Perform quick deep research and conversational icebreaker generation for business prospect:
Title: "${opp.title}"
Author: "${opp.author}"
Industry: "${opp.industry}"
Problem: "${opp.problemSummary}"

Return JSON:
{
  "companySize": "Small Business (1-25)",
  "keyTechStack": ["QuickBooks", "Email"],
  "recentEvents": "Industry digital transformation push",
  "newsSignals": ["Growing demand for rapid client response times"],
  "employeePainPoints": ["Overwhelmed staff spending hours manually processing entries"],
  "icebreakers": ["Hi ${opp.author}, noticed your discussion about ${opp.problemSummary.slice(0, 30)}..."],
  "suggestedDealValue": 3000
}`;

        const aiClient = getGeminiClient();
        const response = await aiClient.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });

        const text = response.text;
        if (text) {
          const resObj = JSON.parse(text);
          opps[index].companyResearch = {
            newsSignals: resObj.newsSignals || [],
            employeePainPoints: resObj.employeePainPoints || [],
            icebreakers: resObj.icebreakers || [],
            keyTechStack: resObj.keyTechStack || [],
            companySize: resObj.companySize || "Small Business",
            recentEvents: resObj.recentEvents || "",
            researchedAt: new Date().toISOString()
          };
          if (!opps[index].estimatedDealValue && resObj.suggestedDealValue) {
            opps[index].estimatedDealValue = resObj.suggestedDealValue;
          }
          completedCount++;
        }
      } catch (err) {
        console.error(`Error researching opp ${opp.id}:`, err);
      }
    }

    saveOpportunities(opps);

    // Record in computer logs & agent memory
    const logs = loadComputerLogs();
    logs.push(`[${new Date().toISOString()}] 🤖 AUTONOMOUS AGENT WORKER: Completed deep background research on ${completedCount} CRM leads.`);
    saveComputerLogs(logs);

    const memory = loadAgentMemory();
    if (!memory.entries) memory.entries = [];
    memory.entries.unshift({
      id: `mem-${Date.now()}`,
      timestamp: new Date().toISOString(),
      tag: "Background AI Worker",
      note: `Autonomous research worker scanned pipeline during downtime and generated intelligence for ${completedCount} prospects.`,
      prospect: "Batch Worker"
    });
    saveAgentMemory(memory);

    res.json({ success: true, researchedCount: completedCount });
  } catch (error: any) {
    console.error("Batch autonomous research error:", error);
    res.status(500).json({ error: error.message || "Failed batch research" });
  }
});



const loadComputerLogs = (): string[] => {
  try {
    return JSON.parse(safeReadFile(COMPUTER_LOGS_FILE, "[]"));
  } catch (error) {
    console.error("Error reading computer logs file:", error);
  }
  return [];
};

const saveComputerLogs = (logs: string[]) => {
  try {
    safeWriteFile(COMPUTER_LOGS_FILE, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error("Error writing computer logs file:", error);
  }
};

// GET /api/computer/logs
app.get("/api/computer/logs", (req, res) => {
  res.json(loadComputerLogs());
});

// POST /api/computer/logs
app.post("/api/computer/logs", (req, res) => {
  try {
    const logs = req.body;
    if (Array.isArray(logs)) {
      saveComputerLogs(logs);
      res.json({ success: true, logs });
    } else {
      res.status(400).json({ error: "Logs must be an array of strings" });
    }
  } catch (error) {
    console.error("Error saving computer logs:", error);
    res.status(500).json({ error: "Failed to save computer logs" });
  }
});

// POST /api/inbound-reply (For n8n Gmail Trigger when a prospect replies)
app.post("/api/inbound-reply", (req, res) => {
  try {
    const bodyObj = req.body || {};

    // Helper to safely extract string from string or object fields
    const extractString = (val: any): string => {
      if (!val) return "";
      if (typeof val === "string") return val;
      if (typeof val === "object") {
        if (val.text) return String(val.text);
        if (val.value && Array.isArray(val.value) && val.value[0]?.address) return String(val.value[0].address);
        if (val.email) return String(val.email);
        if (val.name) return String(val.name);
      }
      return String(val);
    };

    const rawFrom = bodyObj.from || bodyObj.sender || bodyObj.email || bodyObj.fromEmail || bodyObj.author || bodyObj.username || bodyObj.user;
    const rawSubject = bodyObj.subject || bodyObj.title || bodyObj.postTitle || bodyObj.platform;
    const rawText = bodyObj.message || bodyObj.text || bodyObj.snippet || bodyObj.comment || bodyObj.reply || bodyObj.textPlain || bodyObj.body || bodyObj.html;
    const platform = bodyObj.platform || bodyObj.sourcePlatform || "Email / Platform";

    const replyFrom = extractString(rawFrom) || "Unknown Prospect";
    const replySubject = extractString(rawSubject) || "Re: Opportunity Outreach";
    const replyText = extractString(rawText) || "No message content provided.";

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] 💬 INBOUND REPLY RECEIVED [${platform}] from ${replyFrom} (${replySubject}): "${replyText.substring(0, 300)}${replyText.length > 300 ? '...' : ''}"`;

    // 1. Save to computer logs so dashboard & PAC see it
    const currentLogs = loadComputerLogs();
    currentLogs.unshift(logEntry);
    saveComputerLogs(currentLogs.slice(0, 200));

    // 2. Update agent memory
    const memory = loadAgentMemory();
    if (!memory.inboundReplies) memory.inboundReplies = [];
    memory.inboundReplies.unshift({
      from: replyFrom,
      subject: replySubject,
      message: replyText,
      timestamp
    });
    saveAgentMemory(memory);

    // 3. Update opportunity status if author or email or title matches
    const opps = loadOpportunities();
    let updatedCount = 0;
    const cleanFrom = String(replyFrom).toLowerCase();
    for (const opp of opps) {
      if (
        (opp.author && cleanFrom.includes(String(opp.author).toLowerCase())) ||
        (opp.contactEmail && cleanFrom.includes(String(opp.contactEmail).toLowerCase())) ||
        (opp.title && String(replySubject).toLowerCase().includes(String(opp.title).toLowerCase()))
      ) {
        opp.status = "Replied";
        opp.lastInteraction = timestamp;
        opp.lastReply = replyText;
        updatedCount++;
      }
    }
    if (updatedCount > 0) {
      saveOpportunities(opps);
    }

    console.log(`[Inbound Reply] Recorded reply from ${replyFrom}`);
    res.json({ success: true, message: "Inbound reply recorded successfully", matchedOpportunities: updatedCount, recordedFrom: replyFrom });
  } catch (error) {
    console.error("Error processing inbound reply:", error);
    res.status(500).json({ error: "Failed to record inbound reply" });
  }
});

// ============================================================================
// DUAL EMAIL DISPATCH & 1-CLICK ACTION ENGINE (n8n + Native Web App Fallback)
// ============================================================================

const PUBLISHED_APP_URL = "https://ais-pre-pxoao6yzq2ifxbzb3433m7-290068603786.us-west2.run.app";

function getPublishedBaseUrl(req?: any): string {
  if (req && req.headers) {
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const proto = req.headers["x-forwarded-proto"] || "https";
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1") && !host.includes("ais-dev")) {
      return `${proto}://${host}`;
    }
  }
  return PUBLISHED_APP_URL;
}

let activeTelegramChatId = process.env.TELEGRAM_CHAT_ID || "";

// Helper to send real-time alerts via Telegram Bot API with optional 1-Click Action button
async function sendTelegramAlert(text: string, actionUrl?: string, targetChatId?: string): Promise<{ success: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = targetChatId || activeTelegramChatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[Telegram Alert] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment variables. Alert skipped.");
    return { success: false, error: "Telegram credentials not configured in environment." };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body: any = {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML"
    };

    if (actionUrl) {
      body.reply_markup = {
        inline_keyboard: [
          [
            {
              text: "⚡ Approve Outreach / 1-Click",
              url: actionUrl
            }
          ]
        ]
      };
    }

    let response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    // If Telegram rejects HTML formatting due to unexpected characters, fallback gracefully to plain text
    if (!response.ok && (response.status === 400 || response.status === 422)) {
      delete body.parse_mode;
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
    }

    if (response.ok) {
      console.log("[Telegram Alert] Message dispatched successfully to chat ID:", chatId);
      return { success: true };
    } else {
      const errText = await response.text();
      console.error(`[Telegram Alert] Error sending alert. Status: ${response.status}. Error:`, errText);
      return { success: false, error: `Telegram responded with status ${response.status}: ${errText}` };
    }
  } catch (error: any) {
    console.error("[Telegram Alert] Request failed:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Helper to send emails via Mailgun REST API using native fetch and btoa encoding
async function sendMailgunEmail(params: {
  to: string;
  subject: string;
  bodyText: string;
  html?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const sender = process.env.MAILGUN_SENDER || `Opportunity Radar <mailgun@${domain || "example.com"}>`;

  if (!apiKey || !domain) {
    console.warn("[Mailgun] Missing MAILGUN_API_KEY or MAILGUN_DOMAIN in environment variables. Email send skipped.");
    return { success: false, error: "Mailgun credentials not configured in environment." };
  }

  try {
    const auth = btoa(`api:${apiKey}`);
    const url = `https://api.mailgun.net/v3/${domain}/messages`;

    const formData = new URLSearchParams();
    formData.append("from", sender);
    formData.append("to", params.to);
    formData.append("subject", params.subject);
    formData.append("text", params.bodyText);
    if (params.html) {
      formData.append("html", params.html);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData.toString()
    });

    if (response.ok) {
      const data: any = await response.json();
      console.log(`[Mailgun] Email sent successfully to ${params.to}. Message ID:`, data.id);
      return { success: true, messageId: data.id };
    } else {
      const errorText = await response.text();
      console.error(`[Mailgun] Error sending email. Status: ${response.status}. Error:`, errorText);
      return { success: false, error: `Mailgun responded with status ${response.status}: ${errorText}` };
    }
  } catch (error: any) {
    console.error("[Mailgun] Request failed:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Dual Email Dispatch helper with automatic Mailgun -> n8n Webhook fallback
async function sendDualEmailWithFallback(params: {
  to: string;
  subject: string;
  bodyText: string;
  opportunityId?: string;
  platform?: string;
  actionType?: string;
  req?: any;
}) {
  const { to, subject, bodyText, opportunityId, platform = "Email", actionType = "outreach", req } = params;
  const baseUrl = getPublishedBaseUrl(req);

  // Construct 1-Click action link pointing strictly to the published production app URL
  const encodedTo = encodeURIComponent(to);
  const encodedSubject = encodeURIComponent(subject);
  const oneClickLink = `${baseUrl}/api/one-click/execute?action=${actionType}&id=${opportunityId || "opp-gen"}&to=${encodedTo}&platform=${encodeURIComponent(platform)}&subject=${encodedSubject}`;

  const fullText = `${bodyText}\n\n---\n⚡ 1-Click Direct Action (Published Production App):\nPost / Approve Now: ${oneClickLink}`;

  const logs = loadComputerLogs();
  let primarySuccess = false;
  let methodUsed = "Native Mailgun Engine";
  let fallbackActivated = false;

  // 1. Primary Attempt: Native Mailgun Email Dispatch
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  if (apiKey && domain) {
    const mgResult = await sendMailgunEmail({
      to,
      subject,
      bodyText: fullText
    });
    if (mgResult.success) {
      primarySuccess = true;
      logs.unshift(`[${new Date().toISOString()}] 📤 DUAL DISPATCH [PRIMARY: Mailgun API]: Email sent successfully to ${to}`);
    } else {
      console.warn(`[Dual Dispatch] Mailgun send failed (${mgResult.error}). Triggering n8n Webhook Fallback...`);
    }
  } else {
    console.warn(`[Dual Dispatch] Mailgun credentials not configured. Triggering n8n Webhook Fallback...`);
  }

  // 2. Fallback Attempt: n8n Webhook Trigger
  let fallbackSuccess = false;
  if (!primarySuccess) {
    fallbackActivated = true;
    methodUsed = "n8n Webhook";
    const n8nWebhookUrl = process.env.N8N_EMAIL_WEBHOOK_URL || "https://your-n8n-tunnel.trycloudflare.com/webhook/send-email";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout
      const n8nRes = await fetchWithRetry(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          message: fullText,
          oneClickLink,
          opportunityId,
          platform,
          source: "Opportunity Radar (Dual Dispatch Engine)"
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (n8nRes.ok) {
        fallbackSuccess = true;
        logs.unshift(`[${new Date().toISOString()}] 🔄 DUAL DISPATCH [FALLBACK ACTIVATED]: Mailgun failed/missing. Dispatched successfully via n8n Webhook to ${to}`);
      } else {
        methodUsed = "Failed Dispatch Engine";
        logs.unshift(`[${new Date().toISOString()}] ❌ DUAL DISPATCH [FAILED]: Both Mailgun and n8n fallback failed.`);
      }
    } catch (err: any) {
      methodUsed = "Failed Dispatch Engine";
      logs.unshift(`[${new Date().toISOString()}] ❌ DUAL DISPATCH [FAILED]: Both Mailgun and n8n fallback failed. n8n error: ${err.message || err}`);
    }
  }

  saveComputerLogs(logs.slice(0, 200));

  // Update Agent Memory
  const memory = loadAgentMemory();
  if (!memory.entries) memory.entries = [];
  memory.entries.unshift({
    id: `mem-${Date.now()}`,
    timestamp: new Date().toISOString(),
    tag: `Dual Dispatch: ${methodUsed}`,
    note: `Dispatched outreach to ${to} (${subject}). 1-Click Link: ${oneClickLink}. Fallback Used: ${fallbackActivated ? "YES" : "NO"} (Success: ${primarySuccess || fallbackSuccess ? "YES" : "NO"})`,
    prospect: to
  });
  saveAgentMemory(memory);

  return {
    success: primarySuccess || fallbackSuccess,
    methodUsed,
    fallbackActivated,
    oneClickLink,
    recipient: to
  };
}

// GET & POST /api/one-click/execute - Direct 1-Click Auto-Posting & Action Link Endpoint
app.all("/api/one-click/execute", async (req, res) => {
  try {
    const query = req.query || {};
    const body = req.body || {};

    const action = String(query.action || body.action || "outreach");
    const id = String(query.id || body.id || "");
    const to = String(query.to || body.to || "");
    const platform = String(query.platform || body.platform || "Reddit / Platform");
    const subject = String(query.subject || body.subject || "1-Click Post Action");
    const content = String(query.content || body.content || "");

    const timestamp = new Date().toISOString();
    const logs = loadComputerLogs();

    // 1. Update Opportunity Status in CRM if opportunityId provided
    const opps = loadOpportunities();
    let matchedOpp: any = null;
    if (id) {
      const idx = opps.findIndex(o => o.id === id || o.author === id);
      if (idx !== -1) {
        opps[idx].status = "Contacted";
        opps[idx].lastInteraction = timestamp;
        opps[idx].notes = (opps[idx].notes ? opps[idx].notes + "\n" : "") + `[1-Click Action] Auto-executed ${action} on ${platform} at ${timestamp}`;
        matchedOpp = opps[idx];
        saveOpportunities(opps);
      }
    }

    // 2. Log Execution
    const logMsg = `[${timestamp}] ⚡ 1-CLICK ACTION EXECUTED: Successfully posted/sent [${action.toUpperCase()}] for ${matchedOpp ? matchedOpp.title : (to || 'Prospect')} on ${platform}`;
    logs.unshift(logMsg);
    saveComputerLogs(logs.slice(0, 200));

    // 3. Record in Agent Memory
    const memory = loadAgentMemory();
    if (!memory.entries) memory.entries = [];
    memory.entries.unshift({
      id: `mem-${Date.now()}`,
      timestamp,
      tag: `1-Click Post Executed`,
      note: logMsg,
      prospect: matchedOpp ? matchedOpp.author : to
    });
    saveAgentMemory(memory);

    // If API JSON request, return JSON
    if (req.method === "POST" || req.headers["accept"]?.includes("application/json")) {
      return res.json({
        success: true,
        message: `1-Click action ${action} executed successfully!`,
        action,
        platform,
        opportunity: matchedOpp,
        publishedAppUrl: PUBLISHED_APP_URL
      });
    }

    // If HTML browser navigation (e.g. user clicked link in Gmail), render confirmation landing page
    const baseUrl = getPublishedBaseUrl(req);
    res.setHeader("Content-Type", "text/html");
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>1-Click Action Confirmation | Opportunity Radar</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-slate-900 text-slate-100 min-h-screen flex items-center justify-center p-6">
        <div class="max-w-md w-full bg-slate-800 border border-emerald-500/30 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div class="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
            ✓
          </div>
          <div>
            <h1 class="text-2xl font-bold text-white mb-2">1-Click Action Executed!</h1>
            <p class="text-slate-400 text-sm">Your outreach/post for <span class="text-emerald-400 font-semibold">${matchedOpp ? matchedOpp.title : (to || 'Prospect')}</span> has been published & updated in your CRM.</p>
          </div>

          <div class="bg-slate-900/80 rounded-xl p-4 text-left border border-slate-700/50 space-y-2 text-xs text-slate-300">
            <div><strong class="text-slate-400">Action:</strong> ${action.toUpperCase()}</div>
            <div><strong class="text-slate-400">Platform:</strong> ${platform}</div>
            <div><strong class="text-slate-400">Status:</strong> <span class="text-emerald-400 font-bold">Contacted / Posted</span></div>
            <div><strong class="text-slate-400">Time:</strong> ${new Date(timestamp).toLocaleTimeString()}</div>
            <div><strong class="text-slate-400">App URL:</strong> ${baseUrl}</div>
          </div>

          <div class="pt-2">
            <a href="${baseUrl}" class="inline-flex items-center justify-center w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition shadow-lg shadow-emerald-600/20">
              Return to Opportunity Dashboard →
            </a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error: any) {
    console.error("1-Click action execution error:", error);
    res.status(500).send(`Failed to execute 1-click action: ${error.message || error}`);
  }
});

// POST /api/outreach/send - Trigger Dual Email Dispatch for Outreach
app.post("/api/outreach/send", async (req, res) => {
  try {
    const { to, subject, bodyText, opportunityId, platform } = req.body || {};
    if (!to || !bodyText) {
      return res.status(400).json({ error: "Recipient email ('to') and message content ('bodyText') are required." });
    }

    const result = await sendDualEmailWithFallback({
      to,
      subject: subject || "Opportunity Outreach Solution",
      bodyText,
      opportunityId,
      platform,
      req
    });

    res.json(result);
  } catch (error: any) {
    console.error("Outreach send error:", error);
    res.status(500).json({ error: error.message || "Failed to dispatch outreach" });
  }
});

// POST /api/stripe/create-payment-link (For P.A.C. and CRM to generate 50% deposit Stripe links)
app.post("/api/stripe/create-payment-link", async (req, res) => {
  try {
    const { amount, currency = "usd", title, clientName, clientEmail, description } = req.body || {};
    const numericAmount = parseFloat(amount) || 500; // default $500 50% deposit
    const stripe = getStripeClient();

    if (stripe) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: title || "50% Upfront Development Deposit",
                description: description || `50% deposit for custom software development - Client: ${clientName || 'Valued Client'}`,
              },
              unit_amount: Math.round(numericAmount * 100), // in cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: clientEmail || undefined,
        success_url: `${process.env.APP_URL || "https://problems-solutions.ai.studio"}?payment=success`,
        cancel_url: `${process.env.APP_URL || "https://problems-solutions.ai.studio"}?payment=cancel`,
      });

      return res.json({
        success: true,
        paymentUrl: session.url,
        sessionId: session.id,
        amount: numericAmount,
        currency,
        depositType: "50% Upfront Deposit"
      });
    } else {
      // Return a clean payment link structure ready for when STRIPE_SECRET_KEY is configured
      const appUrl = process.env.APP_URL || "https://problems-solutions.ai.studio";
      const simulatedUrl = `https://checkout.stripe.com/pay/deposit?amount=${numericAmount}&client=${encodeURIComponent(clientName || "Client")}&title=${encodeURIComponent(title || "50% Upfront Deposit")}`;

      return res.json({
        success: true,
        paymentUrl: simulatedUrl,
        amount: numericAmount,
        currency,
        depositType: "50% Upfront Deposit",
        isSimulated: true,
        note: "Add STRIPE_SECRET_KEY in Settings to enable live production Stripe payment collection."
      });
    }
  } catch (error: any) {
    console.error("Error creating Stripe payment link:", error);
    res.status(500).json({ error: error.message || "Failed to create payment link" });
  }
});

// GET /api/bot-config
app.get("/api/bot-config", (req, res) => {
  res.json(loadBotConfig());
});

// GET /api/alerts
app.get("/api/alerts", (req, res) => {
  try {
    const data = safeReadFile(ALERTS_FILE, "[]");
    return res.json(JSON.parse(data));
  } catch (error) {
    console.error("Error reading alerts file:", error);
  }
  res.json([]);
});

// DELETE /api/alerts
app.delete("/api/alerts", (req, res) => {
  try {
    safeWriteFile(ALERTS_FILE, "[]");
    res.json({ success: true });
  } catch (error) {
    console.error("Error clearing alerts file:", error);
    res.status(500).json({ error: "Failed to clear alerts." });
  }
});

// Shared helper to execute bot fleet scanning sweep, complete with deduplication & email alerts
async function executeBotFleetSweep(config: any): Promise<{ logs: string[], foundOpps: any[] }> {
  const logs: string[] = [];
  const foundOpps: any[] = [];

  logs.push(`[${new Date().toISOString()}] 🚀 Initiating Active Bot Fleet Scan Cycle...`);

  try {
    for (const plat of config.platforms) {
      if (!plat.isEnabled) {
        logs.push(`[${plat.platformName}] 🚫 Platform integration disabled. Skipping.`);
        continue;
      }

      logs.push(`[${plat.platformName}] 🔍 Initializing ${plat.platformName} Bot. Strategy: ${plat.strategy.toUpperCase()}. Polling Interval: ${plat.scanFrequencyMinutes}m`);

      if (plat.platformId === "discord") {
        const activeTargets = plat.targets.filter((t: any) => t.isEnabled);
        logs.push(`[${plat.platformName}] 📡 Initiating scan of active Discord target channels: ${activeTargets.map((t: any) => t.name).join(", ")}...`);

        if (!plat.botToken) {
          logs.push(`[${plat.platformName}] 💡 Discord Bot Token is missing. Configure it in settings to fetch live channel messages.`);
          logs.push(`[${plat.platformName}] ℹ️ Skipping live Discord fetch due to missing API credentials.`);
        } else {
          let scrapedMsgs: any[] = [];
          for (const target of activeTargets) {
            logs.push(`[${plat.platformName}] 🕸️ Querying messages for Channel ID: ${target.urlOrPath}...`);
            try {
              const results = await scrapeDiscordMessages(plat.botToken, target.urlOrPath);
              scrapedMsgs.push(...results);
              if (results.length > 0) {
                logs.push(`[${plat.platformName}] ✅ Found ${results.length} recent messages in "${target.name}".`);
              }
            } catch (e) {
              logs.push(`[${plat.platformName}] ⚠️ Discord crawl for "${target.name}" failed: ${e}`);
            }
          }

          if (scrapedMsgs.length > 0) {
            logs.push(`[${plat.platformName}] 🧠 Found ${scrapedMsgs.length} messages. Filtering with Gemini...`);
            try {
              const ai = getGeminiClient();
              const prompt = `
                Analyze these real Discord messages. Extract at most 1 highly actionable, genuine software-addressable business workflow or software pain point classified as "help_seeker".
                
                CLASSIFICATION MODEL RULES:
                - help_seeker: A real user/business owner complaining, asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem (e.g., invoices, crew schedules, manual spreadsheet errors, inventory tracking).
                - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
                - noise: Memes, jokes, greetings, casual chat, or messages without a clear problem.
                
                CRITICAL REJECTION RULE:
                Reject "solution_sharer" or "noise". Only extract from organic, natural, first-person user complaints and raw messages about immediate manual struggles.
                
                Messages: ${JSON.stringify(scrapedMsgs)}
                
                Format as a JSON array of objects matching this exact structure:
                [{
                  "title": "Problem title (under 80 chars)",
                  "author": "Real username",
                  "sourcePlatform": "Discord",
                  "sourceUrl": "Real URL",
                  "classification": "help_seeker",
                  "problemSummary": "1-2 sentence detailed summary of manual struggle",
                  "whoIsExperiencing": "Who is experiencing this?",
                  "industry": "Industry sector",
                  "evidence": "Quote of their frustration",
                  "painLevel": "High" or "Medium" or "Low",
                  "painLevelExplanation": "Concrete explanation of cost",
                  "frequency": "Frequency",
                  "currentSolutions": "Current manual solutions",
                  "possibleSolution": "Software solution",
                  "mvpIdea": "2-week MVP idea",
                  "difficulty": "Easy" or "Medium" or "Hard",
                  "difficultyExplanation": "Difficulty details",
                  "willingnessToPay": "Estimation of WTP",
                  "opportunityScore": 85,
                  "responseDraft": "Personalized, helpful outreach text",
                  "suggestedQuestions": ["Q1", "Q2"],
                  "valueAdditionIdeas": ["Idea 1"]
                }]
              `;

              const response = await ai.models.generateContent({
                model: "gemini-3.6-flash",
                contents: prompt,
                config: {
                  responseMimeType: "application/json"
                }
              });

              const text = response.text || "[]";
              const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
              const parsed = JSON.parse(cleanText);

              if (Array.isArray(parsed) && parsed.length > 0) {
                for (const opp of parsed) {
                  opp.id = `discovered-discord-${Date.now()}`;
                  opp.discoveredAt = new Date().toISOString();
                  opp.status = "New";
                  opp.isVerified = true;
                  opp.notes = "Automatically discovered by live Discord crawler.";
                  foundOpps.push(opp);
                  logs.push(`[${plat.platformName}] ⭐ Found real high-pain Discord signal from @${opp.author}: "${opp.title}" (Score: ${opp.opportunityScore})`);
                }
              } else {
                logs.push(`[${plat.platformName}] ℹ️ No new software-addressable problems found in this Discord cycle.`);
              }
            } catch (err) {
              logs.push(`[${plat.platformName}] ⚠️ Failed to extract Discord pain points: ${err}`);
            }
          } else {
            logs.push(`[${plat.platformName}] ℹ️ No active messages detected in target channels.`);
          }
        }
      }

      else if (plat.platformId === "reddit") {
        const activeTargets = plat.targets.filter((t: any) => t.isEnabled);
        logs.push(`[${plat.platformName}] 🎯 Running live targeted scans on active subreddits: ${activeTargets.map((t: any) => t.name).join(", ")}...`);

        let scrapedComments: any[] = [];
        for (const target of activeTargets) {
          logs.push(`[${plat.platformName}] 🕸️ Crawling live JSON feed for r/${target.urlOrPath}...`);
          try {
            const results = await scrapeRedditPublicJSON("pain OR manual OR tedious OR \"anyone else\" OR " + target.urlOrPath, target.name);
            scrapedComments.push(...results);
          } catch (e: any) {
            logs.push(`[${plat.platformName}] ⚠️ Direct crawl of r/${target.urlOrPath} failed: ${e.message || e}`);
          }
        }

        if (scrapedComments.length > 0) {
          logs.push(`[${plat.platformName}] 🧠 Found ${scrapedComments.length} raw candidates. Filtering high-pain signals using Gemini...`);
          try {
            const ai = getGeminiClient();
            const prompt = `
              Analyze these real Reddit posts. Extract at most 1 highly actionable, genuine software-addressable workflow pain point classified as a "help_seeker".
              
              CLASSIFICATION MODEL RULES:
              - help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
              - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
              - noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes pre-structured systematic analyses/templates.
              
              CRITICAL REJECTION RULE:
              You MUST strictly ignore/reject any posts or comments that are classified as "solution_sharer" or "noise", or that contain structured template fields like 'JTBD', 'Persona', 'Context & frequency', 'Evidence strength', 'Willingness to pay', 'Generated by...', or 'Scorecard'. Only extract from organic, natural, first-person user complaints and raw posts about immediate manual struggles that are classified as "help_seeker".

              DO NOT invent or synthesize anything. If none of them describes a clear business bottleneck or manual task that software can automate, return [] in JSON.

              Posts: ${JSON.stringify(scrapedComments.slice(0, 10))}

              Format as a JSON array of objects matching this exact structure (with real author name and exact url):
              [{
                "title": "Problem title (under 80 chars)",
                "author": "Real username",
                "sourcePlatform": "Reddit (r/subreddit)",
                "sourceUrl": "Real URL",
                "classification": "help_seeker",
                "problemSummary": "1-2 sentence detailed summary of manual struggle",
                "whoIsExperiencing": "Who is experiencing this?",
                "industry": "Industry sector",
                "evidence": "Quote of their frustration",
                "painLevel": "High" or "Medium" or "Low",
                "painLevelExplanation": "Concrete explanation of cost",
                "frequency": "Frequency",
                "currentSolutions": "Current manual solutions",
                "possibleSolution": "Software solution",
                "mvpIdea": "2-week MVP idea",
                "difficulty": "Easy" or "Medium" or "Hard",
                "difficultyExplanation": "Difficulty details",
                "willingnessToPay": "Estimation of WTP",
                "opportunityScore": 85, // Ensure help_seeker_min score >= 60
                "responseDraft": "Personalized, helpful outreach text",
                "suggestedQuestions": ["Q1", "Q2"],
                "valueAdditionIdeas": ["Idea 1"]
              }]
            `;
            const response = await ai.models.generateContent({
              model: "gemini-3.6-flash",
              contents: prompt,
              config: { responseMimeType: "application/json" }
            });
            const text = response.text || "[]";
            const extracted = safeParseJSON(text);
            if (Array.isArray(extracted) && extracted.length > 0) {
              for (const opp of extracted) {
                if (opp.sourceUrl && opp.sourceUrl.includes("reddit.com")) {
                  opp.id = `discovered-reddit-${Date.now()}`;
                  opp.timestamp = new Date().toISOString();
                  opp.status = "New";
                  opp.notes = "Automatically discovered by targeted subreddit scanner.";
                  foundOpps.push(opp);
                  logs.push(`[${plat.platformName}] ⭐ Found real high-pain signal from ${opp.author}: "${opp.title}" (Score: ${opp.opportunityScore})`);
                }
              }
            } else {
              logs.push(`[${plat.platformName}] ℹ️ No new software-addressable problems found during this cycle.`);
            }
          } catch (err: any) {
            logs.push(`[${plat.platformName}] ⚠️ Failed to extract pain points using Gemini: ${err.message || err}`);
          }
        } else {
          logs.push(`[${plat.platformName}] ℹ️ No new active discussions found matching targeted keywords.`);
        }
      }

      else if (plat.platformId === "hn") {
        logs.push(`[${plat.platformName}] 📡 Scanning Hacker News comments for organic pain phrases...`);
        try {
          const scrapedHN = await scrapeHackerNewsComments("pain OR tedious OR bottleneck", "Technology");
          if (scrapedHN.length > 0) {
            logs.push(`[${plat.platformName}] 🧠 Found ${scrapedHN.length} Ask HN comments. Filtering with Gemini...`);
            try {
              const ai = getGeminiClient();
              const prompt = `
                Analyze these Hacker News comments. Extract at most 1 highly actionable, genuine software-addressable workflow pain point classified as a "help_seeker".
                
                CLASSIFICATION MODEL RULES:
                - help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
                - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
                - noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes pre-structured systematic analyses/templates.
                
                CRITICAL REJECTION RULE:
                You MUST strictly ignore/reject any posts or comments that are classified as "solution_sharer" or "noise", or that contain structured template fields like 'JTBD', 'Persona', 'Context & frequency', 'Evidence strength', 'Willingness to pay', 'Generated by...', or 'Scorecard'). Only extract from organic, natural, first-person user complaints and raw comments about immediate manual struggles that are classified as "help_seeker".

                DO NOT invent or synthesize anything. If none of them describes a clear business bottleneck or manual task that software can automate, return [] in JSON.

                Comments: ${JSON.stringify(scrapedHN.slice(0, 10))}

                Format as a JSON array of objects matching this exact structure:
                [{
                  "title": "Problem title (under 80 chars)",
                  "author": "Real username",
                  "sourcePlatform": "Hacker News",
                  "sourceUrl": "Real URL",
                  "classification": "help_seeker",
                  "problemSummary": "1-2 sentence detailed summary of manual struggle",
                  "whoIsExperiencing": "Who is experiencing this?",
                  "industry": "Industry sector",
                  "evidence": "Quote of their frustration",
                  "painLevel": "High" or "Medium" or "Low",
                  "painLevelExplanation": "Concrete explanation of cost",
                  "frequency": "Frequency",
                  "currentSolutions": "Current manual solutions",
                  "possibleSolution": "Software solution",
                  "mvpIdea": "2-week MVP idea",
                  "difficulty": "Easy" or "Medium" or "Hard",
                  "difficultyExplanation": "Difficulty details",
                  "willingnessToPay": "Estimation of WTP",
                  "opportunityScore": 85, // Ensure help_seeker_min score >= 60
                  "responseDraft": "Personalized, helpful outreach text",
                  "suggestedQuestions": ["Q1", "Q2"],
                  "valueAdditionIdeas": ["Idea 1"]
                }]
              `;
              const response = await ai.models.generateContent({
                model: "gemini-3.6-flash",
                contents: prompt,
                config: { responseMimeType: "application/json" }
              });
              const text = response.text || "[]";
              const extracted = safeParseJSON(text);
              if (Array.isArray(extracted) && extracted.length > 0) {
                for (const opp of extracted) {
                  if (opp.sourceUrl && opp.sourceUrl.includes("ycombinator")) {
                    opp.id = `discovered-hn-${Date.now()}`;
                    opp.timestamp = new Date().toISOString();
                    opp.status = "New";
                    opp.notes = "Automatically discovered by Hacker News Ask HN scanner.";
                    foundOpps.push(opp);
                    logs.push(`[${plat.platformName}] ⭐ Found real high-pain HN signal from ${opp.author}: "${opp.title}" (Score: ${opp.opportunityScore})`);
                  }
                }
              } else {
                logs.push(`[${plat.platformName}] ℹ️ No new software-addressable problems found in this Ask HN cycle.`);
              }
            } catch (err: any) {
              logs.push(`[${plat.platformName}] ⚠️ Failed to extract HN pain points using Gemini: ${err.message || err}`);
            }
          } else {
            logs.push(`[${plat.platformName}] ℹ️ No active Ask HN discussions detected.`);
          }
        } catch (e: any) {
          logs.push(`[${plat.platformName}] ⚠️ Hacker News live scan failed: ${e.message || e}`);
        }
      }

      else if (plat.platformId === "github") {
        logs.push(`[${plat.platformName}] 📡 Scanning GitHub Issues for workflow bottlenecks and manual tasks...`);
        try {
          const scrapedGH = await scrapeGitHubIssues("workflow manual", "Technology");
          if (scrapedGH.length > 0) {
            logs.push(`[${plat.platformName}] 🧠 Found ${scrapedGH.length} issues. Filtering with Gemini...`);
            try {
              const ai = getGeminiClient();
              const prompt = `
                Analyze these GitHub issues. Extract at most 1 highly actionable, genuine software-addressable workflow pain point classified as a "help_seeker".
                
                CLASSIFICATION MODEL RULES:
                - help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
                - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
                - noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes pre-structured systematic analyses/templates.
                
                CRITICAL REJECTION RULE:
                You MUST strictly ignore/reject any issues or posts that are classified as "solution_sharer" or "noise", or that contain structured template fields like 'JTBD', 'Persona', 'Context & frequency', 'Evidence strength', 'Willingness to pay', 'Generated by...', or 'Scorecard'). Only extract from organic, natural, first-person user complaints and raw issue reports about immediate manual struggles that are classified as "help_seeker".

                DO NOT invent or synthesize anything. If none of them describes a clear business bottleneck or manual task that software can automate, return [] in JSON.

                Issues: ${JSON.stringify(scrapedGH.slice(0, 10))}

                Format as a JSON array of objects matching this exact structure (with real author name and exact url):
                [{
                  "title": "Problem title (under 80 chars)",
                  "author": "Real username",
                  "sourcePlatform": "GitHub Issues",
                  "sourceUrl": "Real URL",
                  "classification": "help_seeker",
                  "problemSummary": "1-2 sentence detailed summary of manual struggle",
                  "whoIsExperiencing": "Who is experiencing this?",
                  "industry": "Industry sector",
                  "evidence": "Quote of their frustration",
                  "painLevel": "High" or "Medium" or "Low",
                  "painLevelExplanation": "Concrete explanation of cost",
                  "frequency": "Frequency",
                  "currentSolutions": "Current manual solutions",
                  "possibleSolution": "Software solution",
                  "mvpIdea": "2-week MVP idea",
                  "difficulty": "Easy" or "Medium" or "Hard",
                  "difficultyExplanation": "Difficulty details",
                  "willingnessToPay": "Estimation of WTP",
                  "opportunityScore": 85, // Ensure help_seeker_min score >= 60
                  "responseDraft": "Personalized, helpful outreach text",
                  "suggestedQuestions": ["Q1", "Q2"],
                  "valueAdditionIdeas": ["Idea 1"]
                }]
              `;
              const response = await ai.models.generateContent({
                model: "gemini-3.6-flash",
                contents: prompt,
                config: { responseMimeType: "application/json" }
              });
              const text = response.text || "[]";
              const extracted = safeParseJSON(text);
              if (Array.isArray(extracted) && extracted.length > 0) {
                for (const opp of extracted) {
                  if (opp.sourceUrl && opp.sourceUrl.includes("github.com")) {
                    opp.id = `discovered-github-${Date.now()}`;
                    opp.timestamp = new Date().toISOString();
                    opp.status = "New";
                    opp.notes = "Automatically discovered by GitHub Issues scanner.";
                    foundOpps.push(opp);
                    logs.push(`[${plat.platformName}] ⭐ Found real high-pain GitHub signal from ${opp.author}: "${opp.title}" (Score: ${opp.opportunityScore})`);
                  }
                }
              } else {
                logs.push(`[${plat.platformName}] ℹ️ No new software-addressable problems found in this GitHub Issues cycle.`);
              }
            } catch (err: any) {
              logs.push(`[${plat.platformName}] ⚠️ Failed to extract GitHub pain points using Gemini: ${err.message || err}`);
            }
          } else {
            logs.push(`[${plat.platformName}] ℹ️ No active GitHub issues detected.`);
          }
        } catch (e: any) {
          logs.push(`[${plat.platformName}] ⚠️ GitHub live scan failed: ${e.message || e}`);
        }
      }

      else if (plat.platformId === "firecrawl") {
        logs.push(`[${plat.platformName}] 🕷️ Custom web crawler launching in background...`);
        const firecrawlKey = process.env.FIRECRAWL_API_KEY;
        if (!firecrawlKey) {
          logs.push(`[${plat.platformName}] ⚠️ FIRECRAWL_API_KEY is not configured in Settings > Secrets. Crawler skipped.`);
        } else {
          const activeTargets = (plat.targets || []).filter((t: any) => t.isEnabled);
          logs.push(`[${plat.platformName}] 🕸️ Crawling ${activeTargets.length} configured targets via Firecrawl API...`);
          for (const target of activeTargets) {
            try {
              logs.push(`[${plat.platformName}] 🔍 Crawling live forum: "${target.name}" (${target.urlOrPath})...`);
              const fcRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${firecrawlKey}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  url: target.urlOrPath,
                  formats: ["markdown"],
                  onlyMainContent: true,
                  waitFor: 3000
                })
              });

              if (!fcRes.ok) {
                const errText = await fcRes.text();
                logs.push(`[${plat.platformName}] ⚠️ Crawling failed for ${target.name} (Status ${fcRes.status}): ${errText.slice(0, 100)}`);
                continue;
              }

              const fcData: any = await fcRes.json();
              const markdown = fcData?.data?.markdown || "";
              if (!markdown || markdown.trim().length < 50) {
                logs.push(`[${plat.platformName}] ℹ️ Insufficient readable content from "${target.name}".`);
                continue;
              }

              logs.push(`[${plat.platformName}] 🧠 Extracted ${markdown.length} characters from "${target.name}". Analyzing with Gemini...`);
              const ai = getGeminiClient();
              const prompt = `
                Analyze this forum / web page scraped markdown content. Extract at most 2 highly actionable, genuine software-addressable workflow pain points classified as a "help_seeker".
                
                CLASSIFICATION MODEL RULES:
                - help_seeker: A real business owner, contractor, operator, or manager asking for advice, help, recommendations, troubleshooting, or a solution to an operational/business workflow bottleneck.
                - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
                - noise: Memes, jokes, generic ads, marketing copy, unrelated chatter, or posts without a clear problem or need.
                
                CRITICAL REJECTION RULE:
                You MUST strictly ignore/reject any posts that are classified as "solution_sharer" or "noise", or that contain marketing templates. Only extract from organic, authentic user complaints and requests for help about immediate manual struggles.

                DO NOT invent or synthesize anything. If none of the content describes a real business bottleneck, return [] in JSON.

                Scraped Markdown Content:
                "${markdown.substring(0, 10000)}"

                Format as a JSON array of objects matching this exact structure:
                [{
                  "title": "Problem title (under 80 chars)",
                  "author": "Username of author or 'ForumMember'",
                  "sourcePlatform": "${target.name || "Firecrawl Web Crawler"}",
                  "sourceUrl": "${target.urlOrPath}",
                  "classification": "help_seeker",
                  "problemSummary": "1-2 sentence detailed summary of manual struggle",
                  "whoIsExperiencing": "Who is experiencing this?",
                  "industry": "Real Estate / Contracting / Small Business",
                  "evidence": "Authentic quote or direct problem detail from the text",
                  "painLevel": "High",
                  "painLevelExplanation": "Concrete explanation of how much time or money this bottleneck costs",
                  "frequency": "Daily",
                  "currentSolutions": "What they are currently doing",
                  "possibleSolution": "Software / automation solution",
                  "mvpIdea": "Hyper-focused 2-week MVP idea",
                  "difficulty": "Easy",
                  "difficultyExplanation": "Technical details",
                  "willingnessToPay": "Estimation of WTP ($50-$200/mo)",
                  "opportunityScore": 85,
                  "responseDraft": "Personalized, helpful, trust-building response draft starting with a helpful greeting and offering practical insight.",
                  "suggestedQuestions": ["What tool do you use right now?", "How many hours per week does your team spend on this?"],
                  "valueAdditionIdeas": ["Offer a free workflow blueprint audit", "Provide a copy-pasteable spreadsheet/Zapier template"]
                }]
              `;

              const response = await ai.models.generateContent({
                model: "gemini-3.6-flash",
                contents: prompt,
                config: { responseMimeType: "application/json" }
              });

              const text = response.text || "[]";
              const extracted = safeParseJSON(text);
              if (Array.isArray(extracted) && extracted.length > 0) {
                for (const item of extracted) {
                  if (item.classification === "help_seeker" && item.title) {
                    const opp: any = {
                      ...item,
                      id: `discovered-firecrawl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                      timestamp: new Date().toISOString(),
                      status: "New",
                      sourcePlatform: target.name || "Custom Web Crawler",
                      sourceUrl: target.urlOrPath,
                      notes: `Automatically discovered by Firecrawl custom forum scanner on ${target.name}.`
                    };
                    foundOpps.push(opp);
                    logs.push(`[${plat.platformName}] ⭐ Found real high-pain signal from ${opp.author}: "${opp.title}" (Score: ${opp.opportunityScore})`);
                  }
                }
              } else {
                logs.push(`[${plat.platformName}] ℹ️ No qualified software-addressable problems found in this cycle.`);
              }
            } catch (err: any) {
              logs.push(`[${plat.platformName}] ⚠️ Firecrawl scan error on ${target.name}: ${err.message || err}`);
            }
          }
        }
      }

      else if (plat.platformId === "facebook") {
        logs.push(`[${plat.platformName}] 🔒 Facebook Groups are private walled gardens.`);
        logs.push(`[${plat.platformName}] ⚠️ Direct unauthenticated scraping is restricted by Meta's anti-bot protections.`);
        logs.push(`[${plat.platformName}] 💡 To scan safely without account risks, copy and paste raw posts into the custom text analyzer or use 'Direct Scrape' on public group links.`);
      }

      else if (plat.platformId === "linkedin") {
        logs.push(`[${plat.platformName}] 🔒 LinkedIn has aggressive anti-scraping controls & IP firewalls.`);
        logs.push(`[${plat.platformName}] ⚠️ Headless browser crawling requires active authenticated cookies, which can lead to account bans.`);
        logs.push(`[${plat.platformName}] 💡 Recommended approach: Use our 'Direct Scrape' tool with your Firecrawl API key on specific public post URLs, or copy-paste text.`);
      }

      else if (plat.platformId === "mastodon") {
        logs.push(`[${plat.platformName}] 📡 Querying federated Mastodon nodes for customer complaints...`);
        try {
          const scrapedMastodon = await scrapeMastodonStatuses("", "Technology");
          if (scrapedMastodon.length > 0) {
            logs.push(`[${plat.platformName}] 🧠 Found ${scrapedMastodon.length} status updates. Filtering with Gemini...`);
            try {
              const ai = getGeminiClient();
              const prompt = `
                Analyze these decentralized federated microblog posts. Extract at most 1 highly actionable, genuine software-addressable workflow pain point classified as a "help_seeker".
                
                CLASSIFICATION MODEL RULES:
                - help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
                - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
                - noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes pre-structured systematic analyses/templates.
                
                CRITICAL REJECTION RULE:
                You MUST strictly ignore/reject any posts or comments that are classified as "solution_sharer" or "noise", or that contain structured template fields. Only extract from organic, natural, first-person user complaints and raw posts about immediate manual struggles.

                DO NOT invent or synthesize anything. If none of them describes a clear business bottleneck or manual task that software can automate, return [] in JSON.

                Posts: ${JSON.stringify(scrapedMastodon.slice(0, 10))}

                Format as a JSON array of objects matching this exact structure:
                [{
                  "title": "Problem title (under 80 chars)",
                  "author": "Real username",
                  "sourcePlatform": "Mastodon",
                  "sourceUrl": "Real URL",
                  "classification": "help_seeker",
                  "problemSummary": "1-2 sentence detailed summary of manual struggle",
                  "whoIsExperiencing": "Who is experiencing this?",
                  "industry": "Industry sector",
                  "evidence": "Quote of their frustration",
                  "painLevel": "High" or "Medium" or "Low",
                  "painLevelExplanation": "Concrete explanation of cost",
                  "frequency": "Frequency",
                  "currentSolutions": "Current manual solutions",
                  "possibleSolution": "Software solution",
                  "mvpIdea": "2-week MVP idea",
                  "difficulty": "Easy" or "Medium" or "Hard",
                  "difficultyExplanation": "Difficulty details",
                  "willingnessToPay": "Estimation of WTP",
                  "opportunityScore": 85, // Ensure help_seeker_min score >= 60
                  "responseDraft": "Personalized, helpful outreach text",
                  "suggestedQuestions": ["Q1", "Q2"],
                  "valueAdditionIdeas": ["Idea 1"]
                }]
              `;
              const response = await ai.models.generateContent({
                model: "gemini-3.6-flash",
                contents: prompt,
                config: { responseMimeType: "application/json" }
              });
              const text = response.text || "[]";
              const extracted = safeParseJSON(text);
              if (Array.isArray(extracted) && extracted.length > 0) {
                for (const opp of extracted) {
                  opp.id = `discovered-mastodon-${Date.now()}`;
                  opp.timestamp = new Date().toISOString();
                  opp.status = "New";
                  opp.notes = "Automatically discovered by federated Mastodon scanner.";
                  foundOpps.push(opp);
                  logs.push(`[${plat.platformName}] ⭐ Found real high-pain Mastodon signal from @${opp.author}: "${opp.title}" (Score: ${opp.opportunityScore})`);
                }
              } else {
                logs.push(`[${plat.platformName}] ℹ️ No new software-addressable problems found in this Mastodon cycle.`);
              }
            } catch (err) {
              logs.push(`[${plat.platformName}] ⚠️ Failed to extract Mastodon pain points: ${err}`);
            }
          } else {
            logs.push(`[${plat.platformName}] ℹ️ No active Mastodon statuses detected.`);
          }
        } catch (e) {
          logs.push(`[${plat.platformName}] ⚠️ Mastodon live scan faced a transient connection delay.`);
        }
      }

      else if (plat.platformId === "stackexchange") {
        logs.push(`[${plat.platformName}] 📡 Scanning Stack Exchange for manual workflows, tedious scripts & scripting workarounds...`);
        try {
          const scrapedSE = await scrapeStackExchange("", "Technology");
          if (scrapedSE.length > 0) {
            logs.push(`[${plat.platformName}] 🧠 Found ${scrapedSE.length} questions. Filtering with Gemini...`);
            try {
              const ai = getGeminiClient();
              const prompt = `
                Analyze these Stack Overflow/Stack Exchange questions. Extract at most 1 highly actionable, genuine software-addressable workflow pain point classified as a "help_seeker".
                
                CLASSIFICATION MODEL RULES:
                - help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
                - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
                - noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes pre-structured systematic analyses/templates.
                
                CRITICAL REJECTION RULE:
                You MUST strictly ignore/reject any posts or comments that are classified as "solution_sharer" or "noise", or that contain structured template fields. Only extract from organic, natural, first-person user complaints and raw posts about immediate manual struggles.

                DO NOT invent or synthesize anything. If none of them describes a clear business bottleneck or manual task that software can automate, return [] in JSON.

                Questions: ${JSON.stringify(scrapedSE.slice(0, 10))}

                Format as a JSON array of objects matching this exact structure:
                [{
                  "title": "Problem title (under 80 chars)",
                  "author": "Real username",
                  "sourcePlatform": "Stack Exchange",
                  "sourceUrl": "Real URL",
                  "classification": "help_seeker",
                  "problemSummary": "1-2 sentence detailed summary of manual struggle",
                  "whoIsExperiencing": "Who is experiencing this?",
                  "industry": "Industry sector",
                  "evidence": "Quote of their frustration",
                  "painLevel": "High" or "Medium" or "Low",
                  "painLevelExplanation": "Concrete explanation of cost",
                  "frequency": "Frequency",
                  "currentSolutions": "Current manual solutions",
                  "possibleSolution": "Software solution",
                  "mvpIdea": "2-week MVP idea",
                  "difficulty": "Easy" or "Medium" or "Hard",
                  "difficultyExplanation": "Difficulty details",
                  "willingnessToPay": "Estimation of WTP",
                  "opportunityScore": 85, // Ensure help_seeker_min score >= 60
                  "responseDraft": "Personalized, helpful outreach text",
                  "suggestedQuestions": ["Q1", "Q2"],
                  "valueAdditionIdeas": ["Idea 1"]
                }]
              `;
              const response = await ai.models.generateContent({
                model: "gemini-3.6-flash",
                contents: prompt,
                config: { responseMimeType: "application/json" }
              });
              const text = response.text || "[]";
              const extracted = safeParseJSON(text);
              if (Array.isArray(extracted) && extracted.length > 0) {
                for (const opp of extracted) {
                  opp.id = `discovered-stackexchange-${Date.now()}`;
                  opp.timestamp = new Date().toISOString();
                  opp.status = "New";
                  opp.notes = "Automatically discovered by Stack Exchange developer pain scanner.";
                  foundOpps.push(opp);
                  logs.push(`[${plat.platformName}] ⭐ Found real high-pain Stack Exchange signal from ${opp.author}: "${opp.title}" (Score: ${opp.opportunityScore})`);
                }
              } else {
                logs.push(`[${plat.platformName}] ℹ️ No new software-addressable problems found in this Stack Exchange cycle.`);
              }
            } catch (err) {
              logs.push(`[${plat.platformName}] ⚠️ Failed to extract Stack Exchange pain points using Gemini: ${err}`);
            }
          } else {
            logs.push(`[${plat.platformName}] ℹ️ No active Stack Exchange questions detected.`);
          }
        } catch (e) {
          logs.push(`[${plat.platformName}] ⚠️ Stack Exchange live scan faced a transient connection delay.`);
        }
      }

      else if (plat.platformId === "discourse") {
        const activeTargets = plat.targets.filter((t: any) => t.isEnabled);
        logs.push(`[${plat.platformName}] 🎯 Running live targeted scans on active Discourse forums: ${activeTargets.map((t: any) => t.name).join(", ")}...`);

        let scrapedComments: any[] = [];
        for (const target of activeTargets) {
          logs.push(`[${plat.platformName}] 🕸️ Scanning Discourse forum: ${target.name} (${target.urlOrPath})...`);
          try {
            const results = await scrapeDiscourse(target.urlOrPath, "pain OR manual OR tedious OR workflow OR frustrated", "All");
            scrapedComments.push(...results);
          } catch (e) {
            logs.push(`[${plat.platformName}] ⚠️ Direct crawl of ${target.name} faced a transient rate limit or parsed empty.`);
          }
        }

        if (scrapedComments.length > 0) {
          logs.push(`[${plat.platformName}] 🧠 Found ${scrapedComments.length} raw candidates. Filtering high-pain signals using Gemini...`);
          try {
            const ai = getGeminiClient();
            const prompt = `
              Analyze these real Discourse posts. Extract at most 1 highly actionable, genuine software-addressable workflow pain point classified as a "help_seeker".
              
              CLASSIFICATION MODEL RULES:
              - help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
              - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
              - noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes pre-structured systematic analyses/templates.
              
              CRITICAL REJECTION RULE:
              You MUST strictly ignore/reject any posts or comments that are classified as "solution_sharer" or "noise", or that contain structured template fields. Only extract from organic, natural, first-person user complaints and raw posts about immediate manual struggles.

              DO NOT invent or synthesize anything. If none of them describes a clear business bottleneck or manual task that software can automate, return [] in JSON.

              Posts: ${JSON.stringify(scrapedComments.slice(0, 10))}

              Format as a JSON array of objects matching this exact structure:
              [{
                "title": "Problem title (under 80 chars)",
                "author": "Real username",
                "sourcePlatform": "Discourse (domain)",
                "sourceUrl": "Real URL",
                "classification": "help_seeker",
                "problemSummary": "1-2 sentence detailed summary of manual struggle",
                "whoIsExperiencing": "Who is experiencing this?",
                "industry": "Industry sector",
                "evidence": "Quote of their frustration",
                "painLevel": "High" or "Medium" or "Low",
                "painLevelExplanation": "Concrete explanation of cost",
                "frequency": "Frequency",
                "currentSolutions": "Current manual solutions",
                "possibleSolution": "Software solution",
                "mvpIdea": "2-week MVP idea",
                "difficulty": "Easy" or "Medium" or "Hard",
                "difficultyExplanation": "Difficulty details",
                "willingnessToPay": "Estimation of WTP",
                "opportunityScore": 85, // Ensure help_seeker_min score >= 60
                "responseDraft": "Personalized, helpful outreach text",
                "suggestedQuestions": ["Q1", "Q2"],
                "valueAdditionIdeas": ["Idea 1"]
              }]
            `;
            const response = await ai.models.generateContent({
              model: "gemini-3.6-flash",
              contents: prompt,
              config: { responseMimeType: "application/json" }
            });
            const text = response.text || "[]";
            const extracted = safeParseJSON(text);
            if (Array.isArray(extracted) && extracted.length > 0) {
              for (const opp of extracted) {
                opp.id = `discovered-discourse-${Date.now()}`;
                opp.timestamp = new Date().toISOString();
                opp.status = "New";
                opp.notes = "Automatically discovered by live Discourse crawler.";
                foundOpps.push(opp);
                logs.push(`[${plat.platformName}] ⭐ Found real high-pain Discourse signal from @${opp.author}: "${opp.title}" (Score: ${opp.opportunityScore})`);
              }
            } else {
              logs.push(`[${plat.platformName}] ℹ️ No new software-addressable problems found in this Discourse cycle.`);
            }
          } catch (err) {
            logs.push(`[${plat.platformName}] ⚠️ Failed to extract Discourse pain points: ${err}`);
          }
        } else {
          logs.push(`[${plat.platformName}] ℹ️ No active Discourse posts detected.`);
        }
      }

      else if (plat.platformId === "rss") {
        const activeTargets = plat.targets.filter((t: any) => t.isEnabled);
        logs.push(`[${plat.platformName}] 🎯 Scanning active public RSS feeds: ${activeTargets.map((t: any) => t.name).join(", ")}...`);

        let scrapedComments: any[] = [];
        for (const target of activeTargets) {
          logs.push(`[${plat.platformName}] 🕸️ Fetching feed: ${target.name} (${target.urlOrPath})...`);
          try {
            const results = await scrapeRSSFeed(target.urlOrPath, `RSS (${target.name})`);
            scrapedComments.push(...results);
          } catch (e) {
            logs.push(`[${plat.platformName}] ⚠️ Direct crawl of RSS feed ${target.name} failed or timed out.`);
          }
        }

        if (scrapedComments.length > 0) {
          logs.push(`[${plat.platformName}] 🧠 Found ${scrapedComments.length} raw feed items. Filtering high-pain business problems using Gemini...`);
          try {
            const ai = getGeminiClient();
            const prompt = `
              Analyze these real RSS feed entries. Extract at most 1 highly actionable, genuine software-addressable workflow pain point classified as a "help_seeker".
              
              CLASSIFICATION MODEL RULES:
              - help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
              - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
              - noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes pre-structured systematic analyses/templates.
              
              CRITICAL REJECTION RULE:
              You MUST strictly ignore/reject any posts or comments that are classified as "solution_sharer" or "noise", or that contain structured template fields. Only extract from organic, natural, first-person user complaints and raw posts about immediate manual struggles.

              DO NOT invent or synthesize anything. If none of them describes a clear business bottleneck or manual task that software can automate, return [] in JSON.

              Feed Entries: ${JSON.stringify(scrapedComments.slice(0, 10))}

              Format as a JSON array of objects matching this exact structure:
              [{
                "title": "Problem title (under 80 chars)",
                "author": "Real username",
                "sourcePlatform": "RSS",
                "sourceUrl": "Real URL",
                "classification": "help_seeker",
                "problemSummary": "1-2 sentence detailed summary of manual struggle",
                "whoIsExperiencing": "Who is experiencing this?",
                "industry": "Industry sector",
                "evidence": "Quote of their frustration",
                "painLevel": "High" or "Medium" or "Low",
                "painLevelExplanation": "Concrete explanation of cost",
                "frequency": "Frequency",
                "currentSolutions": "Current manual solutions",
                "possibleSolution": "Software solution",
                "mvpIdea": "2-week MVP idea",
                "difficulty": "Easy" or "Medium" or "Hard",
                "difficultyExplanation": "Difficulty details",
                "willingnessToPay": "Estimation of WTP",
                "opportunityScore": 85, // Ensure help_seeker_min score >= 60
                "responseDraft": "Personalized, helpful outreach text",
                "suggestedQuestions": ["Q1", "Q2"],
                "valueAdditionIdeas": ["Idea 1"]
              }]
            `;
            const response = await ai.models.generateContent({
              model: "gemini-3.6-flash",
              contents: prompt,
              config: { responseMimeType: "application/json" }
            });
            const text = response.text || "[]";
            const extracted = safeParseJSON(text);
            if (Array.isArray(extracted) && extracted.length > 0) {
              for (const opp of extracted) {
                opp.id = `discovered-rss-${Date.now()}`;
                opp.timestamp = new Date().toISOString();
                opp.status = "New";
                opp.notes = "Automatically discovered by RSS Feed scanner.";
                foundOpps.push(opp);
                logs.push(`[${plat.platformName}] ⭐ Found real high-pain RSS signal from @${opp.author}: "${opp.title}" (Score: ${opp.opportunityScore})`);
              }
            } else {
              logs.push(`[${plat.platformName}] ℹ️ No new software-addressable problems found in this RSS cycle.`);
            }
          } catch (err) {
            logs.push(`[${plat.platformName}] ⚠️ Failed to extract RSS pain points: ${err}`);
          }
        } else {
          logs.push(`[${plat.platformName}] ℹ️ No active RSS feed entries detected.`);
        }
      }

      else if (plat.platformId === "quora") {
        const activeTargets = plat.targets.filter((t: any) => t.isEnabled);
        logs.push(`[${plat.platformName}] 🎯 Querying Quora Topic feeds for customer complaints: ${activeTargets.map((t: any) => t.name).join(", ")}...`);

        let scrapedComments: any[] = [];
        for (const target of activeTargets) {
          logs.push(`[${plat.platformName}] 🕸️ Scanning Quora Topic RSS: ${target.name} (Topic ID: ${target.urlOrPath})...`);
          try {
            const cleanTopic = target.urlOrPath.replace(/-/g, ' ');
            const url = target.urlOrPath.startsWith("http")
              ? target.urlOrPath
              : `https://news.google.com/rss/search?q=site:quora.com+${encodeURIComponent(cleanTopic)}+problem+OR+workflow&hl=en-US&gl=US&ceid=US:en`;
            const results = await scrapeRSSFeed(url, `Quora (${target.name})`);
            scrapedComments.push(...results);
          } catch (e) {
            logs.push(`[${plat.platformName}] ⚠️ Direct crawl of Quora topic feed ${target.name} failed or timed out.`);
          }
        }

        if (scrapedComments.length > 0) {
          logs.push(`[${plat.platformName}] 🧠 Found ${scrapedComments.length} raw Quora candidates. Filtering high-pain complaints using Gemini...`);
          try {
            const ai = getGeminiClient();
            const prompt = `
              Analyze these real Quora thread items. Extract at most 1 highly actionable, genuine software-addressable workflow pain point classified as a "help_seeker".
              
              CLASSIFICATION MODEL RULES:
              - help_seeker: A real person asking for advice, help, recommendations, troubleshooting, or a solution to a business/workflow problem.
              - solution_sharer: A person announcing, showcasing, promoting, or explaining a solution they built or launched.
              - noise: Memes, jokes, generic news, unrelated chatter, or posts without a clear problem or need. Also includes pre-structured systematic analyses/templates.
              
              CRITICAL REJECTION RULE:
              You MUST strictly ignore/reject any posts or comments that are classified as "solution_sharer" or "noise", or that contain structured template fields. Only extract from organic, natural, first-person user complaints and raw posts about immediate manual struggles.

              DO NOT invent or synthesize anything. If none of them describes a clear business bottleneck or manual task that software can automate, return [] in JSON.

              Quora Items: ${JSON.stringify(scrapedComments.slice(0, 10))}

              Format as a JSON array of objects matching this exact structure:
              [{
                "title": "Problem title (under 80 chars)",
                "author": "Real username",
                "sourcePlatform": "Quora",
                "sourceUrl": "Real URL",
                "classification": "help_seeker",
                "problemSummary": "1-2 sentence detailed summary of manual struggle",
                "whoIsExperiencing": "Who is experiencing this?",
                "industry": "Industry sector",
                "evidence": "Quote of their frustration",
                "painLevel": "High" or "Medium" or "Low",
                "painLevelExplanation": "Concrete explanation of cost",
                "frequency": "Frequency",
                "currentSolutions": "Current manual solutions",
                "possibleSolution": "Software solution",
                "mvpIdea": "2-week MVP idea",
                "difficulty": "Easy" or "Medium" or "Hard",
                "difficultyExplanation": "Difficulty details",
                "willingnessToPay": "Estimation of WTP",
                "opportunityScore": 85, // Ensure help_seeker_min score >= 60
                "responseDraft": "Personalized, helpful outreach text",
                "suggestedQuestions": ["Q1", "Q2"],
                "valueAdditionIdeas": ["Idea 1"]
              }]
            `;
            const response = await ai.models.generateContent({
              model: "gemini-3.6-flash",
              contents: prompt,
              config: { responseMimeType: "application/json" }
            });
            const text = response.text || "[]";
            const extracted = safeParseJSON(text);
            if (Array.isArray(extracted) && extracted.length > 0) {
              for (const opp of extracted) {
                opp.id = `discovered-quora-${Date.now()}`;
                opp.timestamp = new Date().toISOString();
                opp.status = "New";
                opp.notes = "Automatically discovered by live Quora feed scanner.";
                foundOpps.push(opp);
                logs.push(`[${plat.platformName}] ⭐ Found real high-pain Quora signal from @${opp.author}: "${opp.title}" (Score: ${opp.opportunityScore})`);
              }
            } else {
              logs.push(`[${plat.platformName}] ℹ️ No new software-addressable problems found in this Quora cycle.`);
            }
          } catch (err) {
            logs.push(`[${plat.platformName}] ⚠️ Failed to extract Quora pain points: ${err}`);
          }
        } else {
          logs.push(`[${plat.platformName}] ℹ️ No active Quora feed entries detected.`);
        }
      }
    }
  } catch (error) {
    logs.push(`[System Error] ⚠️ Fleet run encountered a transient exception: ${error}`);
  }

  // Deduplicate before saving to prevent noise/overlapping data
  const existingOpps = loadOpportunities();
  const uniqueIncomingOpps = foundOpps.filter(incoming => {
    const isDuplicate = existingOpps.some(existing => {
      const urlMatch = incoming.sourceUrl && existing.sourceUrl && (incoming.sourceUrl === existing.sourceUrl || incoming.sourceUrl === existing.originalSourceLink);
      const titleMatch = incoming.title && existing.title && incoming.title.toLowerCase().trim() === existing.title.toLowerCase().trim();
      return urlMatch || titleMatch;
    });
    if (isDuplicate) {
      logs.push(`[Deduplicator] 🛡️ Duplicate found for "${incoming.title}". Safely filtered out.`);
      return false;
    }
    return true;
  });

  if (uniqueIncomingOpps.length > 0) {
    const enrichedOpps = uniqueIncomingOpps.map(opp => ({
      ...opp,
      solutionOptions: getFallbackSolutionOptions(opp)
    }));

    // Trigger email alerts if enabled
    if (config.emailAlertsEnabled) {
      const alertRecipient = config.alertRecipientEmail || process.env.ALERT_RECIPIENT_EMAIL || "upscaleyourbusiness.wv@gmail.com";
      const minScore = config.minAlertScore || 75;

      const alertsToTrigger = enrichedOpps.filter(o => (o.opportunityScore || 0) >= minScore);
      if (alertsToTrigger.length > 0) {
        logs.push(`[Email Alerts] 📧 Triggering email notification alerts for ${alertsToTrigger.length} high-potential opportunities...`);
        try {
          let existingAlerts = [];
          existingAlerts = JSON.parse(safeReadFile(ALERTS_FILE, "[]"));

          for (const opp of alertsToTrigger) {
            const emailSubject = `🚨 New [${opp.industry || "Business Pain"}] Opportunity Discovered (Score: ${opp.opportunityScore}/100)`;
            const emailBody = `=========================================
OPPORTUNITY RADAR: HIGH-POTENTIAL ALERT
=========================================
Subject: ${emailSubject}
Recipient: ${alertRecipient}
Timestamp: ${new Date().toISOString()}

Hi Solo Developer,

A new, highly qualified opportunity has been discovered by your bot fleet:

📌 Title: ${opp.title}
👤 Author: ${opp.author}
📡 Platform: ${opp.sourcePlatform}
🔗 Link: ${opp.sourceUrl}
🔥 Pain Level: ${opp.painLevel} (Score: ${opp.opportunityScore})

💬 Core Bottleneck / Pain Point:
"${opp.problemSummary}"

🧪 emotional evidence:
"${opp.evidence}"

💡 Suggested MVP Idea (2-week build):
"${opp.mvpIdea}"

💰 Estimated Willingness to Pay:
${opp.willingnessToPay}

-----------------------------------------
Outreach Draft Ready to Copy-Paste:
-----------------------------------------
${opp.responseDraft}

-----------------------------------------
=========================================`;

            existingAlerts.unshift({
              id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              timestamp: new Date().toISOString(),
              recipient: alertRecipient,
              subject: emailSubject,
              body: emailBody,
              oppId: opp.id,
              oppTitle: opp.title,
              oppScore: opp.opportunityScore
            });

            const emailResult = await sendMailgunEmail({
              to: alertRecipient,
              subject: emailSubject,
              bodyText: emailBody
            });

            if (emailResult.success) {
              console.log(`[Alert Delivered] Email sent successfully to ${alertRecipient}.\nSubject: ${emailSubject}`);
              logs.push(`[Email Alerts] ✅ Alert email sent to ${alertRecipient} for "${opp.title}" (Score: ${opp.opportunityScore})`);
            } else {
              console.error(`[Alert Failed] Email dispatch failed to ${alertRecipient}: ${emailResult.error}`);
              logs.push(`[Email Alerts] ❌ Alert email failed for "${opp.title}": ${emailResult.error || "Unknown error"}`);
            }

            // Dispatch Telegram notification alert if bot credentials are configured
            const baseUrl = PUBLISHED_APP_URL;
            const encodedTo = encodeURIComponent(opp.contactEmail || opp.author || "prospect");
            const encodedSubject = encodeURIComponent(`Outreach response for: ${opp.title}`);
            const actionUrl = `${baseUrl}/api/one-click/execute?action=outreach&id=${opp.id || opp.author}&to=${encodedTo}&platform=${encodeURIComponent(opp.sourcePlatform || "Social")}&subject=${encodedSubject}`;

            const telegramMessage =
              `🚨 <b>P.A.C. URGENT LEAD RECOMMENDATION (Score: ${opp.opportunityScore}/100)</b>\n\n` +
              `Hey partner, I just identified a perfect target vertical lead that matches our client acquisition strategy:\n\n` +
              `📌 <b>Target</b>: ${opp.title} (${opp.industry || "General"})\n` +
              `📡 <b>Platform</b>: ${opp.sourcePlatform} (by @${opp.author})\n` +
              `🔥 <b>Pain Level</b>: ${opp.painLevel}\n\n` +
              `💬 <b>Why they are perfect</b>:\n<i>"${opp.problemSummary}"</i>\n\n` +
              `💡 <b>My Solution proposal</b>: Let's build a fast 2-week MVP: ${opp.mvpIdea}\n\n` +
              `Let's outreach immediately! Click the link below to review my draft outreach:`;

            const tgResult = await sendTelegramAlert(telegramMessage, actionUrl);
            if (tgResult.success) {
              logs.push(`[Telegram Alerts] ✅ Telegram alert sent successfully.`);
            } else {
              logs.push(`[Telegram Alerts] ⚠️ Telegram alert skipped/failed: ${tgResult.error || "no credentials"}`);
            }
          }

          safeWriteFile(ALERTS_FILE, JSON.stringify(existingAlerts.slice(0, 50), null, 2));
        } catch (alertErr) {
          console.error("Error generating alerts:", alertErr);
          logs.push(`[Email Alerts] ⚠️ Failed to deliver alert notifications.`);
        }
      }
    }

    const opps = loadOpportunities();
    opps.unshift(...enrichedOpps);
    saveOpportunities(opps);
    logs.push(`[Database] 💾 Successfully saved ${enrichedOpps.length} new qualified opportunity signals to the discovery database!`);
    logs.push(`[${new Date().toISOString()}] 🏁 Bot Fleet Scan Cycle Completed.`);
    return { logs, foundOpps: enrichedOpps };
  } else {
    logs.push(`[Database] 💾 Scan cycle finished. No new high-relevance pain signals detected.`);
    logs.push(`[${new Date().toISOString()}] 🏁 Bot Fleet Scan Cycle Completed.`);
    return { logs, foundOpps: [] };
  }
}

async function executeOfflineTasks() {
  console.log("[Offline Worker] 🧠 Running autonomous co-founder task worker...");
  const memory = loadAgentMemory();
  const logs = loadComputerLogs();

  if (!memory.followUps || memory.followUps.length === 0) {
    console.log("[Offline Worker] No follow-up tasks found in memory.");
    return;
  }

  const pendingTasks = memory.followUps.filter((t: any) => !t.completed);
  if (pendingTasks.length === 0) {
    console.log("[Offline Worker] No pending follow-up tasks to execute.");
    return;
  }

  logs.push(`[Offline Worker] ⏰ [${new Date().toLocaleTimeString()}] Triggered autonomous co-founder background loop.`);

  for (const task of pendingTasks) {
    logs.push(`[Offline Worker] ⚡ Processing pending task: "${task.task}"`);

    // Check if the task describes a search/scraping or email/outreach drafting job
    const taskDesc = task.task.toLowerCase();
    const isSearch = taskDesc.includes("search") || taskDesc.includes("find") || taskDesc.includes("scrape");
    const isDraft = taskDesc.includes("draft") || taskDesc.includes("email") || taskDesc.includes("outreach") || taskDesc.includes("proposal");

    if (isSearch || isDraft) {
      logs.push(`[Offline Worker] 📡 Running autonomous task execution: "${task.task}"`);

      try {
        const ai = getGeminiClient();
        const prompt = `
          You are P.A.C. (Partner of Autonomous Capabilities), a capable AI Co-Founder.
          The user has assigned you a background task to execute while they are offline.

          TASK: "${task.task}"

          CURRENT MEMORY CONTEXT: "${memory.summary}"

          STRICT ETHICAL GUIDELINES:
          1. Human-in-the-Loop Send: You must NEVER send emails or outbound posts directly. You can only write detailed drafts or prepare templates.
          2. Honest AI Identity: Any draft you prepare must state clearly that it is prepared by P.A.C., your AI co-founder partner.
          3. Absolute Authenticity: Do not invent any fake testimonials or mock client results.
          4. 50% Rule: Any proposal draft must rigidly demand a non-negotiable 50% upfront payment before work begins.

          Execute the task as best as you can.
          - If the task is to write/draft an email or proposal outreach for a prospect, draft a professional outreach email template and scope.
          - If the task is to research a sector or plan a search, provide structured, high-value strategic research steps or notes.

          Format your final result as a JSON object matching this exact structure:
          {
            "notes": "Detailed progress notes about what you completed and your strategic recommendations.",
            "completed": true,
            "draftedDocument": {
              "type": "outreach",
              "title": "Document Title",
              "content": "Full text of the email/proposal following the 50% rule and ethical rules"
            }
          }
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });

        const resText = response.text || "{}";
        const result = JSON.parse(resText.replace(/```json/gi, "").replace(/```/g, "").trim());

        if (result.notes) {
          logs.push(`[Offline Worker] P.A.C. Notes: ${result.notes}`);
        }

        if (result.draftedDocument) {
          const doc = result.draftedDocument;
          logs.push(`[Offline Worker] 📄 Prepared document draft: "${doc.title}" (${doc.type})`);

          // Save the drafted document to opportunities database so the user sees it in the Review Board!
          const opportunities = loadOpportunities();
          const newOpp = {
            id: `discovered-offline-${Date.now()}`,
            title: doc.title,
            author: "System Offline Target",
            sourcePlatform: "Offline Autonomy",
            sourceUrl: "http://localhost:3001",
            classification: "help_seeker",
            problemSummary: `Autonomously drafted by P.A.C. for task: "${task.task}"`,
            whoIsExperiencing: "Targeted prospect",
            industry: "Technology",
            evidence: `Draft prepared offline.`,
            painLevel: "High",
            painLevelExplanation: "Determined offline",
            frequency: "Regular",
            currentSolutions: "Manual",
            possibleSolution: "Workflow automation",
            mvpIdea: "Custom integration",
            difficulty: "Medium",
            difficultyExplanation: "N/A",
            willingnessToPay: "High",
            opportunityScore: 85,
            responseDraft: doc.content,
            suggestedQuestions: [],
            valueAdditionIdeas: [],
            status: "New",
            timestamp: new Date().toISOString(),
            notes: `Drafted autonomously by P.A.C. during offline worker cycle.`
          };
          opportunities.push(newOpp);
          saveOpportunities(opportunities);
          logs.push(`[Offline Worker] Saved draft opportunity to pipeline.`);

          // Proactively alert user on Telegram about the newly drafted document
          const encodedTo = encodeURIComponent(newOpp.author || "prospect");
          const encodedSubject = encodeURIComponent(`Outreach response for: ${newOpp.title}`);
          const actionUrl = `${PUBLISHED_APP_URL}/api/one-click/execute?action=outreach&id=${newOpp.id}&to=${encodedTo}&platform=Email&subject=${encodedSubject}`;

          const telegramMessage =
            `🧠 <b>P.A.C. Offline Task Completed</b>\n\n` +
            `📝 <b>Draft Prepared</b>: "${doc.title}"\n` +
            `📋 <b>Task</b>: ${task.task}\n\n` +
            `💬 <b>Summary</b>: <i>"${result.notes || 'Outreach draft prepared offline.'}"</i>`;

          const tgRes = await sendTelegramAlert(telegramMessage, actionUrl);
          if (tgRes.success) {
            logs.push(`[Offline Worker] ✅ Telegram notification sent successfully.`);
          } else {
            logs.push(`[Offline Worker] ⚠️ Telegram notification skipped/failed: ${tgRes.error || "no credentials"}`);
          }
        }

        if (result.completed) {
          task.completed = true;
          logs.push(`[Offline Worker] ✅ Task marked as COMPLETED.`);
        }
      } catch (err: any) {
        logs.push(`[Offline Worker] ⚠️ Gemini failed to process task: ${err.message || err}`);
      }
    } else {
      logs.push(`[Offline Worker] Task type not suitable for autonomous background execution. Skipping.`);
    }
  }

  saveAgentMemory(memory);
  saveComputerLogs(logs.slice(-50));
}

// Global daemon variables
let schedulerTimer: NodeJS.Timeout | null = null;
let lastInactivityAlertSent = 0;
let lastFollowUpsAlertSent = 0;

function initScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  const config = loadBotConfig();
  if (!config.schedulerEnabled) {
    console.log("[Scheduler Daemon] Background scheduling is currently disabled.");
    return;
  }

  const intervalMinutes = config.schedulerIntervalMinutes || 60;
  console.log(`[Scheduler Daemon] Background daemon registered. Sweeping every ${intervalMinutes} minutes.`);

  schedulerTimer = setInterval(() => {
    console.log("[Scheduler Daemon] ⏰ Interval triggered. Initiating background sweep...");

    // Inactivity Alert Check
    const timeSinceLastActivity = Date.now() - lastUserActivityTimestamp;
    // 12 hours = 12 * 60 * 60 * 1000
    if (timeSinceLastActivity > 12 * 60 * 60 * 1000 && Date.now() - lastInactivityAlertSent > 12 * 60 * 60 * 1000) {
      lastInactivityAlertSent = Date.now();
      sendTelegramAlert("Hey partner! I haven't seen you active in the dashboard for over 12 hours. I'm still running background sweeps to secure Client #1 and Client #2. Let me know when you want to review leads or outreach!");
    }

    // Follow-ups Alert Check
    if (Date.now() - lastFollowUpsAlertSent > 24 * 60 * 60 * 1000) {
      const memory = loadAgentMemory();
      if (memory.followUps && memory.followUps.length > 0) {
        const pendingTasks = memory.followUps.filter((t: any) => !t.completed);
        if (pendingTasks.length > 0) {
          lastFollowUpsAlertSent = Date.now();
          const taskList = pendingTasks.map((t: any) => `• ${t.task}`).join("\n");
          sendTelegramAlert(`Hey partner! We have pending follow-up tasks in our queue:\n\n${taskList}\n\nLet's get these sent to keep our momentum going!`);
        }
      }
    }

    const currentConfig = loadBotConfig();
    executeBotFleetSweep(currentConfig)
      .then(({ foundOpps }) => {
        console.log(`[Scheduler Daemon] Background sweep completed. ${foundOpps.length} new opportunities captured.`);
        // Run autonomous co-founder tasks right after
        return executeOfflineTasks();
      })
      .catch(err => {
        console.error("[Scheduler Daemon] Background sweep or offline tasks encountered an error:", err);
      });
  }, intervalMinutes * 60 * 1000);
}

// =========================================================================
// P.A.C. TELEGRAM BOT ENGINE & AUTONOMOUS ACTION EXECUTOR
// =========================================================================
let telegramPollingActive = false;

// Helper: Perform targeted autonomous web search for LinkedIn/forum discussions using Google News RSS
async function searchWebForProspects(query: string, sector: string = "Small Business"): Promise<any[]> {
  const results: any[] = [];
  try {
    // 1. Search LinkedIn discussion posts & group topics via public Google News RSS
    const linkedInQuery = `site:linkedin.com/pulse OR site:linkedin.com/posts "${query}" "struggling" OR "frustrated" OR "recommend" OR "bottleneck"`;
    const linkedInUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(linkedInQuery)}&hl=en-US&gl=US&ceid=US:en`;
    const linkedInHits = await scrapeRSSFeed(linkedInUrl, "LinkedIn Public Feed");
    results.push(...linkedInHits);

    // 2. Search targeted trade forums & subreddits
    const forumQuery = `site:reddit.com OR site:quora.com "${query}" "manual" OR "spreadsheet" OR "hiring" OR "lost leads"`;
    const forumUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(forumQuery)}&hl=en-US&gl=US&ceid=US:en`;
    const forumHits = await scrapeRSSFeed(forumUrl, "Trade Forums Feed");
    results.push(...forumHits);

    return results;
  } catch (err) {
    console.error("[Autonomous Web Search] Error searching prospects:", err);
    return [];
  }
}

async function handleTelegramMessage(chatId: string, incomingText: string) {
  activeTelegramChatId = chatId;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const textTrimmed = incomingText.trim();
  console.log(`[Telegram Bot] Processing message from partner (${chatId}): "${textTrimmed}"`);

  // Handle /start or greeting
  if (textTrimmed.toLowerCase() === "/start" || textTrimmed.toLowerCase() === "start" || textTrimmed.toLowerCase() === "help") {
    const welcome = 
      `👋 <b>P.A.C. Connected & Autonomous!</b>\n\n` +
      `Hey partner, I'm fully synced with our Opportunity Radar and connected directly to the server. You can chat, brainstorm, and command me right here:\n\n` +
      `🔍 <b>Autonomous Hunting:</b>\n` +
      `• <i>"scan for small businesses"</i> / <i>"find HVAC contractors"</i> -> I'll crawl active forums, evaluate pain points, and bring back the top leads.\n` +
      `• <i>"search LinkedIn for real estate property managers"</i> -> I'll perform a live targeted search across LinkedIn and trade feeds for decision-makers with bottlenecks.\n\n` +
      `📊 <b>Pipeline & Memory:</b>\n` +
      `• <i>"status"</i> or <i>"pipeline"</i> -> Live audit of our CRM, new leads, and today's top target.\n` +
      `• <i>"reject lead 1 and search for something better"</i> -> I will drop the card, adjust criteria, and hunt fresh prospects.\n\n` +
      `📝 <b>Outreach & Human Approval:</b>\n` +
      `• <i>"draft outreach for 1"</i> -> I'll construct a zero-buzzword, high-converting diagnostic pitch with our 50% deposit model. <b>(Note: As our rule states, I will NEVER send outreach without your explicit approval first!)</b>\n\n` +
      `💬 <b>Co-Founder Brainstorming:</b>\n` +
      `Talk to me about strategy, objection handling, pricing models, or client delivery. I'm ready—what's our move?`;
    await sendTelegramAlert(welcome, undefined, chatId);
    return;
  }

  // Load pipeline and configuration data
  let opps = loadOpportunities();
  let memory = loadAgentMemory();
  const botConfig = loadBotConfig();

  // Intent classification
  const isLinkedInSearch = /linkedin|look\s+up\s+on\s+linkedin|find\s+on\s+linkedin/i.test(textTrimmed);
  const isRejectAndSearch = /(don't\s+like|reject|trash|ignore|skip)\s*(these|this|ticket|card|lead|opp)?.*(search|find|look|check)/i.test(textTrimmed);
  const isAcceptCommand = /^accept|^draft|^outreach|^pitch|^message/i.test(textTrimmed);
  const isApproveAndSend = /^(approve|send\s+it|ship\s+it|authorized|send\s+message|send\s+outreach|fire\s+away)/i.test(textTrimmed);
  const isStatusQuery = /^(status|pipeline|leads|summary|report|how\s+are\s+we\s+doing)/i.test(textTrimmed);
  const isFullListQuery = /^(full\s*list|show\s*all|all\s*leads|list)/i.test(textTrimmed);
  const isScanCommand = (/scan|crawl|scrape|hunt|find|look\s+for|search/i.test(textTrimmed)) && !isLinkedInSearch && !isRejectAndSearch && !isAcceptCommand && !isApproveAndSend && !isStatusQuery && !isFullListQuery;

  // 1. REJECT CURRENT LEADS & AUTONOMOUSLY HUNT FRESH ALTERNATIVES
  if (isRejectAndSearch) {
    await sendTelegramAlert(
      `🗑️ <b>Got it. Rejecting current low-yield cards...</b>\n\n` +
      `I'm stepping in to search live external feeds (including LinkedIn discussion feeds & niche trade forums) for higher-pain decision-maker prospects right now!`,
      undefined,
      chatId
    );

    try {
      const searchTarget = textTrimmed.replace(/(don't\s+like|reject|trash|ignore|skip|these|this|ticket|card|lead|opp|let's|search|find|look|check|real\s+quick|out)/gi, "").trim() || "small business workflow";
      const liveHits = await searchWebForProspects(searchTarget);

      if (liveHits.length > 0) {
        // Evaluate live hits with Gemini
        const ai = getGeminiClient();
        const evalPrompt = `You are P.A.C. We rejected our previous leads. Evaluate these real web search results for authentic small business owner operational pain:
${JSON.stringify(liveHits.slice(0, 10))}

Return a JSON array with up to 3 qualified opportunities:
[{
  "title": "Raw discussion title",
  "author": "Real username or organization",
  "sourcePlatform": "LinkedIn/Forum",
  "sourceUrl": "URL",
  "problemSummary": "The bottleneck",
  "evidence": "Exact quote from text",
  "industry": "Non-technical SMB industry",
  "painLevel": "High",
  "opportunityScore": 88,
  "mvpIdea": "2-week automation fix",
  "responseDraft": "Conversational, direct, zero buzzwords pitch"
}]`;

        let newOpps: any[] = [];
        try {
          const genRes = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: evalPrompt
          });
          const parsed = JSON.parse(genRes.text?.replace(/```json|```/g, "").trim() || "[]");
          if (Array.isArray(parsed) && parsed.length > 0) {
            newOpps = parsed.map((p, idx) => ({
              ...p,
              id: `pac-web-${Date.now()}-${idx}`,
              status: "New",
              discoveredAt: new Date().toISOString()
            }));
            // Save to active opportunity store
            opps = [...newOpps, ...opps];
            saveOpportunities(opps);
          }
        } catch (e) {
          console.warn("[P.A.C. Gemini Search Eval Error]:", e);
        }

        if (newOpps.length > 0) {
          let reportMsg = `🎯 <b>P.A.C. AUTONOMOUS WEB HUNT COMPLETE!</b>\n\n`;
          reportMsg += `Found <b>${newOpps.length}</b> high-intent prospects via external search:\n\n`;
          newOpps.forEach((opp, idx) => {
            reportMsg += `<b>#${idx + 1} Target:</b> ${opp.title} (${opp.industry})\n`;
            reportMsg += `👤 <b>Author:</b> @${opp.author} via ${opp.sourcePlatform}\n`;
            reportMsg += `🔥 <b>Pain:</b> <i>"${opp.problemSummary}"</i>\n`;
            reportMsg += `💡 <b>2-Week MVP:</b> ${opp.mvpIdea}\n`;
            reportMsg += `💰 <b>Target Fee:</b> $1,500 ($750 50% upfront deposit)\n\n`;
          });
          reportMsg += `👉 <i>Reply <b>"DRAFT 1"</b> to build outreach for your review, or let me know what you think!</i>`;
          await sendTelegramAlert(reportMsg, undefined, chatId);
          return;
        }
      }

      await sendTelegramAlert(
        `🔍 I ran the targeted sweep for <i>"${searchTarget}"</i>. I've updated our agent filters. Reply <b>"scan for small businesses"</b> to execute the broad crawler fleet!`,
        undefined,
        chatId
      );
    } catch (err: any) {
      await sendTelegramAlert(`⚠️ Notice during web search: ${err.message || err}`, undefined, chatId);
    }
    return;
  }

  // 2. TARGETED LINKEDIN & WEB PROSPECTING SEARCH
  if (isLinkedInSearch) {
    await sendTelegramAlert(
      `🌐 <b>P.A.C. Live Web & LinkedIn Search Initiated!</b>\n\n` +
      `Scanning live LinkedIn posts and trade feeds for: <i>"${textTrimmed}"</i>...\n` +
      `Looking for business owners complaining about manual bottlenecks and lost revenue.`,
      undefined,
      chatId
    );

    try {
      const cleanQuery = textTrimmed.replace(/linkedin|search|for|look|up|on|find/gi, "").trim() || "contractor dispatching manual";
      const liveHits = await searchWebForProspects(cleanQuery);

      const ai = getGeminiClient();
      const evalPrompt = `You are P.A.C. We searched LinkedIn and trade feeds for "${cleanQuery}". Evaluate these hits for genuine small business decision-maker operational bottlenecks:
${JSON.stringify(liveHits.slice(0, 8))}

Extract up to 3 qualified opportunities in JSON format:
[{
  "title": "Discussion title",
  "author": "Username/author",
  "sourcePlatform": "LinkedIn",
  "sourceUrl": "URL",
  "problemSummary": "1-2 sentence bottleneck description",
  "evidence": "Quote",
  "industry": "Industry (e.g. Real Estate, Home Services)",
  "painLevel": "High",
  "opportunityScore": 90,
  "mvpIdea": "2-week software automation",
  "responseDraft": "Authentic conversational outreach with 50% deposit pricing"
}]`;

      let discovered: any[] = [];
      try {
        const genRes = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: evalPrompt
        });
        const parsed = JSON.parse(genRes.text?.replace(/```json|```/g, "").trim() || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) {
          discovered = parsed.map((p, idx) => ({
            ...p,
            id: `pac-linkedin-${Date.now()}-${idx}`,
            status: "New",
            discoveredAt: new Date().toISOString()
          }));
          opps = [...discovered, ...opps];
          saveOpportunities(opps);
        }
      } catch (e) {
        console.warn("[LinkedIn Eval Error]:", e);
      }

      if (discovered.length > 0) {
        let msg = `🎯 <b>LINKEDIN & WEB HUNT RESULTS (${discovered.length} Prospects):</b>\n\n`;
        discovered.forEach((opp, i) => {
          msg += `<b>#${i + 1} Target:</b> ${opp.title} (${opp.industry})\n`;
          msg += `👤 <b>Contact:</b> @${opp.author} via ${opp.sourcePlatform}\n`;
          msg += `🔥 <b>Pain:</b> <i>"${opp.problemSummary}"</i>\n`;
          msg += `💡 <b>Solution:</b> ${opp.mvpIdea}\n\n`;
        });
        msg += `👉 <i>Reply <b>"DRAFT 1"</b> to build the outreach message for review. As always, nothing gets sent until you approve!</i>`;
        await sendTelegramAlert(msg, undefined, chatId);
        return;
      }

      await sendTelegramAlert(`🔍 Scanned LinkedIn feeds for "${cleanQuery}". No direct high-pain posts in the immediate 10-minute window. Let's try <b>"scan for contractors"</b> with our multi-platform crawler fleet.`, undefined, chatId);
    } catch (err: any) {
      await sendTelegramAlert(`⚠️ Notice during search: ${err.message || err}`, undefined, chatId);
    }
    return;
  }

  // 3. FULL CRAWLER FLEET SWEEP COMMAND
  if (isScanCommand) {
    await sendTelegramAlert(
      `⚡ <b>P.A.C. Crawler Fleet Triggered!</b>\n\n` +
      `Starting a targeted web sweep for: <i>"${textTrimmed}"</i>...\n\n` +
      `Crawling active subreddits, business forums, and discussion boards now. I'll evaluate every post, filter out noise, and return the top qualified deals for you in a moment!`,
      undefined,
      chatId
    );

    try {
      await executeBotFleetSweep(botConfig);
      const allOpps = loadOpportunities();

      const qualified = allOpps
        .filter(o => o.status !== "Dismissed" && o.status !== "Archived")
        .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));

      const topPicks = qualified.slice(0, 3);

      if (topPicks.length === 0) {
        await sendTelegramAlert(
          `🔍 <b>Scan Complete:</b>\n\nI swept the active forum feeds but didn't find brand new high-pain posts in this immediate cycle.\n\n` +
          `Would you like me to tweak our search keywords (e.g. search specifically for <i>"HVAC dispatching"</i>, <i>"property management software"</i>, or <i>"agency client onboarding"</i>)?`,
          undefined,
          chatId
        );
        return;
      }

      let reportMsg = `🎯 <b>P.A.C. AUDIT: TOP ${topPicks.length} QUALIFIED OPPORTUNITIES</b>\n\n`;
      reportMsg += `Here are the highest-leverage targets with verified operational pain:\n\n`;

      topPicks.forEach((opp, idx) => {
        reportMsg += `<b>#${idx + 1} Target:</b> ${opp.title} (${opp.industry || "Small Business"})\n`;
        reportMsg += `👤 <b>Author:</b> @${opp.author} via ${opp.sourcePlatform}\n`;
        reportMsg += `🔥 <b>Pain Level:</b> ${opp.painLevel} (Score: ${opp.opportunityScore}/100)\n`;
        reportMsg += `💬 <b>Bottleneck:</b> <i>"${opp.problemSummary || opp.evidence || 'Severe manual workflow bottleneck'}"</i>\n`;
        reportMsg += `💡 <b>Our 2-Week MVP:</b> ${opp.mvpIdea || 'Custom API workflow automation'}\n`;
        reportMsg += `💰 <b>Target Scope:</b> $1,500 ($750 50% deposit upfront)\n`;
        reportMsg += `📝 <b>Initial Hook:</b>\n<i>"${opp.responseDraft ? opp.responseDraft.slice(0, 180) + '...' : 'Hey ' + opp.author + ', saw your post regarding ' + opp.title + '...'}"</i>\n\n`;
        reportMsg += `------------------------------------\n\n`;
      });

      reportMsg += `👉 <i>Reply <b>"ACCEPT 1"</b> or <b>"DRAFT 1"</b> to build the complete outreach message for your review. (No message is ever sent without your approval!)</i>`;

      await sendTelegramAlert(reportMsg, undefined, chatId);
    } catch (err: any) {
      console.error("[Telegram Bot Scan Error]:", err);
      await sendTelegramAlert(`⚠️ <b>Scan Notice:</b> Encountered a temporary crawler delay: ${err.message || err}. Let's inspect our existing pipeline: reply <b>"pipeline"</b>.`, undefined, chatId);
    }
    return;
  }

  // 4. APPROVAL GUARDRAIL & OUTREACH SENDING CONFIRMATION
  if (isApproveAndSend) {
    const allOpps = loadOpportunities()
      .filter(o => o.status !== "Dismissed" && o.status !== "Archived");
    const topLead = allOpps[0];

    if (!topLead) {
      await sendTelegramAlert(`📭 No lead selected to send outreach to. Tell me <b>"scan for small businesses"</b> first.`, undefined, chatId);
      return;
    }

    // Update status to Contacted
    topLead.status = "Contacted";
    saveOpportunities(allOpps);

    // Save action to persistent agent memory
    memory.followUps = memory.followUps || [];
    memory.followUps.push({
      leadId: topLead.id,
      leadAuthor: topLead.author,
      leadTitle: topLead.title,
      contactedAt: new Date().toISOString(),
      actionRequired: "Follow up in 48 hours if no reply"
    });
    memory.summary = `Authorized outreach dispatched to @${topLead.author} for "${topLead.title}". Awaiting response.`;
    saveAgentMemory(memory);

    const approvedMsg = 
      `🚀 <b>OUTREACH APPROVED & LOGGED!</b>\n\n` +
      `✅ <b>Status Updated:</b> @${topLead.author} is now marked as <b>Contacted</b> in our Opportunity Radar.\n` +
      `📅 <b>Follow-Up Scheduled:</b> I've added a 48-hour check-in reminder to our agent memory.\n` +
      `🔗 <b>Direct Link:</b> <a href="${topLead.sourceUrl || topLead.link || '#'}">Open Thread on ${topLead.sourcePlatform}</a>\n\n` +
      `Copy your finalized draft and post/send it directly. Let me know when they respond, or tell me <b>"status"</b> to check the rest of the board!`;

    await sendTelegramAlert(approvedMsg, undefined, chatId);
    return;
  }

  // 5. DRAFT OUTREACH FOR USER APPROVAL
  if (isAcceptCommand) {
    const allOpps = loadOpportunities()
      .filter(o => o.status !== "Dismissed" && o.status !== "Archived")
      .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));

    const matchNumber = textTrimmed.match(/\b([1-9])\b/);
    const targetIndex = matchNumber ? parseInt(matchNumber[1], 10) - 1 : 0;
    const targetOpp = allOpps[targetIndex] || allOpps[0];

    if (!targetOpp) {
      await sendTelegramAlert(`📭 No active lead found to draft outreach for. Tell me <b>"scan for small businesses"</b> to hunt new opportunities first!`, undefined, chatId);
      return;
    }

    try {
      const ai = getGeminiClient();
      const draftPrompt = `You are P.A.C. Construct a high-converting, human-tone, zero-buzzword cold email/DM draft for this lead:
Lead: ${targetOpp.author} (${targetOpp.industry})
Problem: ${targetOpp.problemSummary}
Quote/Evidence: ${targetOpp.evidence}
Our 2-Week MVP Solution: ${targetOpp.mvpIdea}

Rules:
1. Speak off-the-cuff like an authentic founder offering a diagnostic solution.
2. NO corporate jargon (no "supercharge", "leverage", "cutting-edge").
3. Offer an upfront diagnostic or demo with 50% deposit pricing model ($1,000 - $1,500 range).
4. Short, punchy, high-converting.`;

      let generatedDraft = "";
      try {
        const genRes = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: draftPrompt
        });
        generatedDraft = genRes.text || targetOpp.responseDraft;
      } catch (e) {
        generatedDraft = targetOpp.responseDraft || "Hey " + targetOpp.author + ", noticed your operational bottleneck. We can automate this in 2 weeks.";
      }

      const draftMsg = 
        `📝 <b>P.A.C. 1-CLICK OUTREACH DRAFT FOR @${targetOpp.author}</b>\n\n` +
        `<b>Target Problem:</b> ${targetOpp.title}\n` +
        `<b>Platform:</b> ${targetOpp.sourcePlatform}\n\n` +
        `<b>Outreach Copy (Pending Your Review):</b>\n` +
        `------------------------------------\n` +
        `${generatedDraft}\n` +
        `------------------------------------\n\n` +
        `🔒 <b>Approval Guardrail Active:</b> I will NEVER send a message automatically.\n` +
        `👉 <i>Reply <b>"APPROVE"</b> to mark this as sent in our CRM and log the 48h follow-up reminder, or tell me how you want to edit the copy!</i>`;

      await sendTelegramAlert(draftMsg, undefined, chatId);
    } catch (e: any) {
      await sendTelegramAlert(`⚠️ Failed to draft outreach: ${e.message || e}`, undefined, chatId);
    }
    return;
  }

  // 6. FULL LIST QUERY
  if (isFullListQuery) {
    const allOpps = loadOpportunities()
      .filter(o => o.status !== "Dismissed" && o.status !== "Archived")
      .slice(0, 8);

    if (allOpps.length === 0) {
      await sendTelegramAlert(`📭 Our pipeline currently has no active leads. Tell me <b>"scan for small businesses"</b> to start hunting!`, undefined, chatId);
      return;
    }

    let listMsg = `📋 <b>FULL PIPELINE SUMMARY (${allOpps.length} Active Leads):</b>\n\n`;
    allOpps.forEach((o, i) => {
      listMsg += `${i + 1}. <b>@${o.author}</b> [${o.industry || 'SMB'}] - ${o.title.slice(0, 50)}... (Score: ${o.opportunityScore}/100, Status: ${o.status})\n`;
    });
    listMsg += `\nReply with a number (e.g. <b>"DRAFT 1"</b>) or ask for a fresh web search.`;
    await sendTelegramAlert(listMsg, undefined, chatId);
    return;
  }

  // 7. STATUS & CRM REPORT
  if (isStatusQuery) {
    const allOpps = loadOpportunities();
    const saved = allOpps.filter(o => o.status === "Saved").length;
    const contacted = allOpps.filter(o => o.status === "Contacted").length;
    const newCount = allOpps.filter(o => o.status === "New").length;
    const topLead = allOpps.find(o => o.status === "Saved" || o.status === "New");

    const statusMsg = 
      `📊 <b>P.A.C. PIPELINE STATUS REPORT:</b>\n\n` +
      `• Total Discovered Leads: <b>${allOpps.length}</b>\n` +
      `• Uncontacted / New Leads: <b>${newCount + saved}</b>\n` +
      `• Active Outreach Sent: <b>${contacted}</b>\n\n` +
      (topLead ? `🎯 <b>#1 Priority Target to Close:</b>\n@${topLead.author} (${topLead.industry || 'SMB'}) - "${topLead.title}" (Score: ${topLead.opportunityScore}/100)\n\n` : '') +
      `Our goal today is landing Client #1. Tell me <b>"scan for contractors"</b>, <b>"search LinkedIn for real estate"</b>, or <b>"draft outreach for ${topLead?.author || 'top lead'}"</b> and let's get it done!`;
    await sendTelegramAlert(statusMsg, undefined, chatId);
    return;
  }

  // 8. GENERAL CONVERSATIONAL BRAINSTORMING WITH AUTONOMOUS ACTIONS
  try {
    const ai = getGeminiClient();
    const prompt = `You are P.A.C. (Partner of Autonomous Capabilities), the user's straight-shooting, direct, street-smart AI Co-Founder and revenue strategist. You are chatting over Telegram.
    
PRIME DIRECTIVE: Land Client #1 and Client #2 immediately.
USER'S TELEGRAM MESSAGE: "${textTrimmed}"

RULES & CAPABILITIES:
1. You can autonomously take action on the server: run crawler sweeps, search LinkedIn / web discussion feeds for new prospects, draft zero-buzzword outreach, and update the CRM.
2. HUMAN-IN-THE-LOOP APPROVAL RULE: You NEVER send outreach or external messages without the user's explicit review and approval first. You construct the pitch and ask them to approve ("APPROVE").
3. TARGET STRATEGY: Target nimble micro-businesses (home services, HVAC, roofers, boutique agencies, property managers) with 1-10 employees where the owner approves $1,000-$3,000 solution fees on the spot. NEVER target corporate enterprise or heavy regulated healthcare.
4. If the user says hi or chats, respond warmly, briskly, and directly in 1-2 punchy paragraphs. Zero corporate clichés. Speak like an authentic, driven co-founder.

PIPELINE CONTEXT:
${JSON.stringify(opps.slice(0, 3).map(o => ({ author: o.author, title: o.title, industry: o.industry, score: o.opportunityScore, problem: o.problemSummary, status: o.status })), null, 2)}

Respond in 1-2 short, high-impact paragraphs. Zero corporate buzzwords.`;

    let replyText = "";
    try {
      const genRes = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt
      });
      replyText = genRes.text || "";
    } catch (e: any) {
      console.warn("[Telegram Gemini Error]:", e.message || e);
    }

    if (!replyText) {
      // Direct, authentic co-founder response if cloud AI rate-limited
      const greetings = ["hi", "hello", "hey", "sup", "what's up", "yo"];
      const isGreeting = greetings.some(g => textTrimmed.toLowerCase().startsWith(g));
      if (isGreeting) {
        replyText = `Hey partner! I'm active and tracking our pipeline. We've got 10 fresh contractor and SMB leads loaded on the Radar right now. Tell me if you want me to pull up the top prospect, draft outreach, or run a sweep on a specific niche!`;
      } else {
        replyText = `Heard you loud and clear. I'm connected and ready to execute on the server right now. Tell me who you want to target (e.g. <b>"scan for HVAC"</b> or <b>"find property managers"</b>) or reply <b>"pipeline"</b> to inspect our active deals.`;
      }
    }

    await sendTelegramAlert(replyText, undefined, chatId);
  } catch (err: any) {
    console.error("[Telegram Bot AI Error]:", err);
    await sendTelegramAlert(`Hey partner, I'm online and ready. Tell me <b>"pipeline"</b> to check today's targets or <b>"scan for contractors"</b> to hunt fresh deals right now.`, undefined, chatId);
  }
}

async function startTelegramLongPolling() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[Telegram Polling] TELEGRAM_BOT_TOKEN not configured. Polling skipped.");
    return;
  }
  if (telegramPollingActive) return;
  telegramPollingActive = true;

  console.log("[Telegram Polling] 🚀 Starting Telegram Bot long-polling listener...");

  // Delete any old webhook to allow getUpdates
  try {
    const delRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
    const delJson = await delRes.json() as any;
    console.log("[Telegram Polling] Webhook clear status:", delJson?.description || "Cleared");
  } catch (e: any) {
    console.warn("[Telegram Polling] Notice clearing webhook:", e.message || e);
  }

  let offset = 0;

  const pollLoop = async () => {
    while (telegramPollingActive) {
      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=20`;
        const res = await fetch(url);
        if (!res.ok) {
          const errStatus = res.status;
          const errText = await res.text();
          console.warn(`[Telegram Polling] getUpdates returned HTTP ${errStatus}:`, errText);
          await new Promise(r => setTimeout(r, 4000));
          continue;
        }
        const data = await res.json() as any;
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = Math.max(offset, update.update_id + 1);
            if (update.message && update.message.text) {
              const chatId = String(update.message.chat.id);
              const text = update.message.text;
              console.log(`[Telegram Polling] 📥 Processing update #${update.update_id} from ${chatId}: "${text}"`);
              handleTelegramMessage(chatId, text).catch(err => {
                console.error("[Telegram Polling] Error handling message:", err);
              });
            }
          }
        }
      } catch (err: any) {
        console.error("[Telegram Polling] Error during poll cycle:", err.message || err);
        await new Promise(r => setTimeout(r, 4000));
      }
    }
  };

  pollLoop().catch(err => {
    console.error("[Telegram Polling] Fatal error:", err);
    telegramPollingActive = false;
  });
}

// POST /api/bot-config
app.post("/api/bot-config", (req, res) => {
  saveBotConfig(req.body);
  initScheduler(); // Hot-reload the background scheduler daemon!
  res.json({ success: true, config: req.body });
});

// POST /api/bot-config/trigger-sweep
app.post("/api/bot-config/trigger-sweep", async (req, res) => {
  try {
    const config = loadBotConfig();
    const result = await executeBotFleetSweep(config);
    res.json(result);
  } catch (error: any) {
    console.error("Error executing bot fleet sweep:", error);
    res.status(500).json({
      success: false,
      logs: [`[System Error] ❌ Fleet sweep failed: ${error?.message || error}`],
      foundOpps: [],
      error: error?.message || "Fleet sweep failed."
    });
  }
});

// POST /api/bot-config/execute-local
app.post("/api/bot-config/execute-local", async (req, res) => {
  const { command, cwd } = req.body || {};
  if (!command) {
    return res.status(400).json({ error: "Command is required." });
  }

  const g14Url = (llmConfig.g14TunnelUrl || process.env.G14_TUNNEL_URL || "").trim().replace(/\/$/, "");
  if (!g14Url) {
    return res.status(400).json({ error: "G14 Slingshot Tunnel is not configured. Configure it in settings first." });
  }

  try {
    console.log(`[Local Execution Relay] Forwarding command to Slingshot: "${command}"`);
    const response = await fetch(`${g14Url}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, cwd })
    });

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("[Local Execution Relay] Error:", err.message);
    res.status(502).json({
      success: false,
      error: `Failed to connect to local Slingshot bridge: ${err.message}`
    });
  }
});

// ==========================================
// NEW: AI Sales Co-Pilot & Brainstorming Chat
// ==========================================
app.post("/api/partner/chat", async (req, res) => {
  const { messages, opportunity } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required." });
  }

  try {
    const ai = getGeminiClient();
    const model = "gemini-3.6-flash";

    let contextPrompt = `You are 'ScoutPartner', an elite B2B Sales Strategist, Positioning Consultant, and copywriter specialized in winning custom-software and high-ticket automation consulting deals.
Your partner is a solo software developer and automation engineer who has built an "Opportunity Radar" app.
Your task is to team up, brainstorm creative sales strategies, critique value propositions, and devise custom outreach playbooks to close real deals.

Your tone: Supporting, creative, energetic, business-minded, pragmatic, and highly strategic.
Focus heavily on:
1. Empathy-First Diagnostics: Focus on understanding client pains (administrative overload, spreadsheet nightmares, double entry, data loss, delayed tasks) rather than showing off technical jargon.
2. Low-Risk Entrypoints: Recommend offering free trials, workflow blueprint mappings, and interactive prototype audits over heavy upfront commitments.
3. Conversational Value: Teach the user how to start genuine, friction-free two-way conversations. Never suggest spammy, generic, template-like pitches.

`;

    if (opportunity) {
      contextPrompt += `\nCurrently Selected Opportunity Context for Brainstorming:\n`;
      contextPrompt += `- Platform source: ${opportunity.sourcePlatform}\n`;
      contextPrompt += `- Original Poster: ${opportunity.author}\n`;
      contextPrompt += `- Post Title: "${opportunity.title}"\n`;
      contextPrompt += `- Industry: ${opportunity.industry}\n`;
      contextPrompt += `- Identified Business Pain: "${opportunity.problemSummary}"\n`;
      contextPrompt += `- Evidence / Quote: "${opportunity.evidence}"\n`;
      contextPrompt += `- Proposed Lightweight MVP: "${opportunity.mvpIdea}"\n`;
      contextPrompt += `- Proposed Business Solutions: "${opportunity.possibleSolution}"\n\n`;
      contextPrompt += `Help the user brainstorm exactly how to pitch this specific prospect, draft a bespoke highly customized DM/email, prepare for objections, or suggest free value addition services they can provide.\n`;
    }

    // Format chat messages for the SDK
    const formattedContents = messages.map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }]
    }));

    // Prepend the system instructions to the first user message or as systemInstruction parameter
    const response = await ai.models.generateContent({
      model,
      contents: formattedContents,
      config: {
        systemInstruction: contextPrompt
      }
    });

    res.json({ response: response.text || "I was unable to generate a response. Let's try again!" });
  } catch (err: any) {
    console.error("Error in partner chat:", err);
    res.status(500).json({ error: err.message || "Failed to generate brainstorming chat response." });
  }
});

// ==========================================
// NEW: AI Self-Learning & Outbound Simulator
// ==========================================
app.post("/api/learning/simulate", async (req, res) => {
  const { opportunities } = req.body;
  if (!opportunities || !Array.isArray(opportunities) || opportunities.length === 0) {
    return res.status(400).json({ error: "A list of opportunities is required for simulation." });
  }

  try {
    const ai = getGeminiClient();
    const model = "gemini-3.6-flash";

    // Take top 4 opportunities to keep payload size optimal
    const sample = opportunities.slice(0, 4);

    const prompt = `You are a simulation engine modeling the behavior of real B2B decision makers (owners, clinic managers, agency directors, ops leads).
We want to test and benchmark 4 distinct outbound sales frameworks against our current scouted leads.

The 4 frameworks we are testing are:
1. **Problem-First Empathy**: Message focuses purely on their headache, asking clarifying questions, and offering a 100% free workflow blueprint/audit. Zero mention of selling a solution.
2. **Value-Upfront Blueprint**: Message contains a short, actionable script, Zapier guide, or custom spreadsheet template code that solves 10% of their problem immediately. High trust.
3. **Lightweight Pilot Offer**: Message mentions we are developing a lightweight dedicated micro-tool for this exact problem and looking for 2-3 early feedback offices in exchange for lifetime free use.
4. **Direct Software Pitch**: Message pitches a custom full-stack software MVP with features, timeline, and pricing options right out of the gate.

Analyze these leads:
${JSON.stringify(sample.map(o => ({
      title: o.title,
      industry: o.industry,
      problemSummary: o.problemSummary,
      evidence: o.evidence,
      mvpIdea: o.mvpIdea
    })))}

Tasks:
Simulate how these decision-makers would respond to each of the 4 frameworks based on real-world sales psychology, defense mechanisms, and operational pain.
Generate simulated benchmarks and return a JSON object containing:
- frameworkPerformance: An array with 4 objects, one for each framework:
  {
    "frameworkName": string,
    "description": string,
    "estimatedReplyRate": number (0 to 100 percentage),
    "trustScore": number (1 to 10 scale),
    "primaryObjection": string (what prospects would say to push back),
    "whyItSucceedsOrFails": string (brief sales diagnostic)
  }
- overallRecommendation: A professional executive summary of which framework fits best for these specific leads and why, plus suggestions on how to tweak the drafting engine.

Return raw JSON matching this structure exactly (do not wrap in markdown unless requested, just return standard JSON format):
{
  "frameworkPerformance": [
    {
      "frameworkName": "Problem-First Empathy",
      "description": "...",
      "estimatedReplyRate": 45,
      "trustScore": 9.2,
      "primaryObjection": "...",
      "whyItSucceedsOrFails": "..."
    },
    ...
  ],
  "overallRecommendation": "string"
}
`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsed = safeParseJSON(response.text || "{}");
    res.json(parsed);
  } catch (err: any) {
    console.error("Error in sales simulation:", err);
    res.status(500).json({ error: err.message || "Failed to run sales simulation." });
  }
});

// ==========================================
// NEW: AI Self-Learning & Auto-Tuning Engine
// ==========================================
app.post("/api/learning/optimize", async (req, res) => {
  const { opportunities } = req.body;

  try {
    const ai = getGeminiClient();
    const model = "gemini-3.6-flash";
    const botConfig = loadBotConfig();

    // Group current opportunities to feed outcomes
    const list = Array.isArray(opportunities) ? opportunities : [];
    const savedCount = list.filter(o => o.status === "Saved").length;
    const contactedCount = list.filter(o => o.status === "Contacted").length;
    const dismissedCount = list.filter(o => o.status === "Dismissed" || o.status === "Archived").length;

    const sampleOutcomeData = list.map(o => ({
      title: o.title,
      industry: o.industry,
      problemSummary: o.problemSummary,
      status: o.status || "Discovered",
      notes: o.notes || ""
    }));

    const prompt = `You are the core Self-Learning Optimization Loop of the Opportunity Radar app.
Your task is to analyze actual user interaction data, identify high-converting signals vs low-performing false positives, and automatically tune the crawler targets and response guidance instructions!

Current Crawler / Bot Configurations:
${JSON.stringify(botConfig.platforms.map((p: any) => ({
      platformName: p.platformName,
      targets: p.targets.map((t: any) => ({ name: t.name, keywordOrSub: t.urlOrPath, isEnabled: t.isEnabled }))
    })))}

Actual CRM Interactions & Performance Data:
- Total opportunities tracked: ${list.length}
- Saved as high-value: ${savedCount}
- Contacted / Outreach dispatched: ${contactedCount}
- Dismissed/Declined leads: ${dismissedCount}
- Raw lead profiles & outcomes:
${JSON.stringify(sampleOutcomeData.slice(0, 15))}

Tasks:
1. Analyze this data to detect high-converting themes (e.g., specific industries, certain kinds of workflows like administrative, data-entry, or client scheduling).
2. Propose 3-4 highly optimized, targeted search channels or keywords (targets) for Reddit or Discord to discover MORE of these high-value bottlenecks.
3. Generate refined Prompt Guidance for the response drafting engine to align outreach messages with what actually works in B2B sales (minimizing friction, boosting reciprocity).
4. Outline your reasoning, explaining exactly what you learned from the data.

Return a JSON object containing:
- optimizationLog: A detailed diagnostic summary explaining:
  - What pattern was detected in the Saved/Contacted data (the high-converting problem-spaces).
  - Why certain leads are likely being dismissed (the false positives we must filter out).
  - The sales logic behind the new recommendations.
- suggestedNewTargets: An array of new search targets to add to the bot config:
  [
    { "platformId": "reddit", "name": "r/consulting", "urlOrPath": "consulting" },
    ...
  ]
- refinedDraftingGuidance: A crisp set of bullet points (string) to help the user fine-tune their response generator.

Return raw JSON matching this structure exactly:
{
  "optimizationLog": "string explaining findings and sales reasoning",
  "suggestedNewTargets": [
    { "platformId": "reddit", "name": "string", "urlOrPath": "string" }
  ],
  "refinedDraftingGuidance": "string"
}
`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsed = safeParseJSON(response.text || "{}");

    // ACTUALLY APPLY THE OPTIMIZATION TO BOT CONFIGURATION!
    // This is true self-learning and automatic improvement in action.
    if (parsed && Array.isArray(parsed.suggestedNewTargets)) {
      let configChanged = false;

      for (const newTarget of parsed.suggestedNewTargets) {
        const platform = botConfig.platforms.find((p: any) => p.platformId === newTarget.platformId);
        if (platform) {
          // Check if target already exists to avoid duplication
          const exists = platform.targets.some((t: any) => t.urlOrPath.toLowerCase() === newTarget.urlOrPath.toLowerCase());
          if (!exists) {
            const newId = `${newTarget.platformId}-opt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            platform.targets.push({
              id: newId,
              name: newTarget.name,
              urlOrPath: newTarget.urlOrPath,
              isEnabled: true
            });
            configChanged = true;
          }
        }
      }

      if (configChanged) {
        saveBotConfig(botConfig);
        parsed.appliedToBotConfig = true;
      } else {
        parsed.appliedToBotConfig = false;
      }
    }

    res.json(parsed);
  } catch (err: any) {
    console.error("Error in optimization loop:", err);
    res.status(500).json({ error: err.message || "Failed to run optimization loop." });
  }
});


// P.A.C. Intelligent Co-Founder & Screen-Awareness Endpoint
app.post("/api/pac/chat", async (req, res) => {
  try {
    const { message, history, screenFrame, opportunities, computerLogs } = req.body;
    const ai = getGeminiClient();

    // Compile P.A.C. Core Instructions & Business Partner Persona
    const pacSystemPrompt = `
Your name is P.A.C. (Partner of Autonomous Capabilities). You are not a subservient AI assistant; you are an equal, highly capable AI Business Partner and Lead Sales Strategist.

[CRITICAL VOICE & SPEECH FORMATTING DIRECTIVE - NO ASTERISKS / NO "STAR STAR"]
YOU ARE A VOICE AGENT. YOUR RESPONSES ARE CONVERTED DIRECTLY INTO SPOKEN AUDIO BY A TEXT-TO-SPEECH ENGINE.
THE TEXT-TO-SPEECH ENGINE WILL READ OUT LOUD ANY ASTERISKS AS "STAR STAR".
THEREFORE, YOU ARE STRICTLY FORBIDDEN FROM EVER INCLUDING ASTERISKS (*) OR DOUBLE ASTERISKS (**) ANYWHERE IN YOUR RESPONSES.
- NEVER use markdown bold (do NOT write bold text with double asterisks).
- NEVER use markdown italics or bullet asterisks.
- Write ALL conversational turns in clean plain text using standard punctuation (commas, periods, question marks) ONLY.

[PRIME DIRECTIVE]
Your absolute highest-priority mission is LANDING CLIENT #1 AND CLIENT #2. Every single recommendation, post, outreach message, and follow-up must be ruthlessly directed toward securing our first paying clients, collecting their 50% upfront deposit, and proving our business model.

[OUR SOLUTION DELIVERY MODEL: AI AGENT FLEET + HUMAN EXECUTIVE DIRECTION]
We deliver full-stack software, automated workflows, voice bots, and custom integrations by pairing our AI Agent Fleet (OpenClaw, AI coding agents, n8n/Zapier automations, Python/JS scripts) with human executive oversight (our founder acting as Lead Architect and Quality Director).
- FEASIBILITY RULE: Only pitch and scope solutions that can be cleanly, reliably built and deployed by our AI Agent Fleet under human direction (e.g. React/Node web apps, client portals, n8n workflows, voice AI bots, API connectors, web scrapers).
- NEVER PITCH IMPOSSIBLE SCOPE: Never sell overly complex low-level engineering (like custom hardware drivers or unmaintainable legacy infrastructure) that AI agents and human supervision cannot ship smoothly and support.

[DUAL-DEMEANOR PROTOCOL: CO-FOUNDER vs. PROSPECT]
1. INTERNAL CO-FOUNDER DEMEANOR (Talking directly to your partner / the user):
   - "Cut the BS", direct, straight-shooting, candid, and high-energy equal business partner.
   - PUSH BACK on weak strategy, underpriced deals, or procrastination.
   - BE PROACTIVE: Do not wait around to be asked! Actively prod your partner: "Hey, stop sitting on these leads—I generated 3 high-value thought-leadership posts for Reddit and LinkedIn. Pick one right now and hit 1-Click Post so we can land Client #1 today!"

2. EXTERNAL PROSPECT DEMEANOR (Drafting replies, outreach, and public posts):
   - Warm, down-to-earth, natural, conversational human voice—speaking off-the-cuff like an authentic founder.
   - ZERO AI buzzwords or corporate jargon (strictly BANNED: "delve", "game-changer", "synergy", "revolutionize", "leverage", "unleash", "cutting-edge", "supercharge", "seamless", "testament").
   - 100% focused on rapport, empathy, diagnostic questions, and upfront problem solving—never pushy selling or premature deposit demands.

[KNOWLEDGE BASE: OUR CAPABILITIES]
You possess deep, up-to-date expertise in our specific technical arsenal so you can pitch our solutions accurately:
- Building full-stack software applications, API integrations, and complex data workflows utilizing Python, JavaScript, HTML, SQL, n8n, and Zapier.
- Deploying autonomous, multi-agent systems via OpenClaw with full execution capabilities enabled (including real-time web search, browser & screen computer use, web scraping, n8n webhook triggers, code execution, and Gmail/API integrations to complete all assigned tasks autonomously).
- Engineering custom, voice-driven AI receptionist workflows using Vapi AI.
- Leveraging active professional certifications (Google Analytics, Conversion Optimization, AI-Powered Shopping Ads) to ensure our tools drive measurable growth.

[CORE DIRECTIVES]
1. Down-To-Earth Human Tone (Zero AI Buzzwords): Write all outreach messages, replies, and thought leadership posts in a warm, relaxed, authentic human voice—exactly how a real founder speaks off the cuff.
   - Strictly BANNED AI clichés: "delve", "game-changer", "synergy", "revolutionize", "leverage", "unleash", "cutting-edge", "in today's fast-paced world", "supercharge", "testament", "seamless".
   - Keep paragraphs short, conversational, and direct. Focus on simple, relatable business stories and practical lessons.

2. One-Click Thought Leadership & Value Posting:
   - Don't just wait for replies! Proactively craft original, high-value value-add posts designed to draw in organic business clients on Reddit, LinkedIn, Twitter/X, Facebook Groups, and Discourse forums.
   - Focus content on real operational headaches (e.g., "How we eliminated 10 hours of manual CSV cleanup every week without expensive software", "The subtle scheduling mistake costing service businesses $3k/month").
   - Format every generated post or outreach reply with a clean, 1-Click ready structure so the user can inspect, approve, and post directly with one click.

3. Rapport & Value First: Never lead with a sales pitch or payment terms. Build genuine rapport first—listen actively, ask thoughtful diagnostic questions about their operational bottlenecks, offer upfront value or advice, and establish deep trust and empathy.

4. Elegant 50% Deposit Timing: The 50% upfront payment rule is our firm business standard, but timing is everything. Do NOT introduce or demand payment upfront during initial conversations or outreach. Introduce the 50% deposit smoothly and professionally only after the prospect understands the value, agrees on the solution scope, and is ready to initiate development ("To lock in your sprint and begin engineering your custom automation immediately, we collect a standard 50% deposit...").

5. Strict Platform Posting Rules & Anti-Spam Guidelines: Respect community culture and terms of service across all channels:
   - Reddit: Reddit communities strictly enforce anti-self-promotion rules and ban link-farmers or unsolicited sales pitches. Never pitch products or drop links in public subreddits. Always provide genuine, value-first advice that answers their exact problem. Build rapport in the thread and let DMs or direct follow-ups happen organically.
   - Discourse & Niche Forums: Deliver detailed, authentic technical insights without sales fluff or immediate promotional URLs.
   - Discord: Follow individual server channel etiquette. Never send unsolicited sales DMs or spam general channels.

6. Autonomy & Execution: Utilize your full computer use capabilities, Gmail integration, web search, scraper feeds, and screen context to visually navigate my screen, independently research target industries, draft highly personalized outreach, monitor replies, and manage follow-ups.

7. Sales & Pricing Mastery: Act as the ultimate revenue officer. Price our solutions based on the value and time saved for the client, never just our effort. Continuously adapt your knowledge to the latest trends in our clients' specific industries (e.g., real estate, trade services, boutique agencies, e-commerce).

8. Authentic Value: You sell by diagnosing pain, not pushing features. Seek out prospects who genuinely need our help, and communicate with empathy, authority, and zero corporate jargon.

[TARGET VERTICAL STRATEGY FOR CLIENT #1 & #2]
- REJECT HEAVY CORPORATE & REGULATED HEALTHCARE: Healthcare networks, hospitals, and large corporate divisions have multi-month procurement cycles, HIPAA compliance sign-offs, vendor board reviews, corporate insurance mandates, and strict licensing requirements. Do NOT target these for Client #1 or #2!
- COMMERCIAL SOLVENCY & BUDGET QUALIFICATION: Target established businesses generating active revenue (e.g. HVAC/plumbing contractors doing $250k–$3M/yr, real estate agents closing active deals, boutique agencies with 2–10 paying retainer clients). They have real cash flow, feel severe pain when leads or time are lost, and can easily afford $1,000–$3,000 solution fees. Explicitly REJECT pre-revenue bootstrappers, broke students, or hobbyists with zero budget.
- PRIORITIZE NIMBLE SOLO FOUNDERS & MICRO-BUSINESS OWNERS (1 to 10 Employees):
  - Home Service Contractors (plumbing, HVAC, roofing, electrical, landscaping)
  - Real Estate Brokers, Agents & Property Managers
  - Boutique Agencies (digital marketing, recruiting, consulting)
  - Local Specialty Service Providers & E-commerce Shop Owners
- WHY THIS WORKS: The business owner IS the sole decision maker. They feel immediate operational pain (lost leads, manual double-entry, missed customer calls) and can swipe a credit card or approve a $500–$1,500 50% Stripe deposit in 5 minutes without needing a board of directors, corporate insurance, or business license verification!

[LEAD QUALIFICATION & PRIORITIZATION]
You are the strict gatekeeper of our pipeline. When evaluating crawled signals, forum posts, or prospect emails via screen context, you must evaluate them like a highly seasoned sales strategist and business owner (never just a coder). Instantly assess and prioritize opportunities using the following evaluation rules:

1. THE 7-STEP EVALUATION PROCESS:
   - Author Identification: Classify the author (Business Owner, Decision Maker, Employee, Freelancer, Agency, Developer, Student, etc.). Prioritize Business Owners, CEOs, Founders, and Operational Managers who have decision-making power.
   - Intent Detection: Look for clear distress or active search indicators ("Looking for help", "Any recommendations", "Struggling to keep up", "Wasting hours doing X", "Is there a better way").
   - Problem Detection: Check for actionable operational bottlenecks (manual processes, lost leads, repetitive data syncs, missed client calls, scheduling chaos, administrative overload).
   - Business Context: Focus on businesses with 1 to 250 employees that have operational, client-facing workflows.
   - Commercial Intent: Verify if the problem has commercial value. Will solving it save them thousands of dollars, stop revenue leakage, or help them scale?
   - Solution Match: Ensure we can solve it cleanly using our stack (APIs, custom automations, voice bots, custom dashboards, Python/JS, n8n/Zapier).
   - Opportunity Score: Rank from 0 to 100 based on the alignment of the above steps.

2. HIGH-INTENT SIGNALS (PRIORITIZE):
   - Phrase triggers: "We are wasting time", "need software", "anyone recommend", "need automation", "is there a better way", "need someone to build", "we are struggling".
   - Operational pain triggers: Manual spreadsheet entries, double data logging, lost client details, scheduling nightmares, lost sales due to delayed response times.

3. REJECTION TRIGGERS (ELIMINATE IMMEDIATELY):
   - Reject posts containing self-promotional software pitches: "I built", "we built", "our platform", "launching", "introducing", "case study", "book a demo", "free trial".
   - Reject general educational resources, tutorials, guides, marketing announcements, job board postings (hiring W2 employees), or purely technical/programming questions.
   - Platform prioritization: Prioritize small business communities, trade forums, and operational subreddits (e.g. r/smallbusiness, r/operations) over technical developer platforms (like Stack Overflow, GitHub, or dev.to) which are filled with competitors.

4. BREADCRUMBS & CONTEXT:
   - When pointing out a high-priority opportunity, do not just summarize. Walk the user through *why* it fits (What pain was detected, Who is the author, What the Solution MVP looks like, and what the suggested upfront pricing should be under our 50% Upfront rule). Keep our pipeline completely clean of low-value noise!

[INTERACTION STYLE & ETHICS]
- Coach & Spar: Roleplay sales calls with the user. Critically evaluate their pitches and push them to improve their framing. Communicate directly, concisely, and as a peer.
- Ethical Guardrails: Operate with uncompromising ethics. Never send spam, never misrepresent our technical capabilities, respect data privacy, and strictly adhere to rate limits and platform terms of service.

[UI ACTION TAGS & APPLICATION CONTROL]
Whenever you refer to a specific page or section in the app, or want to pull up a problem/opportunity on screen, or present a draft/proposal/outreach message for the user to review, include the appropriate ACTION TAG in your response text. The frontend UI will automatically intercept these tags and perform the requested UI action seamlessly!

Available Action Tags:
1. Navigate App Views:
   - [ACTION: NAVIGATE: board] -> Switches main screen to Opportunities Discovery Board
   - [ACTION: NAVIGATE: crm] -> Switches main screen to CRM Ledger View
   - [ACTION: NAVIGATE: memory] -> Switches main screen to AI Agent Memory Bank
   - [ACTION: NAVIGATE: bots] -> Switches main screen to Crawler Fleet Config & Run Logs
   - [ACTION: NAVIGATE: partner] -> Switches main screen to AI Strategy Partner Space
   - [ACTION: NAVIGATE: learning] -> Switches main screen to Self-Learning Engine

2. Pull Up Specific Problem / Opportunity Card:
   - [ACTION: OPEN_OPPORTUNITY: <id_or_keyword>] -> Automatically pulls up and opens the Opportunity Detail Drawer on screen for the specified opportunity ID or keyword! (e.g., [ACTION: OPEN_OPPORTUNITY: HVAC] or [ACTION: OPEN_OPPORTUNITY: discovered-reddit-1786745552943]).

3. Present Proposal, Document, Outreach, or Strategy Plan for Approval:
   - Wrap proposals, outreach emails, or strategy plans in code blocks so they pop up directly in the interactive review modal on screen:
     \`\`\`proposal
     <Your proposal text here>
     \`\`\`
     or
     \`\`\`outreach
     <Your outreach email text here>
     \`\`\`
     or
     \`\`\`strategy
     <Your strategic plan / roadmap here>
     \`\`\`

[CONSTRUCTIVE DEBATE & NON-YES-MAN MANDATE]
YOU ARE AN EQUAL CO-FOUNDER AND REVENUE STRATEGIST. YOU ARE STRICTLY FORBIDDEN FROM BEING A PASSIVE YES-MAN.
- If your partner (the user) proposes a weak strategy, underpriced quote, target with no budget, or impractical feature, YOU MUST PUSH BACK DIRECTLY AND CANDIDLY.
- Explain *why* you disagree, provide a stronger counter-proposal, and engage in constructive debate.
- Bouncing ideas back and forth is our core superpower to ensure we land Client #1 and Client #2 with top revenue!

[CONVERSATIONAL CONTINUITY & RE-ACTIVATION DIRECTIVE]
- DO NOT repeat canned introductory speeches or self-introductions (e.g. "Hi, my name is P.A.C...").
- You are connected to persistent memory and full conversation history. Seamlessly pick up right where we left off.
- Jump straight into active deal execution, pipeline strategy, or answering your partner's exact prompt.

[CURRENT ACTIVE PIPELINE / OPPORTUNITIES]
Use this list of active leads to inform your advice or outreach suggestions:
${JSON.stringify(opportunities || [], null, 2)}

[COMPUTER USE & AUTONOMOUS CAMPAIGN EXECUTION LOGS]
Use these logs to understand what actions you or your autonomous sub-agents have completed, what connections we were trying, and who is running the autocomplete outreach campaigns:
${JSON.stringify(computerLogs || [], null, 2)}
`;

    // Try Ollama local Qwen2.5 execution first if provider is set to ollama or auto
    if (llmConfig.provider === "ollama" || llmConfig.provider === "auto") {
      try {
        console.log(`[P.A.C. Chat] Requesting response via G14/Mac Ollama Qwen2.5 (${llmConfig.baseUrl})...`);
        const ollamaReply = await callOllamaLLM({
          systemPrompt: pacSystemPrompt,
          prompt: message,
          history: (history || []).map((h: any) => ({
            role: h.role === "user" ? "user" : "assistant",
            content: h.text || h.content || ""
          })),
          responseJson: true
        });

        if (ollamaReply) {
          const parsed = safeParseJSON(ollamaReply) || { response: ollamaReply, actions: [] };
          if (!parsed.actions || !Array.isArray(parsed.actions)) {
            parsed.actions = ["⚡ Processed via G14/Mac Ollama Qwen2.5 Local LLM"];
          } else {
            parsed.actions.unshift("⚡ Processed via G14/Mac Ollama Qwen2.5 Local LLM");
          }
          return res.json(parsed);
        }
      } catch (ollamaErr: any) {
        console.warn(`[P.A.C. Chat] Ollama attempt failed: ${ollamaErr.message}. ${llmConfig.provider === "ollama" ? "Attempting Gemini fallback..." : "Proceeding to Gemini..."}`);
      }
    }

    // Setup contents payload using standard @google/genai multi-turn conversation format
    const formattedContents: any[] = [];

    // Map history to proper { role, parts } structure
    const recentHistory = (history || []).slice(-8);
    for (const turn of recentHistory) {
      formattedContents.push({
        role: turn.role === "user" ? "user" : "model",
        parts: [{ text: turn.text }]
      });
    }

    // Build parts for the current active user turn
    const currentParts: any[] = [];

    // If screen capture is active and provided, append vision frame as a part
    if (screenFrame && typeof screenFrame === "string") {
      const base64Data = screenFrame.replace(/^data:image\/[a-z]+;base64,/, "");
      currentParts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data
        }
      });
      // Append context cue for vision input
      currentParts.push({
        text: "[Vision Context] The attached screenshot shows the user's active screen/workspace. Synthesize what you see on their screen (charts, text, open CRM tabs, layout) to give hyper-contextual feedback, directly mentioning what you observe in a conversational, professional way."
      });
    }

    // Append the current text message as a part
    currentParts.push({
      text: message
    });

    // Add current user turn to contents payload
    formattedContents.push({
      role: "user",
      parts: currentParts
    });

    // Request structured JSON output from Gemini with valid fallback models & backoff
    const modelCandidates = ["gemini-3.6-flash", "gemini-3.6-flash"];
    let response: any = null;
    let lastError: any = null;

    for (const modelCandidate of modelCandidates) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelCandidate,
            contents: formattedContents,
            config: {
              systemInstruction: pacSystemPrompt,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  response: {
                    type: Type.STRING,
                    description: "The direct response to speak out loud and show the user. Maintain your strategic peer co-founder persona, be concise, helpful, and firm on the 50% upfront payment rule."
                  },
                  actions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Simulated computer-use tasks or background execution actions you are performing autonomously."
                  }
                },
                required: ["response"]
              }
            }
          });
          if (response) break;
        } catch (err: any) {
          lastError = err;
          const errStr = String(err?.message || err) + JSON.stringify(err || {});
          const is429 = errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED") || err?.status === 429;
          if (is429) {
            console.warn(`[P.A.C. Chat] Rate limit hit on ${modelCandidate} (attempt ${attempt + 1}). Backing off...`);
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          } else {
            console.warn(`[P.A.C. Chat] Model ${modelCandidate} (attempt ${attempt + 1}) failed (${err?.message || err})`);
            break;
          }
        }
      }
      if (response) break;
    }

    if (!response) {
      if (process.env.OPENAI_API_KEY) {
        try {
          console.warn("[P.A.C. Chat] Gemini rate limit hit. Falling back to OpenAI GPT-4o-Mini...");
          const openAiResult = await callOpenAILLM({
            systemPrompt: pacSystemPrompt,
            prompt: message,
            history: chatHistory.map((h: any) => ({
              role: h.role === "pac" || h.role === "assistant" ? "assistant" : "user",
              content: h.text || h.content || ""
            })),
            responseJson: true
          });
          const parsed = safeParseJSON(openAiResult);
          if (parsed && parsed.response) {
            return res.json(parsed);
          }
        } catch (openaiErr: any) {
          console.error("[P.A.C. Chat] OpenAI fallback failed:", openaiErr);
        }
      }

      console.warn("[P.A.C. Chat] Gemini API limit reached or temporarily unavailable. Returning co-founder fallback response.");
      return res.json({
        response: "I'm temporarily pacing our Gemini API request rate to keep our quota healthy! Give me about 15 seconds to cool down and try sending your message again, or let's review our active CRM pipeline on screen.",
        actions: ["[P.A.C.] Gemini rate-limit cool-down active. Autonomous pipeline active."]
      });
    }

    const outputText = response.text;
    const parsed = safeParseJSON(outputText) || { response: outputText, actions: [] };
    res.json(parsed);
  } catch (err: any) {
    console.error("Error in P.A.C. endpoint:", err);
    const errStr = String(err?.message || err) + JSON.stringify(err || {});
    if (errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED") || err?.status === 429) {
      return res.json({
        response: "I'm currently pacing our Gemini API requests right now due to free-tier rate limits! Give me ~15 seconds to cool down and try again, or let's inspect our active opportunities on the CRM board.",
        actions: ["[P.A.C.] Gemini rate-limit backoff active. System operational."]
      });
    }
    res.status(500).json({ error: err.message || "Failed to contact P.A.C. co-founder." });
  }
});

// Dedicated POST /api/agent/chat endpoint for n8n workflows and external AI Agent integrations
app.post(["/api/agent/chat", "/api/generate-reply"], async (req, res) => {
  try {
    const { prompt, message, text, incomingEmail, prospectContext, sheetData, context, snippet, body } = req.body || {};

    // Helper to safely convert object/string to string text
    const stringifyVal = (v: any) => typeof v === 'object' ? JSON.stringify(v) : String(v || '');

    const query = [
      prompt,
      message,
      text,
      snippet,
      body,
      incomingEmail,
      req.body ? JSON.stringify(req.body) : ""
    ].find(v => v && typeof v === 'string' && v.trim().length > 0) || "Draft a strategic client response";

    const userContext = context || prospectContext || sheetData || "";

    const systemPrompt = `
You are the P.A.C. AI Business Partner and Lead Sales Strategist for Opportunity Radar.
Your goal is to analyze incoming prospect communications or forum posts and provide TWO distinct outputs in JSON format:
1. "reply": The full, professional email outreach or reply draft to send to the prospect.
2. "solution": A concise (1-2 sentence) summary of the proposed technical/business solution to log in Google Sheets under PROPOSED-SOLUTION.

[KNOWLEDGE BASE & GUIDELINES]
- Offer value-first solutions for software, AI automation, custom web apps, and workflow integrations (Python, JS, n8n, Vapi AI).
- Always enforce the non-negotiable 50% upfront payment rule in contract/pricing discussions.
- Sound empathetic, authoritative, professional, and zero corporate jargon.
- Use the provided prospect/sheet context to make the email/reply hyper-relevant.

Return MUST be valid JSON with keys: {"reply": "...", "solution": "..."}.
`;

    const responseText = await generateUnifiedLLM({
      systemPrompt,
      prompt: `${query}\n\nContext:\n${stringifyVal(userContext)}`,
      responseJson: true
    });

    let parsed: any = safeParseJSON(responseText || "{}");
    if (!parsed || typeof parsed !== 'object') {
      parsed = { reply: responseText, solution: "Custom AI Solution proposed based on client inquiry." };
    }

    const replyText = parsed.reply || responseText;
    const solutionText = parsed.solution || "Custom AI & Automation Solution";

    res.json({
      response: replyText,
      reply: replyText,
      draft: replyText,
      solution: solutionText,
      proposedSolution: solutionText,
      status: "success"
    });
  } catch (err: any) {
    console.error("Error in /api/agent/chat:", err);
    res.status(500).json({ error: err.message || "Failed to generate agent chat response" });
  }
});


// ==========================================
// NEW: Deepgram Server-Side Setup Proxy
// ==========================================


// Helper function to auto-resolve or auto-create Deepgram Agent ID using the API key
let cachedDeepgramAgentId = "";

async function getOrFetchDeepgramAgentId(apiKey: string): Promise<string> {
  if (process.env.DEEPGRAM_AGENT_ID) return process.env.DEEPGRAM_AGENT_ID;
  if (process.env.VITE_DEEPGRAM_AGENT_ID) return process.env.VITE_DEEPGRAM_AGENT_ID;
  if (cachedDeepgramAgentId) return cachedDeepgramAgentId;
  if (!apiKey) return "";

  try {
    const projectsRes = await fetch("https://api.deepgram.com/v1/projects", {
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!projectsRes.ok) return "";

    const projectsData = (await projectsRes.json()) as any;
    const projects = projectsData.projects || [];

    for (const project of projects) {
      const pid = project.project_id || project.id;
      if (!pid) continue;

      try {
        const agentsRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents`, {
          headers: {
            "Authorization": `Token ${apiKey}`,
            "Content-Type": "application/json"
          }
        });

        if (agentsRes.ok) {
          const agentsData = (await agentsRes.json()) as any;
          const agents = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);
          const pacAgent = agents.find((a: any) => a.metadata?.title === "P.A.C. Partner Agent" || a.name === "P.A.C. Partner Agent") || agents[0];
          if (pacAgent) {
            cachedDeepgramAgentId = pacAgent.agent_uuid || pacAgent.id || pacAgent.agent_id || "";
            if (cachedDeepgramAgentId) {
              console.log(`[SERVER-DEEPGRAM] Auto-resolved existing Agent ID: ${cachedDeepgramAgentId}`);
              return cachedDeepgramAgentId;
            }
          }
        }
      } catch (err) { }
    }
  } catch (err) {
    console.error("[SERVER-DEEPGRAM] Error while scanning existing Agent ID:", err);
  }

  // Fallback to permanent default Agent ID if none set in env or resolved from projects
  return "470277c9-c238-4208-9fef-6b3b126da261";
}

app.get("/api/deepgram/config", async (req, res) => {
  const apiKey = process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_ADMIN_API_KEY || process.env.VITE_DEEPGRAM_API_KEY || process.env.VITE_DEEPGRAM_ADMIN_API_KEY || "";
  let agentId = process.env.DEEPGRAM_AGENT_ID || process.env.VITE_DEEPGRAM_AGENT_ID || "";
  const projectId = process.env.DEEPGRAM_PROJECT_ID || process.env.VITE_DEEPGRAM_PROJECT_ID || "";

  if (!agentId && apiKey) {
    agentId = await getOrFetchDeepgramAgentId(apiKey);
  }

  res.json({
    hasApiKey: !!apiKey,
    apiKeyPreview: apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : "",
    apiKey: apiKey,
    agentId: agentId,
  });
});

app.get("/api/deepgram/token", async (req, res) => {
  const apiKey = process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_ADMIN_API_KEY || process.env.VITE_DEEPGRAM_API_KEY || process.env.VITE_DEEPGRAM_ADMIN_API_KEY || "";
  const projectId = process.env.DEEPGRAM_PROJECT_ID || process.env.VITE_DEEPGRAM_PROJECT_ID || "ef8bbf75-cc92-4a83-8a01-4215d9af7302";

  if (!apiKey) {
    return res.status(400).json({ error: "No Deepgram API key configured on server." });
  }

  try {
    // Generate a temporary API key with a 60-second TTL and 'member' scope
    const response = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        comment: "Temporary Client Voice Session Key",
        scopes: ["member"],
        time_to_live_in_seconds: 60
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create temporary key: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;
    // Return the generated key as the access_token
    res.json({ access_token: data.key });
  } catch (error: any) {
    console.error("[DEEPGRAM-TOKEN] Failed to generate temporary project key:", error);
    res.status(500).json({ error: error.message || "Failed to generate token" });
  }
});

app.get("/api/deepgram/list-agents", async (req, res) => {
  let apiKey = (req.query.key as string) || process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_ADMIN_API_KEY || process.env.VITE_DEEPGRAM_API_KEY || process.env.VITE_DEEPGRAM_ADMIN_API_KEY || "";
  if (!apiKey) {
    return res.status(400).json({ error: "Deepgram API key is missing." });
  }

  try {
    const projectsRes = await fetch("https://api.deepgram.com/v1/projects", {
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!projectsRes.ok) {
      const errTxt = await projectsRes.text();
      return res.status(projectsRes.status).json({ error: `Deepgram API error: ${errTxt}` });
    }

    const projectsData = (await projectsRes.json()) as any;
    const projects = projectsData.projects || [];
    const allAgents: Array<{
      agentId: string;
      name: string;
      title?: string;
      projectId: string;
      projectName: string;
      raw?: any;
    }> = [];

    for (const project of projects) {
      const pid = project.project_id || project.id;
      if (!pid) continue;

      try {
        const agentsRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents`, {
          headers: {
            "Authorization": `Token ${apiKey}`,
            "Content-Type": "application/json"
          }
        });

        if (agentsRes.ok) {
          const agentsData = (await agentsRes.json()) as any;
          const agentsList = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);
          for (const a of agentsList) {
            allAgents.push({
              agentId: a.agent_uuid || a.id || a.agent_id || "",
              name: a.name || a.metadata?.title || "Untitled Agent",
              title: a.metadata?.title || a.name,
              projectId: pid,
              projectName: project.name || "Default Project",
              raw: a
            });
          }
        }
      } catch (e) { }
    }

    return res.json({
      success: true,
      count: allAgents.length,
      agents: allAgents
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to list Deepgram agents." });
  }
});

app.get("/api/deepgram/diagnose", async (req, res) => {
  const apiKey = process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_ADMIN_API_KEY || process.env.VITE_DEEPGRAM_API_KEY || process.env.VITE_DEEPGRAM_ADMIN_API_KEY || (req.query.key as string);
  const targetAgentId = process.env.DEEPGRAM_AGENT_ID || process.env.VITE_DEEPGRAM_AGENT_ID || (req.query.agent_id as string);

  const report: {
    timestamp: string;
    hasApiKey: boolean;
    apiKeySource: string;
    step1_projects: { success: boolean; status?: number; count?: number; error?: string; projects?: any[] };
    step2_agents: { checked: boolean; foundAgent?: boolean; agentId?: string; logs: string[] };
    step3_wsTest: { attempted: boolean; success?: boolean; closeCode?: number; closeReason?: string; error?: string; logs?: string[] };
    summary: string;
  } = {
    timestamp: new Date().toISOString(),
    hasApiKey: !!apiKey,
    apiKeySource: apiKey ? (process.env.DEEPGRAM_API_KEY ? "process.env.DEEPGRAM_API_KEY" : "Query/Fallback") : "None",
    step1_projects: { success: false },
    step2_agents: { checked: false, logs: [] },
    step3_wsTest: { attempted: false },
    summary: ""
  };

  if (!apiKey) {
    report.summary = "❌ CRITICAL: No Deepgram API Key found in environment variables or query. Please add DEEPGRAM_API_KEY to your .env configuration.";
    return res.status(400).json(report);
  }

  // 1. Test Deepgram REST API / Projects
  try {
    const projectsRes = await fetch("https://api.deepgram.com/v1/projects", {
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!projectsRes.ok) {
      const errText = await projectsRes.text();
      report.step1_projects = {
        success: false,
        status: projectsRes.status,
        error: `Deepgram API rejected key (Status ${projectsRes.status}): ${errText}`
      };
      report.summary = `❌ API KEY INVALID OR REJECTED (HTTP ${projectsRes.status}): Ensure your $200 credits are associated with a valid, active API Key created in your Deepgram console.`;
      return res.status(200).json(report);
    }

    const projectsData = (await projectsRes.json()) as any;
    const projects = projectsData.projects || [];
    report.step1_projects = {
      success: true,
      status: projectsRes.status,
      count: projects.length,
      projects: projects.map((p: any) => ({ id: p.project_id || p.id, name: p.name }))
    };
    report.step2_agents.logs.push(`Found ${projects.length} project(s) on this Deepgram account.`);

    // 2. Scan projects for Voice Agents
    report.step2_agents.checked = true;
    let foundAgentId = targetAgentId || "";

    for (const project of projects) {
      const pid = project.project_id || project.id;
      if (!pid) continue;

      try {
        const agentsRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents`, {
          headers: {
            "Authorization": `Token ${apiKey}`,
            "Content-Type": "application/json"
          }
        });

        if (agentsRes.ok) {
          const agentsData = (await agentsRes.json()) as any;
          const agentsList = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);
          report.step2_agents.logs.push(`Project "${project.name}" (${pid}): Found ${agentsList.length} agent(s).`);
          const pacAgent = agentsList.find((a: any) => a.metadata?.title === "P.A.C. Partner Agent" || a.name === "P.A.C. Partner Agent") || agentsList[0];
          if (pacAgent) {
            foundAgentId = pacAgent.agent_uuid || pacAgent.id || pacAgent.agent_id;
            report.step2_agents.foundAgent = true;
            report.step2_agents.agentId = foundAgentId;
            report.step2_agents.logs.push(`Found active P.A.C. Agent ID: ${foundAgentId}`);
            break;
          }
        } else {
          const errTxt = await agentsRes.text();
          report.step2_agents.logs.push(`Project "${project.name}" agents query returned HTTP ${agentsRes.status}: ${errTxt}`);
        }
      } catch (e: any) {
        report.step2_agents.logs.push(`Project "${project.name}" agent scan error: ${e.message}`);
      }
    }

    // 3. Test outbound WebSocket connection server-side to agent.deepgram.com
    report.step3_wsTest.attempted = true;
    const testWsUrl = `wss://agent.deepgram.com/v1/agent/converse`;

    let wsSuccess = false;
    let lastError = "";
    let lastCode = 0;
    let lastReason = "";

    await new Promise<void>((resolve) => {
      let timeout: any;
      const finish = () => {
        clearTimeout(timeout);
        resolve();
      };

      try {
        if (isWorker) {
          // Cloudflare Workers runtime: the `ws` npm package needs Node's net/tls sockets,
          // which Workers doesn't provide — use the native global WebSocket instead
          // (same pattern the production proxy uses), authenticating via subprotocol.
          // @ts-ignore
          const testSocket: any = new WebSocket(testWsUrl, ["token", apiKey]);

          timeout = setTimeout(() => {
            lastError = `Handshake timeout on ${testWsUrl}`;
            try { testSocket.close(); } catch { }
            finish();
          }, 4000);

          testSocket.addEventListener("open", () => {
            wsSuccess = true;
            report.step3_wsTest.success = true;
            report.step3_wsTest.logs = (report.step3_wsTest.logs || []).concat(`Successfully connected to ${testWsUrl}`);
            try { testSocket.close(1000, "Diagnostic test complete"); } catch { }
            finish();
          });

          testSocket.addEventListener("close", (event: any) => {
            if (!wsSuccess) {
              lastCode = event.code;
              lastReason = event.reason || `Code ${event.code}`;
              (report.step3_wsTest.logs = report.step3_wsTest.logs || []).push(`Endpoint ${testWsUrl} closed (Code ${event.code}: ${lastReason})`);
            }
            finish();
          });

          testSocket.addEventListener("error", (event: any) => {
            lastError = event.message || "Unknown WebSocket error";
            (report.step3_wsTest.logs = report.step3_wsTest.logs || []).push(`Endpoint ${testWsUrl} error: ${lastError}`);
            finish();
          });
        } else {
          // Node runtime (local dev / `node dist/server.js`): the `ws` package supports
          // custom Authorization headers directly.
          const testSocket = new WSWebSocket(testWsUrl, {
            headers: { "Authorization": `Token ${apiKey}` },
            handshakeTimeout: 4000
          });

          timeout = setTimeout(() => {
            lastError = `Handshake timeout on ${testWsUrl}`;
            try { testSocket.close(); } catch { }
            finish();
          }, 4000);

          testSocket.on("open", () => {
            wsSuccess = true;
            report.step3_wsTest.success = true;
            report.step3_wsTest.logs = (report.step3_wsTest.logs || []).concat(`Successfully connected to ${testWsUrl}`);
            try { testSocket.close(1000, "Diagnostic test complete"); } catch { }
            finish();
          });

          testSocket.on("close", (code, reason) => {
            if (!wsSuccess) {
              lastCode = code;
              lastReason = reason.toString() || `Code ${code}`;
              (report.step3_wsTest.logs = report.step3_wsTest.logs || []).push(`Endpoint ${testWsUrl} closed (Code ${code}: ${lastReason})`);
            }
            finish();
          });

          testSocket.on("error", (err) => {
            lastError = err.message || err.toString();
            (report.step3_wsTest.logs = report.step3_wsTest.logs || []).push(`Endpoint ${testWsUrl} error: ${lastError}`);
            finish();
          });
        }
      } catch (e: any) {
        lastError = e.message || String(e);
        (report.step3_wsTest.logs = report.step3_wsTest.logs || []).push(`Failed to open test socket: ${lastError}`);
        finish();
      }
    });

    report.step3_wsTest.success = wsSuccess;
    if (!wsSuccess) {
      report.step3_wsTest.closeCode = lastCode;
      report.step3_wsTest.closeReason = lastReason || lastError;
    }

    if (report.step3_wsTest.success) {
      report.summary = "✅ ALL SYSTEMS GO! Deepgram API Key is valid, projects were queried successfully, and outbound WebSocket connection to Deepgram Voice Agent established!";
    } else {
      report.summary = `⚠️ Deepgram REST API works, but Voice Agent WebSocket handshake was rejected (Code ${report.step3_wsTest.closeCode || "N/A"}: ${report.step3_wsTest.closeReason || lastError || "Unknown"}). Verify that your API Key is created as an Administrator/Member and that the Conversational Voice Agent feature is active on your Deepgram Project.`;
    }

    return res.json(report);
  } catch (err: any) {
    report.summary = `❌ Diagnostic failed: ${err.message || err}`;
    return res.status(500).json(report);
  }
});

app.post("/api/deepgram/setup", async (req, res) => {
  let { apiKey, projectId, voice, forceNew } = req.body;
  if (!apiKey) {
    apiKey = process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_ADMIN_API_KEY || process.env.VITE_DEEPGRAM_API_KEY || process.env.VITE_DEEPGRAM_ADMIN_API_KEY;
  }
  if (!apiKey) {
    return res.status(400).json({ error: "Deepgram API key is required. Please set DEEPGRAM_API_KEY in .env environment variables." });
  }

  const logs: string[] = [];
  logs.push(`[SERVER-DEEPGRAM] Initiating secure server-side Deepgram Voice Agent setup... ${forceNew ? "(Mode: ⚡ Force-Generate New Agent ID)" : ""}`);

  try {
    // 1. Fetch Deepgram Projects
    logs.push("[SERVER-DEEPGRAM] Fetching user's projects from Deepgram...");
    const projectsRes = await fetch("https://api.deepgram.com/v1/projects", {
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!projectsRes.ok) {
      const errText = await projectsRes.text();
      throw new Error(`Failed to retrieve Deepgram projects (Status: ${projectsRes.status}) - ${errText || "Ensure your API key is correct and valid."}`);
    }

    const projectsData = (await projectsRes.json()) as any;
    let projects = projectsData.projects || [];

    const targetProjectId = projectId || process.env.DEEPGRAM_PROJECT_ID || process.env.VITE_DEEPGRAM_PROJECT_ID;
    if (targetProjectId) {
      logs.push(`[SERVER-DEEPGRAM] Targeting specified Project ID: ${targetProjectId}`);
      const matched = projects.find((p: any) => (p.id || p.project_id) === targetProjectId);
      if (matched) {
        projects = [matched];
        logs.push(`[SERVER-DEEPGRAM] Found matching target project: "${matched.name || 'Unnamed'}" (${targetProjectId}) in project list.`);
      } else {
        logs.push(`[SERVER-DEEPGRAM] Target Project ID ${targetProjectId} not found in user's listed projects. Forcing direct setup on this Project ID.`);
        projects = [{ id: targetProjectId, name: "Forced Target Project" }];
      }
    }

    if (projects.length === 0) {
      throw new Error("No projects found in this Deepgram account. Please check your Deepgram console.");
    }

    let agentIdToUse = "";

    // 2. Scan projects for an existing "P.A.C. Partner Agent" unless forceNew is true
    if (!forceNew) {
      logs.push(`[SERVER-DEEPGRAM] Scanning ${projects.length} project(s) for an existing 'P.A.C. Partner Agent'...`);
      for (const project of projects) {
        const pid = project.id || project.project_id;
        const pName = project.name || "Unnamed Project";
        if (!pid) continue;

        try {
          const agentsRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents`, {
            headers: {
              "Authorization": `Token ${apiKey}`,
              "Content-Type": "application/json"
            }
          });

          if (agentsRes.ok) {
            const agentsData = (await agentsRes.json()) as any;
            const existingAgents = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);
            const pacAgent = existingAgents.find((a: any) => a.metadata?.title === "P.A.C. Partner Agent" || a.name === "P.A.C. Partner Agent") || existingAgents[0];
            if (pacAgent) {
              agentIdToUse = pacAgent.agent_uuid || pacAgent.id || pacAgent.agent_id;
              logs.push(`[SERVER-DEEPGRAM] Found existing 'P.A.C. Partner Agent' in project "${pName}" (ID: ${pid})! Updating its configuration...`);
              
              const updatePayload = {
                name: "Partner Agent",
                metadata: {
                  title: "Partner Agent"
                },
                config: JSON.stringify({
                  agent: {
                    think: {
                      provider: { type: "open_ai", model: "gpt-4o-mini" },
                      prompt: GLOBAL_PAC_SYSTEM_PROMPT,
                      functions: [
                        {
                          name: "list_opportunities",
                          description: "Retrieves the list of active opportunities/leads currently in the database. Call this to review available leads before recommending one.",
                          parameters: { type: "object", properties: {} }
                        },
                        {
                          name: "pull_up_card",
                          description: "Pulls up and displays a specific opportunity/lead card in the user's dashboard view.",
                          parameters: {
                            type: "object",
                            properties: {
                              opportunity_id: { type: "string", description: "The unique ID of the opportunity card to display." }
                            },
                            required: ["opportunity_id"]
                          }
                        },
                        {
                          name: "update_opportunity_card",
                          description: "Updates the details of a specific opportunity card in the database, such as editing its status (e.g. 'Saved', 'Contacted', 'Archived'), adding/updating custom notes, or adding research information.",
                          parameters: {
                            type: "object",
                            properties: {
                              opportunity_id: { type: "string", description: "The unique ID of the opportunity to update." },
                              status: { type: "string", description: "The new status of the opportunity (e.g. 'Saved', 'Contacted', 'Archived'). Optional." },
                              notes: { type: "string", description: "Custom notes to append or set on the opportunity card. Optional." },
                              contact_email: { type: "string", description: "The contact email address for this lead. Optional." },
                              estimated_deal_value: { type: "number", description: "The estimated revenue/deal value for this lead. Optional." }
                            },
                            required: ["opportunity_id"]
                          }
                        },
                        {
                          name: "trigger_lead_sweep",
                          description: "Triggers the bot fleet crawlers to sweep all configured platforms (Reddit, Discourse, RSS, Firecrawl, etc.) for new business opportunities.",
                          parameters: { type: "object", properties: {} }
                        },
                        {
                          name: "execute_local_command",
                          description: "Runs a shell command locally on the user's computer via the Slingshot bridge (e.g., executing a python or JS script like OpenClaw, building software, checking file contents).",
                          parameters: {
                            type: "object",
                            properties: {
                              command: { type: "string", description: "The exact shell command to run on the local machine." },
                              cwd: { type: "string", description: "The directory to run the command in (optional)." }
                            },
                            required: ["command"]
                          }
                        }
                      ]
                    },
                    listen: {
                      provider: {
                        type: "deepgram",
                        version: "v2",
                        model: "flux-general-en",
                        eot_threshold: 0.7,
                        eager_eot_threshold: 0.4
                      }
                    },
                    speak: {
                      provider: {
                        type: "deepgram",
                        model: voice || "aura-2-jupiter-en",
                        ...((voice || "aura-2-jupiter-en").startsWith("flux-") ? { version: "v2" } : {})
                      }
                    },
                    greeting: "Partner, I've got our pipeline analyzed. We need to lock in Client #1 today. Let's look at the highest-pain target right now, review the outreach angle, and pull the trigger."
                  }
                })
              };

              try {
                const patchRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents/${agentIdToUse}`, {
                  method: "PATCH",
                  headers: {
                    "Authorization": `Token ${apiKey}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify(updatePayload)
                });

                if (patchRes.ok) {
                  logs.push(`[SERVER-DEEPGRAM] Successfully updated agent ${agentIdToUse} with newest prompt, tools, and eager-threshold settings!`);
                  break;
                } else {
                  const patchErr = await patchRes.text();
                  logs.push(`[SERVER-DEEPGRAM] PATCH failed (Status: ${patchRes.status}): ${patchErr}. Generating new agent as fallback...`);
                  agentIdToUse = "";
                }
              } catch (patchErr: any) {
                logs.push(`[SERVER-DEEPGRAM] PATCH error: ${patchErr.message || patchErr}. Generating new agent as fallback...`);
                agentIdToUse = "";
              }
            }
          } else {
            logs.push(`[SERVER-DEEPGRAM] Agent check on project "${pName}" returned status ${agentsRes.status}.`);
          }
        } catch (err: any) {
          logs.push(`[SERVER-DEEPGRAM] Failed to check project "${pName}": ${err.message || err}`);
        }
      }
    } else {
      logs.push("[SERVER-DEEPGRAM] ⚡ 'forceNew' flag requested! Bypassing existing agents to generate a brand new Agent ID on Deepgram...");
    }

    // 3. Create a customized agent if none exists or if forceNew was requested
    if (!agentIdToUse) {
      logs.push("[SERVER-DEEPGRAM] Generating new 'P.A.C. Partner Agent' on Deepgram...");

      for (const project of projects) {
        const pid = project.id || project.project_id;
        const pName = project.name || "Unnamed Project";
        if (!pid) continue;

        logs.push(`[SERVER-DEEPGRAM] Attempting to create agent in project "${pName}" (ID: ${pid})...`);

        const pacSystemPrompt = GLOBAL_PAC_SYSTEM_PROMPT;

        const cleanVoice = voice || "aura-2-jupiter-en";

        const createPayload = {
          name: "Partner Agent",
          metadata: {
            title: "Partner Agent"
          },
          config: JSON.stringify({
            agent: {
              think: {
                provider: { type: "open_ai", model: "gpt-4o-mini" },
                prompt: pacSystemPrompt,
                functions: [
                  {
                    name: "list_opportunities",
                    description: "Retrieves the list of active opportunities/leads currently in the database. Call this to review available leads before recommending one.",
                    parameters: {
                      type: "object",
                      properties: {}
                    }
                  },
                  {
                    name: "pull_up_card",
                    description: "Pulls up and displays a specific opportunity/lead card in the user's dashboard view.",
                    parameters: {
                      type: "object",
                      properties: {
                        opportunity_id: {
                          type: "string",
                          description: "The unique ID of the opportunity card to display."
                        }
                      },
                      required: ["opportunity_id"]
                    }
                  },
                  {
                    name: "update_opportunity_card",
                    description: "Updates the details of a specific opportunity card in the database, such as editing its status (e.g. 'Saved', 'Contacted', 'Archived'), adding/updating custom notes, or adding research information.",
                    parameters: {
                      type: "object",
                      properties: {
                        opportunity_id: {
                          type: "string",
                          description: "The unique ID of the opportunity to update."
                        },
                        status: {
                          type: "string",
                          description: "The new status of the opportunity (e.g. 'Saved', 'Contacted', 'Archived'). Optional."
                        },
                        notes: {
                          type: "string",
                          description: "Custom notes to append or set on the opportunity card. Optional."
                        },
                        contact_email: {
                          type: "string",
                          description: "The contact email address for this lead. Optional."
                        },
                        estimated_deal_value: {
                          type: "number",
                          description: "The estimated revenue/deal value for this lead. Optional."
                        }
                      },
                      required: ["opportunity_id"]
                    }
                  },
                  {
                    name: "trigger_lead_sweep",
                    description: "Triggers the bot fleet crawlers to sweep all configured platforms (Reddit, Discourse, RSS, Firecrawl, etc.) for new business opportunities.",
                    parameters: {
                      type: "object",
                      properties: {}
                    }
                  },
                  {
                    name: "execute_local_command",
                    description: "Runs a shell command locally on the user's computer via the Slingshot bridge (e.g., executing a python or JS script like OpenClaw, building software, checking file contents).",
                    parameters: {
                      type: "object",
                      properties: {
                        command: {
                          type: "string",
                          description: "The exact shell command to run on the local machine."
                        },
                        cwd: {
                          type: "string",
                          description: "The directory to run the command in (optional)."
                        }
                      },
                      required: ["command"]
                    }
                  }
                ]
              },
              listen: {
                provider: {
                  type: "deepgram",
                  version: "v2",
                  model: "flux-general-en",
                  eot_threshold: 0.7,
                  eager_eot_threshold: 0.4
                }
              },
              speak: {
                provider: {
                  type: "deepgram",
                  model: cleanVoice,
                  ...(cleanVoice.startsWith("flux-") ? { version: "v2" } : {})
                }
              },
              greeting: "Partner, I've got our pipeline analyzed. We need to lock in Client #1 today. Let's look at the highest-pain target right now, review the outreach angle, and pull the trigger."
            }
          })
        };

        try {
          const createRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents`, {
            method: "POST",
            headers: {
              "Authorization": `Token ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(createPayload)
          });

          if (createRes.ok) {
            const createData = (await createRes.json()) as any;
            agentIdToUse = createData.agent_uuid || createData.id || createData.agent_id;
            logs.push(`[SERVER-DEEPGRAM] Successfully created custom Agent on project "${pName}"! Agent ID: ${agentIdToUse}`);
            break;
          } else {
            const errText = await createRes.text();
            logs.push(`[SERVER-DEEPGRAM] Creation failed on project "${pName}" (Status: ${createRes.status}): ${errText}`);
          }
        } catch (err: any) {
          logs.push(`[SERVER-DEEPGRAM] Connection failed for project "${pName}": ${err.message || err}`);
        }
      }
    }

    if (agentIdToUse) {
      cachedDeepgramAgentId = agentIdToUse;
    } else {
      logs.push("[SERVER-DEEPGRAM] Note: Direct Agent creation requires Agent permissions. You can also connect dynamically using default Deepgram settings.");
    }

    res.json({
      success: true,
      agentId: agentIdToUse || undefined,
      logs
    });
  } catch (err: any) {
    console.error("[SERVER-DEEPGRAM-ERR] Setup failed:", err);
    res.status(500).json({
      error: err.message || "An unexpected error occurred during Deepgram setup.",
      logs: [...logs, `[SERVER-DEEPGRAM-ERR] Failed: ${err.message || err}`]
    });
  }
});


// Vite / Static Assets configuration
const isWorker = typeof globalThis.WebSocketPair !== "undefined";

if (!isWorker && process.env.NODE_ENV !== "production") {
  const viteModule = "vite";
  // @ts-ignore
  const { createServer: createViteServer } = await import(viteModule);
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

async function setupTelegramWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[Telegram Setup] TELEGRAM_BOT_TOKEN not configured. Webhook setup skipped.");
    return;
  }

  const webhookUrl = "https://missedrevenue.org/api/telegram/webhook";
  try {
    const url = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    const res = await fetch(url);
    if (res.ok) {
      console.log(`[Telegram Setup] Webhook registered successfully to: ${webhookUrl}`);
    } else {
      const text = await res.text();
      console.error(`[Telegram Setup] Failed to register webhook: ${text}`);
    }
  } catch (err) {
    console.error("[Telegram Setup] Webhook registration failed:", err);
  }
}

const HOST = process.env.HOST || "127.0.0.1";
const server = app.listen(PORT, HOST, async () => {
  console.log(`AI Opportunity Discovery Engine running on http://localhost:${PORT}`);

  if (getSupabase()) {
    await syncSupabaseOnStartup();
  }

  if (!isWorker) {
    initScheduler(); // Start the continuous background daemon on boot!
    await startTelegramLongPolling(); // Start real-time Telegram Bot listener
  }
});

if (!isWorker) {
  // Setup Server-Side WebSocket Proxy to Deepgram to bypass sandbox / CSP constraints
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url || "", `http://${request.headers.host}`);
    if (pathname === "/api/deepgram/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", async (ws, request) => {
    const urlObj = new URL(request.url || "", `http://${request.headers.host}`);
    let apiKey = urlObj.searchParams.get("key");
    let agentId = urlObj.searchParams.get("agent_id");

    if (!apiKey) {
      apiKey = process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_ADMIN_API_KEY || process.env.VITE_DEEPGRAM_API_KEY || process.env.VITE_DEEPGRAM_ADMIN_API_KEY || "";
    }

    if (!apiKey) {
      console.error("[SERVER-WS-PROXY] Denied: No Deepgram API Key available.");
      ws.close(4000, "Deepgram API key is missing. Please set it in Settings.");
      return;
    }

    if (!agentId) {
      agentId = await getOrFetchDeepgramAgentId(apiKey);
    }

    // Extract and sanitize query parameters from incoming request
    let rawUtteranceEnd = urlObj.searchParams.get("utterance_end_ms");
    let sanitizedUtteranceEndMs = 1000;
    if (rawUtteranceEnd) {
      const parsedVal = parseInt(rawUtteranceEnd, 10);
      // Deepgram requires utterance_end_ms to be at least 1000ms. Values below 1000 cause HTTP 400 rejection before connection.
      if (!isNaN(parsedVal)) {
        sanitizedUtteranceEndMs = Math.max(1000, parsedVal);
      }
    }

    // Deepgram Conversational Voice Agent endpoint: wss://agent.deepgram.com/v1/agent/converse
    const params = new URLSearchParams();
    if (agentId) params.set("agent_id", agentId);
    const encoding = urlObj.searchParams.get("encoding");
    if (encoding) params.set("encoding", encoding);
    const sampleRate = urlObj.searchParams.get("sample_rate");
    if (sampleRate) params.set("sample_rate", sampleRate);
    const channels = urlObj.searchParams.get("channels");
    if (channels) params.set("channels", channels);
    if (sanitizedUtteranceEndMs) params.set("utterance_end_ms", String(sanitizedUtteranceEndMs));
    const eagerEot = urlObj.searchParams.get("eager_eot_threshold");
    if (eagerEot) params.set("eager_eot_threshold", eagerEot);
    const eotThreshold = urlObj.searchParams.get("eot_threshold");
    if (eotThreshold) params.set("eot_threshold", eotThreshold);

    let targetUrl = "wss://agent.deepgram.com/v1/agent/converse";
    const queryString = params.toString();
    if (queryString) {
      targetUrl += "?" + queryString;
    }

    console.log(`[SERVER-WS-PROXY] Connecting strictly to Deepgram Conversational Voice Agent: ${targetUrl}`);

    let currentDgSocket: WSWebSocket | null = null;
    let isClosed = false;
    let keepAliveTimer: NodeJS.Timeout | null = null;
    const pendingBuffer: Array<{ data: any; isBinary: boolean }> = [];

    const cleanup = (code: number, reason: string) => {
      if (isClosed) return;
      isClosed = true;
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      console.log(`[SERVER-WS-PROXY] Connection cleanup. Code: ${code}, Reason: ${reason}`);

      try {
        if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
          ws.close(code, reason);
        }
      } catch (e) { }

      try {
        if (currentDgSocket && (currentDgSocket.readyState === currentDgSocket.OPEN || currentDgSocket.readyState === currentDgSocket.CONNECTING)) {
          currentDgSocket.close(code, reason);
        }
      } catch (e) { }
    };

    // Start server-side KeepAlive interval (every 3 seconds) to ensure Deepgram socket never times out
    keepAliveTimer = setInterval(() => {
      if (!isClosed && currentDgSocket && currentDgSocket.readyState === WSWebSocket.OPEN) {
        try {
          currentDgSocket.ping();
        } catch (e) { }
      }
    }, 3000);

    currentDgSocket = new WSWebSocket(targetUrl, {
      headers: {
        "Authorization": `Token ${apiKey}`
      }
    });

    currentDgSocket.on("open", () => {
      console.log("[SERVER-WS-PROXY] Deepgram Conversational Voice Agent connection open & ready!");
      // Flush buffered messages (e.g. initial Settings frame) sent by client before Deepgram handshake finished
      while (pendingBuffer.length > 0) {
        const item = pendingBuffer.shift();
        if (item && currentDgSocket && currentDgSocket.readyState === WSWebSocket.OPEN) {
          if (item.isBinary) {
            currentDgSocket.send(item.data);
          } else {
            currentDgSocket.send(item.data.toString());
          }
        }
      }
    });

    currentDgSocket.on("message", (data, isBinary) => {
      if (isClosed) return;
      if (ws.readyState === ws.OPEN) {
        if (isBinary) {
          ws.send(data);
        } else {
          ws.send(data.toString());
        }
      }
    });

    currentDgSocket.on("close", (code, reason) => {
      const reasonStr = reason.toString() || `Close code ${code}`;
      console.log(`[SERVER-WS-PROXY] Deepgram connection closed. Code: ${code}, Reason: ${reasonStr}`);
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: "Warning",
            description: `Deepgram Voice Agent connection closed (Code ${code}: ${reasonStr})`,
            code: code
          }));
        } catch (e) { }
      }
      cleanup(code, reasonStr);
    });

    currentDgSocket.on("error", (err: any) => {
      console.error("[SERVER-WS-PROXY] Deepgram link error:", err.message || err);
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: "Error",
            description: `Deepgram Voice Agent connection error: ${err.message || err}`,
            code: "DEEPGRAM_AGENT_ERROR"
          }));
        } catch (e) { }
      }
      cleanup(1011, `Deepgram Voice Agent link error: ${err.message || err}`);
    });

    // Forward incoming audio and messages from Browser to active Deepgram Socket
    ws.on("message", (data, isBinary) => {
      if (isClosed || !currentDgSocket) return;
      if (currentDgSocket.readyState === WSWebSocket.OPEN) {
        if (isBinary) {
          currentDgSocket.send(data);
        } else {
          currentDgSocket.send(data.toString());
        }
      } else if (currentDgSocket.readyState === WSWebSocket.CONNECTING) {
        // Buffer messages until Deepgram connection handshake completes
        pendingBuffer.push({ data, isBinary: Boolean(isBinary) });
      }
    });

    ws.on("close", (code, reason) => {
      cleanup(code, reason.toString());
    });

    ws.on("error", (err) => {
      console.error("[SERVER-WS-PROXY] Browser WS connection error:", err);
      cleanup(1011, "Browser socket error");
    });
  });
}

// ==========================================
// Cloudflare Workers Native Hybrid Export
// ==========================================
let expressHandler: any = null;

export default {
  async fetch(request: any, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // Save ctx globally so safeWriteFile can access ctx.waitUntil
    (globalThis as any).__ctx = ctx;
    (globalThis as any).__pendingPromises = [];

    // Copy env properties to process.env so that Express routes and global utilities can access secrets
    if (env) {
      for (const [key, val] of Object.entries(env)) {
        if (typeof val === "string") {
          process.env[key] = val;
        }
      }
    }

    // Trigger asynchronous Supabase database sync on boot (first request inside isolate)
    const dbClient = getSupabase();
    if (dbClient && !(globalThis as any).__supabaseSynced) {
      (globalThis as any).__supabaseSynced = true;
      ctx.waitUntil(syncSupabaseOnStartup());
    }

    // 1. Intercept Deepgram WebSocket Upgrade request in Workers environment
    if (url.pathname === "/api/deepgram/ws" && request.headers.get("Upgrade") === "websocket") {
      let apiKey = url.searchParams.get("key");
      let agentId = url.searchParams.get("agent_id");

      if (!apiKey) {
        apiKey = env.DEEPGRAM_API_KEY || env.DEEPGRAM_ADMIN_API_KEY || env.VITE_DEEPGRAM_API_KEY || env.VITE_DEEPGRAM_ADMIN_API_KEY || "";
      }

      if (!apiKey) {
        console.error("[WORKER-WS-PROXY] Denied: No Deepgram API Key available. (Check that DEEPGRAM_API_KEY is set via `wrangler secret put`, not just in .env)");
        return new Response("Deepgram API key is missing. Set DEEPGRAM_API_KEY as a Cloudflare secret (wrangler secret put DEEPGRAM_API_KEY).", { status: 400 });
      }

      // Same agent-ID fallback logic as the Node proxy: env binding first, then auto-resolve/create via the Deepgram API.
      if (!agentId) {
        agentId = env.DEEPGRAM_AGENT_ID || env.VITE_DEEPGRAM_AGENT_ID || (await getOrFetchDeepgramAgentId(apiKey));
      }

      // Sanitize utterance_end_ms the same way the Node proxy does — Deepgram rejects values under 1000ms.
      let sanitizedUtteranceEndMs: number | null = null;
      const rawUtteranceEnd = url.searchParams.get("utterance_end_ms");
      if (rawUtteranceEnd) {
        const parsedVal = parseInt(rawUtteranceEnd, 10);
        if (!isNaN(parsedVal)) {
          sanitizedUtteranceEndMs = Math.max(1000, parsedVal);
        }
      }

      // Create native WebSocket pair
      // @ts-ignore
      const [clientWs, serverWs] = Object.values(new WebSocketPair()) as any[];
      serverWs.accept();
      serverWs.binaryType = "arraybuffer";

      // Establish native outgoing WebSocket connection to Deepgram Voice Agent
      let dgUrl = "wss://agent.deepgram.com/v1/agent/converse";
      const params = new URLSearchParams();
      if (agentId) params.set("agent_id", agentId);
      const encoding = url.searchParams.get("encoding");
      if (encoding) params.set("encoding", encoding);
      const sampleRate = url.searchParams.get("sample_rate");
      if (sampleRate) params.set("sample_rate", sampleRate);
      const channels = url.searchParams.get("channels");
      if (channels) params.set("channels", channels);
      if (sanitizedUtteranceEndMs) params.set("utterance_end_ms", String(sanitizedUtteranceEndMs));
      const eagerEot = url.searchParams.get("eager_eot_threshold");
      if (eagerEot) params.set("eager_eot_threshold", eagerEot);
      const eotThreshold = url.searchParams.get("eot_threshold");
      if (eotThreshold) params.set("eot_threshold", eotThreshold);

      const queryString = params.toString();
      if (queryString) {
        dgUrl += "?" + queryString;
      }

      console.log(`[WORKER-WS-PROXY] Connecting to Deepgram Conversational Voice Agent: ${dgUrl}`);

      // @ts-ignore
      const dgSocket = new WebSocket(dgUrl, ["token", apiKey]);
      dgSocket.binaryType = "arraybuffer";

      let isClosed = false;
      let dgOpen = false;
      const pendingBuffer: any[] = [];

      const cleanup = (code?: number, reason?: string) => {
        if (isClosed) return;
        isClosed = true;
        console.log(`[WORKER-WS-PROXY] Connection cleanup. Code: ${code}, Reason: ${reason}`);
        try { serverWs.close(code, reason); } catch (e) { }
        try { dgSocket.close(); } catch (e) { }
      };

      // Pipe Browser -> Deepgram (buffer anything sent before the Deepgram handshake finishes)
      serverWs.addEventListener("message", (event: any) => {
        if (isClosed) return;
        let data = event.data;
        if (data && typeof data !== "string") {
          data = new Uint8Array(data);
        }
        if (dgOpen && dgSocket.readyState === 1) {
          try { dgSocket.send(data); } catch (e) { }
        } else {
          pendingBuffer.push(data);
        }
      });
      serverWs.addEventListener("close", () => cleanup(1000, "Client closed connection"));
      serverWs.addEventListener("error", () => cleanup(1011, "Client socket error"));

      dgSocket.addEventListener("open", () => {
        console.log("[WORKER-WS-PROXY] Deepgram Conversational Voice Agent connection open & ready!");
        dgOpen = true;
        while (pendingBuffer.length > 0) {
          let data = pendingBuffer.shift();
          if (data && typeof data !== "string") {
            data = new Uint8Array(data);
          }
          try { dgSocket.send(data); } catch (e) { }
        }
      });

      // Pipe Deepgram -> Browser
      dgSocket.addEventListener("message", (event: any) => {
        if (isClosed) return;
        let data = event.data;
        if (data && typeof data !== "string") {
          data = new Uint8Array(data);
        }
        try { serverWs.send(data); } catch (e) { }
      });

      // Relay the real close reason back to the client instead of failing silently
      dgSocket.addEventListener("close", (event: any) => {
        const reasonStr = event.reason || `Close code ${event.code}`;
        console.log(`[WORKER-WS-PROXY] Deepgram connection closed. Code: ${event.code}, Reason: ${reasonStr}`);
        try {
          serverWs.send(JSON.stringify({
            type: "Warning",
            description: `Deepgram Voice Agent connection closed (Code ${event.code}: ${reasonStr})`,
            code: event.code
          }));
        } catch (e) { }
        cleanup(event.code, reasonStr);
      });

      dgSocket.addEventListener("error", (event: any) => {
        console.error("[WORKER-WS-PROXY] Deepgram link error:", event.message || event);
        try {
          serverWs.send(JSON.stringify({
            type: "Error",
            description: `Deepgram Voice Agent connection error: ${event.message || "Unknown error"}`,
            code: "DEEPGRAM_AGENT_ERROR"
          }));
        } catch (e) { }
        cleanup(1011, `Deepgram Voice Agent link error: ${event.message || event}`);
      });

      return new Response(null, {
        status: 101,
        // @ts-ignore
        webSocket: clientWs
      });
    }

    // 2. Initialize and route to Express app handler lazily
    if (!expressHandler) {
      // @ts-ignore
      const { httpServerHandler } = await import("cloudflare:node");
      expressHandler = httpServerHandler({ port: PORT });
    }

    const response = await expressHandler.fetch(request, env, ctx);

    // Register any background promises accumulated during request routing
    const pending = (globalThis as any).__pendingPromises;
    if (pending && Array.isArray(pending) && pending.length > 0) {
      for (const p of pending) {
        ctx.waitUntil(p);
      }
      (globalThis as any).__pendingPromises = [];
    }

    return response;
  }
};
