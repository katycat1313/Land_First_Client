import React, { useState, useEffect } from "react";
import { 
  Brain, Sparkles, Save, RefreshCw, PlusCircle, CheckCircle2, 
  Tag, Clock, AlertCircle, MessageSquare, Terminal, ChevronRight, User,
  Webhook, Copy, Check, ExternalLink
} from "lucide-react";

interface AgentMemoryEntry {
  id: string;
  timestamp: string;
  tag: string;
  note: string;
  prospect?: string;
}

interface AgentMemoryData {
  summary: string;
  followUps?: any[];
  entries?: AgentMemoryEntry[];
}

interface AgentMemoryViewProps {
  getAuthHeaders: (extra?: Record<string, string>) => Record<string, string>;
}

export default function AgentMemoryView({ getAuthHeaders }: AgentMemoryViewProps) {
  const [memory, setMemory] = useState<AgentMemoryData>({
    summary: "",
    entries: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDistilling, setIsDistilling] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // New Note State
  const [newTag, setNewTag] = useState("Outreach Strategy");
  const [newNote, setNewNote] = useState("");
  const [newProspect, setNewProspect] = useState("");

  // Summary Edit State
  const [summaryText, setSummaryText] = useState("");

  const fetchMemory = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/agent/memory", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to load agent memory");
      const data = await res.json();
      setMemory(data);
      setSummaryText(data.summary || "");
    } catch (err: any) {
      console.error("Error fetching agent memory:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMemory();
  }, []);

  const handleSaveSummary = async () => {
    setIsSaving(true);
    setStatusMessage("");
    try {
      const updated = {
        ...memory,
        summary: summaryText
      };
      const res = await fetch("/api/agent/memory", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        setMemory(updated);
        setStatusMessage("Agent Memory summary saved successfully!");
        setTimeout(() => setStatusMessage(""), 3000);
      }
    } catch (err) {
      console.error("Failed to save memory summary:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setIsSaving(true);
    try {
      const entry: AgentMemoryEntry = {
        id: `mem-${Date.now()}`,
        timestamp: new Date().toISOString(),
        tag: newTag,
        note: newNote.trim(),
        prospect: newProspect.trim() || undefined
      };

      const updatedEntries = [entry, ...(memory.entries || [])];
      const updatedMemory = {
        ...memory,
        entries: updatedEntries
      };

      const res = await fetch("/api/agent/memory", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(updatedMemory)
      });

      if (res.ok) {
        setMemory(updatedMemory);
        setNewNote("");
        setNewProspect("");
        setStatusMessage("Added new note to Agent Memory!");
        setTimeout(() => setStatusMessage(""), 3000);
      }
    } catch (err) {
      console.error("Failed to add memory entry:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoDistill = async () => {
    setIsDistilling(true);
    setStatusMessage("");
    try {
      const res = await fetch("/api/agent/memory/distill", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" })
      });
      if (!res.ok) throw new Error("Failed to distill memory");
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        setSummaryText(data.memory.summary || "");
        setStatusMessage("✨ AI automatically distilled campaign learnings and updated Agent Memory!");
        setTimeout(() => setStatusMessage(""), 4000);
      }
    } catch (err: any) {
      console.error("Auto distill error:", err);
      setStatusMessage("Failed to distill memory. Ensure campaign opportunities exist.");
    } finally {
      setIsDistilling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Brain className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-100">AI Agent Memory & Strategy Engine</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Persistent knowledge base tracking campaign strategy, prospect reply patterns, and learned outreach formulas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoDistill}
              disabled={isDistilling}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isDistilling ? "animate-spin" : ""}`} />
              {isDistilling ? "Distilling Campaign Learnings..." : "Auto-Distill Memory with Gemini"}
            </button>

            <button
              onClick={fetchMemory}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg transition-all"
              title="Refresh Memory"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {statusMessage}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Memory Executive Summary */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Brain className="w-4 h-4 text-indigo-600" />
                Active Executive Strategy & Campaign Focus
              </h3>
              <button
                onClick={handleSaveSummary}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                Save Strategy
              </button>
            </div>

            <textarea
              value={summaryText}
              onChange={e => setSummaryText(e.target.value)}
              rows={8}
              placeholder="Detail the agent's core memory summary, current industry focus, target personas, and active campaign rules..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white leading-relaxed transition-all"
            />
            <p className="text-[11px] text-slate-400">
              💡 Tip: Click "Auto-Distill Memory" above to let Gemini automatically summarize all recent inbound replies, outreach outcomes, and computer logs into this memory doc.
            </p>
          </div>

          {/* Timeline of Remembered Entries */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Chronological Memory Logs ({memory.entries?.length || 0})
            </h3>

            {(!memory.entries || memory.entries.length === 0) ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Brain className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-medium">No memory log entries saved yet.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Use the "Add Memory Entry" form on the right or run "Auto-Distill Memory".</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {memory.entries.map((ent) => (
                  <div key={ent.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 hover:border-slate-300 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-[10px] font-bold">
                          {ent.tag}
                        </span>
                        {ent.prospect && (
                          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            {ent.prospect}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(ent.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {ent.note}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Add Memory Entry Form */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-indigo-600" />
              Add Manual Memory Entry
            </h3>

            <form onSubmit={handleAddEntry} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Category Tag
                </label>
                <select
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Outreach Strategy">Outreach Strategy</option>
                  <option value="Prospect Reply">Prospect Reply</option>
                  <option value="Industry Signal">Industry Signal</option>
                  <option value="CRM Update">CRM Update</option>
                  <option value="Objection Handling">Objection Handling</option>
                  <option value="General Lesson">General Lesson</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Prospect / Business Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe / Apex Construction"
                  value={newProspect}
                  onChange={e => setNewProspect(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Note / Learned Insight
                </label>
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  rows={4}
                  placeholder="Log specific guidelines, preferences, or campaign observations..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving || !newNote.trim()}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow transition-all disabled:opacity-50"
              >
                Save to Agent Memory
              </button>
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-300 space-y-3">
            <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              How Memory Powers Opportunity Radar
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              When the AI Agent generates outreach emails, critiques value propositions, or assists in the Brainstorming Co-Pilot, it automatically queries this memory store to apply your custom rules and historical campaign learnings.
            </p>
          </div>

          {/* n8n Webhook Node Configuration Box */}
          <div className="bg-slate-950 border border-purple-900/50 rounded-xl p-5 text-slate-300 space-y-3.5 shadow-xl">
            <div className="flex items-center justify-between border-b border-purple-900/40 pb-2.5">
              <h4 className="text-xs font-bold text-purple-300 flex items-center gap-2">
                <Webhook className="w-4 h-4 text-purple-400" />
                n8n HTTP Request Node & cURL Testing
              </h4>
              <span className="text-[10px] font-mono text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800/50">
                POST /api/agent/memory/webhook
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Connect your external n8n workflow or terminal to feed new prospect replies, email events, or research findings directly into the AI Agent's persistent memory.
            </p>

            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Webhook URL (In n8n Node)</span>
              <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-[11px] font-mono text-purple-300 break-all select-all flex items-center justify-between">
                <span>{typeof window !== 'undefined' ? `${window.location.origin}/api/agent/memory/webhook` : '/api/agent/memory/webhook'}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">cURL Test Command (Copy & Run in Terminal)</span>
              <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed select-all">
{`curl -X POST "${typeof window !== 'undefined' ? window.location.origin : ''}/api/agent/memory/webhook" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tag": "Inbound Prospect Reply",
    "note": "Prospect replied asking for pricing and scheduling integration options.",
    "prospect": "John Doe (Acme Corp)"
  }'`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
