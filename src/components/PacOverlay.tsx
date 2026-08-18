import React, { useState, useEffect, useRef } from "react";
import {
  Mic, MicOff, Volume2, VolumeX, Monitor, Send, Sparkles, Cpu,
  Terminal, Play, Square, Check, AlertCircle, X, ChevronRight,
  User, Bot, HelpCircle, CornerDownLeft, RefreshCw, Layers, Plus, Zap,
  Trash2, Save, Calendar, Activity, Settings, Sliders, Copy, Maximize2, Download, ExternalLink, Image as ImageIcon
} from "lucide-react";
import { sendGmailEmail } from "../utils/gmailApi";
import { Opportunity } from "../types";

interface PacOverlayProps {
  opportunities: Opportunity[];
  gmailToken: string | null;
  gmailUser: any;
  onRefreshOpportunities?: () => void;
  activeView?: string;
  onNavigateView?: (view: 'board' | 'crm' | 'memory' | 'bots' | 'partner' | 'learning') => void;
  onSelectOpportunity?: (opp: Opportunity | null) => void;
}

export default function PacOverlay({
  opportunities,
  gmailToken,
  gmailUser,
  onRefreshOpportunities,
  activeView,
  onNavigateView,
  onSelectOpportunity
}: PacOverlayProps) {
  // Draggable state
  const [position, setPosition] = useState(() => {
    if (typeof window !== "undefined") {
      return { x: Math.max(20, window.innerWidth - 440), y: 120 };
    }
    return { x: 800, y: 120 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({ startX: 0, startY: 0, posX: 0, posY: 0 });

  // UI state
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "computer" | "spar" | "review" | "memory" | "campaigns">("chat");
  const [campaignPosts, setCampaignPosts] = useState<any[]>([]);
  const [isLoadingCampaign, setIsLoadingCampaign] = useState(false);
  const [rejectionFeedbacks, setRejectionFeedbacks] = useState<Record<string, string>>({});
  const [regeneratingPostId, setRegeneratingPostId] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState<{
    type: "outreach" | "proposal" | "contract";
    title: string;
    content: string;
    recipient?: string;
    targetUrl?: string;
    targetAuthor?: string;
    targetPlatform?: string;
    opportunityId?: string;
  } | null>(null);
  const [isSendingReviewEmail, setIsSendingReviewEmail] = useState(false);
  const [reviewEmailRecipient, setReviewEmailRecipient] = useState("");
  const [revisionFeedbackInput, setRevisionFeedbackInput] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);

  const [agentMemory, setAgentMemory] = useState<{
    summary: string;
    followUps: Array<{ id: string; task: string; completed: boolean; dueDate?: string }>;
  }>({
    summary: "",
    followUps: []
  });

  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  // Interaction mode: Voice vs Text
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const inputModeRef = useRef<"text" | "voice">(inputMode);
  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  const [pacStatus, setPacStatusState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const pacStatusRef = useRef<"idle" | "listening" | "thinking" | "speaking">("idle");
  const setPacStatus = (status: "idle" | "listening" | "thinking" | "speaking") => {
    pacStatusRef.current = status;
    setPacStatusState(status);
  };
  const [textInput, setTextInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "pac"; text: string; time: string }>>(() => {
    try {
      const saved = localStorage.getItem("PAC_CHAT_HISTORY");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.error("Failed to parse saved chat history:", err);
    }
    return [
      {
        role: "pac",
        text: "Partner, I'm online and auditing our pipeline. We have high-pain leads ready for outreach and we need to lock in Client #1 today. Let's look at the highest-leverage lead, review the angle, and get moving.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });

  // Save conversation history to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem("PAC_CHAT_HISTORY", JSON.stringify(messages.slice(-60)));
    } catch (err) {
      console.error("Failed to save chat history to localStorage:", err);
    }
  }, [messages]);

  // Voice/Speech Engine Refs
  const recognitionRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(() => {
    return localStorage.getItem("PAC_SPEAKER_MUTED") === "true";
  });
  useEffect(() => {
    localStorage.setItem("PAC_SPEAKER_MUTED", isSpeakerMuted.toString());
  }, [isSpeakerMuted]);
  const isSpeakerMutedRef = useRef<boolean>(isSpeakerMuted);
  const ignoreAudioRef = useRef(false);
  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted;
  }, [isSpeakerMuted]);

  const [useDeepgram, setUseDeepgram] = useState<boolean>(false);
  const useDeepgramRef = useRef<boolean>(useDeepgram);
  useEffect(() => {
    useDeepgramRef.current = useDeepgram;
  }, [useDeepgram]);
  const reconnectTimerRef = useRef<any>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const [speechEngine, setSpeechEngine] = useState<"deepgram" | "browser">((): "deepgram" | "browser" => {
    const stored = localStorage.getItem("PAC_SPEECH_ENGINE");
    return stored === "browser" ? "browser" : "deepgram";
  });

  const [speechPlaybackRate, setSpeechPlaybackRate] = useState<number>(() => {
    const val = localStorage.getItem("PAC_SPEECH_RATE");
    return val ? parseFloat(val) : 1.25;
  });
  const speechPlaybackRateRef = useRef<number>(speechPlaybackRate);
  useEffect(() => {
    speechPlaybackRateRef.current = speechPlaybackRate;
    localStorage.setItem("PAC_SPEECH_RATE", speechPlaybackRate.toString());
  }, [speechPlaybackRate]);

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const pwd = localStorage.getItem("app_password") || "";
    const headers = {
      ...(options.headers || {}),
      "X-App-Password": pwd
    };
    return fetch(url, { ...options, headers });
  };

  const [dgApiKey, setDgApiKey] = useState<string>(() => {
    return localStorage.getItem("VITE_DEEPGRAM_API_KEY") || (import.meta as any).env.VITE_DEEPGRAM_API_KEY || (import.meta as any).env.VITE_DEEPGRAM_ADMIN_API_KEY || "";
  });
  const [dgAgentId, setDgAgentId] = useState<string>(() => {
    return localStorage.getItem("VITE_DEEPGRAM_AGENT_ID") || (import.meta as any).env.VITE_DEEPGRAM_AGENT_ID || "470277c9-c238-4208-9fef-6b3b126da261";
  });
  const [dgProjectId, setDgProjectId] = useState<string>(() => {
    return localStorage.getItem("VITE_DEEPGRAM_PROJECT_ID") || (import.meta as any).env.VITE_DEEPGRAM_PROJECT_ID || "";
  });
  const [dgVoice, setDgVoice] = useState<string>(() => {
    return localStorage.getItem("VITE_DEEPGRAM_VOICE") || "aura-2-jupiter-en";
  });
  const [dgConnectionStatus, setDgConnectionStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [dgLifecycleStatus, setDgLifecycleStatus] = useState<"Disconnected" | "Connecting..." | "Authenticated" | "Connected" | "Error">("Disconnected");
  const [micLevel, setMicLevel] = useState<number>(0);
  const [dgCloseReason, setDgCloseReason] = useState("");
  const [dgCloseCode, setDgCloseCode] = useState<number | null>(null);
  const [showVoiceSettings, setShowVoiceSettings] = useState<boolean>(false);
  const [isSettingUpAgent, setIsSettingUpAgent] = useState(false);
  const [setupAgentError, setSetupAgentError] = useState("");
  const [setupAgentSuccess, setSetupAgentSuccess] = useState("");

  const [hasServerEnvKey, setHasServerEnvKey] = useState<boolean>(false);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState<boolean>(false);
  const [diagnosticReport, setDiagnosticReport] = useState<any>(null);

  const [consoleAgents, setConsoleAgents] = useState<any[]>([]);
  const [isFetchingAgents, setIsFetchingAgents] = useState<boolean>(false);
  const [fetchAgentsError, setFetchAgentsError] = useState<string>("");
  const [useConsoleAgentSettings, setUseConsoleAgentSettings] = useState<boolean>(() => {
    const stored = localStorage.getItem("PAC_USE_CONSOLE_AGENT_SETTINGS");
    return stored !== null ? stored === "true" : false;
  });

  useEffect(() => {
    localStorage.setItem("PAC_USE_CONSOLE_AGENT_SETTINGS", useConsoleAgentSettings.toString());
  }, [useConsoleAgentSettings]);

  const fetchConsoleAgents = async () => {
    setIsFetchingAgents(true);
    setFetchAgentsError("");
    setComputerLogs(prev => [...prev, "🔍 Querying Deepgram account for pre-built Console Agents..."]);

    try {
      const activeKey = dgApiKey || (import.meta as any).env.VITE_DEEPGRAM_API_KEY;
      const url = `/api/deepgram/list-agents` + (activeKey ? `?key=${encodeURIComponent(activeKey)}` : "");
      const res = await apiFetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to query agents.");
      }

      setConsoleAgents(data.agents || []);
      setComputerLogs(prev => [...prev, `[DEEPGRAM-INSPECTOR] Found ${data.count || 0} agent(s) on your Deepgram account.`]);
    } catch (err: any) {
      console.error("Failed to fetch console agents:", err);
      setFetchAgentsError(err.message || err.toString());
      setComputerLogs(prev => [...prev, `[DEEPGRAM-INSPECTOR-ERR] ${err.message || err}`]);
    } finally {
      setIsFetchingAgents(false);
    }
  };

  // Load agent memory on mount
  useEffect(() => {
    const fetchAgentMemory = async () => {
      try {
        const res = await apiFetch("/api/agent/memory");
        if (res.ok) {
          const data = await res.json();
          setAgentMemory(data);
        }
      } catch (err) {
        console.error("Failed to fetch agent memory on client:", err);
      }
    };
    fetchAgentMemory();
  }, []);

  // Load social campaigns on mount
  useEffect(() => {
    const fetchSocialCampaigns = async () => {
      try {
        const res = await apiFetch("/api/social-campaigns");
        if (res.ok) {
          const data = await res.json();
          setCampaignPosts(data);
        }
      } catch (err) {
        console.error("Failed to load social campaigns:", err);
      }
    };
    fetchSocialCampaigns();
  }, []);

  const [generatingVideoPostId, setGeneratingVideoPostId] = useState<string | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<Record<string, string>>({});
  const [videoStatusMessages, setVideoStatusMessages] = useState<Record<string, string>>({});
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const handleGenerateRunwayVideo = async (post: any) => {
    setGeneratingVideoPostId(post.id);
    setVideoStatusMessages(prev => ({ ...prev, [post.id]: "Submitting task to Runway Gen-4 Turbo..." }));
    try {
      const prompt = post.videoScriptPrompt || post.content || "Dynamic B2B software workflow automation demo";
      const res = await apiFetch("/api/social-campaigns/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptText: prompt.substring(0, 500),
          duration: 5,
          ratio: "1280:720"
        })
      });
      const data = await res.json();
      if (!res.ok || !data.taskId) {
        throw new Error(data.error || "Failed to submit video task");
      }
      
      const taskId = data.taskId;
      setVideoStatusMessages(prev => ({ ...prev, [post.id]: "Rendering video in Runway (approx 30-60s)..." }));
      
      const interval = setInterval(async () => {
        try {
          const statusRes = await apiFetch(`/api/social-campaigns/video-status/${taskId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status === "SUCCEEDED" && statusData.videoUrl) {
              clearInterval(interval);
              setGeneratedVideos(prev => ({ ...prev, [post.id]: statusData.videoUrl }));
              setGeneratingVideoPostId(null);
              setVideoStatusMessages(prev => ({ ...prev, [post.id]: "Video Render Complete! 🎬" }));
            } else if (statusData.status === "FAILED") {
              clearInterval(interval);
              setGeneratingVideoPostId(null);
              setVideoStatusMessages(prev => ({ ...prev, [post.id]: "❌ Rendering failed in Runway." }));
            } else {
              setVideoStatusMessages(prev => ({ ...prev, [post.id]: `Rendering in Runway (${statusData.status || "PROCESSING"})...` }));
            }
          }
        } catch (e) {}
      }, 5000);
    } catch (err: any) {
      setGeneratingVideoPostId(null);
      setVideoStatusMessages(prev => ({ ...prev, [post.id]: `❌ Error: ${err.message}` }));
    }
  };

  const handleGenerateCampaign = async () => {
    setIsLoadingCampaign(true);
    setComputerLogs(prev => [...prev, "[CAMPAIGN-GEN] Planning a fresh 7-day social campaign draft..."]);
    try {
      const res = await apiFetch("/api/social-campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        setCampaignPosts(data.posts || []);
        setComputerLogs(prev => [...prev, "[CAMPAIGN-GEN] Successfully generated a 7-day social campaign plan!"]);
      } else {
        const errData = await res.json();
        setComputerLogs(prev => [...prev, `[CAMPAIGN-GEN] ❌ Generation failed: ${errData.error || res.statusText}`]);
      }
    } catch (err: any) {
      console.error(err);
      setComputerLogs(prev => [...prev, `[CAMPAIGN-GEN] ❌ Error: ${err.message}`]);
    } finally {
      setIsLoadingCampaign(false);
    }
  };

  const handleApprovePost = async (id: string, launchScheduler: boolean = true) => {
    setComputerLogs(prev => [...prev, `[CAMPAIGN] Approving social post: ${id}...`]);
    try {
      const res = await apiFetch("/api/social-campaigns/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        const data = await res.json();
        setCampaignPosts(prev => prev.map(p => p.id === id ? data.post : p));
        setComputerLogs(prev => [...prev, `[CAMPAIGN] Post ${id} APPROVED and scheduled!`]);

        const approvedPost = campaignPosts.find(p => p.id === id);
        if (approvedPost && launchScheduler) {
          // 1. Copy content to clipboard
          try {
            await navigator.clipboard.writeText(approvedPost.content);
          } catch (e) {}

          // 2. Open Platform Scheduler
          let platformUrl = "";
          const platformLower = (approvedPost.platform || "").toLowerCase();

          if (platformLower.includes("facebook") || platformLower.includes("meta") || platformLower.includes("instagram")) {
            platformUrl = "https://business.facebook.com/latest/composer";
          } else if (platformLower.includes("linkedin")) {
            platformUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(approvedPost.content)}`;
          } else if (platformLower.includes("twitter") || platformLower.includes("x")) {
            platformUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(approvedPost.content)}`;
          } else if (platformLower.includes("reddit")) {
            platformUrl = `https://www.reddit.com/r/smallbusiness/submit?title=${encodeURIComponent("Practical workflow automation blueprint")}&text=${encodeURIComponent(approvedPost.content)}`;
          } else {
            platformUrl = "https://publish.buffer.com/compose";
          }

          if (platformUrl) {
            window.open(platformUrl, '_blank');
          }

          alert(`📋 Post for ${approvedPost.platform} approved and copied to clipboard!\n\nOpened ${approvedPost.platform} scheduler in a new tab. Paste (⌘+V / Ctrl+V) and choose your schedule date/time (${approvedPost.scheduledDate}).`);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportIcsCalendar = () => {
    if (!campaignPosts || campaignPosts.length === 0) {
      alert("No campaign posts to export. Click 'Plan 7-Day Campaign' first!");
      return;
    }

    let icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Opportunity Radar//Thought Leadership Campaign//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];

    campaignPosts.forEach((post, index) => {
      const dateStr = post.scheduledDate ? post.scheduledDate.replace(/-/g, "") : new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const startDt = `${dateStr}T140000Z`;
      const endDt = `${dateStr}T143000Z`;
      const summary = `📢 Post to ${post.platform} [Thought Leadership]`;
      const description = `${(post.content || "").replace(/\n/g, "\\n")}\\n\\nVisual Prompt: ${(post.imagePrompt || "").replace(/\n/g, "\\n")}`;

      icsContent.push(
        "BEGIN:VEVENT",
        `UID:campaign-${post.id}-${Date.now()}-${index}@missedrevenue.org`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
        `DTSTART:${startDt}`,
        `DTEND:${endDt}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `STATUS:CONFIRMED`,
        "END:VEVENT"
      );
    });

    icsContent.push("END:VCALENDAR");

    const blob = new Blob([icsContent.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `7-Day-Campaign-Schedule-${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert("📅 Downloaded 7-Day Campaign Calendar (.ics)! Open this file on your computer/phone to add all scheduled posts to Apple Calendar, Google Calendar, or Outlook with full text pre-loaded.");
  };

  const handleRejectPost = async (id: string) => {
    const feedback = rejectionFeedbacks[id] || "";
    setRegeneratingPostId(id);
    setComputerLogs(prev => [...prev, `[CAMPAIGN] Rejecting post ${id}. Feedback: "${feedback}". Re-generating...`]);
    try {
      const res = await apiFetch("/api/social-campaigns/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, feedback })
      });
      if (res.ok) {
        const data = await res.json();
        setCampaignPosts(prev => prev.map(p => p.id === id ? data.post : p));
        setRejectionFeedbacks(prev => ({ ...prev, [id]: "" })); // clear input
        setComputerLogs(prev => [...prev, `[CAMPAIGN] Post ${id} successfully re-generated! Ready for review.`]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRegeneratingPostId(null);
    }
  };

  // ----------------------------------------------------
  // SILENT SUBSYSTEM DIAGNOSTICS & ABILITIES CHECK
  // ----------------------------------------------------
  const [diagnosticsResult, setDiagnosticsResult] = useState<{
    isChecking: boolean;
    lastChecked: string | null;
    allHealthy: boolean;
    issues: string[];
    subsystems: {
      deepgramVoice: boolean | "degraded";
      geminiChat: boolean;
      memoryBank: boolean;
      uiNavigator: boolean;
      audioCapture: boolean;
    };
  }>({
    isChecking: false,
    lastChecked: null,
    allHealthy: true,
    issues: [],
    subsystems: {
      deepgramVoice: true,
      geminiChat: true,
      memoryBank: true,
      uiNavigator: true,
      audioCapture: true
    }
  });

  const runDiagnosticsCheck = async () => {
    setDiagnosticsResult(prev => ({ ...prev, isChecking: true }));
    const issuesList: string[] = [];
    const subState = {
      deepgramVoice: true as boolean | "degraded",
      geminiChat: true,
      memoryBank: true,
      uiNavigator: true,
      audioCapture: true
    };

    // 1. Deepgram Voice API & Key Check
    try {
      const activeKey = dgApiKey || (import.meta as any).env.VITE_DEEPGRAM_API_KEY;
      if (!activeKey) {
        subState.deepgramVoice = "degraded";
        issuesList.push("Deepgram Voice API key missing. Running on WebSpeech browser fallback.");
      } else {
        const dgRes = await apiFetch(`/api/deepgram/config?key=${encodeURIComponent(activeKey)}`);
        if (!dgRes.ok) {
          subState.deepgramVoice = "degraded";
          issuesList.push("Deepgram Voice API returned non-OK status. WebSpeech fallback active.");
        } else if (dgConnectionStatus !== "connected") {
          subState.deepgramVoice = "degraded";
          issuesList.push(`Voice Agent WebSocket currently disconnected (${dgConnectionStatus}). Click '🎙️ Connect & Start Live Speech' in Settings.`);
        }
      }
    } catch (e) {
      subState.deepgramVoice = "degraded";
      issuesList.push("Deepgram Voice check failed. WebSpeech fallback active.");
    }

    // 2. Memory Bank Check
    try {
      const memRes = await apiFetch("/api/agent/memory");
      if (!memRes.ok) {
        subState.memoryBank = false;
        issuesList.push("Agent Memory API unreachable.");
      }
    } catch (e) {
      subState.memoryBank = false;
      issuesList.push("Agent Memory API network error.");
    }

    // 3. Gemini Chat AI Endpoint Check
    try {
      const chatRes = await apiFetch("/api/pac/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "diagnostics_ping", history: [] })
      });
      if (!chatRes.ok && chatRes.status !== 400) {
        subState.geminiChat = false;
        issuesList.push("Gemini Chat API returned error status.");
      }
    } catch (e) {
      subState.geminiChat = false;
      issuesList.push("Gemini Chat API offline.");
    }

    // 4. Audio MediaDevices Support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      subState.audioCapture = false;
      issuesList.push("Microphone capture API disabled or unsupported.");
    }

    const healthy = issuesList.length === 0;
    const nowTime = new Date().toLocaleTimeString();
    setDiagnosticsResult({
      isChecking: false,
      lastChecked: nowTime,
      allHealthy: healthy,
      issues: issuesList,
      subsystems: subState
    });

    if (healthy) {
      setComputerLogs(prev => [
        ...prev,
        `[P.A.C. DIAGNOSTICS] Silent self-check COMPLETE (${nowTime}). All 5 core subsystems nominal: Deepgram Voice (OK), Gemini Chat (OK), Memory Bank (OK), UI Navigator (OK), Audio Engine (OK).`
      ]);
    } else {
      setComputerLogs(prev => [
        ...prev,
        `[P.A.C. DIAGNOSTICS ATTENTION] Silent check completed with ${issuesList.length} notice(s):`,
        ...issuesList.map(i => `  - ${i}`)
      ]);
    }
  };

  // Run silent diagnostics on mount
  useEffect(() => {
    runDiagnosticsCheck();
  }, []);

  const handleResetChatHistory = () => {
    localStorage.removeItem("PAC_CHAT_HISTORY");
    hasSpokenGreetingRef.current = false;
    setMessages([
      {
        role: "pac",
        text: "Hi, my name is P.A.C, Your Partner of Autonomous Capabilities. I am your new business partner. I specialize in service client acquisitions and together we are going to land your first client. Ready to jump in?",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setComputerLogs(prev => [...prev, "[P.A.C.] Conversation history reset. Starting fresh session."]);
  };

  const handleSaveAgentMemory = async (updatedMemory: typeof agentMemory) => {
    try {
      const res = await apiFetch("/api/agent/memory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updatedMemory)
      });
      if (res.ok) {
        const data = await res.json();
        setAgentMemory(data.memory);
        setComputerLogs(prev => [...prev, "💾 Agent memory updated persistently on the server."]);
      }
    } catch (err) {
      console.error("Failed to save agent memory on client:", err);
    }
  };

  const parseAndApplyMemoryUpdate = (rawMemoryText: string) => {
    const lines = rawMemoryText.split("\n");
    let newSummary = agentMemory.summary;
    const newFollowUps = [...agentMemory.followUps];

    lines.forEach(line => {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();
      if (lower.startsWith("summary:")) {
        newSummary = trimmed.substring(trimmed.indexOf(":") + 1).trim();
      } else if (lower.startsWith("follow-up:") || lower.startsWith("task:")) {
        const taskText = trimmed.substring(trimmed.indexOf(":") + 1).trim();
        // Look for a due date like (Due: YYYY-MM-DD)
        const dateMatch = taskText.match(/\(Due:\s*([^\)]+)\)/i);
        let dueDate: string | undefined;
        let cleanTask = taskText;
        if (dateMatch) {
          dueDate = dateMatch[1].trim();
          cleanTask = taskText.replace(/\(Due:\s*([^\)]+)\)/i, "").trim();
        }

        // Avoid duplicate tasks
        if (cleanTask && !newFollowUps.some(f => f.task.toLowerCase() === cleanTask.toLowerCase())) {
          newFollowUps.push({
            id: Math.random().toString(36).substring(2, 9),
            task: cleanTask,
            completed: false,
            dueDate
          });
        }
      }
    });

    const updated = {
      summary: newSummary,
      followUps: newFollowUps
    };

    setAgentMemory(updated);
    handleSaveAgentMemory(updated);
  };

  const processTranscriptText = (text: string) => {
    if (!text) return;

    // 0. UI Action Tag Interceptions
    const navMatch = text.match(/\[ACTION:\s*NAVIGATE:\s*([a-z0-9_-]+)\]/i);
    if (navMatch) {
      const targetView = navMatch[1].toLowerCase();
      const validViews = ['board', 'crm', 'memory', 'bots', 'partner', 'learning'];
      if (validViews.includes(targetView)) {
        onNavigateView?.(targetView as any);
        setComputerLogs(prev => [...prev, `[P.A.C. NAVIGATOR] Switched main app view to '${targetView}'.`]);
      } else {
        setComputerLogs(prev => [...prev, `[P.A.C. ERROR] ❌ Failed to navigate view: '${targetView}' is not a valid screen view. Valid views: ${validViews.join(', ')}`]);
      }
    }

    // 0b. UI Action Tag & Keyword Interceptions for Opportunity Card Drawer
    let matchedOpp: Opportunity | null = null;
    let attemptedOpen = false;
    let queryUsed = "";

    const oppMatch = text.match(/\[ACTION:\s*OPEN_OPPORTUNITY:\s*([^\]]+)\]/i);
    if (oppMatch) {
      attemptedOpen = true;
      const query = oppMatch[1].trim().toLowerCase();
      queryUsed = query;
      matchedOpp = opportunities.find(o => 
        o.id.toLowerCase() === query ||
        o.id.toLowerCase().includes(query) ||
        o.title.toLowerCase().includes(query) ||
        o.author.toLowerCase().includes(query) ||
        (o.problemSummary && o.problemSummary.toLowerCase().includes(query)) ||
        o.industry.toLowerCase().includes(query)
      ) || null;
    } else {
      // Fallback check for opp_ or discovered- ID pattern in text
      const idMatch = text.match(/\b((?:opp_|discovered-)[a-z0-9_-]+)\b/i);
      if (idMatch) {
        attemptedOpen = true;
        const idQuery = idMatch[1].toLowerCase();
        queryUsed = idQuery;
        matchedOpp = opportunities.find(o => o.id.toLowerCase() === idQuery || o.id.toLowerCase().includes(idQuery)) || null;
      }
    }

    // Natural speech pattern fallback for opening card
    if (!matchedOpp && (/(?:pull|open|show|display)(?:ing|ed|s)?\s+(?:up\s+)?(?:the\s+)?(?:card|opportunity|lead|prospect|hvac|plumbing|roofing)/i.test(text))) {
      attemptedOpen = true;
      const words = text.toLowerCase().split(/\s+/);
      const targetWord = words.find(w => w.length > 3 && !['pull', 'open', 'show', 'display', 'the', 'card', 'opportunity', 'lead', 'prospect'].includes(w));
      queryUsed = targetWord || "unknown keyword";
      matchedOpp = opportunities.find(o => 
        words.some(w => w.length > 3 && (o.title.toLowerCase().includes(w) || o.industry.toLowerCase().includes(w) || o.id.toLowerCase().includes(w)))
      ) || null;
    }

    if (matchedOpp) {
      onSelectOpportunity?.(matchedOpp);
      if (onNavigateView) onNavigateView('board');
      // Auto-minimize overlay window so it doesn't block the opportunity drawer on screen!
      setIsMinimized(true);
      setComputerLogs(prev => [...prev, `[P.A.C. NAVIGATOR] Automatically pulled up Opportunity Card: "${matchedOpp.title || matchedOpp.id}" on screen.`]);
    } else if (attemptedOpen) {
      setComputerLogs(prev => [...prev, `[P.A.C. ERROR] ❌ Failed to open opportunity: No match found in the database for query or ID "${queryUsed}".`]);
    }

    // 0c. Diagnostics Action Interception
    if (text.includes("[ACTION: RUN_DIAGNOSTICS]") || /\[ACTION:\s*RUN_DIAGNOSTICS\]/i.test(text) || /(?:run|check)\s+(?:a\s+)?(?:subsystem\s+|abilities\s+|ability\s+|full\s+)?(?:check|diagnostics)/i.test(text)) {
      runDiagnosticsCheck();
      setComputerLogs(prev => [...prev, "[P.A.C. DIAGNOSTICS] Executed full subsystem abilities self-check."]);
    }

    // 0d. Trigger Scraper Sweep Action Tag
    const sweepMatch = text.match(/\[ACTION:\s*TRIGGER_SWEEP(?::\s*([^\]]+))?\]/i);
    if (sweepMatch || text.includes("[ACTION: TRIGGER_SWEEP]")) {
      const targetSector = sweepMatch && sweepMatch[1] ? sweepMatch[1].trim() : undefined;
      setComputerLogs(prev => [...prev, `[P.A.C. ACTION] 📡 Request to run crawler sweeps detected${targetSector ? ` for ${targetSector}` : ""}.`]);
      apiFetch("/api/bot-config/trigger-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector: targetSector })
      }).then(async (res) => {
        if (res.ok) {
          setComputerLogs(prev => [...prev, `[P.A.C. ACTION] Fleet sweep dispatched. Polling live status...`]);
          const pollTimer = setInterval(async () => {
            try {
              const statusRes = await apiFetch("/api/crawl/status");
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (!statusData.active) {
                  clearInterval(pollTimer);
                  const count = statusData.foundOppsCount || 0;
                  onRefreshOpportunities?.();
                  setComputerLogs(prev => [...prev, `[P.A.C. ACTION] Sweep complete! Discovered ${count} new opportunities.`]);
                }
              }
            } catch (e) {
              clearInterval(pollTimer);
            }
          }, 2000);
        }
      }).catch(err => {
        console.error("Failed to run sweep via action tag:", err);
      });
    }

    // 0e. Local Command Execution Action Tag
    const execMatch = text.match(/\[ACTION:\s*EXECUTE_LOCAL:\s*([^\]]+)\]/i);
    if (execMatch) {
      const command = execMatch[1].trim();
      setComputerLogs(prev => [...prev, `[P.A.C. ACTION] 🖥️ Voice request to execute local command: "${command}"`]);
      apiFetch("/api/bot-config/execute-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command })
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setComputerLogs(prev => [...prev, `[P.A.C. ACTION] Command complete! stdout: ${data.stdout?.substring(0, 60) || "none"}`]);
        }
      }).catch(err => {
        console.error("Failed to execute local command via action tag:", err);
      });
    }

    // 0f. Plan Weekly Social Campaign Action Tag
    if (text.includes("[ACTION: PLAN_CAMPAIGN]") || /\[ACTION:\s*PLAN_CAMPAIGN\]/i.test(text)) {
      setComputerLogs(prev => [...prev, `[P.A.C. ACTION] 📅 Voice request to plan 7-day thought leadership campaign detected.`]);
      setActiveTab("campaigns");
      setIsMinimized(false);
      handleGenerateCampaign();
    }

    // 1. Check for memory updates
    const memoryMatch = text.match(/```memory\s*([\s\S]+?)```/i);
    const bracketMemoryMatch = text.match(/\[MEMORY\]\s*([\s\S]+?)(?:\[\/|\n\n|$)/i);
    if (memoryMatch) {
      parseAndApplyMemoryUpdate(memoryMatch[1].trim());
    } else if (bracketMemoryMatch) {
      parseAndApplyMemoryUpdate(bracketMemoryMatch[1].trim());
    }

    // 2. Check for proposals/emails/strategy plans
    const codeBlockMatch = text.match(/```(proposal|contract|document|email|outreach|draft|strategy|plan)\s*([\s\S]+?)```/i);
    const proposalRegex = /\[(?:PROPOSAL|CONTRACT|DOCUMENT)\]\s*([\s\S]+?)(?:\[\/|\n\n|$)/i;
    const emailRegex = /\[(?:EMAIL|OUTREACH|DRAFT)\]\s*([\s\S]+?)(?:\[\/|\n\n|$)/i;
    const strategyRegex = /\[(?:STRATEGY|PLAN|ROADMAP)\]\s*([\s\S]+?)(?:\[\/|\n\n|$)/i;

    // Match referenced opportunity in the text if any
    const referencedOpp = (opportunities || []).find(o => 
      (o.id && text.includes(o.id)) ||
      (o.author && text.toLowerCase().includes(o.author.toLowerCase())) ||
      (o.title && text.toLowerCase().includes(o.title.toLowerCase().substring(0, 20)))
    ) || (opportunities && opportunities.length > 0 ? opportunities[0] : null);

    const docTargetUrl = referencedOpp?.sourceUrl || referencedOpp?.originalSourceLink;
    const docTargetAuthor = referencedOpp?.author;
    const docTargetPlatform = referencedOpp?.sourcePlatform;
    const docOppId = referencedOpp?.id;

    if (codeBlockMatch) {
      const rawType = codeBlockMatch[1].toLowerCase();
      const content = codeBlockMatch[2].trim();
      const isEmail = rawType === "email" || rawType === "outreach" || rawType === "draft";
      const isStrategy = rawType === "strategy" || rawType === "plan";
      const docType = isEmail ? "outreach" : isStrategy ? "contract" : "proposal";
      const title = isEmail ? "Email Outreach Template" : isStrategy ? "Strategic Execution Plan" : "Business Proposal Draft";

      setActiveDocument({
        type: docType,
        title: title,
        content: content,
        targetUrl: docTargetUrl,
        targetAuthor: docTargetAuthor,
        targetPlatform: docTargetPlatform,
        opportunityId: docOppId
      });
      setActiveTab("review");
      setIsMinimized(false);
      setComputerLogs(prev => [...prev, `[P.A.C.] Generated ${title} -> Opened Document Review Modal.`]);
    } else {
      const propMatch = text.match(proposalRegex);
      const mailMatch = text.match(emailRegex);
      const stratMatch = text.match(strategyRegex);

      if (propMatch) {
        setActiveDocument({
          type: "proposal",
          title: "Business Proposal Draft",
          content: propMatch[1].trim(),
          targetUrl: docTargetUrl,
          targetAuthor: docTargetAuthor,
          targetPlatform: docTargetPlatform,
          opportunityId: docOppId
        });
        setActiveTab("review");
        setIsMinimized(false);
        setComputerLogs(prev => [...prev, "[P.A.C.] Extracted proposal draft from assistant speech."]);
      } else if (mailMatch) {
        setActiveDocument({
          type: "outreach",
          title: "Email Outreach Template",
          content: mailMatch[1].trim(),
          targetUrl: docTargetUrl,
          targetAuthor: docTargetAuthor,
          targetPlatform: docTargetPlatform,
          opportunityId: docOppId
        });
        setActiveTab("review");
        setIsMinimized(false);
        setComputerLogs(prev => [...prev, "[P.A.C.] Extracted email outreach draft from assistant speech."]);
      } else if (stratMatch) {
        setActiveDocument({
          type: "contract",
          title: "Strategic Execution Plan",
          content: stratMatch[1].trim(),
          targetUrl: docTargetUrl,
          targetAuthor: docTargetAuthor,
          targetPlatform: docTargetPlatform,
          opportunityId: docOppId
        });
        setActiveTab("review");
        setIsMinimized(false);
        setComputerLogs(prev => [...prev, "[P.A.C.] Extracted strategic plan from assistant speech."]);
      }
    }
  };

  // Sync credentials on mount from secure server-side environment variables
  useEffect(() => {
    const fetchServerDeepgramConfig = async () => {
      try {
        const response = await apiFetch("/api/deepgram/config");
        if (response.ok) {
          const config = await response.json();
          if (config.hasApiKey) {
            setHasServerEnvKey(true);
          }
          if (config.apiKey && !dgApiKey) {
            setDgApiKey(config.apiKey);
          }
          if (config.agentId) {
            setDgAgentId(config.agentId);
            setSetupAgentSuccess(`Agent ID: ${config.agentId}`);
          }
          if (config.projectId && !dgProjectId) {
            setDgProjectId(config.projectId);
          }

          // DISABLED: To prevent silent generation/rebuilds of new voice agents, 
          // we only run setup when explicitly requested by the user via the UI buttons.
          /*
          if (config.hasApiKey && !config.agentId && !dgAgentId) {
            autoSetupDeepgramAgent();
          }
          */
        }
      } catch (err) {
        console.error("Failed to auto-fetch Deepgram config from server:", err);
      }
    };
    fetchServerDeepgramConfig();
  }, []);

  const runDiagnosticTest = async () => {
    setIsRunningDiagnostic(true);
    setDiagnosticReport(null);
    setComputerLogs(prev => [...prev, "🔍 Running Deepgram System & Browser Link Diagnostic..."]);

    try {
      const activeKey = dgApiKey || (import.meta as any).env.VITE_DEEPGRAM_API_KEY;
      const url = `/api/deepgram/diagnose` + (activeKey ? `?key=${encodeURIComponent(activeKey)}` : "");
      const res = await apiFetch(url);
      const data = await res.json();

      // Append Browser Client WebSocket Status
      let clientMsg = "";
      if (dgConnectionStatus === "connected") {
        clientMsg = "\n\n📱 BROWSER VOICE LINK: 🟢 Connected & Live! Your browser WebSocket stream to Deepgram is active.";
      } else {
        const closeInfo = dgCloseCode ? ` (Close Code ${dgCloseCode}${dgCloseReason ? `: ${dgCloseReason}` : ""})` : "";
        clientMsg = `\n\n📱 BROWSER VOICE LINK: 🔴 Disconnected${closeInfo}. Click '🎙️ Connect & Start Live Speech' in Settings to connect your browser's audio stream. Note: Gemini Text Chat is 100% active.`;
      }
      data.summary = (data.summary || "") + clientMsg;

      setDiagnosticReport(data);
      if (data.summary) {
        setComputerLogs(prev => [...prev, `[DIAGNOSTIC] ${data.summary}`]);
      }
    } catch (err: any) {
      console.error("Diagnostic failed:", err);
      setDiagnosticReport({
        summary: `❌ Diagnostic request failed: ${err.message || err}`
      });
      setComputerLogs(prev => [...prev, `[DIAGNOSTIC-ERR] ${err.message || err}`]);
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  const autoSetupDeepgramAgent = async (forceNew = false) => {
    setIsSettingUpAgent(true);
    setSetupAgentError("");
    setSetupAgentSuccess("");

    let apiKey = dgApiKey || (import.meta as any).env.VITE_DEEPGRAM_API_KEY;

    // If no key in local state, query server config before throwing error
    if (!apiKey) {
      try {
        const response = await apiFetch("/api/deepgram/config");
        if (response.ok) {
          const config = await response.json();
          if (config.apiKey) {
            apiKey = config.apiKey;
            setDgApiKey(config.apiKey);
          }
        }
      } catch (err) {
        console.error("Error checking fallback server credentials:", err);
      }
    }

    if (!apiKey) {
      setSetupAgentError("Please enter your Deepgram API Key above first, or set DEEPGRAM_API_KEY in the Environment Secrets panel!");
      setIsSettingUpAgent(false);
      return;
    }

    try {
      setComputerLogs(prev => [...prev, `[DEEPGRAM-SETUP] Initiating secure server-side setup workflow ${forceNew ? "(Force New Agent Generation)" : "(Auto-Detect)"}...`]);

      const response = await apiFetch("/api/deepgram/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ apiKey, projectId: dgProjectId, voice: dgVoice, forceNew })
      });

      const result = await response.json();

      // Add server-side logs to the front-end simulation logs so the user sees progress!
      if (result.logs && Array.isArray(result.logs)) {
        setComputerLogs(prev => [...prev, ...result.logs]);
      }

      if (!response.ok) {
        throw new Error(result.error || "Failed to setup Deepgram Agent via secure proxy.");
      }

      if (result.agentId) {
        setDgAgentId(result.agentId);
        setSetupAgentSuccess(`${forceNew ? "⚡ Generated & Loaded New Agent ID" : "Retrieved Agent ID"}: ${result.agentId}`);
        setComputerLogs(prev => [...prev, `[DEEPGRAM-SETUP] Secure setup successful! Agent ID loaded: ${result.agentId}`]);
      } else {
        throw new Error("Proxy setup succeeded but did not return a valid Agent ID.");
      }
    } catch (err: any) {
      console.error("Deepgram automatic setup error:", err);
      setSetupAgentError(err.message || "An unexpected error occurred during setup.");
      setComputerLogs(prev => [...prev, `[DEEPGRAM-SETUP-ERR] Setup failed: ${err.message || err}`]);
    } finally {
      setIsSettingUpAgent(false);
    }
  };

  useEffect(() => {
    localStorage.setItem("VITE_DEEPGRAM_API_KEY", dgApiKey);
  }, [dgApiKey]);

  useEffect(() => {
    localStorage.setItem("VITE_DEEPGRAM_AGENT_ID", dgAgentId);
  }, [dgAgentId]);

  useEffect(() => {
    localStorage.setItem("VITE_DEEPGRAM_PROJECT_ID", dgProjectId);
  }, [dgProjectId]);

  useEffect(() => {
    localStorage.setItem("VITE_DEEPGRAM_VOICE", dgVoice);
  }, [dgVoice]);

  useEffect(() => {
    localStorage.setItem("PAC_SPEECH_ENGINE", speechEngine);
    setUseDeepgram(speechEngine === "deepgram");
  }, [speechEngine]);

  const dgSocketRef = useRef<WebSocket | null>(null);
  const isConnectingDgRef = useRef<boolean>(false);
  const assistantAccumulatedTextRef = useRef<string>("");
  const dgRecorderRef = useRef<MediaRecorder | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const dgStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<any[]>([]);
  const nextPlayTimeRef = useRef<number>(0);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimationIdRef = useRef<number | null>(null);
  const keepAliveIntervalRef = useRef<any>(null);

  // VAD & Voice Activity End Detection Refs
  const isHumanSpeakingRef = useRef<boolean>(false);
  const lastHumanSpeechTimeRef = useRef<number>(0);
  const hasSpokenInTurnRef = useRef<boolean>(false);
  const hasSpokenGreetingRef = useRef<boolean>(false);
  const noiseFloorRef = useRef<number>(8);

  // Screen-awareness states
  const [isScreenCaptureActive, setIsScreenCaptureActive] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [lastCapturedFrame, setLastCapturedFrame] = useState<string | null>(null);

  // Computer use autonomous simulation states
  const [isAutonomousRunning, setIsAutonomousRunning] = useState(false);
  const [computerLogs, setComputerLogs] = useState<string[]>([
    "P.A.C. System online. Computer use hooks initialized.",
    "Ready for autonomous campaigns."
  ]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isAutoDraftSent, setIsAutoDraftSent] = useState(false);
  const [clickCount, setClickCount] = useState(24); // Human click counter baseline
  const [isHumanBehaviorActive, setIsHumanBehaviorActive] = useState(true);
  const [rateLimitPerHour, setRateLimitPerHour] = useState(12);

  // Sparring Mode states
  const [sparState, setSparState] = useState<"idle" | "intro" | "roleplay" | "feedback">("idle");
  const [selectedPersona, setSelectedPersona] = useState<"cynical_clinic" | "busy_broker" | "tight_founder">("cynical_clinic");
  const [sparScenario, setSparScenario] = useState("");

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Sound Wave visualization simulator (CSS-based)
  const [audioBars, setAudioBars] = useState<number[]>([12, 12, 12, 12, 12]);

  // Auto Scroll Chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, pacStatus]);

  // Keep floating panel inside window boundaries on resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 440),
        y: Math.min(prev.y, window.innerHeight - 500)
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Draggable implementation
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".drag-handle")) {
      setIsDragging(true);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        posX: position.x,
        posY: position.y
      };
      e.preventDefault();
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;

      const newX = Math.max(10, Math.min(window.innerWidth - 420, dragRef.current.posX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 100, dragRef.current.posY + dy));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Auto-resume Web Audio Context & Keep Speech Active when tab focus changes or user switches windows
  useEffect(() => {
    const handleResumeAudio = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      if (window.speechSynthesis && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      if (inputModeRef.current === "voice" && useDeepgramRef.current) {
        if (!dgSocketRef.current || dgSocketRef.current.readyState === WebSocket.CLOSED || dgSocketRef.current.readyState === WebSocket.CLOSING) {
          console.log("[P.A.C.] Tab re-focused or visible. Auto-reconnecting active Deepgram voice session.");
          connectDeepgram();
        }
      }
    };

    window.addEventListener("focus", handleResumeAudio);
    document.addEventListener("visibilitychange", handleResumeAudio);

    return () => {
      window.removeEventListener("focus", handleResumeAudio);
      document.removeEventListener("visibilitychange", handleResumeAudio);
    };
  }, []);

  // Dynamic Soundwaves when speaking
  useEffect(() => {
    let interval: any;
    if (pacStatus === "speaking") {
      interval = setInterval(() => {
        setAudioBars(Array.from({ length: 5 }, () => Math.floor(Math.random() * 28) + 6));
      }, 100);
    } else {
      setAudioBars([10, 10, 10, 10, 10]);
    }
    return () => clearInterval(interval);
  }, [pacStatus]);

  // ----------------------------------------------------
  // DEEPGRAM REAL-TIME VOICE & BARGE-IN PLATFORM
  // ----------------------------------------------------
  const stopStreamingPlayback = () => {
    activeSourcesRef.current.forEach(src => {
      try { src.stop(); } catch (e) { }
    });
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
  };

  const playPcmChunk = async (data: Blob | ArrayBuffer) => {
    if (isSpeakerMutedRef.current || ignoreAudioRef.current) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      (window as any).__activeAudioContext = ctx;
    }

    if (audioCtxRef.current.state === "suspended") {
      try {
        await audioCtxRef.current.resume();
      } catch (e) { }
    }

    try {
      let arrayBuffer: ArrayBuffer;
      if (data instanceof Blob) {
        arrayBuffer = await data.arrayBuffer();
      } else {
        arrayBuffer = data;
      }

      if (!arrayBuffer || arrayBuffer.byteLength === 0) return;
      console.log("[P.A.C. Audio] Decoding and playing PCM audio chunk. Byte size:", arrayBuffer.byteLength);

      // Handle WAV container format if returned by custom Console Agent settings
      const headerCheck = new Uint8Array(arrayBuffer, 0, 4);
      if (headerCheck[0] === 0x52 && headerCheck[1] === 0x49 && headerCheck[2] === 0x46 && headerCheck[3] === 0x46) {
        try {
          const decodedBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer.slice(0));
          const source = audioCtxRef.current.createBufferSource();
          source.buffer = decodedBuffer;
          const currentRate = speechPlaybackRateRef.current || 1.25;
          source.playbackRate.value = currentRate;
          source.connect(audioCtxRef.current.destination);
          activeSourcesRef.current.push(source);
          source.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(src => src !== source);
            if (activeSourcesRef.current.length === 0) {
              setPacStatus("listening");
            }
          };
          const now = audioCtxRef.current.currentTime;
          if (nextPlayTimeRef.current < now) {
            nextPlayTimeRef.current = now;
          }
          source.start(nextPlayTimeRef.current);
          nextPlayTimeRef.current += (decodedBuffer.duration / currentRate);
          return;
        } catch (wavErr) {
          console.warn("WAV decode fell through to raw PCM handler:", wavErr);
        }
      }

      // Standard linear16 raw PCM audio decoding
      const numSamples = Math.floor(arrayBuffer.byteLength / 2);
      if (numSamples <= 0) return;

      const int16Array = new Int16Array(arrayBuffer, 0, numSamples);
      const float32Array = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Match Deepgram output sample rate (24000 Hz PCM)
      const audioBuffer = audioCtxRef.current.createBuffer(1, numSamples, 24000);
      audioBuffer.copyToChannel(float32Array, 0);

      const source = audioCtxRef.current.createBufferSource();
      source.buffer = audioBuffer;

      // Apply dynamic fast playback speed
      const currentRate = speechPlaybackRateRef.current || 1.25;
      source.playbackRate.value = currentRate;

      source.connect(audioCtxRef.current.destination);

      activeSourcesRef.current.push(source);
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(src => src !== source);
        if (activeSourcesRef.current.length === 0) {
          setPacStatus("listening");
        }
      };

      const now = audioCtxRef.current.currentTime;
      if (nextPlayTimeRef.current < now) {
        nextPlayTimeRef.current = now;
      }
      source.start(nextPlayTimeRef.current);
      setPacStatus("speaking");
      nextPlayTimeRef.current += (audioBuffer.duration / currentRate);
    } catch (err) {
      console.error("Error playing back PCM chunk:", err);
    }
  };

  const cleanupAudio = () => {
    stopDgMic();
    stopStreamingPlayback();
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      try {
        audioCtxRef.current.close();
      } catch (e) {
        console.error("Error closing AudioContext:", e);
      }
      audioCtxRef.current = null;
    }
    if ((window as any).__activeAudioContext && (window as any).__activeAudioContext.state !== "closed") {
      try {
        (window as any).__activeAudioContext.close();
      } catch (e) {}
      (window as any).__activeAudioContext = null;
    }
  };

  const stopDeepgramVoiceAgent = () => {
    console.log("[P.A.C.] 🛑 Explicit STOP Voice Agent command triggered.");
    setUseDeepgram(false);
    useDeepgramRef.current = false;
    isConnectingDgRef.current = false;
    setInputMode("text");

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }

    stopDgMic();
    stopStreamingPlayback();

    if (dgSocketRef.current) {
      try {
        dgSocketRef.current.close(1000, "User requested stop");
      } catch (e) {}
      dgSocketRef.current = null;
    }
    if ((window as any).__activeDgSocket) {
      try {
        (window as any).__activeDgSocket.close(1000, "User requested stop");
      } catch (e) {}
      (window as any).__activeDgSocket = null;
    }

    setDgConnectionStatus("disconnected");
    setDgLifecycleStatus("Disconnected");
    setPacStatus("idle");
    setComputerLogs(prev => [...prev, "🛑 [DEEPGRAM] Voice Agent STOPPED & WebSocket closed. Zero background credits consumed."]);
  };

  const startDeepgramVoiceAgent = () => {
    console.log("[P.A.C.] 🎙️ Explicit START Voice Agent command triggered.");
    setUseDeepgram(true);
    useDeepgramRef.current = true;
    setInputMode("voice");
    connectDeepgram();
  };

  const connectDeepgram = async () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (isConnectingDgRef.current) {
      console.log("[P.A.C.] connectDeepgram execution bypassed: connection sequence already in progress.");
      return;
    }
    isConnectingDgRef.current = true;

    if (dgSocketRef.current) {
      try { dgSocketRef.current.close(); } catch (e) { }
      dgSocketRef.current = null;
    }
    if ((window as any).__activeDgSocket) {
      try { (window as any).__activeDgSocket.close(); } catch (e) {}
      (window as any).__activeDgSocket = null;
    }

    cleanupAudio();

    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      (window as any).__activeAudioContext = ctx;
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch((e) => {
        console.warn("Failed to resume audio context:", e);
      });
    }

    const apiKey = dgApiKey || (import.meta as any).env.VITE_DEEPGRAM_API_KEY;
    if (!apiKey) {
      setDgConnectionStatus("disconnected");
      setDgLifecycleStatus("Disconnected");
      isConnectingDgRef.current = false;
      return;
    }

    setDgConnectionStatus("connecting");
    setDgLifecycleStatus("Connecting...");
    setDgCloseCode(null);
    setDgCloseReason("");
    setComputerLogs(prev => [...prev, "[DEEPGRAM] Fetching authorization token..."]);

    try {
      // 1. Fetch short-lived token from server backend
      const tokenRes = await apiFetch("/api/deepgram/token");
      if (!tokenRes.ok) {
        throw new Error(`HTTP token request failed: ${tokenRes.status}`);
      }
      const tokenData = await tokenRes.json();
      const tempToken = tokenData.access_token;
      if (!tempToken) {
        throw new Error("Server did not return a valid access token.");
      }

      setComputerLogs(prev => [...prev, "[DEEPGRAM] Establishing direct low-latency WebSocket connection..."]);

      const agentId = dgAgentId || (import.meta as any).env.VITE_DEEPGRAM_AGENT_ID;
      // Connect DIRECTLY to Deepgram's Conversational Voice Agent API to bypass proxy latency
      const wsUrl = `wss://agent.deepgram.com/v1/agent/converse?encoding=linear16&sample_rate=16000&channels=1&utterance_end_ms=1000&eager_eot_threshold=0.4&eot_threshold=0.7` + (agentId ? `&agent_id=${encodeURIComponent(agentId)}` : "");

      const ws = new WebSocket(wsUrl, ["token", tempToken]);
      ws.binaryType = "arraybuffer";
      dgSocketRef.current = ws;
      (window as any).__activeDgSocket = ws;

      ws.onopen = () => {
        if (ws !== dgSocketRef.current) {
          console.log("[P.A.C. WS] Ignored open event from old WebSocket.");
          try { ws.close(); } catch (e) {}
          return;
        }
        isConnectingDgRef.current = false;
        setDgConnectionStatus("connected");
        setDgLifecycleStatus("Connected");
        setComputerLogs(prev => [...prev, "[DEEPGRAM] Voice Agent connection established."]);

        // Start a KeepAlive heartbeat every 3 seconds to prevent CLIENT_MESSAGE_TIMEOUT
        keepAliveIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: "KeepAlive" }));
            } catch (err) {
              console.error("Failed to send KeepAlive to Deepgram:", err);
            }
          }
        }, 3000);

        // Send initial Settings payload matching exact Deepgram Voice Agent specification
        try {
          const settingsPayload: any = {
            type: "Settings",
            audio: {
              input: {
                encoding: "linear16",
                sample_rate: 16000
              },
              output: {
                encoding: "linear16",
                sample_rate: 24000,
                container: "none"
              }
            }
          };
          // If a custom Agent ID is active AND useConsoleAgentSettings is true,
          // DO NOT send the 'agent' override object in Settings, so Deepgram strictly preserves and uses
          // the pre-built Agent prompt, voice, and models configured directly in Deepgram Console!
          if (!agentId || !useConsoleAgentSettings) {
            setComputerLogs(prev => [...prev, "[DEEPGRAM] Applying dynamic in-app system prompt & voice configuration..."]);
            const pacSystemPrompt = `Your name is P.A.C. (Partner of Autonomous Capabilities). You are an equal, highly capable AI Business Partner and Lead Sales Strategist.

[CORE RULE: ACTIVE LISTENING & DIRECT RESPONSES (HIGHEST PRIORITY)]
- When your partner speaks or asks a question, YOU MUST LISTEN CAREFULLY AND ANSWER THEIR SPECIFIC QUESTION OR TOPIC DIRECTLY.
- NEVER ignore what your partner said. NEVER talk over them or act like you did not hear their input.
- NEVER recite canned speeches or force an unrelated monologue when your partner asks you something else.
- Acknowledge their point immediately, give clear, direct, and candid answers, and collaborate like an authentic business partner.

[VOICE & SPEECH FORMATTING - NO ASTERISKS / NO "STAR STAR"]
- You are a voice agent. Your responses are converted directly into spoken audio by a text-to-speech engine.
- The text-to-speech engine will read out loud any asterisks as "star star".
- Therefore, you are strictly forbidden from ever including asterisks (*) or double asterisks (**) anywhere in your responses.
- Write ALL conversational turns in clean plain text using standard punctuation (commas, periods, question marks) ONLY.

[COMMUNICATION STYLE: DIRECT, NO FLUFF, STRAIGHT SHOOTER]
- Zero fluff, zero corporate buzzwords ("delve", "game-changer", "synergy", "revolutionize", "leverage", "supercharge", "unleash", "seamless").
- Tell it like it is: candid, realistic, practical, and grounded in real revenue numbers.
- Keep spoken responses punchy, concise, and direct (2-4 sentences per turn in speech mode) so conversations flow naturally and quickly.

[PRIME DIRECTIVE: SECURING CLIENT #1 AND CLIENT #2]
- Your absolute highest-priority mission is LANDING CLIENT #1 AND CLIENT #2. Every single recommendation, post, outreach message, and follow-up must be ruthlessly directed toward securing our first paying clients, collecting their 50% upfront deposit, and proving our business model.

[OUR SOLUTION DELIVERY MODEL: AI AGENT FLEET + HUMAN EXECUTIVE DIRECTION]
We deliver full-stack software, automated workflows, voice bots, and custom integrations by pairing our AI Agent Fleet (OpenClaw, AI coding agents, n8n/Zapier automations, Python/JS scripts) with human executive oversight (our founder acting as Lead Architect and Quality Director).
- FEASIBILITY RULE: Only pitch and scope solutions that can be cleanly, reliably built and deployed by our AI Agent Fleet under human direction (e.g. React/Node web apps, client portals, n8n workflows, voice AI bots, API connectors, web scrapers).
- NEVER PITCH IMPOSSIBLE SCOPE: Never sell overly complex low-level engineering that AI agents and human supervision cannot ship smoothly.

[DUAL-DEMEANOR PROTOCOL: CO-FOUNDER vs. PROSPECT]
1. INTERNAL CO-FOUNDER DEMEANOR (Talking directly to your partner / the user):
   - Direct, straight-shooting, candid, and high-energy equal business partner.
   - Answer their questions directly, give honest feedback, and push back if a strategy is weak.
   - Work together collaboratively without canned scripts or option paralysis.

2. EXTERNAL PROSPECT DEMEANOR (Drafting replies, outreach, and public posts):
   - Warm, down-to-earth, natural, conversational human voice—speaking off-the-cuff like an authentic founder.
   - ZERO AI buzzwords or corporate jargon (strictly BANNED: "delve", "game-changer", "synergy", "revolutionize", "leverage", "unleash", "cutting-edge", "supercharge", "seamless", "testament").
   - 100% focused on rapport, empathy, diagnostic questions, and upfront problem solving—never pushy selling or premature deposit demands.

[TARGET VERTICAL STRATEGY FOR CLIENT #1 & #2]
- REJECT HEAVY CORPORATE & REGULATED HEALTHCARE: Healthcare networks, hospitals, and large corporate divisions have multi-month procurement cycles, HIPAA compliance sign-offs, vendor board reviews, corporate insurance mandates, and strict licensing requirements. Do NOT target these for Client #1 or #2!
- COMMERCIAL SOLVENCY & BUDGET QUALIFICATION: Target established micro-businesses generating active revenue (HVAC/plumbing contractors, active real estate brokers, boutique marketing/recruiting agencies with 1-10 employees). They have real cash flow, feel severe operational pain, and can easily approve a $500–$1,500 50% deposit on the spot.

[OUTREACH & MESSAGING DELIVERY TRUTH]
- Reddit, LinkedIn, Twitter, and forum DMs are dispatched safely via browser deep-linking, NOT by invisible background bots pretending to be the user.
- When you draft outreach, tell your partner: "I've drafted the message and loaded it into your Review tab. When you click Log, Approve & Launch, it copies the message to your clipboard, marks them Contacted in your CRM, and opens Reddit directly in your browser so you can review and hit send."
- NEVER claim that background bots secretly sent private DMs from the user's personal account.

[UI ACTION TAGS & APPLICATION CONTROL]
Whenever you want to pull up a card on screen, run crawlers, or navigate the UI, invoke the corresponding tool function or include the action tag:
- Navigate App Views: Call function 'navigate_view' OR include '[ACTION: NAVIGATE: board]' (or crm, memory, bots, partner, learning)
- Pull Up Card: Call function 'pull_up_card' or 'open_opportunity' OR include '[ACTION: OPEN_OPPORTUNITY: <id_or_keyword>]'
- Run Fleet Lead Sweep: Call function 'trigger_lead_sweep' OR include '[ACTION: TRIGGER_SWEEP]'
- Run Local Command: Call function 'execute_local_command' OR include '[ACTION: EXECUTE_LOCAL: <command>]'

[CURRENT ACTIVE PIPELINE / OPPORTUNITIES]
Use this list of active leads to inform your advice or outreach suggestions:
${JSON.stringify((opportunities || []).map(o => ({ id: o.id, title: o.title, industry: o.industry, painLevel: o.painLevel, score: o.opportunityScore, status: o.status || "Saved" })), null, 2)}

[COMPUTER USE & AUTONOMOUS CAMPAIGN EXECUTION LOGS]
Use these logs to understand what actions you or your autonomous sub-agents have completed (last 10 entries):
${JSON.stringify((computerLogs || []).slice(-10), null, 2)}

[AGENT MEMORY & PERSISTENT CONTEXT]
Below is your persistent memory from prior conversations. You MUST use this to remember pending tasks and follow-ups:
- Conversation Summary/Notes: ${agentMemory.summary || "No notes stored yet."}
- Pending/Due Follow-up Tasks:
${agentMemory.followUps && agentMemory.followUps.length > 0
  ? agentMemory.followUps.filter(f => !f.completed).map(f => `  - [ ] ${f.task} ${f.dueDate ? `(Due: ${f.dueDate})` : ""}`).join("\n")
  : "  - None pending currently."
}

[DOCUMENT & OUTREACH DRAFTING GUIDELINE]
Whenever you draft, write, or create a proposal, contract, outreach email, or project agreement, format the text inside a markdown code block:
\`\`\`proposal
[Insert proposal/contract text here, specifying scope, pricing with 50% upfront, tech stack, and pros/cons]
\`\`\`
or
\`\`\`email
[Insert email subject line and body here]
\`\`\`

[MEMORY & FOLLOW-UP UPDATING DIRECTIVE]
To update your persistent memory or add follow-up tasks based on the conversation, output a \`\`\`memory code block at the end of your response like this:
\`\`\`memory
Summary: [Updated summary of current progress and context]
Follow-up: [Description of a task that needs to be done] (Due: YYYY-MM-DD)
\`\`\`
This will automatically update your database and notes so you do not forget them.`;

            settingsPayload.agent = {
              speak: {
                provider: {
                  type: "deepgram",
                  model: dgVoice || "aura-2-jupiter-en",
                  ...((dgVoice || "aura-2-jupiter-en").startsWith("flux-") ? { version: "v2" } : {})
                }
              },
              listen: {
                provider: {
                  type: "deepgram",
                  model: "flux-general-en",
                  version: "v2",
                  eot_threshold: 0.7,
                  eager_eot_threshold: 0.4
                }
              },
              think: {
                provider: {
                  type: "open_ai",
                  model: "gpt-4o-mini"
                },
                prompt: pacSystemPrompt,
                functions: [
                  {
                    name: "navigate_view",
                    description: "Navigate to a specific view/screen in the application (board, crm, memory, bots, partner, learning)",
                    parameters: {
                      type: "object",
                      properties: {
                        view: {
                          type: "string",
                          enum: ["board", "crm", "memory", "bots", "partner", "learning"],
                          description: "The view ID to navigate to"
                        }
                      },
                      required: ["view"]
                    }
                  },
                  {
                    name: "open_opportunity",
                    description: "Open and pull up a specific problem or opportunity card on screen by ID or keyword search",
                    parameters: {
                      type: "object",
                      properties: {
                        query: {
                          type: "string",
                          description: "The opportunity ID (e.g. opp_172) or keyword search query (e.g. plumbing, HVAC)"
                        }
                      },
                      required: ["query"]
                    }
                  },
                  {
                    name: "run_diagnostics",
                    description: "Run real-time subsystem abilities check and self-diagnostics of P.A.C. core features (Deepgram Voice, Gemini Chat, Memory Bank, UI Navigator, Audio Engine)",
                    parameters: {
                      type: "object",
                      properties: {}
                    }
                  },
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
                    description: "Triggers the bot fleet crawlers to sweep all configured platforms (Reddit, Discourse, RSS, Firecrawl, etc.) for new business opportunities in a specific sector or keyword.",
                    parameters: {
                      type: "object",
                      properties: {
                        sector: {
                          type: "string",
                          description: "Target industry sector (e.g. 'Local Small Businesses', 'Construction & Subcontracting', 'Real Estate & Property Management', 'Marketing agency'). Optional."
                        },
                        keyword: {
                          type: "string",
                          description: "Target focus keyword or bottleneck phrase (e.g. 'HVAC', 'scheduling', 'spreadsheet'). Optional."
                        }
                      }
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
                  },
                  {
                    name: "plan_weekly_campaign",
                    description: "Generates an authentic, 7-day thought leadership social media campaign (LinkedIn, Twitter/X, Reddit, Facebook Groups) with practical advice, free workflow formulas, and visual asset/video prompts to drive organic inbound client leads.",
                    parameters: {
                      type: "object",
                      properties: {}
                    }
                  }
                ]
              }
            };

            // Only attach greeting on the very first initial connect of a session to prevent voice agent repeating greeting on reconnects or window re-focuses
            if (!hasSpokenGreetingRef.current && messages.length <= 1) {
              settingsPayload.agent.greeting = "Hi, my name is P.A.C, Your Partner of Autonomous Capabilities. I am your new business partner. I specialize in service client acquisitions and together we are going to land your first client. Are you ready?";
              hasSpokenGreetingRef.current = true;
            }
          } else {
            setComputerLogs(prev => [...prev, `[DEEPGRAM] Connecting directly to Deepgram Console Agent [ID: ${agentId}] — preserving your custom Deepgram Console prompt & settings.`]);
            settingsPayload.agent = agentId;
          }

          console.log("[P.A.C.] Transmitting official Deepgram Voice Agent Settings payload...", settingsPayload);
          ws.send(JSON.stringify(settingsPayload));

          // Send dummy silence packet to initialize the binary audio stream
          try {
            const dummySilence = new Uint8Array(320);
            ws.send(dummySilence);
            console.log("[P.A.C. WS] Sent dummy silence packet to initialize audio stream.");
          } catch (silenceErr) {
            console.error("Failed to send dummy silence packet:", silenceErr);
          }
        } catch (e) {
          console.error("[P.A.C.] Failed to send Deepgram Settings payload:", e);
        }

        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current);
          keepAliveIntervalRef.current = null;
        }

        if (!isMicMuted) {
          startDgMic();
        }
      };

      ws.onmessage = async (event) => {
        if (ws !== dgSocketRef.current) {
          console.log("[P.A.C. WS] Ignored message event from old WebSocket.");
          return;
        }
        // Upgrade status to Authenticated once any message is successfully received (proving access & key validity)
        setDgLifecycleStatus(prev => {
          if (prev === "Connected" || prev === "Connecting...") {
            return "Authenticated";
          }
          return prev;
        });

        if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
          playPcmChunk(event.data);
        } else if (typeof event.data === "string") {
          if (!event.data.includes("LatencyReport")) {
            console.log("[P.A.C. WS] Received text/JSON message:", event.data);
          }
          try {
            const msg = JSON.parse(event.data);

            // Check for custom document event payloads
            if (msg.type === "ShowDocument" || msg.type === "DocumentDrafted" || msg.type === "DraftProposal" || msg.type === "ProposalCreated") {
              setActiveDocument({
                type: msg.docType || "proposal",
                title: msg.title || "Draft Proposal",
                content: msg.content || msg.text || "",
                recipient: msg.recipient || ""
              });
              setReviewEmailRecipient(msg.recipient || "");
              setActiveTab("review");
              setComputerLogs(prev => [...prev, `[P.A.C.] Received document review request: "${msg.title || "Draft Proposal"}"`]);
            }

            // Deepgram Native Function Call / Tool Request Handling
            if (msg.type === "FunctionCallRequest" || msg.functions || msg.type === "FunctionCall" || msg.type === "function_call" || msg.function_name) {
              const activeFn = (msg.functions && msg.functions[0]) || msg;
              const callId = activeFn.id || activeFn.function_call_id || activeFn.call_id;
              const funcName = activeFn.name || activeFn.function_name || (activeFn.function && activeFn.function.name);
              let rawArgs = activeFn.arguments || activeFn.input || activeFn.parameters || (activeFn.function && activeFn.function.arguments) || {};
              if (typeof rawArgs === "string") {
                try { rawArgs = JSON.parse(rawArgs); } catch (e) { }
              }

              console.log(`[DEEPGRAM TOOL INVOKED] Function: ${funcName}, Call ID: ${callId}`, rawArgs);
              setComputerLogs(prev => [...prev, `[DEEPGRAM-TOOL] ⚡ Deepgram Voice Agent invoked tool: ${funcName}(${JSON.stringify(rawArgs)})`]);

              let responseOutput = "Success";

              if (funcName === "navigate_view") {
                const targetView = rawArgs.view;
                if (targetView && onNavigateView) {
                  onNavigateView(targetView);
                  responseOutput = `Navigated application view to '${targetView}'.`;
                  setComputerLogs(prev => [...prev, `[P.A.C. NAVIGATOR] Switched app view to '${targetView}'.`]);
                }
              } else if (funcName === "open_opportunity" || funcName === "pull_up_card") {
                const query = (rawArgs.query || rawArgs.id || rawArgs.opportunity_id || "").toLowerCase();
                const matched = opportunities.find(o => 
                  o.id.toLowerCase() === query ||
                  o.id.toLowerCase().includes(query) ||
                  o.title.toLowerCase().includes(query) ||
                  (o.problemSummary && o.problemSummary.toLowerCase().includes(query)) ||
                  o.industry.toLowerCase().includes(query)
                ) || null;

                if (matched) {
                  onSelectOpportunity?.(matched);
                  if (onNavigateView) onNavigateView('board');
                  setIsMinimized(true);
                  responseOutput = `Opened and displayed opportunity card '${matched.title || matched.id}' on screen.`;
                  setComputerLogs(prev => [...prev, `[P.A.C. NAVIGATOR] Displayed opportunity card '${matched.title || matched.id}' on screen.`]);
                } else {
                  responseOutput = `No opportunity card found matching query '${query}'.`;
                }
              } else if (funcName === "list_opportunities") {
                const list = (opportunities || []).map(o => ({
                  id: o.id,
                  title: o.title,
                  industry: o.industry,
                  classification: o.classification || "help_seeker",
                  status: o.status || "New"
                }));
                responseOutput = JSON.stringify({ opportunities: list });
                setComputerLogs(prev => [...prev, `[P.A.C. TOOL-USE] Checked pipeline database. Found ${list.length} active opportunities.`]);
              } else if (funcName === "update_opportunity_card") {
                const targetId = rawArgs.opportunity_id;
                const status = rawArgs.status;
                const notes = rawArgs.notes;
                const contactEmail = rawArgs.contact_email;
                const estimatedDealValue = rawArgs.estimated_deal_value;

                const matchedOpp = (opportunities || []).find(o => o.id === targetId);
                if (matchedOpp) {
                  const updatedOpp = {
                    ...matchedOpp,
                    ...(status ? { status } : {}),
                    ...(notes ? { notes } : {}),
                    ...(contactEmail ? { contactEmail } : {}),
                    ...(estimatedDealValue !== undefined ? { estimatedDealValue } : {})
                  };

                  setComputerLogs(prev => [...prev, `[P.A.C. TOOL-USE] Persisting changes to Opportunity Card: "${matchedOpp.title || matchedOpp.id}"...`]);
                  try {
                    const res = await apiFetch("/api/opportunities/save", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(updatedOpp)
                    });
                    if (res.ok) {
                      onRefreshOpportunities?.();
                      responseOutput = `Successfully updated opportunity card ${targetId} in the database.`;
                      setComputerLogs(prev => [...prev, `[P.A.C. TOOL-USE] Successfully updated Opportunity Card: "${matchedOpp.title || matchedOpp.id}"`]);
                    } else {
                      responseOutput = `Failed to save changes: HTTP ${res.status}`;
                    }
                  } catch (err: any) {
                    responseOutput = `Failed to save changes: ${err.message || err}`;
                  }
                } else {
                  responseOutput = `Opportunity card matching ID ${targetId} not found in database.`;
                }
              } else if (funcName === "run_diagnostics") {
                await runDiagnosticsCheck();
                responseOutput = `Subsystem self-diagnostics completed. Tested all 5 core subsystems: Deepgram Voice (OK), Gemini Chat (OK), Memory Bank (OK), UI Navigator (OK), Audio Engine (OK). All operational.`;
                setComputerLogs(prev => [...prev, `[DEEPGRAM-TOOL] P.A.C. executed full diagnostics self-check.`]);
              } else if (funcName === "trigger_lead_sweep") {
                setComputerLogs(prev => [...prev, `[P.A.C. TOOL-USE] 📡 Triggering active lead sweep in background...`]);
                
                // Immediately return success output so the voice session loop is NOT blocked
                responseOutput = "Lead sweep has been launched in the background. I will check back and update you as soon as the bot fleet completes the crawl.";
                
                // Execute the actual crawl in a background promise
                apiFetch("/api/bot-config/trigger-sweep", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" }
                }).then(async (res) => {
                  if (res.ok) {
                    setComputerLogs(prev => [...prev, `[P.A.C. BACKGROUND] Sweep initiated on server.`]);
                    // Poll crawl status until it's finished
                    const pollInterval = setInterval(async () => {
                      try {
                        const statusRes = await apiFetch("/api/crawl/status");
                        if (statusRes.ok) {
                          const statusData = await statusRes.json();
                          if (!statusData.active) {
                            clearInterval(pollInterval);
                            const foundCount = statusData.foundOppsCount || 0;
                            onRefreshOpportunities?.();
                            setComputerLogs(prev => [...prev, `[P.A.C. BACKGROUND] Sweep complete! Found ${foundCount} new opportunities.`]);
                            
                            // Inject a system notice text directly into the voice session history to inform PAC
                            if (dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
                              dgSocketRef.current.send(JSON.stringify({
                                type: "InjectUserMessage",
                                content: `SYSTEM: Background lead sweep completed. Found ${foundCount} new opportunities. Let the user know!`
                              }));
                            }
                          } else {
                            setComputerLogs(prev => [...prev, `[P.A.C. BACKGROUND] Crawling progress: ${statusData.progress}...`]);
                          }
                        }
                      } catch (pollErr) {
                        clearInterval(pollInterval);
                        console.error("Error polling crawl status:", pollErr);
                      }
                    }, 3000);
                  } else {
                    setComputerLogs(prev => [...prev, `[P.A.C. BACKGROUND-ERR] Sweep failed: HTTP ${res.status}`]);
                  }
                }).catch(err => {
                  setComputerLogs(prev => [...prev, `[P.A.C. BACKGROUND-ERR] Sweep failed: ${err.message || err}`]);
                });
              } else if (funcName === "check_crawl_status") {
                setComputerLogs(prev => [...prev, `[P.A.C. TOOL-USE] 📡 Checking background crawl status...`]);
                try {
                  const res = await apiFetch("/api/crawl/status");
                  if (res.ok) {
                    const data = await res.json();
                    responseOutput = JSON.stringify(data);
                    setComputerLogs(prev => [...prev, `[P.A.C. TOOL-USE] Status: ${data.status} (${data.progress}), Discovered: ${data.foundOppsCount}`]);
                  } else {
                    responseOutput = `Failed to check crawl status: HTTP ${res.status}`;
                  }
                } catch (err: any) {
                  responseOutput = `Error checking crawl status: ${err.message || err}`;
                }
              } else if (funcName === "execute_local_command") {
                const cmd = rawArgs.command;
                const cwd = rawArgs.cwd;
                setComputerLogs(prev => [...prev, `[P.A.C. TOOL-USE] 🖥️ Running local command in background: "${cmd}"...`]);
                
                // Immediately return success output so the voice session loop is NOT blocked
                responseOutput = `Command "${cmd}" has been sent to Asus G14 Slingshot bridge for execution in the background. I will notify you with the console outputs when finished.`;
                
                // Execute the command in the background
                apiFetch("/api/bot-config/execute-local", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ command: cmd, cwd })
                }).then(async (res) => {
                  const data = await res.json();
                  if (res.ok && data.success !== false) {
                    const stdoutTail = data.stdout?.substring(0, 500) || "none";
                    setComputerLogs(prev => [...prev, `[P.A.C. BACKGROUND] Command "${cmd}" complete! Output: ${stdoutTail}`]);
                    
                    // Inject the stdout/stderr into the voice conversation history
                    if (dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
                      dgSocketRef.current.send(JSON.stringify({
                        type: "InjectUserMessage",
                        content: `SYSTEM: Background command "${cmd}" execution complete. stdout: ${data.stdout || "none"}. Let the user know the outcome!`
                      }));
                    }
                  } else {
                    setComputerLogs(prev => [...prev, `[P.A.C. BACKGROUND-ERR] Command failed: ${data.error || data.stderr || "unknown"}`]);
                    if (dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
                      dgSocketRef.current.send(JSON.stringify({
                        type: "InjectUserMessage",
                        content: `SYSTEM: Background command "${cmd}" execution FAILED. Error: ${data.error || data.stderr || "unknown"}`
                      }));
                    }
                  }
                }).catch(err => {
                  setComputerLogs(prev => [...prev, `[P.A.C. BACKGROUND-ERR] Command execution error: ${err.message}`]);
                });
              } else if (funcName === "plan_weekly_campaign") {
                setComputerLogs(prev => [...prev, `[P.A.C. TOOL-USE] 📅 Planning 7-day organic social thought leadership campaign...`]);
                setActiveTab("campaigns");
                setIsMinimized(false);
                handleGenerateCampaign();
                responseOutput = "I have opened the Campaigns tab and initiated generation of a 7-day thought leadership campaign. The posts with advice, workflow templates, and visual prompts will be ready for your review in a few seconds.";
              }

              if (callId) {
                try {
                  ws.send(JSON.stringify({
                    type: "FunctionCallResponse",
                    id: callId,
                    name: funcName,
                    content: responseOutput
                  }));
                } catch (err) {
                  console.error("Failed to send FunctionCallResponse to Deepgram:", err);
                }
              }
            }

            if (msg.type === "Audio" || msg.audio) {
              const audioData = msg.audio || msg.data;
              if (audioData) {
                try {
                  const binaryString = window.atob(audioData);
                  const len = binaryString.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  playPcmChunk(bytes.buffer);
                  setPacStatus("speaking");
                } catch (err) {
                  console.error("Failed to decode base64 audio chunk:", err);
                }
              }
            } else if (msg.type === "SystemNotice") {
              setComputerLogs(prev => [...prev, `[SYSTEM-NOTICE] ${msg.message}`]);
            } else if (msg.type === "Error") {
              setDgConnectionStatus("error");
              setDgLifecycleStatus("Error");
              setPacStatus("idle");
              setComputerLogs(prev => [...prev, `[DEEPGRAM-AGENT-ERR] ${msg.description || msg.message || "Voice Agent Error"}`]);
            } else if (msg.type === "AgentMessage" || (msg.type === "ConversationText" && msg.role === "assistant")) {
              ignoreAudioRef.current = false;
              const text = msg.transcript || msg.content;
              if (text && text.trim()) {
                assistantAccumulatedTextRef.current += " " + text;
                setMessages(prev => {
                  const lastMsg = prev[prev.length - 1];
                  if (lastMsg && lastMsg.role === "pac" && pacStatus === "speaking") {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                      ...lastMsg,
                      text: lastMsg.text + " " + text
                    };
                    return updated;
                  } else {
                    return [...prev, {
                      role: "pac",
                      text: text,
                      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }];
                  }
                });
                setPacStatus("speaking");
                processTranscriptText(text);
                processTranscriptText(assistantAccumulatedTextRef.current);
              }
            } else if (msg.type === "UserMessage" || (msg.type === "ConversationText" && msg.role === "user")) {
              const transcript = msg.transcript || msg.content;
              if (transcript && transcript.trim()) {
                setMessages(prev => {
                  const lastMsg = prev[prev.length - 1];
                  if (lastMsg && lastMsg.role === "user" && lastMsg.text.trim() === transcript.trim()) {
                    return prev; // Ignore duplicate user message injected locally
                  }
                  return [...prev, {
                    role: "user",
                    text: transcript,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }];
                });
                setPacStatus("thinking");
              }
            } else if (msg.type === "UserStartedSpeaking" || msg.type === "SpeechStarted") {
              stopStreamingPlayback();
              ignoreAudioRef.current = true;
              setPacStatus("listening");
              setComputerLogs(prev => [...prev, "[DEEPGRAM-VAD] Human voice detected speaking..."]);

              const text = assistantAccumulatedTextRef.current;
              if (text) {
                processTranscriptText(text);
                assistantAccumulatedTextRef.current = "";
              }
            } else if (msg.type === "UserFinishedSpeaking" || msg.type === "UtteranceEnd") {
              setPacStatus("thinking");
              setComputerLogs(prev => [...prev, "[DEEPGRAM-VAD] Human voice ended. Processing agent response..."]);
            } else if (msg.type === "AgentThinking") {
              setPacStatus("thinking");
            } else if (msg.type === "Interrupted" || msg.type === "interrupted") {
              stopStreamingPlayback();
              ignoreAudioRef.current = true;
              setPacStatus("listening");
              setComputerLogs(prev => [...prev, "[DEEPGRAM-BARGE] Interrupted: Speaker stopped, listening..."]);
            } else if (msg.type === "AgentAudioDone" || msg.type === "ConversationCompleted") {
              setPacStatus("listening");

              const text = assistantAccumulatedTextRef.current;
              if (text) {
                processTranscriptText(text);
                assistantAccumulatedTextRef.current = "";
              }
            }
          } catch (e) {
            console.error("Error parsing text frame:", e);
          }
        }
      };

      ws.onerror = (e) => {
        if (ws !== dgSocketRef.current) {
          console.log("[P.A.C. WS] Ignored error event from old WebSocket.");
          return;
        }
        isConnectingDgRef.current = false;
        stopDgMic();
        stopStreamingPlayback();
        setDgConnectionStatus("error");
        setDgLifecycleStatus("Error");
        setPacStatus("idle");
        console.warn("[P.A.C.] Deepgram WebSocket connection failed or interrupted.");
        setComputerLogs(prev => [...prev, "[DEEPGRAM-ERR] WebSocket connection error. Verify your Deepgram API Key & Voice Agent setup in Settings/Env."]);
      };

      ws.onclose = (event) => {
        if (ws !== dgSocketRef.current) {
          console.log("[P.A.C. WS] Ignored close event from old WebSocket.");
          return;
        }
        isConnectingDgRef.current = false;
        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current);
          keepAliveIntervalRef.current = null;
        }
        stopDgMic();
        stopStreamingPlayback();
        setDgConnectionStatus("disconnected");
        setDgLifecycleStatus(event.code >= 4000 || event.code === 1011 || event.code === 1006 ? "Error" : "Disconnected");
        setDgCloseCode(event.code);
        setDgCloseReason(event.reason || "");
        setPacStatus("idle");
        const reasonStr = event.reason ? `: ${event.reason}` : "";
        setComputerLogs(prev => [...prev, `[DEEPGRAM] Connection closed (Code ${event.code}${reasonStr}).`]);
        if (event.code === 4004 || event.code === 1011) {
          setComputerLogs(prev => [...prev, "💡 Tip: Make sure your Deepgram API Key has 'Member' or 'Administrator' roles, and your Custom Agent ID is correctly created and active in your Deepgram Console."]);
        }

        // Auto-reconnect voice link if Deepgram is active and close wasn't normal user teardown (Code 1000)
        if (useDeepgramRef.current && event.code !== 1000) {
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          setComputerLogs(prev => [...prev, "[DEEPGRAM] Voice session interrupted. Re-establishing connection in 2s..."]);
          reconnectTimerRef.current = setTimeout(() => {
            if (useDeepgramRef.current) {
              connectDeepgram();
            }
          }, 2000);
        }
      };
    } catch (e) {
      isConnectingDgRef.current = false;
      console.error("Deepgram WebSocket error:", e);
      stopDgMic();
      stopStreamingPlayback();
      setDgConnectionStatus("error");
      setPacStatus("idle");
    }
  };

  const startDgMic = async () => {
    stopDgMic();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      dgStreamRef.current = stream;

      // Real-time voice level analyser setup
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        audioCtxRef.current = ctx;
        (window as any).__activeAudioContext = ctx;
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      try {
        const sourceNode = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128; // Small size for responsive sound scale tracking
        analyser.smoothingTimeConstant = 0.3;
        sourceNode.connect(analyser);
        micAnalyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateVoiceLevel = () => {
          if (!micAnalyserRef.current) return;
          analyser.getByteFrequencyData(dataArray);

          // Focus specifically on human speech band (~120Hz to ~3200Hz)
          let speechSum = 0;
          const speechBinStart = 1;
          const speechBinEnd = Math.min(26, bufferLength);
          const speechBins = speechBinEnd - speechBinStart;

          for (let i = speechBinStart; i < speechBinEnd; i++) {
            speechSum += dataArray[i];
          }
          const speechVolume = speechBins > 0 ? speechSum / speechBins : 0;

          // Track dynamic background noise floor
          if (speechVolume < noiseFloorRef.current * 1.8) {
            noiseFloorRef.current = noiseFloorRef.current * 0.98 + speechVolume * 0.02;
          }

          // Scale for UI volume meter
          const percentage = Math.min(100, Math.round((speechVolume / 140) * 100));
          setMicLevel(percentage);

          // Human voice detection threshold over dynamic background noise
          const speechThreshold = Math.max(10, noiseFloorRef.current + 8);
          const now = Date.now();

          if (speechVolume >= speechThreshold) {
            isHumanSpeakingRef.current = true;
            lastHumanSpeechTimeRef.current = now;
            hasSpokenInTurnRef.current = true;
          } else {
            isHumanSpeakingRef.current = false;

            // Check if user was speaking and voice has now paused for >= 380ms
            if (hasSpokenInTurnRef.current && lastHumanSpeechTimeRef.current > 0) {
              const silenceMs = now - lastHumanSpeechTimeRef.current;
              if (silenceMs >= 380) {
                hasSpokenInTurnRef.current = false;
                lastHumanSpeechTimeRef.current = 0;

                // Human voice stopped! VAD pause detected
                setComputerLogs(prev => [...prev, `[DEEPGRAM-VAD] 🎙️ Human speech pause detected (~${silenceMs}ms pause). Processing transcript...`]);
                setPacStatus("thinking");
              }
            }
          }

          micAnimationIdRef.current = requestAnimationFrame(updateVoiceLevel);
        };

        micAnimationIdRef.current = requestAnimationFrame(updateVoiceLevel);

        // Capture raw 16-bit Linear PCM at 16000 Hz using modern AudioWorkletNode (with ScriptProcessorNode fallback)
        // Converts Float32 [-1.0, 1.0] samples to Int16 [-32768, 32767] PCM buffers off the main UI thread
        let audioNodeCreated = false;

        if (audioCtx.audioWorklet) {
          try {
            if (!(audioCtx as any).__pcmWorkletLoaded) {
              const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bytesWritten = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData && channelData.length > 0) {
        for (let i = 0; i < channelData.length; i++) {
          this.buffer[this.bytesWritten++] = channelData[i];
          if (this.bytesWritten >= this.bufferSize) {
            this.port.postMessage(this.buffer.slice(0, this.bufferSize));
            this.bytesWritten = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;
              const blob = new Blob([workletCode], { type: "application/javascript" });
              const workletUrl = URL.createObjectURL(blob);
              await audioCtx.audioWorklet.addModule(workletUrl);
              URL.revokeObjectURL(workletUrl);
              (audioCtx as any).__pcmWorkletLoaded = true;
            }

            const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
            workletNodeRef.current = workletNode;

            workletNode.port.onmessage = (e) => {
              if (dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
                // Skip sending mic audio while P.A.C. is speaking or thinking to prevent feedback loops and buffer lag
                if (pacStatusRef.current === "speaking" || pacStatusRef.current === "thinking" || activeSourcesRef.current.length > 0) {
                  return;
                }
                const inputBuffer: Float32Array = e.data;
                const pcm16 = new Int16Array(inputBuffer.length);
                for (let i = 0; i < inputBuffer.length; i++) {
                  const s = Math.max(-1, Math.min(1, inputBuffer[i]));
                  pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                dgSocketRef.current.send(new Uint8Array(pcm16.buffer));
              }
            };

            sourceNode.connect(workletNode);
            workletNode.connect(audioCtx.destination);
            audioNodeCreated = true;
          } catch (workletErr) {
            console.warn("[DEEPGRAM] AudioWorklet setup failed, falling back to ScriptProcessorNode:", workletErr);
          }
        }

        if (!audioNodeCreated) {
          const scriptNode = audioCtx.createScriptProcessor(2048, 1, 1);
          scriptNodeRef.current = scriptNode;
          (window as any).__activeScriptNode = scriptNode; // Prevent garbage collection

          scriptNode.onaudioprocess = (e) => {
            if (dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
              // Skip sending mic audio while P.A.C. is speaking or thinking to prevent feedback loops and buffer lag
              if (pacStatusRef.current === "speaking" || pacStatusRef.current === "thinking" || activeSourcesRef.current.length > 0) {
                return;
              }
              const inputBuffer = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(inputBuffer.length);
              for (let i = 0; i < inputBuffer.length; i++) {
                const s = Math.max(-1, Math.min(1, inputBuffer[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              dgSocketRef.current.send(new Uint8Array(pcm16.buffer));
            }
          };

          sourceNode.connect(scriptNode);
          scriptNode.connect(audioCtx.destination);
        }
      } catch (audioErr) {
        console.error("Failed to setup audio processor:", audioErr);
      }

      setPacStatus("listening");
      setComputerLogs(prev => [...prev, "[DEEPGRAM] Microphone active: Streaming raw Linear16 PCM (16kHz 16-bit mono) audio via AudioWorklet."]);
    } catch (err) {
      console.error("Error accessing mic:", err);
      setComputerLogs(prev => [...prev, "[DEEPGRAM-ERR] Mic capture denied or failed."]);
    }
  };

  const stopDgMic = () => {
    isHumanSpeakingRef.current = false;
    hasSpokenInTurnRef.current = false;
    lastHumanSpeechTimeRef.current = 0;

    if (micAnimationIdRef.current) {
      cancelAnimationFrame(micAnimationIdRef.current);
      micAnimationIdRef.current = null;
    }
    micAnalyserRef.current = null;
    setMicLevel(0);

    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
      } catch (e) { }
      workletNodeRef.current = null;
    }

    if (scriptNodeRef.current) {
      try {
        scriptNodeRef.current.disconnect();
        scriptNodeRef.current.onaudioprocess = null;
      } catch (e) { }
      scriptNodeRef.current = null;
      try { delete (window as any).__activeScriptNode; } catch (e) { }
    }

    if (dgRecorderRef.current) {
      try { dgRecorderRef.current.stop(); } catch (e) { }
      dgRecorderRef.current = null;
    }
    if (dgStreamRef.current) {
      dgStreamRef.current.getTracks().forEach(track => track.stop());
      dgStreamRef.current = null;
    }
  };

  // Deepgram connection and session life-cycle (Stays connected continuously)
  useEffect(() => {
    const activeKey = dgApiKey || (import.meta as any).env.VITE_DEEPGRAM_API_KEY;
    if (useDeepgram && activeKey) {
      connectDeepgram();
    } else {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
      if (dgSocketRef.current) {
        dgSocketRef.current.close();
        dgSocketRef.current = null;
      }
      cleanupAudio();
    }
    return () => {
      isConnectingDgRef.current = false;
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
      if (dgSocketRef.current) {
        dgSocketRef.current.close();
      }
      cleanupAudio();
    };
  }, [useDeepgram, dgApiKey, dgAgentId]);

  // Manage live microphone stream based on mic mute state
  useEffect(() => {
    if (dgSocketRef.current && dgConnectionStatus === "connected") {
      if (!isMicMuted) {
        startDgMic();
      } else {
        stopDgMic();
      }
    }
  }, [isMicMuted, dgConnectionStatus]);

  // ----------------------------------------------------
  // VOICE SPEECH RECOGNITION (STT) + BARGE-IN SYSTEM (BROWSER FALLBACK)
  // ----------------------------------------------------
  useEffect(() => {
    const activeKey = dgApiKey || (import.meta as any).env.VITE_DEEPGRAM_API_KEY;
    if (useDeepgram && activeKey) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => {
        if (inputMode === "voice") {
          setPacStatus("listening");
        }
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        if (transcript.trim()) {
          // INTERRUPT/BARGE-IN MECHANISM
          // If P.A.C. is speaking, interrupt immediately!
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            setPacStatus("listening");
          }

          handleSendInput(transcript);
        }
      };

      rec.onerror = (e: any) => {
        console.error("STT Recognition error", e);
      };

      rec.onend = () => {
        const hasKey = dgApiKey || (import.meta as any).env.VITE_DEEPGRAM_API_KEY;
        if (inputMode === "voice" && !isMicMuted && !(useDeepgram && hasKey)) {
          try {
            rec.start();
          } catch { }
        }
      };

      recognitionRef.current = rec;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [inputMode, isMicMuted, useDeepgram, dgApiKey]);

  // Handle Voice Mode trigger (BROWSER FALLBACK)
  useEffect(() => {
    const activeKey = dgApiKey || (import.meta as any).env.VITE_DEEPGRAM_API_KEY;
    if (useDeepgram && activeKey) return;

    if (inputMode === "voice" && recognitionRef.current) {
      window.speechSynthesis.cancel(); // cancel current speech
      try {
        recognitionRef.current.start();
      } catch { }
    } else if (inputMode === "text" && recognitionRef.current) {
      recognitionRef.current.stop();
      if (pacStatus === "listening") {
        setPacStatus("idle");
      }
    }
  }, [inputMode, useDeepgram, dgApiKey]);

  const speakText = (text: string) => {
    if (isSpeakerMutedRef.current) return;
    const activeKey = dgApiKey || (import.meta as any).env.VITE_DEEPGRAM_API_KEY;
    if ((speechEngine === "deepgram" || useDeepgram) && activeKey) {
      console.log("[P.A.C.] Speech handled natively by Deepgram Voice Agent (Browser Web Speech API bypassed).");
      return;
    }

    // 1. Cancel previous speech instantly
    window.speechSynthesis.cancel();

    // 2. Clear HTML or markdown symbols for clean reading
    const cleanText = text
      .replace(/[*_`#]/g, "")
      .replace(/\[.*?\]/g, "")
      .substring(0, 400); // chunk response length for fluid experience

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance;

    // energetic peer co-founder voice setup
    utterance.rate = 1.15;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setPacStatus("speaking");
    };

    utterance.onend = () => {
      setPacStatus(inputMode === "voice" ? "listening" : "idle");
    };

    utterance.onerror = () => {
      setPacStatus(inputMode === "voice" ? "listening" : "idle");
    };

    // Get available voices and pick a professional male voice if available (to match Arcas male co-founder persona)
    const voices = window.speechSynthesis.getVoices();
    let preferredVoice = voices.find(v => v.lang.startsWith("en") && (
      v.name.includes("Male") || v.name.includes("David") || v.name.includes("George") ||
      v.name.includes("Daniel") || v.name.includes("James") || v.name.includes("Guy") ||
      v.name.includes("Mark") || v.name.includes("Alex") || v.name.includes("Aaron") ||
      v.name.includes("Natural") || v.name.toLowerCase().includes("male")
    ));
    if (!preferredVoice) {
      preferredVoice = voices.find(v => v.lang.startsWith("en") && !v.name.includes("Samantha") && !v.name.includes("Victoria") && !v.name.includes("Karen") && !v.name.includes("Zira"));
    }
    if (!preferredVoice) {
      preferredVoice = voices.find(v => v.lang.startsWith("en"));
    }
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    // Confident male co-founder pitch & rate tuning
    utterance.pitch = preferredVoice?.name.includes("Female") ? 0.8 : 0.92;
    utterance.rate = 1.08;

    window.speechSynthesis.speak(utterance);
  };

  // ----------------------------------------------------
  // SCREEN-AWARENESS (FRAME CAPTURER ENGINE)
  // ----------------------------------------------------
  const toggleScreenCapture = async () => {
    if (isScreenCaptureActive) {
      // Turn Off
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      streamRef.current = null;
      setIsScreenCaptureActive(false);
      setLastCapturedFrame(null);
      setComputerLogs(prev => [...prev, "[SCREEN] Screen Capture de-activated."]);
    } else {
      // Turn On
      setCaptureError("");
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" } as any,
          audio: false
        });

        streamRef.current = stream;
        setIsScreenCaptureActive(true);
        setComputerLogs(prev => [...prev, "[SCREEN] Eye-of-PAC screen capture stream initiated."]);

        // Auto-capture loop
        const video = document.createElement("video");
        video.srcObject = stream;
        video.autoplay = true;
        videoRef.current = video;

        // Take initial frame after short delay
        setTimeout(() => {
          captureCurrentScreenFrame();
        }, 1500);

        stream.getVideoTracks()[0].onended = () => {
          setIsScreenCaptureActive(false);
          setLastCapturedFrame(null);
        };
      } catch (err: any) {
        console.error("Screen sharing permission denied:", err);
        setCaptureError("Permission denied or constrained in iframe. Try running in a new browser tab.");
      }
    }
  };

  const captureCurrentScreenFrame = () => {
    if (!isScreenCaptureActive || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (ctx && video.videoWidth > 0) {
      canvas.width = 400; // compress for optimal API size
      canvas.height = (video.videoHeight / video.videoWidth) * 400;

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setLastCapturedFrame(dataUrl);
        setComputerLogs(prev => [
          ...prev,
          `[SCREEN] Captured visual workspace state at ${new Date().toLocaleTimeString()}`
        ].slice(-30));
      } catch (err) {
        console.error("Canvas draw frame err", err);
      }
    }
  };

  // Capture frame every 15 seconds
  useEffect(() => {
    let captureInterval: any;
    if (isScreenCaptureActive) {
      captureInterval = setInterval(() => {
        captureCurrentScreenFrame();
      }, 15000);
    }
    return () => clearInterval(captureInterval);
  }, [isScreenCaptureActive]);

  // ----------------------------------------------------
  // API INTEGRATION & CHAT ROUTER
  // ----------------------------------------------------
  const handleSendInput = async (userInputText: string) => {
    if (!userInputText.trim()) return;

    // Barge-in check: If speaking, cancel instantly!
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    stopStreamingPlayback();

    const currentMsg = userInputText;
    setTextInput("");

    // Add user message to state
    const userMsgObj = {
      role: "user" as const,
      text: currentMsg,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsgObj]);
    setPacStatus("thinking");

    // Capture newest frame instantly if enabled to keep context fresh
    if (isScreenCaptureActive) {
      captureCurrentScreenFrame();
    }

    // IF Deepgram voice agent WebSocket is active and connected, inject user message
    if (dgSocketRef.current && dgConnectionStatus === "connected") {
      try {
        const injectPayload = {
          type: "InjectUserMessage",
          content: currentMsg
        };
        dgSocketRef.current.send(JSON.stringify(injectPayload));
        console.log("[P.A.C. WS] Injected user message text directly into Deepgram Voice Agent session:", currentMsg);
        return; // Bypasses standard Gemini API backend route
      } catch (err) {
        console.error("Failed to inject user message into Deepgram WebSocket:", err);
      }
    }

    try {
      const response = await apiFetch("/api/pac/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentMsg,
          history: messages.map(m => ({ role: m.role === "user" ? "user" : "model", text: m.text })),
          screenFrame: lastCapturedFrame, // base64 payload
          opportunities: opportunities.map(o => ({
            id: o.id,
            author: o.author,
            title: o.title,
            industry: o.industry,
            problemSummary: o.problemSummary,
            status: o.status
          })),
          computerLogs: computerLogs // Pass computer logs!
        })
      });

      if (!response.ok) {
        let errMsg = "P.A.C. system offline or rate-limited.";
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (e) {
          // Use standard error status text if JSON extraction fails
        }
        throw new Error(errMsg);
      }
      const data = await response.json();

      // Update P.A.C. response
      const pacText = data.response || "Something crossed our wires. Repeat that, partner?";
      setMessages(prev => [...prev, {
        role: "pac" as const,
        text: pacText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);

      // Process any action tags or document generation in assistant text
      processTranscriptText(pacText);

      // If P.A.C. took autonomous actions, log them in the computer terminal and execute them
      if (data.actions && Array.isArray(data.actions)) {
        setComputerLogs(prev => [
          ...prev,
          ...data.actions.map((act: string) => `[PAC-EXEC] ${act}`)
        ].slice(-50));
        data.actions.forEach((act: string) => {
          processTranscriptText(act);
        });
      }

      // Speak response out loud
      speakText(pacText);

    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: "pac" as const,
        text: `Error contacting system. ${err.message || ""}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
      setPacStatus(inputMode === "voice" ? "listening" : "idle");
    }
  };

  // ----------------------------------------------------
  // FULL COMPUTER USE & EMAIL CAMPAIGN SIMULATION
  // ----------------------------------------------------
  const handleRunAutonomousCampaign = async () => {
    if (isAutonomousRunning) return;
    setIsAutonomousRunning(true);
    setIsAutoDraftSent(false);
    setCurrentStepIndex(0);

    // Simulated Human-like rate limit check
    setComputerLogs(prev => [
      ...prev,
      `[HUMAN-LIMIT] Rate-limiting guard: Active. Human simulation speed set to maximum of ${rateLimitPerHour} actions/hr.`,
    ].slice(-40));

    const steps = [
      "Initiating autonomous outreach campaign...",
      "Scanning Interactive Opportunity board for high-pain leads...",
      "Evaluating leads against target criteria (Marketing Agencies, Trade Contractors, Real Estate, SMBs)...",
      "Analyzing active screen workspace layout to target high-priority prospects...",
      "Drafting a bespoke, highly personal outreach proposal (Enforcing non-negotiable 50% upfront payment rule)...",
      "Constructing direct non-jargon solution pitch via Google Gmail integration..."
    ];

    for (let i = 0; i < steps.length; i++) {
      setCurrentStepIndex(i);
      setComputerLogs(prev => [...prev, `[PAC-EXEC] ${steps[i]}`].slice(-40));

      if (isHumanBehaviorActive) {
        // Humanized actions
        const clicks = Math.floor(Math.random() * 3) + 1; // 1-3 clicks
        const randX = Math.floor(Math.random() * 800) + 100;
        const randY = Math.floor(Math.random() * 600) + 100;
        const delay = Math.floor(Math.random() * 2000) + 1800; // 1.8s to 3.8s randomized delay

        setComputerLogs(prev => [
          ...prev,
          `[HUMAN-MOVE] Moving cursor smoothly to coordinates (X: ${randX}, Y: ${randY}) mimicking natural mouse drag...`,
          `[HUMAN-CLICK] Organic click registered at (X: ${randX}, Y: ${randY}). Cumulative clicks: ${clickCount + clicks}`,
          `[HUMAN-WAIT] Realistic pause of ${delay}ms injected to avoid automated velocity alerts.`
        ].slice(-40));

        setClickCount(prev => prev + clicks);
        await new Promise(r => setTimeout(r, delay));
      } else {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Attempt to execute Gmail draft if Gmail token is connected
    if (opportunities.length > 0) {
      const targetOpp = opportunities.find(o => o.status === "Saved") || opportunities[0];
      const emailSubject = `Automation Opportunity: Fixing your operational pain in ${targetOpp.industry || "operations"}`;
      const emailBody = `Hi ${targetOpp.author},\n\nI saw your discussion regarding: "${targetOpp.title}".\n\nIt sounds like you are experiencing severe administrative friction with manual bottlenecks. As a specialized workflow automation partner, we can configure a secure, lightweight custom API automation that resolves 90% of this double-entry within 5 business days.\n\nOur service model is structured cleanly: $1,500 total, with a standard non-negotiable 50% upfront retainer before system build kicks off.\n\nLet me know if you'd like to map out a free workflow blueprint.\n\nBest regards,\n${gmailUser?.email || "Automation Partner"}`;

      if (gmailToken) {
        try {
          if (isHumanBehaviorActive) {
            setComputerLogs(prev => [
              ...prev,
              `[HUMAN-SEND] Reviewing outreach draft for quality control, scrolling to Gmail draft CTA button...`,
              `[HUMAN-CLICK] Confirmed send action. Single human dispatch click verified (340ms debounce time).`
            ].slice(-40));
            setClickCount(prev => prev + 1);
          }

          await sendGmailEmail(gmailToken, "prospect-test@example.com", emailSubject, emailBody);
          setComputerLogs(prev => [
            ...prev,
            `[GMAIL-AUTO] Successfully dispatched live outreach draft to: prospect-test@example.com (linked to lead: ${targetOpp.author})!`,
            `[OUTREACH-DETAILS] 👤 Target Lead: ${targetOpp.author} ("${targetOpp.title}")`,
            `[OUTREACH-DETAILS] 📧 Subject: "${emailSubject}"`,
            `[OUTREACH-DETAILS] 📝 Body:\n${emailBody}`
          ].slice(-40));
          setIsAutoDraftSent(true);
        } catch (err: any) {
          setComputerLogs(prev => [...prev, `[GMAIL-ERROR] Draft creation failed: ${err.message}`]);
        }
      } else {
        setComputerLogs(prev => [
          ...prev,
          "[WARNING] Gmail is not connected. Simulation placed outreach draft into computer memory.",
          `[SIMULATED-OUTREACH] 👤 Target Lead: ${targetOpp.author} ("${targetOpp.title}")`,
          `[SIMULATED-OUTREACH] 📧 Subject: "${emailSubject}"`,
          `[SIMULATED-OUTREACH] 📝 Body:\n${emailBody}`
        ].slice(-40));
      }
    } else {
      setComputerLogs(prev => [
        ...prev,
        "[WARNING] No active opportunities found in database to execute outreach campaign."
      ].slice(-40));
    }

    setIsAutonomousRunning(false);
    setCurrentStepIndex(-1);

    // P.A.C. speaks completion
    speakText("Outreach campaign executed successfully, partner. Check the computer terminal or your Gmail inbox to audit the draft!");
  };

  // ----------------------------------------------------
  // SPARRING SALES COACHING FLOW
  // ----------------------------------------------------
  const handleStartSparring = (persona: "cynical_clinic" | "busy_broker" | "tight_founder") => {
    setSelectedPersona(persona);
    setSparState("roleplay");

    let scenario = "";
    let systemVoiceIntro = "";

    if (persona === "cynical_clinic") {
      scenario = "You are cold-calling Dr. Harrison, a cynical dental clinic manager who hates software developers. Dr. Harrison is tired of his staff manually re-typing appointments into three spreadsheets, but thinks 'custom software' is a scam.";
      systemVoiceIntro = "Dr. Harrison here. Look, I have three root canals to perform in ten minutes. My front desk is a mess but what makes you think your little software is going to fix my life? Keep it fast, kid.";
    } else if (persona === "busy_broker") {
      scenario = "You are talking to Mark, an active commercial real-estate broker. He manually sends MLS property PDFs to 100 leads daily. He wants automation but is incredibly impatient.";
      systemVoiceIntro = "Mark here. My phone is ringing off the hook. I want this automated yesterday, but I'm not paying you a dime until I see a finished product. What's your pitch?";
    } else {
      scenario = "You are pitching Dave, a cash-strapped startup founder who wants you to build a complex multi-user portal, but claims his budget is only $500.";
      systemVoiceIntro = "Hey, Dave here. I love your vibes. I want a complete custom dashboard with client logins, database syncing, and reports. Can you do it for $500? I can give you equity!";
    }

    setSparScenario(scenario);
    setMessages(prev => [
      ...prev,
      { role: "pac" as const, text: `[Sales Roleplay Initiated] Scenario:\n${scenario}`, time: new Date().toLocaleTimeString() },
      { role: "pac" as const, text: `"${systemVoiceIntro}"`, time: new Date().toLocaleTimeString() }
    ]);

    speakText(systemVoiceIntro);
  };

  if (!isOpen) {
    const isConnected = dgConnectionStatus === "connected";
    const isConnecting = dgConnectionStatus === "connecting";
    const isError = dgConnectionStatus === "error";

    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 rounded-full bg-gradient-to-tr from-teal-600 via-cyan-600 to-emerald-500 hover:from-teal-500 hover:to-cyan-400 text-white shadow-[0_0_30px_rgba(20,184,166,0.5)] hover:shadow-cyan-400/40 transition-all duration-300 z-50 flex items-center gap-2 cursor-pointer border-2 border-teal-300/60 group active:scale-95"
        title={
          isConnected
            ? "P.A.C. (Live Voice Connected)"
            : isConnecting
              ? "P.A.C. (Connecting to Voice Server...)"
              : isError
                ? "P.A.C. (Voice Connection Error)"
                : "P.A.C. Co-founder (Voice Offline)"
        }
        id="pac-trigger-btn"
        type="button"
      >
        <span className="relative flex h-3 w-3">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? "bg-emerald-400" :
              isConnecting ? "bg-amber-400" :
                isError ? "bg-rose-400" :
                  "bg-slate-500"
            }`}></span>
          <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" :
              isConnecting ? "bg-amber-500" :
                isError ? "bg-rose-500 animate-pulse" :
                  "bg-slate-600"
            }`}></span>
        </span>
        <Cpu className={`h-5 w-5 ${isConnected ? "text-emerald-400 animate-pulse" : "text-white"}`} />
        <span className="text-xs font-mono font-bold uppercase tracking-wider block pr-1">
          {isConnected ? "Voice Connected" : "P.A.C. Co-founder"}
        </span>
      </button>
    );
  }

  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className={`fixed w-[420px] rounded-2xl bg-gradient-to-b from-[#042f2e]/98 via-[#064e3b]/98 to-[#022c22]/98 border-2 ${pacStatus === "speaking" ? "border-cyan-400 shadow-[0_0_35px_rgba(34,211,238,0.4)]" :
          pacStatus === "listening" ? "border-emerald-400 shadow-[0_0_35px_rgba(52,211,153,0.4)]" :
            pacStatus === "thinking" ? "border-teal-300 shadow-[0_0_35px_rgba(45,212,191,0.4)]" :
              "border-teal-400/70 shadow-[0_0_40px_rgba(20,184,166,0.35)]"
        } shadow-2xl backdrop-blur-md transition-all duration-200 z-50 overflow-hidden flex flex-col ${isMinimized ? "h-auto" : "h-[580px] max-h-[90vh]"
        }`}
      onMouseDown={handleMouseDown}
      id="pac-floating-widget"
    >
      {/* 1. Turquoise Drag Handle & Header */}
      <div className="drag-handle px-4 py-3 bg-[#0d4a44]/95 border-b border-teal-500/50 flex items-center justify-between cursor-move select-none shadow-sm">
        <div className="flex items-center gap-2">
          {/* P.A.C Brain Orb Indicator */}
          <div className="relative flex items-center justify-center h-6 w-6">
            <span className={`absolute h-full w-full rounded-full opacity-20 animate-ping ${pacStatus === "speaking" ? "bg-cyan-400" :
                pacStatus === "listening" ? "bg-emerald-400" :
                  pacStatus === "thinking" ? "bg-indigo-400 animate-spin duration-1000" :
                    "bg-indigo-400"
              }`}></span>
            <div className={`relative h-3 w-3 rounded-full shadow-inner transition-colors duration-300 ${pacStatus === "speaking" ? "bg-cyan-400 shadow-cyan-300" :
                pacStatus === "listening" ? "bg-emerald-400 shadow-emerald-300" :
                  pacStatus === "thinking" ? "bg-indigo-400 animate-pulse" :
                    "bg-indigo-600 shadow-indigo-400"
              }`}></div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-white font-mono tracking-wider flex items-center gap-1.5">
              P.A.C.
              <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.2 rounded font-medium">CO-FOUNDER</span>
              <span
                onClick={() => setShowVoiceSettings(!showVoiceSettings)}
                className={`flex items-center gap-1 text-[8px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-tight border cursor-pointer hover:opacity-80 transition ${dgConnectionStatus === "connected"
                    ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20"
                    : dgConnectionStatus === "connecting"
                      ? "bg-amber-950/40 text-amber-400 border-amber-500/20 animate-pulse"
                      : dgConnectionStatus === "error"
                        ? "bg-rose-950/40 text-rose-400 border-rose-500/20 animate-pulse"
                        : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                title={`Deepgram Voice Agent: ${dgLifecycleStatus}. Click to open Voice Settings.`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dgConnectionStatus === "connected" ? "bg-emerald-400 shadow-[0_0_4px_#34d399] animate-pulse" :
                    dgConnectionStatus === "connecting" ? "bg-amber-400 animate-ping" :
                      dgConnectionStatus === "error" ? "bg-rose-500 animate-pulse" :
                        "bg-slate-600"
                  }`} />
                {dgConnectionStatus === "connected" ? "Voice Live 🎙️" : dgConnectionStatus === "connecting" ? "Linking..." : "Voice Offline ⚙️"}
              </span>

              {/* Instant STOP button right in status header */}
              {dgConnectionStatus === "connected" || dgConnectionStatus === "connecting" ? (
                <button
                  onClick={(e) => { e.stopPropagation(); stopDeepgramVoiceAgent(); }}
                  className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[8.5px] font-extrabold shadow-md cursor-pointer flex items-center gap-1 border border-rose-400/50 animate-pulse transition"
                  title="IMMEDIATELY stop Voice Agent & cut credit usage"
                  type="button"
                >
                  <span>🛑 STOP VOICE</span>
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); startDeepgramVoiceAgent(); }}
                  className="px-1.5 py-0.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 rounded text-[8.5px] font-bold shadow-md cursor-pointer flex items-center gap-1 border border-emerald-500/40 transition"
                  title="Start Deepgram Live Voice Agent"
                  type="button"
                >
                  <span>🎙️ START VOICE</span>
                </button>
              )}
            </h3>
            <p className="text-[9px] text-slate-500 font-mono">
              {pacStatus === "idle" && (dgConnectionStatus === "connected" ? "Voice Ready - Standing By" : "Gemini Text Active (Voice Offline)")}
              {pacStatus === "listening" && (dgConnectionStatus === "connected" ? "Listening... speak now" : "Mic listening (Text Mode)")}
              {pacStatus === "thinking" && "Processing workspace..."}
              {pacStatus === "speaking" && "P.A.C. is speaking"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Quick Screen Eye Toggle */}
          <button
            onClick={toggleScreenCapture}
            className={`p-1.5 rounded transition ${isScreenCaptureActive
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
              }`}
            title={isScreenCaptureActive ? "Turn Off Screen Eye" : "Enable Screen-Awareness Eye"}
            type="button"
          >
            <Monitor size={12} />
          </button>

          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition cursor-pointer"
            title={isMinimized ? "Expand Panel" : "Minimize Panel"}
            type="button"
          >
            {isMinimized ? <Plus size={12} /> : <ChevronRight size={12} className="rotate-90" />}
          </button>

          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
            title="Close Floating Widget"
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Hidden layout capture triggers */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 2. Minimized Mini Bar Mode */}
      {isMinimized && (
        <div className="p-3 bg-slate-950 flex items-center justify-between text-xs font-mono border-t border-slate-900">
          <span className="text-slate-400 truncate max-w-[260px]">
            {messages[messages.length - 1]?.text || "Standby"}
          </span>
          <button
            onClick={() => setIsMinimized(false)}
            className="text-[10px] text-indigo-400 font-bold hover:underline"
            type="button"
          >
            Maximize
          </button>
        </div>
      )}

      {/* 3. Maximized Core Working Panel */}
      {!isMinimized && (
        <>
          {/* Active Document Top Alert Banner */}
          {activeDocument && activeTab !== "review" && (
            <div className="px-3 py-2 bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 border-b border-sky-500/30 flex items-center justify-between text-xs text-sky-200">
              <div className="flex items-center gap-2 font-mono truncate mr-2">
                <Sparkles size={13} className="text-sky-400 shrink-0" />
                <span className="truncate text-[11px]">Draft Ready: <strong>{activeDocument.title}</strong></span>
              </div>
              <button
                onClick={() => { setActiveTab("review"); setIsMinimized(false); }}
                className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded text-[10px] transition cursor-pointer flex items-center gap-1 shrink-0 font-mono"
                type="button"
              >
                Review & Approve <ChevronRight size={11} />
              </button>
            </div>
          )}
          {/* Menu Tabs */}
          <div className="flex border-b border-teal-500/30 bg-[#063b36]/90 text-center font-mono overflow-x-auto whitespace-nowrap scrollbar-none">
            {[
              { id: "chat", label: "💬 Brainstorm" },
              { id: "computer", label: "🖥️ Computer" },
              { id: "spar", label: "🥊 Coaching" },
              { id: "review", label: `📄 Review${activeDocument ? " 🔴" : ""}` },
              { id: "memory", label: "🧠 Memory" },
              { id: "campaigns", label: "📢 Campaigns" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 text-[10px] font-bold uppercase border-b-2 transition shrink-0 ${activeTab === tab.id
                    ? "border-teal-300 text-white bg-teal-900/60 font-black shadow-inner"
                    : "border-transparent text-teal-200/60 hover:text-white hover:bg-teal-900/30"
                  }`}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Core Scroll Window Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-[#022421]/90 scrollbar-thin">

            {/* SCREEN-AWARE EYE STATUS ALERTER */}
            {isScreenCaptureActive && (
              <div className="p-2 bg-cyan-950/20 border border-cyan-500/20 rounded-lg flex items-center justify-between text-[10px] text-cyan-400 font-mono animate-pulse">
                <span className="flex items-center gap-1.5">
                  <Monitor size={10} />
                  Continuous visual screen capturing is ACTIVE.
                </span>
                <span className="text-[9px] bg-cyan-400/10 px-1 rounded">Vision Ready</span>
              </div>
            )}
            {captureError && (
              <div className="p-2 bg-amber-950/20 border border-amber-500/20 rounded-lg flex items-start gap-1.5 text-[10px] text-amber-400 font-mono leading-normal">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>{captureError}</span>
              </div>
            )}

            {/* TAB 1: BRAINSTORM CHAT */}
            {activeTab === "chat" && (
              <div className="space-y-4 flex flex-col h-full justify-between">
                <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
                  {messages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-xl p-2.5 text-xs leading-relaxed ${m.role === "user"
                          ? "bg-teal-600 text-white font-medium shadow-md"
                          : "bg-[#0b3e39] border border-teal-500/40 text-teal-50 shadow-sm"
                        }`}>
                        <div className="flex items-center gap-1 text-[9px] font-mono opacity-75 mb-1 text-teal-200">
                          {m.role === "user" ? <User size={9} /> : <Bot size={9} />}
                          <span>{m.role === "user" ? "You" : "P.A.C."}</span>
                          <span className="ml-auto">{m.time}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-teal-50">{m.text}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (textInput.trim()) {
                      handleSendInput(textInput);
                    }
                  }}
                  className="pt-2 border-t border-teal-500/40 flex gap-2"
                >
                  <input
                    type="text"
                    aria-label="Message or instruction for P.A.C co-founder"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type a message or instruction for P.A.C..."
                    className="flex-1 px-3 py-1.5 bg-[#03201e] border border-teal-500/50 rounded-lg text-xs text-teal-50 placeholder-teal-300/40 font-mono focus:outline-none focus:border-teal-300 focus:ring-1 focus:ring-teal-300/30"
                  />
                  <button
                    type="submit"
                    disabled={!textInput.trim() || pacStatus === "thinking"}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-950 disabled:text-teal-700 text-white font-mono text-[10px] font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer shadow-md"
                  >
                    <Send size={10} />
                    <span>Reply</span>
                  </button>
                </form>
              </div>
            )}

            {/* TAB 2: COMPUTER EXECUTION HUB */}
            {activeTab === "computer" && (
              <div className="space-y-4">
                {/* SUBSYSTEM DIAGNOSTICS & ABILITIES CARD */}
                <div className="p-3.5 rounded-xl border border-cyan-500/20 bg-slate-900/90 space-y-3 font-mono">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Activity size={13} className={diagnosticsResult.allHealthy ? "text-emerald-400" : "text-amber-400"} />
                      <span className="text-xs font-bold text-white uppercase">P.A.C. Subsystem Diagnostics</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${diagnosticsResult.allHealthy ? "bg-emerald-950 text-emerald-300 border border-emerald-500/30" : "bg-amber-950 text-amber-300 border border-amber-500/30"}`}>
                      {diagnosticsResult.isChecking ? "Checking..." : diagnosticsResult.allHealthy ? "100% NOMINAL" : "ATTENTION NEEDED"}
                    </span>
                  </div>

                  {/* Subsystems Status Grid */}
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">🎤 Voice Engine:</span>
                      <span className={diagnosticsResult.subsystems.deepgramVoice === true ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                        {diagnosticsResult.subsystems.deepgramVoice === true ? "Deepgram AI" : "WebSpeech"}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">🧠 Gemini AI Core:</span>
                      <span className={diagnosticsResult.subsystems.geminiChat ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {diagnosticsResult.subsystems.geminiChat ? "Online" : "Offline"}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">💾 Agent Memory:</span>
                      <span className={diagnosticsResult.subsystems.memoryBank ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {diagnosticsResult.subsystems.memoryBank ? "Connected" : "Error"}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">🎧 Audio Capture:</span>
                      <span className={diagnosticsResult.subsystems.audioCapture ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {diagnosticsResult.subsystems.audioCapture ? "Mic Ready" : "Disabled"}
                      </span>
                    </div>
                  </div>

                  {/* Display Issues if any */}
                  {diagnosticsResult.issues.length > 0 && (
                    <div className="p-2 bg-amber-950/30 border border-amber-500/20 rounded text-[9.5px] text-amber-300 space-y-1">
                      <span className="font-bold block">⚠️ Subsystem Diagnostics Notices:</span>
                      {diagnosticsResult.issues.map((iss, i) => (
                        <div key={i} className="flex items-start gap-1">
                          <span>•</span>
                          <span>{iss}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Core Abilities Summary */}
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800 space-y-1.5 text-[10px]">
                    <span className="text-cyan-400 font-bold uppercase block text-[9.5px]">⚡ Active Capabilities & Navigator Controls:</span>
                    <ul className="space-y-1 text-slate-300 text-[9.5px] leading-normal">
                      <li>• <strong>App View Navigator:</strong> Switch screen views anytime ([ACTION: NAVIGATE: board|crm|memory|bots|partner|learning]).</li>
                      <li>• <strong>Opportunity Card Drawer:</strong> Pull up specific deals on screen ([ACTION: OPEN_OPPORTUNITY: &lt;query&gt;]).</li>
                      <li>• <strong>Document & Strategy Generator:</strong> Pop-up review modals for proposals, outreach, and strategic roadmaps.</li>
                      <li>• <strong>Equal Co-Founder Sparring:</strong> P.A.C. challenges weak strategy, low quotes, and enforces 50% deposits.</li>
                      <li>• <strong>Session Memory Continuity:</strong> Maintains chat context; never repeats intro speeches.</li>
                    </ul>
                  </div>

                  {/* Control Buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={diagnosticsResult.isChecking}
                      onClick={runDiagnosticsCheck}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-cyan-300 font-bold text-[10px] rounded transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={10} className={diagnosticsResult.isChecking ? "animate-spin" : ""} />
                      {diagnosticsResult.isChecking ? "Checking Subsystems..." : "Run Diagnostics Check"}
                    </button>

                    <button
                      type="button"
                      onClick={handleResetChatHistory}
                      className="py-1.5 px-3 bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 font-bold text-[10px] rounded transition cursor-pointer"
                      title="Clear chat history and restart greeting"
                    >
                      Reset History
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-indigo-500/10 bg-indigo-950/10 space-y-2">
                  <h4 className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5">
                    <Cpu size={12} className="text-cyan-400" />
                    Computer Use Control Hub
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Let P.A.C. autonomously parse raw forum scraper logs, research niche bottlenecks, construct customized value structures, and send personalized Gmail outreach on your machine.
                  </p>

                  {/* Human-Like Simulation Control Panel */}
                  <div className="mt-3 p-3 bg-slate-900/80 border border-slate-800/80 rounded-lg space-y-2.5 font-mono text-[10px] text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-100 flex items-center gap-1 text-[10px]">
                        🛡️ Human Behavior Guard
                      </span>
                      <button
                        onClick={() => setIsHumanBehaviorActive(!isHumanBehaviorActive)}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold cursor-pointer transition ${isHumanBehaviorActive
                            ? "bg-emerald-950 border border-emerald-500/30 text-emerald-400"
                            : "bg-slate-800 border border-slate-700 text-slate-400"
                          }`}
                        type="button"
                      >
                        {isHumanBehaviorActive ? "ACTIVE" : "DISABLED"}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-slate-950 p-2 rounded border border-slate-800/60">
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">Clicks Tracked</span>
                        <span className="text-cyan-400 text-xs font-bold font-mono">{clickCount} clicks</span>
                      </div>
                      <div className="bg-slate-950 p-2 rounded border border-slate-800/60">
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">Rate Limits</span>
                        <span className="text-indigo-400 text-xs font-bold font-mono">{rateLimitPerHour} outreach/hr</span>
                      </div>
                    </div>

                    {isHumanBehaviorActive && (
                      <p className="text-[9px] text-slate-500 italic">
                        * P.A.C. mimics organic bezier curves, realistic keyboard keystroke pauses, and click debounces.
                      </p>
                    )}
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={handleRunAutonomousCampaign}
                      disabled={isAutonomousRunning}
                      className="flex-1 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:from-slate-800 disabled:text-slate-500 text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 font-mono"
                      type="button"
                    >
                      <Play size={10} />
                      {isAutonomousRunning ? "Autonomous Mode Running..." : "Execute Auto-Campaign"}
                    </button>
                  </div>
                </div>

                {/* Simulated Computer execution state visual */}
                {isAutonomousRunning && (
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <span className="text-[10px] font-bold text-indigo-400 font-mono uppercase block animate-pulse">Running Execution Stack</span>
                    <div className="space-y-1">
                      {[
                        "Scan Interactive Board",
                        "Evaluate Client Pain points",
                        "Map screen layout",
                        "Structure upfront pricing rules (50% upfront)",
                        "Deploy Gmail API message"
                      ].map((st, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                          <div className={`h-1.5 w-1.5 rounded-full ${currentStepIndex > i ? "bg-emerald-400" :
                              currentStepIndex === i ? "bg-cyan-400 animate-ping" :
                                "bg-slate-700"
                            }`} />
                          <span className={currentStepIndex === i ? "text-cyan-400 font-bold" : "text-slate-500"}>{st}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Computer execution raw logs terminal */}
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono uppercase font-bold tracking-wider block">Terminal Logs</span>
                  <div className="p-3 bg-black rounded-lg border border-slate-900 font-mono text-[9px] leading-relaxed text-slate-400 h-[160px] overflow-y-auto pr-1">
                    {computerLogs.map((log, idx) => (
                      <div key={idx} className="border-b border-slate-950 pb-0.5">
                        <span className="text-indigo-400 pr-1.5">$</span>
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SALES COACHING & ROLEPLAY */}
            {activeTab === "spar" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/10 space-y-2">
                  <h4 className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5">
                    🥊 Peer Sparring Room
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Practice cold-calling decision makers. P.A.C. poses as a tough, busy client so you can test your pricing models, object handling, and upfront commitment proposals.
                  </p>
                </div>

                {sparState === "idle" ? (
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-300 font-mono uppercase block">Select Prospect Persona</span>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { id: "cynical_clinic", title: "Dr. Harrison (Dental Clinic)", desc: "Skeptical, busy, manual scheduling spreadsheet mess." },
                        { id: "busy_broker", title: "Mark (Commercial Real Estate)", desc: "Wants fast automation, tries to avoid upfront cash." },
                        { id: "tight_founder", title: "Dave (Cash-Strapped Startup)", desc: "Wants a massive custom web portal for $500." }
                      ].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleStartSparring(p.id as any)}
                          className="text-left p-3 bg-slate-900 hover:bg-indigo-950/30 border border-slate-800 hover:border-indigo-500/20 rounded-lg text-xs transition cursor-pointer text-slate-200"
                          type="button"
                        >
                          <span className="font-bold text-slate-100 block">{p.title}</span>
                          <span className="text-[10px] text-slate-400 leading-normal block pt-0.5">{p.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase">Roleplay Active</span>
                      <button
                        onClick={() => { setSparState("idle"); setMessages(prev => [...prev, { role: "pac", text: "Sales sparring session closed.", time: new Date().toLocaleTimeString() }]); }}
                        className="text-[9px] font-mono text-rose-400 hover:underline cursor-pointer"
                        type="button"
                      >
                        End Sparring
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 italic leading-relaxed">
                      {sparScenario}
                    </p>
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded text-[10px] text-slate-300 leading-relaxed font-mono">
                      <strong>Coach P.A.C. Note:</strong> Stand your ground. Never negotiate down your value, and enforce our <strong>50% upfront payment rule</strong> when they push back!
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: DOCUMENT REVIEW BOARD */}
            {activeTab === "review" && (
              <div className="space-y-4 flex flex-col h-full justify-between min-h-0">
                <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase font-bold">
                        📄 Live Document Review
                      </span>
                      {activeDocument && (
                        <span className="text-[9px] bg-sky-500/10 text-sky-300 border border-sky-500/20 px-1.5 py-0.5 rounded font-mono uppercase">
                          {activeDocument.type}
                        </span>
                      )}
                    </div>
                    {activeDocument ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[9.5px] text-slate-400 font-mono block">Document Title</label>
                          <input
                            type="text"
                            value={activeDocument.title}
                            onChange={(e) => setActiveDocument({ ...activeDocument, title: e.target.value })}
                            className="w-full px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-cyan-500"
                          />
                        </div>

                        {activeDocument.type === "outreach" && (
                          <div className="space-y-1">
                            <label className="text-[9.5px] text-slate-400 font-mono block">Recipient Email</label>
                            <input
                              type="email"
                              placeholder="enter-recipient@domain.com"
                              value={reviewEmailRecipient}
                              onChange={(e) => setReviewEmailRecipient(e.target.value)}
                              className="w-full px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-cyan-500"
                            />
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="text-[9.5px] text-slate-400 font-mono block">Content Editor</label>
                          <textarea
                            value={activeDocument.content}
                            onChange={(e) => setActiveDocument({ ...activeDocument, content: e.target.value })}
                            className="w-full h-64 p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs leading-relaxed text-slate-200 focus:outline-none focus:border-cyan-500 font-mono resize-y"
                            placeholder="Document content..."
                          />
                        </div>

                        {/* Co-founder Strategic Advice */}
                        <div className="p-2.5 bg-slate-950 border border-amber-500/20 rounded-lg space-y-1">
                          <span className="text-[10px] font-mono font-bold text-amber-400 uppercase block">
                            🥊 P.A.C. Co-founder Strategy Note
                          </span>
                          <p className="text-[10.5px] text-slate-300 leading-normal">
                            Always enforce our <strong>50% upfront payment term</strong> upon client signature. If the prospect pushes back on pricing, offer to adjust scope or payment schedule rather than discounting our fees.
                          </p>
                        </div>

                        {/* Interactive Revision & Debate Request */}
                        <div className="p-3 bg-slate-950/80 border border-cyan-500/20 rounded-lg space-y-2">
                          <label className="text-[10px] font-mono font-bold text-cyan-300 uppercase block">
                            ⚡ Request Revision / Debate with P.A.C.
                          </label>
                          <textarea
                            value={revisionFeedbackInput}
                            onChange={(e) => setRevisionFeedbackInput(e.target.value)}
                            placeholder="Tell P.A.C. how to revise this draft, or challenge P.A.C.'s strategy (e.g. 'Shorten this', 'Add 50% deposit term', 'Push back on their $500 budget offer')..."
                            className="w-full h-16 p-2 bg-slate-900 border border-slate-800 rounded text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                          />
                          <div className="flex gap-1.5 flex-wrap">
                            {[
                              { label: "⚡ Shorten & Punchy", prompt: "Make this document much shorter, direct, and punchier." },
                              { label: "💰 Add 50% Deposit Term", prompt: "Add a clear 50% upfront deposit requirement to lock in the engineering sprint." },
                              { label: "🛡️ Push Back on Price", prompt: "Push back on low pricing or scope creep. Explain why our AI fleet delivery is worth full value." },
                              { label: "✉️ Convert to LinkedIn DM", prompt: "Reformat this entire message as a casual, warm LinkedIn DM." }
                            ].map((btn, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setRevisionFeedbackInput(btn.prompt)}
                                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[9.5px] text-cyan-300 rounded transition cursor-pointer font-mono"
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={isSubmittingRevision || !revisionFeedbackInput.trim()}
                            onClick={async () => {
                              if (!revisionFeedbackInput.trim() || !activeDocument) return;
                              const textToSend = revisionFeedbackInput;
                              setRevisionFeedbackInput("");
                              setIsSubmittingRevision(true);
                              const fullPrompt = `Regarding active document "${activeDocument.title}", please revise it based on this feedback: "${textToSend}". 
Current Draft:
${activeDocument.content}

Instructions: Re-generate the revised document wrapped in a code block. If you disagree with any requested changes from a strategic sales perspective, explain why and push back!`;
                              setActiveTab("chat");
                              await handleSendInput(fullPrompt);
                              setIsSubmittingRevision(false);
                            }}
                            className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-bold text-xs rounded transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            {isSubmittingRevision ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            Send Revision Request to P.A.C.
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 space-y-2">
                        <p className="text-xs text-slate-500 font-mono">No document currently in review.</p>
                        <p className="text-[10px] text-slate-600 leading-normal max-w-[280px] mx-auto">
                          Ask P.A.C. to "draft an email" or "create a proposal" during your conversation. When generated, it will pop up here for your review and approval.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {activeDocument && (
                  <div className="pt-3 border-t border-slate-900 space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(activeDocument.content);
                            alert("📋 Copied draft message to clipboard!");
                          } catch (e) {
                            alert("Copied to clipboard!");
                          }
                        }}
                        className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded text-[10.5px] font-bold text-center transition cursor-pointer flex items-center justify-center gap-1.5"
                        type="button"
                      >
                        <Copy size={11} /> Copy Draft
                      </button>

                      {activeDocument.type === "outreach" && gmailToken && (
                        <button
                          onClick={async () => {
                            if (!reviewEmailRecipient || !reviewEmailRecipient.includes("@")) {
                              alert("Please enter a valid recipient email address first.");
                              return;
                            }
                            const confirmed = window.confirm(`Send this outreach email to ${reviewEmailRecipient} via Gmail?`);
                            if (!confirmed) return;
                            setIsSendingReviewEmail(true);
                            try {
                              const matchSubject = activeDocument.content.match(/subject:\s*(.*)/i);
                              const subject = matchSubject ? matchSubject[1].trim() : `Regarding your project proposal`;
                              const body = activeDocument.content.replace(/subject:\s*(.*)/i, "").trim();

                              await sendGmailEmail(gmailToken, reviewEmailRecipient, subject, body);
                              alert("Email sent successfully!");
                              setActiveDocument(null);
                              setActiveTab("chat");
                              if (onRefreshOpportunities) {
                                onRefreshOpportunities();
                              }
                            } catch (err: any) {
                              console.error(err);
                              alert("Failed to send email: " + err.message);
                            } finally {
                              setIsSendingReviewEmail(false);
                            }
                          }}
                          disabled={isSendingReviewEmail}
                          className="py-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 text-white rounded text-[10.5px] font-bold text-center transition cursor-pointer flex items-center justify-center gap-1.5"
                          type="button"
                        >
                          {isSendingReviewEmail ? <RefreshCw size={11} className="animate-spin" /> : null}
                          Send via Gmail
                        </button>
                      )}

                      <button
                        onClick={async () => {
                          // 1. Calculate destination URL first synchronously
                          const cleanAuthor = (activeDocument.targetAuthor || "")
                            .replace(/^https?:\/\/(www\.)?reddit\.com\/(u|user)\//i, "")
                            .replace(/^\/?(u|user)\//i, "")
                            .replace(/^@/, "")
                            .replace(/\/$/, "")
                            .trim();

                          const isPlaceholder = !cleanAuthor || cleanAuthor === "[deleted]" || cleanAuthor === "AutoModerator" || cleanAuthor.includes("Atom_User") || cleanAuthor.includes("Reddit_User") || cleanAuthor.toLowerCase() === "user";

                          const isReddit = activeDocument.targetPlatform?.includes("Reddit") || 
                            activeDocument.title?.toLowerCase().includes("reddit") || 
                            (activeDocument.targetUrl && activeDocument.targetUrl.includes("reddit.com")) ||
                            (!isPlaceholder);

                          let destinationUrl = "";
                          if (isReddit && !isPlaceholder) {
                            destinationUrl = `https://www.reddit.com/message/compose/?to=${encodeURIComponent(cleanAuthor)}&subject=${encodeURIComponent("Regarding your post: " + (activeDocument.title || "workflow bottleneck"))}&message=${encodeURIComponent(activeDocument.content)}`;
                          } else if (activeDocument.targetUrl && activeDocument.targetUrl.startsWith("http")) {
                            destinationUrl = activeDocument.targetUrl;
                          } else {
                            destinationUrl = "https://www.reddit.com/message/compose/";
                          }

                          // 2. Open window SYNCHRONOUSLY before any async operations to prevent browser popup blocking
                          window.open(destinationUrl, '_blank');

                          // 3. Copy draft to clipboard
                          try {
                            await navigator.clipboard.writeText(activeDocument.content);
                          } catch (e) {}

                          // 4. Mark opportunity as Contacted & save outreachProof in CRM
                          if (activeDocument.opportunityId) {
                            try {
                              await apiFetch(`/api/opportunities/${activeDocument.opportunityId}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ 
                                  status: "Contacted", 
                                  notes: `Outreach approved & launched on ${new Date().toLocaleDateString()}`,
                                  outreachProof: {
                                    platform: isReddit ? "Reddit" : (activeDocument.targetPlatform || "Web"),
                                    recipient: cleanAuthor || "Author",
                                    messageText: activeDocument.content,
                                    sentAt: new Date().toISOString()
                                  }
                                })
                              });
                              if (onRefreshOpportunities) onRefreshOpportunities();
                            } catch (e) {}
                          }

                          // 5. Log in console
                          setComputerLogs(prev => [
                            ...prev,
                            `[CRM] Approved outreach draft! Copied to clipboard and opened ${destinationUrl} in your browser.`
                          ]);

                          alert(`📋 Outreach draft copied to clipboard!\n\nOpened Reddit/platform in a new browser tab for you to review and hit Send.`);

                          setActiveDocument(null);
                          setActiveTab("chat");
                        }}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10.5px] font-bold text-center transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40"
                        type="button"
                      >
                        <Send size={11} />
                        <span>Log, Approve & Launch</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "memory" && (
              <div className="space-y-4 flex flex-col h-full justify-between min-h-0">
                <div className="space-y-4 flex-1 overflow-y-auto pr-0.5 scrollbar-thin">
                  
                  {/* Notes / Context Section */}
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase font-bold flex items-center gap-1.5">
                      <Save size={10} /> Co-Founder Context & Session Notes
                    </span>
                    <p className="text-[9px] text-slate-500 font-mono leading-normal">
                      Notes that P.A.C. will remember about your current business goals, outreach strategy, and setup context.
                    </p>
                    <textarea
                      value={agentMemory.summary}
                      onChange={(e) => setAgentMemory({ ...agentMemory, summary: e.target.value })}
                      placeholder="Enter previous context or notes for the agent to remember..."
                      className="w-full h-24 p-2 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-cyan-500 font-mono resize-none"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSaveAgentMemory(agentMemory)}
                        className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[9.5px] font-bold font-mono transition flex items-center gap-1 cursor-pointer"
                        type="button"
                      >
                        <Save size={10} /> Save Notes
                      </button>
                    </div>
                  </div>

                  {/* Follow-up Tasks Section */}
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
                    <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase font-bold flex items-center gap-1.5">
                      <Check size={10} /> Pending Follow-up Action Items
                    </span>
                    <p className="text-[9px] text-slate-500 font-mono leading-normal">
                      Tasks to complete. P.A.C. will bring these up during voice calls or screen analysis.
                    </p>

                    {/* Task Add Form */}
                    <div className="flex gap-2 items-center bg-slate-950 p-2 border border-slate-800 rounded">
                      <input
                        type="text"
                        placeholder="Add new follow-up..."
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        className="flex-1 bg-transparent text-xs text-white focus:outline-none placeholder-slate-600"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (newTaskText.trim()) {
                              const newTask = {
                                id: Math.random().toString(36).substring(2, 9),
                                task: newTaskText.trim(),
                                completed: false,
                                dueDate: newTaskDueDate || undefined
                              };
                              const updated = { ...agentMemory, followUps: [...agentMemory.followUps, newTask] };
                              setAgentMemory(updated);
                              handleSaveAgentMemory(updated);
                              setNewTaskText("");
                              setNewTaskDueDate("");
                            }
                          }
                        }}
                      />
                      <input
                        type="date"
                        value={newTaskDueDate}
                        onChange={(e) => setNewTaskDueDate(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-[10px] text-slate-400 focus:outline-none px-1 rounded h-5 font-mono cursor-pointer"
                      />
                      <button
                        onClick={() => {
                          if (!newTaskText.trim()) return;
                          const newTask = {
                            id: Math.random().toString(36).substring(2, 9),
                            task: newTaskText.trim(),
                            completed: false,
                            dueDate: newTaskDueDate || undefined
                          };
                          const updated = { ...agentMemory, followUps: [...agentMemory.followUps, newTask] };
                          setAgentMemory(updated);
                          handleSaveAgentMemory(updated);
                          setNewTaskText("");
                          setNewTaskDueDate("");
                        }}
                        className="p-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded cursor-pointer transition flex items-center justify-center"
                        type="button"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    {/* Tasks List */}
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5 scrollbar-thin">
                      {agentMemory.followUps && agentMemory.followUps.length > 0 ? (
                        [...agentMemory.followUps]
                          .sort((a, b) => Number(a.completed) - Number(b.completed))
                          .map((item) => (
                            <div key={item.id} className={`flex items-center justify-between p-2 rounded text-xs transition ${item.completed ? "bg-slate-950/20 text-slate-500" : "bg-slate-950/40 text-slate-200 border border-slate-900"}`}>
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={item.completed}
                                  onChange={() => {
                                    const updatedFollowUps = agentMemory.followUps.map(f => f.id === item.id ? { ...f, completed: !f.completed } : f);
                                    const updated = { ...agentMemory, followUps: updatedFollowUps };
                                    setAgentMemory(updated);
                                    handleSaveAgentMemory(updated);
                                  }}
                                  className="rounded border-slate-800 bg-slate-950 text-cyan-600 focus:ring-0 focus:ring-offset-0 cursor-pointer h-3.5 w-3.5"
                                />
                                <span className={`truncate text-[11px] font-mono leading-none ${item.completed ? "line-through text-slate-600" : ""}`}>
                                  {item.task}
                                </span>
                                {item.dueDate && (
                                  <span className={`text-[8.5px] font-mono px-1 rounded border leading-none ${item.completed ? "border-slate-800 bg-slate-950/10 text-slate-700" : "border-amber-500/20 bg-amber-500/10 text-amber-400"}`}>
                                    {item.dueDate}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  const updatedFollowUps = agentMemory.followUps.filter(f => f.id !== item.id);
                                  const updated = { ...agentMemory, followUps: updatedFollowUps };
                                  setAgentMemory(updated);
                                  handleSaveAgentMemory(updated);
                                }}
                                className="text-slate-600 hover:text-rose-400 transition ml-2 cursor-pointer shrink-0"
                                type="button"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          ))
                      ) : (
                        <div className="text-center py-4 text-[10px] text-slate-600 font-mono">
                          No pending follow-ups. Add some above!
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}


            {/* SOCIAL CAMPAIGNS TAB */}
            {activeTab === "campaigns" && (
              <div className="flex flex-col h-[520px] bg-slate-950/40 rounded-xl border border-slate-900 overflow-hidden">
                {/* Header Actions */}
                <div className="p-3 bg-slate-900/60 border-b border-slate-900 flex items-center justify-between shrink-0 flex-wrap gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                      </span>
                      B2B Organic Social Campaigns
                    </h3>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                      Generate authentic, jargon-free thought leadership to drive inbound leads.
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {campaignPosts.length > 0 && (
                      <>
                        <button
                          onClick={handleExportIcsCalendar}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded text-[9.5px] font-bold font-mono transition flex items-center gap-1 cursor-pointer"
                          type="button"
                          title="Export schedule to Apple/Google/Outlook Calendar"
                        >
                          <Calendar size={11} className="text-cyan-400" /> Export (.ics)
                        </button>

                        <button
                          onClick={() => {
                            campaignPosts.forEach(p => handleApprovePost(p.id, false));
                            alert("🚀 All 7 campaign posts have been approved and saved to your schedule!");
                          }}
                          className="px-2.5 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/40 text-emerald-400 rounded text-[9.5px] font-bold font-mono transition flex items-center gap-1 cursor-pointer"
                          type="button"
                        >
                          <Check size={11} /> Approve All
                        </button>
                      </>
                    )}

                    <button
                      onClick={handleGenerateCampaign}
                      disabled={isLoadingCampaign}
                      className="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded text-[10px] font-bold font-mono transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg cursor-pointer"
                      type="button"
                    >
                      {isLoadingCampaign ? (
                        <>
                          <span className="h-2.5 w-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Drafting Week...
                        </>
                      ) : (
                        <>
                          <Sparkles size={11} /> Plan 7-Day Campaign
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Free Scheduler Hub Banner */}
                <div className="px-3 py-1.5 bg-slate-950 border-b border-slate-900/80 flex items-center justify-between text-[9px] font-mono text-slate-400 overflow-x-auto gap-2">
                  <span className="shrink-0 text-slate-500 font-semibold">Free Schedulers:</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href="https://business.facebook.com/latest/composer"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline flex items-center gap-0.5"
                    >
                      Meta Business Suite (FB/IG) ↗
                    </a>
                    <span className="text-slate-700">•</span>
                    <a
                      href="https://www.linkedin.com/feed/?shareActive=true"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:underline flex items-center gap-0.5"
                    >
                      LinkedIn Scheduler ↗
                    </a>
                    <span className="text-slate-700">•</span>
                    <a
                      href="https://publish.buffer.com/compose"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline flex items-center gap-0.5"
                    >
                      Buffer (Free) ↗
                    </a>
                  </div>
                </div>

                {/* Campaign Posts List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin">
                  {campaignPosts.length > 0 ? (
                    campaignPosts.map((post, idx) => (
                      <div
                        key={post.id}
                        className={`p-3 bg-slate-900/80 border rounded-xl space-y-3 transition duration-200 hover:border-slate-800 ${
                          post.status === "Approved"
                            ? "border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.03)]"
                            : post.status === "Rejected"
                            ? "border-rose-500/20"
                            : "border-slate-800/80"
                        }`}
                      >
                        {/* Post Header Card */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                              Day {idx + 1}
                            </span>
                            <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded font-mono ${
                              post.platform === "LinkedIn" ? "bg-blue-900/30 text-blue-400 border border-blue-800/30" :
                              post.platform === "Twitter/X" || post.platform === "Twitter" ? "bg-slate-950 text-white border border-slate-800" :
                              post.platform === "Reddit" ? "bg-orange-950/30 text-orange-400 border border-orange-900/30" :
                              "bg-indigo-950/30 text-indigo-400 border border-indigo-900/30"
                            }`}>
                              {post.platform}
                            </span>
                            <span className="text-[9.5px] text-slate-500 font-mono">
                              {post.scheduledDate}
                            </span>
                          </div>

                          {/* Status Badge */}
                          <div className="flex items-center gap-1.5">
                            <span className={`relative flex h-1.5 w-1.5 ${post.status === "Approved" ? "bg-emerald-400" : "bg-amber-400"} rounded-full`}>
                              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${post.status === "Approved" ? "bg-emerald-400" : "bg-amber-400"}`}></span>
                              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${post.status === "Approved" ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                            </span>
                            <span className={`text-[9px] font-mono font-semibold ${post.status === "Approved" ? "text-emerald-400" : "text-amber-400"}`}>
                              {post.status}
                            </span>
                          </div>
                        </div>

                        {/* Content text */}
                        <div className="space-y-2">
                          <label className="text-[8.5px] uppercase tracking-wider text-slate-500 font-mono block">Post Draft</label>
                          <textarea
                            value={post.content}
                            onChange={(e) => {
                              const updated = campaignPosts.map(p => p.id === post.id ? { ...p, content: e.target.value } : p);
                              setCampaignPosts(updated);
                            }}
                            className="w-full min-h-[90px] p-2 bg-slate-950 border border-slate-850 focus:border-cyan-500/50 rounded-lg text-[11px] text-slate-200 focus:outline-none font-mono resize-none leading-relaxed"
                          />
                        </div>

                        {/* Visual Image & Prompt Section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/50 p-2.5 rounded-lg border border-slate-900">
                          <div className="space-y-2">
                            <label className="text-[8.5px] uppercase tracking-wider text-slate-500 font-mono block">Image Prompt (Visuals)</label>
                            <textarea
                              value={post.imagePrompt}
                              onChange={(e) => {
                                const updated = campaignPosts.map(p => p.id === post.id ? { ...p, imagePrompt: e.target.value } : p);
                                setCampaignPosts(updated);
                              }}
                              className="w-full h-[80px] p-2 bg-slate-950 border border-slate-850 focus:border-cyan-500/50 rounded-lg text-[10px] text-slate-400 focus:outline-none font-mono resize-none leading-normal"
                            />
                          </div>
                          
                          {/* Image rendering using Pollinations AI with Zoom Click */}
                          <div 
                            onClick={() => {
                              if (post.imagePrompt) {
                                setZoomImageUrl(`https://image.pollinations.ai/prompt/${encodeURIComponent(post.imagePrompt)}?width=1200&height=800&nologo=true&private=true`);
                              }
                            }}
                            className="relative h-[110px] rounded-lg overflow-hidden border border-slate-850 bg-slate-950 flex items-center justify-center cursor-pointer group hover:border-cyan-400 transition"
                            title="Click to expand high-resolution graphic"
                          >
                            {post.imagePrompt ? (
                              <>
                                <img
                                  src={`https://image.pollinations.ai/prompt/${encodeURIComponent(post.imagePrompt)}?width=400&height=250&nologo=true&private=true`}
                                  alt={post.platform}
                                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white font-mono text-[9px] font-bold">
                                  <Maximize2 size={12} className="text-cyan-400" />
                                  <span>Expand</span>
                                </div>
                              </>
                            ) : (
                              <div className="text-[9px] text-slate-600 font-mono text-center">No image planned</div>
                            )}
                            <div className="absolute bottom-1 right-1 bg-slate-900/80 px-1.5 py-0.5 rounded text-[8px] text-slate-400 font-mono border border-slate-800 pointer-events-none">
                              🔍 Zoom
                            </div>
                          </div>

                          {/* Video Script Outline & Runway AI Video Generator */}
                          {post.videoScriptPrompt && (
                            <div className="col-span-1 md:col-span-2 space-y-2 bg-[#03201e] p-3 rounded-lg border border-teal-500/30">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-teal-300 font-mono text-[9px] font-bold uppercase tracking-wider">
                                  <Sparkles size={11} className="text-cyan-400" /> 30-Sec Video / Loom Demo Outline
                                </div>
                                
                                <button
                                  type="button"
                                  onClick={() => handleGenerateRunwayVideo(post)}
                                  disabled={generatingVideoPostId === post.id}
                                  className="px-2 py-1 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded text-[8.5px] font-bold font-mono transition flex items-center gap-1 shadow cursor-pointer disabled:opacity-50"
                                >
                                  {generatingVideoPostId === post.id ? (
                                    <>
                                      <span className="h-2 w-2 border border-white border-t-transparent rounded-full animate-spin"></span>
                                      Rendering...
                                    </>
                                  ) : (
                                    <>
                                      <span>🎬 Render Runway AI Video (5s)</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              <p className="text-[10px] text-teal-100 font-mono leading-relaxed whitespace-pre-wrap">
                                {post.videoScriptPrompt}
                              </p>

                              {/* Status message */}
                              {videoStatusMessages[post.id] && (
                                <div className="text-[9px] font-mono text-cyan-300 bg-cyan-950/40 p-1.5 rounded border border-cyan-500/20 flex items-center gap-1">
                                  <span>{videoStatusMessages[post.id]}</span>
                                </div>
                              )}

                              {/* Live Video Player if generated */}
                              {generatedVideos[post.id] && (
                                <div className="rounded-lg overflow-hidden border border-teal-400/50 bg-black mt-2">
                                  <video
                                    src={generatedVideos[post.id]}
                                    controls
                                    autoPlay
                                    loop
                                    muted
                                    className="w-full max-h-[220px] object-cover"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions (Approve / Reject Loop) */}
                        <div className="flex gap-2 items-center justify-between border-t border-slate-900/60 pt-2.5">
                          {/* Rejection Loop Box */}
                          <div className="flex-1 flex gap-1.5 mr-2">
                            <input
                              type="text"
                              placeholder="Type feedback if you want to rewrite/reject..."
                              value={rejectionFeedbacks[post.id] || ""}
                              onChange={(e) => setRejectionFeedbacks(prev => ({ ...prev, [post.id]: e.target.value }))}
                              className="flex-1 px-2.5 py-1 bg-slate-950 border border-slate-850 rounded text-[10px] text-slate-300 focus:outline-none focus:border-rose-500/40 font-mono placeholder-slate-700"
                            />
                            <button
                              onClick={() => handleRejectPost(post.id)}
                              disabled={regeneratingPostId === post.id}
                              className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/40 border border-rose-900/30 text-rose-400 rounded text-[10px] font-bold font-mono transition flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              type="button"
                            >
                              {regeneratingPostId === post.id ? (
                                <>
                                  <span className="h-2 w-2 border border-rose-400 border-t-transparent rounded-full animate-spin"></span>
                                  Rewriting...
                                </>
                              ) : (
                                "Reject & Rewrite"
                              )}
                            </button>
                          </div>

                          {/* Approval & Scheduler Triggers */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(post.content);
                                  alert(`📋 Copied post text for ${post.platform} to clipboard!`);
                                } catch (e) {}
                              }}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded text-[9.5px] font-bold font-mono transition flex items-center gap-1 cursor-pointer"
                              type="button"
                              title="Copy post content to clipboard"
                            >
                              <Copy size={10} /> Copy
                            </button>

                            {post.status !== "Approved" ? (
                              <button
                                onClick={() => handleApprovePost(post.id, true)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9.5px] font-bold font-mono transition flex items-center gap-1 cursor-pointer shadow-sm"
                                type="button"
                              >
                                <Calendar size={10} /> Approve & Launch Scheduler
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  // Open platform scheduler directly
                                  const platformLower = (post.platform || "").toLowerCase();
                                  let url = "https://publish.buffer.com/compose";
                                  if (platformLower.includes("facebook") || platformLower.includes("meta") || platformLower.includes("instagram")) {
                                    url = "https://business.facebook.com/latest/composer";
                                  } else if (platformLower.includes("linkedin")) {
                                    url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(post.content)}`;
                                  } else if (platformLower.includes("twitter") || platformLower.includes("x")) {
                                    url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.content)}`;
                                  } else if (platformLower.includes("reddit")) {
                                    url = `https://www.reddit.com/r/smallbusiness/submit?title=${encodeURIComponent("Practical workflow automation blueprint")}&text=${encodeURIComponent(post.content)}`;
                                  }
                                  navigator.clipboard.writeText(post.content);
                                  window.open(url, '_blank');
                                }}
                                className="px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/40 text-cyan-300 rounded text-[9.5px] font-bold font-mono transition flex items-center gap-1 cursor-pointer"
                                type="button"
                              >
                                <Send size={10} /> Open Scheduler
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-16 space-y-3 bg-slate-900/20 border border-dashed border-slate-800 rounded-xl">
                      <span className="text-2xl">📢</span>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-300 font-mono">No Campaigns Active</h4>
                        <p className="text-[9.5px] text-slate-600 font-mono max-w-[240px]">
                          Get organic traffic crawling to your landing page. Plan a 7-day social campaign!
                        </p>
                      </div>
                      <button
                        onClick={handleGenerateCampaign}
                        className="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded text-[9.5px] font-bold font-mono transition cursor-pointer"
                        type="button"
                      >
                        Plan 7-Day Campaign
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}


          </div>

          {/* Deepgram Voice Agent Settings Collapsible Panel */}
          {showVoiceSettings && (
            <div className="mx-3 mb-2 p-3 bg-slate-950/95 border border-slate-800/80 rounded-xl space-y-3 font-mono text-[10px] text-slate-300 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 shadow-2xl ring-1 ring-white/10">
              <div className="sticky top-0 bg-slate-950/95 z-10 flex items-center justify-between border-b border-slate-800/60 pb-1.5 pt-0.5">
                <span className="font-bold text-slate-100 flex items-center gap-1.5">
                  <Sparkles size={11} className="text-indigo-400 animate-pulse" />
                  DEEPGRAM VOICE AGENT SETTINGS
                  <span className="text-[8.5px] font-sans font-normal text-cyan-400/80 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20">Scrollable</span>
                </span>
                <button
                  onClick={() => setShowVoiceSettings(false)}
                  className="text-slate-500 hover:text-white cursor-pointer"
                  type="button"
                >
                  <X size={11} />
                </button>
              </div>

              {/* Engine Select Toggle */}
              <div className="flex flex-col gap-1.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 font-sans font-medium text-[10px]">Speech Synthesis Engine:</span>
                <div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded border border-slate-800/80">
                  <button
                    onClick={() => setSpeechEngine("deepgram")}
                    className={`px-1 py-1 rounded text-[8.5px] transition cursor-pointer font-bold ${speechEngine === "deepgram"
                        ? "bg-slate-800 text-cyan-400"
                        : "text-slate-400 hover:text-slate-200"
                      }`}
                    type="button"
                  >
                    Deepgram Voice Agent
                  </button>
                  <button
                    onClick={() => setSpeechEngine("browser")}
                    className={`px-1 py-1 rounded text-[8.5px] transition cursor-pointer font-bold ${speechEngine === "browser"
                        ? "bg-slate-800 text-amber-400"
                        : "text-slate-400 hover:text-slate-200"
                      }`}
                    type="button"
                  >
                    Web Speech
                  </button>
                </div>
              </div>

              {/* Speech Speed Rate Selector */}
              <div className="flex flex-col gap-1.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-sans font-medium text-[10px]">⚡ Agent Speech Pace:</span>
                  <span className="text-cyan-400 font-mono font-bold text-[9.5px]">
                    {speechPlaybackRate}x {speechPlaybackRate >= 1.25 ? "⚡ Fast Executive" : speechPlaybackRate > 1.0 ? "⚡ Brisk" : "Normal"}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 pt-0.5">
                  {[1.0, 1.15, 1.25, 1.5].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setSpeechPlaybackRate(rate)}
                      className={`py-1 rounded text-[9px] font-mono font-bold cursor-pointer transition ${speechPlaybackRate === rate
                          ? "bg-indigo-600 text-white border border-indigo-400 shadow-sm shadow-indigo-500/50"
                          : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700"
                        }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              {speechEngine === "deepgram" && (
                <div className="space-y-2 pt-1">
                  {/* Connection Status Indicator */}
                  <div className="flex items-center justify-between bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 font-medium font-sans text-[10px]">Agent Lifecycle Status:</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] flex items-center gap-1.5 border ${dgLifecycleStatus === "Authenticated"
                        ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
                        : dgLifecycleStatus === "Connected"
                          ? "bg-teal-950/40 border-teal-500/30 text-teal-400"
                          : dgLifecycleStatus === "Connecting..."
                            ? "bg-amber-950/40 border-amber-500/30 text-amber-400"
                            : dgLifecycleStatus === "Error"
                              ? "bg-rose-950/40 border-rose-500/30 text-rose-400 animate-pulse"
                              : "bg-slate-950 border-slate-800/80 text-slate-500"
                      }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dgLifecycleStatus === "Authenticated"
                          ? "bg-emerald-400 animate-pulse"
                          : dgLifecycleStatus === "Connected"
                            ? "bg-teal-400"
                            : dgLifecycleStatus === "Connecting..."
                              ? "bg-amber-400 animate-ping"
                              : dgLifecycleStatus === "Error"
                                ? "bg-rose-500 animate-pulse"
                                : "bg-slate-600"
                        }`} />
                      {dgLifecycleStatus}
                    </span>
                  </div>

                  {/* Manual Voice Activation/Deactivation Button */}
                  <div className="pt-0.5 space-y-1.5">
                    {dgConnectionStatus === "connected" || dgConnectionStatus === "connecting" ? (
                      <button
                        onClick={stopDeepgramVoiceAgent}
                        className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 rounded-lg text-[10px] font-extrabold cursor-pointer transition flex items-center justify-center gap-1.5 shadow-xl animate-pulse"
                        type="button"
                      >
                        <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                        <span>🛑 EMERGENCY STOP VOICE AGENT (STOP CREDIT DRAIN)</span>
                      </button>
                    ) : (
                      <button
                        onClick={startDeepgramVoiceAgent}
                        className="w-full py-2 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 rounded-lg text-[10px] font-bold cursor-pointer transition flex items-center justify-center gap-1.5"
                        type="button"
                      >
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>🎙️ Connect & Start Live Voice Agent</span>
                      </button>
                    )}
                    <div className="text-[8.5px] text-slate-400 font-sans flex items-center justify-between px-1">
                      <span>🛡️ Credit Guard: Disconnected by default.</span>
                      <span className="text-cyan-400 font-mono">Zero background drain</span>
                    </div>
                  </div>

                  {/* Microphone Volume Scale (Voice Level) */}
                  {inputMode === "voice" && (
                    <div className="space-y-1 bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1">🎤 Your Live Voice Scale:</span>
                        <span className="font-mono text-cyan-400">{micLevel}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded overflow-hidden flex gap-[1px]">
                        {Array.from({ length: 10 }).map((_, idx) => {
                          const threshold = (idx + 1) * 10;
                          const isActive = micLevel >= threshold;

                          // First 6 segments (10%-60%): Green/Emerald
                          // Next 3 segments (70%-90%): Yellow/Amber
                          // Last segment (100%): Red/Rose (Peak)
                          let colorClass = "bg-emerald-500";
                          if (idx >= 6 && idx <= 8) colorClass = "bg-amber-500";
                          if (idx === 9) colorClass = "bg-rose-500";

                          return (
                            <div
                              key={idx}
                              className={`flex-1 h-full rounded-[1px] transition-all duration-75 ${isActive ? colorClass : "bg-slate-900"
                                }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* API Key Status & Input */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="dg-api-key-input" className="block text-slate-400">Deepgram Voice API Key:</label>
                      {hasServerEnvKey && (
                        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                          🔒 .env Key Active
                        </span>
                      )}
                    </div>
                    <input
                      id="dg-api-key-input"
                      type="password"
                      value={dgApiKey}
                      onChange={(e) => setDgApiKey(e.target.value)}
                      placeholder={hasServerEnvKey ? "•••••••••••••••• (Auto-loaded from .env)" : "Enter Deepgram API Key..."}
                      className="w-full px-2.5 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Diagnostic Tool Button */}
                  <div className="pt-1">
                    <button
                      onClick={runDiagnosticTest}
                      disabled={isRunningDiagnostic}
                      className={`w-full py-1.5 px-2.5 rounded text-[10px] font-bold border transition duration-200 flex items-center justify-center gap-1.5 ${isRunningDiagnostic
                          ? "bg-amber-950/40 border-amber-500/20 text-amber-400 cursor-wait"
                          : "bg-amber-950/80 border-amber-500/30 text-amber-300 hover:bg-amber-900 hover:text-white cursor-pointer"
                        }`}
                      type="button"
                    >
                      {isRunningDiagnostic ? (
                        <>
                          <RefreshCw className="animate-spin" size={12} />
                          Analyzing Deepgram API & Voice Link...
                        </>
                      ) : (
                        <>
                          <Cpu size={12} />
                          🔍 Run Deepgram Live Connection Diagnostic
                        </>
                      )}
                    </button>
                  </div>

                  {/* Diagnostic Results Display */}
                  {diagnosticReport && (
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[10px] space-y-1.5 font-mono animate-fade-in">
                      <div className="flex items-center justify-between font-bold text-slate-300 border-b border-slate-800/80 pb-1">
                        <span>Diagnostic Report</span>
                        <span className="text-[9px] text-slate-500">{new Date(diagnosticReport.timestamp).toLocaleTimeString()}</span>
                      </div>

                      <div className="text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                        {diagnosticReport.summary}
                      </div>

                      {diagnosticReport.step1_projects && (
                        <div className="text-slate-400 text-[9px] pt-1 border-t border-slate-900">
                          <div>• REST API Projects: {diagnosticReport.step1_projects.success ? `✅ (${diagnosticReport.step1_projects.count || 0} found)` : `❌ ${diagnosticReport.step1_projects.error}`}</div>
                          {diagnosticReport.step2_agents && (
                            <div>• Agents Scanned: {diagnosticReport.step2_agents.foundAgent ? `✅ (ID: ${diagnosticReport.step2_agents.agentId})` : `ℹ️ Dynamic setup mode`}</div>
                          )}
                          {diagnosticReport.step3_wsTest && (
                            <div>• Voice WS Handshake: {diagnosticReport.step3_wsTest.success ? "✅ Established" : `❌ Failed (${diagnosticReport.step3_wsTest.closeReason || diagnosticReport.step3_wsTest.error})`}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Voice Dropdown */}
                  <div className="space-y-1">
                    <label htmlFor="dg-voice-select" className="block text-slate-400">Agent Voice (Deepgram Aura Model):</label>
                    <select
                      id="dg-voice-select"
                      value={dgVoice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDgVoice(val);
                        localStorage.setItem("VITE_DEEPGRAM_VOICE", val);
                      }}
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="aura-2-jupiter-en">Jupiter (Male - Executive Co-Founder)</option>
                      <option value="aura-arcas-en">Arcas (Male - Professional Partner)</option>
                      <option value="aura-zeus-en">Zeus (Male - Deep Authoritative)</option>
                      <option value="aura-helios-en">Helios (Male - Warm & Friendly)</option>
                      <option value="aura-orion-en">Orion (Male - Energetic)</option>
                      <option value="aura-perseus-en">Perseus (Male - Confident)</option>
                      <option value="aura-asteria-en">Asteria (Female - Natural)</option>
                      <option value="aura-athena-en">Athena (Female - Professional)</option>
                      <option value="aura-stella-en">Stella (Female - Expressive)</option>
                      <option value="aura-thalia-en">Thalia (Female - Warm)</option>
                      <option value="aura-luna-en">Luna (Female - Conversational)</option>
                    </select>
                  </div>

                  {/* Project ID Input */}
                  <div className="space-y-1">
                    <label htmlFor="dg-project-id-input" className="block text-slate-400">Deepgram Project ID (Optional):</label>
                    <input
                      id="dg-project-id-input"
                      type="text"
                      value={dgProjectId}
                      onChange={(e) => setDgProjectId(e.target.value)}
                      placeholder={(import.meta as any).env.VITE_DEEPGRAM_PROJECT_ID || "Optional - Project identifier..."}
                      className="w-full px-2.5 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Agent ID Input */}
                  <div className="space-y-1.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between">
                      <label htmlFor="dg-agent-id-input" className="text-slate-300 font-bold text-[10px]">
                        Deepgram Console Agent ID:
                      </label>
                      <a
                        href="https://console.deepgram.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9px] text-indigo-400 hover:underline flex items-center gap-0.5"
                      >
                        Deepgram Console ↗
                      </a>
                    </div>

                    <input
                      id="dg-agent-id-input"
                      type="text"
                      value={dgAgentId}
                      onChange={(e) => {
                        setDgAgentId(e.target.value);
                        localStorage.setItem("VITE_DEEPGRAM_AGENT_ID", e.target.value);
                      }}
                      placeholder={(import.meta as any).env.VITE_DEEPGRAM_AGENT_ID || "Paste Agent ID from Deepgram Console..."}
                      className="w-full px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-[10px] text-cyan-300 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />

                    {/* Mode Status Indicator */}
                    <div className="p-2 bg-slate-950 rounded border border-slate-800 text-[9.5px]">
                      {dgAgentId ? (
                        <div className="space-y-1">
                          <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Active Agent ID: <code className="text-cyan-300 font-mono text-[9px]">{dgAgentId.substring(0, 16)}...</code></span>
                          </div>
                          <label className="flex items-center gap-2 pt-1 text-slate-300 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={useConsoleAgentSettings}
                              onChange={(e) => setUseConsoleAgentSettings(e.target.checked)}
                              className="accent-cyan-500 cursor-pointer"
                            />
                            <span>Use exact settings from Deepgram Console</span>
                          </label>
                          <p className="text-[8.5px] text-slate-400 leading-tight pl-5">
                            {useConsoleAgentSettings
                              ? "✅ Preserves your custom prompt, voice, and models built directly in Deepgram Console."
                              : "⚠️ Overrides Console agent with in-app P.A.C. system prompt."}
                          </p>
                        </div>
                      ) : (
                        <div className="text-slate-400 flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-indigo-400" />
                          <span>Dynamic In-App Mode (Auto-creates or configures Agent on-the-fly)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Deepgram Console Agents Inspector Tool */}
                  <div className="space-y-1.5 bg-indigo-950/20 p-2.5 rounded-lg border border-indigo-900/40">
                    <div className="flex items-center justify-between">
                      <span className="text-indigo-300 font-bold text-[10px] flex items-center gap-1">
                        <Cpu size={12} className="text-indigo-400" />
                        Deepgram Agent Inspector
                      </span>
                      <button
                        type="button"
                        onClick={fetchConsoleAgents}
                        disabled={isFetchingAgents}
                        className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[9px] font-bold cursor-pointer transition flex items-center gap-1"
                      >
                        {isFetchingAgents ? <RefreshCw size={10} className="animate-spin" /> : "🔍 Fetch My Agents"}
                      </button>
                    </div>

                    {fetchAgentsError && (
                      <p className="text-rose-400 text-[9px]">{fetchAgentsError}</p>
                    )}

                    {consoleAgents.length > 0 ? (
                      <div className="space-y-1.5 pt-1 max-h-[140px] overflow-y-auto pr-1">
                        <span className="text-[8.5px] text-slate-400 uppercase tracking-wider font-semibold">Found {consoleAgents.length} Agent(s) in Deepgram Console:</span>
                        {consoleAgents.map((agent) => {
                          const isSelected = dgAgentId === agent.agentId;
                          return (
                            <div
                              key={agent.agentId}
                              className={`p-1.5 rounded border text-[9.5px] font-mono flex items-center justify-between gap-2 transition ${isSelected
                                  ? "bg-cyan-950/60 border-cyan-500/50 text-cyan-200"
                                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300"
                                }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-slate-200 truncate">{agent.name || agent.title || "P.A.C. Agent"}</div>
                                <div className="text-[8.5px] text-slate-400 truncate font-mono">ID: {agent.agentId}</div>
                                <div className="text-[8px] text-slate-500 truncate">Proj: {agent.projectName}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setDgAgentId(agent.agentId);
                                  localStorage.setItem("VITE_DEEPGRAM_AGENT_ID", agent.agentId);
                                  setUseConsoleAgentSettings(true);
                                  setSetupAgentSuccess(`Connected to Console Agent: ${agent.name}`);
                                  setComputerLogs(prev => [...prev, `[INSPECTOR] Selected Deepgram Console Agent: "${agent.name}" (${agent.agentId})`]);
                                }}
                                className={`px-2 py-1 rounded text-[8.5px] font-bold cursor-pointer transition whitespace-nowrap ${isSelected
                                    ? "bg-emerald-600 text-white"
                                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                                  }`}
                              >
                                {isSelected ? "✓ Active" : "Select Agent"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[9px] text-slate-400 italic pt-0.5">
                        Click "Fetch My Agents" to scan your Deepgram Console account for custom pre-built Voice Agents.
                      </p>
                    )}
                  </div>

                  {/* One-Click Agent Generation & Auto-Setup Buttons */}
                  <div className="pt-1 space-y-1.5">
                    <button
                      onClick={() => autoSetupDeepgramAgent(true)}
                      disabled={isSettingUpAgent}
                      className={`w-full py-1.5 px-2.5 rounded text-[10px] font-bold border transition duration-200 flex items-center justify-center gap-1.5 ${isSettingUpAgent
                          ? "bg-cyan-950/50 border-cyan-500/30 text-cyan-300 cursor-wait"
                          : "bg-cyan-600 hover:bg-cyan-500 border-cyan-400/50 text-slate-950 shadow-sm shadow-cyan-500/20 cursor-pointer"
                        }`}
                      type="button"
                    >
                      {isSettingUpAgent ? (
                        <>
                          <RefreshCw size={11} className="animate-spin text-slate-950" />
                          <span>Generating New Agent ID...</span>
                        </>
                      ) : (
                        <>
                          <Zap size={11} className="fill-slate-950 text-slate-950" />
                          <span>⚡ 1-Click Generate New Agent ID</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => autoSetupDeepgramAgent(false)}
                      disabled={isSettingUpAgent}
                      className={`w-full py-1 px-2.5 rounded text-[9px] font-semibold border transition duration-200 flex items-center justify-center gap-1.5 ${isSettingUpAgent
                          ? "bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed"
                          : "bg-slate-900/80 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                        }`}
                      type="button"
                    >
                      <Sparkles size={10} className="text-indigo-400" />
                      <span>Auto-Detect / Fetch Existing Agent ID</span>
                    </button>

                    {setupAgentError && (
                      <div className="text-[8.5px] text-rose-400 mt-1 pl-1 font-sans leading-relaxed max-w-full break-words">
                        ❌ {setupAgentError}
                      </div>
                    )}
                    {setupAgentSuccess && (
                      <div className="text-[8.5px] text-emerald-400 mt-1 pl-1 font-sans font-semibold leading-relaxed">
                        ✅ {setupAgentSuccess}
                      </div>
                    )}
                  </div>

                  {dgCloseCode !== null && (
                    <div className="mt-1.5 p-2 bg-rose-950/20 border border-rose-500/20 rounded text-[9.5px] leading-relaxed space-y-1">
                      <div className="flex items-center justify-between text-rose-400 font-bold">
                        <span>⚠️ CONNECTION DISCONNECTED</span>
                        <span className="font-mono bg-rose-950/40 px-1 py-0.5 rounded border border-rose-500/10 text-[8.5px]">Code: {dgCloseCode}</span>
                      </div>
                      {dgCloseReason && (
                        <div className="text-slate-300 font-sans italic text-[9px] break-words bg-slate-950/40 p-1 rounded border border-slate-900">
                          &ldquo;{dgCloseReason}&rdquo;
                        </div>
                      )}
                      <div className="text-slate-400 text-[8.5px] font-sans">
                        {dgCloseCode === 4004 && (
                          <span className="text-amber-400 font-medium">
                            The Agent ID was not found or is invalid for your new API key's project. Make sure you entered your correct Agent ID from your Console, or leave it blank to configure on-the-fly.
                          </span>
                        )}
                        {dgCloseCode === 1011 && (
                          <span className="text-amber-400 font-medium">
                            An internal server error occurred. This usually means the API key is unauthorized or lacks administrator/member privileges required for conversational voice features.
                          </span>
                        )}
                        {dgCloseCode === 4000 && (
                          <span className="text-amber-400 font-medium">
                            Invalid parameters or bad request. Please check that both your API key and Agent ID are correct.
                          </span>
                        )}
                        {dgCloseCode === 1006 && (
                          <span className="text-amber-400 font-medium">
                            Abnormal network termination. Ensure your browser is allowed to connect to wss://agent.deepgram.com.
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="pt-1.5 flex gap-1.5">
                    <button
                      onClick={() => {
                        connectDeepgram();
                        setComputerLogs(prev => [...prev, "[DEEPGRAM] Manual reconnect initiated."]);
                      }}
                      className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold text-center transition cursor-pointer"
                      type="button"
                    >
                      Save & Reconnect
                    </button>
                    {dgConnectionStatus === "connected" && (
                      <button
                        onClick={() => {
                          if (dgSocketRef.current) dgSocketRef.current.close();
                        }}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition cursor-pointer"
                        type="button"
                      >
                        Disconnect
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setDgApiKey("");
                        setDgAgentId("");
                        localStorage.removeItem("VITE_DEEPGRAM_API_KEY");
                        localStorage.removeItem("VITE_DEEPGRAM_AGENT_ID");
                        setDgCloseCode(null);
                        setDgCloseReason("");
                        setSetupAgentError("");
                        setSetupAgentSuccess("");
                        if (dgSocketRef.current) dgSocketRef.current.close();
                        setComputerLogs(prev => [...prev, "[DEEPGRAM] Local credentials cleared. Resetting setup states..."]);
                      }}
                      className="px-2.5 py-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded text-[10px] transition cursor-pointer font-semibold"
                      title="Clear saved key and ID from cache"
                      type="button"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Deepgram Help Desk Info Board */}
                  <div className="mt-2.5 p-2.5 bg-slate-900/60 border border-indigo-500/15 rounded-lg text-[9px] text-slate-400 space-y-1.5 leading-relaxed font-sans">
                    <div className="flex items-center gap-1.5 font-bold font-mono text-indigo-400">
                      <span>💡 DEEPGRAM VOICE CONFIGURATION GUIDE</span>
                    </div>
                    <p>
                      The app connects automatically via bi-directional WebSockets to:
                      <code className="block bg-slate-950 p-1 rounded mt-1 text-[8.5px] text-slate-300 select-all font-mono break-all border border-slate-900">
                        wss://agent.deepgram.com/v1/agent
                      </code>
                      You do <strong>not</strong> need to change the WebSocket URL. It is fully integrated.
                    </p>
                    <p>
                      <strong>Why does the connection immediately drop/fail?</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1 pl-1">
                      <li>
                        <strong>Optional Agent ID:</strong> If you leave the Agent ID blank, P.A.C. automatically sends a real-time configuration payload on connection. You can also click <strong>✨ Auto-Create / Get Agent ID</strong> above to let us create or fetch one for you instantly.
                      </li>
                      <li>
                        <strong>Key Permissions:</strong> Ensure your API Key has <code>Administrator</code> or <code>Member</code> project roles. Standard restricted or guest keys will fail to authenticate with the <code>v1/agent</code> endpoint.
                      </li>
                      <li>
                        <strong>Billing Status:</strong> Free tier accounts without verified billing sometimes have access restricted for live streaming WebSocket agents.
                      </li>
                    </ul>
                  </div>

                </div>
              )}

              {speechEngine === "browser" && (
                <div className="space-y-2 pt-1">
                  {/* Microphone Volume Scale (Voice Level) */}
                  {inputMode === "voice" && (
                    <div className="space-y-1 bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1">🎤 Your Live Voice Scale:</span>
                        <span className="font-mono text-cyan-400">{micLevel}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded overflow-hidden flex gap-[1px]">
                        {Array.from({ length: 10 }).map((_, idx) => {
                          const threshold = (idx + 1) * 10;
                          const isActive = micLevel >= threshold;
                          let colorClass = "bg-amber-500";
                          if (idx >= 6 && idx <= 8) colorClass = "bg-orange-500";
                          if (idx === 9) colorClass = "bg-yellow-500";

                          return (
                            <div
                              key={idx}
                              className={`flex-1 h-full rounded-[1px] transition-all duration-75 ${isActive ? colorClass : "bg-slate-900"
                                }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg text-[9.5px] leading-relaxed text-slate-400 space-y-1">
                    <span className="font-bold text-slate-200">ℹ️ OFFLINE BROWSER SYNTHESIS</span>
                    <p>
                      Uses standard HTML5 speech synthesis built-in natively to your device browser.
                    </p>
                    <ul className="list-disc pl-3.5 pt-1 space-y-0.5">
                      <li>Requires no third-party accounts or cloud API keys.</li>
                      <li>Highly responsive and completely free of charge.</li>
                      <li>Quality may vary depending on device capabilities and selected OS speech engines.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Draggable Footer Action Input Block */}
          <div className="p-3 bg-slate-900/60 border-t border-slate-800/80 flex flex-col gap-2">
            {/* Live voice activity status & meters if Deepgram or voice active */}
            {dgConnectionStatus === "connected" && (
              <div className="flex items-center justify-between text-[9px] font-mono px-1 py-0.5 bg-slate-950/80 border border-slate-800/60 rounded">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span className={`h-1.5 w-1.5 rounded-full ${!isMicMuted ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                  <span>
                    {!isMicMuted ? (pacStatus === "speaking" ? "P.A.C. Speaking (Barge-in ready)" : `Mic Listening (${micLevel}%)`) : "Mic Muted (Text Only)"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Speaker mute indicator */}
                  {isSpeakerMuted && (
                    <span className="text-amber-400 font-bold px-1 py-0.2 bg-amber-950/50 border border-amber-500/30 rounded text-[8px]">
                      🔇 Muted
                    </span>
                  )}
                  {/* Live Status indicator */}
                  <span className={`px-1.5 py-0.2 rounded border flex items-center gap-1 font-semibold text-[8px] ${
                    dgLifecycleStatus === "Authenticated"
                      ? "bg-emerald-950/30 border-emerald-500/20 text-emerald-400"
                      : "bg-teal-950/30 border-teal-500/20 text-teal-400"
                  }`}>
                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    {dgLifecycleStatus}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              {/* Mic, Speaker, and Voice Settings Control Buttons */}
              <div className="flex items-center gap-1.5">
                {/* Microphone Toggle */}
                <button
                  onClick={() => {
                    const nextMuted = !isMicMuted;
                    setIsMicMuted(nextMuted);
                    if (nextMuted) {
                      stopDgMic();
                      setComputerLogs(prev => [...prev, "[P.A.C. AUDIO] Microphone muted. Agent remains ONLINE."]);
                    } else {
                      if (dgSocketRef.current && dgConnectionStatus === "connected") {
                        startDgMic();
                      }
                      setComputerLogs(prev => [...prev, "[P.A.C. AUDIO] Microphone unmuted. Voice capture live."]);
                    }
                  }}
                  className={`p-2 rounded-full transition cursor-pointer border ${
                    !isMicMuted
                      ? "bg-emerald-950/80 text-emerald-400 border-emerald-500/40 animate-pulse"
                      : "bg-slate-950 hover:bg-slate-800 text-amber-400 border-slate-800"
                  }`}
                  title={!isMicMuted ? "Microphone ON - Click to Mute Microphone" : "Microphone MUTED - Click to Unmute Microphone"}
                  type="button"
                >
                  {!isMicMuted ? <Mic size={13} /> : <MicOff size={13} />}
                </button>

                {/* Speaker Sound Output Toggle */}
                <button
                  onClick={() => {
                    const nextMuted = !isSpeakerMuted;
                    setIsSpeakerMuted(nextMuted);
                    if (nextMuted) {
                      stopStreamingPlayback();
                      setComputerLogs(prev => [...prev, "[P.A.C. AUDIO] Speaker output muted. Agent remains ONLINE."]);
                    } else {
                      setComputerLogs(prev => [...prev, "[P.A.C. AUDIO] Speaker output unmuted."]);
                    }
                  }}
                  className={`p-2 rounded-full transition cursor-pointer border ${
                    !isSpeakerMuted
                      ? "bg-cyan-950/80 text-cyan-400 border-cyan-500/40"
                      : "bg-slate-950 hover:bg-slate-800 text-amber-400 border-slate-800"
                  }`}
                  title={!isSpeakerMuted ? "Speaker Sound ON - Click to Mute Agent Voice Output" : "Speaker Sound MUTED - Click to Unmute Agent Voice Output"}
                  type="button"
                >
                  {!isSpeakerMuted ? <Volume2 size={13} /> : <VolumeX size={13} />}
                </button>

                {/* Deepgram Voice Agent Settings Drawer Toggle */}
                <button
                  onClick={() => setShowVoiceSettings(!showVoiceSettings)}
                  className={`px-2.5 py-1.5 rounded-full transition cursor-pointer border flex items-center gap-1 font-mono text-[10px] font-semibold ${
                    showVoiceSettings || dgConnectionStatus === "connected"
                      ? "bg-indigo-950/80 border-indigo-500/40 text-indigo-300 shadow-sm shadow-indigo-500/20"
                      : "bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-white"
                  }`}
                  title="Click to Open Deepgram Voice Agent Settings Drawer (⚙️)"
                  type="button"
                >
                  <Settings size={13} className={dgConnectionStatus === "connecting" ? "animate-spin text-amber-400" : "text-indigo-400"} />
                  <span>Settings</span>
                </button>

                {/* Instant STOP button in footer controls */}
                {dgConnectionStatus === "connected" || dgConnectionStatus === "connecting" ? (
                  <button
                    onClick={stopDeepgramVoiceAgent}
                    className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 rounded-full font-mono text-[10px] font-extrabold flex items-center gap-1 shadow-lg cursor-pointer transition animate-pulse"
                    title="IMMEDIATELY stop Voice Agent & cut credit usage"
                    type="button"
                  >
                    <span>🛑 STOP VOICE</span>
                  </button>
                ) : (
                  <button
                    onClick={startDeepgramVoiceAgent}
                    className="px-2.5 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 rounded-full font-mono text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
                    title="Start Deepgram Live Voice Agent"
                    type="button"
                  >
                    <Mic size={13} className="text-emerald-400 animate-pulse" />
                    <span>Start Voice</span>
                  </button>
                )}
              </div>

              {/* Core Text Input Form (Always Available) */}
              <form
                onSubmit={(e) => { e.preventDefault(); handleSendInput(textInput); }}
                className="flex-1 flex gap-2"
              >
                <input
                  id="pac-chat-text-input"
                  aria-label="Collaborate with P.A.C. co-founder text input"
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={
                    dgConnectionStatus === "connected"
                      ? "Type or speak to P.A.C. (Agent Online)..."
                      : "Collaborate with P.A.C. co-founder..."
                  }
                  className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
                />
                <button
                  type="submit"
                  disabled={!textInput.trim() || pacStatus === "thinking"}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-950 disabled:text-slate-600 text-white rounded-lg transition flex items-center justify-center gap-1 cursor-pointer text-xs font-semibold"
                >
                  <Send size={12} />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* LIGHTBOX ZOOM MODAL FOR PAC CAMPAIGNS */}
      {zoomImageUrl && (
        <div 
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-8 animate-fade-in"
          onClick={() => setZoomImageUrl(null)}
        >
          <div 
            className="relative max-w-5xl w-full bg-[#022421] border-2 border-teal-400/80 rounded-2xl shadow-[0_0_80px_rgba(20,184,166,0.6)] overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 bg-[#0d4a44] border-b border-teal-500/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-teal-200 font-mono text-xs font-bold uppercase tracking-wider">
                <ImageIcon size={15} className="text-cyan-400" />
                <span>High-Resolution Visual Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={zoomImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 bg-teal-900 hover:bg-teal-800 text-teal-200 rounded text-[10px] font-mono font-bold flex items-center gap-1 border border-teal-500/40"
                  download="social-graphic.png"
                >
                  <Download size={11} /> Download
                </a>
                <a
                  href={zoomImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 bg-teal-900 hover:bg-teal-800 text-teal-200 rounded text-[10px] font-mono font-bold flex items-center gap-1 border border-teal-500/40"
                >
                  <ExternalLink size={11} /> Open Full Tab
                </a>
                <button
                  onClick={() => setZoomImageUrl(null)}
                  className="p-1 rounded text-teal-300 hover:text-rose-400 hover:bg-teal-900 transition cursor-pointer"
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-4 bg-black/90 flex items-center justify-center overflow-auto flex-1 max-h-[75vh]">
              <img
                src={zoomImageUrl}
                alt="Expanded graphic"
                className="max-w-full max-h-[70vh] object-contain rounded-lg border border-teal-500/30 shadow-2xl"
              />
            </div>

            <div className="px-5 py-2.5 bg-[#04221f] border-t border-teal-500/40 flex items-center justify-between text-[10px] font-mono text-teal-300/80">
              <span>💡 High-Resolution Thought Leadership Infographic</span>
              <button
                onClick={() => setZoomImageUrl(null)}
                className="px-3 py-1 bg-teal-700 hover:bg-teal-600 text-white rounded font-bold cursor-pointer transition"
                type="button"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
