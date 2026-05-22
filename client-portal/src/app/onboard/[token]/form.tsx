"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const CADENCE_OPTIONS = ["On a schedule", "When triggered"];
const CHANNEL_OPTIONS = ["Email", "Slack", "WhatsApp"];
const AUTONOMY_OPTIONS = [
  { key: "Supervised", title: "Supervised", desc: "Asks me before doing anything important. Drafts go in a queue for approval." },
  { key: "Semi-autonomous", title: "Semi-autonomous", desc: "Informs me but doesn't ask. I see what it did each day, but it doesn't wait on me." },
  { key: "Autonomous", title: "Autonomous", desc: "Runs on its own. Escalates only on edge cases or hard exceptions." },
];
const BUDGET_OPTIONS = ["$500 – $1k", "$1k – $2.5k", "$2.5k – $5k", "$5k – $10k", "$10k+", "Not sure yet"];

const AGENT_ROLE_OPTIONS = [
  "Lead generation / outreach",
  "Sales follow-up",
  "Customer support",
  "Customer success / onboarding",
  "Content / copywriting",
  "Social media / marketing",
  "Research / intelligence",
  "Operations / admin",
  "Data entry / cleanup",
  "Scheduling / calendar",
  "Recruiting / HR",
  "Personal assistant",
];
const AUDIENCE_OPTIONS = [
  "Small businesses (1–50)",
  "Mid-market (50–500)",
  "Enterprises (500+)",
  "Consumers (B2C)",
  "Startups / early-stage",
  "Local businesses",
  "Agencies / freelancers",
  "Creators / influencers",
  "Non-profits",
];
const TODAY_HANDLER_OPTIONS = ["I do it myself", "Someone on my team", "We outsource it", "It doesn't get done", "We don't do this yet"];
const SUCCESS_OUTCOMES = [
  "More qualified leads", "Faster response time", "Reduced manual work", "Higher conversion rate",
  "Better data quality", "Lower operational cost", "More consistent quality",
];
const TONE_OPTIONS = [
  "Professional", "Friendly", "Direct", "Warm", "Playful", "Technical", "Concise", "Authoritative", "Conversational",
];
const NEVER_DO_OPTIONS = [
  "Quote prices or discuss compensation", "Make promises about outcomes", "Use AI / automation buzzwords",
  "Re-contact anyone messaged in 90 days", "Mention competitors by name", "Send outside business hours",
  "Discuss legal or compliance matters", "Reference clients without permission",
];
interface UploadedFile {
  id: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
  extractedText: string;
}

interface ToolSelection {
  source: "composio" | "custom";
  slug?: string;
  name: string;
}

interface ComposioApp {
  key: string;
  name: string;
  categories: string[];
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as unknown as string[];
  return String(raw).split(/,\s*/).filter(Boolean);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const STEP_LABELS = ["WELCOME", "STEP 1 OF 7", "STEP 2 OF 7", "STEP 3 OF 7", "STEP 4 OF 7", "STEP 5 OF 7", "STEP 6 OF 7", "STEP 7 OF 7", "COMPLETE"];
const STEP_PERCENT = [0, 14, 28, 43, 57, 72, 86, 100, 100];

export function OnboardForm({ token, prospectId, initial, status }: OnboardFormProps) {
  const [slide, setSlide] = useState<number>(() => {
    // Status determines landing slide:
    //   discovery → Welcome (slide 0) by default. If contactName is already
    //     set, skip Welcome and jump straight to Chapter 01 (slide 1) — the
    //     prospect identified themselves on the public /onboard landing or
    //     was pre-seeded by Kyle from the dashboard, so the Welcome+ToC
    //     orientation is redundant.
    //   discovery_complete → Sent (slide 8) — just submitted, proposal pending
    //   presentation_sent / revising → Review (slide 7) — returning to edit;
    //     they can see their answers and jump to any chapter to change them.
    //   accepted / quote_* → Sent (slide 8) — deal is downstream
    if (status === "discovery_complete") return 8;
    if (status === "presentation_sent" || status === "revising") return 7;
    if (status === "accepted" || status === "quote_pending" || status === "quote_sent") return 8;
    return (initial.contactName ?? "").trim().length > 0 ? 1 : 0;
  });
  const [values, setValues] = useState<Record<string, string>>({
    cadence: "On a schedule",
    channel: "Email",
    autonomy: "Supervised",
    budget: "$500 – $1k",
    todayHandler: "I do it myself",
    ...initial,
  });
  const [multi, setMulti] = useState<Record<string, string[]>>(() => ({
    audienceTags: parseList(initial.audienceTags),
    successOutcomes: parseList(initial.successOutcomes),
    toneTags: parseList(initial.toneTags),
    neverDoTags: parseList(initial.neverDoTags),
  }));
  const [tools, setTools] = useState<ToolSelection[]>(() => {
    // Pre-fill from existing prospect.formData.tools if present (array shape).
    const raw = (initial as unknown as { tools?: unknown }).tools;
    if (Array.isArray(raw)) {
      return (raw as ToolSelection[]).filter((t) => t && typeof t.name === "string");
    }
    return [];
  });
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: string, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function toggleMulti(key: string, value: string) {
    setMulti((prev) => {
      const cur = prev[key] ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...prev, [key]: next };
    });
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/onboard/${token}/upload`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({ error: "Upload failed" }));
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setFiles((prev) => [...prev, body as UploadedFile]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
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
      // Collapse multi-select arrays into the same `values` object as comma-
      // joined strings so the backend continues to receive flat key/values.
      // The `sopFiles` array stays structured — Oracle uses it to append
      // extracted document text to Atlas's intake prompt.
      const merged: Record<string, unknown> = { ...values };
      for (const [k, arr] of Object.entries(multi)) {
        merged[k] = arr.join(", ");
      }
      // tools stays structured — array of {source, slug?, name}. Atlas uses
      // the source field to distinguish Composio integrations (oauth path
      // exists) from custom apps (humans wire up during build).
      merged.tools = tools;
      merged.sopFiles = files.map((f) => ({
        filename: f.filename,
        sizeBytes: f.sizeBytes,
        contentType: f.contentType,
        extractedText: f.extractedText,
      }));
      const res = await fetch(`/api/onboard/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: merged }),
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
        {slide === 1 && <AboutYouSlide values={values} set={set} multi={multi} toggleMulti={toggleMulti} onNext={next} onBack={back} />}
        {slide === 2 && <OneSentenceSlide values={values} set={set} onNext={next} onBack={back} />}
        {slide === 3 && <JobDeeperSlide values={values} set={set} multi={multi} toggleMulti={toggleMulti} onNext={next} onBack={back} />}
        {slide === 4 && <HowItWorksSlide values={values} set={set} multi={multi} toggleMulti={toggleMulti} onNext={next} onBack={back} />}
        {slide === 5 && <LimitsSlide values={values} set={set} multi={multi} toggleMulti={toggleMulti} onNext={next} onBack={back} />}
        {slide === 6 && (
          <ToolsSlide
            values={values}
            set={set}
            tools={tools}
            setTools={setTools}
            files={files}
            onUpload={uploadFile}
            onRemoveFile={removeFile}
            uploading={uploading}
            onNext={next}
            onBack={back}
          />
        )}
        {slide === 7 && (
          <ReviewSlide
            values={values}
            multi={multi}
            tools={tools}
            files={files}
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
          Hey there! I&apos;m <strong>Atlas</strong> from the Ambitt team. The more detail you can share here, the better your custom proposal will be.
        </p>
        <p className="fa-hero-body">
          Once you&apos;re done, I&apos;ll review everything and email over a tailored presentation of what we can build for you — usually within 30 minutes.
        </p>

        <div className="fa-toc">
          <div className="fa-toc-label">The 7-chapter brief</div>
          <div className="fa-toc-list">
            <div className="fa-toc-row">
              <div className="fa-toc-num">01</div>
              <div className="fa-toc-body">
                <div className="fa-toc-name">About you</div>
                <div className="fa-toc-desc">Quick facts so the proposal lands with the right person</div>
              </div>
            </div>
            <div className="fa-toc-row">
              <div className="fa-toc-num">02</div>
              <div className="fa-toc-body">
                <div className="fa-toc-name">The one sentence</div>
                <div className="fa-toc-desc">The agent&apos;s core job, in your own words</div>
              </div>
            </div>
            <div className="fa-toc-row">
              <div className="fa-toc-num">03</div>
              <div className="fa-toc-body">
                <div className="fa-toc-name">The job, deeper</div>
                <div className="fa-toc-desc">Success metrics, cadence, volume</div>
              </div>
            </div>
            <div className="fa-toc-row">
              <div className="fa-toc-num">04</div>
              <div className="fa-toc-body">
                <div className="fa-toc-name">How it works</div>
                <div className="fa-toc-desc">Channel, autonomy, voice</div>
              </div>
            </div>
            <div className="fa-toc-row">
              <div className="fa-toc-num">05</div>
              <div className="fa-toc-body">
                <div className="fa-toc-name">Hard limits</div>
                <div className="fa-toc-desc">Budget and what the agent should never do</div>
              </div>
            </div>
            <div className="fa-toc-row">
              <div className="fa-toc-num">06</div>
              <div className="fa-toc-body">
                <div className="fa-toc-name">Tools</div>
                <div className="fa-toc-desc">What the agent needs access to</div>
              </div>
            </div>
            <div className="fa-toc-row">
              <div className="fa-toc-num">07</div>
              <div className="fa-toc-body">
                <div className="fa-toc-name">Review</div>
                <div className="fa-toc-desc">Final check, then off to Atlas</div>
              </div>
            </div>
          </div>
        </div>

        <div className="fa-begin-wrap">
          <button type="button" className="fa-begin" onClick={onBegin}>
            Let&apos;s begin
            <span className="fa-begin-arrow" aria-hidden="true">→</span>
          </button>
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
            <button type="button" className="fa-continue" onClick={onNext}>Continue →</button>
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

function CheckPills({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="fa-checkpills">
      {options.map((opt) => (
        <button
          type="button"
          key={opt}
          className={`fa-checkpill${selected.includes(opt) ? " active" : ""}`}
          onClick={() => onToggle(opt)}
        >
          <span className="fa-checkpill-box" />
          {opt}
        </button>
      ))}
    </div>
  );
}

function OptionalDetail({ children }: { children: React.ReactNode }) {
  return <div className="fa-optional-detail">{children}</div>;
}

function ToolPicker({ tools, setTools }: { tools: ToolSelection[]; setTools: React.Dispatch<React.SetStateAction<ToolSelection[]>> }) {
  const [catalog, setCatalog] = useState<ComposioApp[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/composio/catalog")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const items = Array.isArray(body.items) ? (body.items as ComposioApp[]) : [];
        setCatalog(items);
      })
      .catch(() => { /* fail silently — custom-add still works */ });
    return () => { cancelled = true; };
  }, []);

  // Close dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selectedKeys = useMemo(() => new Set(tools.map((t) => (t.source === "composio" ? `c:${t.slug}` : `x:${t.name.toLowerCase()}`))), [tools]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = catalog
      .filter((app) => !selectedKeys.has(`c:${app.key}`))
      .filter((app) => app.name.toLowerCase().includes(q) || app.key.toLowerCase().includes(q))
      .slice(0, 8);
    return hits;
  }, [catalog, query, selectedKeys]);

  function addComposio(app: ComposioApp) {
    setTools((prev) => [...prev, { source: "composio", slug: app.key, name: app.name }]);
    setQuery("");
    setOpen(false);
    setHighlight(0);
  }

  function addCustom(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (selectedKeys.has(`x:${trimmed.toLowerCase()}`)) return;
    setTools((prev) => [...prev, { source: "custom", name: trimmed }]);
    setQuery("");
    setOpen(false);
    setHighlight(0);
  }

  function removeTool(index: number) {
    setTools((prev) => prev.filter((_, i) => i !== index));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(matches.length, h + 1));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length > 0 && highlight < matches.length) {
        addComposio(matches[highlight]);
      } else {
        addCustom(query);
      }
    } else if (e.key === "Backspace" && query === "" && tools.length > 0) {
      // remove last chip on backspace from empty input
      setTools((prev) => prev.slice(0, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showCustomHint = query.trim().length > 0 && !matches.some((m) => m.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="fa-tool-picker" ref={wrapRef}>
      <div className="fa-tool-tags">
        {tools.map((t, i) => (
          <span key={`${t.source}:${t.slug ?? t.name}:${i}`} className={`fa-tool-tag${t.source === "custom" ? " custom" : ""}`}>
            <span className="fa-tool-tag-source">{t.source === "composio" ? "OAuth" : "Custom"}</span>
            {t.name}
            <button type="button" className="fa-tool-tag-x" onClick={() => removeTool(i)} aria-label={`Remove ${t.name}`}>×</button>
          </span>
        ))}
      </div>
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={catalog.length === 0 ? "Loading tool catalog…" : "Type a tool name — Gmail, Linear, your custom app…"}
      />
      {open && (matches.length > 0 || showCustomHint) && (
        <div className="fa-tool-dropdown" role="listbox">
          {matches.map((app, i) => (
            <button
              type="button"
              key={app.key}
              className={`fa-tool-item${i === highlight ? " highlight" : ""}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => addComposio(app)}
              role="option"
              aria-selected={i === highlight}
            >
              <span className="fa-tool-item-name">{app.name}</span>
              {app.categories?.[0] && <span className="fa-tool-item-cat">{app.categories[0]}</span>}
            </button>
          ))}
          {showCustomHint && (
            <button
              type="button"
              className={`fa-tool-item${highlight === matches.length ? " highlight" : ""}`}
              onMouseEnter={() => setHighlight(matches.length)}
              onClick={() => addCustom(query)}
            >
              <span className="fa-tool-item-name fa-tool-item-custom">
                Add <strong>&ldquo;{query.trim()}&rdquo;</strong> as a custom tool
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UploadDropzone({
  files, onUpload, onRemove, uploading,
}: {
  files: UploadedFile[];
  onUpload: (file: File) => void;
  onRemove: (id: string) => void;
  uploading: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    for (const f of dropped) onUpload(f);
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    for (const f of picked) onUpload(f);
    e.target.value = "";
  }

  return (
    <div>
      <label
        className={`fa-upload${dragOver ? " dragover" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.md,.txt,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/rtf"
          onChange={handlePick}
        />
        <svg className="fa-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div className="fa-upload-text">{uploading ? "Uploading…" : "Drop SOPs here or click to upload"}</div>
        <div className="fa-upload-sub">PDF, Word, Markdown, or plain text · up to 15 MB each</div>
      </label>
      {files.length > 0 && (
        <div className="fa-file-list">
          {files.map((f) => (
            <div className="fa-file-row" key={f.id}>
              <span className="fa-file-name">{f.filename}</span>
              <span className="fa-file-meta">{formatBytes(f.sizeBytes)}</span>
              <button type="button" className="fa-file-remove" onClick={() => onRemove(f.id)} aria-label={`Remove ${f.filename}`}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide 1 — ABOUT YOU
// ---------------------------------------------------------------------------

function AboutYouSlide({
  values, set, multi, toggleMulti, onBack, onNext,
}: {
  values: Record<string, string>;
  set: (k: string, v: string) => void;
  multi: Record<string, string[]>;
  toggleMulti: (k: string, v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
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
        <Input value={values.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} placeholder="Your full name" />
      </Field>
      <Field label="Email" helper="I'll send the proposal here.">
        <Input type="email" value={values.email ?? ""} disabled placeholder="you@company.com" />
      </Field>
      <Field label="Your role at the company">
        <Input value={values.role ?? ""} onChange={(e) => set("role", e.target.value)} placeholder="Founder, CMO, Head of Sales…" />
      </Field>
      <Field label="Business name">
        <Input value={values.businessName ?? ""} onChange={(e) => set("businessName", e.target.value)} placeholder="Your business name" />
      </Field>
      <Field label="Website">
        <Input type="url" value={values.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://yourcompany.com" />
      </Field>
      <Field label="What does your business actually do?" helper="One paragraph. Industry + what you sell + who buys.">
        <Textarea value={values.industry ?? ""} onChange={(e) => set("industry", e.target.value)} placeholder="We help [audience] do [job] by [solution] — keep it to a paragraph." />
      </Field>
      <Field label="Who is your target audience?" helper="Pick all that apply — Atlas will tune the agent's voice and outputs to fit them.">
        <CheckPills options={AUDIENCE_OPTIONS} selected={multi.audienceTags ?? []} onToggle={(v) => toggleMulti("audienceTags", v)} />
        <OptionalDetail>Anything more specific? (industry, role, size)</OptionalDetail>
        <Textarea value={values.audienceDetail ?? ""} onChange={(e) => set("audienceDetail", e.target.value)} placeholder={`e.g., "DTC e-commerce founders doing $1–10M/yr", "HR directors at 200+ employee SaaS companies"`} />
      </Field>
      <Field label="What should the agent call you?">
        <Input value={values.preferredName ?? ""} onChange={(e) => set("preferredName", e.target.value)} placeholder="First name" />
      </Field>
      <Field label="What should we call your agent?" helper="Pick a name — Atlas, Bob, Iris, anything. Atlas will use it throughout the proposal.">
        <Input value={values.agentName ?? ""} onChange={(e) => set("agentName", e.target.value)} placeholder="e.g., Bob" />
      </Field>
      <Field label="What's their role?" helper="Pick the closest match. If nothing fits, type your own below.">
        <Pills options={AGENT_ROLE_OPTIONS} value={values.agentRole ?? ""} onChange={(v) => set("agentRole", v)} />
        <OptionalDetail>Or describe it yourself:</OptionalDetail>
        <Input value={values.agentRole ?? ""} onChange={(e) => set("agentRole", e.target.value)} placeholder="e.g., outbound SDR for yacht charters" />
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
        <Textarea anchor value={values.agentPitch ?? ""} onChange={(e) => set("agentPitch", e.target.value)} placeholder="e.g., Reply to inbound support tickets within 5 minutes with a draft response for me to approve." />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 3 — THE JOB, DEEPER
// ---------------------------------------------------------------------------

function JobDeeperSlide({
  values, set, multi, toggleMulti, onBack, onNext,
}: {
  values: Record<string, string>;
  set: (k: string, v: string) => void;
  multi: Record<string, string[]>;
  toggleMulti: (k: string, v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
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
      <Field label="Today, who handles this work?">
        <Pills options={TODAY_HANDLER_OPTIONS} value={values.todayHandler ?? "I do it myself"} onChange={(v) => set("todayHandler", v)} />
        <OptionalDetail>Want to add details? (how much time it takes, what&apos;s hard about it)</OptionalDetail>
        <Textarea value={values.todayVsAgent ?? ""} onChange={(e) => set("todayVsAgent", e.target.value)} placeholder="What does the manual process look like today? How much time does it take?" />
      </Field>
      <Field label="What does success look like 3 months from now?" helper="Pick all that apply — Atlas will use these as the proposal's success metrics.">
        <CheckPills options={SUCCESS_OUTCOMES} selected={multi.successOutcomes ?? []} onToggle={(v) => toggleMulti("successOutcomes", v)} />
        <OptionalDetail>Add concrete numbers if you have them:</OptionalDetail>
        <Textarea value={values.successCriteria ?? ""} onChange={(e) => set("successCriteria", e.target.value)} placeholder={`e.g., "3 new clients/month", "20 hours saved each week"`} />
      </Field>
      <Field label="How does it run?" helper="Scheduled = fires at set times (daily morning, weekly Monday, etc.). Triggered = reacts to inbound events (a new email, a form fill, a webhook). Exact timing gets set in your portal after launch.">
        <Pills options={CADENCE_OPTIONS} value={values.cadence ?? "On a schedule"} onChange={(v) => set("cadence", v)} />
      </Field>
      <Field label="Rough volume" helper={`Best guess. e.g., "10–20 emails per day", "500 listings reviewed per week".`}>
        <Input value={values.volume ?? ""} onChange={(e) => set("volume", e.target.value)} placeholder="Best guess on volume" />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 4 — HOW IT WORKS
// ---------------------------------------------------------------------------

function HowItWorksSlide({
  values, set, multi, toggleMulti, onBack, onNext,
}: {
  values: Record<string, string>;
  set: (k: string, v: string) => void;
  multi: Record<string, string[]>;
  toggleMulti: (k: string, v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
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
      <Field label="How should the agent sound when it speaks for you?" helper="Pick 2–3 that fit best.">
        <CheckPills options={TONE_OPTIONS} selected={multi.toneTags ?? []} onToggle={(v) => toggleMulti("toneTags", v)} />
        <OptionalDetail>Or paste 2–3 samples of how you sound — the agent will mirror them:</OptionalDetail>
        <Textarea value={values.brandVoice ?? ""} onChange={(e) => set("brandVoice", e.target.value)} placeholder="An email, LinkedIn post, or internal memo…" />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 5 — HARD LIMITS
// ---------------------------------------------------------------------------

function LimitsSlide({
  values, set, multi, toggleMulti, onBack, onNext,
}: {
  values: Record<string, string>;
  set: (k: string, v: string) => void;
  multi: Record<string, string[]>;
  toggleMulti: (k: string, v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
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
      <Field label="What should the agent never do?" helper="Common no-go&apos;s — pick all that apply.">
        <CheckPills options={NEVER_DO_OPTIONS} selected={multi.neverDoTags ?? []} onToggle={(v) => toggleMulti("neverDoTags", v)} />
        <OptionalDetail>Anything else specific to your business?</OptionalDetail>
        <Textarea value={values.redLines ?? ""} onChange={(e) => set("redLines", e.target.value)} placeholder="Industry-specific rules, scope boundaries, words to avoid…" />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 6 — TOOLS & PROCEDURES
// ---------------------------------------------------------------------------

function ToolsSlide({
  values, set, tools, setTools, files, onUpload, onRemoveFile, uploading, onBack, onNext,
}: {
  values: Record<string, string>;
  set: (k: string, v: string) => void;
  tools: ToolSelection[];
  setTools: React.Dispatch<React.SetStateAction<ToolSelection[]>>;
  files: UploadedFile[];
  onUpload: (f: File) => void;
  onRemoveFile: (id: string) => void;
  uploading: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
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
      <Field
        label="What tools will the agent need access to?"
        helper="Start typing — we'll match against 250+ Composio integrations. Don't see your tool? Type it and press Enter to add it as a custom app."
      >
        <ToolPicker tools={tools} setTools={setTools} />
      </Field>
      <Field
        label="Got any SOPs, playbooks, or docs?"
        helper={`SOPs = "Standard Operating Procedures" — your existing process docs, runbooks, or playbooks. Cookbook-style is best. Optional if you don't have any.`}
      >
        <UploadDropzone files={files} onUpload={onUpload} onRemove={onRemoveFile} uploading={uploading} />
        <OptionalDetail>Paste below or upload — whichever&apos;s easier.</OptionalDetail>
        <Textarea value={values.sops ?? ""} onChange={(e) => set("sops", e.target.value)} placeholder="Paste any process docs here, or leave blank…" />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 7 — REVIEW
// ---------------------------------------------------------------------------

function ReviewSlide({
  values, multi, tools, files, email, onEdit, onBack, onSend, submitting, error,
}: {
  values: Record<string, string>;
  multi: Record<string, string[]>;
  tools: ToolSelection[];
  files: UploadedFile[];
  email: string;
  onEdit: (slideIndex: number) => void;
  onBack: () => void;
  onSend: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const audience = (multi.audienceTags ?? []).join(", ");
  const success = (multi.successOutcomes ?? []).join(", ");
  const tone = (multi.toneTags ?? []).join(", ");
  const neverDo = (multi.neverDoTags ?? []).join(", ");
  const toolList = tools.map((t) => `${t.name}${t.source === "custom" ? " (custom)" : ""}`).join(", ");

  const sopSummary = files.length > 0
    ? `${files.length} file${files.length === 1 ? "" : "s"} uploaded${values.sops ? " · plus pasted notes" : ""}`
    : values.sops
      ? "Pasted notes"
      : "None provided";

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
        { key: "Audience", value: [audience, values.audienceDetail].filter(Boolean).join(" · ") || "—", muted: !audience && !values.audienceDetail },
        { key: "Call you", value: values.preferredName || "—", muted: !values.preferredName },
        { key: "Your agent", value: [values.agentName, values.agentRole].filter(Boolean).join(" · ") || "—", muted: !values.agentName && !values.agentRole },
      ],
    },
    {
      section: "02 · The agent's job",
      editSlide: 2,
      rows: [
        { key: "One sentence", value: values.agentPitch || "—", muted: !values.agentPitch },
      ],
    },
    {
      section: "03 · Success & cadence",
      editSlide: 3,
      rows: [
        { key: "Today", value: [values.todayHandler, values.todayVsAgent].filter(Boolean).join(" · ") || "—", muted: !values.todayHandler && !values.todayVsAgent },
        { key: "Outcomes", value: success || "—", muted: !success },
        { key: "Numbers", value: values.successCriteria || "Not specified", muted: !values.successCriteria },
        { key: "Cadence", value: [values.cadence, values.volume].filter(Boolean).join(" · ") || "—", muted: !values.cadence && !values.volume },
      ],
    },
    {
      section: "04 · How it works",
      editSlide: 4,
      rows: [
        { key: "Reach you", value: values.channel || "—", muted: !values.channel },
        { key: "Autonomy", value: values.autonomy || "—", muted: !values.autonomy },
        { key: "Tone", value: tone || "—", muted: !tone },
        { key: "Voice samples", value: values.brandVoice || "Not provided", muted: !values.brandVoice },
      ],
    },
    {
      section: "05 · Constraints",
      editSlide: 5,
      rows: [
        { key: "Budget", value: values.budget || "—", muted: !values.budget },
        { key: "Never do", value: neverDo || "—", muted: !neverDo },
        { key: "Other rules", value: values.redLines || "Nothing specified", muted: !values.redLines },
      ],
    },
    {
      section: "06 · Tools & procedures",
      editSlide: 6,
      rows: [
        { key: "Tools", value: toolList || "—", muted: !toolList },
        { key: "SOPs", value: sopSummary, muted: files.length === 0 && !values.sops },
      ],
    },
  ];

  return (
    <div className="fa-slide active">
      <div className="fa-review">
        <div className="fa-content-tag" style={{ textAlign: "center" }}>07 / 07 · FINAL STEP</div>
        <div className="fa-h-title" style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>Here&apos;s what you&apos;ve told me.</div>
        <p className="fa-hero-body" style={{ textAlign: "center", marginBottom: 36 }}>
          Take one last look. Edit any section — I&apos;ll have your proposal in your inbox within 30 minutes.
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
            <div className="fa-microcopy">Proposal in your inbox within 30 minutes</div>
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
          Atlas is reviewing your answers right now. I&apos;ll have your proposal in your inbox within <strong>30 minutes</strong>.
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
              <div className="fa-tl-sub">Within 30 minutes</div>
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

      </div>
    </div>
  );
}
