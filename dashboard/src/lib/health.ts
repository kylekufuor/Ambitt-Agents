// ---------------------------------------------------------------------------
// Fleet health metrics — agent error rate, client engagement, churn risk.
// All derived from existing tables: ApiUsage (runs) and ConversationMessage.
// ---------------------------------------------------------------------------

import prisma from "./db";

export interface AgentErrorRate {
  runs: number; // primary runs in the window
  runsWithErrors: number;
  totalToolErrors: number;
  errorRatePct: number; // 0-100
}

/**
 * Returns the tool-error rate for an agent over the last `windowDays` days.
 * Only counts primary runs (one row per logical agent invocation).
 */
export async function getAgentErrorRate(
  agentId: string,
  windowDays = 30
): Promise<AgentErrorRate> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.apiUsage.findMany({
    where: {
      agentId,
      taskType: "agent_runtime",
      isPrimaryRun: true,
      createdAt: { gte: since },
    },
    select: { toolErrorCount: true },
  });

  const runs = rows.length;
  const runsWithErrors = rows.filter((r) => r.toolErrorCount > 0).length;
  const totalToolErrors = rows.reduce((s, r) => s + r.toolErrorCount, 0);
  const errorRatePct = runs > 0 ? (runsWithErrors / runs) * 100 : 0;

  return { runs, runsWithErrors, totalToolErrors, errorRatePct };
}

export interface ClientEngagement {
  agentMessages: number; // outbound from agents (role=agent)
  clientMessages: number; // inbound from the client (role=client)
  replyRatePct: number; // clientMessages / agentMessages (capped at 100 for display)
  lastClientReplyAt: Date | null;
  daysSinceLastReply: number | null;
}

/**
 * Engagement signal for a client across all their agents in the last `windowDays`.
 * replyRate = inbound / outbound. Above ~50% means they're actively engaging.
 */
export async function getClientEngagement(
  clientId: string,
  windowDays = 30
): Promise<ClientEngagement> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [counts, lastReply] = await Promise.all([
    prisma.conversationMessage.groupBy({
      by: ["role"],
      where: { clientId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.conversationMessage.findFirst({
      where: { clientId, role: "client" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const agentMessages = counts.find((c) => c.role === "agent")?._count._all ?? 0;
  const clientMessages = counts.find((c) => c.role === "client")?._count._all ?? 0;
  const replyRatePct = agentMessages > 0 ? Math.min(100, (clientMessages / agentMessages) * 100) : 0;
  const daysSinceLastReply = lastReply
    ? Math.floor((Date.now() - lastReply.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    agentMessages,
    clientMessages,
    replyRatePct,
    lastClientReplyAt: lastReply?.createdAt ?? null,
    daysSinceLastReply,
  };
}

export type ChurnRiskLevel = "ok" | "watching" | "at_risk";

export interface ChurnRisk {
  level: ChurnRiskLevel;
  reason: string;
  thisMonthRuns: number;
  lastMonthRuns: number;
  daysSinceLastReply: number | null;
}

/**
 * Churn risk per client based on declining activity and silence.
 * - at_risk: no client reply in 21+ days OR this-month runs < 40% of last month's
 * - watching: no client reply in 10-21 days OR this-month runs < 70% of last month's
 * - ok: otherwise
 */
export async function getClientChurnRisk(clientId: string): Promise<ChurnRisk> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const agents = await prisma.agent.findMany({
    where: { clientId, status: { not: "killed" } },
    select: { id: true },
  });
  const agentIds = agents.map((a) => a.id);

  if (agentIds.length === 0) {
    return {
      level: "ok",
      reason: "No active agents",
      thisMonthRuns: 0,
      lastMonthRuns: 0,
      daysSinceLastReply: null,
    };
  }

  const [thisMonthRuns, lastMonthRuns, lastReply] = await Promise.all([
    prisma.apiUsage.count({
      where: {
        agentId: { in: agentIds },
        taskType: "agent_runtime",
        isPrimaryRun: true,
        createdAt: { gte: monthStart },
      },
    }),
    prisma.apiUsage.count({
      where: {
        agentId: { in: agentIds },
        taskType: "agent_runtime",
        isPrimaryRun: true,
        createdAt: { gte: lastMonthStart, lt: monthStart },
      },
    }),
    prisma.conversationMessage.findFirst({
      where: { clientId, role: "client" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const daysSinceLastReply = lastReply
    ? Math.floor((now.getTime() - lastReply.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Silence trumps volume — a quiet client churns even if runs are scheduled.
  if (daysSinceLastReply !== null && daysSinceLastReply >= 21) {
    return { level: "at_risk", reason: `No reply in ${daysSinceLastReply} days`, thisMonthRuns, lastMonthRuns, daysSinceLastReply };
  }

  if (lastMonthRuns > 0) {
    const ratio = thisMonthRuns / lastMonthRuns;
    if (ratio < 0.4) {
      return { level: "at_risk", reason: `Runs down ${Math.round((1 - ratio) * 100)}% vs last month`, thisMonthRuns, lastMonthRuns, daysSinceLastReply };
    }
    if (ratio < 0.7) {
      return { level: "watching", reason: `Runs down ${Math.round((1 - ratio) * 100)}% vs last month`, thisMonthRuns, lastMonthRuns, daysSinceLastReply };
    }
  }

  if (daysSinceLastReply !== null && daysSinceLastReply >= 10) {
    return { level: "watching", reason: `No reply in ${daysSinceLastReply} days`, thisMonthRuns, lastMonthRuns, daysSinceLastReply };
  }

  return { level: "ok", reason: "Active", thisMonthRuns, lastMonthRuns, daysSinceLastReply };
}
