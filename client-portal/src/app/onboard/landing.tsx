"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./[token]/form.css";

// Inline marks — same source-of-truth shapes as form.tsx, kept inline so this
// page never depends on an external asset. This is the screen immediately
// before /onboard/[token], so it shares that page's stylesheet and has to move
// with it or the two consecutive screens stop matching.
function AmbittMark({ width = 44, height = 22 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 86 42" width={width} height={height} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(43, 22)">
        {[-28, 0, 28].map((tx) => (
          <g key={tx} transform={`translate(${tx}, 0)`}>
            <rect x={-9} y={-2} width={18} height={18} rx={5} fill="#1b3139" />
            <circle cx={0} cy={-11} r={6.5} fill="#1b3139" />
            <rect x={-4} y={-12.25} width={8} height={2.5} rx={1.25} fill="#00b3b3" />
          </g>
        ))}
      </g>
    </svg>
  );
}

// #00d4d4 removed: a second teal nobody chose, shipping nowhere else.
function AtlasFace({ width = 30, height = 43 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 28 40" width={width} height={height} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x={5} y={19} width={18} height={18} rx={5} fill="#1b3139" />
      <circle cx={14} cy={10} r={6.5} fill="#1b3139" />
      <rect x={9.5} y={8.75} width={9} height={2.5} rx={1.25} fill="#00b3b3" />
    </svg>
  );
}

function Chev() {
  return (
    <svg className="fa-chev" width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3.4 10.6 8 6 12.6" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors RAIL_STEPS in ./[token]/form.tsx. Kept as its own list rather than
// imported, because that module is a client component carrying the whole
// intake and this page only needs four strings.
const LANDING_STEPS = [
  { name: "About you", desc: "Who you are, and what the business actually does" },
  { name: "The one sentence", desc: "The agent's job, in your own words" },
  { name: "Your questions", desc: "A handful, written for your business once I've read the first two" },
  { name: "Review and send", desc: "One last look, then it comes to me" },
];

export default function OnboardLanding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && EMAIL_RX.test(email.trim());

  async function begin() {
    if (!canSubmit) {
      setError("Please enter your name and a valid email.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboard/find-or-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const body = await res.json().catch(() => ({ error: "Unexpected response" }));
      if (!res.ok || !body.token) {
        throw new Error(body.error ?? `Could not start onboarding (${res.status})`);
      }
      router.push(`/onboard/${body.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start onboarding");
      setSubmitting(false);
    }
    // Don't clear submitting on success — the redirect tears down this component.
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && canSubmit && !submitting) {
      e.preventDefault();
      void begin();
    }
  }

  return (
    <div className="fa-onboard">
      <div className="fa-doc">
        <div className="fa-progress static" />
        <div className="fa-header welcome">
          <div className="fa-brand">
            <AmbittMark />
            <span>
              Ambitt <span className="accent">Agents</span>
            </span>
          </div>
          <div className="fa-step">Your agent brief</div>
        </div>

        <div className="fa-stage">
          <div className="fa-slide active">
            <div className="fa-hero">
              {/* No eyebrow here: the masthead on the same row already says
                  "Your agent brief", and printing it twice reads as a bug. */}
              <div className="fa-mark"><AtlasFace /></div>
              <h1 className="fa-h-title">Let&apos;s build your agent.</h1>
              <p className="fa-hero-body">
                Hey, I&apos;m <strong>Atlas</strong>. I&apos;ll walk you through the brief and draft a
                proposal from it. Talking with me is also a small preview of what an agent built for you
                could do.
              </p>
              <p className="fa-hero-body">
                The more you share over the next few minutes, the sharper your proposal will be. It&apos;s
                usually back in your inbox within 30 minutes.
              </p>

              <div className="fa-landing-fields">
                <div className="fa-landing-field">
                  <label className="fa-landing-label" htmlFor="landing-name">Your name</label>
                  <input
                    id="landing-name"
                    className="fa-input"
                    type="text"
                    value={name}
                    placeholder="Jordan Williams"
                    autoComplete="name"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={submitting}
                  />
                </div>
                <div className="fa-landing-field">
                  <label className="fa-landing-label" htmlFor="landing-email">Email</label>
                  <input
                    id="landing-email"
                    className="fa-input"
                    type="email"
                    value={email}
                    placeholder="you@yourbusiness.com"
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={submitting}
                  />
                </div>
              </div>
              {error && <div className="fa-landing-error">{error}</div>}

              {/* Four steps, because there are four. The old list promised a
                  "7-chapter brief" including Hard limits, Tools and How it
                  works, none of which the prospect is ever shown: after the
                  one-sentence answer, Atlas writes the rest of the questions
                  for their specific business. */}
              <div className="fa-toc">
                <div className="fa-toc-label">What I&apos;ll ask you</div>
                <div className="fa-toc-list">
                  {LANDING_STEPS.map((step, i) => (
                    <div className="fa-toc-row" key={step.name}>
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
                <button
                  type="button"
                  className="fa-begin"
                  onClick={begin}
                  disabled={!canSubmit || submitting}
                >
                  {submitting ? "Setting things up…" : "Start the brief"}
                  {!submitting && <Chev />}
                </button>
              </div>
              <div className="fa-meta">About 5 minutes<span className="dot">·</span>Best done in one sitting</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
