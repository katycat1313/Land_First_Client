import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

export let llmConfig = {
  baseUrl: process.env.OLLAMA_BASE_URL || "https://your-ollama-tunnel.trycloudflare.com",
  crawlerTunnelUrl: process.env.CRAWLER_TUNNEL_URL || process.env.MAC_TUNNEL_URL || "",
  g14TunnelUrl: process.env.G14_TUNNEL_URL || "",
  model: process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct-q4_k_m",
  provider: (process.env.LLM_PROVIDER || "gemini") as "auto" | "ollama" | "gemini" | "openai",
  useSlingshot: false
};

export const getGeminiClient = () => {
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

export function safeParseJSON(text: string): any {
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
    const match = cleaned.match(/(\[\s*\{[\s\S]*\}\s*\]|\{[\s\S]*\})/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (innerErr) { }
    }
    throw err;
  }
}

export async function generateSemanticQueries(targetSector: string, keyword: string): Promise<string[]> {
  try {
    const ai = getGeminiClient();

    const sectorAudienceFocus = targetSector === "Marketing agency"
      ? `Marketing-agency focus: Search specifically for first-person posts by agency owners, founders, partners, directors, department heads, account directors, operations leads, or other people who can influence purchasing. Target posts describing an active operational problem or explicitly asking for recommendations, tools, services, vendors, advice, or a better way to work. Prioritize client reporting, approvals, campaign handoffs, scope creep, lead qualification, attribution, account management, content review, capacity planning, and retaining clients. Exclude posts by people merely promoting an agency or selling a product.`
      : "";

    const keywordList = keyword
      ? keyword.split(/[,\n]+/).map((k: string) => k.trim()).filter((k: string) => k.length > 0)
      : [];

    const keywordListStr = keywordList.length > 0
      ? `Keyword list (contains ${keywordList.length} items): ${JSON.stringify(keywordList)}`
      : "No specific keywords provided";

    const prompt = `
      You are an expert OSINT query builder for finding real-world business complaints.
      Generate 5-8 organic, human-level search queries for public forum search engines.
      Inputs:
      - Industry Sector: "${targetSector}"
      - Focus Keywords: ${keywordListStr}
      ${sectorAudienceFocus}
      CRITICAL RULES: Banned words: software, automate, sync, CRM, app, database, workflow, integration, API, SaaS. Use words business owners use: sick of, manual, tedious, excel, paper, post-it, spreadsheet.
      Return ONLY a JSON string array of 5-8 raw queries. No explanation, no markdown wraps.
    `;

    console.log(`[Semantic Query Builder] Querying Unified LLM for organic queries...`);
    const responseText = await generateUnifiedLLM({
      prompt,
      responseJson: true
    });

    const parsed = safeParseJSON(responseText || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((q: string) => q.replace(/[\\]/g, "").trim());
    }
  } catch (error) {
    console.error("[Semantic Query Builder] Failed to expand organic queries:", error);
  }

  const sectorKeywords: Record<string, string[]> = {
    "Home Service Contractors (HVAC/Plumbing)": [
      "hvac dispatch software headache",
      "plumber lost invoice spreadsheet",
      "tired of paper job estimates contractor",
      "missed customer call lost lead roofing"
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
      "agency operations lead struggling campaign handoffs"
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
      `"${keyword}" boss breathing down my neck`
    ];
  }
  return defaults;
}

async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, options);
}

export async function callOllamaLLM({
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
}): Promise<string> {
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

  let response;
  try {
    response = await fetchWithRetry(`${targetBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload)
    });
  } catch (err: any) {
    if (targetBaseUrl !== "http://localhost:11434") {
      console.warn(`[Ollama Call] Target tunnel URL failed (${err.message}). Retrying on local fallback: http://localhost:11434...`);
      response = await fetchWithRetry(`http://localhost:11434/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });
    } else {
      throw err;
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama API error (HTTP ${response.status}): ${errText || "No response details"}`);
  }

  const data = (await response.json()) as any;
  return data.message?.content || data.response || "";
}

export async function callOpenAILLM({
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

export async function generateUnifiedLLM({
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

  if (provider === "openai") {
    try {
      console.log("[LLM Unified] Requesting generation via OpenAI GPT-4o-Mini directly...");
      const result = await callOpenAILLM({
        systemPrompt,
        prompt,
        history,
        responseJson,
        temperature
      });
      if (result) return result;
    } catch (openaiErr: any) {
      console.error(`[LLM Unified] OpenAI direct call failed: ${openaiErr.message}`);
    }
  }

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

  const ai = getGeminiClient();
  const geminiModels = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemini-3.7-flash"
  ];

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
