// ---------------------------------------------------------------------------
// Oracle wiring for operator surfaces — one host, one POST path, one action map
// ---------------------------------------------------------------------------
// Three defects from the 2026-07 SRE audit are fixed by centralising this:
//
//  1. DEAD HOST. Six call sites fell back to
//     `https://ambitt-agents-production.up.railway.app`, a Railway edge that
//     404s everything. Oracle lives at ORACLE_URL_FALLBACK below. One constant
//     now, so it can only ever be wrong in one place.
//
//  2. SILENT FAILURE. Those call sites did `await fetch(...)` then `redirect(...)`
//     without reading the response, so a failed Pause looked exactly like a
//     successful one. postOracle() returns a result the caller must act on;
//     opErrorHref() carries the message back to the page as `?opError=`.
//
//  3. RESUME ≠ APPROVE. The Resume button posted to /agents/:id/approve, which
//     re-runs first-time activation: it flips dryRun off, re-sends the welcome
//     email + brief + PDF, re-scans the site and re-enqueues the T+3/7/14 drip
//     — i.e. it re-spams a client whose agent was paused FOR spamming, and
//     disarms containment. agentActionRequest() maps "resume" to the real
//     /agents/:id/resume endpoint (which honours pause authority and clears
//     pausedBy/pausedReason/pausedAt) and leaves "approve" for genuine
//     first-time approval of a pending_approval agent.
//
// No automatic retry here, deliberately: these are non-idempotent operator
// commands (`run` starts a billable agent run). A failed action surfaces to the
// operator, who retries with intent.
// ---------------------------------------------------------------------------

export const ORACLE_URL_FALLBACK = "https://oracle-production-c0ff.up.railway.app";

/** Server-side Oracle base (server components, server actions, route handlers). */
export function oracleUrl(): string {
  return process.env.ORACLE_URL ?? ORACLE_URL_FALLBACK;
}

/** Browser-side Oracle base (client components fetching Oracle directly). */
export function publicOracleUrl(): string {
  return process.env.NEXT_PUBLIC_ORACLE_URL ?? ORACLE_URL_FALLBACK;
}

export interface OracleRequest {
  path: string;
  body?: Record<string, unknown>;
}

export interface OracleActionResult {
  ok: boolean;
  /** Operator-readable failure; null when ok. */
  error: string | null;
}

// Everything an operator surface is allowed to POST at /agents/:id/*. An
// unknown action is rejected rather than proxied — `action` comes off a form
// field, and this is the only thing standing between it and a path we build by
// string concatenation.
const AGENT_ACTIONS = new Set([
  "run",
  "pause",
  "resume",
  "approve",
  "reject",
  "kill",
  "send-tools-invite",
]);

/**
 * Map an operator action to its Oracle request. PURE.
 *
 * `pause`/`resume` declare operator authority in the body — Oracle treats any
 * caller that doesn't say "operator" as a client, and a client can neither lift
 * a system (spike / seatbelt / budget) halt nor place one that sticks.
 * Returns null for an action this surface doesn't own.
 */
export function agentActionRequest(agentId: string, action: string): OracleRequest | null {
  if (!AGENT_ACTIONS.has(action)) return null;
  const id = encodeURIComponent(agentId);
  switch (action) {
    case "resume":
      return { path: `/agents/${id}/resume`, body: { requester: "operator" } };
    case "pause":
      return {
        path: `/agents/${id}/pause`,
        body: { by: "operator", reason: "Paused by operator from the dashboard" },
      };
    default:
      return { path: `/agents/${id}/${action}` };
  }
}

/** Longest error we'll push through a query string. */
const MAX_ERROR_CHARS = 220;

function readError(status: number, statusText: string, raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error.length > 0) {
        return `${status}: ${parsed.error}`;
      }
    } catch {
      /* not JSON after all — fall through to the raw body */
    }
  }
  const detail = trimmed.length > 0 ? trimmed : statusText;
  return `${status}${detail ? `: ${detail}` : ""}`;
}

/** POST an operator action to Oracle. Never throws; never reports a lie. */
export async function postOracle(req: OracleRequest): Promise<OracleActionResult> {
  try {
    const res = await fetch(`${oracleUrl()}${req.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: req.body ? JSON.stringify(req.body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      return {
        ok: false,
        error: `${req.path} failed — ${readError(res.status, res.statusText, raw)}`.slice(0, MAX_ERROR_CHARS),
      };
    }
    return { ok: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `${req.path} — Oracle unreachable: ${message}`.slice(0, MAX_ERROR_CHARS) };
  }
}

/**
 * Where to send the operator after an action. PURE.
 * Success → the plain page. Failure → the page carrying the message, so the
 * banner can render it (a thrown Server Function error is redacted to a digest
 * in production, which tells the operator nothing).
 */
export function opErrorHref(basePath: string, error: string | null | undefined): string {
  if (!error) return basePath;
  return `${basePath}?opError=${encodeURIComponent(error.slice(0, MAX_ERROR_CHARS))}`;
}

/** Read `?opError=` out of a page's searchParams. PURE. */
export function readOpError(
  searchParams: Record<string, string | string[] | undefined> | undefined
): string | null {
  const raw = searchParams?.opError;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim().length > 0 ? value.slice(0, MAX_ERROR_CHARS) : null;
}
