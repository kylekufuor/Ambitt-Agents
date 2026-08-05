import prisma from "../shared/db.js";
import { sendKyleWhatsApp, sendOperatorRichEmail } from "../shared/whatsapp.js";
import { buildFleetDigestEmail, type FleetRow } from "./templates/ops-alert-email.js";
import logger from "../shared/logger.js";

// ---------------------------------------------------------------------------
// Fleet health + budget enforcement. Runs hourly (startFleetHealthCron in
// oracle/scheduler.ts) and on demand via GET /fleet + POST /cron/fleet-health.
//
// Every run writes a `fleet_health_check` OracleAction row — that row IS the
// liveness signal the dashboard reads ("last health check …"), so an absent /
// old row means the sweep is dead, not that the fleet is quiet.
//
// Repeat-alert suppression (added when the hourly cron was wired up): the stale
// list re-reports the SAME agents every tick — a weekly-schedule agent is
// legitimately ">25h since last run" six days out of seven — so an unchanged
// alert set would page the operator every hour forever. An unchanged set is
// re-sent at most once per FLEET_ALERT_REPEAT_MS; any change to the set (new
// stale agent, new budget alert) pages immediately. Budget alerts are one-shot
// by construction (budgetWarningAt latches, and auto-pause takes the agent out
// of the active set), so this suppression is really about staleness.
// ---------------------------------------------------------------------------

export const FLEET_ALERT_REPEAT_MS = 24 * 60 * 60 * 1000;

// Stable identity of an alert set: agent ids + what's wrong with each, order
// independent, no volatile numbers (hours-since-run ticks up every hour and
// would defeat the suppression). PURE.
export function fleetAlertKey(parts: string[]): string {
  return [...new Set(parts)].sort().join("|");
}

// PURE. `last` is the previously-sent alert (null = nothing sent this process).
export function shouldSendFleetAlert(
  key: string,
  last: { key: string; atMs: number } | null,
  nowMs: number,
  repeatMs: number = FLEET_ALERT_REPEAT_MS,
): boolean {
  if (key === "") return false; // nothing wrong → nothing to send
  if (last === null) return true;
  if (last.key !== key) return true; // the set changed → page now
  return nowMs - last.atMs >= repeatMs;
}

// In-process memory of the last alert we actually sent. A restart re-pages once
// — acceptable, and it keeps this dedupe schema-free.
let lastFleetAlert: { key: string; atMs: number } | null = null;

interface AgentBudgetStatus {
  agentId: string;
  name: string;
  agentType: string;
  budgetMonthlyCents: number;
  spentCents: number;
  percentUsed: number;
  status: "ok" | "warning" | "exceeded";
}

interface FleetStatus {
  total: number;
  active: number;
  pending: number;
  paused: number;
  killed: number;
  unhealthy: string[];
  stale: string[];
  budgetAlerts: AgentBudgetStatus[];
}

/** One agent as the digest sees it, kept alongside the legacy string list. */
interface FleetBoardAgent {
  name: string;
  agentType: string;
  status: string;
  hoursSinceRun: number | null;
}

/**
 * Compose the fleet digest — Option B, the status board.
 *
 * Every agent gets a row, not just the broken ones. A digest that lists only
 * problems cannot tell you the difference between "everything else is fine"
 * and "everything else was never checked", and that distinction is the whole
 * reason to read a daily summary.
 *
 * The subject leads with the count that matters. "Fleet: 1 stale, 2 running"
 * is readable from a notification; "Fleet Health" is not.
 */
export function buildFleetHealthAlert(
  board: FleetBoardAgent[],
  totals: { active: number; total: number }
): { subject: string; html: string } {
  const rows: FleetRow[] = board.map((a) => {
    if (a.status === "paused") {
      return { name: a.name, context: a.agentType, state: "Paused", severity: "attention" as const };
    }
    if (a.status !== "active") {
      return { name: a.name, context: a.agentType, state: "Not running", severity: "attention" as const };
    }
    if (a.hoursSinceRun != null && a.hoursSinceRun > 25) {
      const days = Math.floor(a.hoursSinceRun / 24);
      return {
        name: a.name,
        context: a.agentType,
        state: days >= 1 ? `Stale ${days} day${days === 1 ? "" : "s"}` : `Stale ${Math.round(a.hoursSinceRun)}h`,
        severity: "problem" as const,
      };
    }
    return { name: a.name, context: a.agentType, state: "Running", severity: "good" as const };
  });

  const stale = rows.filter((r) => r.severity === "problem").length;
  const paused = rows.filter((r) => r.severity === "attention").length;

  const headline =
    stale === 0
      ? "Everything ran on time."
      : stale === 1
        ? "One agent needs you."
        : `${stale} agents need you.`;

  const subject =
    stale === 0
      ? `Fleet is healthy, ${totals.active} of ${totals.total} running`
      : `Fleet: ${stale} stale, ${totals.active} running${paused ? `, ${paused} paused` : ""}`;

  const when = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const portal = process.env.DASHBOARD_URL ?? "https://dashboard.ambitt.agency";

  return {
    subject,
    html: buildFleetDigestEmail({
      title: `Fleet health · ${when}`,
      headline,
      rows,
      cta: { label: "Open the dashboard", url: portal },
      whyLine:
        "Sent once a day. You get this because a scheduled agent missed more than 24 hours of runs, or a budget crossed its warning line.",
    }),
  };
}

export async function checkFleetHealth(): Promise<FleetStatus> {
  const agents = await prisma.agent.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      lastRunAt: true,
      schedule: true,
      agentType: true,
      budgetMonthlyCents: true,
      budgetWarningAt: true,
      clientId: true,
    },
  });

  const status: FleetStatus = {
    total: agents.length,
    active: 0,
    pending: 0,
    paused: 0,
    killed: 0,
    unhealthy: [],
    stale: [],
    budgetAlerts: [],
  };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Identity of this run's alert set, for repeat suppression (see header).
  const alertKeyParts: string[] = [];

  for (const agent of agents) {
    switch (agent.status) {
      case "active":
        status.active++;
        break;
      case "pending_approval":
        status.pending++;
        break;
      case "paused":
        status.paused++;
        break;
      case "killed":
        status.killed++;
        break;
    }

    // Stale check — active agent hasn't run in over 25 hours
    if (agent.status === "active" && agent.lastRunAt) {
      const hoursSinceRun =
        (now.getTime() - agent.lastRunAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceRun > 25) {
        status.stale.push(
          `${agent.name} (${agent.agentType}) — last ran ${Math.round(hoursSinceRun)}h ago`
        );
        alertKeyParts.push(`stale:${agent.id}`);
      }
    }

    // Budget check — only for active agents
    if (agent.status === "active" && agent.budgetMonthlyCents > 0) {
      const monthlyUsage = await prisma.apiUsage.aggregate({
        where: {
          agentId: agent.id,
          createdAt: { gte: monthStart },
        },
        _sum: { costInCents: true },
      });

      const spentCents = monthlyUsage._sum.costInCents ?? 0;
      const percentUsed = (spentCents / agent.budgetMonthlyCents) * 100;

      // Auto-pause at 100%
      if (percentUsed >= 100) {
        await prisma.agent.update({
          where: { id: agent.id },
          data: { status: "paused", budgetPausedAt: now },
        });

        await prisma.oracleAction.create({
          data: {
            actionType: "alert_kyle",
            description: `Agent "${agent.name}" auto-paused — budget exceeded ($${(spentCents / 100).toFixed(2)} / $${(agent.budgetMonthlyCents / 100).toFixed(2)})`,
            agentId: agent.id,
            clientId: agent.clientId,
            status: "completed",
          },
        });

        status.budgetAlerts.push({
          agentId: agent.id,
          name: agent.name,
          agentType: agent.agentType,
          budgetMonthlyCents: agent.budgetMonthlyCents,
          spentCents,
          percentUsed,
          status: "exceeded",
        });
        alertKeyParts.push(`budget-exceeded:${agent.id}`);

        logger.warn("Agent auto-paused — budget exceeded", {
          agentId: agent.id,
          name: agent.name,
          spentCents,
          budgetCents: agent.budgetMonthlyCents,
        });
      }
      // Warning at 80%
      else if (percentUsed >= 80 && !agent.budgetWarningAt) {
        await prisma.agent.update({
          where: { id: agent.id },
          data: { budgetWarningAt: now },
        });

        await prisma.oracleAction.create({
          data: {
            actionType: "alert_kyle",
            description: `Agent "${agent.name}" at ${Math.round(percentUsed)}% budget ($${(spentCents / 100).toFixed(2)} / $${(agent.budgetMonthlyCents / 100).toFixed(2)})`,
            agentId: agent.id,
            clientId: agent.clientId,
            status: "completed",
          },
        });

        status.budgetAlerts.push({
          agentId: agent.id,
          name: agent.name,
          agentType: agent.agentType,
          budgetMonthlyCents: agent.budgetMonthlyCents,
          spentCents,
          percentUsed,
          status: "warning",
        });
        alertKeyParts.push(`budget-warning:${agent.id}`);

        logger.info("Agent budget warning", {
          agentId: agent.id,
          name: agent.name,
          percentUsed: Math.round(percentUsed),
        });
      }
    }
  }

  // Merge stale into unhealthy for backwards compat
  status.unhealthy = [...status.stale];

  // Log the health check
  await prisma.oracleAction.create({
    data: {
      actionType: "fleet_health_check",
      description: `Fleet: ${status.active} active, ${status.pending} pending, ${status.stale.length} stale, ${status.budgetAlerts.length} budget alerts`,
      status: "completed",
      result: JSON.stringify(status),
    },
  });

  // Alert Kyle if anything needs attention
  const alerts: string[] = [];
  if (status.stale.length > 0) {
    alerts.push(`Stale agents:\n${status.stale.map((s) => `  • ${s}`).join("\n")}`);
  }
  if (status.budgetAlerts.length > 0) {
    alerts.push(
      `Budget alerts:\n${status.budgetAlerts.map((b) => `  • ${b.name}: ${Math.round(b.percentUsed)}% (${b.status})`).join("\n")}`
    );
  }

  const alertKey = fleetAlertKey(alertKeyParts);
  const sendAlert = alerts.length > 0 && shouldSendFleetAlert(alertKey, lastFleetAlert, now.getTime());
  if (sendAlert) {
    try {
      // Every agent goes on the board, not just the broken ones — see
      // buildFleetHealthAlert. Built here because `agents` is in scope and the
      // status object deliberately keeps its legacy string shape for the
      // OracleAction row and the WhatsApp callers that still read it.
      const board = agents.map((a) => ({
        name: a.name,
        agentType: a.agentType,
        status: a.status,
        hoursSinceRun: a.lastRunAt
          ? (now.getTime() - a.lastRunAt.getTime()) / (1000 * 60 * 60)
          : null,
      }));
      await sendOperatorRichEmail(
        buildFleetHealthAlert(board, { active: status.active, total: status.total })
      );
      // Only latch on a successful send, so a failed send retries next tick.
      lastFleetAlert = { key: alertKey, atMs: now.getTime() };
    } catch (error) {
      logger.error("Failed to send fleet health alert", { error });
    }
  }

  logger.info("Fleet health check complete", {
    active: status.active,
    stale: status.stale.length,
    budgetAlerts: status.budgetAlerts.length,
    alerted: sendAlert,
  });

  return status;
}

export async function retryFailedAgent(
  agentId: string,
  maxRetries = 3
): Promise<boolean> {
  const recentTasks = await prisma.task.findMany({
    where: { agentId, status: "failed" },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  if (recentTasks.length === 0) return true;

  const task = recentTasks[0];
  if (task.retryCount >= maxRetries) {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { name: true, agentType: true },
    });

    try {
      await sendKyleWhatsApp(
        `🔴 Agent "${agent?.name}" (${agent?.agentType}) failed ${maxRetries} times.\n` +
          `Last error: ${task.errorMessage?.slice(0, 200)}\n\n` +
          `Agent has been paused. Review in dashboard.`
      );
    } catch (error) {
      logger.error("Failed to send retry alert", { agentId, error });
    }

    await prisma.agent.update({
      where: { id: agentId },
      data: { status: "paused" },
    });

    await prisma.oracleAction.create({
      data: {
        actionType: "alert_kyle",
        description: `Agent ${agentId} exceeded ${maxRetries} retries, paused`,
        agentId,
        status: "completed",
      },
    });

    return false;
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      retryCount: task.retryCount + 1,
      status: "pending",
    },
  });

  await prisma.oracleAction.create({
    data: {
      actionType: "retry_agent",
      description: `Retrying task ${task.id} for agent ${agentId} (attempt ${task.retryCount + 1}/${maxRetries})`,
      agentId,
      status: "completed",
    },
  });

  logger.info("Task queued for retry", {
    taskId: task.id,
    agentId,
    attempt: task.retryCount + 1,
  });

  return true;
}

export default { checkFleetHealth, retryFailedAgent };
