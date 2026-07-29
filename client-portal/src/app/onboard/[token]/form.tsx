"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./form.css";

// Every mark on this page is inline SVG. Nothing here depends on an external
// asset, so the first surface a prospect ever sees can't render half-drawn
// because a CDN blinked. Same geometry as the proposal and quote documents.
//
// Two-step teal applies to the artwork too: #00b3b3 is the visor (a mark, no
// letterform anywhere near it) and #00706f is used wherever a stroke needs to
// read. The #00d4d4 that used to sit in the Atlas visor is gone; it was a
// second teal nobody chose and it ships nowhere else.
function AmbittMark({ width = 44, height = 22 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 86 42" width={width} height={height} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(43, 22)">
        {[-28, 0, 28].map((tx) => (
          <g key={tx} transform={`translate(${tx}, 0)`}>
            <rect x={-9} y={-2} width={18} height={18} rx={5} fill="#1d2f40" />
            <circle cx={0} cy={-11} r={6.5} fill="#1d2f40" />
            <rect x={-4} y={-12.25} width={8} height={2.5} rx={1.25} fill="#00b3b3" />
          </g>
        ))}
      </g>
    </svg>
  );
}

// Atlas, on a light brand-wash plate. Was white-on-near-black; there is no
// near-black surface on this page any more.
function AtlasFace({ width = 22, height = 32 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 28 40" width={width} height={height} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x={5} y={19} width={18} height={18} rx={5} fill="#1d2f40" />
      <circle cx={14} cy={10} r={6.5} fill="#1d2f40" />
      <rect x={9.5} y={8.75} width={9} height={2.5} rx={1.25} fill="#00b3b3" />
    </svg>
  );
}

// A verb does the work; the chevron is only punctuation. The old buttons put a
// literal "→" in the label, which renders at a different size and weight on
// every platform and gets read aloud by a screen reader.
function Chev({ dir = "right" }: { dir?: "left" | "right" }) {
  return (
    <svg className="fa-chev" width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path
        d={dir === "right" ? "M6 3.4 10.6 8 6 12.6" : "M10 3.4 5.4 8 10 12.6"}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TickGlyph() {
  return (
    <svg width={11} height={11} viewBox="0 0 12 12" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.4 6.2 4.8 8.6 9.6 3.7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Duotone, drawn at one weight in two tones of one hue — the same icon
// language as the quote document's scope list. Replaces a single-stroke
// outline glyph of the kind this design system explicitly doesn't use.
function UploadMark() {
  return (
    <svg className="fa-upload-icon" width={34} height={34} viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <circle cx={16} cy={16} r={16} fill="#c2e6e5" />
      <g fill="none" stroke="#00706f" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 20.4V9.9" />
        <path d="M11.9 14 16 9.9l4.1 4.1" />
        <path d="M9.6 19.9v2.2a1.5 1.5 0 0 0 1.5 1.5h9.8a1.5 1.5 0 0 0 1.5-1.5v-2.2" />
      </g>
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
// Budget question removed 2026-05-22 — prospects almost always anchored to the
// floor regardless of actual scope, producing unreliable signal. Pricing now
// flows entirely through the post-approval quote (consultant pattern); the PRD
// drives the price, not a self-reported budget bucket.

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

// Empty review rows used to render a bare em dash. Client-facing copy on this
// page never passes the send-time em-dash scrub, and "—" tells the reader
// nothing anyway.
const NOT_ANSWERED = "Not answered yet";

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

// Static slide indices (the 3 always-on slides before AI customization kicks).
// Dynamic slides come after slide 4 (DomainConfirm); their count is determined
// by Atlas's output (6-10). Review + Sent close the flow.
//
// Slide map (with dynamicCount = N):
//   0 = Welcome
//   1 = AboutYou           ← static, but the existing rich slide
//   2 = OneSentence        ← agent goal (THE pivotal answer)
//   3 = LoadingDynamic     ← calls /customize-questions, blocks on Haiku
//   4 = DomainConfirmation ← shows Atlas's domain classification, prospect can back to clarify
//   5 … 5+N-1 = DynamicQuestion[0..N-1]
//   5+N   = Review
//   5+N+1 = Sent
const SLIDE_WELCOME = 0;
const SLIDE_ABOUT_YOU = 1;
const SLIDE_ONE_SENTENCE = 2;
const SLIDE_LOADING_DYNAMIC = 3;
const SLIDE_DOMAIN_CONFIRM = 4;
const FIRST_DYNAMIC_SLIDE = 5;

interface DynamicQuestion {
  id: string;
  type: "text" | "longText" | "select" | "multiSelect" | "scale";
  label: string;
  placeholder?: string;
  options?: string[];
  required: boolean;
  rationale?: string;
}

interface DynamicIntakePayload {
  domainSummary: string;
  agentArchetype: string;
  questions: DynamicQuestion[];
}

// The rail, and the welcome page's contents list, both read from this.
//
// The old copy promised a "7-chapter brief" and listed Hard limits, Tools,
// How it works and The job deeper. None of those chapters exist any more:
// after "the one sentence" the flow hands over to Atlas, which writes a
// handful of questions for this specific business. Telling a prospect on the
// first screen that there are seven chapters, four of which they will never
// see, is a worse first impression than any styling problem on this page.
type RailKey = "about" | "sentence" | "questions" | "review";

const RAIL_STEPS: Array<{ key: RailKey; name: string; desc: string }> = [
  { key: "about", name: "About you", desc: "Who you are, and what the business actually does" },
  { key: "sentence", name: "The one sentence", desc: "The agent's job, in your own words" },
  { key: "questions", name: "Your questions", desc: "A handful, written for your business once I've read the first two" },
  { key: "review", name: "Review and send", desc: "One last look, then it comes to me" },
];

export function OnboardForm({ token, prospectId: _prospectId, initial, status }: OnboardFormProps) {
  void _prospectId; // not consumed here today but kept on props for future use
  const [dynamicQuestions, setDynamicQuestions] = useState<DynamicIntakePayload | null>(null);
  const [dynamicAnswers, setDynamicAnswers] = useState<Record<string, unknown>>({});
  const [loadingDynamic, setLoadingDynamic] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dynamicCount = dynamicQuestions?.questions.length ?? 0;
  const SLIDE_REVIEW = FIRST_DYNAMIC_SLIDE + dynamicCount;
  const SLIDE_SENT = SLIDE_REVIEW + 1;

  const [slide, setSlide] = useState<number>(() => {
    // Status determines landing slide. With the adaptive flow, returning
    // prospects who already submitted go straight to the post-submit state.
    // The dynamic-question slides only exist after Atlas runs, so resume
    // mid-flow is not supported for v1 — prospects who close the tab mid-
    // intake will restart from Welcome (their answers are not yet persisted).
    if (status === "discovery_complete") return -1; // Sent (computed once dynamic loads, but for fresh status nothing dynamic yet — special-case below)
    if (status === "presentation_sent" || status === "revising") return -2; // Review
    if (status === "accepted" || status === "quote_pending" || status === "quote_sent") return -1;
    return (initial.contactName ?? "").trim().length > 0 ? SLIDE_ABOUT_YOU : SLIDE_WELCOME;
  });

  const [values, setValues] = useState<Record<string, string>>({ ...initial });
  const [multi, setMulti] = useState<Record<string, string[]>>(() => ({
    audienceTags: parseList(initial.audienceTags),
  }));
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

  function next() {
    setSlide((i) => i + 1);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function back() {
    setSlide((i) => Math.max(0, i - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Trigger AI customization when the prospect lands on the loading slide.
  // Synchronous on the model side (~5-15s with Haiku); auto-advances on
  // success. Stays on the loading slide if Atlas fails so the prospect can
  // hit "Try again" without losing their answers.
  async function fetchDynamicIntake() {
    if (dynamicQuestions || loadingDynamic) return;
    setLoadingDynamic(true);
    setLoadError(null);
    try {
      // Send slide 0-2 answers along — they haven't been persisted yet
      // (/submit is the only existing save path and runs at the end of the
      // flow). Oracle merges them into formData before generating questions,
      // so this single call both saves and reads. Multi flattens to comma-
      // joined strings to match the /submit body shape.
      const merged: Record<string, unknown> = { ...values };
      for (const [k, arr] of Object.entries(multi)) {
        merged[k] = arr.join(", ");
      }
      const res = await fetch(`/api/onboard/${token}/customize-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: merged }),
      });
      const body = await res.json().catch(() => ({ error: "Bad response" }));
      if (!res.ok) throw new Error(body.error ?? "Generation failed");
      const q = body.questions as DynamicIntakePayload | undefined;
      if (!q || !Array.isArray(q.questions) || q.questions.length === 0) {
        throw new Error("No questions returned");
      }
      setDynamicQuestions(q);
      // Auto-advance to the domain confirmation slide.
      setSlide(SLIDE_DOMAIN_CONFIRM);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoadingDynamic(false);
    }
  }

  // Fire customization when the slide hits LOADING. useEffect runs after
  // commit so we know the slide is rendered before kicking the fetch.
  useEffect(() => {
    if (slide === SLIDE_LOADING_DYNAMIC && !dynamicQuestions && !loadingDynamic && !loadError) {
      void fetchDynamicIntake();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  // Save dynamic answers as the prospect progresses. Final submit collapses
  // everything into formData.dynamic.answers.
  function setDynamicAnswer(id: string, value: unknown) {
    setDynamicAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // Flatten multi-selects to comma-joined strings (legacy backend shape).
      const merged: Record<string, unknown> = { ...values };
      for (const [k, arr] of Object.entries(multi)) {
        merged[k] = arr.join(", ");
      }
      // Stash dynamic Q+A under formData.dynamic so the proposal-generation
      // prompt can read both questions (the rationale field) and answers.
      if (dynamicQuestions) {
        merged.dynamic = {
          questions: dynamicQuestions,
          answers: dynamicAnswers,
        };
      }
      const res = await fetch(`/api/onboard/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: merged }),
      });
      const body = await res.json().catch(() => ({ error: "Submit failed" }));
      if (!res.ok) throw new Error(body.error ?? "Submit failed");
      // Jump to Sent — index is dynamic with N, so compute it.
      setSlide(SLIDE_SENT);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Resolve special sentinels (-1 sent, -2 review) once we have layout.
  // We use SLIDE_SENT / SLIDE_REVIEW indices which depend on dynamicCount
  // (only populated after Atlas runs). For returning prospects, we don't
  // have the dynamic payload, so dynamicCount = 0 and SLIDE_REVIEW = 5,
  // SLIDE_SENT = 6.
  const actualSlide = slide === -1 ? SLIDE_SENT : slide === -2 ? SLIDE_REVIEW : slide;

  // Step label + progress percent computed off the actual slide + dynamicCount.
  // The masthead label and the rail used to disagree with each other on the
  // same screen: the header said "STEP 1 OF 3" while the sidebar said
  // "CHAPTER 01 / 07". They now read off one model.
  const stepLabel = (() => {
    if (actualSlide === SLIDE_WELCOME) return "Your agent brief";
    if (actualSlide === SLIDE_ABOUT_YOU) return "Step 1 of 4";
    if (actualSlide === SLIDE_ONE_SENTENCE) return "Step 2 of 4";
    if (actualSlide === SLIDE_LOADING_DYNAMIC) return "Tailoring";
    if (actualSlide === SLIDE_DOMAIN_CONFIRM) return "Quick check";
    // Just the step. The rail carries "Question 2 of 3" underneath the active
    // step, and putting both here wrapped the wordmark onto two lines at 390px.
    if (actualSlide >= FIRST_DYNAMIC_SLIDE && actualSlide < FIRST_DYNAMIC_SLIDE + dynamicCount) {
      return "Step 3 of 4";
    }
    if (actualSlide === SLIDE_REVIEW) return "Step 4 of 4";
    if (actualSlide === SLIDE_SENT) return "All done";
    return "";
  })();
  const stepPercent = (() => {
    if (actualSlide === SLIDE_WELCOME) return 0;
    if (actualSlide === SLIDE_ABOUT_YOU) return 10;
    if (actualSlide === SLIDE_ONE_SENTENCE) return 22;
    if (actualSlide === SLIDE_LOADING_DYNAMIC) return 28;
    if (actualSlide === SLIDE_DOMAIN_CONFIRM) return 34;
    if (actualSlide >= FIRST_DYNAMIC_SLIDE && actualSlide < FIRST_DYNAMIC_SLIDE + dynamicCount) {
      const progress = (actualSlide - FIRST_DYNAMIC_SLIDE + 1) / dynamicCount;
      return Math.round(34 + progress * 56);
    }
    if (actualSlide === SLIDE_REVIEW) return 95;
    return 100;
  })();

  const headerClass =
    actualSlide === SLIDE_WELCOME ? "fa-header welcome" : actualSlide === SLIDE_SENT ? "fa-header sent" : "fa-header";

  const dynIndex = actualSlide - FIRST_DYNAMIC_SLIDE;
  const isDynamicSlide =
    actualSlide >= FIRST_DYNAMIC_SLIDE && actualSlide < FIRST_DYNAMIC_SLIDE + dynamicCount;

  return (
    <div className="fa-onboard">
      <div className="fa-doc">
        {/* The document's teal top rule doubles as the progress bar. */}
        <div
          className="fa-progress"
          role="progressbar"
          aria-label="Brief progress"
          aria-valuenow={stepPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="fa-progress-fill" style={{ width: `${stepPercent}%` }} />
        </div>

        <div className={headerClass}>
          <div className="fa-brand">
            <AmbittMark />
            <span>
              Ambitt <span className="accent">Agents</span>
            </span>
          </div>
          <div className="fa-step">{stepLabel}</div>
        </div>

        <div className="fa-stage">
        {actualSlide === SLIDE_WELCOME && <WelcomeSlide onBegin={next} />}
        {actualSlide === SLIDE_ABOUT_YOU && (
          <AboutYouSlide values={values} set={set} multi={multi} toggleMulti={toggleMulti} onNext={next} onBack={back} />
        )}
        {actualSlide === SLIDE_ONE_SENTENCE && (
          <OneSentenceSlide values={values} set={set} onNext={next} onBack={back} />
        )}
        {actualSlide === SLIDE_LOADING_DYNAMIC && (
          <LoadingDynamicSlide
            loading={loadingDynamic}
            error={loadError}
            onRetry={() => {
              setLoadError(null);
              void fetchDynamicIntake();
            }}
            onBack={back}
          />
        )}
        {actualSlide === SLIDE_DOMAIN_CONFIRM && dynamicQuestions && (
          <DomainConfirmationSlide
            domainSummary={dynamicQuestions.domainSummary}
            agentArchetype={dynamicQuestions.agentArchetype}
            onBack={back}
            onNext={next}
          />
        )}
        {isDynamicSlide && dynamicQuestions && (
          <DynamicQuestionSlide
            question={dynamicQuestions.questions[dynIndex]}
            index={dynIndex}
            total={dynamicCount}
            value={dynamicAnswers[dynamicQuestions.questions[dynIndex].id]}
            onChange={(v) => setDynamicAnswer(dynamicQuestions.questions[dynIndex].id, v)}
            onBack={back}
            onNext={next}
          />
        )}
        {actualSlide === SLIDE_REVIEW && (
          <AdaptiveReviewSlide
            values={values}
            dynamicQuestions={dynamicQuestions}
            dynamicAnswers={dynamicAnswers}
            email={initial.email ?? ""}
            onBack={back}
            onSend={submit}
            submitting={submitting}
            error={error}
          />
        )}
        {actualSlide === SLIDE_SENT && <SentSlide email={initial.email ?? ""} />}
        </div>
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
        {/* No eyebrow here: the masthead on the same row already says "Your
            agent brief", and printing it twice reads as a bug. */}
        <div className="fa-mark"><AtlasFace width={30} height={43} /></div>
        <h1 className="fa-h-title">Let&apos;s build your agent.</h1>
        <p className="fa-hero-body">
          Hey, I&apos;m <strong>Atlas</strong>. I handle onboarding here. The more you tell me, the sharper
          the proposal I&apos;ll write for you.
        </p>
        <p className="fa-hero-body">
          When you&apos;re done I&apos;ll read it all back, draft what we&apos;d build, and email it over.
          Usually within 30 minutes.
        </p>

        <div className="fa-toc">
          <div className="fa-toc-label">What I&apos;ll ask you</div>
          <div className="fa-toc-list">
            {RAIL_STEPS.map((step, i) => (
              <div className="fa-toc-row" key={step.key}>
                <div className="fa-toc-num">{String(i + 1).padStart(2, "0")}</div>
                <div className="fa-toc-body">
                  <div className="fa-toc-name">{step.name}</div>
                  <div className="fa-toc-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="fa-begin-wrap">
          <button type="button" className="fa-begin" onClick={onBegin}>
            Start the brief
            <Chev />
          </button>
        </div>
        {/* "Progress saved automatically" was not true. The first two answers
            are saved when Atlas tailors the questions; the tailored answers
            are only saved on send. */}
        <div className="fa-meta">About 5 minutes<span className="dot">·</span>Best done in one sitting</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chapter shell — tonal rail + content area, used by EVERY question slide
// ---------------------------------------------------------------------------
//
// The rail replaces a 320px near-black slab that carried an 84px numeral and a
// decorative pull-quote attributed to Atlas. Three things were wrong with it:
// it was the only dark surface anywhere in the pre-sale funnel, its palette
// was warm (#171717) against a cool system, and it spent the whole left column
// on ornament while the prospect's actual question ("how much more of this is
// there?") went unanswered. It now shows who is asking and exactly where you
// are, which is the reassurance a long intake form owes the person filling it.
//
// It is also on every question slide now. The tailored questions used to
// render in a bare 620px column with no rail at all, so progress vanished at
// exactly the point the form gets longest.

interface ChapterShellProps {
  active: RailKey;
  /** e.g. "Question 2 of 3" under the active rail step. */
  activeSub?: string;
  /** Atlas's line for this step. Plain speech, not a pull-quote. */
  note: string;
  eyebrow: string;
  title: React.ReactNode;
  helper?: string;
  anchor?: boolean;
  children: React.ReactNode;
  onBack: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  /** Shown between the fields and the nav, e.g. a required-answer nudge. */
  hint?: string;
  busy?: boolean;
}

function ChapterRail({ active, activeSub, note }: { active: RailKey; activeSub?: string; note: string }) {
  const activeIndex = RAIL_STEPS.findIndex((s) => s.key === active);
  return (
    <aside className="fa-rail">
      <div className="fa-rail-who">
        <div className="fa-rail-avatar"><AtlasFace width={19} height={27} /></div>
        <div>
          <div className="fa-rail-name">Atlas</div>
          <div className="fa-rail-role">Onboarding agent</div>
        </div>
      </div>

      <ol className="fa-rsteps">
        {RAIL_STEPS.map((step, i) => {
          const state = i < activeIndex ? "done" : i === activeIndex ? "now" : "todo";
          return (
            <li className={`fa-rstep ${state}`} key={step.key} aria-current={state === "now" ? "step" : undefined}>
              <span className="fa-rstep-dot">{state === "done" ? <TickGlyph /> : i + 1}</span>
              <span className="fa-rstep-body">
                <span className="fa-rstep-name">{step.name}</span>
                {state === "now" && activeSub && <span className="fa-rstep-sub">{activeSub}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="fa-rail-hr" />
      <p className="fa-rail-note">{note}</p>
      <div className="fa-rail-hr" />
      <p className="fa-rail-foot">Nothing goes anywhere until you send it at the end.</p>
    </aside>
  );
}

function ChapterShell({
  active, activeSub, note, eyebrow, title, helper, anchor, children,
  onBack, onNext, backLabel = "Back", nextLabel = "Continue", nextDisabled, hint, busy,
}: ChapterShellProps) {
  return (
    <div className="fa-slide active">
      <div className="fa-cols">
        <ChapterRail active={active} activeSub={activeSub} note={note} />

        <div className="fa-content">
          <div className="fa-eyebrow">{eyebrow}</div>
          <h1 className={`fa-q-title${anchor ? " anchor" : ""}`}>{title}</h1>
          {helper && <p className={`fa-q-helper${anchor ? " anchor" : ""}`}>{helper}</p>}

          {children}

          {hint && <p className="fa-hint">{hint}</p>}

          <div className="fa-nav">
            <button type="button" className="fa-back" onClick={onBack} disabled={busy}>
              <Chev dir="left" />
              {backLabel}
            </button>
            <button type="button" className="fa-continue" onClick={onNext} disabled={nextDisabled || busy}>
              {nextLabel}
              <Chev />
            </button>
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
        placeholder={catalog.length === 0 ? "Loading tool catalog…" : "Type a tool name. Gmail, Linear, your own app…"}
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
        <UploadMark />
        <div className="fa-upload-text">{uploading ? "Uploading…" : "Drop SOPs here, or click to upload"}</div>
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
      active="about"
      note="Just the basics here. This is what makes sure the proposal lands with the right person and gets built for the right business."
      eyebrow="Contact and business"
      title="Tell me about you and your business."
      helper="Quick facts, so the proposal is addressed to the right person."
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
      <Field label="What does your business actually do?" helper="One paragraph. Industry, what you sell, who buys.">
        <Textarea value={values.industry ?? ""} onChange={(e) => set("industry", e.target.value)} placeholder="We help [audience] do [job] by [solution]. A paragraph is plenty." />
      </Field>
      <Field label="Who is your target audience?" helper="Pick all that apply. I'll tune the agent's voice and outputs to fit them.">
        <CheckPills options={AUDIENCE_OPTIONS} selected={multi.audienceTags ?? []} onToggle={(v) => toggleMulti("audienceTags", v)} />
        <OptionalDetail>Anything more specific? Industry, role, company size.</OptionalDetail>
        <Textarea value={values.audienceDetail ?? ""} onChange={(e) => set("audienceDetail", e.target.value)} placeholder={`e.g. "DTC e-commerce founders doing $1–10M a year", "HR directors at 200+ employee SaaS companies"`} />
      </Field>
      <Field label="What should the agent call you?">
        <Input value={values.preferredName ?? ""} onChange={(e) => set("preferredName", e.target.value)} placeholder="First name" />
      </Field>
      <Field label="What should we call your agent?" helper="Pick a name. Atlas, Bob, Iris, anything. I'll use it throughout the proposal.">
        <Input value={values.agentName ?? ""} onChange={(e) => set("agentName", e.target.value)} placeholder="e.g. Bob" />
      </Field>
      <Field label="What's their role?" helper="Pick the closest match. If nothing fits, type your own below.">
        <Pills options={AGENT_ROLE_OPTIONS} value={values.agentRole ?? ""} onChange={(v) => set("agentRole", v)} />
        <OptionalDetail>Or describe it yourself:</OptionalDetail>
        <Input value={values.agentRole ?? ""} onChange={(e) => set("agentRole", e.target.value)} placeholder="e.g. outbound SDR for yacht charters" />
      </Field>
    </ChapterShell>
  );
}

// ---------------------------------------------------------------------------
// Slide 2 — THE ONE SENTENCE (anchor)
// ---------------------------------------------------------------------------

function OneSentenceSlide({ values, set, onBack, onNext }: { values: Record<string, string>; set: (k: string, v: string) => void; onBack: () => void; onNext: () => void }) {
  const agentLabel = values.agentName?.trim() || "your agent";
  return (
    <ChapterShell
      active="sentence"
      note="This is the one that matters most. Take a beat with it. I'll work with whatever you write."
      eyebrow="The agent's job"
      title={`In one sentence, what should ${agentLabel} do for you?`}
      helper="Don't overthink it. If anything's unclear, we'll sort it out together."
      anchor
      onBack={onBack}
      onNext={onNext}
    >
      <Field>
        <Textarea anchor value={values.agentPitch ?? ""} onChange={(e) => set("agentPitch", e.target.value)} placeholder="e.g. Reply to inbound support tickets within 5 minutes with a draft response for me to approve." />
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
  const agentLabel = values.agentName?.trim() || "your agent";
  return (
    <ChapterShell
      active="questions"
      note={`What changes when ${agentLabel} shows up, and what good looks like three months out.`}
      eyebrow="Success and cadence"
      title="Let's go deeper on the job."
      helper={`What changes when ${agentLabel} is in place, what success looks like, and how often it should run.`}
      onBack={onBack}
      onNext={onNext}
    >
      <Field label="Today, who handles this work?">
        <Pills options={TODAY_HANDLER_OPTIONS} value={values.todayHandler ?? "I do it myself"} onChange={(v) => set("todayHandler", v)} />
        <OptionalDetail>Want to add details? How much time it takes, what&apos;s hard about it.</OptionalDetail>
        <Textarea value={values.todayVsAgent ?? ""} onChange={(e) => set("todayVsAgent", e.target.value)} placeholder="What does the manual process look like today? How much time does it take?" />
      </Field>
      <Field label="What does success look like 3 months from now?" helper="Pick all that apply. I'll use these as the proposal's success metrics.">
        <CheckPills options={SUCCESS_OUTCOMES} selected={multi.successOutcomes ?? []} onToggle={(v) => toggleMulti("successOutcomes", v)} />
        <OptionalDetail>Add concrete numbers if you have them:</OptionalDetail>
        <Textarea value={values.successCriteria ?? ""} onChange={(e) => set("successCriteria", e.target.value)} placeholder={`e.g. "3 new clients a month", "20 hours saved each week"`} />
      </Field>
      <Field label="How does it run?" helper="Scheduled fires at set times (daily morning, weekly Monday). Triggered reacts to inbound events (a new email, a form fill, a webhook). Exact timing gets set in your portal after launch.">
        <Pills options={CADENCE_OPTIONS} value={values.cadence ?? "On a schedule"} onChange={(v) => set("cadence", v)} />
      </Field>
      <Field label="Rough volume" helper={`Best guess. e.g. "10–20 emails per day", "500 listings reviewed per week".`}>
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
  const agentLabel = values.agentName?.trim() || "your agent";
  return (
    <ChapterShell
      active="questions"
      note={`Where ${agentLabel} shows up, how much rope it has, and how it should sound when it speaks for you.`}
      eyebrow="Channel, autonomy, voice"
      title={`How should ${agentLabel} operate?`}
      helper="Where it shows up, how much rope it has, and how it should sound."
      onBack={onBack}
      onNext={onNext}
    >
      <Field label={`How should ${agentLabel} reach you?`}>
        <Pills options={CHANNEL_OPTIONS} value={values.channel ?? "Email"} onChange={(v) => set("channel", v)} />
      </Field>
      <Field label="How much rope should it have?">
        <Cards options={AUTONOMY_OPTIONS} value={values.autonomy ?? "Supervised"} onChange={(v) => set("autonomy", v)} />
      </Field>
      <Field label={`How should ${agentLabel} sound when it speaks for you?`} helper="Pick 2–3 that fit best.">
        <CheckPills options={TONE_OPTIONS} selected={multi.toneTags ?? []} onToggle={(v) => toggleMulti("toneTags", v)} />
        <OptionalDetail>Or paste 2–3 samples of how you sound, and {agentLabel} will mirror them:</OptionalDetail>
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
  const agentLabel = values.agentName?.trim() || "your agent";
  return (
    <ChapterShell
      active="questions"
      note={`Anything that should be a hard no for ${agentLabel}.`}
      eyebrow="Guardrails"
      title="Any hard limits?"
      helper={`Things ${agentLabel} should never do or topics it should stay out of.`}
      onBack={onBack}
      onNext={onNext}
    >
      <Field label={`What should ${agentLabel} never do?`} helper="Common no-gos. Pick all that apply.">
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
  const agentLabel = values.agentName?.trim() || "your agent";
  return (
    <ChapterShell
      active="questions"
      note={`What tools ${agentLabel} needs access to, plus any process docs that describe how this work is done today.`}
      eyebrow="Access and playbooks"
      title="Last thing. What should it connect to?"
      helper={`Any tools, systems, or process docs ${agentLabel} should know about.`}
      onBack={onBack}
      onNext={onNext}
    >
      <Field
        label={`What tools will ${agentLabel} need access to?`}
        helper="Start typing and we'll match against 250+ Composio integrations. Don't see your tool? Type it and press Enter to add it as a custom app."
      >
        <ToolPicker tools={tools} setTools={setTools} />
      </Field>
      <Field
        label="Got any SOPs, playbooks, or docs?"
        helper={`SOPs are your existing process docs, runbooks, or playbooks. Cookbook-style is best. Skip it if you don't have any.`}
      >
        <UploadDropzone files={files} onUpload={onUpload} onRemove={onRemoveFile} uploading={uploading} />
        <OptionalDetail>Paste below or upload, whichever&apos;s easier.</OptionalDetail>
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
        { key: "Name", value: values.contactName || NOT_ANSWERED, muted: !values.contactName },
        { key: "Email", value: email },
        { key: "Role", value: values.role || NOT_ANSWERED, muted: !values.role },
        { key: "Business", value: [values.businessName, values.website].filter(Boolean).join(" · ") || NOT_ANSWERED, muted: !values.businessName && !values.website },
        { key: "What you do", value: values.industry || NOT_ANSWERED, muted: !values.industry },
        { key: "Audience", value: [audience, values.audienceDetail].filter(Boolean).join(" · ") || NOT_ANSWERED, muted: !audience && !values.audienceDetail },
        { key: "Call you", value: values.preferredName || NOT_ANSWERED, muted: !values.preferredName },
        { key: "Your agent", value: [values.agentName, values.agentRole].filter(Boolean).join(" · ") || NOT_ANSWERED, muted: !values.agentName && !values.agentRole },
      ],
    },
    {
      section: "02 · The agent's job",
      editSlide: 2,
      rows: [
        { key: "One sentence", value: values.agentPitch || NOT_ANSWERED, muted: !values.agentPitch },
      ],
    },
    {
      section: "03 · Success & cadence",
      editSlide: 3,
      rows: [
        { key: "Today", value: [values.todayHandler, values.todayVsAgent].filter(Boolean).join(" · ") || NOT_ANSWERED, muted: !values.todayHandler && !values.todayVsAgent },
        { key: "Outcomes", value: success || NOT_ANSWERED, muted: !success },
        { key: "Numbers", value: values.successCriteria || "Not specified", muted: !values.successCriteria },
        { key: "Cadence", value: [values.cadence, values.volume].filter(Boolean).join(" · ") || NOT_ANSWERED, muted: !values.cadence && !values.volume },
      ],
    },
    {
      section: "04 · How it works",
      editSlide: 4,
      rows: [
        { key: "Reach you", value: values.channel || NOT_ANSWERED, muted: !values.channel },
        { key: "Autonomy", value: values.autonomy || NOT_ANSWERED, muted: !values.autonomy },
        { key: "Tone", value: tone || NOT_ANSWERED, muted: !tone },
        { key: "Voice samples", value: values.brandVoice || "Not provided", muted: !values.brandVoice },
      ],
    },
    {
      section: "05 · Constraints",
      editSlide: 5,
      rows: [
        { key: "Never do", value: neverDo || NOT_ANSWERED, muted: !neverDo },
        { key: "Other rules", value: values.redLines || "Nothing specified", muted: !values.redLines },
      ],
    },
    {
      section: "06 · Tools & procedures",
      editSlide: 6,
      rows: [
        { key: "Tools", value: toolList || NOT_ANSWERED, muted: !toolList },
        { key: "SOPs", value: sopSummary, muted: files.length === 0 && !values.sops },
      ],
    },
  ];

  return (
    <div className="fa-slide active">
      <div className="fa-review">
        <div className="fa-eyebrow">Final step</div>
        <h1 className="fa-h-title">Here&apos;s what you&apos;ve told me.</h1>
        <p className="fa-hero-body" style={{ marginBottom: 28 }}>
          Take one last look. Edit any section you want, then send. Your proposal lands in your inbox
          within 30 minutes.
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
          <button type="button" className="fa-back" onClick={onBack} disabled={submitting}>
            <Chev dir="left" />
            Back
          </button>
          <div className="fa-nav-end">
            <button type="button" className="fa-continue fa-send" onClick={onSend} disabled={submitting}>
              {submitting ? "Sending…" : "Send it to Atlas"}
              {!submitting && <Chev />}
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
        <div className="fa-mark success"><AtlasFace width={30} height={43} /></div>
        <div className="fa-hero-pill"><span className="fa-hero-pill-dot" />Brief received</div>
        <h1 className="fa-h-title">Your brief is in.</h1>
        <p className="fa-hero-body">
          I&apos;m reading your answers now. Your proposal will be in your inbox within <strong>30 minutes</strong>.
        </p>
        {email && (
          <p className="fa-hero-body">
            I sent a copy to <strong>{email}</strong> for your records.
          </p>
        )}

        <div className="fa-timeline">
          <div className="fa-timeline-h">What happens next</div>
          <div className="fa-tl-row done">
            <div className="fa-tl-num"><TickGlyph /></div>
            <div className="fa-tl-body">
              <div className="fa-tl-title">Brief received</div>
              <div className="fa-tl-sub">Just now</div>
            </div>
          </div>
          <div className="fa-tl-row">
            <div className="fa-tl-num">2</div>
            <div className="fa-tl-body">
              <div className="fa-tl-title">I draft your proposal</div>
              <div className="fa-tl-sub">Within 30 minutes</div>
            </div>
          </div>
          <div className="fa-tl-row">
            <div className="fa-tl-num">3</div>
            <div className="fa-tl-body">
              <div className="fa-tl-title">Our team checks scope and pricing</div>
              <div className="fa-tl-sub">Same business day</div>
            </div>
          </div>
          <div className="fa-tl-row">
            <div className="fa-tl-num">4</div>
            <div className="fa-tl-body">
              <div className="fa-tl-title">Proposal lands in your inbox</div>
              <div className="fa-tl-sub">Approve it, edit it, or talk it through</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adaptive intake — new slides (2026-05-31)
// ---------------------------------------------------------------------------

// Slide 3 — LOADING (auto-fires /customize-questions, shows spinner)
function LoadingDynamicSlide({
  loading,
  error,
  onRetry,
  onBack,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="fa-slide active">
      <div className="fa-solo fa-wait">
        {!error && (
          <>
            <div className="fa-spinner" role="status" aria-label="Tailoring your questions" />
            <h1 className="fa-h-title">{loading ? "Reading what you sent." : "Almost there."}</h1>
            <p className="fa-hero-body">
              I&apos;m working out what your business actually needs, so the next few questions are
              about <em>you</em> rather than a one-size-fits-all form.
            </p>
            <p className="fa-meta">About 10 seconds.</p>
          </>
        )}
        {error && (
          <>
            <h1 className="fa-h-title">That didn&apos;t go through.</h1>
            <p className="fa-hero-body">{error}</p>
            <p className="fa-hero-body">
              Your answers are safe. Try once more, or step back if you&apos;d rather change something first.
            </p>
            <div className="fa-actions">
              <button type="button" className="fa-btn-secondary" onClick={onBack}>
                <Chev dir="left" />
                Back
              </button>
              <button type="button" className="fa-btn-primary" onClick={onRetry}>
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Slide 4 — DOMAIN CONFIRMATION (show Atlas's classification; let prospect back-out if wrong)
function DomainConfirmationSlide({
  domainSummary,
  agentArchetype,
  onBack,
  onNext,
}: {
  domainSummary: string;
  agentArchetype: string;
  onBack: () => void;
  onNext: () => void;
}) {
  // Was a card with a 135deg gradient, a 1px #00b3b3 outline, and its two
  // labels set in #00b3b3 at 2.49:1. Now a brand-tinted tonal panel with the
  // labels on the teal text step at 5.29:1, which is also how the proposal and
  // quote documents draw their key/value blocks.
  return (
    <ChapterShell
      active="questions"
      activeSub="Quick check first"
      note="Worth thirty seconds. Everything I ask after this is built on this read, so it's cheaper to correct here than later."
      eyebrow="Quick check"
      title="Sound about right?"
      helper="Here's how I'm reading your situation from what you've told me so far."
      onBack={onBack}
      onNext={onNext}
      backLabel="Let me clarify"
      nextLabel="Looks right"
    >
      <div className="fa-panel brand">
        <div className="fa-panel-k">Your business</div>
        <div className="fa-panel-v">{domainSummary}</div>
        <div className="fa-panel-k">The agent</div>
        <div className="fa-panel-v">{agentArchetype}</div>
      </div>
      <p className="fa-hint" style={{ marginTop: 16, marginBottom: 0 }}>
        If this is way off, go back and tighten up your one-sentence answer.
      </p>
    </ChapterShell>
  );
}

// Slides 5..5+N-1 — DYNAMIC QUESTION (one per slide, type-routed)
function DynamicQuestionSlide({
  question,
  index,
  total,
  value,
  onChange,
  onBack,
  onNext,
}: {
  question: DynamicQuestion;
  index: number;
  total: number;
  value: unknown;
  onChange: (v: unknown) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const isAnswered = (() => {
    if (!question.required) return true;
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  })();

  // These slides used to render in a bare centred column with no rail, so
  // progress disappeared at exactly the point the form gets longest and the
  // prospect most wants to know how much is left. They now use the same
  // chapter shell as every other question.
  return (
    <ChapterShell
      active="questions"
      activeSub={`Question ${index + 1} of ${total}`}
      note="These are written for your business, not pulled off a shelf. Short answers are completely fine."
      eyebrow={`Question ${index + 1} of ${total}`}
      title={
        <>
          {question.label}
          {question.required && <span className="fa-req" aria-hidden="true">*</span>}
        </>
      }
      helper={question.required ? undefined : "Optional. Skip it if nothing comes to mind."}
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!isAnswered}
      nextLabel={index + 1 === total ? "Review your answers" : "Next"}
      hint={!isAnswered && question.required ? "I need this one for the proposal. Pick or type an answer to keep going." : undefined}
    >
      {question.type === "text" && (
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder ?? ""}
          autoFocus
        />
      )}
      {question.type === "longText" && (
        <Textarea
          anchor
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder ?? ""}
          autoFocus
        />
      )}
      {question.type === "select" && question.options && (
        <Pills options={question.options} value={(value as string) ?? ""} onChange={(v) => onChange(v)} />
      )}
      {question.type === "multiSelect" && question.options && (
        <CheckPills
          options={question.options}
          selected={(value as string[]) ?? []}
          onToggle={(v) => {
            const cur = (value as string[]) ?? [];
            const nextArr = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
            onChange(nextArr);
          }}
        />
      )}
      {question.type === "scale" && (
        <div className="fa-scale">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`fa-scale-btn${value === n ? " active" : ""}`}
              aria-pressed={value === n}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </ChapterShell>
  );
}

// FINAL — ADAPTIVE REVIEW SLIDE (replaces the old Review for the adaptive flow)
function AdaptiveReviewSlide({
  values,
  dynamicQuestions,
  dynamicAnswers,
  email,
  onBack,
  onSend,
  submitting,
  error,
}: {
  values: Record<string, string>;
  dynamicQuestions: DynamicIntakePayload | null;
  dynamicAnswers: Record<string, unknown>;
  email: string;
  onBack: () => void;
  onSend: () => void;
  submitting: boolean;
  error: string | null;
}) {
  function renderAnswer(ans: unknown): { text: string; muted: boolean } {
    if (ans === undefined || ans === null) return { text: NOT_ANSWERED, muted: true };
    if (Array.isArray(ans)) {
      return ans.length > 0 ? { text: ans.join(", "), muted: false } : { text: NOT_ANSWERED, muted: true };
    }
    if (typeof ans === "number") return { text: String(ans), muted: false };
    if (typeof ans === "string") {
      const t = ans.trim();
      return t ? { text: t, muted: false } : { text: NOT_ANSWERED, muted: true };
    }
    return { text: String(ans), muted: false };
  }

  return (
    <div className="fa-slide active">
      <div className="fa-review">
        <div className="fa-eyebrow">Final step</div>
        <h1 className="fa-h-title">Here&apos;s what you&apos;ve told me.</h1>
        <p className="fa-hero-body" style={{ marginBottom: 26 }}>
          Quick scan, then send. Your proposal lands in <strong>{email || "your inbox"}</strong> within
          30 minutes.
        </p>

        <div className="fa-review-block">
          <div className="fa-review-head">
            <div className="fa-review-section-name">About you</div>
          </div>
          <div className="fa-review-row">
            <div className="fa-review-key">Name</div>
            <div className={`fa-review-value${values.contactName ? "" : " muted"}`}>{values.contactName || NOT_ANSWERED}</div>
          </div>
          <div className="fa-review-row">
            <div className="fa-review-key">Business</div>
            <div className={`fa-review-value${values.businessName ? "" : " muted"}`}>{values.businessName || NOT_ANSWERED}</div>
          </div>
          <div className="fa-review-row">
            <div className="fa-review-key">Role</div>
            <div className={`fa-review-value${values.role ? "" : " muted"}`}>{values.role || NOT_ANSWERED}</div>
          </div>
        </div>

        <div className="fa-review-block">
          <div className="fa-review-head">
            <div className="fa-review-section-name">The job</div>
          </div>
          <div className="fa-review-row">
            <div className="fa-review-key">In one sentence</div>
            <div className={`fa-review-value${values.agentPitch ? "" : " muted"}`}>{values.agentPitch || NOT_ANSWERED}</div>
          </div>
        </div>

        {dynamicQuestions && (
          <div className="fa-review-block">
            {/* The section name used to be the domain summary truncated to 60
                characters and set in letterspaced uppercase, which produced a
                headline that read as a bug. The summary is a sentence, so it
                is now set as one, underneath a real heading. */}
            <div className="fa-review-head">
              <div>
                <div className="fa-review-section-name">Tailored to your business</div>
                <div className="fa-review-section-sub">{dynamicQuestions.domainSummary}</div>
              </div>
            </div>
            {dynamicQuestions.questions.map((q) => {
              const a = renderAnswer(dynamicAnswers[q.id]);
              return (
                <div className="fa-review-row stacked" key={q.id}>
                  <div className="fa-review-key">{q.label}</div>
                  <div className={`fa-review-value${a.muted ? " muted" : ""}`}>{a.text}</div>
                </div>
              );
            })}
          </div>
        )}

        {error && <div className="fa-error">{error}</div>}

        <div className="fa-nav">
          <button type="button" className="fa-back" onClick={onBack} disabled={submitting}>
            <Chev dir="left" />
            Back
          </button>
          <div className="fa-nav-end">
            <button type="button" className="fa-continue fa-send" onClick={onSend} disabled={submitting}>
              {submitting ? "Sending…" : "Send it to Atlas"}
              {!submitting && <Chev />}
            </button>
            <div className="fa-microcopy">Proposal in your inbox within 30 minutes</div>
          </div>
        </div>
      </div>
    </div>
  );
}

