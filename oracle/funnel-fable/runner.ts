// oracle/funnel-fable/runner.ts
//
// Synchronous one-shot runner for funnel tasks (proposal, PRD, quote drafting)
// on Atlas-Funnel-on-Fable. Opens a Managed Agents session, sends the prompt,
// streams events until session.status_idle, extracts the final agent text,
// archives the session, returns the raw text.
//
// Used by oracle/index.ts when `process.env.FABLE_FUNNEL_ENABLED === "true"`.
// The Sonnet-via-runtime path stays as the fallback during the validation
// period; the env flag flips the routing decision in one place.
//
// Failure modes (all caught by the caller):
//   - ATLAS_FUNNEL_FABLE_AGENT_ID unset       → throws
//   - Managed Agents API error                → throws (caller falls back)
//   - SSE stream closes without agent.message → throws "no response"
//   - Stale session (timeout passed)          → throws + session archived

import logger from "../../shared/logger.js";
import {
  archiveSession,
  createEnvironment,
  createSession,
  sendUserMessage,
  streamSession,
  FABLE_MODEL_ID,
} from "../../shared/managed-agents/index.js";

const ATLAS_FUNNEL_FABLE_AGENT_ID = () => process.env.ATLAS_FUNNEL_FABLE_AGENT_ID;
const SHARED_ENV_ID = () => process.env.FABLE_ENVIRONMENT_ID;

// Funnel tasks are one-shot. If we don't see a response within 5 minutes
// something is wrong — the legacy Sonnet path takes ~30-60s typically.
const FUNNEL_TIMEOUT_MS = Number(process.env.FABLE_FUNNEL_TIMEOUT_MS ?? "300000");

export type FunnelTaskKind = "proposal" | "prd" | "quote";

export interface FunnelRunResult {
  responseText: string;
  sessionId: string;
  elapsedMs: number;
}

async function ensureEnvironment(): Promise<string> {
  const cached = SHARED_ENV_ID();
  if (cached) return cached;
  logger.info("Creating Fable shared environment (first funnel call)");
  const env = await createEnvironment({
    name: "ambitt-fable-shared",
    description: "Shared sandbox for Atlas-on-Fable runs",
    config: { type: "cloud", networking: { type: "unrestricted" } },
    metadata: { service: "ambitt-agents" },
  });
  logger.warn(
    `Created Fable environment ${env.id}. Set FABLE_ENVIRONMENT_ID=${env.id} on Railway to reuse.`
  );
  return env.id;
}

export async function runFableFunnelTask(opts: {
  kind: FunnelTaskKind;
  userMessage: string;
  prospectId: string;
}): Promise<FunnelRunResult> {
  const agentId = ATLAS_FUNNEL_FABLE_AGENT_ID();
  if (!agentId) {
    throw new Error(
      "ATLAS_FUNNEL_FABLE_AGENT_ID not set; cannot run funnel task on Fable. Set it via scripts/seed-fable-agents.ts output or unset FABLE_FUNNEL_ENABLED."
    );
  }

  const startedAt = Date.now();
  const environmentId = await ensureEnvironment();

  const session = await createSession({
    agent: agentId,
    environment_id: environmentId,
    title: `Funnel ${opts.kind} for prospect ${opts.prospectId}`,
    metadata: {
      prospectId: opts.prospectId,
      taskKind: opts.kind,
      model: FABLE_MODEL_ID,
      purpose: "funnel",
    },
  });

  logger.info("Fable funnel session opened", {
    sessionId: session.id,
    prospectId: opts.prospectId,
    kind: opts.kind,
  });

  // Set up timeout + abort. AbortController lets us cancel the stream on
  // timeout without leaving a half-consumed SSE connection.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FUNNEL_TIMEOUT_MS);

  try {
    await sendUserMessage(session.id, opts.userMessage);

    // Collect ALL agent.message text blocks until session.status_idle.
    // Funnel tasks may stream their JSON in chunks; concat in order.
    let responseText = "";
    let sawIdle = false;
    try {
      for await (const event of streamSession(session.id, { signal: controller.signal })) {
        if (event.type === "agent.message" && Array.isArray(event.content)) {
          for (const block of event.content) {
            if (
              block &&
              typeof block === "object" &&
              (block as { type?: string }).type === "text" &&
              typeof (block as { text?: unknown }).text === "string"
            ) {
              responseText += (block as { text: string }).text;
            }
          }
        } else if (
          event.type === "session.status_idle" ||
          event.type === "session.completed"
        ) {
          sawIdle = true;
          break;
        } else if (event.type === "session.status_failed" || event.type === "session.failed") {
          throw new Error(`Fable session ${session.id} reported failed status`);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Fable funnel task timed out after ${FUNNEL_TIMEOUT_MS}ms`);
      }
      throw err;
    }

    if (!sawIdle) {
      logger.warn("Fable funnel stream ended without idle event", {
        sessionId: session.id,
        prospectId: opts.prospectId,
        responseLen: responseText.length,
      });
    }

    if (responseText.length === 0) {
      throw new Error("Fable funnel session returned no agent.message text");
    }

    const elapsedMs = Date.now() - startedAt;
    logger.info("Fable funnel session complete", {
      sessionId: session.id,
      prospectId: opts.prospectId,
      kind: opts.kind,
      elapsedMs,
      responseLen: responseText.length,
    });

    return { responseText, sessionId: session.id, elapsedMs };
  } finally {
    clearTimeout(timer);
    // Archive the session whether it succeeded or failed — these are one-shot.
    void archiveSession(session.id).catch((err) =>
      logger.warn("Fable funnel session archive failed", {
        sessionId: session.id,
        err: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

export default { runFableFunnelTask };
