// Pricing in cents per million tokens — keep in sync with shared/claude.ts, gemini.ts, openai.ts
export const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number; label: string }> = {
  "claude-sonnet-4-6": { inputPerMillion: 300, outputPerMillion: 1500, label: "Claude Sonnet" },
  "claude-sonnet": { inputPerMillion: 300, outputPerMillion: 1500, label: "Claude Sonnet" },
  "gemini": { inputPerMillion: 7.5, outputPerMillion: 30, label: "Gemini Flash" },
  "gemini-flash": { inputPerMillion: 7.5, outputPerMillion: 30, label: "Gemini Flash" },
  "gemini-2.0-flash": { inputPerMillion: 7.5, outputPerMillion: 30, label: "Gemini Flash" },
  "gpt-4o": { inputPerMillion: 250, outputPerMillion: 1000, label: "GPT-4o" },
};

/** Recalculate cost in cents (float) from raw token counts. Falls back to stored value for unknown models. */
export function recalcCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
  fallbackCostInCents: number
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return fallbackCostInCents;
  return (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;
}

/** Predict month-end cost using weighted blend of current pace and last month baseline. */
export function projectMonthEnd(
  spendSoFar: number,
  daysElapsed: number,
  daysInMonth: number,
  lastMonthTotal?: number
): number {
  if (daysElapsed <= 0) return lastMonthTotal ?? 0;

  const linearProjection = (spendSoFar / daysElapsed) * daysInMonth;

  if (lastMonthTotal == null || lastMonthTotal === 0) return linearProjection;

  // Early in month: trust last month more. Late: trust current trend.
  let currentWeight: number;
  if (daysElapsed <= 3) currentWeight = 0.4;
  else if (daysElapsed <= 15) currentWeight = 0.7;
  else currentWeight = 0.85;

  return currentWeight * linearProjection + (1 - currentWeight) * lastMonthTotal;
}

// --- Types ---

export interface ModelSummary {
  model: string;
  label: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  pctOfTotal: number;
}

export interface AgentCostSummary {
  agentId: string;
  agentName: string;
  agentType: string;
  clientId: string;
  clientName: string;
  callCount: number;
  costCents: number;
  budgetCents: number;
  projectedCents: number;
  overageCents: number;
  status: string;
}

export interface ClientCostSummary {
  clientId: string;
  businessName: string;
  agentCount: number;
  costCents: number;
  retainerCents: number;
  projectedCents: number;
  marginCents: number;
  marginPct: number;
}

export interface CostsKPIs {
  totalSpendCents: number;
  projectedCents: number;
  lastMonthCents: number;
  vsLastMonthPct: number | null;
  totalRetainerCents: number;
  grossMarginPct: number;
}

interface UsageRow {
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costInCents: number;
}

interface AgentInfo {
  id: string;
  name: string;
  agentType: string;
  status: string;
  clientId: string;
  budgetMonthlyCents: number;
  monthlyRetainerCents: number;
  client: { id: string; businessName: string };
}

export function aggregateCosts(
  thisMonthRows: UsageRow[],
  lastMonthRows: UsageRow[],
  agents: AgentInfo[],
  daysElapsed: number,
  daysInMonth: number
): {
  kpis: CostsKPIs;
  byModel: ModelSummary[];
  byAgent: AgentCostSummary[];
  byClient: ClientCostSummary[];
} {
  // --- Recalculate this month's costs ---
  const modelAgg: Record<string, { callCount: number; inputTokens: number; outputTokens: number; costCents: number }> = {};
  const agentAgg: Record<string, { callCount: number; costCents: number }> = {};
  let totalSpendCents = 0;

  for (const row of thisMonthRows) {
    const cost = recalcCostCents(row.model, row.inputTokens, row.outputTokens, row.costInCents);
    totalSpendCents += cost;

    // By model
    const mKey = MODEL_PRICING[row.model]?.label ?? row.model;
    if (!modelAgg[mKey]) modelAgg[mKey] = { callCount: 0, inputTokens: 0, outputTokens: 0, costCents: 0 };
    modelAgg[mKey].callCount++;
    modelAgg[mKey].inputTokens += row.inputTokens;
    modelAgg[mKey].outputTokens += row.outputTokens;
    modelAgg[mKey].costCents += cost;

    // By agent
    if (!agentAgg[row.agentId]) agentAgg[row.agentId] = { callCount: 0, costCents: 0 };
    agentAgg[row.agentId].callCount++;
    agentAgg[row.agentId].costCents += cost;
  }

  // --- Last month totals (per agent and overall) ---
  let lastMonthTotal = 0;
  const lastMonthByAgent: Record<string, number> = {};
  for (const row of lastMonthRows) {
    const cost = recalcCostCents(row.model, row.inputTokens, row.outputTokens, row.costInCents);
    lastMonthTotal += cost;
    lastMonthByAgent[row.agentId] = (lastMonthByAgent[row.agentId] ?? 0) + cost;
  }

  // --- Projections ---
  const projectedTotal = projectMonthEnd(totalSpendCents, daysElapsed, daysInMonth, lastMonthTotal > 0 ? lastMonthTotal : undefined);

  // --- By Model ---
  const byModel: ModelSummary[] = Object.entries(modelAgg)
    .map(([label, data]) => ({
      model: label,
      label,
      callCount: data.callCount,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      costCents: data.costCents,
      pctOfTotal: totalSpendCents > 0 ? (data.costCents / totalSpendCents) * 100 : 0,
    }))
    .sort((a, b) => b.costCents - a.costCents);

  // --- By Agent ---
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const byAgent: AgentCostSummary[] = agents
    .filter((a) => a.status !== "killed")
    .map((agent) => {
      const agg = agentAgg[agent.id] ?? { callCount: 0, costCents: 0 };
      const projected = projectMonthEnd(
        agg.costCents,
        daysElapsed,
        daysInMonth,
        lastMonthByAgent[agent.id]
      );
      return {
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.agentType,
        clientId: agent.clientId,
        clientName: agent.client.businessName,
        callCount: agg.callCount,
        costCents: agg.costCents,
        budgetCents: agent.budgetMonthlyCents,
        projectedCents: projected,
        overageCents: Math.max(0, projected - agent.budgetMonthlyCents),
        status: agent.status,
      };
    })
    .sort((a, b) => b.costCents - a.costCents);

  // --- By Client ---
  const clientAgg: Record<string, { agentCount: number; costCents: number; retainerCents: number; projectedCents: number }> = {};
  for (const agent of agents) {
    if (agent.status === "killed") continue;
    const cId = agent.clientId;
    if (!clientAgg[cId]) clientAgg[cId] = { agentCount: 0, costCents: 0, retainerCents: 0, projectedCents: 0 };
    clientAgg[cId].agentCount++;

    const agg = agentAgg[agent.id] ?? { costCents: 0 };
    clientAgg[cId].costCents += agg.costCents;

    if (agent.status === "active") {
      clientAgg[cId].retainerCents += agent.monthlyRetainerCents;
    }

    const agentProjected = projectMonthEnd(
      agg.costCents,
      daysElapsed,
      daysInMonth,
      lastMonthByAgent[agent.id]
    );
    clientAgg[cId].projectedCents += agentProjected;
  }

  const byClient: ClientCostSummary[] = Object.entries(clientAgg)
    .map(([clientId, data]) => {
      const agent = agents.find((a) => a.clientId === clientId);
      const marginCents = data.retainerCents - data.projectedCents;
      return {
        clientId,
        businessName: agent?.client.businessName ?? "Unknown",
        agentCount: data.agentCount,
        costCents: data.costCents,
        retainerCents: data.retainerCents,
        projectedCents: data.projectedCents,
        marginCents,
        marginPct: data.retainerCents > 0 ? (marginCents / data.retainerCents) * 100 : 0,
      };
    })
    .sort((a, b) => b.costCents - a.costCents);

  // --- Total retainer ---
  const totalRetainerCents = agents
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + a.monthlyRetainerCents, 0);

  const grossMarginCents = totalRetainerCents - projectedTotal;

  // --- KPIs ---
  const kpis: CostsKPIs = {
    totalSpendCents,
    projectedCents: projectedTotal,
    lastMonthCents: lastMonthTotal,
    vsLastMonthPct: lastMonthTotal > 0 ? ((projectedTotal - lastMonthTotal) / lastMonthTotal) * 100 : null,
    totalRetainerCents,
    grossMarginPct: totalRetainerCents > 0 ? (grossMarginCents / totalRetainerCents) * 100 : 0,
  };

  return { kpis, byModel, byAgent, byClient };
}

/** Format cents (float) to dollar string with 2 decimal places */
export function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format large token counts with commas */
export function formatTokens(n: number): string {
  return n.toLocaleString();
}
