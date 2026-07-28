import prisma from "../shared/db.js";
import { sendKyleWhatsApp } from "../shared/whatsapp.js";
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
      await sendKyleWhatsApp(
        `⚠️ Fleet Health\n\n${alerts.join("\n\n")}\n\nFleet: ${status.active} active / ${status.total} total`
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
