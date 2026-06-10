"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// BuildPanel — the Fable build report that sits above the existing dry-run
// composer + captures on /agents/[id]/dry-run. Lives only when there's an
// Atlas-on-Fable Build row tied to the agent (server side passes initial
// snapshot; this component polls every 5s while the build is running).
//
// Hybrid UX: the captures Atlas's tester sub-agents produced render in the
// EXISTING capture list below (they're DryRunLog rows tagged with the build's
// scenarioId). This panel adds the build-level overlay: status, scenarios,
// Vera verdicts, cost vs budget, plus the "Skip Fable, go manual" escape and
// a Cancel button while running.

export interface BuildScenario {
  id: string;
  label: string;
  inboundMessage: string;
  expectedOutcome: string;
  category: "happy_path" | "edge_case" | "error_handling";
}

export interface VeraVerdict {
  captureId: string;
  scenarioId: string | null;
  verdict: "approve" | "reject";
  issues: Array<{ field: string; problem: string; fix: string }>;
  notes: string | null;
  writtenAt: string;
}

export interface BuildSnapshot {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  prospectId: string;
  agentId: string | null;
  sessionId: string | null;
  environmentId: string | null;
  scenarios: BuildScenario[];
  veraVerdicts: VeraVerdict[];
  costCents: number;
  budgetCents: number;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface Props {
  initialBuild: BuildSnapshot;
  agentId: string;
  prospectToken?: string | null;
}

const ACTIVE_STATUSES: BuildSnapshot["status"][] = ["queued", "running"];

const STATUS_STYLE: Record<BuildSnapshot["status"], string> = {
  queued: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  running: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  completed: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  failed: "bg-red-500/10 text-red-300 border-red-500/30",
  cancelled: "bg-amber-500/10 text-amber-300 border-amber-500/30",
};

const STATUS_LABEL: Record<BuildSnapshot["status"], string> = {
  queued: "Queued",
  running: "Building",
  completed: "Ready for review",
  failed: "Failed",
  cancelled: "Cancelled",
};

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function relativeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function BuildPanel({ initialBuild, prospectToken }: Props) {
  const [build, setBuild] = useState<BuildSnapshot>(initialBuild);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/builds/${build.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as BuildSnapshot;
      setBuild(data);
    } catch {
      // Transient — ignore, next tick retries.
    }
  }, [build.id]);

  // Poll while active. Stop polling once terminal.
  useEffect(() => {
    if (!ACTIVE_STATUSES.includes(build.status)) return;
    const interval = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [build.status, refresh]);

  async function cancel() {
    if (!confirm("Cancel this build? Atlas will be archived and the candidate agent left in dryRun.")) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/builds/${build.id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Cancel failed (${res.status})`);
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  const approvedCount = build.veraVerdicts.filter((v) => v.verdict === "approve").length;
  const rejectedCount = build.veraVerdicts.filter((v) => v.verdict === "reject").length;
  const reviewedCount = build.veraVerdicts.length;

  const scenarioCount = build.scenarios.length;
  const costPct = Math.min(100, Math.round((build.costCents / Math.max(1, build.budgetCents)) * 100));
  const costNearCap = costPct >= 80;

  return (
    <div className="border border-border bg-card rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${STATUS_STYLE[build.status]}`}
          >
            {STATUS_LABEL[build.status]}
            {ACTIVE_STATUSES.includes(build.status) && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current ml-1.5 animate-pulse" />
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">Atlas-on-Fable build</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {build.status === "running" || build.status === "queued"
                ? `Started ${relativeAgo(build.startedAt ?? build.createdAt)} · build ${build.id.slice(-8)}`
                : build.completedAt
                ? `Ended ${relativeAgo(build.completedAt)} · build ${build.id.slice(-8)}`
                : `Build ${build.id.slice(-8)}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ACTIVE_STATUSES.includes(build.status) && (
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-40"
            >
              {cancelling ? "Cancelling…" : "Cancel build"}
            </button>
          )}
          {!ACTIVE_STATUSES.includes(build.status) && prospectToken && (
            <Link
              href={`/prospects/${build.prospectId}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              Skip Fable, go manual →
            </Link>
          )}
        </div>
      </div>

      {/* Cost + budget */}
      <div>
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>Cost</span>
          <span
            className={`font-mono ${costNearCap && build.status !== "completed" ? "text-amber-400" : "text-foreground"}`}
          >
            {formatCost(build.costCents)} / {formatCost(build.budgetCents)} ({costPct}%)
          </span>
        </div>
        <div className="h-1.5 bg-background border border-border rounded-full mt-1.5 overflow-hidden">
          <div
            className={`h-full transition-all ${costNearCap ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${costPct}%` }}
          />
        </div>
      </div>

      {/* Scenarios + verdicts summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border rounded-lg p-3 bg-background">
          <div className="text-xs text-muted-foreground">Scenarios</div>
          <div className="text-lg font-semibold text-foreground mt-0.5">{scenarioCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {scenarioCount === 0 ? "Pending" : "From Story-writer"}
          </div>
        </div>
        <div className="border border-border rounded-lg p-3 bg-background">
          <div className="text-xs text-muted-foreground">Vera approved</div>
          <div className="text-lg font-semibold text-emerald-400 mt-0.5">{approvedCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            of {reviewedCount} reviewed
          </div>
        </div>
        <div className="border border-border rounded-lg p-3 bg-background">
          <div className="text-xs text-muted-foreground">Vera rejected</div>
          <div
            className={`text-lg font-semibold mt-0.5 ${rejectedCount > 0 ? "text-red-400" : "text-foreground"}`}
          >
            {rejectedCount}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {rejectedCount > 0 ? "Needs your eyes" : "All clear so far"}
          </div>
        </div>
      </div>

      {/* Failure reason */}
      {build.failureReason && (
        <div className="text-xs text-red-300 bg-red-500/8 border border-red-500/30 rounded-lg p-3">
          <div className="font-semibold mb-0.5">Failure reason</div>
          <div className="text-red-200/90">{build.failureReason}</div>
        </div>
      )}

      {/* Scenarios list (collapsible) */}
      {scenarioCount > 0 && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
            {scenarioCount} scenarios — click to expand
          </summary>
          <div className="mt-3 space-y-2">
            {build.scenarios.map((s) => {
              // Match verdicts by scenarioId where the writer recorded it.
              const verdicts = build.veraVerdicts.filter((v) => v.scenarioId === s.id);
              const approved = verdicts.filter((v) => v.verdict === "approve").length;
              const rejected = verdicts.filter((v) => v.verdict === "reject").length;
              return (
                <div
                  key={s.id}
                  className="border border-border rounded-lg p-3 bg-background text-xs"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-foreground font-medium">
                      <span className="text-muted-foreground font-mono mr-2">{s.id}</span>
                      {s.label}
                    </div>
                    <div className="text-muted-foreground font-mono shrink-0">
                      {s.category}
                    </div>
                  </div>
                  <div className="text-muted-foreground mt-1 leading-relaxed">
                    Expected: {s.expectedOutcome}
                  </div>
                  {verdicts.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                      {approved > 0 && (
                        <span className="text-emerald-400">✓ {approved} approved</span>
                      )}
                      {rejected > 0 && (
                        <span className="text-red-400">✗ {rejected} rejected</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}
