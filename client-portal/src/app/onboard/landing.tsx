"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./[token]/form.css";

// Inline marks — same source-of-truth shapes as form.tsx. Kept inline so
// the landing renders pixel-identical even if the CDN hiccups.
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

function AtlasSingle({ width = 50, height = 72 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 28 40" width={width} height={height} xmlns="http://www.w3.org/2000/svg">
      <rect x={5} y={19} width={18} height={18} rx={5} fill="#ffffff" />
      <circle cx={14} cy={10} r={6.5} fill="#ffffff" />
      <rect x={9.5} y={8.75} width={9} height={2.5} rx={1.25} fill="#00d4d4" />
    </svg>
  );
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      <div className="fa-header welcome">
        <div className="fa-brand">
          <AmbittMark />
          AMBITT AGENTS
        </div>
      </div>

      <div className="fa-stage">
        <div className="fa-slide active">
          <div className="fa-hero">
            <div className="fa-hero-pill"><span className="fa-hero-pill-dot" />Build your agent</div>
            <div className="fa-agent-frame"><AtlasSingle width={50} height={72} /></div>
            <div className="fa-h-title">Let&apos;s build<br />your agent.</div>
            <p className="fa-hero-body">
              Hey there! I&apos;m <strong>Atlas</strong>{" "}from the Ambitt team. Tell me who you are and we&apos;ll get started.
            </p>
            <p className="fa-hero-body">
              The more detail you share over the next 5–10 minutes, the sharper your custom proposal will be — usually back in your inbox within 30 minutes.
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

            <div className="fa-toc">
              <div className="fa-toc-label">The 7-chapter brief</div>
              <div className="fa-toc-list">
                <div className="fa-toc-row"><div className="fa-toc-num">01</div><div className="fa-toc-body"><div className="fa-toc-name">About you</div><div className="fa-toc-desc">Quick facts so the proposal lands with the right person</div></div></div>
                <div className="fa-toc-row"><div className="fa-toc-num">02</div><div className="fa-toc-body"><div className="fa-toc-name">The one sentence</div><div className="fa-toc-desc">The agent&apos;s core job, in your own words</div></div></div>
                <div className="fa-toc-row"><div className="fa-toc-num">03</div><div className="fa-toc-body"><div className="fa-toc-name">The job, deeper</div><div className="fa-toc-desc">Success metrics, cadence, volume</div></div></div>
                <div className="fa-toc-row"><div className="fa-toc-num">04</div><div className="fa-toc-body"><div className="fa-toc-name">How it works</div><div className="fa-toc-desc">Channel, autonomy, voice</div></div></div>
                <div className="fa-toc-row"><div className="fa-toc-num">05</div><div className="fa-toc-body"><div className="fa-toc-name">Hard limits</div><div className="fa-toc-desc">Budget and what the agent should never do</div></div></div>
                <div className="fa-toc-row"><div className="fa-toc-num">06</div><div className="fa-toc-body"><div className="fa-toc-name">Tools</div><div className="fa-toc-desc">What the agent needs access to</div></div></div>
                <div className="fa-toc-row"><div className="fa-toc-num">07</div><div className="fa-toc-body"><div className="fa-toc-name">Review</div><div className="fa-toc-desc">Final check, then off to Atlas</div></div></div>
              </div>
            </div>

            <div className="fa-begin-wrap">
              <button
                type="button"
                className="fa-begin"
                onClick={begin}
                disabled={!canSubmit || submitting}
              >
                {submitting ? "Setting things up…" : "Let's begin"}
                {!submitting && <span className="fa-begin-arrow" aria-hidden="true">→</span>}
              </button>
            </div>
            <div className="fa-meta">5–10 minutes<span className="dot">·</span>Progress saved automatically</div>
          </div>
        </div>
      </div>
    </div>
  );
}
