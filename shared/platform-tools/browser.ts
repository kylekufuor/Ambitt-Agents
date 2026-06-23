import { Stagehand } from "@browserbasehq/stagehand";
import Browserbase from "@browserbasehq/sdk";
import prisma from "../db.js";
import logger from "../logger.js";
import { resolveSecrets } from "../secrets/onepassword.js";

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
//   2. Pre-process goal: extract any {{secret:op://...}} refs, resolve them
//      via the 1Password resolver, substitute into the goal text. Ambitt's
//      Claude never sees the resolved value — by the time the goal gets to
//      this layer, Claude has already committed to its tool call with only
//      the op:// refs.
//   3. `new Stagehand({ env: "BROWSERBASE" }).init()` — spins up a remote
//      Chrome on Browserbase. Capture their session id for the audit row.
//   4. `stagehand.agent({ model }).execute(instruction)` — Stagehand drives
//      the browser with its own LLM. Time cap enforced via Promise.race.
//   5. `stagehand.close()` always runs in finally.
//   6. Update the row: status, durationMs, resultSummary, errorMessage.
//
// Return to Claude: compact text summary (Stagehand's own `message` +
// action count + success flag). The full actions array + page-level HTML
// never reach Claude — blow-up risk otherwise.
//
// SECURITY TRUST BOUNDARY (Phase C):
// - Ambitt's Claude (orchestrator): NEVER sees resolved secret values.
//   Claude commits to its tool call referencing op:// strings only.
// - Stagehand's internal LLM (Browserbase gateway, ZDR-enabled): sees
//   resolved values briefly when driving form fills. This is the v1
//   trade-off. Migration path: Browserbase + 1Password's native "Secure
//   Agentic Autofill" (announced Oct 2025, currently Director.ai-only).
//   When they expose it as a generic SDK, swap the substitution + fill
//   path for their API and the value never enters any LLM context.
// - Logs: secrets are NEVER written to logger.* output. We log only that
//   N refs were resolved.
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — matches scope-doc cap
const DEFAULT_MAX_STEPS = 25;

export interface RunBrowserTaskInput {
  agentId: string;
  clientId: string;
  goal: string;
  startingUrl?: string;
  // Keep the remote browser alive after this call so a later call can resume
  // it (e.g. parking on a 2FA screen while we email the client for the code).
  keepSessionOpen?: boolean;
  // Reconnect to a previously kept-open session instead of starting fresh.
  // The page is wherever the prior call left it. When set and keepSessionOpen
  // is falsy, the session is released after this call (the final step).
  resumeSessionId?: string;
}

export interface RunBrowserTaskResult {
  status: "success" | "failed" | "timeout";
  message: string;           // text returned to Claude
  sessionRowId: string;
  browserbaseSessionId?: string;
  durationMs: number;
  actionCount: number;
  keptOpen?: boolean;        // true if the remote session is still alive for a resume
}

/**
 * Find every `{{secret:op://vault/item/field}}` placeholder in a goal string.
 * Returns the list of unique op:// references in encounter order. Used by
 * the secret-substitution preprocessor.
 */
export function extractSecretRefs(goal: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  // Greedy regex match — placeholder is exactly {{secret:op://...}}, no
  // nested braces. Spaces around the ref are tolerated.
  const pattern = /\{\{\s*secret\s*:\s*(op:\/\/[^}\s]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(goal)) !== null) {
    const ref = m[1];
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }
  return refs;
}

/**
 * Resolve every `{{secret:op://...}}` placeholder in a goal string into its
 * real 1Password value. Vault gating is enforced by resolveSecrets at the
 * resolver layer. Returns the substituted string + count of refs resolved.
 *
 * Do not log the returned string — it contains plaintext secrets.
 */
async function substituteSecrets(
  clientId: string,
  goal: string
): Promise<{ substituted: string; resolvedCount: number }> {
  const refs = extractSecretRefs(goal);
  if (refs.length === 0) {
    return { substituted: goal, resolvedCount: 0 };
  }
  const values = await resolveSecrets(clientId, refs);
  let substituted = goal;
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const value = values[i];
    // Replace ALL occurrences of this exact placeholder. Use split/join to
    // avoid any regex-escaping subtleties on the ref content.
    const placeholderPattern = new RegExp(
      `\\{\\{\\s*secret\\s*:\\s*${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`,
      "g"
    );
    substituted = substituted.replace(placeholderPattern, value);
  }
  return { substituted, resolvedCount: refs.length };
}

export async function runBrowserTask(input: RunBrowserTaskInput): Promise<RunBrowserTaskResult> {
  const { agentId, clientId, goal, startingUrl, keepSessionOpen, resumeSessionId } = input;

  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    throw new Error("BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set");
  }
  if (!goal || goal.trim().length === 0) {
    throw new Error("browse: goal is required");
  }

  // Store the goal-with-placeholders (not the substituted version) so the
  // audit row never holds plaintext secrets. Goal value in DB is what
  // Claude actually committed to, opaque op:// refs and all.
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

  // Resolve any {{secret:op://...}} placeholders BEFORE handing the goal to
  // Stagehand. resolveSecrets enforces vault gating per the client's
  // pinned vault. If any ref fails (vault mismatch, missing item) we abort
  // the whole task — partial-fill would leak credentials into the wrong
  // form.
  let resolvedGoal: string;
  let resolvedRefCount = 0;
  try {
    const sub = await substituteSecrets(clientId, goal);
    resolvedGoal = sub.substituted;
    resolvedRefCount = sub.resolvedCount;
    if (resolvedRefCount > 0) {
      logger.info("Browser task: secret placeholders resolved", {
        agentId, clientId, sessionRowId: row.id, count: resolvedRefCount,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Browser task: secret resolution failed", { agentId, clientId, err: msg });
    await prisma.browserSession.update({
      where: { id: row.id },
      data: {
        endedAt: new Date(),
        durationMs: Date.now() - row.startedAt.getTime(),
        status: "failed",
        errorMessage: `Secret resolution failed: ${msg.slice(0, 600)}`,
      },
    });
    return {
      status: "failed",
      message: `Browser task aborted: secret resolution failed (${msg.slice(0, 200)}). Check that the referenced 1Password items exist and the client's vault is set correctly.`,
      sessionRowId: row.id,
      durationMs: Date.now() - row.startedAt.getTime(),
      actionCount: 0,
    };
  }

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
      // Resume a parked session by id, OR start fresh. When we plan to come
      // back (keepSessionOpen), create it with keepAlive so the remote browser
      // survives our disconnect and the next call can reconnect to it.
      ...(resumeSessionId
        ? { browserbaseSessionID: resumeSessionId }
        : keepSessionOpen
          ? {
              browserbaseSessionCreateParams: {
                projectId: process.env.BROWSERBASE_PROJECT_ID!,
                keepAlive: true,
              },
            }
          : {}),
    });
    await stagehand.init();
    browserbaseSessionId = resumeSessionId ?? stagehand.browserbaseSessionID;

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
    // resolvedGoal carries any 1Password values substituted in for
    // {{secret:op://...}} placeholders — do not log this string.
    const fullInstruction = startingUrl
      ? `Start by navigating to ${startingUrl}. Then: ${resolvedGoal}`
      : resolvedGoal;

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
    // Closing disconnects our SDK. A keepAlive session stays alive on
    // Browserbase regardless, so a later call can resume it. When we're
    // resuming and NOT keeping it open (the final step), explicitly release
    // it so we don't leak a parked browser. Non-keepAlive one-shots are
    // released by close() automatically — nothing to do.
    if (resumeSessionId && !keepSessionOpen && browserbaseSessionId) {
      try {
        const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
        await bb.sessions.update(browserbaseSessionId, {
          status: "REQUEST_RELEASE",
          projectId: process.env.BROWSERBASE_PROJECT_ID!,
        });
      } catch (relErr) {
        logger.warn("Browserbase session release failed (non-fatal)", {
          browserbaseSessionId,
          err: relErr instanceof Error ? relErr.message : String(relErr),
        });
      }
    }
  }

  const keptOpen = !!keepSessionOpen;
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
    keptOpen,
  };
}
