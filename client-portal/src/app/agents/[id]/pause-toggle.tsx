"use client";

import { useState, useTransition, type SVGProps } from "react";
import { useRouter } from "next/navigation";

/* Small local duotone icons — same recipe as components/icons.tsx (soft filled
   base @ 0.2, crisp detail, a white highlight @ 0.55). Kept local on purpose:
   these two glyphs are specific to this control, not part of the shared set.
   currentColor flows from the button, so they read white on the brand button
   and slate on the secondary one. */
type GlyphProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, "width" | "height">;

function PlayGlyph({ size = 16, ...rest }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.2" />
      <path d="M10.2 8.35a1 1 0 0 1 1.53-.85l4.15 2.72a1 1 0 0 1 0 1.67l-4.15 2.72a1 1 0 0 1-1.53-.84V8.35Z" fill="currentColor" />
      <path d="M8 5.6a.7.7 0 0 1 .28 1.34A6.7 6.7 0 0 0 6 9.1a.7.7 0 0 1-1.16-.78A8.1 8.1 0 0 1 8 5.6Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

function PauseGlyph({ size = 16, ...rest }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.2" />
      <rect x="8.4" y="8" width="2.6" height="8" rx="1.1" fill="currentColor" />
      <rect x="13" y="8" width="2.6" height="8" rx="1.1" fill="currentColor" />
      <path d="M8 5.6a.7.7 0 0 1 .28 1.34A6.7 6.7 0 0 0 6 9.1a.7.7 0 0 1-1.16-.78A8.1 8.1 0 0 1 8 5.6Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function PauseToggle({ agentId, status }: { agentId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaused = status === "paused";
  const isActive = status === "active";
  const canToggle = isPaused || isActive;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const endpoint = isPaused ? "resume" : "pause";
      const res = await fetch(`/api/agents/${agentId}/${endpoint}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "That didn't go through — mind trying again?");
      } else {
        startTransition(() => router.refresh());
      }
    } catch {
      setError("We couldn't reach the agent just now. Give it another try in a moment.");
    } finally {
      setBusy(false);
    }
  }

  // States we can't act on from here — say what's actually happening, warmly.
  if (!canToggle) {
    return (
      <span className="pill pill-muted">
        {status === "pending_approval" || status === "building"
          ? "Still being set up"
          : status === "killed"
            ? "Offboarded"
            : "Unavailable right now"}
      </span>
    );
  }

  const working = busy || pending;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={working}
        className={`inline-flex items-center gap-2 h-9 px-4 rounded-[var(--radius)] text-[13.5px] font-medium transition disabled:opacity-60 disabled:cursor-not-allowed ${
          isPaused
            ? "text-white bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] shadow-[var(--brand-shadow)]"
            : "bg-[color:var(--surface)] text-[color:var(--text-2)] border border-[color:var(--border-strong)] hover:border-[color:var(--text-3)] hover:text-[color:var(--text)]"
        }`}
      >
        {isPaused ? <PlayGlyph size={16} /> : <PauseGlyph size={16} />}
        {working ? (isPaused ? "Bringing it back…" : "Pausing…") : isPaused ? "Resume agent" : "Pause agent"}
      </button>
      {error && (
        <span className="text-[12px] text-[color:var(--red)] max-w-[220px] text-right leading-snug">
          {error}
        </span>
      )}
    </div>
  );
}
