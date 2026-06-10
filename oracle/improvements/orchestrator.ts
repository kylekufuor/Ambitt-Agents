// oracle/improvements/orchestrator.ts
//
// Atlas-Improver-on-Fable weekly self-improvement cycle.
//
//   kickoffImprovementCycle({ agentId }) — open a Managed Agents session
//   pointed at Atlas-Improver, hand it the agent's recent activity, let it
//   propose a prompt edit + run a dry-run regression, write the proposal to
//   AgentImprovement, and stop. The operator reviews + approves on the
//   dashboard. NO auto-ship — human-in-the-loop is the explicit rule.
//
//   pollActiveImprovements() — every-minute cron. Cost cap, stale check,
//   session-idle-without-finalize, externally-rejected cleanup. Mirrors
//   oracle/builds/orchestrator.ts shape so the same lifecycle invariants
//   apply.
//
//   scheduleWeeklyImprovements() — fires once per Sunday at 02:00 UTC.
//   Walks every active Agent, skips ones with an open cycle this week,
//   creates an AgentImprovement row in "pending" and kicks the session.
//
// Atlas-Improver gets its own Managed Agents persona (seeded by
// scripts/seed-fable-agents.ts as ATLAS_IMPROVER_FABLE_AGENT_ID). The MCP
// server (oracle/mcp-server/builder.ts) exposes a separate set of tools
// scoped to improvement: read_agent_activity_summary, propose_improvement,
// run_regression_for_improvement, finalize_improvement_review.

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

const ATLAS_IMPROVER_FABLE_AGENT_ID = () => process.env.ATLAS_IMPROVER_FABLE_AGENT_ID;
const SHARED_ENV_ID = () => process.env.FABLE_ENVIRONMENT_ID;

const MAX_IMPROVEMENT_HOURS = Number(process.env.FABLE_MAX_IMPROVEMENT_HOURS ?? "2");
const MAX_CONCURRENT_IMPROVEMENTS = Number(
  process.env.FABLE_MAX_CONCURRENT_IMPROVEMENTS ?? "10"
);

const FABLE_PRICING_PER_M = {
  input: 1500,
  output: 7500,
  cacheWriteMul: 1.25,
  cacheReadMul: 0.1,
};

// ---------------------------------------------------------------------------
// Kickoff prompt
// ---------------------------------------------------------------------------

interface KickoffAgent {
  id: string;
  name: string;
  personality: string;
  purpose: string;
  agentType: string;
  primaryModel: string;
  tools: string[];
  clientNorthStar: string | null;
  totalTasksCompleted: number;
  totalRecommendations: number;
  approvalRate: number;
  implementationRate: number;
}

function buildKickoffPrompt(improvementId: string, agent: KickoffAgent): string {
  return [
    `# Weekly self-improvement cycle — Agent ${agent.id}`,
    ``,
    `**Improvement ID:** ${improvementId}`,
    `**Agent:** ${agent.name} (${agent.agentType})`,
    `**Model:** ${agent.primaryModel}`,
    `**Tools attached:** ${agent.tools.length ? agent.tools.join(", ") : "(none)"}`,
    ``,
    `## Current performance signal`,
    `- Tasks completed: ${agent.totalTasksCompleted}`,
    `- Recommendations sent: ${agent.totalRecommendations}`,
    `- Approval rate: ${(agent.approvalRate * 100).toFixed(1)}%`,
    `- Implementation rate: ${(agent.implementationRate * 100).toFixed(1)}%`,
    `- Client north star: ${agent.clientNorthStar ?? "(unset)"}`,
    ``,
    `## Current personality`,
    "```",
    agent.personality,
    "```",
    ``,
    `## Current purpose`,
    "```",
    agent.purpose,
    "```",
    ``,
    `## Your task`,
    ``,
    `Follow the standard self-improvement playbook from your system prompt:`,
    `  PHASE A — Read agent activity. Call \`read_agent_activity_summary\` with`,
    `            improvementId="${improvementId}" and agentId="${agent.id}".`,
    `            This pulls last-30-days conversations + rec verdicts + outcomes.`,
    `  PHASE B — Diagnose. What's the agent doing well? Where is approvalRate or`,
    `            implementationRate dropping? What complaints recur?`,
    `  PHASE C — Propose ONE focused edit. Call \`propose_improvement\` with the`,
    `            new personality / purpose / clientNorthStar drafts + rationale.`,
    `            Less is more — small, targeted edits ship; sweeping rewrites get`,
    `            rejected by the operator.`,
    `  PHASE D — Spawn Vera to review the proposal against the agent's current`,
    `            voice and scope. If Vera rejects, refine once and resubmit.`,
    `  PHASE E — Run regression. Call \`run_regression_for_improvement\` to fire`,
    `            past dry-run scenarios against the proposed prompt. Atlas-Improver`,
    `            does not auto-ship even on 100% pass — the operator decides.`,
    `  PHASE F — Call \`finalize_improvement_review\` with status="ready" once`,
    `            everything is captured, or "failed" if you hit an unrecoverable`,
    `            problem. The operator reviews on the dashboard.`,
    ``,
    `**First Truth Principle reminder:** every proposal must answer YES to`,
    `"does this make the client's business better?" Stylistic preference is`,
    `not a reason to ship. Demonstrated approval-rate drops on a specific`,
    `behavior are.`,
    ``,
    `**Critical:** thread improvementId="${improvementId}" through every MCP call.`,
    ``,
    `Begin Phase A.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Environment caching (shared with builds)
// ---------------------------------------------------------------------------

async function ensureEnvironment(): Promise<string> {
  const cached = SHARED_ENV_ID();
  if (cached) return cached;

  logger.info("Creating Fable shared environment (first improvement)");
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

// ---------------------------------------------------------------------------
// Kickoff one cycle
// ---------------------------------------------------------------------------

export async function kickoffImprovementCycle(improvementId: string): Promise<void> {
  const improvement = await prisma.agentImprovement.findUnique({
    where: { id: improvementId },
    include: {
      agent: {
        select: {
          id: true,
          name: true,
          personality: true,
          purpose: true,
          agentType: true,
          primaryModel: true,
          tools: true,
          clientNorthStar: true,
          totalTasksCompleted: true,
          totalRecommendations: true,
          approvalRate: true,
          implementationRate: true,
        },
      },
    },
  });
  if (!improvement) {
    logger.error("kickoffImprovementCycle: improvement not found", { improvementId });
    return;
  }

  const atlasId = ATLAS_IMPROVER_FABLE_AGENT_ID();
  if (!atlasId) {
    await failImprovement(improvementId, "ATLAS_IMPROVER_FABLE_AGENT_ID not set");
    return;
  }

  try {
    await prisma.agentImprovement.update({
      where: { id: improvementId },
      data: { status: "pending", startedAt: new Date() },
    });

    const environmentId = await ensureEnvironment();
    const session = await createSession({
      agent: atlasId,
      environment_id: environmentId,
      title: `Improvement ${improvementId} for agent ${improvement.agent.id}`,
      metadata: {
        improvementId,
        agentId: improvement.agent.id,
        model: FABLE_MODEL_ID,
        purpose: "self_improvement",
      },
    });

    await prisma.agentImprovement.update({
      where: { id: improvementId },
      data: { sessionId: session.id, environmentId },
    });

    logger.info("Improvement session created", {
      improvementId,
      sessionId: session.id,
      agentId: improvement.agent.id,
    });

    await sendUserMessage(session.id, buildKickoffPrompt(improvementId, improvement.agent));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("kickoffImprovementCycle failed", { improvementId, err: message });
    await failImprovement(improvementId, message);
    await alertOps(
      `Atlas-Improver session for ${improvement.agent.name} (improvement ${improvementId}) failed at kickoff: ${message.slice(0, 200)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Weekly cron — Sunday 02:00 UTC, fans out one improvement per active agent
// ---------------------------------------------------------------------------

export async function scheduleWeeklyImprovements(): Promise<void> {
  const since = startOfThisWeekUtc();

  const activeAgents = await prisma.agent.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
  });

  let queued = 0;
  for (const agent of activeAgents) {
    const existing = await prisma.agentImprovement.findFirst({
      where: {
        agentId: agent.id,
        createdAt: { gte: since },
        status: { in: ["pending", "ready", "shipped"] },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      logger.debug("Weekly improvement: skipping (already has cycle this week)", {
        agentId: agent.id,
        existingStatus: existing.status,
      });
      continue;
    }
    const improvement = await prisma.agentImprovement.create({
      data: {
        agentId: agent.id,
        status: "pending",
        budgetCents: Number(process.env.FABLE_IMPROVEMENT_BUDGET_CENTS ?? "5000"),
      },
    });
    queued++;
    logger.info("Weekly improvement queued", {
      improvementId: improvement.id,
      agentId: agent.id,
      agentName: agent.name,
    });
  }
  if (queued > 0) {
    logger.info("Weekly improvement cycle: queued", { count: queued });
  }
}

function startOfThisWeekUtc(): Date {
  const now = new Date();
  // Sunday = 0
  const day = now.getUTCDay();
  const sunday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day, 0, 0, 0, 0)
  );
  return sunday;
}

// ---------------------------------------------------------------------------
// Poll active cycles (mirrors oracle/builds/orchestrator.ts pollActiveBuilds)
// ---------------------------------------------------------------------------

export async function pollActiveImprovements(): Promise<void> {
  const active = await prisma.agentImprovement.findMany({
    where: { status: "pending", sessionId: { not: null } },
    select: {
      id: true,
      sessionId: true,
      startedAt: true,
      costCents: true,
      budgetCents: true,
      agentId: true,
    },
  });
  if (active.length === 0) return;
  logger.debug("Polling active improvements", { count: active.length });

  for (const i of active) {
    if (!i.sessionId) continue;
    try {
      await tickOne(i);
    } catch (err) {
      logger.error("Improvement poll tick failed for one cycle", {
        improvementId: i.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

interface PollableImprovement {
  id: string;
  sessionId: string | null;
  startedAt: Date | null;
  costCents: number;
  budgetCents: number;
  agentId: string;
}

async function tickOne(i: PollableImprovement): Promise<void> {
  const sessionId = i.sessionId!;

  const costCents = await fetchCostCents(sessionId);
  if (costCents !== i.costCents) {
    await prisma.agentImprovement.update({
      where: { id: i.id },
      data: { costCents },
    });
  }

  if (costCents >= i.budgetCents) {
    await safeArchive(sessionId);
    await failImprovement(i.id, `Cost cap exceeded ($${(costCents / 100).toFixed(2)})`);
    await alertOps(`Improvement ${i.id} hit cost cap; session killed.`);
    return;
  }

  if (i.startedAt) {
    const hoursElapsed = (Date.now() - i.startedAt.getTime()) / 3_600_000;
    if (hoursElapsed > MAX_IMPROVEMENT_HOURS) {
      await safeArchive(sessionId);
      await failImprovement(i.id, `Exceeded max duration ${MAX_IMPROVEMENT_HOURS}h`);
      await alertOps(`Improvement ${i.id} hit max duration; session killed.`);
      return;
    }
  }

  try {
    const session = await getSession(sessionId);
    if (session.status === "idle") {
      // Session idle but still "pending" — Atlas forgot to finalize.
      await failImprovement(
        i.id,
        "Atlas session went idle without finalize_improvement_review"
      );
      await alertOps(
        `Improvement ${i.id} session went idle without finalization. Review needed.`
      );
      return;
    }
    if (session.status === "failed") {
      await failImprovement(i.id, "Managed Agents session failed");
      return;
    }
  } catch (err) {
    logger.warn("Could not fetch improvement session status", {
      improvementId: i.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function fetchCostCents(sessionId: string): Promise<number> {
  try {
    const threads = await listThreads(sessionId);
    let total = 0;
    for (const t of threads.data) {
      const input = t.stats?.input_tokens ?? 0;
      const output = t.stats?.output_tokens ?? 0;
      const cacheWrite = t.usage?.cache_creation_input_tokens ?? 0;
      const cacheRead = t.usage?.cache_read_input_tokens ?? 0;
      const raw =
        input * FABLE_PRICING_PER_M.input +
        output * FABLE_PRICING_PER_M.output +
        cacheWrite * FABLE_PRICING_PER_M.input * FABLE_PRICING_PER_M.cacheWriteMul +
        cacheRead * FABLE_PRICING_PER_M.input * FABLE_PRICING_PER_M.cacheReadMul;
      total += Math.ceil(raw / 1_000_000);
    }
    return total;
  } catch (err) {
    logger.warn("fetchCostCents (improvement) failed", {
      sessionId,
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Queue drain
// ---------------------------------------------------------------------------

export async function drainImprovementQueue(): Promise<void> {
  const runningCount = await prisma.agentImprovement.count({
    where: { status: "pending", sessionId: { not: null } },
  });
  const slots = MAX_CONCURRENT_IMPROVEMENTS - runningCount;
  if (slots <= 0) return;

  const queued = await prisma.agentImprovement.findMany({
    where: { status: "pending", sessionId: null },
    orderBy: { createdAt: "asc" },
    take: slots,
    select: { id: true },
  });
  for (const q of queued) {
    try {
      await kickoffImprovementCycle(q.id);
    } catch (err) {
      logger.error("Queue drain (improvement): kickoff threw", {
        improvementId: q.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeArchive(sessionId: string): Promise<void> {
  try {
    await archiveSession(sessionId);
  } catch (err) {
    logger.warn("Session archive failed (improvement)", {
      sessionId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function failImprovement(id: string, reason: string): Promise<void> {
  try {
    await prisma.agentImprovement.update({
      where: { id },
      data: {
        status: "failed",
        failureReason: reason,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    logger.error("failImprovement: could not write to DB", { id, err });
  }
}

async function alertOps(message: string): Promise<void> {
  if (!process.env.KYLE_WHATSAPP_NUMBER) return;
  try {
    await sendKyleWhatsApp(message);
  } catch (err) {
    logger.warn("Improvement alert failed to send WhatsApp", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export default {
  kickoffImprovementCycle,
  pollActiveImprovements,
  drainImprovementQueue,
  scheduleWeeklyImprovements,
};
