import React, { useState, useEffect } from "react";
import {
  Cpu, Wifi, CheckCircle2, AlertTriangle, Terminal, Copy, Check,
  ExternalLink, RefreshCw, X, Zap, Server, Settings, ArrowRight, ShieldCheck
} from "lucide-react";

interface OllamaTunnelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated?: (config: any) => void;
}

export default function OllamaTunnelModal({ isOpen, onClose, onConfigUpdated }: OllamaTunnelModalProps) {
  const [baseUrl, setBaseUrl] = useState("https://numbly-clapping-filling.ngrok-free.app");
  const [model, setModel] = useState("qwen2.5:7b-instruct-q4_k_m");
  const [provider, setProvider] = useState<"auto" | "ollama" | "gemini">("auto");

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    provider?: string;
    message?: string;
    ollamaVersion?: string;
    models?: string[];
    latencyMs?: number;
    error?: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeSetupTab, setActiveSetupTab] = useState<"powershell" | "cloudflare" | "pinggy" | "ngrok" | "lan">("powershell");

  // Fetch current LLM config on mount
  useEffect(() => {
    if (!isOpen) return;
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/llm/config");
        if (res.ok) {
          const data = await res.json();
          if (data.baseUrl) setBaseUrl(data.baseUrl);
          if (data.model) setModel(data.model);
          if (data.provider) setProvider(data.provider);
        }
      } catch (err) {
        console.error("Failed to load LLM config:", err);
      }
    };
    fetchConfig();
  }, [isOpen]);

  const handleTestConnection = async (targetUrl = baseUrl, targetModel = model) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/llm/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: targetUrl,
          model: targetModel,
          provider: provider
        })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: `Network error reaching server endpoint: ${err.message || err}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/llm/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          model: model.trim() || "qwen2.5",
          provider: provider
        })
      });

      if (!res.ok) throw new Error("Failed to save LLM tunnel settings.");
      const data = await res.json();
      setSaveMessage("⚡ G14 / Mac Ollama settings saved successfully!");
      if (onConfigUpdated) onConfigUpdated(data.config);
      
      // Auto test after saving
      handleTestConnection(baseUrl.trim(), model.trim() || "qwen2.5");
      setTimeout(() => setSaveMessage(""), 4000);
    } catch (err: any) {
      setSaveMessage(`Error: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#030e1a] border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden relative font-sans my-8">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 bg-[#01070e] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Cpu size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded font-mono font-semibold">
                  Ollama Local LLM
                </span>
                <h2 className="text-base font-bold text-white tracking-tight uppercase font-mono">
                  G14 / Mac Qwen2.5 Tunnel Config
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Connect your ASUS G14 or Mac Ollama local model to Opportunity Radar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Quick Active Status Banner */}
          {testResult && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              testResult.success
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/20 text-rose-300"
            }`}>
              {testResult.success ? (
                <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={20} className="text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs space-y-1">
                <p className="font-bold text-sm">
                  {testResult.success ? "⚡ G14 / Mac Tunnel Connected Successfully!" : "❌ Could Not Connect to Ollama Endpoint"}
                </p>
                <p className="text-slate-300 leading-relaxed">
                  {testResult.message || testResult.error}
                </p>
                {testResult.success && (
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] font-mono pt-2 border-t border-emerald-500/20">
                    <span className="bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-200">
                      Ollama Version: {testResult.ollamaVersion || "Connected"}
                    </span>
                    <span className="bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-200">
                      Latency: {testResult.latencyMs}ms
                    </span>
                    {testResult.models && testResult.models.length > 0 && (
                      <span className="bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-200">
                        Installed Models: {testResult.models.join(", ")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Configuration Form */}
          <form onSubmit={handleSaveConfig} className="space-y-4 bg-slate-900/50 p-5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
                <Server size={14} className="text-cyan-400" />
                Tunnel Connection Settings
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">Set & Forget Configuration</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ollama Base URL */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>G14 / Mac Tunnel URL (Ollama Base URL)</span>
                  <span className="text-[10px] text-cyan-400 font-mono">HTTPS or HTTP</span>
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="e.g. https://xxxx.trycloudflare.com or http://localhost:11434"
                  className="w-full bg-[#01070e] border border-slate-700 focus:border-cyan-500 text-white rounded-xl py-2 px-3 text-xs font-mono focus:outline-none transition"
                />
                <p className="text-[11px] text-slate-400">
                  Enter your Cloudflare Tunnel, Ngrok, Pinggy, LocalTunnel, or LAN IP URL pointing to port 11434 on your G14 / Mac.
                </p>
              </div>

              {/* Ollama Model */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Target Model Name</span>
                  <span className="text-[10px] text-cyan-400 font-mono">Qwen2.5 Dedicated</span>
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. qwen2.5:7b-instruct-q4_k_m or qwen2.5"
                  className="w-full bg-[#01070e] border border-slate-700 focus:border-cyan-500 text-white rounded-xl py-2 px-3 text-xs font-mono focus:outline-none transition"
                />
                
                {/* Quick Model Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-mono">Presets:</span>
                  {[
                    "qwen2.5:7b-instruct-q4_k_m",
                    "qwen2.5",
                    "qwen2.5:7b",
                    "qwen2.5:14b",
                    "qwen2.5:coder"
                  ].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModel(m)}
                      className={`text-[10px] px-2 py-0.5 rounded border font-mono transition cursor-pointer ${
                        model === m
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold"
                          : "bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* LLM Provider Strategy */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Provider Strategy</label>
                <select
                  value={provider}
                  onChange={(e: any) => setProvider(e.target.value)}
                  className="w-full bg-[#01070e] border border-slate-700 focus:border-cyan-500 text-white rounded-xl py-2 px-3 text-xs font-mono focus:outline-none transition cursor-pointer"
                >
                  <option value="auto">Auto-Detect (Use G14 Ollama if online, fallback to Gemini)</option>
                  <option value="ollama">Force G14 / Mac Ollama (Qwen2.5 strictly)</option>
                  <option value="gemini">Force Gemini 3.6 Flash (Cloud API)</option>
                </select>
                <p className="text-[11px] text-slate-400">
                  Controls which AI engine executes drafting & analysis.
                </p>
              </div>
            </div>

            {saveMessage && (
              <p className={`text-xs font-semibold ${saveMessage.startsWith("Error") ? "text-rose-400" : "text-emerald-400"}`}>
                {saveMessage}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => handleTestConnection()}
                disabled={isTesting || !baseUrl.trim()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isTesting ? <RefreshCw size={14} className="animate-spin text-cyan-400" /> : <Wifi size={14} className="text-cyan-400" />}
                Test Connection
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                Save & Apply Settings
              </button>
            </div>
          </form>

          {/* G14 & Mac Tunnel Quick Setup Guide */}
          <div className="space-y-3 bg-slate-900/30 p-5 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
                <Terminal size={14} className="text-amber-400" />
                How to Set Up the Tunnel on G14 / Mac
              </h3>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono border border-amber-500/20">
                1-Minute Setup
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Step 1: Make sure Ollama is running on your G14 or Mac with CORS allowed.
              <br />
              Step 2: Run a free tunnel command in your terminal to expose port 11434 securely.
            </p>

            {/* Tunnel Choice Tabs */}
            <div className="flex flex-wrap border-b border-slate-800 gap-2 pt-1 font-mono text-xs">
              <button
                onClick={() => setActiveSetupTab("powershell")}
                className={`pb-2 px-3 border-b-2 font-medium transition cursor-pointer ${
                  activeSetupTab === "powershell"
                    ? "border-cyan-400 text-cyan-400 font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                💻 Windows / PowerShell (G14)
              </button>
              <button
                onClick={() => setActiveSetupTab("cloudflare")}
                className={`pb-2 px-3 border-b-2 font-medium transition cursor-pointer ${
                  activeSetupTab === "cloudflare"
                    ? "border-cyan-400 text-cyan-400 font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                ⚡ Cloudflare Tunnel (Recommended)
              </button>
              <button
                onClick={() => setActiveSetupTab("pinggy")}
                className={`pb-2 px-3 border-b-2 font-medium transition cursor-pointer ${
                  activeSetupTab === "pinggy"
                    ? "border-cyan-400 text-cyan-400 font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                🔗 Pinggy SSH
              </button>
              <button
                onClick={() => setActiveSetupTab("ngrok")}
                className={`pb-2 px-3 border-b-2 font-medium transition cursor-pointer ${
                  activeSetupTab === "ngrok"
                    ? "border-cyan-400 text-cyan-400 font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                🚀 Ngrok / LocalTunnel
              </button>
              <button
                onClick={() => setActiveSetupTab("lan")}
                className={`pb-2 px-3 border-b-2 font-medium transition cursor-pointer ${
                  activeSetupTab === "lan"
                    ? "border-cyan-400 text-cyan-400 font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                🏠 Direct LAN / Tailscale
              </button>
            </div>

            {/* Tab Contents */}
            {activeSetupTab === "powershell" && (
              <div className="space-y-3 text-xs">
                <p className="text-slate-300 font-semibold">Windows PowerShell Setup for ASUS G14 / Windows:</p>
                
                <div className="space-y-1.5">
                  <p className="text-slate-300">1. Kill any existing background Ollama process (Fixes port 11434 conflict):</p>
                  <div className="bg-[#01070e] p-3 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                    <span>Stop-Process -Name "ollama" -Force -ErrorAction SilentlyContinue</span>
                    <button
                      onClick={() => copyToClipboard('Stop-Process -Name "ollama" -Force -ErrorAction SilentlyContinue', 101)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      {copiedIndex === 101 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-slate-300">2. Launch Ollama in PowerShell with host & origin environment variables set:</p>
                  <div className="bg-[#01070e] p-3 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                    <span>$env:OLLAMA_HOST="0.0.0.0"; $env:OLLAMA_ORIGINS="*"; ollama serve</span>
                    <button
                      onClick={() => copyToClipboard('$env:OLLAMA_HOST="0.0.0.0"; $env:OLLAMA_ORIGINS="*"; ollama serve', 102)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      {copiedIndex === 102 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    <strong className="text-amber-300">Admin needed?</strong> Standard PowerShell is usually fine! Only run as Admin if Windows Firewall blocks network binding.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-slate-300">3. In a second PowerShell window, start your Cloudflare Tunnel to expose port 11434:</p>
                  <div className="bg-[#01070e] p-3 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                    <span>npx cloudflared tunnel --url http://localhost:11434</span>
                    <button
                      onClick={() => copyToClipboard('npx cloudflared tunnel --url http://localhost:11434', 103)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      {copiedIndex === 103 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {activeSetupTab === "cloudflare" && (
              <div className="space-y-2 text-xs">
                <p className="text-slate-300 font-semibold">1. Start Ollama on G14 / Mac with CORS enabled:</p>
                <div className="bg-[#01070e] p-3 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                  <span>OLLAMA_ORIGINS="*" ollama serve</span>
                  <button
                    onClick={() => copyToClipboard('OLLAMA_ORIGINS="*" ollama serve', 1)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {copiedIndex === 1 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>

                <p className="text-slate-300 font-semibold pt-2">2. Launch free Cloudflare Tunnel <span className="text-emerald-400 font-normal">(NO Account Required)</span>:</p>
                <div className="space-y-1.5">
                  <div className="text-[11px] text-slate-400 font-medium">For Ollama (G14 / Mac - Port 11434):</div>
                  <div className="bg-[#01070e] p-2.5 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                    <span>npx cloudflared tunnel --url http://localhost:11434</span>
                    <button
                      onClick={() => copyToClipboard('npx cloudflared tunnel --url http://localhost:11434', 2)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      {copiedIndex === 2 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-400 font-medium pt-1">For n8n Automation Engine (Mac - Port 5678):</div>
                  <div className="bg-[#01070e] p-2.5 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                    <span>npx cloudflared tunnel --url http://localhost:5678</span>
                    <button
                      onClick={() => copyToClipboard('npx cloudflared tunnel --url http://localhost:5678', 21)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      {copiedIndex === 21 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 pt-1">
                  Copy the generated <code className="text-cyan-300">https://xxxx.trycloudflare.com</code> URL into your config!
                </p>
              </div>
            )}

            {activeSetupTab === "pinggy" && (
              <div className="space-y-2 text-xs">
                <p className="text-slate-300 font-semibold">1-Line SSH Tunnel with Pinggy (No installation needed):</p>
                <div className="bg-[#01070e] p-3 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                  <span>ssh -R 80:localhost:11434 a.pinggy.io</span>
                  <button
                    onClick={() => copyToClipboard('ssh -R 80:localhost:11434 a.pinggy.io', 3)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {copiedIndex === 3 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Copy the HTTPS URL generated in your terminal into the Tunnel URL field above.
                </p>
              </div>
            )}

            {activeSetupTab === "ngrok" && (
              <div className="space-y-2 text-xs">
                <p className="text-slate-300 font-semibold">Option A: Standard Ngrok Tunnel</p>
                <div className="bg-[#01070e] p-3 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                  <span>ngrok http 11434</span>
                  <button
                    onClick={() => copyToClipboard('ngrok http 11434', 4)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {copiedIndex === 4 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>

                <p className="text-slate-300 font-semibold pt-1.5">Option B: Multi-Tunnel / Shared Domain (Pooling Enabled)</p>
                <p className="text-[11px] text-slate-400">
                  Fixes <code className="text-rose-300 font-mono">ERR_NGROK_334</code> when running active tunnels on both Mac (n8n port 5678) and G14 (Ollama port 11434) using the same static domain:
                </p>
                <div className="bg-[#01070e] p-3 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                  <span>ngrok http 5678 --pooling-enabled</span>
                  <button
                    onClick={() => copyToClipboard('ngrok http 5678 --pooling-enabled', 40)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {copiedIndex === 40 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>

                <p className="text-slate-300 font-semibold pt-1.5">Option C: LocalTunnel (No ngrok domain collision)</p>
                <div className="bg-[#01070e] p-3 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                  <span>npx localtunnel --port 11434</span>
                  <button
                    onClick={() => copyToClipboard('npx localtunnel --port 11434', 5)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {copiedIndex === 5 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}

            {activeSetupTab === "lan" && (
              <div className="space-y-2 text-xs">
                <p className="text-slate-300 font-semibold">Direct LAN / Tailscale IP setup:</p>
                <p className="text-slate-400">
                  If running on the same local Wi-Fi or Tailscale network, set <code className="text-cyan-300">OLLAMA_HOST=0.0.0.0</code> on G14, then enter your G14 IP address:
                </p>
                <div className="bg-[#01070e] p-3 rounded-lg border border-slate-800 font-mono text-slate-200 flex items-center justify-between text-[11px]">
                  <span>http://192.168.1.150:11434</span>
                  <button
                    onClick={() => copyToClipboard('http://192.168.1.150:11434', 6)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {copiedIndex === 6 ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-cyan-500/5 p-3 rounded-lg border border-cyan-500/20 text-[11px] text-cyan-300 flex items-center gap-2">
              <ShieldCheck size={16} className="shrink-0 text-cyan-400" />
              <span>
                <strong>Model Check:</strong> Your default model <code className="bg-cyan-950 px-1 py-0.5 rounded font-mono text-cyan-200">qwen2.5:7b-instruct-q4_k_m</code> (or <code className="bg-cyan-950 px-1 py-0.5 rounded font-mono text-cyan-200">qwen2.5</code>) is configured and ready on your G14 / Mac!
              </span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-[#01070e] flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">Opportunity Radar • G14 Local LLM Gateway</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
