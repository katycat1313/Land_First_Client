import React, { useState } from "react";
import { Opportunity } from "../types";
import { 
  Table, Calendar, FileSpreadsheet, Download, Copy, Check, 
  ExternalLink, Mail, Clock, Filter, Search, Edit3, Save, 
  AlertCircle, MessageSquare, ArrowUpRight, Sparkles, RefreshCw,
  Brain, Newspaper, Users, Zap, Bot, ChevronDown, ChevronUp, DollarSign
} from "lucide-react";

interface CrmLedgerViewProps {
  opportunities: Opportunity[];
  onUpdateOpportunity: (id: string, updates: Partial<Opportunity>) => Promise<void>;
  onSelectOpportunity: (opp: Opportunity) => void;
  getAuthHeaders: (extra?: Record<string, string>) => Record<string, string>;
  onRefreshData: () => void;
}

export default function CrmLedgerView({
  opportunities,
  onUpdateOpportunity,
  onSelectOpportunity,
  getAuthHeaders,
  onRefreshData
}: CrmLedgerViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [followupFilter, setFollowupFilter] = useState("All");
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Research loading states
  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [isBatchResearching, setIsBatchResearching] = useState(false);
  const [expandedResearchId, setExpandedResearchId] = useState<string | null>(null);
  const [copiedIcebreaker, setCopiedIcebreaker] = useState<string | null>(null);

  // Temporary form values when editing a row
  const [editStatus, setEditStatus] = useState<Opportunity['status']>("Contacted");
  const [editNotes, setEditNotes] = useState("");
  const [editFollowUpDate, setEditFollowUpDate] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editDealValue, setEditDealValue] = useState<number | "">("");
  const [isSavingRow, setIsSavingRow] = useState(false);

  // Copy feedback
  const [copiedSheet, setCopiedSheet] = useState(false);
  const [showApiHelp, setShowApiHelp] = useState(false);

  // Compute Metrics
  const totalLeads = opportunities.length;
  const contactedLeads = opportunities.filter(o => o.status === "Contacted" || o.status === "Replied" || o.status === "In Discussion").length;
  const repliedLeads = opportunities.filter(o => o.status === "Replied" || o.status === "In Discussion").length;
  const pendingFollowups = opportunities.filter(o => {
    if (!o.followUpDate) return false;
    const due = new Date(o.followUpDate);
    const today = new Date();
    today.setHours(0,0,0,0);
    return due <= today;
  }).length;
  const researchedLeads = opportunities.filter(o => o.companyResearch?.researchedAt).length;

  const todayStr = new Date().toISOString().split("T")[0];

  // Filter logic
  const filteredOpps = opportunities.filter(o => {
    const matchesSearch = 
      o.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.contactEmail && o.contactEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (o.notes && o.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === "All" || o.status === statusFilter;

    let matchesFollowup = true;
    if (followupFilter === "due") {
      matchesFollowup = Boolean(o.followUpDate && o.followUpDate <= todayStr);
    } else if (followupFilter === "upcoming") {
      matchesFollowup = Boolean(o.followUpDate && o.followUpDate > todayStr);
    } else if (followupFilter === "none") {
      matchesFollowup = !o.followUpDate;
    }

    return matchesSearch && matchesStatus && matchesFollowup;
  });

  const handleStartEdit = (opp: Opportunity) => {
    setEditingId(opp.id);
    setEditStatus(opp.status);
    setEditNotes(opp.notes || "");
    setEditFollowUpDate(opp.followUpDate || "");
    setEditEmail(opp.contactEmail || opp.gmailSentTo || "");
    setEditDealValue(opp.estimatedDealValue || "");
  };

  const handleSaveEdit = async (oppId: string) => {
    setIsSavingRow(true);
    try {
      await onUpdateOpportunity(oppId, {
        status: editStatus,
        notes: editNotes,
        followUpDate: editFollowUpDate || undefined,
        contactEmail: editEmail || undefined,
        estimatedDealValue: editDealValue !== "" ? Number(editDealValue) : undefined
      });
      setEditingId(null);
    } catch (err) {
      console.error("Failed to save CRM row edit:", err);
    } finally {
      setIsSavingRow(false);
    }
  };

  // Trigger individual prospect deep research
  const handleResearchProspect = async (id: string) => {
    setResearchingId(id);
    try {
      const res = await fetch("/api/crm/research-prospect", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error("Research failed");
      const data = await res.json();
      if (data.success) {
        setExpandedResearchId(id);
        onRefreshData();
      }
    } catch (err) {
      console.error("Error researching prospect:", err);
    } finally {
      setResearchingId(null);
    }
  };

  // Trigger autonomous batch research worker for downtime
  const handleBatchResearchWorker = async () => {
    setIsBatchResearching(true);
    try {
      const res = await fetch("/api/crm/batch-autonomous-research", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" })
      });
      if (!res.ok) throw new Error("Batch research failed");
      const data = await res.json();
      if (data.success) {
        onRefreshData();
      }
    } catch (err) {
      console.error("Error running batch worker:", err);
    } finally {
      setIsBatchResearching(false);
    }
  };

  const copyIcebreaker = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIcebreaker(text);
    setTimeout(() => setCopiedIcebreaker(null), 2500);
  };

  // Export as TSV for direct paste into Google Sheets
  const handleCopyForGoogleSheets = () => {
    const headers = [
      "Title", "Author", "Contact Email", "Industry", "Platform", 
      "Status", "Contacted Date", "Follow Up Date", "Score", "Notes", "Link"
    ];

    const rows = opportunities.map(o => [
      o.title.replace(/\t/g, " "),
      o.author.replace(/\t/g, " "),
      (o.contactEmail || o.gmailSentTo || "").replace(/\t/g, " "),
      o.industry.replace(/\t/g, " "),
      o.sourcePlatform.replace(/\t/g, " "),
      o.status.replace(/\t/g, " "),
      (o.contactedDate || "").replace(/\t/g, " "),
      (o.followUpDate || "").replace(/\t/g, " "),
      o.opportunityScore,
      (o.notes || "").replace(/\n/g, " ").replace(/\t/g, " "),
      o.originalSourceLink || o.sourceUrl
    ]);

    const tsvContent = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
    navigator.clipboard.writeText(tsvContent);
    setCopiedSheet(true);
    setTimeout(() => setCopiedSheet(false), 3000);
  };

  // Download CSV
  const handleDownloadCsv = () => {
    window.open("/api/crm/export-csv", "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & High-Level Metrics */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-100">Outreach CRM & Google Sheet Ledger</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Track prospect outreach, log inbound replies from n8n & Gmail, schedule follow-ups, and sync with Google Sheets.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBatchResearchWorker}
              disabled={isBatchResearching}
              className="flex items-center gap-2 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white border border-purple-400/30 rounded-lg text-xs font-semibold shadow-lg shadow-purple-600/20 transition-all disabled:opacity-50"
              title="Runs Gemini background research across unresearched leads to gather news signals, employee pain points, and icebreakers"
            >
              <Bot className={`w-4 h-4 text-purple-200 ${isBatchResearching ? "animate-spin" : ""}`} />
              {isBatchResearching ? "Worker Researching Leads..." : "🤖 Run Downtime Research Worker"}
            </button>

            <button
              onClick={handleCopyForGoogleSheets}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                copiedSheet
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                  : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              }`}
            >
              {copiedSheet ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedSheet ? "Copied! Paste in Google Sheets (Ctrl+V)" : "Copy for Google Sheets"}
            </button>

            <button
              onClick={handleDownloadCsv}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-all"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              Export CSV
            </button>

            <button
              onClick={() => setShowApiHelp(!showApiHelp)}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition-all"
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Sheet & n8n API Webhook
            </button>

            <button
              onClick={onRefreshData}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg transition-all"
              title="Refresh CRM Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
            <span className="text-xs text-slate-400 font-medium">Total Pipeline Leads</span>
            <div className="text-2xl font-bold text-white mt-1">{totalLeads}</div>
            <p className="text-[10px] text-slate-500 mt-1">Discovered opportunities</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
            <span className="text-xs text-slate-400 font-medium">Contacted Outreach</span>
            <div className="text-2xl font-bold text-indigo-400 mt-1">{contactedLeads}</div>
            <p className="text-[10px] text-slate-500 mt-1">Sent pitches / messages</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
            <span className="text-xs text-slate-400 font-medium">Inbound Replies</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{repliedLeads}</div>
            <p className="text-[10px] text-slate-500 mt-1">
              {contactedLeads > 0 ? `${Math.round((repliedLeads / contactedLeads) * 100)}% reply rate` : "Awaiting responses"}
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
            <span className="text-xs text-amber-400 font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Follow-ups Due
            </span>
            <div className="text-2xl font-bold text-amber-400 mt-1">{pendingFollowups}</div>
            <p className="text-[10px] text-amber-500/80 mt-1">Action required today</p>
          </div>
        </div>

        {/* API Help & Integration Modal/Card */}
        {showApiHelp && (
          <div className="mt-6 pt-6 border-t border-slate-800 bg-slate-950/80 p-5 rounded-xl text-slate-300 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Google Sheets & n8n Sync Webhook Endpoints
              </h3>
              <button 
                onClick={() => setShowApiHelp(false)}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                <p className="font-semibold text-slate-200">1. Pull CRM Data into Google Sheets / n8n</p>
                <p className="text-slate-400">
                  Use this JSON endpoint in n8n or Google Apps Script to auto-populate your Google Sheet:
                </p>
                <code className="block bg-slate-950 p-2 rounded text-indigo-300 border border-slate-800 font-mono text-[11px]">
                  GET /api/crm/sync-sheet
                </code>
              </div>

              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                <p className="font-semibold text-slate-200">2. Receive Inbound Email Replies (n8n Webhook)</p>
                <p className="text-slate-400">
                  Point your n8n Gmail Trigger HTTP Request node to this URL when a prospect replies:
                </p>
                <code className="block bg-slate-950 p-2 rounded text-emerald-300 border border-slate-800 font-mono text-[11px]">
                  POST /api/inbound-reply
                </code>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 md:space-y-0 md:flex md:items-center md:justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads, author, email, or notes..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="New">New</option>
              <option value="Saved">Saved</option>
              <option value="Contacted">Contacted</option>
              <option value="Replied">Replied</option>
              <option value="In Discussion">In Discussion</option>
              <option value="Potential Product">Potential Product</option>
              <option value="Archived">Archived</option>
            </select>
          </div>

          {/* Follow-up Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium text-slate-500">Follow-up:</span>
            <select
              value={followupFilter}
              onChange={e => setFollowupFilter(e.target.value)}
              className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="All">All Follow-ups</option>
              <option value="due">Due Today or Overdue</option>
              <option value="upcoming">Upcoming</option>
              <option value="none">No Follow-up Scheduled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main CRM Outreach Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Opportunity & Prospect</th>
                <th className="py-3 px-4">Platform & Industry</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Contacted / Reply</th>
                <th className="py-3 px-4">Follow-Up Date</th>
                <th className="py-3 px-4">CRM Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredOpps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <FileSpreadsheet className="w-8 h-8 text-slate-300" />
                      <p className="font-medium">No CRM records match your current filters.</p>
                      <p className="text-[11px] text-slate-400">Try adjusting your search terms or status filters above.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOpps.map(opp => {
                  const isEditing = editingId === opp.id;
                  const isDue = opp.followUpDate && opp.followUpDate <= todayStr;

                  return (
                    <React.Fragment key={opp.id}>
                      <tr 
                        className={`hover:bg-slate-50/60 transition-colors ${
                          isDue ? "bg-amber-50/30" : ""
                        }`}
                      >
                        {/* Opportunity Title & Prospect */}
                      <td className="py-3.5 px-4 min-w-[220px]">
                        <div className="space-y-1">
                          <button
                            onClick={() => onSelectOpportunity(opp)}
                            className="font-semibold text-slate-900 hover:text-indigo-600 line-clamp-1 text-left"
                          >
                            {opp.title}
                          </button>
                          
                          <div className="flex items-center gap-2 text-[11px] text-slate-500">
                            <span className="font-medium text-slate-700">{opp.author || "Unknown"}</span>
                            {opp.contactEmail && (
                              <span className="text-slate-400 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {opp.contactEmail}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Platform & Industry */}
                      <td className="py-3.5 px-4 min-w-[140px]">
                        <div className="space-y-1">
                          <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium">
                            {opp.sourcePlatform}
                          </span>
                          <p className="text-[11px] text-slate-500 line-clamp-1">{opp.industry}</p>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 min-w-[130px]">
                        {isEditing ? (
                          <select
                            value={editStatus}
                            onChange={e => setEditStatus(e.target.value as any)}
                            className="w-full bg-white border border-indigo-300 rounded p-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="New">New</option>
                            <option value="Saved">Saved</option>
                            <option value="Contacted">Contacted</option>
                            <option value="Replied">Replied</option>
                            <option value="In Discussion">In Discussion</option>
                            <option value="Potential Product">Potential Product</option>
                            <option value="Archived">Archived</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            opp.status === "Replied"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : opp.status === "Contacted"
                              ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                              : opp.status === "In Discussion"
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : opp.status === "Potential Product"
                              ? "bg-blue-100 text-blue-800 border border-blue-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}>
                            {opp.status}
                          </span>
                        )}
                      </td>

                      {/* Contacted / Reply Timestamp */}
                      <td className="py-3.5 px-4 min-w-[150px] text-slate-600">
                        <div className="space-y-1 text-[11px]">
                          {opp.contactedDate && (
                            <div>
                              <span className="text-slate-400">Sent: </span>
                              <span className="font-medium text-slate-700">{opp.contactedDate.split("T")[0]}</span>
                            </div>
                          )}
                          {opp.lastInteraction && (
                            <div className="text-[10px] text-slate-400">
                              Updated {new Date(opp.lastInteraction).toLocaleDateString()}
                            </div>
                          )}
                          {!opp.contactedDate && !opp.lastInteraction && (
                            <span className="text-slate-400 italic">Not contacted yet</span>
                          )}
                        </div>
                      </td>

                      {/* Follow-Up Date */}
                      <td className="py-3.5 px-4 min-w-[140px]">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editFollowUpDate}
                            onChange={e => setEditFollowUpDate(e.target.value)}
                            className="bg-white border border-indigo-300 rounded p-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : opp.followUpDate ? (
                          <div className={`flex items-center gap-1.5 font-medium ${
                            isDue ? "text-amber-700 font-semibold" : "text-slate-700"
                          }`}>
                            <Calendar className={`w-3.5 h-3.5 ${isDue ? "text-amber-600" : "text-slate-400"}`} />
                            <span>{opp.followUpDate}</span>
                            {isDue && (
                              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] uppercase tracking-wider font-bold">
                                Due
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">None scheduled</span>
                        )}
                      </td>

                      {/* CRM Notes */}
                      <td className="py-3.5 px-4 min-w-[200px]">
                        {isEditing ? (
                          <textarea
                            value={editNotes}
                            onChange={e => setEditNotes(e.target.value)}
                            rows={2}
                            placeholder="Add deal notes, meeting takeaways, or next steps..."
                            className="w-full bg-white border border-indigo-300 rounded p-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <p className="text-slate-600 line-clamp-2 text-[11px]">
                            {opp.notes || <span className="text-slate-400 italic">No notes logged</span>}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right min-w-[120px]">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleSaveEdit(opp.id)}
                              disabled={isSavingRow}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium flex items-center gap-1 transition-all"
                            >
                              <Save className="w-3 h-3" />
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleResearchProspect(opp.id)}
                              disabled={researchingId === opp.id}
                              className={`p-1.5 rounded transition-all text-xs font-semibold flex items-center gap-1 ${
                                opp.companyResearch?.researchedAt
                                  ? "text-purple-600 bg-purple-50 hover:bg-purple-100"
                                  : "text-slate-500 hover:text-purple-600 hover:bg-slate-100"
                              }`}
                              title="Run Gemini AI Research & News Analysis"
                            >
                              <Brain className={`w-3.5 h-3.5 ${researchingId === opp.id ? "animate-spin text-purple-600" : ""}`} />
                              <span className="hidden sm:inline">
                                {researchingId === opp.id ? "Analyzing..." : opp.companyResearch?.researchedAt ? "Researched" : "Research"}
                              </span>
                            </button>

                            {opp.companyResearch?.researchedAt && (
                              <button
                                onClick={() => setExpandedResearchId(expandedResearchId === opp.id ? null : opp.id)}
                                className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-all"
                                title="Toggle Deep Business Intelligence"
                              >
                                {expandedResearchId === opp.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            )}

                            <button
                              onClick={() => handleStartEdit(opp)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all"
                              title="Edit CRM Details"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => onSelectOpportunity(opp)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all"
                              title="View Full Opportunity & Response Generator"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Expandable Research & Intelligence Drawer */}
                    {expandedResearchId === opp.id && opp.companyResearch && (
                      <tr key={`research-${opp.id}`} className="bg-slate-900 text-slate-200">
                        <td colSpan={7} className="p-5 border-t border-slate-800">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="p-1.5 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                                  <Brain className="w-4 h-4" />
                                </span>
                                <div>
                                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                    Deep Business Intelligence & Research Signals
                                    <span className="text-[10px] font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                                      Researched {new Date(opp.companyResearch.researchedAt).toLocaleTimeString()}
                                    </span>
                                  </h4>
                                  <p className="text-xs text-slate-400">Company Size: {opp.companyResearch.companySize || "Small Business"} • Tech Stack: {opp.companyResearch.keyTechStack?.join(", ") || "Standard"}</p>
                                </div>
                              </div>

                              {opp.estimatedDealValue && (
                                <div className="text-right bg-emerald-950/60 border border-emerald-800/50 px-3 py-1.5 rounded-lg">
                                  <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider block">Estimated Value</span>
                                  <span className="text-sm font-bold text-emerald-300">${opp.estimatedDealValue.toLocaleString()}</span>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              {/* News Signals & Media Trends */}
                              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-lg space-y-2">
                                <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                                  <Newspaper className="w-3.5 h-3.5 text-purple-400" />
                                  News Signals & Media Trends
                                </span>
                                {opp.companyResearch.recentEvents && (
                                  <p className="text-[11px] text-slate-300 italic bg-slate-900/80 p-2 rounded border border-slate-800">
                                    "{opp.companyResearch.recentEvents}"
                                  </p>
                                )}
                                <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
                                  {opp.companyResearch.newsSignals?.map((sig, i) => (
                                    <li key={i}>{sig}</li>
                                  )) || <li>No recent media alerts found.</li>}
                                </ul>
                              </div>

                              {/* Employee Complaints & Operational Pain Points */}
                              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-lg space-y-2">
                                <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5 text-amber-400" />
                                  Employee & Staff Pain Points
                                </span>
                                <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
                                  {opp.companyResearch.employeePainPoints?.map((pain, i) => (
                                    <li key={i}>{pain}</li>
                                  )) || <li>Manual overhead identified in original post.</li>}
                                </ul>
                              </div>

                              {/* Conversational Icebreakers */}
                              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-lg space-y-2">
                                <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                                  Conversational Icebreakers
                                </span>
                                <div className="space-y-2">
                                  {opp.companyResearch.icebreakers?.map((ice, i) => (
                                    <div key={i} className="bg-slate-900 p-2 rounded border border-slate-800 relative group">
                                      <p className="text-[11px] text-slate-300 pr-6">{ice}</p>
                                      <button
                                        onClick={() => copyIcebreaker(ice)}
                                        className="absolute right-1.5 top-1.5 text-slate-500 hover:text-emerald-400 transition"
                                        title="Copy Icebreaker"
                                      >
                                        {copiedIcebreaker === ice ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                  )) || <p className="text-slate-500">No icebreakers generated.</p>}
                                </div>
                              </div>
                            </div>

                            {/* Follow-up Sequences */}
                            {opp.followUpSequences && opp.followUpSequences.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-slate-800">
                                <span className="text-xs font-semibold text-slate-300 block mb-2">Recommended Follow-Up Sequence Engine:</span>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                  {opp.followUpSequences.map(seq => (
                                    <div key={seq.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                                        <span>Step {seq.step}: {seq.type} ({seq.scheduledDate})</span>
                                        <span className="text-indigo-400">{seq.subject}</span>
                                      </div>
                                      <p className="text-[11px] text-slate-300 whitespace-pre-wrap line-clamp-3">{seq.body}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
