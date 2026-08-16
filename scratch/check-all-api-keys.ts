import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

interface ServiceCheckResult {
  service: string;
  keyName: string;
  status: "VALID" | "INVALID" | "EXPIRED" | "MISSING" | "WARNING";
  latencyMs?: number;
  details: string;
}

const results: ServiceCheckResult[] = [];

// 1. Check Gemini AI API
async function checkGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    results.push({ service: "Google Gemini AI", keyName: "GEMINI_API_KEY", status: "MISSING", details: "Key not found in .env" });
    return;
  }
  const start = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: "Reply with the word 'OK' only."
    });
    const text = response.text || "";
    const latencyMs = Date.now() - start;
    if (text.includes("OK")) {
      results.push({ service: "Google Gemini AI", keyName: "GEMINI_API_KEY", status: "VALID", latencyMs, details: `Working smoothly. Response received in ${latencyMs}ms.` });
    } else {
      results.push({ service: "Google Gemini AI", keyName: "GEMINI_API_KEY", status: "VALID", latencyMs, details: `Connected. Output: "${text.trim().substring(0, 40)}"` });
    }
  } catch (err: any) {
    results.push({ service: "Google Gemini AI", keyName: "GEMINI_API_KEY", status: "INVALID", latencyMs: Date.now() - start, details: err.message || "Failed to call Gemini API" });
  }
}

// 2. Check Deepgram Voice Agent API
async function checkDeepgram() {
  const apiKey = process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_ADMIN_API_KEY;
  const agentId = process.env.DEEPGRAM_AGENT_ID;
  if (!apiKey) {
    results.push({ service: "Deepgram Voice Agent", keyName: "DEEPGRAM_API_KEY", status: "MISSING", details: "Key not found in .env" });
    return;
  }
  const start = Date.now();
  try {
    const res = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { "Authorization": `Token ${apiKey}` }
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      const projCount = data.projects ? data.projects.length : 0;
      results.push({
        service: "Deepgram Voice Agent",
        keyName: "DEEPGRAM_API_KEY",
        status: "VALID",
        latencyMs,
        details: `Authenticated (${projCount} project(s) found). Agent ID: ${agentId ? "Configured (" + agentId + ")" : "Auto-generated"}`
      });
    } else {
      const errText = await res.text();
      results.push({ service: "Deepgram Voice Agent", keyName: "DEEPGRAM_API_KEY", status: "INVALID", latencyMs, details: `HTTP ${res.status}: ${errText}` });
    }
  } catch (err: any) {
    results.push({ service: "Deepgram Voice Agent", keyName: "DEEPGRAM_API_KEY", status: "INVALID", latencyMs: Date.now() - start, details: err.message });
  }
}

// 3. Check Supabase
async function checkSupabase() {
  const url = process.env.SUPABASE_URL || (process.env.SUPABASE_PROJECT_ID ? `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co` : "");
  const key = process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    results.push({ service: "Supabase Database", keyName: "SUPABASE_API_KEY / URL", status: "MISSING", details: "Missing URL or API Key" });
    return;
  }
  const start = Date.now();
  try {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.from("opportunities").select("id").limit(5);
    const latencyMs = Date.now() - start;
    if (error) {
      results.push({ service: "Supabase Database", keyName: "SUPABASE_API_KEY", status: "INVALID", latencyMs, details: `Table query failed: ${error.message}` });
    } else {
      results.push({ service: "Supabase Database", keyName: "SUPABASE_API_KEY", status: "VALID", latencyMs, details: `Connected to ${url}. Fetched ${data?.length} row(s).` });
    }
  } catch (err: any) {
    results.push({ service: "Supabase Database", keyName: "SUPABASE_API_KEY", status: "INVALID", latencyMs: Date.now() - start, details: err.message });
  }
}

// 4. Check Telegram Bot
async function checkTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    results.push({ service: "Telegram Bot Notifications", keyName: "TELEGRAM_BOT_TOKEN", status: "MISSING", details: "Token not found in .env" });
    return;
  }
  const start = Date.now();
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const latencyMs = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      const botName = data.result?.username || data.result?.first_name || "Bot";
      results.push({ service: "Telegram Bot Notifications", keyName: "TELEGRAM_BOT_TOKEN", status: "VALID", latencyMs, details: `Bot verified: @${botName} (Chat ID: ${process.env.TELEGRAM_CHAT_ID || "not set"})` });
    } else {
      results.push({ service: "Telegram Bot Notifications", keyName: "TELEGRAM_BOT_TOKEN", status: "INVALID", latencyMs, details: `HTTP ${res.status}: Invalid bot token` });
    }
  } catch (err: any) {
    results.push({ service: "Telegram Bot Notifications", keyName: "TELEGRAM_BOT_TOKEN", status: "INVALID", latencyMs: Date.now() - start, details: err.message });
  }
}

// 5. Check Firecrawl
async function checkFirecrawl() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    results.push({ service: "Firecrawl Web Crawler", keyName: "FIRECRAWL_API_KEY", status: "MISSING", details: "Key not found in .env" });
    return;
  }
  const start = Date.now();
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: "https://example.com" })
    });
    const latencyMs = Date.now() - start;
    if (res.ok || res.status === 200) {
      results.push({ service: "Firecrawl Web Crawler", keyName: "FIRECRAWL_API_KEY", status: "VALID", latencyMs, details: `API key authenticated and operational (${latencyMs}ms).` });
    } else if (res.status === 402) {
      results.push({ service: "Firecrawl Web Crawler", keyName: "FIRECRAWL_API_KEY", status: "EXPIRED", latencyMs, details: "Quota/Credits exhausted (HTTP 402). Native RSS/forum scrapers active as fallback." });
    } else {
      const errText = await res.text();
      results.push({ service: "Firecrawl Web Crawler", keyName: "FIRECRAWL_API_KEY", status: "WARNING", latencyMs, details: `HTTP ${res.status}: ${errText.substring(0, 100)}` });
    }
  } catch (err: any) {
    results.push({ service: "Firecrawl Web Crawler", keyName: "FIRECRAWL_API_KEY", status: "WARNING", latencyMs: Date.now() - start, details: err.message });
  }
}

// 6. Check Mailgun
async function checkMailgun() {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  if (!apiKey || !domain) {
    results.push({ service: "Mailgun Email Dispatch", keyName: "MAILGUN_API_KEY / DOMAIN", status: "MISSING", details: "Missing Mailgun API key or domain" });
    return;
  }
  const start = Date.now();
  try {
    const authHeader = "Basic " + Buffer.from(`api:${apiKey}`).toString("base64");
    const res = await fetch(`https://api.mailgun.net/v3/domains/${domain}`, {
      headers: { "Authorization": authHeader }
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      results.push({ service: "Mailgun Email Dispatch", keyName: "MAILGUN_API_KEY", status: "VALID", latencyMs, details: `Domain "${domain}" is active (${data.domain?.state || "verified"}).` });
    } else {
      results.push({ service: "Mailgun Email Dispatch", keyName: "MAILGUN_API_KEY", status: "WARNING", latencyMs, details: `HTTP ${res.status}: Domain check returned status ${res.status}.` });
    }
  } catch (err: any) {
    results.push({ service: "Mailgun Email Dispatch", keyName: "MAILGUN_API_KEY", status: "WARNING", latencyMs: Date.now() - start, details: err.message });
  }
}

// 7. Check OpenAI
async function checkOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    results.push({ service: "OpenAI API", keyName: "OPENAI_API_KEY", status: "MISSING", details: "Key not configured." });
    return;
  }
  const start = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      results.push({ service: "OpenAI API", keyName: "OPENAI_API_KEY", status: "VALID", latencyMs, details: "Valid OpenAI API key." });
    } else {
      const err = await res.json();
      results.push({ service: "OpenAI API", keyName: "OPENAI_API_KEY", status: "EXPIRED", latencyMs, details: `HTTP ${res.status}: ${err.error?.message || "Out of credits"}` });
    }
  } catch (err: any) {
    results.push({ service: "OpenAI API", keyName: "OPENAI_API_KEY", status: "INVALID", latencyMs: Date.now() - start, details: err.message });
  }
}

// 8. Check Stripe
async function checkStripe() {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    results.push({ service: "Stripe Payments", keyName: "STRIPE_SECRET_KEY", status: "MISSING", details: "Stripe key not configured." });
    return;
  }
  const start = Date.now();
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      results.push({ service: "Stripe Payments", keyName: "STRIPE_SECRET_KEY", status: "VALID", latencyMs, details: "Stripe API key is active and connected." });
    } else {
      results.push({ service: "Stripe Payments", keyName: "STRIPE_SECRET_KEY", status: "INVALID", latencyMs, details: `HTTP ${res.status}: Invalid Stripe key` });
    }
  } catch (err: any) {
    results.push({ service: "Stripe Payments", keyName: "STRIPE_SECRET_KEY", status: "INVALID", latencyMs: Date.now() - start, details: err.message });
  }
}

async function runAllChecks() {
  console.log("==================================================");
  console.log("🔍 RUNNING FULL API KEY & INTEGRATION HEALTH CHECK");
  console.log("==================================================\n");

  await Promise.all([
    checkGemini(),
    checkDeepgram(),
    checkSupabase(),
    checkTelegram(),
    checkFirecrawl(),
    checkMailgun(),
    checkOpenAI(),
    checkStripe()
  ]);

  console.log("\n==================================================");
  console.log("📊 API KEY AUDIT RESULTS");
  console.log("==================================================");
  
  for (const r of results) {
    const icon = r.status === "VALID" ? "✅" : (r.status === "EXPIRED" ? "⚠️" : (r.status === "MISSING" ? "⚪" : "❌"));
    const latencyStr = r.latencyMs !== undefined ? ` [${r.latencyMs}ms]` : "";
    console.log(`${icon} [${r.status}] ${r.service} (${r.keyName})${latencyStr}`);
    console.log(`   └─ ${r.details}\n`);
  }
}

runAllChecks().catch(console.error);
