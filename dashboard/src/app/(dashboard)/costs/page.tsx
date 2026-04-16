import prisma from "@/lib/db";
import Link from "next/link";
import {
  aggregateCosts,
  centsToUsd,
  formatTokens,
  type ModelSummary,
  type AgentCostSummary,
  type ClientCostSummary,
  type CostsKPIs,
} from "@/lib/costs";
import { CostTabs } from "./cost-tabs";

export const dynamic = "force-dynamic";

async function getCostsData() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const daysElapsed = Math.max(1, (now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const [thisMonthRows, lastMonthRows, agents] = await Promise.all([
    prisma.apiUsage.findMany({
      where: { createdAt: { gte: monthStart } },
      select: {
        agentId: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        costInCents: true,
        createdAt: true,
      },
    }),
    prisma.apiUsage.findMany({
      where: { createdAt: { gte: lastMonthStart, lt: monthStart } },
      select: {
        agentId: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        costInCents: true,
      },
    }),
    prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        agentType: true,
        status: true,
        clientId: true,
        budgetMonthlyCents: true,
        monthlyRetainerCents: true,
        client: { select: { id: true, businessName: true } },
      },
    }),
  ]);

  return aggregateCosts(thisMonthRows, lastMonthRows, agents, daysElapsed, daysInMonth);
}

export default async function CostsPage() {
  const { kpis, byModel, byAgent, byClient } = await getCostsData();

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Costs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Accurate to the cent — recalculated from raw token counts
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Spend (MTD)</p>
          <p className="text-3xl font-bold text-foreground mt-2 tabular-nums">{centsToUsd(kpis.totalSpendCents)}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Projected Month-End</p>
          <p className="text-3xl font-bold text-foreground mt-2 tabular-nums">{centsToUsd(kpis.projectedCents)}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">vs Last Month</p>
          {kpis.vsLastMonthPct != null ? (
            <div className="mt-2 flex items-baseline gap-2">
              <p className={`text-3xl font-bold tabular-nums ${kpis.vsLastMonthPct > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {kpis.vsLastMonthPct > 0 ? "+" : ""}{kpis.vsLastMonthPct.toFixed(1)}%
              </p>
              <span className="text-muted-foreground text-xs">({centsToUsd(kpis.lastMonthCents)} last mo)</span>
            </div>
          ) : (
            <p className="text-muted-foreground/60 text-sm mt-2">No prior data</p>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Gross Margin</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className={`text-3xl font-bold tabular-nums ${kpis.grossMarginPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {kpis.grossMarginPct.toFixed(1)}%
            </p>
            <span className="text-muted-foreground text-xs">
              ({centsToUsd(kpis.totalRetainerCents)} retainer)
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <CostTabs byModel={byModel} byAgent={byAgent} byClient={byClient} />
    </div>
  );
}
