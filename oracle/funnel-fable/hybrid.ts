// oracle/funnel-fable/hybrid.ts
//
// One call-site abstraction for funnel tasks (proposal, PRD, quote drafting).
// The env flag FABLE_FUNNEL_ENABLED=true routes through Atlas-Funnel-on-Fable
// (oracle/funnel-fable/runner.ts); anything else falls through to the legacy
// Atlas-on-Sonnet path via processInboundMessage in shared/runtime.
//
// Output shape is identical: a single raw text string the caller parses for
// the JSON fence. Drop-in replacement at the three funnel call sites in
// oracle/index.ts (proposal generation, PRD generation, quote generation).
//
// Phase 6 validation plan: leave FABLE_FUNNEL_ENABLED off in production while
// we run Fable side-by-side on a synthetic test prospect. Once parity is
// validated, flip the env var; legacy stays in the code as a fallback until
// we've shipped 5+ live funnel runs on Fable without regression.

import logger from "../../shared/logger.js";
import type { FunnelTaskKind } from "./runner.js";

export interface FunnelTaskOpts {
  kind: FunnelTaskKind;
  // Legacy path: Atlas-Sonnet agent ID. Required even when Fable is
  // enabled — we fall back if Fable errors mid-task.
  legacyAgentId: string;
  prospectId: string;
  // Email of the (real or synthetic) sender for the legacy runtime engine.
  senderEmail: string;
  threadId: string;
  userMessage: string;
}

export interface FunnelTaskResult {
  responseText: string;
  // Which path actually produced the result. Useful for telemetry + so the
  // caller knows whether usage was logged via the standard ApiUsage path
  // (Sonnet) or needs separate Fable-cost attribution (Fable).
  via: "fable" | "sonnet";
  // Only set on the fable path.
  sessionId?: string;
}

function isFableEnabled(): boolean {
  return process.env.FABLE_FUNNEL_ENABLED === "true";
}

async function runLegacy(opts: FunnelTaskOpts): Promise<FunnelTaskResult> {
  const { processInboundMessage } = await import("../../shared/runtime/index.js");
  const result = await processInboundMessage({
    agentId: opts.legacyAgentId,
    userMessage: opts.userMessage,
    channel: "chat",
    threadId: opts.threadId,
    senderEmail: opts.senderEmail,
    billable: false,
  });
  return { responseText: result.response, via: "sonnet" };
}

export async function runFunnelTask(opts: FunnelTaskOpts): Promise<FunnelTaskResult> {
  if (!isFableEnabled()) {
    return runLegacy(opts);
  }

  // Try Fable; on any error, fall back to Sonnet so the prospect's
  // proposal/PRD/quote still lands. We don't want the migration to break
  // the funnel during validation.
  try {
    const { runFableFunnelTask } = await import("./runner.js");
    const r = await runFableFunnelTask({
      kind: opts.kind,
      userMessage: opts.userMessage,
      prospectId: opts.prospectId,
    });
    return { responseText: r.responseText, via: "fable", sessionId: r.sessionId };
  } catch (err) {
    logger.error("Fable funnel task failed; falling back to Sonnet path", {
      kind: opts.kind,
      prospectId: opts.prospectId,
      err: err instanceof Error ? err.message : String(err),
    });
    return runLegacy(opts);
  }
}

export default { runFunnelTask };
