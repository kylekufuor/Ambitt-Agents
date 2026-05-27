"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Live status panel for the PRD page — replaces the static "PRD not generated
// yet" block with three derived states:
//
//   • generating — last attempt set, not too long ago, no terminal state yet.
//     Atlas's first pass takes ~2–3 min so we poll every 15s during this window.
//   • retry_queued — first attempt failed (or stalled past STALL_THRESHOLD)
//     and we're under MAX_ATTEMPTS; the cron picks it back up every 15 min.
//   • failed — explicit failure timestamp OR attempts hit the cap.
//
// When the PRD lands (hasPRD flips true), we router.refresh() so the parent
// server component re-fetches and renders the iframe.

interface Props {
  prospectId: string;
  initialAttempts: number;
  initialLastAttemptAt: string | null;
  initialFailedAt: string | null;
}

interface StatusPayload {
  hasPRD: boolean;
  attempts: number;
  lastAttemptAt: string | null;
  generatedAt: string | null;
  failedAt: string | null;
  serverNow: string;
}

const POLL_INTERVAL_GENERATING_MS = 15_000;
const POLL_INTERVAL_RETRY_MS = 60_000;
const STALL_THRESHOLD_MS = 5 * 60_000; // 5 min — Atlas + market-research budget
const RETRY_CRON_INTERVAL_MIN = 15;
const MAX_ATTEMPTS = 3;

type DerivedState =
  | { kind: "not_started" }
  | { kind: "generating"; elapsedMs: number; attempt: number }
  | { kind: "retry_queued"; nextRetryInMin: number; attempt: number }
  | { kind: "failed"; attempts: number; reason: "explicit" | "max_attempts" };

function derive(payload: StatusPayload): DerivedState {
  // Explicit failure flag always wins.
  if (payload.failedAt) {
    return { kind: "failed", attempts: payload.attempts, reason: "explicit" };
  }

  // No attempt logged yet — Atlas hasn't been triggered (or hasn't written its
  // first attempt row). Rare, but show a neutral state instead of "generating"
  // with elapsed = NaN.
  if (!payload.lastAttemptAt) {
    return { kind: "not_started" };
  }

  const lastAttemptMs = new Date(payload.lastAttemptAt).getTime();
  const nowMs = new Date(payload.serverNow).getTime();
  const elapsedMs = nowMs - lastAttemptMs;

  // Still inside the generation window for this attempt.
  if (elapsedMs < STALL_THRESHOLD_MS) {
    return { kind: "generating", elapsedMs, attempt: payload.attempts };
  }

  // Past the window. If we've used all our attempts, treat as failed.
  if (payload.attempts >= MAX_ATTEMPTS) {
    return { kind: "failed", attempts: payload.attempts, reason: "max_attempts" };
  }

  // Stalled but the cron will pick it up. Estimate when.
  const elapsedMin = elapsedMs / 60_000;
  const nextRetryInMin = Math.max(1, Math.ceil(RETRY_CRON_INTERVAL_MIN - (elapsedMin % RETRY_CRON_INTERVAL_MIN)));
  return { kind: "retry_queued", nextRetryInMin, attempt: payload.attempts };
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

export function PRDProgress({
  prospectId,
  initialAttempts,
  initialLastAttemptAt,
  initialFailedAt,
}: Props) {
  const router = useRouter();
  const [payload, setPayload] = useState<StatusPayload>(() => ({
    hasPRD: false,
    attempts: initialAttempts,
    lastAttemptAt: initialLastAttemptAt,
    generatedAt: null,
    failedAt: initialFailedAt,
    serverNow: new Date().toISOString(),
  }));
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll loop. Schedules the next tick from the previous one so we don't stack
  // intervals across fast/slow networks. Cleared on unmount.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/prospects/${prospectId}/prd-status`, {
          cache: "no-store",
        });
        if (!cancelled && res.ok) {
          const next = (await res.json()) as StatusPayload;
          setPayload(next);

          // PRD just landed — kick the server component to re-fetch + render
          // the iframe. We don't need to keep polling after that.
          if (next.hasPRD) {
            router.refresh();
            return;
          }

          // Schedule next tick based on derived state.
          const derived = derive(next);
          const interval =
            derived.kind === "generating"
              ? POLL_INTERVAL_GENERATING_MS
              : derived.kind === "retry_queued"
                ? POLL_INTERVAL_RETRY_MS
                : POLL_INTERVAL_GENERATING_MS; // not_started / failed → still poll slowly in case it changes
          pollTimeoutRef.current = setTimeout(tick, interval);
        }
      } catch {
        // Swallow — next tick will retry. Don't show errors here; the panel
        // already conveys state and the user can refresh manually.
        if (!cancelled) {
          pollTimeoutRef.current = setTimeout(tick, POLL_INTERVAL_GENERATING_MS);
        }
      }
    };

    pollTimeoutRef.current = setTimeout(tick, POLL_INTERVAL_GENERATING_MS);
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
        title="Waiting for Atlas to start"
        subtitle="The PRD job hasn't been queued yet. If the prospect approved scope just now, give it a moment."
      />
    );
  }

  if (state.kind === "generating") {
    return (
      <Panel
        dot="bg-amber-400 animate-pulse"
        title="Atlas is generating the PRD now"
        subtitle={
          <>
            Started <span className="text-foreground">{formatElapsed(state.elapsedMs)}</span> ago
            {state.attempt > 1 && <> · Attempt {state.attempt} of {MAX_ATTEMPTS}</>}
            <br />
            Expected to finish within 2–3 minutes. This page auto-refreshes when it&apos;s ready.
          </>
        }
      />
    );
  }

  if (state.kind === "retry_queued") {
    return (
      <Panel
        dot="bg-sky-400"
        title={`Attempt ${state.attempt} stalled — retry queued`}
        subtitle={
          <>
            Atlas&apos;s last attempt didn&apos;t complete. The auto-retry cron will pick it up
            in roughly <span className="text-foreground">{state.nextRetryInMin} min</span>
            {state.attempt < MAX_ATTEMPTS && <> ({MAX_ATTEMPTS - state.attempt} attempts remaining)</>}.
          </>
        }
      />
    );
  }

  // failed
  return (
    <Panel
      dot="bg-red-500"
      title={
        state.reason === "explicit"
          ? "PRD generation failed"
          : `PRD generation failed after ${state.attempts} attempts`
      }
      subtitle={
        <>
          Atlas hit a wall. Check Oracle logs for the final-attempt error.
          {state.reason === "max_attempts" && (
            <> All {MAX_ATTEMPTS} retries are exhausted; manual intervention required.</>
          )}
        </>
      }
    />
  );
}

function Panel({
  dot,
  title,
  subtitle,
}: {
  dot: string;
  title: string;
  subtitle: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-6">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 w-2 h-2 rounded-full ${dot} shrink-0`} aria-hidden />
        <div className="text-sm">
          <p className="text-foreground font-medium">{title}</p>
          <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
