"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Live status panel for the quote page — replaces the static "Quote not
// drafted yet" block. Unlike PRD, the quote pipeline has no instrumentation
// columns and no auto-retry cron, so all we can derive is:
//
//   • generating — prdApprovedAt set, no quoteDraft yet, elapsed < STALL.
//     Atlas's first pass takes ~1–2 min (lighter than PRD; no market research).
//   • stalled — prdApprovedAt set, no quoteDraft, elapsed > STALL. Atlas
//     either silently failed or this is taking unusually long. Surface the
//     manual trigger to give the operator an out.
//
// When quoteDraft lands (hasQuote flips true), router.refresh() so the parent
// server component re-fetches and renders the editor.

interface Props {
  prospectId: string;
  initialPrdApprovedAt: string | null;
  initialQuoteDraftPresent: boolean;
}

interface StatusPayload {
  hasQuote: boolean;
  prdApprovedAt: string | null;
  serverNow: string;
}

const POLL_INTERVAL_MS = 15_000;
const STALL_THRESHOLD_MS = 5 * 60_000;

type DerivedState =
  | { kind: "not_started" }
  | { kind: "generating"; elapsedMs: number }
  | { kind: "stalled"; elapsedMs: number };

function derive(payload: StatusPayload): DerivedState {
  if (!payload.prdApprovedAt) return { kind: "not_started" };
  const startMs = new Date(payload.prdApprovedAt).getTime();
  const nowMs = new Date(payload.serverNow).getTime();
  const elapsedMs = nowMs - startMs;
  if (elapsedMs < STALL_THRESHOLD_MS) return { kind: "generating", elapsedMs };
  return { kind: "stalled", elapsedMs };
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

export function QuoteProgress({
  prospectId,
  initialPrdApprovedAt,
  initialQuoteDraftPresent,
}: Props) {
  const router = useRouter();
  const [payload, setPayload] = useState<StatusPayload>(() => ({
    hasQuote: initialQuoteDraftPresent,
    prdApprovedAt: initialPrdApprovedAt,
    serverNow: new Date().toISOString(),
  }));
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/prospects/${prospectId}/quote-status`, {
          cache: "no-store",
        });
        if (!cancelled && res.ok) {
          const next = (await res.json()) as StatusPayload;
          setPayload(next);
          if (next.hasQuote) {
            router.refresh();
            return;
          }
          pollTimeoutRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) {
          pollTimeoutRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    };

    pollTimeoutRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [prospectId, router]);

  const state = derive(payload);

  if (state.kind === "not_started") {
    return (
      <Panel
        dot="bg-zinc-500"
        title="Waiting for PRD approval"
        subtitle="Atlas will start drafting the quote as soon as you approve the PRD."
        prospectId={prospectId}
        showManualTrigger={false}
      />
    );
  }

  if (state.kind === "generating") {
    return (
      <Panel
        dot="bg-amber-400 animate-pulse"
        title="Atlas is drafting the quote now"
        subtitle={
          <>
            Started <span className="text-foreground">{formatElapsed(state.elapsedMs)}</span> ago.
            <br />
            Quote drafts usually finish within 1–2 minutes. This page auto-refreshes when it&apos;s ready.
          </>
        }
        prospectId={prospectId}
        showManualTrigger={false}
      />
    );
  }

  // stalled
  return (
    <Panel
      dot="bg-red-500"
      title={`Quote stalled — Atlas hasn't responded in ${formatElapsed(state.elapsedMs)}`}
      subtitle={
        <>
          The auto-fire after PRD approval probably failed silently (no retry cron for quotes).
          Trigger a manual draft below; check Oracle logs if it keeps stalling.
        </>
      }
      prospectId={prospectId}
      showManualTrigger
    />
  );
}

function Panel({
  dot,
  title,
  subtitle,
  prospectId,
  showManualTrigger,
}: {
  dot: string;
  title: string;
  subtitle: React.ReactNode;
  prospectId: string;
  showManualTrigger: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-6">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 w-2 h-2 rounded-full ${dot} shrink-0`} aria-hidden />
        <div className="text-sm flex-1">
          <p className="text-foreground font-medium">{title}</p>
          <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{subtitle}</p>
          {showManualTrigger && (
            <form
              action={`/api/prospects/${prospectId}/quote-regenerate`}
              method="POST"
              className="mt-3"
            >
              <button
                type="submit"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/90 text-white hover:bg-amber-500"
              >
                Trigger Atlas draft now
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
