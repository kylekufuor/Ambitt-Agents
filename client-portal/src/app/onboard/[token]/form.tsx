"use client";

import { useState } from "react";
import "./form.css";

// Brand mark — kept inline as JSX so the agent silhouette + visor render in
// every browser regardless of CDN reachability. Sized variants reuse the same
// viewBox so we only have one source of truth for the geometry.
function AmbittMark({ width = 44, height = 22 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 86 42" width={width} height={height} xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(43, 22)">
        <g transform="translate(-28, 0)">
          <rect x={-9} y={-2} width={18} height={18} rx={5} fill="#171717" />
          <circle cx={0} cy={-11} r={6.5} fill="#171717" />
          <rect x={-4} y={-12.25} width={8} height={2.5} rx={1.25} fill="#00b3b3" />
        </g>
        <g>
          <rect x={-9} y={-2} width={18} height={18} rx={5} fill="#171717" />
          <circle cx={0} cy={-11} r={6.5} fill="#171717" />
          <rect x={-4} y={-12.25} width={8} height={2.5} rx={1.25} fill="#00b3b3" />
        </g>
        <g transform="translate(28, 0)">
          <rect x={-9} y={-2} width={18} height={18} rx={5} fill="#171717" />
          <circle cx={0} cy={-11} r={6.5} fill="#171717" />
          <rect x={-4} y={-12.25} width={8} height={2.5} rx={1.25} fill="#00b3b3" />
        </g>
      </g>
    </svg>
  );
}

function AtlasSingle({ width = 22, height = 32 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 28 40" width={width} height={height} xmlns="http://www.w3.org/2000/svg">
      <rect x={5} y={19} width={18} height={18} rx={5} fill="#ffffff" />
      <circle cx={14} cy={10} r={6.5} fill="#ffffff" />
      <rect x={9.5} y={8.75} width={9} height={2.5} rx={1.25} fill="#00d4d4" />
    </svg>
  );
}

interface OnboardFormProps {
  token: string;
  prospectId: string;
  initial: Record<string, string>;
  status: string;
}

const CADENCE_OPTIONS = ["Daily", "Multiple per day", "Weekly", "On demand", "Continuously"];
const CHANNEL_OPTIONS = ["Email", "Slack", "SMS / WhatsApp", "In-app"];
const AUTONOMY_OPTIONS = [
  { key: "Supervised", title: "Supervised", desc: "Asks me before doing anything important. Drafts go in a queue for approval." },
  { key: "Semi-autonomous", title: "Semi-autonomous", desc: "Informs me but doesn't ask. I see what it did each day, but it doesn't wait on me." },
  { key: "Autonomous", title: "Autonomous", desc: "Runs on its own. Escalates only on edge cases or hard exceptions." },
];
const BUDGET_OPTIONS = ["$500 – $1k", "$1k – $2.5k", "$2.5k – $5k", "$5k – $10k", "$10k+", "Not sure yet"];
const TOOL_SUGGESTIONS = ["Gmail", "Slack", "Notion", "HubSpot", "Google Sheets", "Airtable", "Zendesk"];

const STEP_LABELS = ["WELCOME", "STEP 1 OF 7", "STEP 2 OF 7", "STEP 3 OF 7", "STEP 4 OF 7", "STEP 5 OF 7", "STEP 6 OF 7", "STEP 7 OF 7", "COMPLETE"];
const STEP_PERCENT = [0, 14, 28, 43, 57, 72, 86, 100, 100];

export function OnboardForm({ token, prospectId, initial, status }: OnboardFormProps) {
  const [slide, setSlide] = useState<number>(
    status === "discovery_complete" || status === "presentation_sent" || status === "revising" ? 8 : 0
  );
  const [values, setValues] = useState<Record<string, string>>({
    cadence: "Daily",
    channel: "Email",
    autonomy: "Supervised",
    budget: "$500 – $1k",
    ...initial,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: string, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function next() {
    setSlide((i) => Math.min(8, i + 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function back() {
    setSlide((i) => Math.max(0, i - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function jumpTo(target: number) {
    setSlide(target);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
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
      setSlide(8);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const headerClass = slide === 0 ? "fa-header welcome" : slide === 8 ? "fa-header sent" : "fa-header";

  return (
    <div className="fa-onboard">
      <div className="fa-progress">
        <div className="fa-progress-fill" style={{ width: `${STEP_PERCENT[slide]}%` }} />
      </div>

      <div className={headerClass}>
        <div className="fa-brand">
          <AmbittMark />
          AMBITT AGENTS
        </div>
        <div className="fa-step">{STEP_LABELS[slide]}</div>
      </div>

      <div className="fa-stage">
        {slide === 0 && <WelcomeSlide onBegin={next} />}
        {slide === 1 && <AboutYouSlide values={values} set={set} onNext={next} onBack={back} />}
        {slide === 2 && <OneSentenceSlide values={values} set={set} onNext={next} onBack={back} />}
        {slide === 3 && <JobDeeperSlide values={values} set={set} onNext={next} onBack={back} />}
        {slide === 4 && <HowItWorksSlide values={values} set={set} onNext={next} onBack={back} />}
        {slide === 5 && <LimitsSlide values={values} set={set} onNext={next} onBack={back} />}
        {slide === 6 && <ToolsSlide values={values} set={set} onNext={next} onBack={back} />}
        {slide === 7 && (
          <ReviewSlide
            values={values}
            email={initial.email ?? ""}
            onEdit={jumpTo}
            onBack={back}
            onSend={submit}
            submitting={submitting}
            error={error}
          />
        )}
        {slide === 8 && <SentSlide email={initial.email ?? ""} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide 0 — WELCOME
// ---------------------------------------------------------------------------

function WelcomeSlide({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="fa-slide active">
      <div className="fa-hero">
        <div className="fa-hero-pill"><span className="fa-hero-pill-dot" />Build your agent</div>
        <div className="fa-agent-frame"><AtlasSingle width={50} height={72} /></div>
        <div className="fa-h-title">Let&apos;s build<br />your agent.</div>
        <p className="fa-hero-body">
          Hi — I&apos;m <strong>Atlas</strong>, Ambitt&apos;s onboarding agent. The more you tell me here, the sharper the proposal I&apos;ll put together.
        </p>
        <p className="fa-hero-body">
          When you finish, I&apos;ll review your answers and email you a presentation of the agent we&apos;d build — usually within a day.
        </p>

        <div className="fa-preview">
          <span className="fa-preview-label">You&apos;ll cover</span>
          <span className="fa-preview-step">About you</span><span className="fa-preview-arrow">→</span>
          <span className="fa-preview-step">The job</span><span className="fa-preview-arrow">→</span>
          <span className="fa-preview-step">How it works</span><span className="fa-preview-arrow">→</span>
          <span className="fa-preview-step">Limits</span><span className="fa-preview-arrow">→</span>
          <span className="fa-preview-step">Tools</span><span className="fa-preview-arrow">→</span>
          <span className="fa-preview-step">Review</span>
        </div>

        <div className="fa-begin-wrap">
          <button type="button" className="fa-begin" onClick={onBegin}>Let&apos;s begin →</button>
        </div>
        <div className="fa-meta">5–10 minutes<span className="dot">·</span>Progress saved automatically</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chapter shell — dark sidebar + content area shared across slides 1-6
// ---------------------------------------------------------------------------

interface ChapterShellProps {
  num: string;
  ofTotal?: string;
  name: React.ReactNode;
  quote: string;
  contentTag: string;
  title: React.ReactNode;
  helper: string;
  anchor?: boolean;
  children: React.ReactNode;
  onBack: () => void;
  onNext: () => void;
}

function ChapterShell({ num, ofTotal = "/ 07", name, quote, contentTag, title, helper, anchor, children, onBack, onNext }: ChapterShellProps) {
  return (
    <div className="fa-slide active">
      <div className="fa-cols">
        <div className="fa-side-dark">
          <div className="fa-side-atlas-frame"><AtlasSingle /></div>
          <div className="fa-side-step-label">CHAPTER</div>
          <div className="fa-side-chapter-d">
            <div className="fa-side-num-d">{num}</div>
            <div className="fa-side-of-d">{ofTotal}</div>
          </div>
          <div className="fa-side-name-d">{name}</div>
          <div className="fa-side-divider" />
          <div className="fa-side-quote">&ldquo;{quote}&rdquo;</div>
          <div className="fa-side-attribution">— Atlas</div>
        </div>

        <div className="fa-content">
          <div className="fa-content-tag">{contentTag}</div>
          <div className={`fa-q-title${anchor ? " anchor" : ""}`}>{title}</div>
          <p className={`fa-q-helper${anchor ? " anchor" : ""}`}>{helper}</p>

          {children}

          <div className="fa-nav">
            <button type="button" className="fa-back" onClick={onBack}>← Back</button>
            <div>
              <button type="button" className="fa-continue" onClick={onNext}>Continue →</button>
              <div className="fa-microcopy">
                Press <kbd>Enter ↵</kbd> to continue
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable bits
// ---------------------------------------------------------------------------

function Field({ label, helper, children }: { label?: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="fa-field">
      {label && <label className="fa-field-label">{label}</label>}
      {helper && <div className="fa-field-helper">{helper}</div>}
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="fa-input" {...props} />;
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { anchor?: boolean }) {
  const { anchor, ...rest } = props;
  return <textarea className={`fa-textarea${anchor ? " anchor" : ""}`} {...rest} />;
}

function Pills({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="fa-pills">
      {options.map((opt) => (
        <button
          type="button"
          key={opt}
          className={`fa-pill${value === opt ? " active" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function Cards({ options, value, onChange }: { options: typeof AUTONOMY_OPTIONS; value: string; onChange: (v: string) => void }) {
  return (
    <div className="fa-cards">
      {options.map((opt) => (
        <button
          type="button"
          key={opt.key}
          className={`fa-card-opt${value === opt.key ? " active" : ""}`}
          onClick={() => onChange(opt.key)}
        >
          <div className="fa-card-title">{opt.title}</div>
          <div className="fa-card-desc">{opt.desc}</div>
        </button>
      ))}
    </div>
  );
}

function SuggestionChips({ items, onPick }: { items: string[]; onPick: (s: string) => void }) {
  return (
    <div className="fa-suggestions">
      <span className="fa-tag-hint">Add:</span>
      {items.map((it) => (
        <button type="button" key={it} className="fa-suggestion" onClick={() => onPick(it)}>{it}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide 1 — ABOUT YOU
// ---------------------------------------------------------------------------

function AboutYouSlide({ values, set, onBack, onNext }: { values: Record<string, string>; set: (k: string, v: string) => void; onBack: () => void; onNext: () => void }) {
  return (
    <ChapterShell
      num="01"
      name={<>About <span className="accent">you</span></>}
      quote="Just the basics — so the proposal lands with the right person and gets built for the right business."
      contentTag="CONTACT & BUSINESS"
      title="Tell me about you and your business."
      helper="Quick facts so the proposal is addressed to the right person."
      onBack={onBack}
      onNext={onNext}
    >
      <Field label="Your name">
        <Input value={values.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} placeholder="Kyle Kufuor" />
      </Field>
      <Field label="Email" helper="I'll send the proposal here.">
        <Input type="email" value={values.email ?? ""} disabled placeholder="you@company.com" />
      </Field>
      <Field label="Your role at the company">
        <Input value={values.role ?? ""} onChange={(e) => set("role", e.target.value)} placeholder="Founder, CMO, Head of Sales…" />
      </Field>
      <Field label="Business name">
        <Input value={values.businessName ?? ""} onChange={(e) => set("businessName", e.target.value)} placeholder="Ambitt Media" />
      </Field>
      <Field label="Website">
        <Input type="url" value={values.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://yourcompany.com" />
      </Field>
      <Field label="What does your business actually do?" helper="One paragraph. Industry + what you sell + who buys.">
        <Textarea value={values.industry ?? ""} onChange={(e) => set("industry", e.target.value)} placeholder="We're a Dallas-based agency that builds custom websites and digital marketing for small businesses…" />
      </Field>
      <Field label="What should the agent call you?">
        <Input value={values.preferredName ?? ""} onChange={(e) => set("preferredName", e.target.value)} placeholder="Kyle" />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 2 — THE ONE SENTENCE (anchor)
// ---------------------------------------------------------------------------

function OneSentenceSlide({ values, set, onBack, onNext }: { values: Record<string, string>; set: (k: string, v: string) => void; onBack: () => void; onNext: () => void }) {
  return (
    <ChapterShell
      num="02"
      name={<>The one <span className="accent">sentence</span></>}
      quote="The most important question. Take a beat with it — I'll work with whatever you write."
      contentTag="THE AGENT'S JOB"
      title="In one sentence — what should this agent do for you?"
      helper="Don't overthink it. We'll refine together if anything's unclear."
      anchor
      onBack={onBack}
      onNext={onNext}
    >
      <Field>
        <Textarea anchor value={values.agentPitch ?? ""} onChange={(e) => set("agentPitch", e.target.value)} placeholder="e.g., Find small businesses with Google reviews but no website and send them a personalised cold email every morning." />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 3 — THE JOB, DEEPER
// ---------------------------------------------------------------------------

function JobDeeperSlide({ values, set, onBack, onNext }: { values: Record<string, string>; set: (k: string, v: string) => void; onBack: () => void; onNext: () => void }) {
  return (
    <ChapterShell
      num="03"
      name={<>The <span className="accent">job</span>,<br />deeper</>}
      quote="What changes when the agent shows up — and what 'good' looks like three months out."
      contentTag="SUCCESS & CADENCE"
      title="Let's go deeper on the job."
      helper="What changes when the agent is in place, what success looks like, and how often it should run."
      onBack={onBack}
      onNext={onNext}
    >
      <Field label="Today vs with the agent" helper="What do you (or your team) do today, and what changes when the agent's in place?">
        <Textarea value={values.todayVsAgent ?? ""} onChange={(e) => set("todayVsAgent", e.target.value)} placeholder="Right now I spend ~5 hours a week manually searching Google Maps for prospects…" />
      </Field>
      <Field label="What does success look like 3 months from now?" helper={`Concrete if you have them. e.g., "3 new clients per month", "20 hours saved each week".`}>
        <Textarea value={values.successCriteria ?? ""} onChange={(e) => set("successCriteria", e.target.value)} placeholder="3 new clients per month from outbound, ~10 qualified prospects per day." />
      </Field>
      <Field label="How often should it work?">
        <Pills options={CADENCE_OPTIONS} value={values.cadence ?? "Daily"} onChange={(v) => set("cadence", v)} />
      </Field>
      <Field label="Rough volume" helper={`Best guess. e.g., "10–20 emails per day", "500 listings reviewed per week".`}>
        <Input value={values.volume ?? ""} onChange={(e) => set("volume", e.target.value)} placeholder="10 prospects per day" />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 4 — HOW IT WORKS
// ---------------------------------------------------------------------------

function HowItWorksSlide({ values, set, onBack, onNext }: { values: Record<string, string>; set: (k: string, v: string) => void; onBack: () => void; onNext: () => void }) {
  return (
    <ChapterShell
      num="04"
      name={<>How it <span className="accent">works</span></>}
      quote="Where the agent shows up, how much rope it has, and how it should sound when it speaks for you."
      contentTag="CHANNEL · AUTONOMY · VOICE"
      title="How should the agent operate?"
      helper="Where it shows up, how much rope it has, and how it should sound."
      onBack={onBack}
      onNext={onNext}
    >
      <Field label="How should the agent reach you?">
        <Pills options={CHANNEL_OPTIONS} value={values.channel ?? "Email"} onChange={(v) => set("channel", v)} />
      </Field>
      <Field label="How much rope should it have?">
        <Cards options={AUTONOMY_OPTIONS} value={values.autonomy ?? "Supervised"} onChange={(v) => set("autonomy", v)} />
      </Field>
      <Field label="Brand voice / tone" helper="Paste 2–3 samples of how you sound. The agent will mirror this.">
        <Textarea value={values.brandVoice ?? ""} onChange={(e) => set("brandVoice", e.target.value)} placeholder="Paste a couple of samples here…" />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 5 — HARD LIMITS
// ---------------------------------------------------------------------------

function LimitsSlide({ values, set, onBack, onNext }: { values: Record<string, string>; set: (k: string, v: string) => void; onBack: () => void; onNext: () => void }) {
  return (
    <ChapterShell
      num="05"
      name={<>Hard <span className="accent">limits</span></>}
      quote="Budget I can work within, plus anything that should be a hard 'no.'"
      contentTag="BUDGET · GUARDRAILS"
      title="Any hard limits?"
      helper="Budget range, plus anything the agent should never do."
      onBack={onBack}
      onNext={onNext}
    >
      <Field label="Budget range">
        <Pills options={BUDGET_OPTIONS} value={values.budget ?? "$500 – $1k"} onChange={(v) => set("budget", v)} />
        <div className="fa-field-helper" style={{ marginTop: 8 }}>Per month. We&apos;ll firm up pricing after Atlas drafts the scope.</div>
      </Field>
      <Field label="What should the agent never do?" helper="Compliance limits, words to avoid, people not to message, scope boundaries.">
        <Textarea value={values.redLines ?? ""} onChange={(e) => set("redLines", e.target.value)} placeholder="Never quote a price. Never make compensation claims. Never message anyone we've already pitched in the last 90 days." />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 6 — TOOLS & PROCEDURES
// ---------------------------------------------------------------------------

function ToolsSlide({ values, set, onBack, onNext }: { values: Record<string, string>; set: (k: string, v: string) => void; onBack: () => void; onNext: () => void }) {
  function appendTool(t: string) {
    const cur = (values.tools ?? "").trim();
    set("tools", cur ? `${cur}, ${t}` : t);
  }
  return (
    <ChapterShell
      num="06"
      name={<>Tools &amp;<br /><span className="accent">procedures</span></>}
      quote="What tools the agent needs access to — and any process docs that describe how this work is done today."
      contentTag="ACCESS & PLAYBOOKS"
      title="Last thing — what should it connect to?"
      helper="Any tools, systems, or process docs the agent should know about."
      onBack={onBack}
      onNext={onNext}
    >
      <Field label="What tools / systems will the agent need access to?" helper="List anything — CRMs, ad platforms, internal sites, spreadsheets.">
        <Textarea value={values.tools ?? ""} onChange={(e) => set("tools", e.target.value)} placeholder="Gmail, Google Maps, Notion, HubSpot…" />
        <SuggestionChips items={TOOL_SUGGESTIONS} onPick={appendTool} />
      </Field>
      <Field label="Paste any SOPs, playbooks, or docs" helper="Cookbook-style is best. Optional if you don't have any.">
        <Textarea value={values.sops ?? ""} onChange={(e) => set("sops", e.target.value)} placeholder="Paste any process docs here, or leave blank…" />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 7 — REVIEW
// ---------------------------------------------------------------------------

function ReviewSlide({
  values, email, onEdit, onBack, onSend, submitting, error,
}: {
  values: Record<string, string>;
  email: string;
  onEdit: (slideIndex: number) => void;
  onBack: () => void;
  onSend: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const blocks: Array<{ section: string; editSlide: number; rows: Array<{ key: string; value: string; muted?: boolean }> }> = [
    {
      section: "01 · About you",
      editSlide: 1,
      rows: [
        { key: "Name", value: values.contactName || "—", muted: !values.contactName },
        { key: "Email", value: email },
        { key: "Role", value: values.role || "—", muted: !values.role },
        { key: "Business", value: [values.businessName, values.website].filter(Boolean).join(" · ") || "—", muted: !values.businessName && !values.website },
        { key: "What you do", value: values.industry || "—", muted: !values.industry },
        { key: "Call you", value: values.preferredName || "—", muted: !values.preferredName },
      ],
    },
    {
      section: "02 · The agent's job",
      editSlide: 2,
      rows: [
        { key: "One sentence", value: values.agentPitch || "—", muted: !values.agentPitch },
        { key: "Today vs agent", value: values.todayVsAgent || "—", muted: !values.todayVsAgent },
        { key: "3-month success", value: values.successCriteria || "—", muted: !values.successCriteria },
        { key: "Cadence", value: [values.cadence, values.volume].filter(Boolean).join(" · ") || "—", muted: !values.cadence && !values.volume },
      ],
    },
    {
      section: "04 · How it works",
      editSlide: 4,
      rows: [
        { key: "Reach you", value: values.channel || "—", muted: !values.channel },
        { key: "Autonomy", value: values.autonomy || "—", muted: !values.autonomy },
        { key: "Voice", value: values.brandVoice || "Not provided", muted: !values.brandVoice },
      ],
    },
    {
      section: "05 · Constraints",
      editSlide: 5,
      rows: [
        { key: "Budget", value: values.budget || "—", muted: !values.budget },
        { key: "Never do", value: values.redLines || "Nothing specified", muted: !values.redLines },
      ],
    },
    {
      section: "06 · Tools & procedures",
      editSlide: 6,
      rows: [
        { key: "Tools", value: values.tools || "—", muted: !values.tools },
        { key: "SOPs", value: values.sops || "None provided", muted: !values.sops },
      ],
    },
  ];

  return (
    <div className="fa-slide active">
      <div className="fa-review">
        <div className="fa-content-tag" style={{ textAlign: "center" }}>07 / 07 · FINAL STEP</div>
        <div className="fa-h-title" style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>Here&apos;s what you&apos;ve told me.</div>
        <p className="fa-hero-body" style={{ textAlign: "center", marginBottom: 36 }}>
          Take one last look. Edit any section — I&apos;ll have your proposal in your inbox within ~24h.
        </p>

        {blocks.map((block) => (
          <div className="fa-review-block" key={block.section}>
            <div className="fa-review-head">
              <div className="fa-review-section-name">{block.section}</div>
              <button type="button" className="fa-review-edit" onClick={() => onEdit(block.editSlide)}>Edit</button>
            </div>
            {block.rows.map((row) => (
              <div className="fa-review-row" key={row.key}>
                <div className="fa-review-key">{row.key}</div>
                <div className={`fa-review-value${row.muted ? " muted" : ""}`}>{row.value}</div>
              </div>
            ))}
          </div>
        ))}

        {error && <div className="fa-error">{error}</div>}

        <div className="fa-nav">
          <button type="button" className="fa-back" onClick={onBack} disabled={submitting}>← Back</button>
          <div>
            <button type="button" className="fa-continue fa-send" onClick={onSend} disabled={submitting}>
              {submitting ? "Sending…" : "Send to Atlas →"}
            </button>
            <div className="fa-microcopy">Proposal in your inbox within ~24h</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide 8 — SENT
// ---------------------------------------------------------------------------

function SentSlide({ email }: { email: string }) {
  return (
    <div className="fa-slide active">
      <div className="fa-hero">
        <div className="fa-agent-frame success"><AtlasSingle width={50} height={72} /></div>
        <div className="fa-hero-pill"><span className="fa-hero-pill-dot" />Brief received</div>
        <div className="fa-h-title">Your brief is in.</div>
        <p className="fa-hero-body">
          Atlas is reviewing your answers right now. I&apos;ll have your proposal in your inbox within <strong>~24 hours</strong> — usually much sooner.
        </p>
        {email && (
          <p className="fa-hero-body">
            I sent a copy to <strong>{email}</strong> for your records.
          </p>
        )}

        <div className="fa-timeline">
          <div className="fa-timeline-h">What happens next</div>
          <div className="fa-tl-row done">
            <div className="fa-tl-num">1</div>
            <div className="fa-tl-body">
              <div className="fa-tl-title">Brief received</div>
              <div className="fa-tl-sub">Just now</div>
            </div>
          </div>
          <div className="fa-tl-row">
            <div className="fa-tl-num">2</div>
            <div className="fa-tl-body">
              <div className="fa-tl-title">Atlas drafts your proposal</div>
              <div className="fa-tl-sub">Within 24 hours</div>
            </div>
          </div>
          <div className="fa-tl-row">
            <div className="fa-tl-num">3</div>
            <div className="fa-tl-body">
              <div className="fa-tl-title">Our team reviews scope and pricing</div>
              <div className="fa-tl-sub">Same business day</div>
            </div>
          </div>
          <div className="fa-tl-row">
            <div className="fa-tl-num">4</div>
            <div className="fa-tl-body">
              <div className="fa-tl-title">Proposal lands in your inbox</div>
              <div className="fa-tl-sub">Approve, edit, or talk it through</div>
            </div>
          </div>
        </div>

        <div className="fa-meta">
          <a href="mailto:team@ambitt.agency" style={{ color: "#00b3b3", fontWeight: 500 }}>Talk to a human →</a>
        </div>
      </div>
    </div>
  );
}
