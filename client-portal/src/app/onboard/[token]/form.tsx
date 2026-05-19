"use client";

import { useState } from "react";

interface OnboardFormProps {
  token: string;
  prospectId: string;
  initial: Record<string, string>;
  status: string;
}

const BUDGET_OPTIONS = [
  { value: "lt_500", label: "Under $500/mo" },
  { value: "500_1k", label: "$500 – $1,000/mo" },
  { value: "1k_2_5k", label: "$1,000 – $2,500/mo" },
  { value: "gt_2_5k", label: "$2,500+/mo" },
  { value: "unsure", label: "Not sure yet" },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "slack", label: "Slack" },
  { value: "email_whatsapp", label: "Email + WhatsApp" },
  { value: "email_slack", label: "Email + Slack" },
];

const CADENCE_OPTIONS = [
  { value: "continuous", label: "Continuous (reacts to events)" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "on_demand", label: "On-demand only" },
];

const AUTONOMY_OPTIONS = [
  { value: "supervised", label: "Supervised — asks me before doing anything important" },
  { value: "autonomous", label: "Autonomous — acts on its own, reports after" },
  { value: "hybrid", label: "Hybrid — autonomous on small stuff, supervised on big stuff" },
];

export function OnboardForm({ token, prospectId, initial, status }: OnboardFormProps) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(
    status === "discovery_complete" || status === "presentation_sent" || status === "revising"
  );
  const [error, setError] = useState<string | null>(null);

  function set(k: string, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboard/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const body = await res.json().catch(() => ({ error: "Submit failed" }));
      if (!res.ok) throw new Error(body.error ?? "Submit failed");
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-lg font-semibold text-emerald-900 mb-1">Got it — I&apos;m on it.</h2>
        <p className="text-sm text-emerald-800 leading-relaxed">
          I&apos;ll review what you sent and put together a presentation of the agent we&apos;d build for you.
          You&apos;ll get an email from me at <strong>atlas@ambitt.agency</strong> within a day.
          When it lands, you can approve the scope or ask for changes — pricing comes after.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-10">
      <Section title="About you">
        <Field label="Your name">
          <Input value={values.contactName ?? ""} onChange={(v) => set("contactName", v)} placeholder="Full name" />
        </Field>
        <Field label="Email" hint="We'll send the presentation here.">
          <Input value={values.email ?? ""} onChange={(v) => set("email", v)} type="email" disabled />
        </Field>
        <Field label="Your role at the company">
          <Input value={values.role ?? ""} onChange={(v) => set("role", v)} placeholder="Founder / Head of Sales / Operator…" />
        </Field>
        <Field label="Business name">
          <Input value={values.businessName ?? ""} onChange={(v) => set("businessName", v)} placeholder="Company / org name" />
        </Field>
        <Field label="Website">
          <Input value={values.website ?? ""} onChange={(v) => set("website", v)} placeholder="https://…" />
        </Field>
        <Field label="What does your business actually do?" hint="One paragraph. Industry + what you sell + who buys.">
          <Textarea value={values.industry ?? ""} onChange={(v) => set("industry", v)} rows={3} />
        </Field>
        <Field label="What should the agent call you?" hint="Just your first name is usually right.">
          <Input value={values.preferredName ?? ""} onChange={(v) => set("preferredName", v)} placeholder="e.g. your first name" />
        </Field>
      </Section>

      <Section title="The agent's job">
        <Field label="In one sentence — what should this agent do for you?">
          <Input value={values.agentPitch ?? ""} onChange={(v) => set("agentPitch", v)} placeholder="e.g. Find new commercial real estate deals on LoopNet and email the owners a personalized pitch." />
        </Field>
        <Field label="Today vs with the agent" hint="What do you (or someone on your team) do today, and what changes when this agent is in place?">
          <Textarea value={values.todayVsAgent ?? ""} onChange={(v) => set("todayVsAgent", v)} rows={5} />
        </Field>
        <Field label="What does success look like 3 months from now?" hint="Concrete numbers if you have them. 'X meetings booked', 'Y new deals identified', '$Z saved in hours.'">
          <Textarea value={values.successCriteria ?? ""} onChange={(v) => set("successCriteria", v)} rows={4} />
        </Field>
        <Field label="How often should it work?">
          <Select value={values.cadence ?? ""} onChange={(v) => set("cadence", v)} options={CADENCE_OPTIONS} />
        </Field>
        <Field label="Rough volume" hint="e.g. '10–20 outreach emails per day' or '500 listings reviewed per week'. Best guess is fine.">
          <Input value={values.volume ?? ""} onChange={(v) => set("volume", v)} />
        </Field>
      </Section>

      <Section title="How it works">
        <Field label="How should the agent reach you?">
          <Select value={values.channel ?? ""} onChange={(v) => set("channel", v)} options={CHANNEL_OPTIONS} />
        </Field>
        <Field label="How much rope should it have?">
          <Select value={values.autonomy ?? ""} onChange={(v) => set("autonomy", v)} options={AUTONOMY_OPTIONS} />
        </Field>
        <Field label="Brand voice / tone" hint="Paste 2–3 samples of how you sound (an email you sent, a LinkedIn post, an internal memo). The agent will mirror this voice when it writes for you.">
          <Textarea value={values.brandVoice ?? ""} onChange={(v) => set("brandVoice", v)} rows={5} />
        </Field>
      </Section>

      <Section title="Constraints">
        <Field label="Budget range">
          <Select value={values.budget ?? ""} onChange={(v) => set("budget", v)} options={BUDGET_OPTIONS} />
        </Field>
        <Field label="What should the agent never do?" hint="Compliance limits, words to avoid, types of people not to message, scope limits. Anything that should be a hard 'no'.">
          <Textarea value={values.redLines ?? ""} onChange={(v) => set("redLines", v)} rows={4} />
        </Field>
      </Section>

      <Section title="Tools">
        <Field label="What tools / systems will the agent need access to?" hint="List anything — CRMs, ad platforms, internal sites, spreadsheets. We'll figure out OAuth vs login during the build.">
          <Textarea value={values.tools ?? ""} onChange={(v) => set("tools", v)} rows={4} placeholder="e.g. HubSpot, Gmail, LoopNet, our internal admin at admin.acme.com" />
        </Field>
      </Section>

      <Section title="Standard operating procedures">
        <Field label="Paste any SOPs, playbooks, or docs that describe how this work is done today." hint="Cookbook-style is best. The more specific, the better the agent will mirror your process. (File upload coming soon — paste for now.)">
          <Textarea value={values.sops ?? ""} onChange={(v) => set("sops", v)} rows={10} />
        </Field>
      </Section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-3 bg-[#00b3b3] text-white text-sm font-medium rounded-lg hover:bg-[#099] transition-colors disabled:opacity-50"
        >
          {submitting ? "Sending to Atlas…" : "Send to Atlas"}
        </button>
        <span className="text-xs text-zinc-500">
          Atlas drafts a presentation and emails it within ~24h.
        </span>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-4 border-b border-zinc-200 pb-2">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-800 mb-1">{label}</label>
      {hint && <p className="text-xs text-zinc-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function Input({
  value, onChange, placeholder, type = "text", disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-md bg-white focus:outline-none focus:border-[#00b3b3] focus:ring-2 focus:ring-[#00b3b3]/20 disabled:bg-zinc-100 disabled:text-zinc-500"
    />
  );
}

function Textarea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-md bg-white focus:outline-none focus:border-[#00b3b3] focus:ring-2 focus:ring-[#00b3b3]/20 resize-y"
    />
  );
}

function Select({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-md bg-white focus:outline-none focus:border-[#00b3b3] focus:ring-2 focus:ring-[#00b3b3]/20"
    >
      <option value="">— Select —</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
