"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ImprovementRow {
  id: string;
  status: string;
  sessionId: string | null;
  proposedPersonality: string | null;
  proposedPurpose: string | null;
  proposedNorthStar: string | null;
  proposedToolSlugs: string[] | null;
  rationale: string | null;
  previousPersonality: string | null;
  previousPurpose: string | null;
  previousNorthStar: string | null;
  regressionResults: unknown[];
  activitySummary: Record<string, unknown> | null;
  reviewedAt: string | null;
  reviewedNote: string | null;
  failureReason: string | null;
  costCents: number;
  budgetCents: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface Props {
  agentId: string;
  agentName: string;
  currentPersonality: string;
  currentPurpose: string;
  initial: ImprovementRow[];
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  ready: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  shipped: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  rejected: "bg-muted text-muted-foreground border-border",
  failed: "bg-red-500/10 text-red-300 border-red-500/30",
};

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function ImprovementsList({
  agentName,
  currentPersonality,
  currentPurpose,
  initial,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);

  async function act(id: string, action: "approve" | "reject" | "revert", note?: string) {
    setActing(id + action);
    setError(null);
    try {
      const res = await fetch(`/api/improvements/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "revert" ? undefined : JSON.stringify({ note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `${action} failed (${res.status})`);
        return;
      }
      // Refresh from server to pick up the new status + any prev* values.
      router.refresh();
      // Local optimistic update so the badge flips before refresh finishes.
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: action === "approve" ? "shipped" : action === "reject" ? "rejected" : "rejected",
                reviewedAt: new Date().toISOString(),
                reviewedNote: note ?? null,
              }
            : i
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setActing(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="border border-border bg-card rounded-xl p-8 text-center">
        <div className="text-sm text-muted-foreground">
          No improvement cycles yet for {agentName}. Atlas-Improver fires every Sunday at 02:00 UTC.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-border bg-card rounded-xl p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-medium text-foreground">Current prompt baseline</div>
          <button
            type="button"
            onClick={() => setShowCurrent((s) => !s)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showCurrent ? "Hide" : "Show"}
          </button>
        </div>
        {showCurrent && (
          <div className="mt-3 space-y-3 text-xs">
            <div>
              <div className="text-muted-foreground font-mono mb-1">personality</div>
              <pre className="text-foreground whitespace-pre-wrap bg-background border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
                {currentPersonality}
              </pre>
            </div>
            <div>
              <div className="text-muted-foreground font-mono mb-1">purpose</div>
              <pre className="text-foreground whitespace-pre-wrap bg-background border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
                {currentPurpose}
              </pre>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/8 border border-red-500/30 rounded-lg p-3">
          {error}
        </div>
      )}

      {items.map((i) => {
        const isReady = i.status === "ready";
        const isShipped = i.status === "shipped";
        const isPending = i.status === "pending";
        const isFailed = i.status === "failed";
        const summary = i.activitySummary as Record<string, unknown> | null;
        const summarized = summary && {
          conversations: summary.conversationCount as number | undefined,
          recommendations: summary.recommendationCount as number | undefined,
          approvalRate: summary.approvalRate as number | undefined,
          themes: (summary.topComplaintThemes as string[] | undefined) ?? [],
        };
        return (
          <div key={i.id} className="border border-border bg-card rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${STATUS_STYLE[i.status] ?? STATUS_STYLE.pending}`}
                >
                  {i.status}
                  {isPending && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-current ml-1.5 animate-pulse" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    Cycle {i.id.slice(-8)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {i.completedAt
                      ? `Completed ${ago(i.completedAt)} ago`
                      : i.startedAt
                      ? `Started ${ago(i.startedAt)} ago`
                      : `Queued ${ago(i.createdAt)} ago`}
                    {" · "}
                    {formatCost(i.costCents)} / {formatCost(i.budgetCents)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isReady && (
                  <>
                    <button
                      type="button"
                      onClick={() => act(i.id, "approve")}
                      disabled={acting !== null}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 transition-colors disabled:opacity-40"
                    >
                      {acting === i.id + "approve" ? "Shipping…" : "Approve + ship"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const note = prompt("Reason for rejecting (optional):") ?? undefined;
                        void act(i.id, "reject", note || undefined);
                      }}
                      disabled={acting !== null}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </>
                )}
                {isShipped && i.previousPersonality !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm("Revert this change? The agent's prompt will roll back to the previous version.")) return;
                      void act(i.id, "revert");
                    }}
                    disabled={acting !== null}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-40"
                  >
                    {acting === i.id + "revert" ? "Reverting…" : "Revert"}
                  </button>
                )}
              </div>
            </div>

            {isFailed && i.failureReason && (
              <div className="text-xs text-red-300 bg-red-500/8 border border-red-500/30 rounded-lg p-3">
                <div className="font-semibold mb-0.5">Failure reason</div>
                <div className="text-red-200/90">{i.failureReason}</div>
              </div>
            )}

            {summarized && (
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div className="border border-border bg-background rounded-lg p-2.5">
                  <div className="text-muted-foreground">Conversations</div>
                  <div className="text-foreground font-semibold mt-0.5">
                    {summarized.conversations ?? "—"}
                  </div>
                </div>
                <div className="border border-border bg-background rounded-lg p-2.5">
                  <div className="text-muted-foreground">Recommendations</div>
                  <div className="text-foreground font-semibold mt-0.5">
                    {summarized.recommendations ?? "—"}
                  </div>
                </div>
                <div className="border border-border bg-background rounded-lg p-2.5">
                  <div className="text-muted-foreground">Approval rate</div>
                  <div className="text-foreground font-semibold mt-0.5">
                    {typeof summarized.approvalRate === "number"
                      ? `${(summarized.approvalRate * 100).toFixed(0)}%`
                      : "—"}
                  </div>
                </div>
                <div className="border border-border bg-background rounded-lg p-2.5">
                  <div className="text-muted-foreground">Themes</div>
                  <div className="text-foreground text-[11px] mt-0.5 leading-tight">
                    {summarized.themes.length ? summarized.themes.slice(0, 2).join(", ") : "—"}
                  </div>
                </div>
              </div>
            )}

            {i.rationale && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Atlas-Improver's rationale</div>
                <div className="text-sm text-foreground bg-background border border-border rounded-lg p-3 leading-relaxed">
                  {i.rationale}
                </div>
              </div>
            )}

            {i.proposedPersonality && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Proposed personality</div>
                <pre className="text-xs text-foreground whitespace-pre-wrap bg-background border border-border rounded-lg p-3 max-h-64 overflow-y-auto">
                  {i.proposedPersonality}
                </pre>
              </div>
            )}

            {i.proposedPurpose && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Proposed purpose</div>
                <pre className="text-xs text-foreground whitespace-pre-wrap bg-background border border-border rounded-lg p-3 max-h-64 overflow-y-auto">
                  {i.proposedPurpose}
                </pre>
              </div>
            )}

            {i.regressionResults.length > 0 && (
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Regression scope: {i.regressionResults.length} prior captures
                </summary>
                <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap bg-background border border-border rounded-lg p-3 mt-2 max-h-48 overflow-y-auto font-mono">
                  {JSON.stringify(i.regressionResults, null, 2)}
                </pre>
              </details>
            )}

            {i.reviewedAt && (
              <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                Reviewed {ago(i.reviewedAt)} ago
                {i.reviewedNote && <> · "{i.reviewedNote}"</>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
