import cron, { type ScheduledTask } from "node-cron";
import prisma from "../shared/db.js";
import { processInboundMessage } from "../shared/runtime/index.js";
import { sendEmail } from "../shared/email.js";
import { buildAgentResponseEmail } from "./templates/agent-response.js";
import { buildCheckpointEmail, type CheckpointKind } from "./templates/checkpoint-email.js";
import {
  generateCheckinBody,
  generateHighlightBody,
  generateFeedbackBody,
} from "./onboarding-content.js";
import logger from "../shared/logger.js";

// ---------------------------------------------------------------------------
// Agent Scheduler — manages cron jobs for all active agents
// ---------------------------------------------------------------------------
// On Oracle startup: loads all active agents with schedules, registers cron
// jobs. When agents are activated/paused/killed, call register/unregister.
// Each agent's cron job runs the runtime engine autonomously and emails
// the client with results.
// ---------------------------------------------------------------------------

const activeJobs = new Map<string, ScheduledTask>();

/**
 * Build the autonomous task prompt for a scheduled run.
 */
function buildScheduledTaskPrompt(agent: {
  name: string;
  purpose: string;
  tools: string[];
  clientBusinessName: string;
}): string {
  return `This is your scheduled run. You are ${agent.name}, and your purpose is: ${agent.purpose}.

You are running autonomously for ${agent.clientBusinessName}. Use your connected tools to:
1. Gather the latest data relevant to your purpose
2. Analyze what you find — look for insights, changes, opportunities, or issues
3. Compose a clear, actionable summary for your client

Your connected tools: ${agent.tools.join(", ")}

Do your job. Be specific, use real data from your tools, and deliver value. If you find something urgent, flag it clearly. If everything looks normal, say so briefly and highlight the most interesting finding.`;
}

/**
 * Execute a single scheduled agent run.
 */
async function executeScheduledRun(agentId: string): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      name: true,
      purpose: true,
      agentType: true,
      tools: true,
      status: true,
      client: { select: { email: true, businessName: true } },
    },
  });

  if (!agent || agent.status !== "active") {
    logger.warn("Scheduled run skipped — agent not active", { agentId });
    unregisterAgent(agentId);
    return;
  }

  const now = new Date();
  logger.info("Scheduled run starting", { agentId, agentName: agent.name });

  const taskPrompt = buildScheduledTaskPrompt({
    name: agent.name,
    purpose: agent.purpose,
    tools: agent.tools,
    clientBusinessName: agent.client.businessName,
  });

  const threadId = `thread-${agentId}-scheduled-${now.toISOString().slice(0, 10)}`;

  const result = await processInboundMessage({
    agentId,
    userMessage: taskPrompt,
    channel: "email",
    threadId,
  });

  // Send results to client
  const responseHtml = buildAgentResponseEmail({
    agentName: agent.name,
    agentId,
    agentRole: agent.purpose,
    clientBusinessName: agent.client.businessName,
    responseBody: result.response,
    toolsUsed: result.toolsUsed,
  });

  await sendEmail({
    agentId,
    agentName: agent.name,
    to: agent.client.email,
    subject: `${agent.name} — ${agent.client.businessName}`,
    html: responseHtml,
    replyToAgentId: agentId,
    attachments: result.attachments.length > 0 ? result.attachments : undefined,
  });

  // Update last run timestamp
  await prisma.agent.update({
    where: { id: agentId },
    data: { lastRunAt: now },
  });

  // Log the run
  await prisma.oracleAction.create({
    data: {
      actionType: "scheduled_run",
      description: `Scheduled run completed for "${agent.name}" — ${result.toolsUsed.length} tools used`,
      agentId,
      clientId: (await prisma.agent.findUnique({ where: { id: agentId }, select: { clientId: true } }))!.clientId,
      status: "completed",
    },
  });

  logger.info("Scheduled run completed", {
    agentId,
    agentName: agent.name,
    toolsUsed: result.toolsUsed.length,
  });
}

// ---------------------------------------------------------------------------
// Public API — called by Oracle when agent lifecycle changes
// ---------------------------------------------------------------------------

/**
 * Register a cron job for an agent. Call when an agent is activated.
 */
export function registerAgent(agentId: string, schedule: string): void {
  // Skip if no schedule or manual-only
  if (!schedule || schedule === "manual") return;

  // Validate cron expression
  if (!cron.validate(schedule)) {
    logger.warn("Invalid cron expression, skipping registration", { agentId, schedule });
    return;
  }

  // Unregister existing job if any
  unregisterAgent(agentId);

  const task = cron.schedule(schedule, async () => {
    try {
      await executeScheduledRun(agentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Scheduled run failed", { agentId, error: message });

      await prisma.oracleAction.create({
        data: {
          actionType: "scheduled_run",
          description: `Scheduled run FAILED for agent ${agentId}: ${message}`,
          agentId,
          status: "failed",
          result: message,
        },
      });
    }
  });

  activeJobs.set(agentId, task);
  logger.info("Agent scheduled", { agentId, schedule });
}

/**
 * Unregister a cron job for an agent. Call when an agent is paused/killed.
 */
export function unregisterAgent(agentId: string): void {
  const existing = activeJobs.get(agentId);
  if (existing) {
    existing.stop();
    activeJobs.delete(agentId);
    logger.info("Agent unscheduled", { agentId });
  }
}

/**
 * Initialize scheduler on Oracle startup.
 * Loads all active agents with schedules and registers cron jobs.
 */
export async function initScheduler(): Promise<void> {
  const agents = await prisma.agent.findMany({
    where: { status: "active" },
    select: { id: true, schedule: true, name: true },
  });

  let registered = 0;
  for (const agent of agents) {
    if (agent.schedule && agent.schedule !== "manual") {
      registerAgent(agent.id, agent.schedule);
      registered++;
    }
  }

  startCheckpointCron();

  logger.info("Scheduler initialized", {
    activeAgents: agents.length,
    scheduledJobs: registered,
  });
}

/**
 * Get status of all scheduled jobs.
 */
export function getSchedulerStatus(): Array<{ agentId: string }> {
  return Array.from(activeJobs.keys()).map((agentId) => ({ agentId }));
}

/**
 * Stop all scheduled jobs. Call on shutdown.
 */
export function stopAll(): void {
  for (const [agentId, task] of activeJobs) {
    task.stop();
    logger.info("Agent unscheduled (shutdown)", { agentId });
  }
  activeJobs.clear();
  if (checkpointCronTask) {
    checkpointCronTask.stop();
    checkpointCronTask = null;
  }
}

// ---------------------------------------------------------------------------
// Onboarding checkpoint cron — hourly sweep of ScheduledEmail
// ---------------------------------------------------------------------------
// Single hourly job (not per-agent) that picks up ALL pending checkpoint
// emails whose scheduledAt has arrived. Respects agent timezone: only fires
// during 9am–5pm local, Mon–Fri. Out-of-hours rows stay pending and get
// retried on the next tick.
//
// Per-tick cap of 25 prevents a backlog burst from exhausting API quota.
// A failed send marks the row `failed` and logs the error — it does NOT retry
// automatically. Recovery is a manual op for now.
// ---------------------------------------------------------------------------

let checkpointCronTask: ScheduledTask | null = null;
const CHECKPOINT_TICK_CAP = 25;

function isInBusinessHours(now: Date, timezone: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const isWeekday = !["Sat", "Sun"].includes(weekday);
    return isWeekday && hour >= 9 && hour < 17;
  } catch {
    // Invalid timezone — fall back to US Eastern business hours (13-21 UTC, M-F).
    const hour = now.getUTCHours();
    const day = now.getUTCDay();
    return day >= 1 && day <= 5 && hour >= 13 && hour < 21;
  }
}

async function generateBodyForKind(kind: string, agentId: string): Promise<string> {
  if (kind === "checkin_3day") return (await generateCheckinBody(agentId)).body;
  if (kind === "highlight_7day") return (await generateHighlightBody(agentId)).body;
  if (kind === "feedback_14day") return (await generateFeedbackBody(agentId)).body;
  throw new Error(`unknown ScheduledEmail.kind: ${kind}`);
}

export async function processDueCheckpoints(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  deferred: number;
  cancelled: number;
}> {
  const now = new Date();
  const rows = await prisma.scheduledEmail.findMany({
    where: { status: "pending", scheduledAt: { lte: now } },
    include: {
      agent: { select: { id: true, name: true, status: true, timezone: true } },
      client: {
        select: {
          email: true,
          preferredName: true,
          contactName: true,
          businessName: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: CHECKPOINT_TICK_CAP,
  });

  const stats = { processed: rows.length, sent: 0, failed: 0, deferred: 0, cancelled: 0 };

  for (const row of rows) {
    // Agent no longer active → cancel the row; nothing to do.
    if (row.agent.status !== "active") {
      await prisma.scheduledEmail.update({
        where: { id: row.id },
        data: { status: "cancelled", errorMessage: `agent status: ${row.agent.status}` },
      });
      stats.cancelled++;
      continue;
    }

    // Respect business hours — leave pending, retry next tick.
    if (!isInBusinessHours(now, row.agent.timezone)) {
      stats.deferred++;
      continue;
    }

    try {
      const body = await generateBodyForKind(row.kind, row.agentId);
      if (!body) throw new Error("content generator returned empty body");

      const preferredName =
        row.client.preferredName ??
        row.client.contactName?.split(" ")[0] ??
        row.client.businessName;

      const { subject, html } = buildCheckpointEmail({
        kind: row.kind as CheckpointKind,
        agentName: row.agent.name,
        agentId: row.agentId,
        preferredName,
        clientBusinessName: row.client.businessName,
        body,
      });

      await sendEmail({
        agentId: row.agentId,
        agentName: row.agent.name,
        to: row.client.email,
        subject,
        html,
        replyToAgentId: row.agentId,
      });

      await prisma.scheduledEmail.update({
        where: { id: row.id },
        data: { status: "sent", sentAt: new Date() },
      });
      stats.sent++;
      logger.info("Checkpoint email sent", { agentId: row.agentId, kind: row.kind });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.scheduledEmail.update({
        where: { id: row.id },
        data: { status: "failed", errorMessage: message },
      });
      stats.failed++;
      logger.error("Checkpoint email failed", {
        scheduledEmailId: row.id,
        agentId: row.agentId,
        kind: row.kind,
        error: message,
      });
    }
  }

  if (stats.processed > 0) {
    logger.info("Checkpoint cron tick complete", stats);
  }
  return stats;
}

/** Start the hourly checkpoint cron. Call once from initScheduler. */
export function startCheckpointCron(): void {
  if (checkpointCronTask) return; // idempotent
  checkpointCronTask = cron.schedule("0 * * * *", async () => {
    try {
      await processDueCheckpoints();
    } catch (error) {
      logger.error("Checkpoint cron tick threw", { error });
    }
  });
  logger.info("Checkpoint cron started", { schedule: "0 * * * *" });
}
