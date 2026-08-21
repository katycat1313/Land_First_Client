import React, { useState, useEffect } from "react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Plus, 
  Check, 
  X, 
  ExternalLink, 
  Download, 
  Video, 
  Image as ImageIcon, 
  Edit3, 
  Trash2, 
  Share2, 
  Clock, 
  MessageSquare,
  RefreshCw,
  Send,
  Maximize2,
  Upload
} from "lucide-react";

export interface SocialPost {
  id: string;
  platform: "LinkedIn" | "Twitter/X" | "Twitter" | "Reddit" | "Facebook" | "Instagram" | string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:MM
  content: string;
  proofBasis?: "source-backed analysis" | "transparent worked example" | "build in progress" | "working project demo" | string;
  imagePrompt?: string;
  imageUrl?: string;
  visualReferenceQuery?: string;
  visualReferences?: Array<{
    title: string;
    creator: string | null;
    sourceUrl: string;
    thumbnailUrl: string | null;
    license: string;
    licenseUrl: string | null;
    provider: string | null;
    usage: "research-only";
  }>;
  videoScriptPrompt?: string;
  videoBriefSourceName?: string;
  videoBlocks?: Array<{ prompt: string; duration: number }>;
  videoUrl?: string;
  audioPrompt?: string;
  audioUrl?: string;
  status: "Draft" | "Pending Approval" | "Approved" | "Published" | "Rejected";
  notes?: string;
}

interface SocialPostingCalendarProps {
  onAskPac?: (instruction: string) => void;
}

export const SocialPostingCalendar: React.FC<SocialPostingCalendarProps> = ({ onAskPac }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [isNewPostModalOpen, setIsNewPostModalOpen] = useState(false);
  const [newPostDate, setNewPostDate] = useState<string>("");

  // Video generation states
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [videoStatusMsg, setVideoStatusMsg] = useState("");

  const handleVideoBriefUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedPost) return;

    const allowedExtensions = [".txt", ".md", ".json", ".csv"];
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!allowedExtensions.includes(extension)) {
      setVideoStatusMsg("Upload a text, Markdown, JSON, or CSV brief.");
      return;
    }
    if (file.size > 250_000) {
      setVideoStatusMsg("The video brief must be 250 KB or smaller.");
      return;
    }

    try {
      const uploadedText = (await file.text()).trim();
      if (!uploadedText) throw new Error("The uploaded file is empty.");
      const existing = String(selectedPost.videoScriptPrompt || "").trim();
      const combined = existing
        ? `${existing}\n\nUploaded creative brief (${file.name}):\n${uploadedText}`
        : uploadedText;
      setSelectedPost({
        ...selectedPost,
        videoScriptPrompt: combined.slice(0, 50_000),
        videoBriefSourceName: file.name
      });
      setVideoStatusMsg(`Loaded ${file.name}. The continuity planner will condense it into three filmable shots.`);
    } catch (error: any) {
      setVideoStatusMsg(`Could not read the brief: ${error.message || "unknown error"}`);
    }
  };

  // Image generation states
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const savedPassword = typeof window !== 'undefined' ? (localStorage.getItem("app_password") || "Big$$grl1986") : "Big$$grl1986";
    const headers = new Headers(options.headers || {});
    if (savedPassword) {
      headers.set("x-app-password", savedPassword);
    }
    return fetch(url, { ...options, headers });
  };

  // Fetch social campaigns/posts from backend
  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/social-campaigns");
      if (res.ok) {
        const data = await res.json();
        setPosts(data || []);
      }
    } catch (err) {
      console.error("Failed to load posts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  // Calendar month arithmetic
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleJumpToToday = () => {
    setCurrentDate(new Date());
  };

  // Generate 7-Day Campaign via PAC API
  const handlePlan7DayCampaign = async () => {
    setIsGeneratingCampaign(true);
    try {
      const res = await apiFetch("/api/social-campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.posts) {
          setPosts(data.posts);
          alert("🚀 P.A.C. successfully generated a 7-day thought leadership campaign! Click any date on the calendar to view, edit, or publish.");
        }
      }
    } catch (err: any) {
      alert("Error generating campaign: " + err.message);
    } finally {
      setIsGeneratingCampaign(false);
    }
  };

  // Export iCalendar .ics file
  const handleExportIcs = () => {
    if (posts.length === 0) {
      alert("No scheduled posts to export.");
      return;
    }

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const now = new Date();
    const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;

    const events = posts.map((post, idx) => {
      const dateStr = post.scheduledDate ? post.scheduledDate.replace(/-/g, "") : "20260818";
      const dtstart = `${dateStr}T140000Z`; // Default 10:00 AM EDT
      const dtend = `${dateStr}T143000Z`;
      const cleanContent = (post.content || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

      return [
        "BEGIN:VEVENT",
        `UID:post-${post.id || idx}-${Date.now()}@missedrevenue.org`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:📢 Publish Post to ${post.platform} [Thought Leadership]`,
        `DESCRIPTION:${cleanContent}`,
        `STATUS:${post.status === "Approved" ? "CONFIRMED" : "TENTATIVE"}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:Reminder: Time to publish scheduled ${post.platform} post`,
        "TRIGGER:-PT15M",
        "END:VALARM",
        "END:VEVENT"
      ].join("\r\n");
    }).join("\r\n");

    const icsData = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Opportunity Radar//Thought Leadership Scheduler//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      events,
      "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `opportunity-radar-social-schedule-${year}-${pad(month + 1)}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Open modal for a specific post
  const handleOpenPost = (post: SocialPost) => {
    setSelectedPost({ ...post });
    setIsEditingModalOpen(true);
    setVideoStatusMsg("");
  };

  // Open modal to schedule on a specific date
  const handleAddNewOnDate = (dateStr: string) => {
    setNewPostDate(dateStr);
    setSelectedPost({
      id: `post_${Date.now()}`,
      platform: "LinkedIn",
      scheduledDate: dateStr,
      scheduledTime: "10:00",
      content: "",
      imagePrompt: "Clean, modern B2B workflow infographic illustrating business automation",
      status: "Draft"
    });
    setIsNewPostModalOpen(true);
  };

  // Save changes to selected post
  const handleSavePostChanges = async () => {
    if (!selectedPost) return;

    const updatedList = posts.map(p => p.id === selectedPost.id ? selectedPost : p);
    if (!posts.some(p => p.id === selectedPost.id)) {
      updatedList.push(selectedPost);
    }
    setPosts(updatedList);

    // Save to backend
    try {
      await apiFetch("/api/social-campaigns/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedPost.id, updatedPost: selectedPost })
      });
    } catch (e) {}

    setIsEditingModalOpen(false);
    setIsNewPostModalOpen(false);
  };

  // Delete post
  const handleDeletePost = (id: string) => {
    if (!confirm("Are you sure you want to remove this scheduled post?")) return;
    setPosts(posts.filter(p => p.id !== id));
    setIsEditingModalOpen(false);
  };

  // Direct 1-Click Launch into Social Platform
  const handleLaunchDirectPublish = (post: SocialPost) => {
    // 1. Copy text to clipboard
    navigator.clipboard.writeText(post.content);

    let url = "";
    const p = (post.platform || "").toLowerCase();

    if (p.includes("linkedin")) {
      url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(post.content)}`;
    } else if (p.includes("twitter") || p.includes("x")) {
      url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.content)}`;
    } else if (p.includes("facebook") || p.includes("meta") || p.includes("instagram")) {
      url = "https://business.facebook.com/latest/composer";
    } else if (p.includes("reddit")) {
      url = `https://www.reddit.com/r/smallbusiness/submit?title=${encodeURIComponent("Practical workflow automation blueprint")}&text=${encodeURIComponent(post.content)}`;
    } else {
      url = "https://publish.buffer.com/compose";
    }

    window.open(url, "_blank");
    alert(`📋 Post content copied to clipboard!\n\nOpened ${post.platform} scheduler in a new tab. Paste (⌘+V / Ctrl+V) and set schedule for ${post.scheduledDate}.`);
  };

  // Render a continuity-locked Runway multi-shot video
  const handleRenderRunwayVideo = async () => {
    if (!selectedPost) return;
    setIsRenderingVideo(true);
    setVideoStatusMsg("Planning three continuity-locked shots for Runway...");

    try {
      const promptText = selectedPost.videoScriptPrompt || selectedPost.content || "B2B software workflow demo";
      const res = await apiFetch("/api/social-campaigns/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptText: promptText.substring(0, 50_000),
          referenceImageUrl: selectedPost.imageUrl || undefined,
          blocks: selectedPost.videoBlocks,
          duration: 15,
          ratio: "1920:1080"
        })
      });

      const data = await res.json();
      if (!res.ok || !data.taskId) {
        throw new Error(data.error || "Runway task submission failed");
      }

      const taskId = data.taskId;
      setVideoStatusMsg("Rendering and assembling a 15-second Runway video...");

      const soundTaskId = data.integratedAudio ? null : undefined;

      const interval = setInterval(async () => {
        try {
          const statusRes = await apiFetch(`/api/social-campaigns/video-status/${taskId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status === "SUCCEEDED" && statusData.videoUrl) {
              clearInterval(interval);
              setSelectedPost(prev => prev ? { ...prev, videoUrl: statusData.videoUrl } : null);
              setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, videoUrl: statusData.videoUrl } : p));
              setIsRenderingVideo(false);
              setVideoStatusMsg("Video Rendered Successfully! 🎬");
            } else if (statusData.status === "FAILED") {
              clearInterval(interval);
              setIsRenderingVideo(false);
              setVideoStatusMsg("❌ Runway rendering failed.");
            } else {
              setVideoStatusMsg(`Rendering in Runway (${statusData.status || "PROCESSING"})...`);
            }
          }
        } catch (e) {}
      }, 5000);

      if (soundTaskId) {
        const soundInterval = setInterval(async () => {
          try {
            const statusRes = await apiFetch(`/api/social-campaigns/video-status/${soundTaskId}`);
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();
            if (statusData.status === "SUCCEEDED" && statusData.videoUrl) {
              clearInterval(soundInterval);
              setSelectedPost(prev => prev ? { ...prev, audioUrl: statusData.videoUrl } : null);
              setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, audioUrl: statusData.videoUrl } : p));
            } else if (statusData.status === "FAILED") {
              clearInterval(soundInterval);
            }
          } catch (e) {}
        }, 5000);
      }
    } catch (err: any) {
      setIsRenderingVideo(false);
      setVideoStatusMsg(`❌ Error: ${err.message}`);
    }
  };

  // Regenerate the high-quality visual anchor
  const handleRegenerateImage = async () => {
    if (!selectedPost || !selectedPost.imagePrompt) return;
    setIsGeneratingImage(true);

    try {
      const res = await apiFetch("/api/social-campaigns/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: selectedPost.imagePrompt, platform: selectedPost.platform })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Image generation failed");
      }
      if (data.imageUrl) {
        setSelectedPost(prev => prev ? { ...prev, imageUrl: data.imageUrl } : null);
        setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, imageUrl: data.imageUrl } : p));
      }
    } catch (e: any) {
      console.error(e);
      alert(`Image generation failed: ${e.message}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Calendar Day Cell Builder
  const calendarCells = [];

  // Previous month padding days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    calendarCells.push({
      dayNum,
      isCurrentMonth: false,
      dateString: ""
    });
  }

  // Current month days
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const monthStr = month + 1 < 10 ? `0${month + 1}` : `${month + 1}`;
    const dayStr = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
    const dateString = `${year}-${monthStr}-${dayStr}`;
    const isToday = isThisMonth && today.getDate() === dayNum;

    // Filter posts on this date
    const dayPosts = posts.filter(p => p.scheduledDate === dateString);

    calendarCells.push({
      dayNum,
      isCurrentMonth: true,
      dateString,
      isToday,
      posts: dayPosts
    });
  }

  // Next month padding days to fill 35 or 42 grid
  const remainingCells = (7 - (calendarCells.length % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    calendarCells.push({
      dayNum: i,
      isCurrentMonth: false,
      dateString: ""
    });
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-16 font-sans">
      {/* Top Banner & Action Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#042f2e]/90 via-[#0b3b36]/80 to-slate-950 border border-teal-500/40 shadow-2xl backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-mono text-[10px] font-bold uppercase tracking-wider border border-teal-400/30 flex items-center gap-1.5">
              <Sparkles size={11} className="text-cyan-400" />
              B2B Social Engine
            </span>
            <span className="text-[11px] text-teal-300/80 font-mono">missedrevenue.org/social-posting</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2.5 font-mono">
            🗓️ Social Posting & Calendar Hub
          </h1>
          <p className="text-xs text-teal-100/70 font-mono mt-1 max-w-2xl">
            Autonomous thought leadership planner. Schedule, edit, and publish data-backed organic content with accompanying AI graphics and Runway video clips.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleExportIcs}
            className="px-3.5 py-2 bg-[#0d4a44] hover:bg-[#115e56] text-teal-100 rounded-xl text-xs font-bold font-mono transition border border-teal-400/40 flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
            type="button"
            title="Export calendar schedule to Google Calendar, Apple Calendar, or Outlook (.ics)"
          >
            <Download size={13} className="text-cyan-300" />
            Export (.ics)
          </button>

          <button
            onClick={handlePlan7DayCampaign}
            disabled={isGeneratingCampaign}
            className="px-4 py-2 bg-gradient-to-r from-teal-500 via-cyan-500 to-emerald-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-mono font-black text-xs rounded-xl transition shadow-[0_0_25px_rgba(20,184,166,0.4)] flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
            type="button"
          >
            {isGeneratingCampaign ? (
              <>
                <span className="h-3 w-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                P.A.C. Drafting 7 Days...
              </>
            ) : (
              <>
                <Sparkles size={13} className="text-slate-950 fill-current" />
                Plan 7-Day Campaign
              </>
            )}
          </button>
        </div>
      </div>

      {/* Free Social Schedulers Launcher Bar */}
      <div className="px-4 py-2.5 bg-[#04221f]/90 border border-teal-500/30 rounded-xl flex items-center justify-between text-xs font-mono text-teal-200 overflow-x-auto gap-4 shadow-sm">
        <span className="shrink-0 font-bold text-teal-400 flex items-center gap-1.5">
          <Share2 size={13} /> 1-Click Social Connectors:
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="https://www.linkedin.com/feed/?shareActive=true"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-300 hover:text-white hover:underline flex items-center gap-1 bg-cyan-950/40 px-2 py-1 rounded border border-cyan-500/30"
          >
            LinkedIn Scheduler ↗
          </a>
          <a
            href="https://business.facebook.com/latest/composer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-300 hover:text-white hover:underline flex items-center gap-1 bg-teal-950/40 px-2 py-1 rounded border border-teal-500/30"
          >
            Meta Business Suite (FB/IG) ↗
          </a>
          <a
            href="https://publish.buffer.com/compose"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-300 hover:text-white hover:underline flex items-center gap-1 bg-emerald-950/40 px-2 py-1 rounded border border-emerald-500/30"
          >
            Buffer ↗
          </a>
          <a
            href="https://twitter.com/compose/tweet"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-300 hover:text-white hover:underline flex items-center gap-1 bg-sky-950/40 px-2 py-1 rounded border border-sky-500/30"
          >
            Twitter / X ↗
          </a>
        </div>
      </div>

      {/* Main Calendar Card */}
      <div className="bg-gradient-to-b from-[#042f2e]/95 via-[#022c22]/98 to-slate-950 rounded-2xl border-2 border-teal-400/50 shadow-[0_0_50px_rgba(20,184,166,0.2)] overflow-hidden">
        {/* Calendar Top Controls Header */}
        <div className="px-6 py-4 bg-[#0d4a44]/90 border-b border-teal-500/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarIcon className="text-cyan-400" size={20} />
            <h2 className="text-xl font-bold text-white font-mono tracking-wide">
              {monthNames[month]} {year}
            </h2>
            <button
              onClick={handleJumpToToday}
              className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-teal-900/60 text-teal-300 border border-teal-400/30 hover:bg-teal-800 transition cursor-pointer"
              type="button"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-lg bg-[#04221f] hover:bg-teal-800 text-teal-200 border border-teal-500/40 transition cursor-pointer shadow active:scale-95"
              type="button"
              title="Previous Month"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 rounded-lg bg-[#04221f] hover:bg-teal-800 text-teal-200 border border-teal-500/40 transition cursor-pointer shadow active:scale-95"
              type="button"
              title="Next Month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Days of the Week Header */}
        <div className="grid grid-cols-7 border-b border-teal-500/30 bg-[#063b36]/80 text-center font-mono text-[11px] font-bold text-teal-300/80 py-2.5 uppercase tracking-wider">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        {/* 7-Column Month Grid */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-teal-500/20 bg-[#021f1c]/80 min-h-[580px]">
          {calendarCells.map((cell, idx) => (
            <div
              key={idx}
              className={`p-2 min-h-[110px] transition group relative flex flex-col justify-between ${
                !cell.isCurrentMonth
                  ? "bg-black/40 opacity-30"
                  : cell.isToday
                  ? "bg-teal-950/40 shadow-inner"
                  : "hover:bg-teal-900/20"
              }`}
            >
              {/* Day Number Header */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                    cell.isToday
                      ? "bg-cyan-400 text-slate-950 font-black shadow-[0_0_8px_#22d3ee]"
                      : cell.isCurrentMonth
                      ? "text-teal-200"
                      : "text-slate-600"
                  }`}
                >
                  {cell.dayNum}
                </span>

                {cell.isCurrentMonth && (
                  <button
                    onClick={() => handleAddNewOnDate(cell.dateString)}
                    className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-teal-800 text-teal-300 rounded cursor-pointer"
                    title={`Schedule post for ${cell.dateString}`}
                    type="button"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>

              {/* Scheduled Posts on This Day */}
              <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[100px] scrollbar-none">
                {cell.posts && cell.posts.map(post => {
                  const p = (post.platform || "").toLowerCase();
                  let badgeBg = "bg-teal-900/60 border-teal-500/40 text-teal-200";
                  if (p.includes("linkedin")) badgeBg = "bg-blue-950/80 border-blue-500/40 text-blue-300";
                  else if (p.includes("twitter") || p.includes("x")) badgeBg = "bg-slate-900/90 border-slate-700 text-white";
                  else if (p.includes("reddit")) badgeBg = "bg-orange-950/80 border-orange-500/40 text-orange-300";
                  else if (p.includes("facebook") || p.includes("meta")) badgeBg = "bg-indigo-950/80 border-indigo-500/40 text-indigo-300";

                  return (
                    <div
                      key={post.id}
                      onClick={() => handleOpenPost(post)}
                      className={`p-1.5 rounded-lg border text-[9.5px] font-mono leading-tight cursor-pointer hover:scale-[1.02] transition shadow-sm ${badgeBg}`}
                      title="Click to view & edit post draft"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="truncate">{post.platform}</span>
                        {post.videoUrl && <Video size={10} className="text-cyan-400 shrink-0 ml-1" />}
                      </div>
                      <p className="truncate text-teal-100/80 text-[8.5px] mt-0.5">
                        {post.content || "Draft post..."}
                      </p>
                    </div>
                  );
                })}
              </div>

              {cell.isCurrentMonth && (!cell.posts || cell.posts.length === 0) && (
                <div className="text-[8px] text-teal-500/30 font-mono text-center">
                  Empty
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Calendar Bottom Navigation & Month Switcher */}
        <div className="px-6 py-4 bg-[#0d4a44]/90 border-t border-teal-500/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="px-3 py-1.5 bg-[#04221f] hover:bg-teal-800 text-teal-200 text-xs font-mono font-bold rounded-lg border border-teal-500/40 transition flex items-center gap-1 cursor-pointer shadow active:scale-95"
              type="button"
            >
              <ChevronLeft size={14} /> Previous Month
            </button>
            <button
              onClick={handleNextMonth}
              className="px-3 py-1.5 bg-[#04221f] hover:bg-teal-800 text-teal-200 text-xs font-mono font-bold rounded-lg border border-teal-500/40 transition flex items-center gap-1 cursor-pointer shadow active:scale-95"
              type="button"
            >
              Next Month <ChevronRight size={14} />
            </button>
          </div>

          <div className="text-xs font-mono text-teal-200/80">
            {posts.length} Total Post{posts.length === 1 ? "" : "s"} Scheduled in System
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* POP-UP MODAL: Interactive Post Editor, Visual Studio, and 1-Click Publisher */}
      {/* ========================================================================= */}
      {(isEditingModalOpen || isNewPostModalOpen) && selectedPost && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-gradient-to-b from-[#042f2e] via-[#064e3b] to-[#022c22] border-2 border-teal-400/70 rounded-2xl shadow-[0_0_50px_rgba(20,184,166,0.4)] overflow-hidden font-sans flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-[#0d4a44] border-b border-teal-500/50 flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono">
                <Edit3 className="text-cyan-400" size={16} />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {isNewPostModalOpen ? "Schedule New Social Post" : "Edit & Publish Scheduled Post"}
                </h3>
              </div>
              <button
                onClick={() => { setIsEditingModalOpen(false); setIsNewPostModalOpen(false); }}
                className="p-1 rounded text-teal-300 hover:text-rose-400 hover:bg-teal-900 transition cursor-pointer"
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 scrollbar-thin">
              {/* Platform & Scheduled Date Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono uppercase font-bold text-teal-300 block mb-1">
                    Destination Platform
                  </label>
                  <select
                    value={selectedPost.platform}
                    onChange={(e) => setSelectedPost({ ...selectedPost, platform: e.target.value })}
                    className="w-full px-3 py-2 bg-[#022421] border border-teal-500/50 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-teal-300 cursor-pointer"
                  >
                    <option value="LinkedIn">LinkedIn (Thought Leadership)</option>
                    <option value="Twitter/X">Twitter / X (Thread / Punchy Post)</option>
                    <option value="Reddit">Reddit (r/smallbusiness / r/sweatystartup)</option>
                    <option value="Facebook">Facebook / Meta Groups</option>
                    <option value="Instagram">Instagram / Reels</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase font-bold text-teal-300 block mb-1">
                    Scheduled Date (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    value={selectedPost.scheduledDate}
                    onChange={(e) => setSelectedPost({ ...selectedPost, scheduledDate: e.target.value })}
                    className="w-full px-3 py-2 bg-[#022421] border border-teal-500/50 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-teal-300 cursor-pointer"
                  />
                </div>
              </div>

              {/* Editable Post Draft */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase font-bold text-teal-300">
                    Post Draft & Free Value Copy
                  </label>
                  {selectedPost.proofBasis && (
                    <span className="rounded border border-cyan-400/30 bg-cyan-950/40 px-2 py-0.5 text-[8px] font-mono uppercase text-cyan-200">
                      Proof: {selectedPost.proofBasis}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-teal-400/80">
                    {selectedPost.content.length} characters
                  </span>
                </div>
                <textarea
                  value={selectedPost.content}
                  onChange={(e) => setSelectedPost({ ...selectedPost, content: e.target.value })}
                  placeholder="Type your authentic post copy here..."
                  className="w-full min-h-[140px] p-3 bg-[#022421] border border-teal-500/50 rounded-xl text-xs font-mono text-teal-50 focus:outline-none focus:border-teal-300 leading-relaxed resize-y"
                />
              </div>

              {/* Visual Graphic & Runway Video Studio */}
              <div className="p-3.5 bg-[#03201e] border border-teal-500/40 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-white flex items-center gap-1.5">
                    <ImageIcon size={13} className="text-cyan-400" />
                    Visual Graphic & Runway AI Video Studio
                  </span>
                  <button
                    type="button"
                    onClick={handleRegenerateImage}
                    disabled={isGeneratingImage}
                    className="px-2.5 py-1 bg-teal-800/80 hover:bg-teal-700 text-teal-200 rounded text-[9.5px] font-mono font-bold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                  >
                    <RefreshCw size={10} className={isGeneratingImage ? "animate-spin" : ""} />
                    Regenerate Image
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Image Prompt & Live Graphic Preview */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-mono uppercase text-teal-300 block">
                      Graphic Prompt
                    </label>
                    <textarea
                      value={selectedPost.imagePrompt || ""}
                      onChange={(e) => setSelectedPost({ ...selectedPost, imagePrompt: e.target.value })}
                      placeholder="Image prompt for diagram / infographic..."
                      className="w-full h-[70px] p-2 bg-[#022421] border border-teal-500/40 rounded-lg text-[10px] font-mono text-teal-200 resize-none"
                    />

                    {selectedPost.visualReferences && selectedPost.visualReferences.length > 0 && (
                      <div className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-950/20 p-2">
                        <div className="text-[8px] font-mono uppercase text-amber-300">Public-domain research references — verify before use</div>
                        {selectedPost.visualReferences.map((reference, index) => (
                          <div key={`${reference.sourceUrl}-${index}`} className="flex min-w-0 items-center gap-1 text-[9px]">
                            <a
                              href={reference.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 flex-1 truncate text-amber-100 hover:text-white"
                              title="Research inspiration only; PAC generates a materially original composition"
                            >
                              {reference.title}{reference.creator ? ` · ${reference.creator}` : ""} ↗
                            </a>
                            {reference.licenseUrl ? (
                              <a href={reference.licenseUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-amber-300 hover:text-white">
                                {reference.license}
                              </a>
                            ) : <span className="shrink-0 text-amber-300">{reference.license}</span>}
                          </div>
                        ))}
                        <p className="text-[8px] leading-relaxed text-amber-200/60">PAC does not copy these pixels or compositions. They are provenance-linked research only.</p>
                      </div>
                    )}

                    {/* Clickable Graphic Preview with Zoom Overlay */}
                    <div 
                      onClick={() => selectedPost.imageUrl && setZoomImageUrl(selectedPost.imageUrl)}
                      className="relative h-[130px] rounded-lg overflow-hidden border border-teal-500/40 bg-black flex items-center justify-center cursor-pointer group hover:border-cyan-400 transition shadow-md"
                      title="Click to expand high-resolution graphic"
                    >
                      <img
                        src={selectedPost.imageUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='600'%3E%3Crect width='100%25' height='100%25' fill='%230f2928'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' fill='%235eead4' font-family='sans-serif' font-size='24'%3EGenerate image to preview%3C/text%3E%3C/svg%3E"}
                        alt="Visual preview"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                      
                      {/* Hover Expand Badge */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-mono text-[10px] font-bold">
                        <Maximize2 size={13} className="text-cyan-400" />
                        <span>Click to Expand</span>
                      </div>

                      <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-[8px] font-mono text-teal-300 pointer-events-none">
                        🔍 Click to Zoom
                      </div>
                    </div>
                  </div>

                  {/* Video Script & Runway AI Video Generator */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[9px] font-mono uppercase text-teal-300 block">15-Sec Video Direction</label>
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-cyan-500/40 bg-cyan-950/50 px-2 py-1 text-[8px] font-mono font-bold uppercase text-cyan-200 hover:bg-cyan-900/60">
                        <Upload size={10} /> Upload Brief
                        <input
                          type="file"
                          accept=".txt,.md,.json,.csv,text/plain,text/markdown,application/json,text/csv"
                          onChange={handleVideoBriefUpload}
                          className="sr-only"
                        />
                      </label>
                    </div>
                    <textarea
                      value={selectedPost.videoScriptPrompt || ""}
                      onChange={(e) => setSelectedPost({ ...selectedPost, videoScriptPrompt: e.target.value })}
                      placeholder="Type a direction or upload a longer creative brief. P.A.C. will condense it into continuity-locked shots..."
                      className="w-full h-[120px] p-2 bg-[#022421] border border-teal-500/40 rounded-lg text-[10px] font-mono text-teal-200 resize-y"
                    />
                    <div className="flex justify-between gap-2 text-[8px] font-mono text-teal-200/60">
                      <span>{selectedPost.videoBriefSourceName ? `Source: ${selectedPost.videoBriefSourceName}` : "TXT, MD, JSON, or CSV · 250 KB max"}</span>
                      <span>{(selectedPost.videoScriptPrompt || "").length.toLocaleString()} / 50,000 characters</span>
                    </div>

                    <label className="text-[9px] font-mono uppercase text-teal-300 block">Sound Direction</label>
                    <textarea
                      value={selectedPost.audioPrompt || ""}
                      onChange={(e) => setSelectedPost({ ...selectedPost, audioPrompt: e.target.value })}
                      placeholder="Example: quiet office ambience, one notification chime, soft keyboard taps..."
                      className="w-full h-[55px] p-2 bg-[#022421] border border-teal-500/40 rounded-lg text-[10px] font-mono text-teal-200 resize-none"
                    />

                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={handleRenderRunwayVideo}
                        disabled={isRenderingVideo}
                        className="w-full py-1.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded text-[10px] font-mono font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow disabled:opacity-50"
                      >
                        {isRenderingVideo ? (
                          <>
                            <span className="h-2.5 w-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            Rendering Video...
                          </>
                        ) : (
                          <>
                            <Video size={12} />
                            <span>🎬 Render Professional Video + Sound (15s)</span>
                          </>
                        )}
                      </button>

                      {videoStatusMsg && (
                        <div className="text-[9px] font-mono text-cyan-300 bg-cyan-950/60 p-1.5 rounded border border-cyan-500/30">
                          {videoStatusMsg}
                        </div>
                      )}

                      {selectedPost.videoUrl && (
                        <div className="rounded-lg overflow-hidden border border-teal-400/50 bg-black mt-1">
                          <video
                            src={selectedPost.videoUrl}
                            controls
                            loop
                            className="w-full max-h-[110px] object-cover"
                          />
                        </div>
                      )}
                      {selectedPost.audioUrl && (
                        <div className="rounded-lg border border-cyan-500/40 bg-slate-950 p-2">
                          <div className="mb-1 text-[8px] font-mono uppercase text-cyan-300">Generated sound track</div>
                          <audio src={selectedPost.audioUrl} controls className="h-8 w-full" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="px-5 py-3.5 bg-[#0d4a44] border-t border-teal-500/50 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {!isNewPostModalOpen && (
                  <button
                    onClick={() => handleDeletePost(selectedPost.id)}
                    className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1 cursor-pointer"
                    type="button"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}

                {onAskPac && (
                  <button
                    onClick={() => {
                      onAskPac(`Can you review and polish this scheduled ${selectedPost.platform} post for ${selectedPost.scheduledDate}?\n\nContent:\n${selectedPost.content}`);
                      setIsEditingModalOpen(false);
                    }}
                    className="px-3 py-1.5 bg-teal-900/80 hover:bg-teal-800 text-teal-200 border border-teal-400/40 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1 cursor-pointer"
                    type="button"
                    title="Send this post to P.A.C. in the chat window to request adjustments"
                  >
                    <MessageSquare size={12} className="text-cyan-300" />
                    Ask P.A.C. to Refine
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleLaunchDirectPublish(selectedPost)}
                  className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-black text-xs rounded-lg transition shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                  type="button"
                >
                  <Send size={12} />
                  <span>Launch on {selectedPost.platform}</span>
                </button>

                <button
                  onClick={handleSavePostChanges}
                  className="px-4 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-mono font-black text-xs rounded-lg transition shadow-md flex items-center gap-1 cursor-pointer active:scale-95"
                  type="button"
                >
                  <Check size={13} />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FULL-SCREEN IMAGE LIGHTBOX MODAL */}
      {/* ========================================================================= */}
      {zoomImageUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-8 animate-fade-in"
          onClick={() => setZoomImageUrl(null)}
        >
          <div 
            className="relative max-w-5xl w-full bg-[#022421] border-2 border-teal-400/80 rounded-2xl shadow-[0_0_80px_rgba(20,184,166,0.6)] overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
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

            {/* Expanded Image Container */}
            <div className="p-4 bg-black/90 flex items-center justify-center overflow-auto flex-1 max-h-[75vh]">
              <img
                src={zoomImageUrl}
                alt="Expanded graphic"
                className="max-w-full max-h-[70vh] object-contain rounded-lg border border-teal-500/30 shadow-2xl"
              />
            </div>

            {/* Footer Tip */}
            <div className="px-5 py-2.5 bg-[#04221f] border-t border-teal-500/40 flex items-center justify-between text-[10px] font-mono text-teal-300/80">
              <span>💡 Generated specifically for your B2B thought leadership blueprint</span>
              <button
                onClick={() => setZoomImageUrl(null)}
                className="px-3 py-1 bg-teal-700 hover:bg-teal-600 text-white rounded font-bold cursor-pointer transition"
                type="button"
              >
                Close Preview (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
