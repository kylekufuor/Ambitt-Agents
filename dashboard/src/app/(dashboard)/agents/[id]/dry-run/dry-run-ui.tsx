"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Capture {
  id: string;
  kind: string; // "email" | "composio" | "browse" | "other"
  payload: Record<string, unknown>;
  scenario: string | null;
  reviewedAt: string | null;
  reviewedOk: boolean | null;
  reviewNote: string | null;
  capturedAt: string;
}

interface Props {
  agentId: string;
  agentName: string;
  agentStatus: string;
  initialDryRun: boolean;
  initialCaptures: Capture[];
}

interface RunResult {
  scenarioLabel: string;
  response: string;
  error: string | null;
  toolsUsed: number;
  loopCount: number;
  elapsedMs: number;
  capturesCount: number;
}

export function DryRunUI({
  agentId,
  agentName,
  agentStatus,
  initialDryRun,
  initialCaptures,
}: Props) {
  const router = useRouter();
  const [dryRun, setDryRun] = useState(initialDryRun);
  const [captures, setCaptures] = useState<Capture[]>(initialCaptures);
  const [pending, startTransition] = useTransition();

  const [scenario, setScenario] = useState("");
  const [label, setLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  // Group captures by scenario label (most recent label first).
  const grouped = useMemo(() => {
    const groups = new Map<string, Capture[]>();
    for (const c of captures) {
      const key = c.scenario ?? "(no label)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return Array.from(groups.entries()).map(([scenarioLabel, items]) => ({
      label: scenarioLabel,
      items,
      latestAt: items.reduce(
        (max, i) => (new Date(i.capturedAt) > new Date(max) ? i.capturedAt : max),
        items[0].capturedAt
      ),
    })).sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
  }, [captures]);

  async function toggleDryRun(next: boolean) {
    const res = await fetch(`/api/agents/${agentId}/dry-run-toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setRunError(body.error ?? "Toggle failed");
      return;
    }
    setDryRun(next);
  }

  async function runScenario() {
    if (scenario.trim().length === 0) {
      setRunError("Scenario can't be empty");
      return;
    }
    if (!dryRun) {
      setRunError("Flip dry-run mode on first — Oracle will refuse otherwise");
      return;
    }
    setRunning(true);
    setRunError(null);
    setLastRun(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/dry-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: scenario.trim(),
          label: label.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRunError(body.error ?? `Run failed (${res.status})`);
        return;
      }

      setLastRun({
        scenarioLabel: body.scenarioLabel,
        response: body.response ?? "",
        error: body.error ?? null,
        toolsUsed: body.toolsUsed ?? 0,
        loopCount: body.loopCount ?? 0,
        elapsedMs: body.elapsedMs ?? 0,
        capturesCount: Array.isArray(body.captures) ? body.captures.length : 0,
      });

      // Prepend new captures to existing list
      if (Array.isArray(body.captures)) {
        const newOnes: Capture[] = body.captures.map((c: Record<string, unknown>) => ({
          id: c.id as string,
          kind: c.kind as string,
          payload: c.payload as Record<string, unknown>,
          scenario: (c.scenario as string) ?? null,
          reviewedAt: null,
          reviewedOk: null,
          reviewNote: null,
          capturedAt: c.capturedAt as string,
        }));
        setCaptures((prev) => [...newOnes, ...prev]);
      }

      setScenario("");
      setLabel("");
      startTransition(() => router.refresh());
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function review(logId: string, reviewedOk: boolean, note?: string) {
    const res = await fetch(`/api/agents/${agentId}/dry-run-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId, reviewedOk, note }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setRunError(body.error ?? "Review failed");
      return;
    }
    const updated = await res.json();
    setCaptures((prev) =>
      prev.map((c) =>
        c.id === logId
          ? { ...c, reviewedAt: updated.reviewedAt, reviewedOk: updated.reviewedOk, reviewNote: updated.reviewNote }
          : c
      )
    );
  }

  return (
    <div className="space-y-5">
      {/* DRY-RUN TOGGLE */}
      <div
        className={`border rounded-xl p-5 flex items-start justify-between gap-4 ${
          dryRun
            ? "bg-amber-500/8 border-amber-500/30"
            : "bg-card border-border"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full mt-1.5 ${
              dryRun ? "bg-amber-400 animate-pulse" : "bg-emerald-500"
            }`}
            aria-hidden
          />
          <div>
            <div className="text-sm font-medium text-foreground">
              {dryRun ? "Dry-run mode is ON" : "Live mode — side-effects fire for real"}
            </div>
            <div className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
              {dryRun ? (
                <>
                  <strong className="text-foreground">{agentName}</strong>'s email sends + write-like tool
                  calls are captured below instead of going out. Use the composer to run scenarios.
                </>
              ) : (
                <>
                  Any scenario you run will use real Gmail / Composio / Browserbase calls.
                  Switch to dry-run before testing prompt changes.
                </>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggleDryRun(!dryRun)}
          disabled={pending}
          className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors ${
            dryRun
              ? "bg-foreground text-background hover:bg-foreground/80"
              : "bg-amber-500 text-white hover:bg-amber-400"
          }`}
        >
          {dryRun ? "Flip to live mode" : "Enable dry-run"}
        </button>
      </div>

      {/* SCENARIO COMPOSER */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium text-foreground">Run a scenario</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {agentName} will treat this as an inbound message and respond. {agentStatus !== "active"
                ? <>Status is <span className="font-mono">{agentStatus}</span> — fine for dry-run.</>
                : null}
            </div>
          </div>
          {lastRun && (
            <div className="text-xs text-muted-foreground text-right">
              <div>
                Last: <span className="font-mono text-foreground">{lastRun.scenarioLabel}</span>
              </div>
              <div className="mt-0.5">
                {lastRun.toolsUsed} tool{lastRun.toolsUsed === 1 ? "" : "s"} · {lastRun.loopCount} loop
                {lastRun.loopCount === 1 ? "" : "s"} · {(lastRun.elapsedMs / 1000).toFixed(1)}s ·{" "}
                {lastRun.capturesCount} capture{lastRun.capturesCount === 1 ? "" : "s"}
              </div>
              {lastRun.error && <div className="text-red-400 mt-0.5">Error: {lastRun.error}</div>}
            </div>
          )}
        </div>

        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          rows={5}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-emerald-500/60 font-mono"
          placeholder={`e.g., "Find me 5 off-market industrial leads in Tulsa, 50–150k sqft, 80s vintage. Draft outreach for each."`}
          disabled={running || !dryRun}
        />

        <div className="flex items-center gap-3 mt-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            type="text"
            className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-emerald-500/60 w-72"
            placeholder="Optional label — e.g. 'CRE sourcing v3'"
            disabled={running || !dryRun}
          />

          <button
            type="button"
            onClick={runScenario}
            disabled={running || scenario.trim().length === 0 || !dryRun}
            className="text-xs font-semibold px-5 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          >
            {running ? "Running…" : "Run scenario →"}
          </button>
        </div>

        {!dryRun && (
          <div className="text-xs text-amber-400 mt-3">
            Enable dry-run mode above before running scenarios — Oracle will refuse otherwise.
          </div>
        )}
        {runError && <div className="text-xs text-red-400 mt-3">{runError}</div>}
        {lastRun && lastRun.response && (
          <details className="mt-4 group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              {agentName}'s response ({lastRun.response.length} chars) — click to expand
            </summary>
            <pre className="text-xs text-foreground bg-background border border-border rounded-lg p-3 mt-2 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
              {lastRun.response}
            </pre>
          </details>
        )}
      </div>

      {/* CAPTURE LIST */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-medium text-foreground">Captures</h2>
          <span className="text-xs text-muted-foreground">
            {captures.length} total · grouped by scenario
          </span>
        </div>

        {grouped.length === 0 ? (
          <div className="bg-card border border-border rounded-xl px-5 py-10 text-center">
            <p className="text-muted-foreground text-sm">No captures yet.</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Run a scenario above — anything {agentName} tries to send or write to a tool will appear here.
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <ScenarioGroup
              key={group.label}
              label={group.label}
              items={group.items}
              latestAt={group.latestAt}
              onReview={review}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ScenarioGroup({
  label,
  items,
  latestAt,
  onReview,
}: {
  label: string;
  items: Capture[];
  latestAt: string;
  onReview: (logId: string, ok: boolean, note?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const reviewed = items.filter((i) => i.reviewedAt !== null).length;
  const passed = items.filter((i) => i.reviewedOk === true).length;
  const failed = items.filter((i) => i.reviewedOk === false).length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-foreground/[0.03] transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              failed > 0
                ? "bg-red-500"
                : reviewed === items.length
                  ? "bg-emerald-500"
                  : "bg-amber-400"
            }`}
            aria-hidden
          />
          <span className="text-sm font-mono text-foreground truncate">{label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">
            {items.length} capture{items.length === 1 ? "" : "s"} · {reviewed}/{items.length}{" "}
            reviewed
            {passed > 0 && <span className="text-emerald-400"> · {passed} OK</span>}
            {failed > 0 && <span className="text-red-400"> · {failed} rejected</span>}
          </span>
          <span className="text-muted-foreground/60 text-xs">
            {open ? "▼" : "▶"}
          </span>
        </div>
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {items.map((cap) => (
            <CaptureCard key={cap.id} cap={cap} onReview={onReview} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaptureCard({
  cap,
  onReview,
}: {
  cap: Capture;
  onReview: (logId: string, ok: boolean, note?: string) => Promise<void>;
}) {
  const [noting, setNoting] = useState(false);
  const [noteText, setNoteText] = useState(cap.reviewNote ?? "");
  const ts = new Date(cap.capturedAt);

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-center gap-3 text-xs">
        <span className={`px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${kindColor(cap.kind)}`}>
          {cap.kind}
        </span>
        <span className="text-muted-foreground font-mono">
          {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
        <span className="text-muted-foreground/60 font-mono">{cap.id.slice(-8)}</span>
        <span className="ml-auto">
          {cap.reviewedAt && cap.reviewedOk === true && (
            <span className="text-emerald-400 text-xs">✓ Approved</span>
          )}
          {cap.reviewedAt && cap.reviewedOk === false && (
            <span className="text-red-400 text-xs">✗ Rejected</span>
          )}
        </span>
      </div>

      <CapturePayload cap={cap} />

      {cap.reviewNote && (
        <div className="text-xs text-muted-foreground bg-background border border-border rounded-md px-3 py-2 italic">
          Note: {cap.reviewNote}
        </div>
      )}

      <div className="flex items-center gap-2">
        {!cap.reviewedAt ? (
          <>
            <button
              type="button"
              onClick={() => onReview(cap.id, true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
            >
              Approve — would've been fine
            </button>
            <button
              type="button"
              onClick={() => onReview(cap.id, false)}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => setNoting((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              {noting ? "Cancel note" : "Add note"}
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">
              Reviewed {new Date(cap.reviewedAt).toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => onReview(cap.id, !cap.reviewedOk, cap.reviewNote ?? undefined)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              Flip verdict
            </button>
          </>
        )}
      </div>

      {noting && !cap.reviewedAt && (
        <div className="flex items-center gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            type="text"
            className="flex-1 bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-emerald-500/60"
            placeholder="Why this is wrong — Atlas reads notes when tuning the prompt"
          />
          <button
            type="button"
            onClick={() => onReview(cap.id, false, noteText)}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors"
          >
            Reject with note
          </button>
        </div>
      )}
    </div>
  );
}

function CapturePayload({ cap }: { cap: Capture }) {
  if (cap.kind === "email") {
    const to = String(cap.payload.to ?? "");
    const subject = String(cap.payload.subject ?? "(no subject)");
    const html = String(cap.payload.html ?? "");
    const emailType = cap.payload.emailType ? String(cap.payload.emailType) : null;
    return (
      <div className="bg-background border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-xs flex items-center gap-3 flex-wrap">
          <span className="text-muted-foreground">To:</span>
          <span className="text-foreground font-mono">{to}</span>
          {emailType && (
            <span className="ml-auto bg-foreground/10 text-foreground/80 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold">
              {emailType}
            </span>
          )}
        </div>
        <div className="px-4 py-2 border-b border-border text-sm font-medium text-foreground">
          {subject}
        </div>
        <div
          className="px-4 py-3 text-xs text-muted-foreground max-h-64 overflow-y-auto prose-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  }

  if (cap.kind === "composio") {
    const fullName = String(cap.payload.fullName ?? cap.payload.toolName ?? "(unknown)");
    const input = cap.payload.input as Record<string, unknown> | undefined;
    return (
      <div className="bg-background border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-xs flex items-center gap-3">
          <span className="text-muted-foreground">Tool:</span>
          <span className="text-foreground font-mono text-xs">{fullName}</span>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Input
          </div>
          <pre className="text-xs text-foreground bg-card border border-border rounded p-2 max-h-64 overflow-auto font-mono whitespace-pre-wrap">
            {JSON.stringify(input ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  // Generic fallback
  return (
    <pre className="text-xs text-foreground bg-background border border-border rounded-lg p-3 overflow-auto font-mono whitespace-pre-wrap max-h-64">
      {JSON.stringify(cap.payload, null, 2)}
    </pre>
  );
}

function kindColor(kind: string): string {
  switch (kind) {
    case "email":
      return "bg-blue-500/15 text-blue-300";
    case "composio":
      return "bg-emerald-500/15 text-emerald-300";
    case "browse":
      return "bg-purple-500/15 text-purple-300";
    default:
      return "bg-foreground/10 text-foreground/80";
  }
}
