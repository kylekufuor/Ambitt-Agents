// oracle/builds/orchestrator.ts
//
// Atlas-on-Fable build orchestrator.
//
//   kickoffBuild(buildId)  — open a Managed Agents session, send the build
//                            kickoff prompt, return. Fire-and-forget from
//                            the HTTP layer.
//   pollActiveBuilds()     — cron tick (every minute). Checks each running
//                            Build for: session-idle (done), cost-cap breach
//                            (kill), externally-cancelled (archive session),
//                            stale (> max-duration → fail).
//
// The actual build playbook lives in Atlas's system prompt (seeded by
// scripts/seed-fable-agents.ts) — sub-agent fan-out, tool selection, dry-run
// firing, Vera review — Atlas drives it. This file owns the lifecycle: when
// to open, when to check, when to close.

import prisma from "../../shared/db.js";
import logger from "../../shared/logger.js";
import {
  archiveSession,
  createEnvironment,
  createSession,
  getSession,
  listThreads,
  sendUserMessage,
  FABLE_MODEL_ID,
} from "../../shared/managed-agents/index.js";
import { sendKyleWhatsApp } from "../../shared/whatsapp.js";

// Env handles
const ATLAS_FABLE_AGENT_ID = () => process.env.ATLAS_FABLE_AGENT_ID;
const SHARED_ENV_ID = () => process.env.FABLE_ENVIRONMENT_ID;

// Per-thread token costs in cents per million tokens. Used to estimate build
// cost from per-thread `stats` in listThreads. Mirrors shared/claude.ts
// pricing but keyed by Fable model.
const FABLE_PRICING_PER_M = {
  // claude-opus-4-8 is the documented Fable 5 API id (per quickstart).
  // Pricing here matches the published Opus 4-class tier; revisit when
  // Anthropic publishes Fable-5-specific pricing.
  input: 1500,
  output: 7500,
  cacheWriteMul: 1.25,
  cacheReadMul: 0.1,
};

// Hard timeout — a build that's been running longer than this gets failed.
// Generous default since Fable is designed for multi-day work, but operator
// can override via env if a particular workload needs more.
const MAX_BUILD_HOURS = Number(process.env.FABLE_MAX_BUILD_HOURS ?? "6");

// ---------------------------------------------------------------------------
// Kickoff prompt — the message Atlas receives once. Atlas's system prompt has
// the playbook; this kickoff hands over the specific prospect to build for.
// ---------------------------------------------------------------------------

interface KickoffProspect {
  id: string;
  contactName: string | null;
  businessName: string | null;
  role: string | null;
  website: string | null;
  prdData: unknown;
  quoteDraft: unknown;
}

function buildKickoffPrompt(buildId: string, prospect: KickoffProspect): string {
  return [
    `# Build kickoff — Prospect ${prospect.id}`,
    ``,
    `**Build ID:** ${buildId}`,
    `**Contact:** ${prospect.contactName ?? "(unknown)"}`,
    `**Business:** ${prospect.businessName ?? "(unknown)"}`,
    `**Role:** ${prospect.role ?? "(unknown)"}`,
    `**Website:** ${prospect.website ?? "(unknown)"}`,
    ``,
    `## PRD`,
    "```json",
    prospect.prdData ? JSON.stringify(prospect.prdData, null, 2) : "(missing)",
    "```",
    ``,
    `## Quote`,
    "```json",
    prospect.quoteDraft ? JSON.stringify(prospect.quoteDraft, null, 2) : "(missing)",
    "```",
    ``,
    `## Your task`,
    ``,
    `Follow the standard build playbook from your system prompt:`,
    `  PHASE A — Spawn Story-writer (scenarios) and Builder (draft prompt) in parallel.`,
    `  PHASE B — Spawn Vera to review both. Iterate at most 2 rounds.`,
    `  PHASE C — Builder calls \`create_candidate_agent\` with buildId="${buildId}".`,
    `  PHASE D — Tester sub-agents call \`run_dry_run_scenario\` for each scenario`,
    `            (use the agentId returned in Phase C).`,
    `  PHASE E — Spawn Vera per capture. Each verdict goes through \`write_vera_verdict\`.`,
    `  PHASE F — Call \`mark_build_complete\` with status="completed" once everything`,
    `            is reviewed, or "failed" if you hit an unrecoverable problem.`,
    ``,
    `Available MCP tools (under the \`ambitt_builder\` server):`,
    `  read_prd, read_quote, list_composio_apps,`,
    `  create_candidate_agent, run_dry_run_scenario,`,
    `  write_vera_verdict, update_build_scenarios, mark_build_complete`,
    ``,
    `**Critical:** thread buildId="${buildId}" through every MCP call. The`,
    `MCP server uses it to scope every write to the right Build row.`,
    ``,
    `Begin.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Environment caching
// ---------------------------------------------------------------------------

async function ensureEnvironment(): Promise<string> {
  const cached = SHARED_ENV_ID();
  if (cached) return cached;

  logger.info("Creating Fable shared environment (first build)");
  const env = await createEnvironment({
    name: "ambitt-fable-shared",
    description: "Shared sandbox for Atlas-on-Fable build runs",
    config: { type: "cloud", networking: { type: "unrestricted" } },
    metadata: { service: "ambitt-agents" },
  });
  logger.warn(
    `Created Fable environment ${env.id}. Set FABLE_ENVIRONMENT_ID=${env.id} on Railway to reuse across builds.`
  );
  return env.id;
}

// ---------------------------------------------------------------------------
// Kickoff (called from /builds POST)
// ---------------------------------------------------------------------------

export async function kickoffBuild(buildId: string): Promise<void> {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    include: {
      prospect: {
        select: {
          id: true,
          contactName: true,
          businessName: true,
          role: true,
          website: true,
          prdData: true,
          quoteDraft: true,
        },
      },
    },
  });
  if (!build) {
    logger.error("kickoffBuild: build not found", { buildId });
    return;
  }

  const atlasAgentId = ATLAS_FABLE_AGENT_ID();
  if (!atlasAgentId) {
    await failBuild(buildId, "ATLAS_FABLE_AGENT_ID env var not set; run scripts/seed-fable-agents.ts");
    return;
  }

  try {
    await prisma.build.update({
      where: { id: buildId },
      data: { status: "running", startedAt: new Date() },
    });

    const environmentId = await ensureEnvironment();

    const session = await createSession({
      agent: atlasAgentId,
      environment_id: environmentId,
      title: `Build ${buildId} for prospect ${build.prospect.id}`,
      metadata: {
        buildId,
        prospectId: build.prospect.id,
        model: FABLE_MODEL_ID,
      },
    });

    await prisma.build.update({
      where: { id: buildId },
      data: {
        sessionId: session.id,
        environmentId,
        managedAgentId: atlasAgentId,
      },
    });

    logger.info("Build session created", {
      buildId,
      sessionId: session.id,
      environmentId,
      atlasAgentId,
    });

    await sendUserMessage(session.id, buildKickoffPrompt(buildId, build.prospect));
    // Hand off to the cron — it'll watch session status, track cost, and
    // finalize when Atlas calls mark_build_complete (via MCP).
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("kickoffBuild failed", { buildId, err: message });
    await failBuild(buildId, message);
  }
}

// ---------------------------------------------------------------------------
// Cost estimation from per-thread token stats
// ---------------------------------------------------------------------------

interface ThreadStats {
  input?: number;
  output?: number;
  cacheCreate?: number;
  cacheRead?: number;
}

function estimateCostCents(stats: ThreadStats): number {
  const input = stats.input ?? 0;
  const output = stats.output ?? 0;
  const cacheCreate = stats.cacheCreate ?? 0;
  const cacheRead = stats.cacheRead ?? 0;
  const raw =
    input * FABLE_PRICING_PER_M.input +
    output * FABLE_PRICING_PER_M.output +
    cacheCreate * FABLE_PRICING_PER_M.input * FABLE_PRICING_PER_M.cacheWriteMul +
    cacheRead * FABLE_PRICING_PER_M.input * FABLE_PRICING_PER_M.cacheReadMul;
  return Math.ceil(raw / 1_000_000);
}

async function fetchBuildCostCents(sessionId: string): Promise<number> {
  try {
    const threads = await listThreads(sessionId);
    let total = 0;
    for (const t of threads.data) {
      total += estimateCostCents({
        input: t.stats?.input_tokens,
        output: t.stats?.output_tokens,
        cacheCreate: t.usage?.cache_creation_input_tokens,
        cacheRead: t.usage?.cache_read_input_tokens,
      });
    }
    return total;
  } catch (err) {
    logger.warn("fetchBuildCostCents failed", {
      sessionId,
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Poll tick — cron-driven, one tick per minute
// ---------------------------------------------------------------------------

export async function pollActiveBuilds(): Promise<void> {
  const active = await prisma.build.findMany({
    where: {
      status: { in: ["running"] },
      sessionId: { not: null },
    },
    select: {
      id: true,
      sessionId: true,
      startedAt: true,
      costCents: true,
      budgetCents: true,
      prospectId: true,
    },
  });

  if (active.length === 0) return;
  logger.debug("Polling active builds", { count: active.length });

  for (const build of active) {
    if (!build.sessionId) continue;
    try {
      await tickOneBuild(build);
    } catch (err) {
      logger.error("Build poll tick failed for one build", {
        buildId: build.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

interface PollableBuild {
  id: string;
  sessionId: string | null;
  startedAt: Date | null;
  costCents: number;
  budgetCents: number;
  prospectId: string;
}

async function tickOneBuild(build: PollableBuild): Promise<void> {
  const sessionId = build.sessionId!;

  // 1. Refresh cost estimate from threads.
  const costCents = await fetchBuildCostCents(sessionId);
  if (costCents !== build.costCents) {
    await prisma.build.update({
      where: { id: build.id },
      data: { costCents },
    });
  }

  // 2. Budget cap. If exceeded, archive session + fail the build.
  if (costCents >= build.budgetCents) {
    logger.warn("Build hit cost cap; killing session", {
      buildId: build.id,
      costCents,
      budgetCents: build.budgetCents,
    });
    await safeArchive(sessionId);
    await failBuild(build.id, `Cost cap exceeded ($${(costCents / 100).toFixed(2)} ≥ $${(build.budgetCents / 100).toFixed(2)})`);
    await alertOps(
      `Fable build ${build.id} for prospect ${build.prospectId} hit the cost cap ($${(costCents / 100).toFixed(2)}) and was killed.`
    );
    return;
  }

  // 3. Stale check — kill builds that have been running too long.
  if (build.startedAt) {
    const hoursElapsed = (Date.now() - build.startedAt.getTime()) / 3_600_000;
    if (hoursElapsed > MAX_BUILD_HOURS) {
      logger.warn("Build exceeded max duration; killing", {
        buildId: build.id,
        hoursElapsed,
        max: MAX_BUILD_HOURS,
      });
      await safeArchive(sessionId);
      await failBuild(build.id, `Build exceeded max duration of ${MAX_BUILD_HOURS}h`);
      await alertOps(
        `Fable build ${build.id} ran past the ${MAX_BUILD_HOURS}h max-duration cap and was killed.`
      );
      return;
    }
  }

  // 4. Session status check. If Atlas is idle and Build is still "running",
  //    either: (a) Atlas finished + called mark_build_complete already (Build
  //    is now "completed" — we wouldn't be in this poll), or (b) Atlas went
  //    idle without calling mark_build_complete (failure to wrap up). The
  //    "running" filter on the query means we caught case (b); treat as a
  //    soft failure with a recoverable signal.
  try {
    const session = await getSession(sessionId);
    if (session.status === "idle") {
      logger.warn("Session idle but build still running; Atlas forgot to mark complete", {
        buildId: build.id,
        sessionId,
      });
      await failBuild(
        build.id,
        "Atlas session went idle without calling mark_build_complete. Open the dry-run page and review what landed."
      );
      await alertOps(
        `Fable build ${build.id} session went idle without finalization. Operator review needed.`
      );
      return;
    }
    if (session.status === "failed") {
      await failBuild(build.id, "Managed Agents session failed");
      return;
    }
    // status === "running" or "paused" — leave it alone, next tick will check.
  } catch (err) {
    logger.warn("Could not fetch session status", {
      buildId: build.id,
      sessionId,
      err: err instanceof Error ? err.message : String(err),
    });
    // Don't fail the build on a transient API hiccup; next tick retries.
  }
}

// ---------------------------------------------------------------------------
// External cancellation watcher — runs on the same tick. Catches builds
// flipped to "cancelled" via /builds/:id/cancel and archives their session.
// ---------------------------------------------------------------------------

export async function reapCancelledBuilds(): Promise<void> {
  const cancelled = await prisma.build.findMany({
    where: {
      status: "cancelled",
      sessionId: { not: null },
      // Only reap recently-cancelled rows (last 24h). Anything older we
      // assume was already archived in-process.
      updatedAt: { gte: new Date(Date.now() - 24 * 3_600_000) },
    },
    select: { id: true, sessionId: true },
  });
  for (const b of cancelled) {
    if (!b.sessionId) continue;
    await safeArchive(b.sessionId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeArchive(sessionId: string): Promise<void> {
  try {
    await archiveSession(sessionId);
  } catch (err) {
    logger.warn("Session archive failed (already archived?)", {
      sessionId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function failBuild(buildId: string, reason: string): Promise<void> {
  try {
    await prisma.build.update({
      where: { id: buildId },
      data: {
        status: "failed",
        failureReason: reason,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    logger.error("failBuild: could not write failure to DB", { buildId, err });
  }
}

async function alertOps(message: string): Promise<void> {
  if (!process.env.KYLE_WHATSAPP_NUMBER) return;
  try {
    await sendKyleWhatsApp(message);
  } catch (err) {
    logger.warn("Build alert failed to send WhatsApp", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export default { kickoffBuild, pollActiveBuilds, reapCancelledBuilds };
