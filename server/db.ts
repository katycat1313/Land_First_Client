import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Cache initialization
export const memoryDBCache: Record<string, string> = {};

export class SimpleCache<T = any> {
  private cache = new Map<string, { value: T; expiry: number }>();
  private maxItems: number;

  constructor(maxItems = 300) {
    this.maxItems = maxItems;
  }

  set(key: string, value: T, ttlSeconds = 600): void {
    if (this.cache.size >= this.maxItems) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000
    });
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

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const apiCache = new SimpleCache<any>(200);

// File Path setup
export const DB_DIR = path.join(process.cwd(), "data");
export const DB_FILE = path.join(DB_DIR, "db.json");
export const BOT_CONFIG_FILE = path.join(DB_DIR, "bot-config.json");
export const ALERTS_FILE = path.join(DB_DIR, "alerts.json");
export const AGENT_MEMORY_FILE = path.join(DB_DIR, "agent-memory.json");
export const COMPUTER_LOGS_FILE = path.join(DB_DIR, "computer-logs.json");
export const SOCIAL_CAMPAIGNS_FILE = path.join(DB_DIR, "social-campaigns.json");

// Supabase Setup
let _supabaseInstance: any = null;
export function getSupabase() {
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

// File system read/write wrappers
export function safeReadFile(filePath: string, defaultValue: string = ""): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch (e) { }
  return memoryDBCache[filePath] || defaultValue;
}

export function safeWriteFile(filePath: string, content: string): void {
  memoryDBCache[filePath] = content;
  try {
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (e) { }

  if (getSupabase()) {
    const syncPromise = syncToSupabase(filePath, content).catch(err => {
      console.error("[Supabase Background Sync Exception]:", err);
    });

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

export function saveToMemoryAndBackup(filePath: string, content: string): void {
  safeWriteFile(filePath, content);
}

// Real backup items for organic restoration (Strictly authentic empty array)
export const realHistoricalBackupPosts: any[] = [];

export const getFallbackSolutionOptions = (opp: any): any[] => {
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
      subscriptionFee: 29,
      consultingFee: isHighPain ? 200 : 120,
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

// Domain-Specific load/save functions
export const loadOpportunities = (): any[] => {
  const data = safeReadFile(DB_FILE, "[]");
  let list: any[] = [];
  try {
    list = JSON.parse(data);
  } catch (e) {
    list = [];
  }

  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  // Filter out any legacy seed or simulated posts
  const fakeAuthors = new Set(["salon_owner_9", "taxpro_jenn", "boston_builder", "cargo_cultist", "clinic_op_manager"]);
  const authenticList = list.filter(opp => {
    if (!opp) return false;
    if (typeof opp.id === "string" && (opp.id.startsWith("seed-") || opp.id.startsWith("backup-"))) return false;
    if (fakeAuthors.has(opp.author)) return false;
    return true;
  });

  return authenticList.map(opp => {
    let updated = { ...opp };
    const backup = realHistoricalBackupPosts.find(b => b.sourceUrl === updated.sourceUrl || b.sourceUrl === updated.originalSourceLink);
    if (backup) {
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
};

export const saveOpportunities = (data: any[]) => {
  try {
    safeWriteFile(DB_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error writing database file:", error);
  }
};

export const loadBotConfig = (): any => {
  const data = safeReadFile(BOT_CONFIG_FILE, "{}");
  try {
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
};

export const saveBotConfig = (data: any) => {
  safeWriteFile(BOT_CONFIG_FILE, JSON.stringify(data, null, 2));
};

export const loadAgentMemory = (): any => {
  try {
    return JSON.parse(safeReadFile(AGENT_MEMORY_FILE, "[]"));
  } catch (e) {
    return [];
  }
};

export const saveAgentMemory = (data: any) => {
  safeWriteFile(AGENT_MEMORY_FILE, JSON.stringify(data, null, 2));
};

export const loadSocialCampaigns = (): any[] => {
  try {
    const data = safeReadFile(SOCIAL_CAMPAIGNS_FILE, "[]");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
};

export const saveSocialCampaigns = (data: any[]) => {
  saveToMemoryAndBackup(SOCIAL_CAMPAIGNS_FILE, JSON.stringify(data, null, 2));
};

export async function syncToSupabase(filePath: string, content: string) {
  const db = getSupabase();
  if (!db) return;

  try {
    const data = JSON.parse(content);
    if (filePath === DB_FILE) {
      if (Array.isArray(data)) {
        const dbOpps = data.map(o => ({
          id: o.id,
          title: o.title || "",
          author: o.author || null,
          source_platform: o.sourcePlatform || null,
          source_url: o.sourceUrl || o.originalSourceLink || null,
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
          // Deduplicate by source_url preserving newest
          const seenUrls = new Set<string>();
          const deduped: any[] = [];
          for (const item of dbOpps) {
            const key = item.source_url || item.id;
            if (!seenUrls.has(key)) {
              seenUrls.add(key);
              deduped.push(item);
            }
          }

          // Try upserting by source_url first, fallback to per-item upsert
          const { error: upsertErr } = await db.from("opportunities").upsert(deduped, { onConflict: "source_url" });
          if (upsertErr) {
            console.warn("[Supabase Batch Sync] Trying item-by-item upsert fallback:", upsertErr.message);
            for (const item of deduped) {
              const { error: singleErr } = await db.from("opportunities").upsert(item, { onConflict: "source_url" });
              if (singleErr) {
                await db.from("opportunities").upsert(item, { onConflict: "id" }).catch(() => {});
              }
            }
          }
        }
      }
    } else if (filePath === BOT_CONFIG_FILE) {
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
    } else if (filePath === ALERTS_FILE) {
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
    } else if (filePath === AGENT_MEMORY_FILE) {
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

export async function syncSupabaseOnStartup() {
  const db = getSupabase();
  if (!db) return;

  console.log("[Supabase] 🔄 Synchronizing database tables with local cache...");
  try {
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
      memoryDBCache[DB_FILE] = JSON.stringify(opps, null, 2);
      try { fs.writeFileSync(DB_FILE, JSON.stringify(opps, null, 2), "utf-8"); } catch (e) { }
      console.log(`[Supabase Startup] Loaded ${opps.length} opportunities into memory.`);
    }

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
      memoryDBCache[BOT_CONFIG_FILE] = JSON.stringify(config, null, 2);
      try { fs.writeFileSync(BOT_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8"); } catch (e) { }
      console.log("[Supabase Startup] Loaded bot configuration.");
    }

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
      memoryDBCache[ALERTS_FILE] = JSON.stringify(alerts, null, 2);
      try { fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2), "utf-8"); } catch (e) { }
      console.log(`[Supabase Startup] Loaded ${alerts.length} historical alerts.`);
    }

    const { data: dbEntries, error: entriesErr } = await db.from("agent_memory_entries").select("*").order("timestamp", { ascending: false });
    const { data: dbTasks, error: tasksErr } = await db.from("offline_tasks").select("*").order("timestamp", { ascending: false });

    if (!entriesErr && !tasksErr && (dbEntries || dbTasks)) {
      const memory = {
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
      memoryDBCache[AGENT_MEMORY_FILE] = JSON.stringify(memory, null, 2);
      try { fs.writeFileSync(AGENT_MEMORY_FILE, JSON.stringify(memory, null, 2), "utf-8"); } catch (e) { }
      console.log(`[Supabase Startup] Loaded agent memory (${memory.entries.length} entries, ${memory.followUps.length} follow-ups).`);
    }
  } catch (err: any) {
    console.error("[Supabase Startup Sync Exception]:", err.message || err);
  }
}

// Initial directory check
try {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "[]", "utf-8");
  }
} catch (err) {
  console.warn("⚠️ [Storage Warning] Running on a read-only filesystem (Cloudflare Workers). Fallback to in-memory caching.");
}
