import { Stagehand } from "@browserbasehq/stagehand";
import prisma from "../db.js";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// browse — Stagehand-on-Browserbase browser agent (single-tool shape)
// ---------------------------------------------------------------------------
// Claude calls this with a single natural-language goal. Stagehand's internal
// agent() loop handles the multi-step act/observe/extract dance. We don't
// expose the granular primitives — fewer tokens, less orchestration overhead,
// and Stagehand already does sub-task model routing better than we would.
//
// Session lifecycle per call:
//   1. Create `BrowserSession` row (status="running").
//   2. `new Stagehand({ env: "BROWSERBASE" }).init()` — spins up a remote
//      Chrome on Browserbase. Capture their session id for the audit row.
//   3. `stagehand.agent({ model }).execute({ instruction, signal, maxSteps })`
//      — Stagehand drives the browser with its own LLM (Sonnet here). Time
//      cap enforced via AbortController.
//   4. `stagehand.close()` always runs in finally.
//   5. Update the row: status, durationMs, resultSummary, errorMessage.
//
// Return to Claude: compact text summary (Stagehand's own `message` +
// action count + success flag). The full actions array + page-level HTML
// never reach Claude — blow-up risk otherwise.
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — matches scope-doc cap
const DEFAULT_MAX_STEPS = 25;

export interface RunBrowserTaskInput {
  agentId: string;
  clientId: string;
  goal: string;
  startingUrl?: string;
}

export interface RunBrowserTaskResult {
  status: "success" | "failed" | "timeout";
  message: string;           // text returned to Claude
  sessionRowId: string;
  browserbaseSessionId?: string;
  durationMs: number;
  actionCount: number;
}

export async function runBrowserTask(input: RunBrowserTaskInput): Promise<RunBrowserTaskResult> {
  const { agentId, clientId, goal, startingUrl } = input;

  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    throw new Error("BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set");
  }
  if (!goal || goal.trim().length === 0) {
    throw new Error("browse: goal is required");
  }

  const row = await prisma.browserSession.create({
    data: {
      agentId,
      clientId,
      goal: goal.slice(0, 2000),
      startingUrl: startingUrl ?? null,
      status: "running",
    },
    select: { id: true, startedAt: true },
  });

  const startedAt = row.startedAt;

  let stagehand: Stagehand | null = null;
  let status: RunBrowserTaskResult["status"] = "failed";
  let message = "";
  let actionCount = 0;
  let browserbaseSessionId: string | undefined;
  let errorMessage: string | undefined;

  try {
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      verbose: 0,
    });
    await stagehand.init();
    browserbaseSessionId = stagehand.browserbaseSessionID;

    const agent = stagehand.agent({
      // "provider/model-id" format. Sonnet 4-5 is the Stagehand-tested model
      // for agent mode (2026-04-27). 4-6 consistently produced
      // AI_NoObjectGeneratedError in probe. Revisit when Stagehand confirms
      // 4-6 support.
      model: "anthropic/claude-sonnet-4-5-20250929",
    });

    // Fold startingUrl into the agent instruction rather than calling
    // stagehand.act() separately — act() uses Stagehand's own gateway
    // model + a stricter inner-tool schema that mis-fires on simple nav
    // commands. The agent loop handles navigation as a first step natively.
    const fullInstruction = startingUrl
      ? `Start by navigating to ${startingUrl}. Then: ${goal}`
      : goal;

    // Note: Stagehand v3's `signal` option is experimental and requires
    // disableAPI=true + experimental=true on the constructor. Easier to
    // enforce the timeout ourselves with Promise.race; Browserbase auto-
    // closes the session if we never call close(), but we always do in
    // finally.
    const result = await Promise.race([
      agent.execute({ instruction: fullInstruction, maxSteps: DEFAULT_MAX_STEPS }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("STAGEHAND_TIMEOUT")), DEFAULT_TIMEOUT_MS)
      ),
    ]);

    actionCount = result.actions?.length ?? 0;
    message = result.message || "(no message)";

    if (result.success) {
      status = "success";
    } else {
      status = "failed";
      errorMessage = result.message?.slice(0, 800);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "STAGEHAND_TIMEOUT") {
      status = "timeout";
      message = `Browser task timed out after ${DEFAULT_TIMEOUT_MS / 1000}s.`;
    } else {
      status = "failed";
      message = `Browser task failed: ${msg.slice(0, 300)}`;
      errorMessage = msg; // full error stored on the row for debugging
      logger.error("Browser task error (full)", { agentId, clientId, error: msg });
    }
  } finally {
    try {
      await stagehand?.close();
    } catch (closeErr) {
      logger.warn("Stagehand close failed (non-fatal)", {
        err: closeErr instanceof Error ? closeErr.message : String(closeErr),
      });
    }
  }

  const durationMs = Date.now() - startedAt.getTime();

  await prisma.browserSession.update({
    where: { id: row.id },
    data: {
      endedAt: new Date(),
      durationMs,
      status,
      resultSummary: message.slice(0, 4000),
      errorMessage: errorMessage ?? null,
      browserbaseSessionId: browserbaseSessionId ?? null,
    },
  });

  logger.info("Browser task complete", {
    agentId, clientId, sessionRowId: row.id, browserbaseSessionId,
    status, durationMs, actionCount,
  });

  return {
    status,
    message,
    sessionRowId: row.id,
    browserbaseSessionId,
    durationMs,
    actionCount,
  };
}
