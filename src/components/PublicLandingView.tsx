import React, { useState, useEffect } from "react";
import { 
  Sparkles, DollarSign, PhoneCall, MessageSquare, Calendar, 
  ShieldCheck, Cpu, ArrowRight, Lock, Unlock, CheckCircle2, 
  Calculator, Building2, Flame, Zap, AlertCircle, Globe, 
  Mail, Phone, Clock, ArrowDown, Bot, Check, FileSpreadsheet
} from "lucide-react";

interface PublicLandingViewProps {
  onOpenFounderLogin: () => void;
  isUnlocked: boolean;
  onSwitchToDashboard: () => void;
}

export default function PublicLandingView({
  onOpenFounderLogin,
  isUnlocked,
  onSwitchToDashboard
}: PublicLandingViewProps) {
  // Automatic anonymous page view / visitor analytics tracking
  useEffect(() => {
    try {
      fetch("/api/public/track-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referrer: document.referrer || "direct",
          path: window.location.pathname || "/"
        })
      }).catch(() => {});
    } catch (e) { }
  }, []);

  // Calculator states
  const [industry, setIndustry] = useState("HVAC / Plumbing / Electrical");
  const [ticketSize, setTicketSize] = useState<number>(1800);
  const [missedPerWeek, setMissedPerWeek] = useState<number>(5);
  const [closeRate, setCloseRate] = useState<number>(30);

  // Form states
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [formIndustry, setFormIndustry] = useState("HVAC & Home Services");
  const [monthlyDealVal, setMonthlyDealVal] = useState("$1,000 - $3,000");
  const [primaryBottleneck, setPrimaryBottleneck] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<any | null>(null);
  const [submitError, setSubmitError] = useState("");

  // Preset industries for calculator
  const industryPresets: Record<string, { avgTicket: number; name: string }> = {
    "HVAC / Plumbing / Electrical": { avgTicket: 1800, name: "HVAC & Home Contracting" },
    "Real Estate / Mortgage": { avgTicket: 6500, name: "Real Estate & Brokerage" },
    "Roofing & General Construction": { avgTicket: 4500, name: "Roofing & Construction" },
    "Boutique Agency / Consulting": { avgTicket: 2500, name: "Boutique Agency & Services" },
    "Specialty Health / Dental Clinic": { avgTicket: 800, name: "Specialty Clinic & Health" },
    "Other Local Micro-Business": { avgTicket: 1200, name: "General Micro-Business" }
  };

  const handleIndustryChange = (ind: string) => {
    setIndustry(ind);
    if (industryPresets[ind]) {
      setTicketSize(industryPresets[ind].avgTicket);
      setFormIndustry(industryPresets[ind].name);
    }
  };

  // Calculations
  const monthlyMissedLeads = missedPerWeek * 4.33;
  const convertedLeads = monthlyMissedLeads * (closeRate / 100);
  const monthlyLostRevenue = Math.round(convertedLeads * ticketSize);
  const annualLostRevenue = monthlyLostRevenue * 12;

  const handlePreFillForm = () => {
    const calcSummary = `We are missing approx ${missedPerWeek} calls/inquiries per week in our ${industry} business. Our average job size is ~$${ticketSize}. We estimate losing ~$${monthlyLostRevenue.toLocaleString()}/month in missed deals.`;
    setPrimaryBottleneck(calcSummary);
    const formElement = document.getElementById("audit-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleSubmitAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() && !email.trim() && !phone.trim() && !primaryBottleneck.trim()) {
      setSubmitError("Please fill out your business name, contact info, or bottleneck description.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch("/api/public/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          contactName,
          email,
          phone,
          industry: formIndustry,
          monthlyDealValue: monthlyDealVal,
          primaryBottleneck: primaryBottleneck || `Estimated $${monthlyLostRevenue.toLocaleString()}/mo in missed inquiries`,
          notes
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to submit request.");
      }

      const data = await res.json();
      setSubmitSuccess(data);
    } catch (err: any) {
      setSubmitError(err.message || "An error occurred while submitting. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Banner Navigation */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/10">
              <DollarSign className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                MISSED REVENUE <span className="text-amber-400 font-mono text-xs px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">RECOVERY</span>
              </span>
              <p className="text-[11px] text-slate-400 -mt-1 hidden sm:block">Custom AI Solutions & Business Automations</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a 
              href="#calculator" 
              className="hidden md:inline-flex text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 transition-colors"
            >
              ROI Calculator
            </a>
            <a 
              href="#services" 
              className="hidden md:inline-flex text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 transition-colors"
            >
              AI Services
            </a>
            <a 
              href="#audit-form" 
              className="text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-all"
            >
              Get AI Audit
            </a>

            {/* Founder Portal Button */}
            {isUnlocked ? (
              <button
                onClick={onSwitchToDashboard}
                className="flex items-center gap-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-1.5 rounded-lg font-semibold shadow-md shadow-amber-500/20 transition-all"
              >
                <Unlock className="w-3.5 h-3.5" />
                Dashboard
              </button>
            ) : (
              <button
                onClick={onOpenFounderLogin}
                className="flex items-center gap-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg transition-all"
                title="Founder Access Portal"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Log In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-20 overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-6">
            <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Custom AI & Business Problem Solving</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight">
            We Find & Build Custom AI Solutions <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              To Put Lost Revenue Back In Your Pocket
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed">
            If your business is struggling with missed calls, manual paperwork, or outdated workflows, we build the exact AI tool, website, or automation to fix it. Tell us your problems below, or explore our example solutions!
          </p>

          {/* Quick Metrics Banner */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
              <div className="text-amber-400 font-bold text-xl sm:text-2xl">$15,000+</div>
              <div className="text-xs text-slate-400 mt-0.5">Avg. Monthly Missed Income</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
              <div className="text-emerald-400 font-bold text-xl sm:text-2xl">&lt; 5 Seconds</div>
              <div className="text-xs text-slate-400 mt-0.5">Instant AI Text Recapture</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
              <div className="text-cyan-400 font-bold text-xl sm:text-2xl">24/7 / 365</div>
              <div className="text-xs text-slate-400 mt-0.5">Autonomous Lead Nurturing</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
              <div className="text-purple-400 font-bold text-xl sm:text-2xl">0 Extra Apps</div>
              <div className="text-xs text-slate-400 mt-0.5">Hooks into Existing Phone</div>
            </div>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#audit-form"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all"
            >
              Tell Us Your Business Problem <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#services"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm border border-slate-700 flex items-center justify-center gap-2 transition-all"
            >
              Explore Example Solutions
            </a>
          </div>
        </div>
      </section>

      {/* Interactive Missed Revenue & ROI Calculator */}
      <section id="calculator" className="py-16 bg-slate-900/60 border-y border-slate-800/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
              Interactive ROI Estimator
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white mt-3">
              How Much Revenue Are You Missing Each Month?
            </h2>
            <p className="text-slate-400 text-sm mt-2 max-w-2xl mx-auto">
              Select your industry and estimated ticket size to see how much income is slipping through the cracks from missed calls and delayed responses.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Controls */}
            <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Select Your Business Industry
                </label>
                <select
                  value={industry}
                  onChange={(e) => handleIndustryChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  {Object.keys(industryPresets).map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Average Job / Deal Value ($)
                  </label>
                  <span className="text-xs font-mono font-bold text-amber-400">${ticketSize.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={200}
                  max={15000}
                  step={100}
                  value={ticketSize}
                  onChange={(e) => setTicketSize(Number(e.target.value))}
                  className="w-full accent-amber-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Missed Calls / Inquiries per Week
                  </label>
                  <span className="text-xs font-mono font-bold text-amber-400">{missedPerWeek} / week</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={missedPerWeek}
                  onChange={(e) => setMissedPerWeek(Number(e.target.value))}
                  className="w-full accent-amber-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Estimated Conversion Rate (%)
                  </label>
                  <span className="text-xs font-mono font-bold text-amber-400">{closeRate}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={70}
                  step={5}
                  value={closeRate}
                  onChange={(e) => setCloseRate(Number(e.target.value))}
                  className="w-full accent-amber-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
                />
                <p className="text-[11px] text-slate-500 mt-1">Industry benchmark for instant SMS text-back: 30% - 45%</p>
              </div>
            </div>

            {/* Live Calculation Display */}
            <div className="lg:col-span-6 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 rounded-2xl p-6 sm:p-8 flex flex-col justify-between h-full shadow-xl">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wide">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  Estimated Monthly Leakage
                </div>

                <div className="mt-4 text-4xl sm:text-5xl font-black text-rose-400 font-mono tracking-tight">
                  -${monthlyLostRevenue.toLocaleString()}
                  <span className="text-sm font-normal text-slate-400 font-sans ml-2">/ month</span>
                </div>

                <div className="mt-2 text-sm text-slate-400">
                  That's over <span className="text-rose-300 font-bold font-mono">${annualLostRevenue.toLocaleString()}</span> lost every single year to uncaptured leads!
                </div>

                <div className="mt-6 pt-6 border-t border-slate-800 space-y-3 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-amber-400" /> Missed calls / month:
                    </span>
                    <span className="font-mono font-semibold text-white">{Math.round(monthlyMissedLeads)} calls</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" /> Recoupable deals with AI:
                    </span>
                    <span className="font-mono font-semibold text-emerald-400">{convertedLeads.toFixed(1)} closed clients</span>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button
                  onClick={handlePreFillForm}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-extrabold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
                >
                  <Sparkles className="w-4 h-4 fill-slate-950" />
                  Claim This Recouped Income
                </button>
                <p className="text-[11px] text-center text-slate-500 mt-2">P.A.C. will build a custom lead recapture strategy for your business.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase of AI Services */}
      <section id="services" className="py-20 bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20">
              Our Core AI Offerings
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">
              Custom AI & Automation Built for Growing Businesses
            </h2>
            <p className="text-slate-400 text-base mt-2 max-w-2xl mx-auto">
              We implement AI in every way your business needs—from 24/7 phone/SMS receptionists and custom web apps to automated CRM pipelines, internal tools, and AI workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Service 1 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 hover:border-amber-500/40 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6 group-hover:scale-110 transition-transform">
                <PhoneCall className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                1. Missed Call Instant SMS Text-Back
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                When you're busy working, on a roof, or with a client, missed calls automatically trigger an instant, human-like SMS response in under 5 seconds.
              </p>
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Greets caller professionally with your business name
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Asks how you can assist and collects job details
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Stops leads from immediately searching for competitors
                </li>
              </ul>
            </div>

            {/* Service 2 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 hover:border-emerald-500/40 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                2. 24/7 AI Lead Nurturing & Scheduling
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                An AI receptionist that works non-stop across text, web chat, and messaging platforms to answer common questions and book appointments.
              </p>
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Qualifies client budget, scope, and urgent timeline
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Syncs directly with Google Calendar or Outlook
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Dispatches instant notification alerts to your mobile
                </li>
              </ul>
            </div>

            {/* Service 3 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 hover:border-cyan-500/40 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-6 group-hover:scale-110 transition-transform">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                3. Operational Bottleneck & CRM Automation
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                Connect your disparate tools. We eliminate manual CSV spreadsheet cleanup, repetitive email reminders, and forgotten customer follow-ups.
              </p>
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Automated invoice & payment reminder follow-ups
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Clean CRM ledger synchronization without manual entry
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Automated connections between your phone, email, and customer records
                </li>
              </ul>
            </div>

            {/* Service 4 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 hover:border-purple-500/40 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-6 group-hover:scale-110 transition-transform">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                4. Specialized AI Executive Fleet (P.A.C.)
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                Autonomous AI agents that act as your digital executive strategist—monitoring incoming leads, drafting tailored pitches, and alerting you when high-intent opportunities arise.
              </p>
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Built on secure, high-speed AI custom-tailored to your business
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Human-in-the-loop approval safeguards
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Tailored specifically to your micro-business niche
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Inbound Audit Request Form Section */}
      <section id="audit-form" className="py-20 bg-slate-900/80 border-t border-slate-800 relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
              Free AI Revenue Audit
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">
              Request Your Custom Revenue Recovery Plan
            </h2>
            <p className="text-slate-400 text-sm mt-2 max-w-xl mx-auto">
              Fill out the form below. P.A.C. will evaluate your current workflow bottleneck and generate a tailored strategy to capture missed revenue.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl">
            {submitSuccess ? (
              <div className="text-center py-8 space-y-6">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-white">Audit Request Received!</h3>
                  <p className="text-slate-300 text-sm mt-2 max-w-md mx-auto">
                    P.A.C. is analyzing your business profile for <span className="text-amber-400 font-semibold">{submitSuccess.opportunity?.authorName || businessName}</span>.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 max-w-md mx-auto text-left text-xs space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Request ID:</span>
                    <span className="font-mono text-amber-400">{submitSuccess.leadId}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                    We will send your custom revenue recovery overview directly to <span className="text-white font-medium">{email || phone || "your contact handle"}</span>.
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSubmitSuccess(null);
                    setBusinessName("");
                    setContactName("");
                    setEmail("");
                    setPhone("");
                    setPrimaryBottleneck("");
                    setNotes("");
                  }}
                  className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
                >
                  Submit Another Request
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitAudit} className="space-y-6">
                {submitError && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Business Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Heating & Cooling"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Your Name / Owner
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mike Richardson"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. mike@apexheating.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Phone Number or Telegram Handle
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. (555) 234-5678 or @mikeapex"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Industry Sector
                    </label>
                    <select
                      value={formIndustry}
                      onChange={(e) => setFormIndustry(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="HVAC & Home Services">HVAC, Plumbing & Electrical</option>
                      <option value="Real Estate & Property">Real Estate & Property</option>
                      <option value="Roofing & Construction">Roofing & Construction</option>
                      <option value="Boutique Agency & Services">Boutique Agency & Consulting</option>
                      <option value="Specialty Health & Dental">Specialty Health & Dental</option>
                      <option value="Other Micro-Business">Other Micro-Business</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Average Ticket / Deal Value
                    </label>
                    <select
                      value={monthlyDealVal}
                      onChange={(e) => setMonthlyDealVal(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="$500 - $1,000">$500 - $1,000</option>
                      <option value="$1,000 - $3,000">$1,000 - $3,000</option>
                      <option value="$3,000 - $7,000">$3,000 - $7,000</option>
                      <option value="$7,000+">$7,000+</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    What problems or challenges is your business facing right now? <span className="text-rose-400">*</span>
                  </label>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Tell us what's slowing you down or where you're losing sales. We'll figure out the best AI fix to get that money back in your pocket!
                  </p>
                  <textarea
                    rows={3}
                    required
                    placeholder="e.g. We miss calls while working on jobs, or we spend way too much time doing repetitive computer tasks by hand."
                    value={primaryBottleneck}
                    onChange={(e) => setPrimaryBottleneck(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Additional Notes or Current Tools Used (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Currently using Google Calendar and QuickBooks"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>P.A.C. is Analyzing Your Request...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 fill-slate-950" />
                      <span>Send to P.A.C. for Instant AI Audit</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-center text-slate-500">
                  🔒 Your information is 100% confidential. No spam, ever.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-slate-950 border-t border-slate-800 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            &copy; {new Date().getFullYear()} MissedRevenue.org — Opportunity Engine & AI Lead Recapture.
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={isUnlocked ? onSwitchToDashboard : onOpenFounderLogin}
              className="text-slate-400 hover:text-amber-400 transition-colors flex items-center gap-1"
            >
              {isUnlocked ? (
                <>
                  <Unlock className="w-3 h-3 text-amber-400" />
                  <span>Dashboard</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>Log In</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
