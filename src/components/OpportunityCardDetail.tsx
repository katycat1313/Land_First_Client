import React, { useState } from "react";
import { Opportunity } from "../types";
import { 
  X, ExternalLink, Copy, Check, Sparkles, 
  Layers, Lightbulb, ShieldAlert, Award, Calendar, RefreshCw, 
  Flame, Gauge, DollarSign, PenTool, ClipboardList, HelpCircle,
  MessageSquare, Send, Mail, User, ArrowUp, ArrowDown, Share2, Bookmark
} from "lucide-react";
import { User as FirebaseUser } from "firebase/auth";
import { fetchGmailThread, sendGmailEmail } from "../utils/gmailApi";

interface OpportunityCardDetailProps {
  opportunity: Opportunity;
  onClose: () => void;
  onSave: (updated: Opportunity) => Promise<void>;
  onDraftResponse: (opp: Opportunity, guidance: string) => Promise<{ responseDraft: string; suggestedQuestions: string[]; valueAdditionIdeas: string[] }>;
  gmailUser: FirebaseUser | null;
  gmailToken: string | null;
  onGmailLogin: () => Promise<void>;
  onGmailLogout: () => Promise<void>;
}

export default function OpportunityCardDetail({ 
  opportunity, 
  onClose, 
  onSave,
  onDraftResponse,
  gmailUser,
  gmailToken,
  onGmailLogin,
  onGmailLogout
}: OpportunityCardDetailProps) {
  const [status, setStatus] = useState<Opportunity["status"]>(opportunity.status);
  const [notes, setNotes] = useState(opportunity.notes || "");
  const [followUpDate, setFollowUpDate] = useState(opportunity.followUpDate || "");
  const [guidance, setGuidance] = useState("");
  const [draft, setDraft] = useState(opportunity.responseDraft || "");
  const [questions, setQuestions] = useState<string[]>(opportunity.suggestedQuestions || []);
  const [valueIdeas, setValueIdeas] = useState<string[]>(opportunity.valueAdditionIdeas || []);
  
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoggingMessage, setIsLoggingMessage] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);

  // Gmail REST integration states
  const [recipientEmail, setRecipientEmail] = useState(opportunity.gmailSentTo || "");
  const [emailSubject, setEmailSubject] = useState(`Regarding your ${opportunity.industry || "workflow"} challenge`);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [gmailMessages, setGmailMessages] = useState<Array<{ id: string; from: string; to: string; date: string; snippet: string; body: string; isOutbound: boolean }>>([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [quickReplyText, setQuickReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  // NEW: Solution Options & Pricing tab state
  const [activeLeftTab, setActiveLeftTab] = useState<'original' | 'dossier' | 'pricing'>('original');
  const [showErrorPopup, setShowErrorPopup] = useState(true);
  
  // Backwards-compatible options list fallback
  const getFallbackOptions = (): any[] => {
    const isHighPain = opportunity.painLevel === "High";
    const baseScore = opportunity.opportunityScore || 80;
    return [
      {
        id: `${opportunity.id}-opt-1`,
        rank: 1,
        title: "⚡ Custom Dedicated MVP (One-Time Build + Maintenance Combo)",
        type: "custom",
        description: `A custom-tailored private application built precisely to automate this bottleneck: ${opportunity.possibleSolution || "automated processing"}. Integrates cleanly with their legacy folder schemas, custom sheets, or EHR workflows.`,
        techStackSuggested: "React, Node.js, Tailwind, SQLite, Gemini AI",
        oneTimeFee: isHighPain ? 2500 : 1200,
        subscriptionFee: isHighPain ? 99 : 49,
        consultingFee: 0,
        timeToBuild: "7-10 days",
        difficulty: opportunity.difficulty || "Medium",
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
        id: `${opportunity.id}-opt-2`,
        rank: 2,
        title: "🛰️ Multi-User Product Platform (SaaS / Subscription Only)",
        type: "saas",
        description: `A standard multi-tenant subscription software for the ${opportunity.industry || "general"} market. Solve this recurring headache with zero upfront fees. Best if thousands of other small operators face this exact same bottleneck.`,
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
        id: `${opportunity.id}-opt-3`,
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

  const solutionOptions = opportunity.solutionOptions && opportunity.solutionOptions.length > 0 
    ? opportunity.solutionOptions 
    : getFallbackOptions();

  const [selectedOptionId, setSelectedOptionId] = useState<string>(solutionOptions[0]?.id);
  const activeOption = solutionOptions.find(o => o.id === selectedOptionId) || solutionOptions[0];

  // Sliders/modeling overrides
  const [overrideOneTime, setOverrideOneTime] = useState<number | null>(null);
  const [overrideSub, setOverrideSub] = useState<number | null>(null);
  const [overrideConsulting, setOverrideConsulting] = useState<number | null>(null);
  const [estimatedClients, setEstimatedClients] = useState<number>(10);

  // Sync pricing overrides when selected option changes
  React.useEffect(() => {
    if (activeOption) {
      setOverrideOneTime(activeOption.oneTimeFee);
      setOverrideSub(activeOption.subscriptionFee);
      setOverrideConsulting(activeOption.consultingFee);
    }
  }, [selectedOptionId]);

  const currentOneTime = overrideOneTime !== null ? overrideOneTime : (activeOption?.oneTimeFee || 0);
  const currentSub = overrideSub !== null ? overrideSub : (activeOption?.subscriptionFee || 0);
  const currentConsulting = overrideConsulting !== null ? overrideConsulting : (activeOption?.consultingFee || 0);

  // Totals calculations
  const totalUpfront = currentOneTime * estimatedClients;
  const mrr = (currentSub + currentConsulting) * estimatedClients;
  const arr = mrr * 12;
  const totalYearOne = totalUpfront + arr;

  const handleResetPricing = () => {
    if (activeOption) {
      setOverrideOneTime(activeOption.oneTimeFee);
      setOverrideSub(activeOption.subscriptionFee);
      setOverrideConsulting(activeOption.consultingFee);
    }
  };

  const handleCopyDraft = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefineDraft = async () => {
    setIsDrafting(true);
    try {
      const data = await onDraftResponse(opportunity, guidance);
      setDraft(data.responseDraft);
      if (data.suggestedQuestions && data.suggestedQuestions.length > 0) {
        setQuestions(data.suggestedQuestions);
      }
      if (data.valueAdditionIdeas && data.valueAdditionIdeas.length > 0) {
        setValueIdeas(data.valueAdditionIdeas);
      }
      setGuidance("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsDrafting(false);
    }
  };

  // Load Gmail thread messages if we have a linked thread
  React.useEffect(() => {
    if (gmailToken && opportunity.gmailThreadId) {
      loadGmailThread();
    }
  }, [gmailToken, opportunity.gmailThreadId]);

  const loadGmailThread = async () => {
    if (!gmailToken || !opportunity.gmailThreadId) return;
    setIsLoadingThread(true);
    setThreadError("");
    try {
      const messages = await fetchGmailThread(gmailToken, opportunity.gmailThreadId);
      setGmailMessages(messages);
    } catch (err: any) {
      console.error("Error loading Gmail thread:", err);
      setThreadError("Failed to sync latest messages from Gmail.");
    } finally {
      setIsLoadingThread(false);
    }
  };

  const handleSendInitialEmail = async () => {
    if (!gmailToken) return;
    if (!recipientEmail || !recipientEmail.includes("@")) {
      alert("Please enter a valid recipient email address.");
      return;
    }

    const confirmed = window.confirm(`Send this outreach email to ${recipientEmail} via Gmail?`);
    if (!confirmed) return;

    setIsSendingEmail(true);
    try {
      const result = await sendGmailEmail(
        gmailToken,
        recipientEmail,
        emailSubject,
        draft
      );

      // Successfully sent! Now update CRM status to 'Contacted' and store Gmail identifiers
      const updatedOpp: Opportunity = {
        ...opportunity,
        status: "Contacted",
        gmailThreadId: result.threadId,
        gmailMessageId: result.messageId,
        gmailSentTo: recipientEmail,
        gmailLastSynced: new Date().toISOString()
      };

      // Set internal state so the view switches to Conversation Stream
      setStatus("Contacted");
      
      await onSave(updatedOpp);
      alert("Email sent successfully and logged in CRM!");
      // load thread right after sending
      const messages = await fetchGmailThread(gmailToken, result.threadId);
      setGmailMessages(messages);
    } catch (err: any) {
      console.error("Error sending Gmail:", err);
      alert("Failed to send email: " + err.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendQuickReply = async () => {
    if (!gmailToken || !opportunity.gmailThreadId || !quickReplyText.trim()) return;

    setIsSendingReply(true);
    try {
      const lastMsg = gmailMessages[gmailMessages.length - 1];
      const replySubject = emailSubject.startsWith("Re:") ? emailSubject : `Re: ${emailSubject}`;
      const lastMsgId = lastMsg?.id;

      await sendGmailEmail(
        gmailToken,
        opportunity.gmailSentTo || recipientEmail,
        replySubject,
        quickReplyText,
        opportunity.gmailThreadId,
        lastMsgId
      );

      setQuickReplyText("");
      // Sync messages
      const messages = await fetchGmailThread(gmailToken, opportunity.gmailThreadId);
      setGmailMessages(messages);
    } catch (err: any) {
      console.error("Error sending quick reply:", err);
      alert("Failed to send reply: " + err.message);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleSaveCRM = async () => {
    setIsSaving(true);
    try {
      const updatedOpp: Opportunity = {
        ...opportunity,
        status,
        notes,
        followUpDate: followUpDate || undefined,
        responseDraft: draft,
        suggestedQuestions: questions,
        valueAdditionIdeas: valueIdeas
      };
      await onSave(updatedOpp);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkSentAndLog = async () => {
    setIsLoggingMessage(true);
    try {
      const today = new Date().toLocaleDateString();
      const updatedNotes = `${notes ? notes + "\n\n" : ""}[${today} - System Log] Sent outreach message via platform dispatcher:\n"${draft.substring(0, 150)}..."`;
      setNotes(updatedNotes);
      setStatus("Contacted");
      
      const updatedOpp: Opportunity = {
        ...opportunity,
        status: "Contacted",
        notes: updatedNotes,
        followUpDate: followUpDate || undefined,
        responseDraft: draft,
        suggestedQuestions: questions,
        valueAdditionIdeas: valueIdeas
      };
      await onSave(updatedOpp);
      setLogSuccess(true);
      setTimeout(() => setLogSuccess(false), 3000);
    } catch (err) {
      console.error("Error logging sent message:", err);
    } finally {
      setIsLoggingMessage(false);
    }
  };

  // Helper to clean prefixes from evidence string for simulated thread body
  const getCleanedPostText = (evidenceStr: string, authorStr: string) => {
    if (!evidenceStr) return "";
    let clean = evidenceStr;
    const authorLower = authorStr.toLowerCase();
    const prefixes = [
      `${authorLower} writes:`,
      `${authorLower} notes:`,
      `${authorLower} says:`,
      `${authorLower} explains:`,
      `user writes:`,
      `user notes:`,
      `user says:`,
      `jenn writes:`,
      `boston_builder writes:`,
      `sparkyestimates writes:`,
      `taxpro_jenn writes:`
    ];
    
    const lowercaseClean = clean.toLowerCase();
    for (const prefix of prefixes) {
      if (lowercaseClean.startsWith(prefix)) {
        clean = clean.substring(prefix.length).trim();
        break;
      }
    }
    
    clean = clean.replace(/^['"“\s]+/, '').replace(/['"”\s]+$/, '');
    return clean;
  };

  // Score color helper
  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-500 border-emerald-500/20 bg-emerald-500/5";
    if (score >= 70) return "text-amber-500 border-amber-500/20 bg-amber-500/5";
    return "text-rose-500 border-rose-500/20 bg-rose-500/5";
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-end bg-slate-950/80 backdrop-blur-sm transition-opacity" id="detail-overlay">
      <div className="h-full w-full max-w-5xl bg-slate-950 border-l border-slate-800 flex flex-col shadow-2xl text-slate-100" id="detail-drawer">
        
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider ${
              opportunity.sourcePlatform.includes("Reddit") ? "bg-orange-500/15 text-orange-400 border border-orange-500/20" :
              opportunity.sourcePlatform.includes("Hacker News") ? "bg-amber-600/15 text-amber-500 border border-amber-600/20" :
              opportunity.sourcePlatform.includes("GitHub") ? "bg-purple-500/15 text-purple-400 border border-purple-500/20" :
              "bg-sky-500/15 text-sky-400 border border-sky-500/20"
            }`}>
              {opportunity.sourcePlatform}
            </span>
            {opportunity.classification && (
              <span className={`px-2 py-1 rounded text-xs font-mono font-medium uppercase tracking-wider border ${
                opportunity.classification === "help_seeker" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" :
                opportunity.classification === "solution_sharer" ? "bg-blue-500/15 text-blue-400 border-blue-500/20" :
                "bg-slate-500/15 text-slate-400 border-slate-500/20"
              }`}>
                {opportunity.classification.replace("_", " ")}
              </span>
            )}
            <span className="text-slate-400 font-mono text-xs">By {opportunity.author}</span>
          </div>
          <div className="flex items-center gap-2">
            <a 
              href={opportunity.sourceUrl} 
              target="_blank" 
              referrerPolicy="no-referrer"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 rounded border border-slate-700 transition"
              id="open-source-btn"
            >
              <span>Open Thread</span>
              <ExternalLink size={13} />
            </a>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition"
              id="close-drawer-btn"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Content Splitter */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          
          {/* Left Column: Interactive Tabbed Detail View */}
          <div className="lg:col-span-7 p-6 space-y-6 overflow-y-auto">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white mb-2">{opportunity.title}</h2>
              <div className="flex flex-wrap gap-2 items-center text-slate-400 text-xs mb-4">
                <span>Sector: <strong className="text-slate-200">{opportunity.industry}</strong></span>
                <span className="text-slate-700">•</span>
                <span>Detected: {new Date(opportunity.timestamp).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Tab Swapper */}
            <div className="flex border-b border-slate-800 gap-1 pb-px" id="dossier-tab-swapper">
              <button
                onClick={() => setActiveLeftTab('original')}
                className={`pb-2 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  activeLeftTab === 'original' 
                    ? 'text-orange-400 border-orange-400' 
                    : 'text-slate-500 hover:text-slate-300 border-transparent'
                }`}
                id="tab-original-btn"
              >
                💬 Live Post Preview
              </button>
              <button
                onClick={() => setActiveLeftTab('dossier')}
                className={`pb-2 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  activeLeftTab === 'dossier' 
                    ? 'text-sky-400 border-sky-400' 
                    : 'text-slate-500 hover:text-slate-300 border-transparent'
                }`}
                id="tab-dossier-btn"
              >
                📋 13-Point Pain Dossier
              </button>
              <button
                onClick={() => setActiveLeftTab('pricing')}
                className={`pb-2 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  activeLeftTab === 'pricing' 
                    ? 'text-emerald-400 border-emerald-400' 
                    : 'text-slate-500 hover:text-slate-300 border-transparent'
                }`}
                id="tab-pricing-btn"
              >
                💰 Solutions & Pricing
              </button>
            </div>

            {activeLeftTab === 'original' ? (
              <div className="space-y-6 animate-fade-in" id="left-tab-original">
                <div className="space-y-4">
                  
                  {/* Real Post Card */}
                  <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                          opportunity.sourcePlatform.includes("Reddit") ? "bg-orange-500/10 text-orange-400" :
                          opportunity.sourcePlatform.includes("Hacker News") ? "bg-amber-500/10 text-amber-500" :
                          "bg-sky-500/10 text-sky-400"
                        }`}>
                          {opportunity.sourcePlatform.includes("Reddit") ? "reddit / community" : "hn / discussion"}
                        </span>
                        <span className="text-slate-500 font-mono text-[11px]">Posted by</span>
                        <span className="text-slate-300 font-mono font-bold text-[11px]">u/{opportunity.author}</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        100% Authentic Signal
                      </span>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-md font-semibold text-white tracking-tight">
                        {opportunity.title}
                      </h3>
                      
                      {/* Actual Unedited Post Text */}
                      <div className="p-4 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                        {opportunity.fullPostText || opportunity.evidence || opportunity.problemSummary}
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-slate-800/60">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(opportunity.fullPostText || opportunity.evidence || opportunity.problemSummary);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition"
                      >
                        <Copy size={13} />
                        <span>{copied ? "Copied Content!" : "Copy Post Text"}</span>
                      </button>

                      <a
                        href={opportunity.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        referrerPolicy="no-referrer"
                        className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold transition"
                      >
                        <span>Inspect Live Discussion</span>
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>

                  {/* 100% Authenticity and Safe Linking Guarantee Box */}
                  <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/30 space-y-3">
                    <h4 className="text-xs font-bold tracking-wider font-mono text-slate-300 uppercase">
                      Platform Authenticity Shield
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      All simulated replies, mock votes, and placeholder forum comments have been completely purged from our workspace. The text displayed above is the genuine, raw payload captured directly from the live community thread.
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      To inspect secondary comments, view real-time upvotes, or reply directly to this poster, click <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline font-semibold">Inspect Live Discussion</a>. This opens the original, secure target thread in a browser tab using your native platform sessions.
                    </p>
                  </div>

                </div>
              </div>
            ) : activeLeftTab === 'dossier' ? (
              <div className="space-y-6 animate-fade-in" id="left-tab-dossier">
                {/* Score & Core Pain Summary Box */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="sm:col-span-1 flex flex-col items-center justify-center p-3 border-r border-slate-800/60">
                    <span className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Gauge size={12} /> Score</span>
                    <span className={`text-3xl font-mono font-bold ${getScoreColor(opportunity.opportunityScore).split(' ')[0]}`}>
                      {opportunity.opportunityScore}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 font-mono">out of 100</span>
                  </div>
                  
                  <div className="sm:col-span-3 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase">1. Core Problem Summary</span>
                      <p className="text-sm text-slate-200 leading-relaxed font-medium mt-1">
                        {opportunity.problemSummary}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Evidence Callout */}
                <div className="p-4 rounded-lg border-l-4 border-amber-500 bg-amber-500/5 space-y-1">
                  <span className="text-[10px] text-amber-400 font-mono tracking-wider uppercase flex items-center gap-1">
                    <ShieldAlert size={12} /> 5. Evidence of Frustration
                  </span>
                  <p className="text-xs text-slate-300 italic leading-relaxed">
                    "{opportunity.evidence}"
                  </p>
                </div>

                {/* Section: Context & Pain details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase block">3. Who experiences it</span>
                    <p className="text-sm text-slate-200 mt-1.5">{opportunity.whoIsExperiencing}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase block">4. Industry / Market Type</span>
                    <p className="text-sm text-slate-200 mt-1.5">{opportunity.industry}</p>
                  </div>
                </div>

                {/* Section: Pain level & Frequency */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase block">6. Pain Severity</span>
                    <div className="flex items-center gap-1.5">
                      <Flame size={14} className={opportunity.painLevel === "High" ? "text-rose-500" : "text-amber-500"} />
                      <span className={`text-sm font-semibold ${opportunity.painLevel === "High" ? "text-rose-400" : "text-amber-400"}`}>
                        {opportunity.painLevel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{opportunity.painLevelExplanation}</p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase block">7. Occurrence Frequency</span>
                    <span className="text-sm text-slate-200 block font-medium mt-1">{opportunity.frequency}</span>
                  </div>
                </div>

                {/* Section: Existing Alternatives & Weakness */}
                <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800/80">
                  <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase block">8. Current solutions & weaknesses</span>
                  <p className="text-sm text-slate-300 leading-relaxed mt-1.5">
                    {opportunity.currentSolutions}
                  </p>
                </div>

                {/* Section: AI Strategy / Solution */}
                <div className="p-4 rounded-lg bg-gradient-to-r from-indigo-950/40 to-slate-900 border border-indigo-500/20 space-y-2">
                  <span className="text-[10px] text-indigo-400 font-mono tracking-wider uppercase flex items-center gap-1">
                    <Sparkles size={12} /> 9. Possible AI or Software Solution
                  </span>
                  <p className="text-sm text-slate-200 leading-relaxed font-medium">
                    {opportunity.possibleSolution}
                  </p>
                </div>

                {/* Section: MVP & Estimations */}
                <div className="p-5 rounded-lg bg-slate-900 border border-slate-800 space-y-4">
                  <div>
                    <span className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase flex items-center gap-1">
                      <Award size={12} /> 10. Solo Developer MVP Concept (2-Week Build)
                    </span>
                    <p className="text-sm text-slate-200 font-semibold mt-1 leading-relaxed">
                      {opportunity.mvpIdea}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800/80">
                    <div>
                      <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase block">11. Dev Difficulty</span>
                      <span className={`text-sm font-semibold block mt-1 ${
                        opportunity.difficulty === "Easy" ? "text-emerald-400" :
                        opportunity.difficulty === "Medium" ? "text-amber-400" : "text-rose-400"
                      }`}>
                        {opportunity.difficulty}
                      </span>
                      <p className="text-xs text-slate-500 mt-0.5 leading-tight">{opportunity.difficultyExplanation}</p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase block">12. Willingness to pay</span>
                      <div className="flex items-center gap-1 font-semibold text-emerald-400 mt-1">
                        <DollarSign size={14} />
                        <span className="text-sm">{opportunity.willingnessToPay}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-fade-in" id="left-tab-pricing">
                {/* Section explanation */}
                <p className="text-xs text-slate-400 leading-relaxed">
                  Below are <strong className="text-emerald-400">ranked software fix options</strong> tailored for this problem, covering different architectural options and flexible monetization models (combining setup fees, regular SaaS subscriptions, and professional consulting). You can adjust sliders to calculate your customized potential return!
                </p>

                {/* Rank Selector Cards */}
                <div className="grid grid-cols-3 gap-3">
                  {solutionOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedOptionId(opt.id)}
                      className={`p-3 rounded-lg border text-left flex flex-col justify-between h-28 transition ${
                        selectedOptionId === opt.id 
                          ? "bg-slate-900 border-emerald-500 text-white shadow-lg ring-1 ring-emerald-500/20" 
                          : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          opt.rank === 1 ? "bg-amber-500/15 text-amber-400" : "bg-slate-800 text-slate-400"
                        }`}>
                          Rank #{opt.rank}
                        </span>
                        <span className="text-[9px] font-mono uppercase opacity-75">{opt.type}</span>
                      </div>
                      <span className="text-xs font-semibold leading-snug tracking-tight line-clamp-2 mt-2">
                        {opt.title.replace(/⚡|🛰️|🤝/, "").trim()}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Selected Option Detail Pane */}
                {activeOption && (
                  <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                          <Sparkles size={14} className="text-emerald-400" />
                          {activeOption.title}
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                          Suggested Tech Stack: <strong className="text-slate-200">{activeOption.techStackSuggested}</strong>
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-mono text-slate-500 block">EST. BUILD TIME</span>
                        <span className="text-xs font-bold text-emerald-400">{activeOption.timeToBuild}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-3 rounded border border-slate-800/80">
                      {activeOption.description}
                    </p>

                    {/* Pros and Cons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1.5">
                        <span className="font-semibold text-emerald-400 block font-mono text-[9px] uppercase tracking-wider">Pros</span>
                        <ul className="space-y-1 text-slate-300 list-inside list-disc">
                          {activeOption.pros.map((p: string, i: number) => (
                            <li key={i} className="leading-relaxed">{p}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-1.5">
                        <span className="font-semibold text-rose-400 block font-mono text-[9px] uppercase tracking-wider">Cons / Tradeoffs</span>
                        <ul className="space-y-1 text-slate-300 list-inside list-disc">
                          {activeOption.cons.map((c: string, i: number) => (
                            <li key={i} className="leading-relaxed">{c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* suggested base pricing display */}
                    <div className="pt-3 border-t border-slate-800/80">
                      <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase block mb-2">Original AI Suggested Pricing</span>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-slate-950/60 rounded border border-slate-800/80">
                          <span className="text-[9px] text-slate-500 font-mono block">One-Time Setup</span>
                          <span className="text-sm font-bold text-slate-200">${activeOption.oneTimeFee}</span>
                        </div>
                        <div className="p-2 bg-slate-950/60 rounded border border-slate-800/80">
                          <span className="text-[9px] text-slate-500 font-mono block">SaaS Subscription</span>
                          <span className="text-sm font-bold text-slate-200">${activeOption.subscriptionFee}/mo</span>
                        </div>
                        <div className="p-2 bg-slate-950/60 rounded border border-slate-800/80">
                          <span className="text-[9px] text-slate-500 font-mono block">Consulting Retainer</span>
                          <span className="text-sm font-bold text-slate-200">${activeOption.consultingFee}/mo</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Profit Modeling Playground */}
                <div className="p-5 rounded-xl bg-gradient-to-br from-slate-950 to-slate-900 border border-emerald-500/20 space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
                      💰 Interactive Profit Modeler
                    </h4>
                    <button
                      onClick={handleResetPricing}
                      className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <RefreshCw size={10} /> Reset to Suggestion
                    </button>
                  </div>

                  {/* Sliders Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-300 font-medium">
                        <span>One-Time Build Fee</span>
                        <span className="text-emerald-400 font-mono font-bold">${currentOneTime}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="10000" 
                        step="100"
                        value={currentOneTime}
                        onChange={(e) => setOverrideOneTime(Number(e.target.value))}
                        className="w-full accent-emerald-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                      <span className="text-[9px] text-slate-500">Upfront development & setup charges</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-300 font-medium">
                        <span>Monthly Subscription</span>
                        <span className="text-emerald-400 font-mono font-bold">${currentSub}/mo</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="1000" 
                        step="10"
                        value={currentSub}
                        onChange={(e) => setOverrideSub(Number(e.target.value))}
                        className="w-full accent-emerald-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                      <span className="text-[9px] text-slate-500">Recurring SaaS hosting / software licensing fee</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-300 font-medium">
                        <span>Ongoing Consulting</span>
                        <span className="text-emerald-400 font-mono font-bold">${currentConsulting}/mo</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="2000" 
                        step="25"
                        value={currentConsulting}
                        onChange={(e) => setOverrideConsulting(Number(e.target.value))}
                        className="w-full accent-emerald-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                      <span className="text-[9px] text-slate-500">Monthly support retainer or training package charges</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-300 font-medium">
                        <span>Estimated Active Clients</span>
                        <span className="text-emerald-400 font-mono font-bold">{estimatedClients}</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="100" 
                        step="1"
                        value={estimatedClients}
                        onChange={(e) => setEstimatedClients(Number(e.target.value))}
                        className="w-full accent-emerald-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                      <span className="text-[9px] text-slate-500">Number of clinics/CPAs/developers you project to sign up</span>
                    </div>
                  </div>

                  {/* Financial projections widget */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800/60">
                    <div className="p-3 bg-slate-900 rounded border border-slate-800 text-center">
                      <span className="text-[9px] text-slate-500 font-mono block">Upfront Cash</span>
                      <span className="text-sm font-mono font-bold text-slate-100">${totalUpfront.toLocaleString()}</span>
                    </div>
                    <div className="p-3 bg-slate-900 rounded border border-slate-800 text-center">
                      <span className="text-[9px] text-slate-500 font-mono block">Monthly MRR</span>
                      <span className="text-sm font-mono font-bold text-emerald-400">${mrr.toLocaleString()}</span>
                    </div>
                    <div className="p-3 bg-slate-900 rounded border border-slate-800 text-center">
                      <span className="text-[9px] text-slate-500 font-mono block">Annual ARR</span>
                      <span className="text-sm font-mono font-bold text-sky-400">${arr.toLocaleString()}</span>
                    </div>
                    <div className="p-3 bg-slate-900 rounded border border-emerald-500/30 text-center bg-emerald-500/5">
                      <span className="text-[9px] text-emerald-500 font-mono block">Est. Year 1 Value</span>
                      <span className="text-sm font-mono font-bold text-emerald-300">${totalYearOne.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Outreach Draft, Direct Dispatch, Questions, CRM Tracking */}
          <div className="lg:col-span-5 p-6 flex flex-col justify-between overflow-y-auto space-y-6">
            
            {/* 1. Relationship Outreach Helper */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-md font-semibold text-white flex items-center gap-2">
                  <PenTool size={16} className="text-sky-400" />
                  Outreach Crafting & Refinement
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">Generative Assist</span>
              </div>

              {/* Response Draft Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Helpful Response Draft</span>
                  <button 
                    onClick={handleCopyDraft}
                    className="flex items-center gap-1 hover:text-white transition"
                    id="copy-draft-btn"
                  >
                    {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copied ? "Copied!" : "Copy Draft"}</span>
                  </button>
                </div>
                <textarea
                  id="outreach-draft-textarea"
                  name="outreachDraft"
                  aria-label="Helpful Response Draft"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full h-44 p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs leading-relaxed text-slate-200 focus:outline-none focus:border-sky-500 font-sans resize-y animate-fade-in"
                  placeholder="Drafting response..."
                />
              </div>

              {/* Refinement Prompt */}
              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 space-y-2">
                <label htmlFor="refinement-guidance-input" className="text-[10px] text-slate-400 block font-mono">Refine outreach draft with AI instructions:</label>
                <div className="flex gap-1.5">
                  <input
                    id="refinement-guidance-input"
                    name="refinementGuidance"
                    aria-label="Refine outreach draft with AI instructions"
                    type="text"
                    value={guidance}
                    onChange={(e) => setGuidance(e.target.value)}
                    placeholder="e.g. 'make it shorter', 'focus more on the manual OCR part'"
                    className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 rounded focus:outline-none focus:border-indigo-500"
                    onKeyDown={(e) => e.key === "Enter" && handleRefineDraft()}
                  />
                  <button
                    onClick={handleRefineDraft}
                    disabled={isDrafting}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-xs font-semibold rounded flex items-center gap-1 transition"
                  >
                    {isDrafting ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    <span>Refine</span>
                  </button>
                </div>
              </div>

              {/* GMAIL ENGAGEMENT HUB & PLATFORM DISPATCHER */}
              <div className="space-y-4">
                
                {/* 1. Gmail Integration Status Card (Shown if not signed in) */}
                {!gmailUser && (
                  <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/20 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Mail size={14} className="text-indigo-400" />
                      <span className="text-xs font-semibold text-white">Gmail Active CRM Outreach</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Connect your Gmail account to send outreach templates directly, monitor client replies automatically, and maintain conversational threads in real-time right inside this card.
                    </p>
                    <button
                      onClick={onGmailLogin}
                      className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs rounded flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Mail size={12} />
                      <span>Link with Google Gmail</span>
                    </button>
                  </div>
                )}

                {/* 2. Live Gmail Conversation Thread (If signed in and threadId exists) */}
                {gmailUser && opportunity.gmailThreadId ? (
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="text-emerald-400" />
                        <span className="text-xs font-semibold text-white">Active Gmail Conversation</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {gmailMessages.length > 0 && (
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            !gmailMessages[gmailMessages.length - 1].isOutbound
                              ? "bg-emerald-500/15 text-emerald-400 animate-pulse"
                              : "bg-slate-800 text-slate-400"
                          }`}>
                            {!gmailMessages[gmailMessages.length - 1].isOutbound
                              ? "🟢 Reply Received!"
                              : "⚪ Waiting for Lead..."}
                          </span>
                        )}
                        <button
                          onClick={loadGmailThread}
                          disabled={isLoadingThread}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                          title="Refresh Thread"
                        >
                          <RefreshCw size={12} className={isLoadingThread ? "animate-spin" : ""} />
                        </button>
                      </div>
                    </div>

                    {threadError && (
                      <p className="text-[10px] text-rose-400 bg-rose-950/20 p-2 rounded border border-rose-500/10">
                        {threadError}
                      </p>
                    )}

                    {/* Message stream */}
                    {isLoadingThread && gmailMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 space-y-1.5">
                        <RefreshCw size={14} className="animate-spin text-emerald-400" />
                        <span className="text-[10px] text-slate-500 font-mono">Syncing Gmail thread...</span>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-60 overflow-y-auto p-2 bg-slate-950/40 rounded border border-slate-800/60 scrollbar-thin">
                        {gmailMessages.length === 0 ? (
                          <p className="text-[10px] text-slate-500 text-center py-4 font-mono">
                            No messages found. Sync with Gmail above.
                          </p>
                        ) : (
                          gmailMessages.map((msg) => (
                            <div key={msg.id} className={`flex flex-col ${msg.isOutbound ? "items-end" : "items-start"}`}>
                              <div className={`max-w-[85%] rounded-lg p-2.5 text-[11px] leading-relaxed ${
                                msg.isOutbound
                                  ? "bg-slate-900 border border-sky-500/10 text-slate-200"
                                  : "bg-indigo-950/50 border border-indigo-500/20 text-indigo-100"
                              }`}>
                                <div className="flex items-center justify-between gap-3 mb-1 opacity-60 font-semibold text-[9px] uppercase font-mono">
                                  <span>{msg.isOutbound ? "You (via Gmail)" : "Lead"}</span>
                                  <span>{msg.date.split(",")[0] || msg.date}</span>
                                </div>
                                <p className="whitespace-pre-line text-slate-300">{msg.body}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Quick reply composer */}
                    <div className="space-y-1.5 pt-1">
                      <label htmlFor="quick-reply-textarea" className="text-[9px] text-slate-400 font-mono block">Draft Quick Reply:</label>
                      <textarea
                        id="quick-reply-textarea"
                        name="quickReplyText"
                        aria-label="Draft Quick Reply"
                        value={quickReplyText}
                        onChange={(e) => setQuickReplyText(e.target.value)}
                        placeholder="Type your response to keep the conversation going..."
                        className="w-full h-20 p-2 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={handleSendQuickReply}
                        disabled={isSendingReply || !quickReplyText.trim()}
                        className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold text-xs rounded flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {isSendingReply ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                        <span>Send Reply via Gmail</span>
                      </button>
                    </div>

                    <div className="text-[9px] text-slate-500 text-center font-mono">
                      Connected to Gmail: <strong>{opportunity.gmailSentTo}</strong>
                    </div>
                  </div>
                ) : null}

                {/* 3. Send Outreach Email via Gmail (If signed in but threadId does not exist) */}
                {gmailUser && !opportunity.gmailThreadId ? (
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex items-center gap-1.5 border-b border-slate-800/80 pb-2 mb-1">
                      <Mail size={14} className="text-sky-400" />
                      <span className="text-xs font-semibold text-white">Direct Gmail Dispatcher</span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label htmlFor="recipient-email-input" className="text-[9px] text-slate-400 font-mono uppercase tracking-wider block mb-1">Recipient Email:</label>
                        <input
                          id="recipient-email-input"
                          name="recipientEmail"
                          aria-label="Recipient Email"
                          type="email"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                          placeholder="e.g. lead-contact@domain.com"
                          className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:border-sky-500"
                        />
                        <span className="text-[9px] text-slate-500 mt-0.5 block">Find their email natively, enter it here to link Gmail tracking.</span>
                      </div>

                      <div>
                        <label htmlFor="email-subject-input" className="text-[9px] text-slate-400 font-mono uppercase tracking-wider block mb-1">Subject:</label>
                        <input
                          id="email-subject-input"
                          name="emailSubject"
                          aria-label="Email Subject"
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          placeholder="Email subject line"
                          className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <button
                        onClick={handleSendInitialEmail}
                        disabled={isSendingEmail || !draft.trim() || !recipientEmail}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-bold text-xs rounded flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {isSendingEmail ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                        <span>Send Official Email via Gmail</span>
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* 4. Safe Browser-Native Deep Linking (Always available as a secondary backup collapse) */}
                <details className="group rounded-xl border border-slate-800 bg-slate-950/20" open={!opportunity.gmailThreadId}>
                  <summary className="p-3 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer select-none flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare size={13} className="text-slate-400" />
                      <span>{opportunity.gmailThreadId ? "Manual Deep Links (Backup)" : "Direct Platform Dispatcher"}</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono uppercase group-open:hidden">Expand</span>
                    <span className="text-[10px] text-slate-500 font-mono uppercase hidden group-open:inline">Collapse</span>
                  </summary>

                  <div className="p-4 pt-0 border-t border-slate-800/60 space-y-3 mt-3">
                    <div className="text-[11px] text-slate-300 space-y-1">
                      <div className="flex items-center gap-1">
                        <User size={12} className="text-slate-400" />
                        <span>Target Poster: <strong className="text-slate-100">{opportunity.author}</strong></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <ExternalLink size={12} className="text-slate-400" />
                        <span>On Platform: <strong className="text-slate-100">{opportunity.sourcePlatform}</strong></span>
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10 text-[10px] leading-relaxed text-slate-300">
                      <span className="font-bold text-emerald-400 flex items-center gap-1 mb-1">
                        🔒 Safe Browser-Native Deep Linking
                      </span>
                      Clicking these opens official platforms in a secure browser tab, allowing you to DM them directly under your active accounts.
                    </div>

                    <div className="grid grid-cols-1 gap-2 pt-1">
                      {opportunity.sourcePlatform.includes("Reddit") && (
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(draft);
                            } catch (e) {}
                            const cleanAuthor = (opportunity.author || "").replace(/^u\//, "");
                            const pmUrl = cleanAuthor && cleanAuthor !== "[deleted]"
                              ? `https://www.reddit.com/message/compose/?to=${encodeURIComponent(cleanAuthor)}&subject=${encodeURIComponent("Regarding your workflow bottleneck")}&message=${encodeURIComponent(draft)}`
                              : (opportunity.sourceUrl || "https://reddit.com");
                            window.open(pmUrl, '_blank');
                            handleMarkSentAndLog();
                          }}
                          className="w-full py-1.5 px-3 bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs rounded flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
                        >
                          <Send size={12} />
                          <span>Launch Direct PM on Reddit & Log</span>
                        </button>
                      )}

                      {opportunity.sourcePlatform.includes("Hacker News") && (
                        <div className="space-y-1.5">
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(draft);
                              } catch (e) {}
                              window.open(opportunity.sourceUrl, '_blank');
                              handleMarkSentAndLog();
                            }}
                            className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <ExternalLink size={12} />
                            <span>Copy Draft & Reply on HN Thread</span>
                          </button>
                          <p className="text-[9px] text-slate-500 text-center leading-normal italic">
                            Hacker News replies are public. DMs are not supported.
                          </p>
                        </div>
                      )}

                      {!opportunity.sourcePlatform.includes("Reddit") && !opportunity.sourcePlatform.includes("Hacker News") && (
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(draft);
                            } catch (e) {}
                            window.open(opportunity.sourceUrl || `mailto:${opportunity.author}@example.com?subject=Regarding your workflow challenge&body=${encodeURIComponent(draft)}`, '_blank');
                            handleMarkSentAndLog();
                          }}
                          className="w-full py-1.5 px-3 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs rounded flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Mail size={12} />
                          <span>Copy Draft & Open Source Link</span>
                        </button>
                      )}

                      {/* Immediate CRM Send & Log tracking */}
                      <button
                        onClick={handleMarkSentAndLog}
                        disabled={isLoggingMessage}
                        className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded flex items-center justify-center gap-1.5 transition border border-emerald-500/20 cursor-pointer"
                      >
                        {isLoggingMessage ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                        <span>{logSuccess ? "Logged in CRM!" : "Log Outreach Sent in CRM"}</span>
                      </button>
                    </div>
                  </div>
                </details>

              </div>

              {/* Suggested Follow-up Questions */}
              {questions.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase block">Suggested Follow-Up Questions</span>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {questions.map((q, i) => (
                      <li key={i} className="flex gap-1.5 items-start">
                        <span className="text-sky-400 font-bold">•</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Value Addition Ideas */}
              {valueIdeas.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase block">Ways to Provide Free Value</span>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {valueIdeas.map((idea, i) => (
                      <li key={i} className="flex gap-1.5 items-start">
                        <span className="text-emerald-400 font-bold">•</span>
                        <span>{idea}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 2. Personal CRM & Lead Tracking Panel */}
            <div className="pt-6 border-t border-slate-800 space-y-4">
              <h3 className="text-md font-semibold text-white flex items-center gap-2">
                <ClipboardList size={16} className="text-emerald-400" />
                Personal Lead & CRM Tracking
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="crm-pipeline-stage-select" className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">Pipeline Stage</label>
                  <select
                    id="crm-pipeline-stage-select"
                    name="pipelineStage"
                    aria-label="Pipeline Stage"
                    value={status}
                    onChange={(e: any) => setStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="New" className="bg-slate-950 text-slate-200">New Signal</option>
                    <option value="Saved" className="bg-slate-950 text-slate-200">Saved / Under Review</option>
                    <option value="Contacted" className="bg-slate-950 text-slate-200">Outreach Sent</option>
                    <option value="In Discussion" className="bg-slate-950 text-slate-200">In Conversation</option>
                    <option value="Potential Product" className="bg-slate-950 text-slate-200">Product Idea candidate</option>
                    <option value="Archived" className="bg-slate-950 text-slate-200">Archived / Dismissed</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="crm-followup-date-input" className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">Follow-up Reminder</label>
                  <input
                    id="crm-followup-date-input"
                    name="followUpDate"
                    aria-label="Follow-up Reminder Date"
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="crm-private-notes-textarea" className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">Private Notes / Next Actions</label>
                <textarea
                  id="crm-private-notes-textarea"
                  name="privateNotes"
                  aria-label="Private Notes or Next Actions"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. 'Emailed Sarah on 7/8. Waiting on sample forms to inspect tabular layout.'"
                  className="w-full h-20 p-2 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <button
                onClick={handleSaveCRM}
                disabled={isSaving}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-semibold text-xs rounded flex items-center justify-center gap-1.5 transition"
                id="save-crm-btn"
              >
                {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Calendar size={13} />}
                <span>{saveSuccess ? "Changes Saved!" : "Save Tracking Status"}</span>
              </button>
            </div>

          </div>
        </div>
        
      </div>
    </div>
  );
}
