import React, { useState, useEffect } from "react";
import { Opportunity, Stats } from "./types";
import OpportunityCardDetail from "./components/OpportunityCardDetail";
import PacOverlay from "./components/PacOverlay";
import CrmLedgerView from "./components/CrmLedgerView";
import AgentMemoryView from "./components/AgentMemoryView";
import OllamaTunnelModal from "./components/OllamaTunnelModal";
import { 
  Sparkles, Search, SlidersHorizontal, Plus, RefreshCw, 
  Trash2, Filter, AlertTriangle, Calendar, CheckCircle2, 
  MessageCircle, Building2, Flame, Gauge, DollarSign, ArrowRight,
  PlusCircle, BookOpen, ExternalLink, HelpCircle, Terminal,
  ChevronDown, ChevronUp, Globe, Link, Save, X, Mail, Power, Check,
  Lock, Unlock, KeyRound, ShieldCheck, FileSpreadsheet, Brain, Cpu
} from "lucide-react";
import { initAuth, googleSignIn, logout as googleLogout } from "./lib/firebaseAuth";
import { User } from "firebase/auth";
import PublicLandingView from "./components/PublicLandingView";
import { SocialPostingCalendar } from "./components/SocialPostingCalendar";

export default function App() {
  const [appMode, setAppMode] = useState<'public' | 'dashboard'>('public');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalDiscovered: 0,
    saved: 0,
    contacted: 0,
    inDiscussion: 0,
    productIdeas: 0,
    followupsPending: 0
  });

  // State for selected opportunity in the detail drawer
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

  // Ollama Local Qwen2.5 Tunnel Modal state
  const [isOllamaModalOpen, setIsOllamaModalOpen] = useState(false);

  // Gmail integration states
  const [gmailUser, setGmailUser] = useState<User | null>(null);
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [isGmailConnecting, setIsGmailConnecting] = useState(false);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedPlatform, setSelectedPlatform] = useState("All");

  // Continuous Discovery form states
  const [discoverySector, setDiscoverySector] = useState("Marketing agency");
  const [discoveryKeyword, setDiscoveryKeyword] = useState("");
  const [discoveryMode, setDiscoveryMode] = useState<"semantic" | "literal">("semantic");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState("");
  const [discoveryTrace, setDiscoveryTrace] = useState<string[]>([]);

  // Manual Analysis form states
  const [rawText, setRawText] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customPlatform, setCustomPlatform] = useState("Reddit");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // Firecrawl Web Scraping states
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapePlatform, setScrapePlatform] = useState("BiggerPockets");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [showGuide, setShowGuide] = useState(true);
  const [stealthMode, setStealthMode] = useState(true);

  // Bot Fleet & Crawler Strategy states
  const [botConfig, setBotConfig] = useState<any>(null);
  const [activeView, setActiveView] = useState<'board' | 'crm' | 'memory' | 'bots' | 'partner' | 'learning' | 'social-posting'>('board');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/social-posting' || window.location.pathname.startsWith('/social-posting')) {
        setActiveView('social-posting');
        setAppMode('dashboard');
      }
    }
  }, []);

  const handleSelectView = (view: 'board' | 'crm' | 'memory' | 'bots' | 'partner' | 'learning' | 'social-posting') => {
    setActiveView(view);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', view === 'social-posting' ? '/social-posting' : '/');
    }
  };

  const handleUpdateOpportunity = async (id: string, updates: Partial<Opportunity>) => {
    try {
      const res = await fetch("/api/opportunities/update-crm", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id, ...updates })
      });
      if (!res.ok) throw new Error("Failed to update opportunity CRM");
      const data = await res.json();
      if (data.opportunity) {
        setOpportunities(prev => prev.map(o => o.id === id ? { ...o, ...data.opportunity } : o));
        if (selectedOpp && selectedOpp.id === id) {
          setSelectedOpp(prev => prev ? { ...prev, ...data.opportunity } : null);
        }
      }
    } catch (err) {
      console.error("Error updating opportunity:", err);
    }
  };
  const [runLogs, setRunLogs] = useState<string[]>([]);
  const [isSweepingBot, setIsSweepingBot] = useState(false);
  const [botConfigSaving, setBotConfigSaving] = useState(false);
  const [botConfigSaveMessage, setBotConfigSaveMessage] = useState("");
  const [activeAddFormPlatform, setActiveAddFormPlatform] = useState<string | null>(null);
  const [newTargetName, setNewTargetName] = useState("");
  const [newTargetPath, setNewTargetPath] = useState("");
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isClearingAlerts, setIsClearingAlerts] = useState(false);

  // AI Brainstorming Partner states
  const [partnerMessages, setPartnerMessages] = useState<Array<{ role: 'user' | 'model'; content: string }>>([
    { role: "model", content: "Hey partner! 🧠 I'm ScoutPartner, your AI Sales strategist and co-pilot. I can help you critique value propositions, brainstorm client pitches, and fine-tune your messaging to close real B2B deals.\n\nWhat opportunity or strategy should we tackle today?" }
  ]);
  const [partnerInput, setPartnerInput] = useState("");
  const [isSendingPartnerMessage, setIsSendingPartnerMessage] = useState(false);
  const [partnerSelectedOppId, setPartnerSelectedOppId] = useState<string>("");

  // AI Self-Learning states
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<any>(null);

  // Passcode / Password Protection states
  const [isAuthRequired, setIsAuthRequired] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [isVerifyingPasscode, setIsVerifyingPasscode] = useState(false);

  // Helper to build headers with password if required
  const getAuthHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
    const saved = localStorage.getItem("app_password") || "";
    return {
      ...extra,
      ...(saved ? { "x-app-password": saved } : {})
    };
  };

  // Check auth requirement and verify saved password
  const checkAuthStatus = async () => {
    try {
      const res = await fetch("/api/auth/status");
      if (!res.ok) return;
      const data = await res.json();
      if (data.required) {
        setIsAuthRequired(true);
        const saved = localStorage.getItem("app_password");
        if (saved) {
          const verifyRes = await fetch("/api/auth/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: saved })
          });
          if (verifyRes.ok) {
            setIsAppLocked(false);
            return true;
          }
        }
        setIsAppLocked(true);
        return false;
      } else {
        setIsAuthRequired(false);
        setIsAppLocked(false);
        return true;
      }
    } catch (err) {
      console.error("Auth status check error:", err);
      return true;
    }
  };

  const handleUnlockApp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!passcodeInput.trim()) return;
    setIsVerifyingPasscode(true);
    setPasscodeError("");

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passcodeInput.trim() })
      });

      if (res.ok) {
        localStorage.setItem("app_password", passcodeInput.trim());
        setIsAppLocked(false);
        setPasscodeInput("");
        setPasscodeError("");
        fetchData();
      } else {
        setPasscodeError("Incorrect passcode. Please check your APP_PASSWORD in .env.");
      }
    } catch (err: any) {
      setPasscodeError("Connection error while verifying passcode.");
    } finally {
      setIsVerifyingPasscode(false);
    }
  };

  const handleLockApp = () => {
    localStorage.removeItem("app_password");
    setIsAppLocked(true);
  };

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [networkError, setNetworkError] = useState("");

  // Fetch initial data
  const fetchData = async () => {
    try {
      setIsLoading(true);
      const reqHeaders = getAuthHeaders();
      const [oppsRes, statsRes, botRes, alertsRes] = await Promise.all([
        fetch("/api/opportunities", { headers: reqHeaders }),
        fetch("/api/stats", { headers: reqHeaders }),
        fetch("/api/bot-config", { headers: reqHeaders }),
        fetch("/api/alerts", { headers: reqHeaders })
      ]);

      if (!oppsRes.ok || !statsRes.ok) {
        if (oppsRes.status === 401 || statsRes.status === 401) {
          setIsAppLocked(true);
          throw new Error("Application is password protected. Please enter passcode.");
        }
        throw new Error("Failed to contact backend services. Please ensure the dev server is active.");
      }

      const oppsData = await oppsRes.json();
      const statsData = await statsRes.json();
      const botData = botRes.ok ? await botRes.json() : null;
      const alertsData = alertsRes.ok ? await alertsRes.json() : [];

      setOpportunities(oppsData);
      setStats(statsData);
      if (botData) {
        setBotConfig(botData);
      }
      setAlerts(alertsData);
      setNetworkError("");
    } catch (err: any) {
      console.error(err);
      setNetworkError(err.message || "Something went wrong while connecting to the backend server.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus().then((unlocked) => {
      if (unlocked !== false) {
        fetchData();
      } else {
        setIsLoading(false);
      }
    });
  }, []);

  // Automated Daily Morning Sweep: Runs exactly once per day on initial app open
  useEffect(() => {
    const triggerDailySweepIfFirstOpen = async () => {
      try {
        const todayStr = new Date().toISOString().split("T")[0]; // e.g. "2026-08-16"
        const lastSweepDate = localStorage.getItem("last_daily_sweep_date");

        if (lastSweepDate !== todayStr) {
          localStorage.setItem("last_daily_sweep_date", todayStr);
          console.log(`[Daily Auto-Sweep] First open of the day (${todayStr}). Dispatching automated morning discovery sweep...`);

          // Check if crawl is already running
          const statusRes = await fetch("/api/crawl/status");
          if (statusRes.ok) {
            const status = await statusRes.json();
            if (status.active) {
              console.log("[Daily Auto-Sweep] Sweep already in progress. Skipping duplicate dispatch.");
              return;
            }
          }

          // Trigger automated morning sweep targeting high-priority marketing agencies & contractors
          const reqHeaders = getAuthHeaders({ "Content-Type": "application/json" });
          const triggerRes = await fetch("/api/bot-config/trigger-sweep", {
            method: "POST",
            headers: reqHeaders,
            body: JSON.stringify({
              sector: "Marketing agency",
              keyword: "CRM webhook automation workflow",
              platform: "Reddit"
            })
          });

          if (triggerRes.ok) {
            setCrawlNotification("🌅 Good morning! P.A.C. Daily Morning Sweep initiated to discover today's top opportunities...");
            setTimeout(() => setCrawlNotification(null), 9000);
          }
        }
      } catch (err) {
        console.error("[Daily Auto-Sweep] Error triggering morning sweep:", err);
      }
    };

    // Trigger after initial app load settles
    const timer = setTimeout(() => {
      triggerDailySweepIfFirstOpen();
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Listen for Google Auth changes and restore session
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGmailUser(user);
        setGmailToken(token);
      },
      () => {
        setGmailUser(null);
        setGmailToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Global background crawl status polling & real-time notification
  const [globalCrawlStatus, setGlobalCrawlStatus] = useState<any>({ active: false });
  const [crawlNotification, setCrawlNotification] = useState<string | null>(null);

  useEffect(() => {
    let wasActive = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/crawl/status");
        if (res.ok) {
          const data = await res.json();
          setGlobalCrawlStatus(data);
          if (data.active) {
            wasActive = true;
          } else if (wasActive) {
            wasActive = false;
            fetchData();
            const count = data.foundOppsCount || 0;
            setCrawlNotification(`✨ Sweep complete! Discovered ${count} new high-pain opportunit${count === 1 ? 'y' : 'ies'}.`);
            setTimeout(() => setCrawlNotification(null), 9000);
          }
        }
      } catch (e) { }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ==========================================
  // AI PARTNER & SELF-LEARNING EVENT HANDLERS
  // ==========================================

  // Send Starter Prompts directly to Brainstorming Co-Pilot
  const handleSendStarter = async (starterPrompt: string) => {
    if (isSendingPartnerMessage) return;
    setIsSendingPartnerMessage(true);
    
    // Add user starter message to history
    const userMessage = { role: "user" as const, content: starterPrompt };
    const updatedMessages = [...partnerMessages, userMessage];
    setPartnerMessages(updatedMessages);

    try {
      const linkedOpp = partnerSelectedOppId 
        ? opportunities.find(o => o.id === partnerSelectedOppId)
        : null;

      const res = await fetch("/api/partner/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          opportunity: linkedOpp
        })
      });

      if (!res.ok) throw new Error("Consulting response timed out. Please try again.");
      const data = await res.json();
      setPartnerMessages([...updatedMessages, { role: "model" as const, content: data.response }]);
    } catch (err: any) {
      setPartnerMessages([...updatedMessages, { role: "model" as const, content: `Error: ${err.message || "Failed to reach ScoutPartner. Check connection."}` }]);
    } finally {
      setIsSendingPartnerMessage(false);
    }
  };

  // Send Custom Input Message to Co-Pilot
  const handleSendPartnerMessage = async () => {
    if (!partnerInput.trim() || isSendingPartnerMessage) return;
    const currentInput = partnerInput;
    setPartnerInput("");
    setIsSendingPartnerMessage(true);

    const userMessage = { role: "user" as const, content: currentInput };
    const updatedMessages = [...partnerMessages, userMessage];
    setPartnerMessages(updatedMessages);

    try {
      const linkedOpp = partnerSelectedOppId 
        ? opportunities.find(o => o.id === partnerSelectedOppId)
        : null;

      const res = await fetch("/api/partner/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          opportunity: linkedOpp
        })
      });

      if (!res.ok) throw new Error("Failed to reach co-pilot room.");
      const data = await res.json();
      setPartnerMessages([...updatedMessages, { role: "model" as const, content: data.response }]);
    } catch (err: any) {
      setPartnerMessages([...updatedMessages, { role: "model" as const, content: `Error: ${err.message}` }]);
    } finally {
      setIsSendingPartnerMessage(false);
    }
  };

  // Trigger Outbound Playbook Simulations
  const handleTriggerSimulation = async () => {
    if (isSimulating || opportunities.length === 0) return;
    setIsSimulating(true);

    try {
      const res = await fetch("/api/learning/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunities })
      });

      if (!res.ok) throw new Error("Simulation failed. Check backend.");
      const data = await res.json();
      setSimulationResult(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSimulating(false);
    }
  };

  // Trigger AI Self-Optimization loop
  const handleTriggerOptimization = async () => {
    if (isOptimizing || opportunities.length === 0) return;
    setIsOptimizing(true);

    try {
      const res = await fetch("/api/learning/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunities })
      });

      if (!res.ok) throw new Error("Optimization loop failed. Check API.");
      const data = await res.json();
      setOptimizationResult(data);

      // Reload config to sync active changes instantly!
      const botRes = await fetch("/api/bot-config");
      if (botRes.ok) {
        const botData = await botRes.json();
        setBotConfig(botData);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGmailLogin = async () => {
    setIsGmailConnecting(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setGmailUser(result.user);
        setGmailToken(result.accessToken);
      }
    } catch (err) {
      console.error("Gmail Sign-in failed:", err);
    } finally {
      setIsGmailConnecting(false);
    }
  };

  const handleGmailLogout = async () => {
    try {
      await googleLogout();
      setGmailUser(null);
      setGmailToken(null);
    } catch (err) {
      console.error("Gmail Sign-out failed:", err);
    }
  };

  // Update Stats from local list (to prevent excessive server polling)
  const refreshStatsLocal = (list: Opportunity[]) => {
    const saved = list.filter(o => o.status === "Saved").length;
    const contacted = list.filter(o => o.status === "Contacted").length;
    const inDiscussion = list.filter(o => o.status === "In Discussion").length;
    const productIdeas = list.filter(o => o.status === "Potential Product").length;
    
    const nowStr = new Date().toISOString().split('T')[0];
    const followupsPending = list.filter(o => o.followUpDate && o.followUpDate <= nowStr && o.status !== "Archived").length;

    setStats({
      totalDiscovered: list.length,
      saved,
      contacted,
      inDiscussion,
      productIdeas,
      followupsPending
    });
  };

  // 1. Save or Update opportunity
  const handleSaveOpportunity = async (updated: Opportunity) => {
    try {
      const response = await fetch("/api/opportunities/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      if (!response.ok) throw new Error("Could not save updates to server.");
      
      const newList = opportunities.map(o => o.id === updated.id ? updated : o);
      setOpportunities(newList);
      refreshStatsLocal(newList);

      // Keep drawer in-sync if it's currently showing this card
      if (selectedOpp && selectedOpp.id === updated.id) {
        setSelectedOpp(updated);
      }
    } catch (err) {
      console.error(err);
      alert("Error saving opportunity tracking updates.");
    }
  };

  // 2. Delete / Dismiss opportunity
  const handleDeleteOpportunity = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("Are you sure you want to dismiss this opportunity? It will be removed from your crawler database.")) return;

    try {
      const response = await fetch(`/api/opportunities/${id}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("Failed to delete.");

      const newList = opportunities.filter(o => o.id !== id);
      setOpportunities(newList);
      refreshStatsLocal(newList);

      if (selectedOpp && selectedOpp.id === id) {
        setSelectedOpp(null);
      }
    } catch (err) {
      console.error(err);
      alert("Error dismissing opportunity.");
    }
  };

  // 3. Trigger Continuous Discovery simulated crawl
  const handleTriggerDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDiscovering(true);
    setDiscoveryTrace([]); // Reset diagnostic trace at start
    setDiscoveryMessage("Querying the permitted, enabled crawler sources for the chosen sector...");
    try {
      const response = await fetch("/api/opportunities/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector: discoverySector, keyword: discoveryKeyword, discoveryMode })
      });

      if (!response.ok) {
        let errorMsg = "AI crawler encountered a transient platform error. Please retry.";
        let errTrace: string[] = [];
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errorMsg = errData.error;
          }
          if (errData && errData.trace) {
            errTrace = errData.trace;
          }
        } catch (_) {}
        if (errTrace.length > 0) {
          setDiscoveryTrace(errTrace);
        }
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      const opportunitiesList = Array.isArray(data) ? data : (data.opportunities || []);
      const trace = data.trace || [];

      setDiscoveryTrace(trace);
      setOpportunities(prev => [...opportunitiesList, ...prev]);
      
      // Fetch latest stats directly from backend
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      setDiscoveryMessage(`Success! Crawled and extracted ${opportunitiesList.length} live opportunities.`);
      setDiscoveryKeyword("");
    } catch (err: any) {
      console.error(err);
      setDiscoveryMessage(`Error: ${err.message || "Failed to discover new opportunities."}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  // 4. Manual Post Analysis Sandbox
  const handleAnalyzeCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) return;
    setIsAnalyzing(true);
    setAnalysisError("");
    try {
      const response = await fetch("/api/opportunities/analyze-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postText: rawText,
          sourceUrl: customUrl,
          sourcePlatform: customPlatform
        })
      });

      if (!response.ok) throw new Error("Failed to parse document text. Please make sure GEMINI_API_KEY is configured.");

      const newOpp = await response.json();
      setOpportunities(prev => [newOpp, ...prev]);
      
      // Update statistics
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // Reset form
      setRawText("");
      setCustomUrl("");
      
      // Auto-open newly parsed opportunity
      setSelectedOpp(newOpp);
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || "Failed to parse manual copy. Is your Gemini key active?");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 4.5. Scrape public URL directly via Firecrawl
  const handleScrapeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapeUrl.trim()) return;
    setIsScraping(true);
    setScrapeError("");
    try {
      const response = await fetch("/api/opportunities/scrape-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: scrapeUrl,
          sourcePlatform: scrapePlatform,
          stealthMode: stealthMode
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to scrape the URL. Is your Firecrawl key valid?");
      }

      const newOpp = await response.json();
      setOpportunities(prev => [newOpp, ...prev]);

      // Fetch updated stats
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      setScrapeUrl("");
      setSelectedOpp(newOpp);
    } catch (err: any) {
      console.error(err);
      setScrapeError(err.message || "Something went wrong while scraping the URL.");
    } finally {
      setIsScraping(false);
    }
  };

  // 4.7. Save Bot Fleet Configuration
  const handleSaveBotConfig = async (updatedConfig: any) => {
    setBotConfigSaving(true);
    setBotConfigSaveMessage("");
    try {
      const res = await fetch("/api/bot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig)
      });
      if (!res.ok) throw new Error("Failed to save bot configurations.");
      const data = await res.json();
      setBotConfig(data.config);
      setBotConfigSaveMessage("Configuration saved successfully!");
      setTimeout(() => setBotConfigSaveMessage(""), 4000);
    } catch (err: any) {
      console.error(err);
      setBotConfigSaveMessage(`Error: ${err.message}`);
    } finally {
      setBotConfigSaving(false);
    }
  };

  // 4.8. Trigger Live Discovery Sweep for the Bot Fleet
  const handleTriggerSweep = async () => {
    setIsSweepingBot(true);
    setRunLogs(["[Initiating Live Scan...] Syncing platform crawler daemons...", "[Ready] Triggering full fleet live sweep..."]);
    try {
      const res = await fetch("/api/bot-config/trigger-sweep", {
        method: "POST"
      });
      if (!res.ok) throw new Error("Bot Fleet discovery sweep cycle failed.");
      
      let lastLogIndex = 0;
      setRunLogs([]);

      // Poll status every 1.5 seconds to pull new logs in real-time
      const interval = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/crawl/status");
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            
            // Append any new logs
            if (statusData.logs && statusData.logs.length > lastLogIndex) {
              const newLogs = statusData.logs.slice(lastLogIndex);
              setRunLogs(prev => [...prev, ...newLogs]);
              lastLogIndex = statusData.logs.length;
            }
            
            if (!statusData.active) {
              clearInterval(interval);
              setIsSweepingBot(false);
              fetchData();
            }
          }
        } catch (pollErr) {
          clearInterval(interval);
          setIsSweepingBot(false);
          console.error("Error polling sweep status:", pollErr);
        }
      }, 1500);
      
    } catch (err: any) {
      console.error(err);
      setRunLogs(prev => [...prev, `[CRITICAL ERROR] ${err.message || "Failed to complete sweep"}`]);
      setIsSweepingBot(false);
    }
  };

  // Clear system email notification alerts
  const handleClearAlerts = async () => {
    if (!confirm("Are you sure you want to clear all simulated notification logs?")) return;
    setIsClearingAlerts(true);
    try {
      const res = await fetch("/api/alerts", { method: "DELETE" });
      if (res.ok) {
        setAlerts([]);
      }
    } catch (err) {
      console.error("Failed to clear alerts:", err);
    } finally {
      setIsClearingAlerts(false);
    }
  };

  // Bot configuration update helper
  const updatePlatformConfig = (platformId: string, updates: Partial<any>) => {
    if (!botConfig) return;
    const updated = {
      ...botConfig,
      platforms: botConfig.platforms.map((p: any) => {
        if (p.platformId === platformId) {
          return { ...p, ...updates };
        }
        return p;
      })
    };
    setBotConfig(updated);
  };

  // Add target to a bot platform
  const addBotTarget = (platformId: string, name: string, pathStr: string) => {
    if (!botConfig || !pathStr.trim()) return;
    const updated = {
      ...botConfig,
      platforms: botConfig.platforms.map((p: any) => {
        if (p.platformId === platformId) {
          const newTarget = {
            id: `${platformId}-${Date.now()}`,
            name: name || pathStr,
            urlOrPath: pathStr,
            isEnabled: true
          };
          return { ...p, targets: [...p.targets, newTarget] };
        }
        return p;
      })
    };
    setBotConfig(updated);
  };

  // Toggle target enabled status
  const toggleBotTarget = (platformId: string, targetId: string) => {
    if (!botConfig) return;
    const updated = {
      ...botConfig,
      platforms: botConfig.platforms.map((p: any) => {
        if (p.platformId === platformId) {
          return {
            ...p,
            targets: p.targets.map((t: any) => {
              if (t.id === targetId) {
                return { ...t, isEnabled: !t.isEnabled };
              }
              return t;
            })
          };
        }
        return p;
      })
    };
    setBotConfig(updated);
  };

  // Remove target from bot platform
  const removeBotTarget = (platformId: string, targetId: string) => {
    if (!botConfig) return;
    const updated = {
      ...botConfig,
      platforms: botConfig.platforms.map((p: any) => {
        if (p.platformId === platformId) {
          return {
            ...p,
            targets: p.targets.filter((t: any) => t.id !== targetId)
          };
        }
        return p;
      })
    };
    setBotConfig(updated);
  };

  // 5. Draft response helper (passed down to detail drawer)
  const handleDraftResponse = async (opp: Opportunity, guidance: string) => {
    const response = await fetch("/api/opportunities/draft-response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunity: opp, userGuidance: guidance })
    });
    if (!response.ok) throw new Error("Could not generate AI draft response.");
    return response.json();
  };

  // Get unique lists for filter options
  const industries = ["All", ...Array.from(new Set(opportunities.map(o => o.industry)))];
  const platforms = ["All", ...Array.from(new Set(opportunities.map(o => o.sourcePlatform)))];

  // Filter and Rank the opportunities list
  const filteredOpps = opportunities.filter(opp => {
    const matchesSearch = 
      opp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.problemSummary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.whoIsExperiencing.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.industry.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesIndustry = selectedIndustry === "All" || opp.industry === selectedIndustry;
    const matchesPlatform = selectedPlatform === "All" || opp.sourcePlatform === selectedPlatform;
    
    let matchesStatus = true;
    if (selectedStatus !== "All") {
      if (selectedStatus === "Saved") {
        matchesStatus = opp.status === "Saved";
      } else if (selectedStatus === "Contacted") {
        matchesStatus = opp.status === "Contacted";
      } else if (selectedStatus === "In Discussion") {
        matchesStatus = opp.status === "In Discussion";
      } else if (selectedStatus === "Potential Product") {
        matchesStatus = opp.status === "Potential Product";
      } else if (selectedStatus === "New") {
        matchesStatus = opp.status === "New";
      } else if (selectedStatus === "Archived") {
        matchesStatus = opp.status === "Archived";
      }
    } else {
      // By default, exclude archived cards from the main view unless user selects "Archived" specifically
      matchesStatus = opp.status !== "Archived";
    }

    return matchesSearch && matchesIndustry && matchesPlatform && matchesStatus;
  }).sort((a, b) => b.opportunityScore - a.opportunityScore); // Rank highest score first

  // Score badge design helper
  const getScoreBadgeStyles = (score: number) => {
    if (score >= 85) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (score >= 70) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  };

  if (appMode === "public") {
    return (
      <PublicLandingView
        onOpenFounderLogin={() => {
          setAppMode("dashboard");
        }}
        isUnlocked={!isAppLocked}
        onSwitchToDashboard={() => setAppMode("dashboard")}
      />
    );
  }

  if (isAppLocked) {
    return (
      <div className="min-h-screen bg-[#01070e] text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-[#3b82f6] selection:text-white">
        <div className="max-w-md w-full bg-[#030e1a] border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center mb-4 text-cyan-400 shadow-lg">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold font-mono tracking-wide text-white uppercase">Founder Radar Access</h2>
            <p className="text-xs text-slate-400 mt-1">
              Opportunity Radar is protected by a master access passcode.
            </p>
          </div>

          <form onSubmit={handleUnlockApp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider font-mono">
                Master Passcode
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="password"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="Enter access passcode..."
                  className="w-full bg-[#01070e] border border-slate-700 focus:border-cyan-500 text-white rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors"
                  autoFocus
                />
              </div>
              {passcodeError && (
                <p className="text-xs text-rose-400 mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {passcodeError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isVerifyingPasscode || !passcodeInput.trim()}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isVerifyingPasscode ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  Unlock Application
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <button
              onClick={() => setAppMode("public")}
              className="text-amber-400 hover:text-amber-300 transition-colors font-medium flex items-center gap-1"
            >
              ← Back to Public Website
            </button>
            <p className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <code className="text-cyan-400 font-mono">APP_PASSWORD</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#01070e] text-slate-100 flex flex-col font-sans selection:bg-[#3b82f6] selection:text-white" id="main-container">
      
      {/* 1. Global Header with real-time indicators */}
      <header className="border-b border-[#93c5fd]/20 bg-[#1e838a] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          {/* Beautiful App Icon Representation from User */}
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[#3b82f6] via-[#1185ac] to-[#a5eee2] p-[1.5px] shadow-lg shrink-0">
            <div className="w-full h-full bg-[#01070e] rounded-[10px] flex items-center justify-center overflow-hidden relative">
              {/* Styled Gear and Link connector */}
              <svg className="w-5 h-5 text-[#a5eee2] animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.827m11.379-8.16l1.15-.827M8.14 21.27l.707-1.03m10.306-7.516l.707-1.03M12 3v1.5m0 15V21m-3.077-2.543l-.513-1.41m5.13-14.095l-.513-1.41m-8.16 11.379l-.827-1.15m8.16-11.379l-.827-1.15m-7.516 10.306l-1.03-.707m7.516-10.306l-1.03-.707" />
              </svg>
              {/* Subtle gold bridge block */}
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-[#1185ac] to-[#a5eee2]" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] bg-[#a5eee2]/20 text-[#a5eee2] border border-[#93c5fd]/30 px-1.5 py-0.25 rounded font-mono font-bold tracking-wide uppercase">Deep Ocean Active</span>
              <h1 className="text-md font-bold tracking-tight text-white font-mono uppercase">Opportunity Radar</h1>
            </div>
            <p className="text-xs text-teal-100 mt-0.5">AI Discovery & Outreach CRM for Solo Developers</p>
          </div>
        </div>
        
        {/* Environment status bars */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <button
            onClick={() => setAppMode("public")}
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded flex items-center gap-1.5 font-bold transition cursor-pointer"
            title="Switch to Public Landing Page (missedrevenue.org)"
          >
            <Globe size={13} className="text-amber-400" />
            <span>Public Site (missedrevenue.org)</span>
          </button>
          <div className="px-3 py-1 bg-[#082a72] border border-[#93c5fd]/30 rounded flex items-center gap-2 text-teal-100">
            <span>Server:</span>
            <span className="text-[#a5eee2] font-bold uppercase">Online</span>
          </div>

          {/* Cloud Frontier AI Engine Badge */}
          <div
            className="px-3 py-1 bg-gradient-to-r from-teal-950/80 to-cyan-950/80 border border-teal-500/40 rounded flex items-center gap-2 text-teal-100 shadow-sm"
            title="Frontier Cloud AI: Google Gemini 2.5 Flash / Pro & OpenAI GPT-4o Active"
          >
            <Sparkles size={13} className="text-cyan-300 animate-pulse" />
            <span>LLM:</span>
            <span className="text-teal-200 font-bold font-mono">Gemini 2.5 Pro / GPT-4o</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
          </div>
          
          {/* Gmail Connection Status */}
          {gmailUser ? (
            <div className="px-3 py-1 bg-emerald-950/80 border border-emerald-500/30 rounded flex items-center gap-2 text-emerald-200">
              <Mail size={12} className="text-emerald-400" />
              <span>Gmail:</span>
              <span className="text-white font-semibold truncate max-w-[150px]">{gmailUser.email}</span>
              <button 
                onClick={handleGmailLogout}
                className="text-[10px] text-emerald-400 hover:text-rose-400 transition ml-1 cursor-pointer font-bold border-l border-emerald-500/20 pl-2"
                title="Disconnect Gmail"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleGmailLogin}
              disabled={isGmailConnecting}
              className="px-3 py-1 bg-[#082a72] hover:bg-[#0a3a92] active:bg-[#061f55] border border-[#93c5fd]/30 rounded flex items-center gap-2 text-teal-100 hover:text-white transition cursor-pointer"
            >
              <Mail size={12} className="text-sky-400" />
              <span>{isGmailConnecting ? "Connecting..." : "Connect Gmail"}</span>
            </button>
          )}

          {isAuthRequired && (
            <button
              onClick={handleLockApp}
              className="p-1.5 hover:bg-[#082a72]/80 border border-[#93c5fd]/30 rounded text-teal-100 hover:text-white transition flex items-center gap-1 text-xs cursor-pointer"
              title="Lock Application Session"
            >
              <Lock size={14} className="text-cyan-300" />
            </button>
          )}

          <button 
            onClick={fetchData} 
            className="p-1.5 hover:bg-[#082a72]/80 border border-[#93c5fd]/30 rounded text-teal-100 hover:text-white transition cursor-pointer"
            title="Refresh database"
            id="global-refresh-btn"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {/* Live Crawler Fleet Progress Banner (Visible Across All Views) */}
      {globalCrawlStatus.active && (
        <div className="bg-gradient-to-r from-cyan-950 via-[#082a72] to-indigo-950 border-b border-cyan-500/30 px-6 py-2.5 flex items-center justify-between shadow-lg text-xs font-mono animate-pulse">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-cyan-300 uppercase tracking-wide">P.A.C. Fleet Active:</span>
              <span className="text-white">{globalCrawlStatus.progress || "Deep crawling target platform for business problems..."}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-cyan-400">
            <RefreshCw size={12} className="animate-spin" />
            <span className="text-[11px]">AI Extraction In-Flight</span>
          </div>
        </div>
      )}

      {/* Sweep Complete Notification Banner */}
      {crawlNotification && (
        <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-950 border-b border-emerald-500/40 px-6 py-2.5 flex items-center justify-between shadow-lg text-xs font-mono transition-all">
          <div className="flex items-center gap-2.5 text-emerald-200">
            <span className="text-base">🎯</span>
            <span className="font-semibold text-white">{crawlNotification}</span>
          </div>
          <button
            onClick={() => { setActiveView("board"); setCrawlNotification(null); }}
            className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded text-[11px] font-bold transition cursor-pointer"
          >
            View on Board →
          </button>
        </div>
      )}

      {/* 2. Top Statistics Panel */}
      <section className="grid grid-cols-2 md:grid-cols-6 border-b border-[#93c5fd]/20 bg-[#082a72]/20 divide-x divide-y md:divide-y-0 divide-[#93c5fd]/15">
        <div className="p-4 flex flex-col justify-between" id="stat-total">
          <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Crawled Signals</span>
          <span className="text-2xl font-bold font-mono text-[#a5eee2] mt-1">{stats.totalDiscovered}</span>
        </div>
        <div className="p-4 flex flex-col justify-between" id="stat-saved">
          <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Saved Leads</span>
          <span className="text-2xl font-bold font-mono text-[#3b82f6] mt-1">{stats.saved}</span>
        </div>
        <div className="p-4 flex flex-col justify-between" id="stat-contacted">
          <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Outreaches Sent</span>
          <span className="text-2xl font-bold font-mono text-sky-400 mt-1">{stats.contacted}</span>
        </div>
        <div className="p-4 flex flex-col justify-between" id="stat-discussion">
          <span className="text-[10px] uppercase font-mono tracking-wider text-[#a5eee2] font-bold">Active Chats</span>
          <span className="text-2xl font-bold font-mono text-[#a5eee2] mt-1">{stats.inDiscussion}</span>
        </div>
        <div className="p-4 flex flex-col justify-between" id="stat-products">
          <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Product Backlog</span>
          <span className="text-2xl font-bold font-mono text-emerald-400 mt-1">{stats.productIdeas}</span>
        </div>
        <div className="p-4 flex flex-col justify-between bg-rose-500/5" id="stat-followup">
          <span className="text-[10px] uppercase font-mono tracking-wider text-rose-400 font-bold">Overdue Followups</span>
          <span className="text-2xl font-bold font-mono text-rose-400 mt-1">{stats.followupsPending}</span>
        </div>
      </section>

      {/* 3. Main Split View Grid */}
      <main className="flex-1 grid grid-cols-1 xl:grid-cols-12 overflow-hidden">
        
        {/* Left column: AI Crawlers & manual sandbox (takes 4 cols in xl) */}
        <section className="xl:col-span-4 border-r border-slate-900 bg-slate-950 p-6 space-y-6 overflow-y-auto">
          
          {/* Section: Continuous AI Discovery Crawler */}
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Sparkles size={18} />
              <h2 className="text-sm font-bold uppercase tracking-wider font-mono">Continuous AI Discovery</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Query Gemini to search and identify fresh, high-pain customer complaints in diverse industries.
            </p>

            <form onSubmit={handleTriggerDiscovery} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="discovery-sector-select" className="text-[10px] uppercase font-mono text-slate-400">Industry / Sector</label>
                <select
                  id="discovery-sector-select"
                  name="discoverySector"
                  value={discoverySector}
                  onChange={(e) => setDiscoverySector(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
                >
                  <option value="Marketing agency" className="bg-slate-950 text-slate-200">Marketing Agencies & Operations</option>
                  <option value="Local Small Businesses" className="bg-slate-950 text-slate-200">Local Small Businesses (HVAC/Plumbing)</option>
                  <option value="Real Estate & Property Management" className="bg-slate-950 text-slate-200">Real Estate & Property Management</option>
                  <option value="Construction & Subcontracting" className="bg-slate-950 text-slate-200">Construction & Subcontracting</option>
                  <option value="Professional Services (Accounting/CPA/Law)" className="bg-slate-950 text-slate-200">Professional Services (Accounting/Law)</option>
                  <option value="Local Small Businesses" className="bg-slate-950 text-slate-200">Local Small Businesses</option>
                  <option value="Finance & Invoicing Workflows" className="bg-slate-950 text-slate-200">Finance & Invoicing Workflows</option>
                  <option value="E-commerce & Retail Logistics" className="bg-slate-950 text-slate-200">E-commerce & Logistics</option>
                  <option value="Marketing agency" className="bg-slate-950 text-slate-200">Marketing agency</option>
                  <option value="Niche Hobby Forums / Communities" className="bg-slate-950 text-slate-200">Niche Hobby Communities</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono text-slate-400 block">Search Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscoveryMode("semantic")}
                    className={`px-2.5 py-1.5 rounded text-[11px] font-medium border transition text-center ${
                      discoveryMode === "semantic"
                        ? "bg-[#3b82f6]/20 border-[#3b82f6] text-[#93c5fd]"
                        : "bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    🧠 AI Semantic Finder
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscoveryMode("literal")}
                    className={`px-2.5 py-1.5 rounded text-[11px] font-medium border transition text-center ${
                      discoveryMode === "literal"
                        ? "bg-slate-800 border-slate-700 text-white"
                        : "bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    🔍 Literal Exact Search
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  {discoveryMode === "semantic"
                    ? "🧠 Intuitively translates tech-speak or features into real-world human complaints (e.g. 'receptionist rude', 'wasting hours on manual invoices')."
                    : "🔍 Scrapes and indexes exact literal matches for your raw keyword strings on public boards."}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label htmlFor="bulk-keywords-input" className="text-[10px] uppercase font-mono text-slate-400">
                    Bulk Keywords & Longtail Phrases
                  </label>
                  <span className="text-[9px] font-mono text-indigo-400 bg-indigo-950/40 px-1.5 py-0.5 rounded">
                    List Mode Active
                  </span>
                </div>
                <textarea
                  id="bulk-keywords-input"
                  name="discoveryKeyword"
                  aria-label="Bulk Keywords and Longtail Phrases"
                  value={discoveryKeyword}
                  onChange={(e) => setDiscoveryKeyword(e.target.value)}
                  placeholder="Paste a list of raw keywords or phrases here...&#10;e.g.&#10;receptionist rude&#10;wasting money on stock&#10;boss breathing down my neck"
                  rows={4}
                  className="w-full px-3 py-2 bg-[#01070e] border border-[#93c5fd]/25 rounded text-xs text-slate-200 focus:outline-none focus:border-[#3b82f6] placeholder-slate-600 font-mono resize-y"
                />
                <p className="text-[9px] text-slate-500 leading-normal">
                  💡 <strong>Tip:</strong> Paste long-tail/short-tail lists separated by commas or new lines. The discovery engine will scan and aggregate results across all of them natively.
                </p>
              </div>

              <button
                type="submit"
                disabled={isDiscovering}
                className="w-full py-2 bg-[#3b82f6] hover:bg-[#3b82f6]/90 disabled:bg-[#3b82f6]/30 disabled:text-slate-500 text-white font-bold text-xs rounded flex items-center justify-center gap-1.5 transition"
                id="run-crawler-btn"
              >
                {isDiscovering ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                <span>{isDiscovering ? "Analyzing Problems..." : "Trigger AI Discovery"}</span>
              </button>
            </form>

            {discoveryMessage && (
              <div className="p-3 bg-[#082a72]/30 border border-[#93c5fd]/25 rounded text-xs text-[#a5eee2] leading-snug animate-fade-in font-mono">
                {discoveryMessage}
              </div>
            )}

            {discoveryTrace && discoveryTrace.length > 0 && (
              <div className="p-3 bg-black/85 border border-[#3b82f6]/30 rounded space-y-2 animate-fade-in font-mono text-[10px] text-slate-300">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                  <span>AI Crawler Diagnostic Trace</span>
                  <button 
                    type="button"
                    onClick={() => setDiscoveryTrace([])} 
                    className="hover:text-white px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition text-[8px]"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                  {discoveryTrace.map((line, idx) => {
                    const isError = line.includes("❌") || line.includes("⚠️") || line.includes("failed") || line.includes("FAILURE");
                    const isSuccess = line.includes("✅") || line.includes("Success");
                    return (
                      <div 
                        key={idx} 
                        className={`${
                          isError ? "text-rose-400 font-semibold" : isSuccess ? "text-emerald-400" : "text-slate-300"
                        } leading-relaxed break-words`}
                      >
                        {line}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section: Paste Complaint Manual Analysis Sandbox */}
          <div className="p-5 rounded-xl bg-[#1185ac]/10 border border-[#93c5fd]/15 space-y-4">
            <div className="flex items-center gap-2 text-[#a5eee2]">
              <PlusCircle size={18} />
              <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-[#a5eee2]">Pasted Signal Analyzer</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Found a juicy problem thread on Reddit, Twitter, or an email? Paste the raw text below. AI will instantly run a 13-point diagnostic.
            </p>

            <form onSubmit={handleAnalyzeCustom} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="raw-post-content-input" className="text-[10px] uppercase font-mono text-slate-400">Raw Post Content</label>
                <textarea
                  id="raw-post-content-input"
                  name="rawText"
                  aria-label="Raw Post Content"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste the complaint, comment, or client grievance here..."
                  required
                  className="w-full h-32 p-2.5 bg-[#01070e] border border-[#93c5fd]/25 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#1e838a] resize-none font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="custom-platform-select" className="text-[10px] uppercase font-mono text-slate-400">Platform Source</label>
                  <select
                    id="custom-platform-select"
                    name="customPlatform"
                    aria-label="Platform Source"
                    value={customPlatform}
                    onChange={(e) => setCustomPlatform(e.target.value)}
                    className="w-full px-2 py-1.5 bg-[#01070e] border border-[#93c5fd]/25 rounded text-xs text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="Reddit" className="bg-slate-950 text-slate-200">Reddit</option>
                    <option value="Hacker News" className="bg-slate-950 text-slate-200">Hacker News</option>
                    <option value="GitHub Issue" className="bg-slate-950 text-slate-200">GitHub Issue</option>
                    <option value="Niche Forum" className="bg-slate-950 text-slate-200">Niche Forum</option>
                    <option value="Client Feedback" className="bg-slate-950 text-slate-200">Client Email/SMS</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="custom-url-input" className="text-[10px] uppercase font-mono text-slate-400">Origin URL</label>
                  <input
                    id="custom-url-input"
                    name="customUrl"
                    aria-label="Origin URL"
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-2 py-1.5 bg-[#01070e] border border-[#93c5fd]/25 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#1e838a]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isAnalyzing || !rawText.trim()}
                className="w-full py-2 bg-[#1e838a] hover:bg-[#1e838a]/90 disabled:bg-[#1e838a]/30 disabled:text-slate-500 text-white font-bold text-xs rounded flex items-center justify-center gap-1.5 transition"
                id="analyze-pasted-btn"
              >
                {isAnalyzing ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                <span>{isAnalyzing ? "Processing & Scoring..." : "Analyze & Save Signal"}</span>
              </button>
            </form>

            {analysisError && (
              <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded text-xs text-rose-300">
                {analysisError}
              </div>
            )}
          </div>

          {/* Section: URL Web Scraper (Free via Firecrawl) */}
          <div className="p-5 rounded-xl bg-[#1185ac]/10 border border-[#93c5fd]/15 space-y-4">
            <div className="flex items-center gap-2 text-sky-400">
              <Globe size={18} />
              <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-sky-200">Custom URL Web Scraper</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Have a link to an active thread on BiggerPockets, ContractorTalk, or a blog? Paste it below to crawl, extract markdown, and analyze with AI automatically.
            </p>

            <form onSubmit={handleScrapeUrl} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="scrape-target-url-input" className="text-[10px] uppercase font-mono text-slate-400">Target Webpage URL</label>
                <input
                  id="scrape-target-url-input"
                  name="scrapeUrl"
                  aria-label="Target Webpage URL"
                  type="url"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="e.g. https://www.contractortalk.com/threads/pain..."
                  required
                  className="w-full px-3 py-2 bg-[#01070e] border border-[#93c5fd]/25 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="scrape-platform-name-input" className="text-[10px] uppercase font-mono text-slate-400">Niche Source / Forum Name</label>
                <input
                  id="scrape-platform-name-input"
                  name="scrapePlatform"
                  aria-label="Niche Source or Forum Name"
                  type="text"
                  value={scrapePlatform}
                  onChange={(e) => setScrapePlatform(e.target.value)}
                  placeholder="e.g. 'ContractorTalk Forum', 'BiggerPockets'"
                  className="w-full px-3 py-2 bg-[#01070e] border border-[#93c5fd]/25 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-start gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="stealth-mode-chk"
                  checked={stealthMode}
                  onChange={(e) => setStealthMode(e.target.checked)}
                  className="mt-0.5 rounded border-[#93c5fd]/25 bg-[#01070e] text-[#1185ac] focus:ring-0 focus:ring-offset-0"
                />
                <label htmlFor="stealth-mode-chk" className="text-[11px] text-slate-300 leading-tight cursor-pointer select-none">
                  <span className="font-semibold text-sky-300 block">🛡️ Under-the-Radar Stealth Mode</span>
                  Auto-rotates human headers, adds randomized sleep delays, and enables residential IP bypass for walled gardens (LinkedIn, Facebook Groups, niche forums).
                </label>
              </div>

              <button
                type="submit"
                disabled={isScraping || !scrapeUrl.trim()}
                className="w-full py-2 bg-[#1185ac] hover:bg-[#1185ac]/90 disabled:bg-[#1185ac]/30 disabled:text-slate-500 text-white font-bold text-xs rounded flex items-center justify-center gap-1.5 transition"
                id="scrape-url-btn"
              >
                {isScraping ? <RefreshCw size={13} className="animate-spin" /> : <Globe size={13} />}
                <span>{isScraping ? "Scraping & Synthesizing..." : "Scrape & Analyze URL"}</span>
              </button>
            </form>

            {scrapeError && (
              <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded text-xs text-rose-300">
                {scrapeError}
              </div>
            )}
          </div>

          {/* Section: Small Business Hangouts Guide */}
          <div className="p-5 rounded-xl bg-[#082a72]/15 border border-[#93c5fd]/15 space-y-3">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="w-full flex items-center justify-between text-slate-300 hover:text-white transition"
              type="button"
            >
              <div className="flex items-center gap-2 text-[#a5eee2]">
                <BookOpen size={17} />
                <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-[#a5eee2]">Client Hangouts Map</h2>
              </div>
              {showGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <p className="text-[11px] text-slate-400">
              Where do non-technical small business owners talk about operational bottlenecks, paperwork limits, and workflow struggles?
            </p>

            {showGuide && (
              <div className="space-y-4 pt-2 text-xs divide-y divide-slate-900">
                <div className="space-y-1">
                  <span className="font-bold text-indigo-400 block font-mono text-[11px]">🏗️ Trades & Construction</span>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                    <li><strong className="text-slate-100">ContractorTalk:</strong> (contractortalk.com) General contracting bottlenecks.</li>
                    <li><strong className="text-slate-100">ElectricianTalk / HVAC-Talk:</strong> Blueprints & estimating struggles.</li>
                    <li><strong className="text-slate-100">Reddit r/construction:</strong> Subcontractor bidding & field updates.</li>
                  </ul>
                </div>

                <div className="space-y-1 pt-3">
                  <span className="font-bold text-emerald-400 block font-mono text-[11px]">📈 Accounting & Professional Services</span>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                    <li><strong className="text-slate-100">QuickBooks Community:</strong> Accounts and ledger reconciliations.</li>
                    <li><strong className="text-slate-100">ProConnect / CPA Forums:</strong> Tax filing bottlenecks & client folder mess.</li>
                    <li><strong className="text-slate-100">Reddit r/tax / r/Bookkeeping:</strong> Manual CPA/CPA assistant pains.</li>
                  </ul>
                </div>

                <div className="space-y-1 pt-3">
                  <span className="font-bold text-sky-400 block font-mono text-[11px]">🏠 Real Estate & Management</span>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                    <li><strong className="text-slate-100">BiggerPockets Forums:</strong> Zoning agenda tracking, permit limits.</li>
                    <li><strong className="text-slate-100">ActiveRain:</strong> Real estate listings and broker client pipeline.</li>
                    <li><strong className="text-slate-100">Reddit r/realtors / r/PropertyManagement:</strong> Tenant communication struggles.</li>
                  </ul>
                </div>

                <div className="space-y-1 pt-3">
                  <span className="font-bold text-amber-500 block font-mono text-[11px]">🤝 Local Business & E-commerce</span>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                    <li><strong className="text-slate-100">Shopify Forums:</strong> Inventory syncing, logistics apps.</li>
                    <li><strong className="text-slate-100">Reddit r/smallbusiness / r/sweatystartup:</strong> Dispatching & local operations.</li>
                  </ul>
                </div>

                <div className="space-y-1 pt-3">
                  <span className="font-bold text-[#a5eee2] block font-mono text-[11px]">🛡️ Walled Gardens & Social Channels</span>
                  <ul className="list-disc list-inside space-y-1 text-[#a5eee2]/90 text-[11px]">
                    <li><strong className="text-white">Twitter/X Advanced Search:</strong> Search for <code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300 text-[10px]">is there an app for OR "looking for software" OR "how to automate"</code> + your industry keywords. Paste any tweet URL in our Custom Scraper!</li>
                    <li><strong className="text-white">LinkedIn & Facebook Groups:</strong> Browse operator groups or search posts for <code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300 text-[10px]">spreadsheet OR tedious OR workaround</code>. Copy-paste the raw complaints into our <strong className="text-white">Pasted Signal Analyzer</strong> or scrape the URL in <strong className="text-white">Stealth Mode</strong>.</li>
                    <li><strong className="text-white">Pinterest Hubs:</strong> Explore highly saved operational template boards (e.g. "estimating templates"). Comments are filled with owners frustrated with Excel. Copy those comments into our Pasted Analyzer!</li>
                  </ul>
                </div>

                <div className="pt-3 text-[11px] text-slate-400 leading-normal italic">
                  💡 <strong>Tip:</strong> Copy any forum/thread URL from above and paste it into our <strong>Custom URL Web Scraper</strong> to automatically pull and diagnose it. No expensive Apify key needed!
                </div>
              </div>
            )}
          </div>
          
        </section>

        {/* Right column: Filters & Interactive Opportunity Board (takes 8 cols in xl) */}
        <section className="xl:col-span-8 p-6 space-y-6 overflow-y-auto flex flex-col justify-between h-full">
          
          <div className="space-y-6">

            {/* View Selection Tab Header */}
            <div className="flex flex-wrap border-b border-slate-900 pb-px gap-1">
              <button
                onClick={() => handleSelectView('board')}
                className={`px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition ${
                  activeView === 'board' 
                    ? "border-indigo-500 text-white" 
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
                id="tab-board-btn"
                type="button"
              >
                📋 Board
              </button>
              <button
                onClick={() => handleSelectView('crm')}
                className={`px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition flex items-center gap-1.5 ${
                  activeView === 'crm' 
                    ? "border-emerald-500 text-emerald-300" 
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
                id="tab-crm-btn"
                type="button"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                📊 CRM Ledger
              </button>
              <button
                onClick={() => handleSelectView('memory')}
                className={`px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition flex items-center gap-1.5 ${
                  activeView === 'memory' 
                    ? "border-purple-500 text-purple-300" 
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
                id="tab-memory-btn"
                type="button"
              >
                <Brain className="w-3.5 h-3.5 text-purple-400" />
                🧠 Memory
              </button>
              <button
                onClick={() => handleSelectView('bots')}
                className={`px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition flex items-center gap-1.5 ${
                  activeView === 'bots' 
                    ? "border-indigo-500 text-white" 
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
                id="tab-bots-btn"
                type="button"
              >
                🤖 Bot Fleet
              </button>
              <button
                onClick={() => handleSelectView('partner')}
                className={`px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition flex items-center gap-1.5 ${
                  activeView === 'partner' 
                    ? "border-indigo-500 text-white" 
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
                id="tab-partner-btn"
                type="button"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                🧠 Sales Co-Pilot
              </button>
              <button
                onClick={() => handleSelectView('learning')}
                className={`px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition flex items-center gap-1.5 ${
                  activeView === 'learning' 
                    ? "border-indigo-500 text-white" 
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
                id="tab-learning-btn"
                type="button"
              >
                🎯 Self-Learning
              </button>
              <button
                onClick={() => handleSelectView('social-posting')}
                className={`px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition flex items-center gap-1.5 ${
                  activeView === 'social-posting' 
                    ? "border-teal-400 text-teal-200 bg-teal-950/40 shadow-inner" 
                    : "border-transparent text-teal-400/70 hover:text-teal-200"
                }`}
                id="tab-social-posting-btn"
                type="button"
              >
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                🗓️ Social Posting & Calendar
              </button>
            </div>

            {activeView === 'bots' && (
              <div className="space-y-6 animate-fade-in">
                
                {/* 1. Fleet Overview Header Card */}
                <div className="p-6 rounded-2xl border border-indigo-500/20 bg-indigo-950/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-1">
                    <h2 className="text-md font-bold text-white flex items-center gap-2 font-mono">
                      <span>🤖 RADAR BOT FLEET DASHBOARD</span>
                    </h2>
                    <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                      Optimize scouting resources across forums, subreddits, and Discord guilds. Your bots are split into high-priority <strong className="text-indigo-400">Targeted Scouring</strong> for specific hot channels, and cost-effective <strong className="text-emerald-400">Broad Scouts</strong> for finding random complaints.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
                    <button
                      onClick={handleTriggerSweep}
                      disabled={isSweepingBot || !botConfig}
                      className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:from-indigo-900 disabled:to-indigo-950 disabled:text-slate-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/20 transition cursor-pointer"
                      id="sweep-bots-btn"
                      type="button"
                    >
                      <RefreshCw size={13} className={isSweepingBot ? "animate-spin" : ""} />
                      <span>{isSweepingBot ? "Running Fleet Sweep..." : "Trigger Full Fleet Sweep"}</span>
                    </button>
                  </div>
                </div>

                {/* Live Log Terminal Sweep Console */}
                {(runLogs.length > 0 || isSweepingBot) && (
                  <div className="rounded-xl border border-slate-900 bg-slate-950 p-4 space-y-2 font-mono text-xs shadow-inner">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-900 pb-2">
                      <span className="flex items-center gap-1.5"><Terminal size={12} /> CRAWLER SWEEP CONSOLE</span>
                      <span className="text-emerald-500 animate-pulse flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        CRAWLER ACTIVE
                      </span>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 text-slate-300 py-1 leading-relaxed text-[11px]">
                      {runLogs.map((log, i) => (
                        <div key={i} className={
                          log.includes("⭐") ? "text-amber-400 font-semibold pl-2 border-l-2 border-amber-500/50" :
                          log.includes("🚫") ? "text-slate-500" :
                          log.includes("⚠️") ? "text-amber-500" :
                          log.includes("✅") ? "text-emerald-400 font-semibold" :
                          log.includes("🚀") ? "text-indigo-400 font-bold" :
                          "text-slate-400"
                        }>
                          {log}
                        </div>
                      ))}
                      {isSweepingBot && (
                        <div className="text-slate-500 text-[11px] italic animate-pulse">Running active analysis pipelines...</div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. Platform Bots Settings Grid */}
                {!botConfig ? (
                  <div className="p-12 text-center text-slate-500 text-xs font-mono">
                    <RefreshCw className="animate-spin text-indigo-500 mx-auto mb-3" size={24} />
                    Loading Fleet Config...
                  </div>
                ) : (
                  <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {botConfig.platforms.map((plat: any) => {
                        const showAddForm = activeAddFormPlatform === plat.platformId;

                        return (
                          <div 
                            key={plat.platformId} 
                            className={`p-5 rounded-xl border transition flex flex-col justify-between gap-4 ${
                              plat.isEnabled 
                                ? "bg-slate-900/20 border-slate-900 hover:border-slate-800" 
                                : "bg-slate-950/20 border-slate-950/60 opacity-60 hover:opacity-85"
                            }`}
                          >
                            <div className="space-y-3">
                              
                              {/* Bot Header: Name & Enable switch */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className={`w-2 h-2 rounded-full ${plat.isEnabled ? "bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse" : "bg-slate-700"}`} />
                                  <span className="font-bold text-white text-xs font-mono uppercase">{plat.platformName}</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    checked={plat.isEnabled}
                                    onChange={(e) => updatePlatformConfig(plat.platformId, { isEnabled: e.target.checked })}
                                    className="sr-only peer"
                                  />
                                  <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 peer-checked:after:bg-indigo-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-950"></div>
                                </label>
                              </div>

                              {/* Strategy Info & Inputs */}
                              {plat.isEnabled && (
                                <div className="space-y-3 pt-3 border-t border-slate-900/60">
                                  
                                  {/* Scan Frequency */}
                                  <div className="flex items-center justify-between gap-2">
                                    <label htmlFor={`poll-interval-${plat.platformId}`} className="text-slate-400 text-[11px]">Poll Interval (minutes):</label>
                                    <input 
                                      id={`poll-interval-${plat.platformId}`}
                                      name={`scanFrequencyMinutes_${plat.platformId}`}
                                      aria-label={`Poll Interval for ${plat.platformName}`}
                                      type="number" 
                                      value={plat.scanFrequencyMinutes}
                                      onChange={(e) => updatePlatformConfig(plat.platformId, { scanFrequencyMinutes: Math.max(1, parseInt(e.target.value) || 15) })}
                                      className="w-16 px-1.5 py-0.5 bg-slate-950 border border-slate-800 rounded text-center text-slate-200 focus:outline-none text-[11px]"
                                    />
                                  </div>

                                  {/* Strategy Select */}
                                  <div className="flex items-center justify-between gap-2">
                                    <label htmlFor={`scan-strategy-${plat.platformId}`} className="text-slate-400 text-[11px]">Scan Strategy:</label>
                                    <select
                                      id={`scan-strategy-${plat.platformId}`}
                                      name={`strategy_${plat.platformId}`}
                                      aria-label={`Scan Strategy for ${plat.platformName}`}
                                      value={plat.strategy}
                                      onChange={(e) => updatePlatformConfig(plat.platformId, { strategy: e.target.value })}
                                      className="bg-slate-950 border border-slate-800 px-2 py-1 rounded text-[11px] text-slate-300 focus:outline-none cursor-pointer"
                                    >
                                      <option value="targeted" className="bg-slate-950 text-slate-200">🎯 Targeted Scouring (Frequent)</option>
                                      <option value="scout" className="bg-slate-950 text-slate-200">🛰️ Broad Scout Scanner (Resource Saving)</option>
                                    </select>
                                  </div>

                                  {/* Credentials Inputs for Discord */}
                                  {plat.platformId === "discord" && (
                                    <div className="space-y-2 pt-2.5 border-t border-slate-900/40">
                                      <div className="space-y-1">
                                        <label htmlFor="discord-bot-token" className="text-[10px] text-slate-400 block font-mono">Discord Bot Token</label>
                                        <input 
                                          id="discord-bot-token"
                                          name="discordBotToken"
                                          aria-label="Discord Bot Token"
                                          type="password"
                                          placeholder="Bot Token (Ready for connection)"
                                          value={plat.botToken || ""}
                                          onChange={(e) => updatePlatformConfig(plat.platformId, { botToken: e.target.value })}
                                          className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-200 placeholder-slate-700 font-mono focus:outline-none focus:border-indigo-500"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label htmlFor="discord-webhook-url" className="text-[10px] text-slate-400 block font-mono">Discord Webhook URL</label>
                                        <input 
                                          id="discord-webhook-url"
                                          name="discordWebhookUrl"
                                          aria-label="Discord Webhook URL"
                                          type="text"
                                          placeholder="Webhook Link (Ready for notifications)"
                                          value={plat.webhookUrl || ""}
                                          onChange={(e) => updatePlatformConfig(plat.platformId, { webhookUrl: e.target.value })}
                                          className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-200 placeholder-slate-700 font-mono focus:outline-none focus:border-indigo-500"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Monitored targets */}
                                  {plat.targets && (
                                    <div className="space-y-2 pt-2.5">
                                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold font-mono">
                                        <span>ACTIVE TARGETS ({plat.targets.filter((t: any) => t.isEnabled).length}/{plat.targets.length})</span>
                                        <button 
                                          onClick={() => {
                                            setActiveAddFormPlatform(showAddForm ? null : plat.platformId);
                                            setNewTargetName("");
                                            setNewTargetPath("");
                                          }}
                                          className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-0.5"
                                          type="button"
                                        >
                                          {showAddForm ? "Cancel" : "+ Add Target"}
                                        </button>
                                      </div>

                                      {/* Add Target inline form */}
                                      {showAddForm && (
                                        <div className="p-2.5 rounded bg-slate-950/60 border border-slate-900 space-y-2 mt-1">
                                          <input 
                                            type="text" 
                                            placeholder={
                                              plat.platformId === "discourse" ? "Display Name (e.g. Bootstrapped.fm)" :
                                              plat.platformId === "rss" ? "Display Name (e.g. RSS Feed)" :
                                              plat.platformId === "quora" ? "Display Name (e.g. Quora Small Business)" :
                                              "Display Name (e.g. #operational-pains)"
                                            }
                                            value={newTargetName}
                                            onChange={(e) => setNewTargetName(e.target.value)}
                                            className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500"
                                          />
                                          <input 
                                            type="text" 
                                            placeholder={
                                              plat.platformId === "discourse" ? "Domain name only (e.g. discuss.bootstrapped.fm)" :
                                              plat.platformId === "rss" ? "Full XML/RSS Feed URL (e.g. https://domain.com/posts.rss)" :
                                              plat.platformId === "quora" ? "Quora Topic Slug (e.g. Small-Businesses)" :
                                              "Subreddit or Channel ID / Feed Link"
                                            }
                                            value={newTargetPath}
                                            onChange={(e) => setNewTargetPath(e.target.value)}
                                            className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500"
                                          />
                                          <button
                                            onClick={() => {
                                              addBotTarget(plat.platformId, newTargetName, newTargetPath);
                                              setNewTargetName("");
                                              setNewTargetPath("");
                                              setActiveAddFormPlatform(null);
                                            }}
                                            className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded transition"
                                            type="button"
                                          >
                                            Confirm Target Path
                                          </button>
                                        </div>
                                      )}

                                      <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                        {plat.targets.map((target: any) => (
                                          <div key={target.id} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950/40 border border-slate-900/80 text-[11px]">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <input 
                                                type="checkbox" 
                                                checked={target.isEnabled}
                                                onChange={() => toggleBotTarget(plat.platformId, target.id)}
                                                className="rounded border-slate-800 bg-slate-950 text-indigo-500 text-[10px]"
                                              />
                                              <span className={`truncate text-slate-300 font-mono ${!target.isEnabled ? "line-through text-slate-600" : ""}`} title={target.urlOrPath}>
                                                {target.name}
                                              </span>
                                            </div>
                                            <button 
                                              onClick={() => removeBotTarget(plat.platformId, target.id)}
                                              className="text-slate-600 hover:text-rose-400 p-0.5 rounded transition"
                                              type="button"
                                            >
                                              <X size={11} />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                </div>
                              )}

                            </div>

                            {/* Default bottom text for offline channels */}
                            {!plat.isEnabled && (
                              <div className="text-[11px] text-slate-500 italic mt-1 leading-snug">
                                Enable this platform to configure strategy, polling intervals, and custom targets.
                              </div>
                            )}

                          </div>
                        );
                      })}
                    </div>

                    {/* GLOBAL SCHEDULER & EMAIL NOTIFICATIONS SETTINGS */}
                    <div className="p-5 rounded-2xl border border-slate-900 bg-slate-900/20 space-y-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="text-indigo-400" size={16} />
                        <h3 className="font-bold text-white text-xs font-mono uppercase">Global Automation Scheduler & Email Alerts</h3>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed">
                        Enable the continuous background daemon to automatically scour enabled channels at configured intervals. High-relevance leads can trigger custom developer alert emails.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3 border-t border-slate-900/60">
                        {/* 1. Scheduler Enable/Disable */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-300 font-mono font-bold uppercase">Background Daemon</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={botConfig.schedulerEnabled ?? true}
                                onChange={(e) => setBotConfig({ ...botConfig, schedulerEnabled: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="relative w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 peer-checked:after:bg-indigo-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-950"></div>
                            </label>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="bot-scheduler-interval" className="text-slate-500 text-[11px]">Interval (minutes):</label>
                            <input 
                              id="bot-scheduler-interval"
                              name="schedulerIntervalMinutes"
                              aria-label="Scheduler Interval in minutes"
                              type="number" 
                              value={botConfig.schedulerIntervalMinutes ?? 60}
                              onChange={(e) => setBotConfig({ ...botConfig, schedulerIntervalMinutes: Math.max(5, parseInt(e.target.value) || 60) })}
                              disabled={!(botConfig.schedulerEnabled ?? true)}
                              className="w-20 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-center text-slate-200 focus:outline-none text-xs disabled:opacity-50"
                            />
                          </div>
                        </div>

                        {/* 2. Email Notification System */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-300 font-mono font-bold uppercase">Email Notifications</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                aria-label="Enable email notifications"
                                type="checkbox" 
                                checked={botConfig.emailAlertsEnabled ?? false}
                                onChange={(e) => setBotConfig({ ...botConfig, emailAlertsEnabled: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="relative w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 peer-checked:after:bg-indigo-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-950"></div>
                            </label>
                          </div>
                          <div className="space-y-1">
                            <label htmlFor="alert-recipient-email" className="sr-only">Alert Recipient Email</label>
                            <input 
                              id="alert-recipient-email"
                              name="alertRecipientEmail"
                              aria-label="Alert Recipient Email"
                              type="email" 
                              placeholder="developer@example.com"
                              value={botConfig.alertRecipientEmail ?? ""}
                              onChange={(e) => setBotConfig({ ...botConfig, alertRecipientEmail: e.target.value })}
                              disabled={!(botConfig.emailAlertsEnabled ?? false)}
                              className="w-full px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none text-xs disabled:opacity-50 placeholder-slate-700"
                            />
                          </div>
                        </div>

                        {/* 3. Alert Score Threshold */}
                        <div className="space-y-2">
                          <span className="text-xs text-slate-300 font-mono font-bold block uppercase">Alert Relevancy Threshold</span>
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="min-alert-score-range" className="text-slate-500 text-[11px]">Min Opportunity Score:</label>
                            <div className="flex items-center gap-1.5">
                              <span className="text-indigo-400 font-bold font-mono text-xs">{botConfig.minAlertScore ?? 75}</span>
                              <input 
                                id="min-alert-score-range"
                                name="minAlertScore"
                                aria-label="Minimum Alert Score Threshold"
                                type="range" 
                                min="50"
                                max="95"
                                step="5"
                                value={botConfig.minAlertScore ?? 75}
                                onChange={(e) => setBotConfig({ ...botConfig, minAlertScore: parseInt(e.target.value) })}
                                disabled={!(botConfig.emailAlertsEnabled ?? false)}
                                className="w-24 accent-indigo-500 disabled:opacity-50"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* TRIGGERED EMAIL ALERTS LEDGER */}
                    {botConfig.emailAlertsEnabled && (
                      <div className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="text-indigo-400" size={15} />
                            <h3 className="font-bold text-white text-xs font-mono uppercase">Developer Notification Alert Ledger</h3>
                          </div>
                          {alerts.length > 0 && (
                            <button
                              onClick={handleClearAlerts}
                              disabled={isClearingAlerts}
                              className="text-xs text-slate-500 hover:text-rose-400 flex items-center gap-1 transition cursor-pointer"
                              type="button"
                            >
                              <Trash2 size={12} />
                              <span>Clear Alert Logs</span>
                            </button>
                          )}
                        </div>

                        {alerts.length === 0 ? (
                          <div className="p-8 text-center text-slate-600 text-xs italic font-mono border border-dashed border-slate-900 rounded-xl">
                            No email notifications dispatched yet. Configure the threshold and trigger a fleet run to see simulated alerts.
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                            {alerts.map((alert: any) => (
                              <div key={alert.id} className="p-4 rounded-xl bg-slate-900/40 border border-slate-900 space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-200 truncate">{alert.subject}</span>
                                  <span className="text-[10px] font-mono text-slate-500 shrink-0">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  <span className="text-slate-600">Sent To:</span> {alert.recipient} | <span className="text-slate-600">Lead Score:</span> <span className="text-emerald-400 font-bold">{alert.oppScore}</span>
                                </div>
                                <div className="bg-slate-950 p-2.5 rounded font-mono text-[10px] text-slate-400 whitespace-pre-wrap overflow-x-auto max-h-40 border border-slate-900">
                                  {alert.body}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fleet Save Buttons bar */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-900/80">
                      <div className="text-[11px] font-mono text-slate-500">
                        {botConfigSaveMessage ? (
                          <span className={botConfigSaveMessage.includes("Error") ? "text-rose-400 font-semibold" : "text-emerald-400 font-semibold"}>
                            {botConfigSaveMessage}
                          </span>
                        ) : (
                          <span>Changes are held locally until saved to the database.</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleSaveBotConfig(botConfig)}
                        disabled={botConfigSaving}
                        className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                        type="button"
                        id="save-bot-config-btn"
                      >
                        <Save size={13} />
                        <span>{botConfigSaving ? "Saving Config..." : "Save Bot Fleet Configuration"}</span>
                      </button>
                    </div>

                  </div>
                )}

              </div>
            )}

            {activeView === 'crm' && (
              <div className="space-y-6 animate-fade-in">
                <CrmLedgerView
                  opportunities={opportunities}
                  onUpdateOpportunity={handleUpdateOpportunity}
                  onSelectOpportunity={(opp) => setSelectedOpp(opp)}
                  getAuthHeaders={getAuthHeaders}
                  onRefreshData={fetchData}
                />
              </div>
            )}

            {activeView === 'memory' && (
              <div className="space-y-6 animate-fade-in">
                <AgentMemoryView
                  getAuthHeaders={getAuthHeaders}
                />
              </div>
            )}

            {activeView === 'board' && (
              <div className="space-y-6">
                
                {/* Filter and search bar */}
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-900 flex flex-wrap items-center justify-between gap-4">
                  
                  <div className="flex-1 min-w-[240px] relative">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={15} />
                    <label htmlFor="board-search-input" className="sr-only">Search problem title, summary, or sector</label>
                    <input
                      id="board-search-input"
                      name="searchTerm"
                      aria-label="Search problem title, summary, or sector"
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search problem title, summary, or sector..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    
                    {/* Sector Filter */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Building2 size={13} />
                      <label htmlFor="board-sector-filter" className="sr-only">Sector Filter</label>
                      <select
                        id="board-sector-filter"
                        name="selectedIndustry"
                        aria-label="Sector Filter"
                        value={selectedIndustry}
                        onChange={(e) => setSelectedIndustry(e.target.value)}
                        className="bg-slate-950 border border-slate-800 px-2 py-1.5 rounded text-[11px] text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value="All" className="bg-slate-950 text-slate-200">All Sectors</option>
                        {industries.filter(i => i !== "All").map((ind, i) => (
                          <option key={i} value={ind} className="bg-slate-950 text-slate-200">{ind}</option>
                        ))}
                      </select>
                    </div>

                    {/* Source Platform Filter */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Filter size={13} />
                      <label htmlFor="board-platform-filter" className="sr-only">Platform Filter</label>
                      <select
                        id="board-platform-filter"
                        name="selectedPlatform"
                        aria-label="Platform Filter"
                        value={selectedPlatform}
                        onChange={(e) => setSelectedPlatform(e.target.value)}
                        className="bg-slate-950 border border-slate-800 px-2 py-1.5 rounded text-[11px] text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value="All" className="bg-slate-950 text-slate-200">All Platforms</option>
                        {platforms.filter(p => p !== "All").map((plat, i) => (
                          <option key={i} value={plat} className="bg-slate-950 text-slate-200">{plat}</option>
                        ))}
                      </select>
                    </div>

                    {/* CRM Status Filter */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <SlidersHorizontal size={13} />
                      <label htmlFor="board-status-filter" className="sr-only">CRM Status Filter</label>
                      <select
                        id="board-status-filter"
                        name="selectedStatus"
                        aria-label="CRM Status Filter"
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="bg-slate-950 border border-slate-800 px-2 py-1.5 rounded text-[11px] text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value="All" className="bg-slate-950 text-slate-200">Active Workspace (Exclude Archived)</option>
                        <option value="New" className="bg-slate-950 text-slate-200">Pipeline: New Signals</option>
                        <option value="Saved" className="bg-slate-950 text-slate-200">Pipeline: Saved</option>
                        <option value="Contacted" className="bg-slate-950 text-slate-200">Pipeline: Contacted</option>
                        <option value="In Discussion" className="bg-slate-950 text-slate-200">Pipeline: Chatting</option>
                        <option value="Potential Product" className="bg-slate-950 text-slate-200">Pipeline: Product Backlog</option>
                        <option value="Archived" className="bg-slate-950 text-slate-200">Pipeline: Archived</option>
                      </select>
                    </div>

                  </div>

                </div>

                {/* Empty States or Results Grid */}
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-3">
                    <RefreshCw className="animate-spin text-indigo-500" size={32} />
                    <p className="text-xs text-slate-400 font-mono">Synchronizing discovery ledger...</p>
                  </div>
                ) : networkError ? (
                  <div className="p-6 rounded-xl border border-rose-500/20 bg-rose-500/5 text-center space-y-3 max-w-lg mx-auto">
                    <AlertTriangle size={32} className="text-rose-400 mx-auto" />
                    <h3 className="text-md font-bold text-white">Database Synchronisation Blocked</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {networkError}
                    </p>
                    <button 
                      onClick={fetchData}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded transition"
                    >
                      Retry Connection
                    </button>
                  </div>
                ) : filteredOpps.length === 0 ? (
                  <div className="p-10 text-center border border-slate-900 rounded-2xl bg-slate-950/40 space-y-4">
                    <HelpCircle size={36} className="text-slate-600 mx-auto" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-white">No qualified opportunities found matching filters</h3>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                        Try adjusting your filter options, clearing the search, or using the left-hand crawler to trigger a new AI problem crawl.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredOpps.map((opp) => (
                      <div
                        key={opp.id}
                        onClick={() => setSelectedOpp(opp)}
                        className="p-5 rounded-xl border border-slate-900 bg-slate-900/20 hover:bg-slate-900/50 hover:border-slate-800 transition cursor-pointer flex flex-col justify-between gap-4 shadow-sm relative group animate-fade-in animate-duration-300"
                      >
                        
                        {/* Upper Line: Platform tag & Score */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${
                              opp.sourcePlatform.includes("Reddit") ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                              opp.sourcePlatform.includes("Hacker News") ? "bg-amber-600/10 text-amber-500 border-amber-600/20" :
                              opp.sourcePlatform.includes("GitHub") ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                              opp.sourcePlatform.includes("Mastodon") ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                              opp.sourcePlatform.includes("Stack Exchange") ? "bg-teal-500/10 text-teal-400 border-teal-500/20" :
                              "bg-sky-500/10 text-sky-400 border-sky-500/20"
                            }`}>
                              {opp.sourcePlatform}
                            </span>
                            {opp.classification && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wide border ${
                                opp.classification === "help_seeker" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                opp.classification === "solution_sharer" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                "bg-slate-500/10 text-slate-400 border-slate-500/20"
                              }`}>
                                {opp.classification.replace("_", " ")}
                              </span>
                            )}
                            <span className="text-slate-500 font-mono text-[10px]">By {opp.author}</span>
                          </div>

                          {/* Score circle badge */}
                          <div className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold border flex items-center gap-1 ${getScoreBadgeStyles(opp.opportunityScore)}`}>
                            <Gauge size={12} />
                            <span>{opp.opportunityScore}</span>
                          </div>
                        </div>

                        {/* Middle Block: Problem title and summary excerpt */}
                        <div className="space-y-1.5">
                          <h3 className="text-sm font-bold text-white group-hover:text-sky-400 transition leading-tight">
                            {opp.title}
                          </h3>
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {opp.problemSummary}
                          </p>
                        </div>

                        {/* Lower Info: Niche / Industry badge, Pain status, and tracking indicator */}
                        <div className="pt-3 border-t border-slate-900/80 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-slate-900 text-slate-300 px-2 py-0.5 rounded-full font-medium">
                              {opp.industry}
                            </span>
                            <div className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Flame size={12} className={opp.painLevel === "High" ? "text-rose-500" : "text-amber-500"} />
                              <span className={opp.painLevel === "High" ? "text-rose-400 font-semibold" : ""}>{opp.painLevel} Pain</span>
                            </div>
                          </div>

                          {/* Current Pipeline Badge */}
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            opp.status === "New" ? "bg-slate-800 text-slate-400 border border-slate-700" :
                            opp.status === "Saved" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                            opp.status === "Contacted" ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" :
                            opp.status === "In Discussion" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                            opp.status === "Potential Product" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            "bg-slate-800 text-slate-500"
                          }`}>
                            {opp.status}
                          </span>
                        </div>

                        {/* Quick action trash can overlay for easy cleanups */}
                        <button 
                          onClick={(e) => handleDeleteOpportunity(opp.id, e)}
                          className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1 bg-slate-900/80 hover:bg-rose-950 border border-slate-800 hover:border-rose-800 rounded text-slate-400 hover:text-rose-400 transition shadow-sm z-10"
                          title="Dismiss opportunity"
                          id={`delete-${opp.id}-btn`}
                        >
                          <Trash2 size={12} />
                        </button>

                      </div>
                    ))}
                  </div>
                )}

              </div>
            )}

            {activeView === 'partner' && (
              <div className="space-y-6 animate-fade-in">
                {/* 1. Header Card */}
                <div className="p-6 rounded-2xl border border-indigo-500/20 bg-indigo-950/10 space-y-2">
                  <h2 className="text-md font-bold text-white flex items-center gap-2 font-mono">
                    <span>🧠 SALES BRAINSTORMING PARTNER</span>
                  </h2>
                  <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                    Brainstorm bespoke sales copy, map out client angles, critique your value propositions, or craft outreach messaging. Bounce ideas with your co-pilot to construct winning campaigns.
                  </p>
                </div>

                {/* 2. Interactive Workspace */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left Column: Context Setup & Quick Prompts */}
                  <div className="lg:col-span-1 space-y-4">
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                      <span className="text-xs font-bold text-slate-300 font-mono uppercase block">Active Brainstorm Context</span>
                      <div className="space-y-1">
                        <label htmlFor="partner-selected-opp" className="text-[10px] text-slate-500 font-mono block">Link an Opportunity (Optional):</label>
                        <select
                          id="partner-selected-opp"
                          name="partnerSelectedOppId"
                          aria-label="Link an Opportunity"
                          value={partnerSelectedOppId}
                          onChange={(e) => setPartnerSelectedOppId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 px-2 py-1.5 rounded text-xs text-slate-200 focus:outline-none cursor-pointer"
                        >
                          <option value="" className="bg-slate-950 text-slate-200">-- No Specific Opportunity Linked --</option>
                          {opportunities.map((opp) => (
                            <option key={opp.id} value={opp.id} className="bg-slate-950 text-slate-200">
                              {opp.author} ({opp.industry || "General"}) - {opp.title.substring(0, 30)}...
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal italic">
                        Linking an opportunity feeds its entire business pain, evidence text, and proposed solution profile into ScoutPartner's brains for hyper-custom advice!
                      </p>
                    </div>

                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                      <span className="text-xs font-bold text-slate-300 font-mono uppercase block">Quick Brainstorm Starters</span>
                      <div className="flex flex-col gap-2 pt-1">
                        {[
                          { text: "💡 Critique my current B2B pitch structure", prompt: "I'd like a raw critique of my B2B software value proposition structure. What are the top 3 mistakes solo developers make when pitching small business owners, and how do we fix them?" },
                          { text: "📊 Brainstorm local service bottlenecks", prompt: "Let's brainstorm high-converting automation bottlenecks in the field services (HVAC, plumbing, roofing) and real estate sectors. What manual work are office coordinators or field crews doing that we can automate in 3 days?" },
                          { text: "🤝 Map out pricing proposal structures", prompt: "How should I structure my pricing proposals for a customized MVP? Can we brainstorm standard upfront + subscription maintenance tier packages that home contractors or boutique marketing agency owners are comfortable with?" },
                          { text: "🧠 Draft a warm-up email strategy", prompt: "I found a perfect prospect. What's a non-spammy way to start a conversion with them on Reddit or LinkedIn without sounding like a salesperson?" }
                        ].map((starter, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendStarter(starter.prompt)}
                            className="text-left p-2.5 bg-slate-950 hover:bg-indigo-950/40 rounded border border-slate-800 hover:border-indigo-500/20 text-xs text-slate-300 hover:text-white transition cursor-pointer leading-normal text-slate-200"
                            type="button"
                          >
                            {starter.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Chat Box */}
                  <div className="lg:col-span-2 p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[500px]">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                      <span className="text-xs font-bold text-slate-300 font-mono uppercase flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                        ScoutPartner Co-Pilot Room
                      </span>
                      <button
                        onClick={() => setPartnerMessages([
                          { role: "model", content: "Hey partner! 🧠 I'm ScoutPartner, your AI Sales strategist and co-pilot. Let's brainstorm. Ask me anything!" }
                        ])}
                        className="text-[10px] text-slate-500 hover:text-rose-400 transition cursor-pointer font-mono uppercase"
                        type="button"
                      >
                        Reset Conversation
                      </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin flex flex-col-reverse">
                      <div className="space-y-4">
                        {partnerMessages.map((msg, idx) => (
                          <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                              msg.role === "user"
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-950 border border-slate-800 text-slate-200 whitespace-pre-wrap"
                            }`}>
                              <span className="text-[9px] font-mono opacity-50 block mb-1 uppercase font-bold tracking-wider">
                                {msg.role === "user" ? "You" : "ScoutPartner"}
                              </span>
                              <span>{msg.content}</span>
                            </div>
                          </div>
                        ))}
                        {isSendingPartnerMessage && (
                          <div className="flex justify-start">
                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 flex items-center gap-2 font-mono">
                              <span className="animate-bounce font-extrabold text-indigo-400">●</span>
                              <span className="animate-bounce [animation-delay:0.2s] font-extrabold text-indigo-400">●</span>
                              <span className="animate-bounce [animation-delay:0.4s] font-extrabold text-indigo-400">●</span>
                              <span className="text-[10px] text-slate-400 ml-1">ScoutPartner is typing...</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Input Area */}
                    <form 
                      onSubmit={(e) => { e.preventDefault(); handleSendPartnerMessage(); }} 
                      className="mt-4 flex gap-2"
                    >
                      <label htmlFor="partner-chat-input" className="sr-only">Ask ScoutPartner anything</label>
                      <input
                        id="partner-chat-input"
                        name="partnerInput"
                        aria-label="Ask ScoutPartner anything"
                        type="text"
                        value={partnerInput}
                        onChange={(e) => setPartnerInput(e.target.value)}
                        placeholder={partnerSelectedOppId ? "Brainstorm pitching this lead..." : "Ask ScoutPartner anything..."}
                        disabled={isSendingPartnerMessage}
                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-700 font-mono"
                      />
                      <button
                        type="submit"
                        disabled={isSendingPartnerMessage || !partnerInput.trim()}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer font-mono"
                      >
                        Send
                      </button>
                    </form>
                  </div>

                </div>
              </div>
            )}

            {activeView === 'learning' && (
              <div className="space-y-6 animate-fade-in">
                
                {/* 1. Header and Continuous Self-Improvement loop status */}
                <div className="p-6 rounded-2xl border border-indigo-500/20 bg-indigo-950/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-1">
                    <h2 className="text-md font-bold text-white flex items-center gap-2 font-mono">
                      <span>🎯 AI SELF-LEARNING & OPTIMIZATION LOOP</span>
                    </h2>
                    <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                      Leverage sales analytics and customer response data. Feed CRM outcomes back into the AI engine to automatically optimize Bot crawler targets, find hot sectors, and auto-tune response templates.
                    </p>
                  </div>
                  <button
                    onClick={handleTriggerOptimization}
                    disabled={isOptimizing || opportunities.length === 0}
                    className="w-full md:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:from-slate-800 disabled:text-slate-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20 transition cursor-pointer shrink-0 font-mono"
                    type="button"
                  >
                    <Sparkles size={13} />
                    <span>{isOptimizing ? "Optimizing Engine..." : "Optimize Scrapers & AI"}</span>
                  </button>
                </div>

                {/* 2. Conversion and Playbook Testing Dashboard */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Left Box: Playbook Testing (Real-world sales simulations) */}
                  <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-300 font-mono uppercase block">Sales Framework Playbook Test Suite</span>
                        <p className="text-[10px] text-slate-500 leading-normal">
                          Run simulations against your active leads to score conversion rates and identify pushbacks.
                        </p>
                      </div>
                      <button
                        onClick={handleTriggerSimulation}
                        disabled={isSimulating || opportunities.length === 0}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition cursor-pointer"
                        type="button"
                      >
                        {isSimulating ? "Simulating..." : "Run Test Suite"}
                      </button>
                    </div>

                    {!simulationResult ? (
                      <div className="p-12 text-center text-slate-500 text-xs italic border border-dashed border-slate-800 rounded-xl space-y-2">
                        <p>No framework testing simulations executed for this cycle.</p>
                        <p className="text-[10px] text-slate-600">Click "Run Test Suite" to model B2B decision-maker feedback and predict outcome metrics!</p>
                      </div>
                    ) : (
                      <div className="space-y-4 animate-fade-in">
                        <div className="grid grid-cols-2 gap-3">
                          {simulationResult.frameworkPerformance?.map((fw: any, idx: number) => (
                            <div key={idx} className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl space-y-2 text-xs">
                              <div className="flex items-center justify-between border-b border-slate-900 pb-1.5">
                                <span className="font-bold text-slate-200 truncate pr-2 font-mono">{fw.frameworkName}</span>
                                <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-bold shrink-0">{fw.estimatedReplyRate}% Reply</span>
                              </div>
                              <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{fw.description || fw.whyItSucceedsOrFails}</p>
                              <div className="text-[9px] text-rose-400 bg-rose-950/20 border border-rose-500/10 p-1.5 rounded leading-normal">
                                <strong>Lead Objections:</strong> {fw.primaryObjection}
                              </div>
                            </div>
                          ))}
                        </div>

                        {simulationResult.overallRecommendation && (
                          <div className="p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/15 text-xs leading-relaxed text-slate-300">
                            <span className="font-bold text-indigo-400 block mb-1 font-mono">📋 Strategic Recommendation:</span>
                            {simulationResult.overallRecommendation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Box: Real CRM Outcomes Performance Log & Tuning logs */}
                  <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                    <span className="text-xs font-bold text-slate-300 font-mono uppercase block">CRM Real Performance Metrics</span>
                    
                    {/* Metrics Cards Grid */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                        <span className="text-[10px] text-slate-500 block">Total</span>
                        <span className="text-md font-mono font-bold text-white">{opportunities.length}</span>
                      </div>
                      <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                        <span className="text-[10px] text-indigo-400 block">Saved</span>
                        <span className="text-md font-mono font-bold text-indigo-400">{opportunities.filter(o => o.status === "Saved").length}</span>
                      </div>
                      <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                        <span className="text-[10px] text-sky-400 block">Contact</span>
                        <span className="text-md font-mono font-bold text-sky-400">{opportunities.filter(o => o.status === "Contacted").length}</span>
                      </div>
                      <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                        <span className="text-[10px] text-rose-400 block">Declined</span>
                        <span className="text-md font-mono font-bold text-rose-400">{opportunities.filter(o => o.status === "Archived").length}</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-800/80 pt-3 space-y-3">
                      <span className="text-[11px] font-mono font-bold text-slate-400 uppercase block">Self-Tuning & Learning Output</span>
                      
                      {!optimizationResult ? (
                        <div className="p-8 text-center text-slate-500 text-xs italic border border-dashed border-slate-800 rounded-xl space-y-1">
                          <p>No active optimization log compiled yet.</p>
                          <p className="text-[10px] text-slate-600">Click "Optimize Scrapers & AI" above to run the learning loop.</p>
                        </div>
                      ) : (
                        <div className="space-y-3 animate-fade-in text-xs leading-relaxed">
                          <div className="p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl text-slate-300 font-mono text-[10px] leading-relaxed max-h-48 overflow-y-auto pr-1">
                            <span className="text-emerald-400 font-bold block mb-1">⚡ AI Learning Diagnostic:</span>
                            {optimizationResult.optimizationLog}
                          </div>

                          {optimizationResult.appliedToBotConfig && (
                            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-xl flex items-center gap-2 text-[10px] font-mono">
                              <Check size={12} className="text-emerald-400" />
                              <span>Learning closed: Auto-saved and hot-loaded new bot scraper targets!</span>
                            </div>
                          )}

                          {optimizationResult.refinedDraftingGuidance && (
                            <div className="p-3 bg-slate-950 border border-indigo-500/10 rounded-xl text-slate-300">
                              <span className="font-bold text-indigo-400 block text-[11px] font-mono mb-1">✍️ Auto-Tuned Template Guidance:</span>
                              <div className="text-[10px] whitespace-pre-line leading-relaxed text-slate-400 font-mono">
                                {optimizationResult.refinedDraftingGuidance}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {activeView === 'social-posting' && (
              <div className="space-y-6 animate-fade-in">
                <SocialPostingCalendar />
              </div>
            )}

          </div>

          {/* Humble architectural advice / checklist footer */}
          <footer className="mt-12 pt-6 border-t border-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-mono">
            <span>Continuous Opportunity Radar Engine v1.1</span>
            <span className="flex items-center gap-1"><Terminal size={12} /> Real Problem → Useful Response → Trust → Product</span>
          </footer>

        </section>

      </main>

      {/* 4. Active Drawer Panel for Opportunity Card inspection */}
      {selectedOpp && (
        <OpportunityCardDetail
          opportunity={selectedOpp}
          onClose={() => setSelectedOpp(null)}
          onSave={handleSaveOpportunity}
          onDraftResponse={handleDraftResponse}
          gmailUser={gmailUser}
          gmailToken={gmailToken}
          onGmailLogin={handleGmailLogin}
          onGmailLogout={handleGmailLogout}
        />
      )}

      {/* P.A.C. Intelligent Co-founder Overlay Widget */}
      <PacOverlay
        opportunities={opportunities}
        gmailToken={gmailToken}
        gmailUser={gmailUser}
        onRefreshOpportunities={fetchData}
        activeView={activeView}
        onNavigateView={setActiveView}
        onSelectOpportunity={setSelectedOpp}
      />

      {/* Ollama Local Qwen2.5 Tunnel Configuration Modal */}
      <OllamaTunnelModal
        isOpen={isOllamaModalOpen}
        onClose={() => setIsOllamaModalOpen(false)}
      />

    </div>
  );
}
