// ---------------------------------------------------------------------------
// Ambitt Agents — Pricing Model (server-side helpers)
// ---------------------------------------------------------------------------
//
// Tier config and pure helpers live in `./pricing-constants.ts` (no Prisma
// import — safe for client bundles). This file adds the server-only helpers
// that touch the DB: retainer recalc, MRR calc, agent-cap enforcement.
//
// SMB Track — NO tool limit (unlimited tools across all tiers, gated by
// interaction volume). 2nd+ agent gets 20% off tier price.
// Pricing anchored to managed AI agency / fractional worker market, not
// self-serve AI tools. Targets 62%+ contribution margin at full utilization.
// ─────────────────────────────────────────────────────────────────────────────
// Tier    | Price     | Agents | Interactions/mo | Setup Fee
// Starter | $499/mo   | 1      | 1,000           | $1,000–2,500
// Growth  | $999/mo   | 2      | 3,000           | $1,000–2,500
// Scale   | $2,499/mo | 3      | 10,000          | $1,000–2,500
// Annual  | 2 months free (10 months billed)
//
// Overage: everyone gets overage. When an agent passes its tier's interaction
// limit, each extra interaction is charged at the tier's overage rate:
//   Starter: $0.60 · Growth: $0.40 · Scale: $0.30
// Rates are ~20% above the tier's effective included per-interaction price,
// creating natural upgrade pressure (Starter→Growth at ~1,833 interactions,
// Growth→Scale at ~6,750). Matches industry benchmark of 15-25% overage premium.
// Logged as OverageEvent rows grouped by billingCycleMonth for end-of-month invoicing.
//
// Enterprise Track
// ─────────────────────────────────────────────────────────────────────────────
// Discovery & Strategy:         $5,000–15,000 one-time
// Implementation & Config:      $10,000–25,000 one-time
// Managed Service Retainer:     $2,500–7,500/mo per agent
// Additional agent:             +$2,000–4,000/mo
// Custom MCP integration:       $2,500–5,000 one-time per tool
// ---------------------------------------------------------------------------

import prisma from "./db.js";
import {
  TIERS,
  SECOND_AGENT_DISCOUNT_PCT,
  computeAgentRetainerCents,
  type PricingTier,
} from "./pricing-constants.js";

export {
  TIERS,
  SECOND_AGENT_DISCOUNT_PCT,
  getTierConfig,
  getInteractionLimit,
  getOverageRate,
  getMonthlyPrice,
  getAnnualPrice,
  computeAgentRetainerCents,
  currentBillingCycleMonth,
  type PricingTier,
  type TierConfig,
} from "./pricing-constants.js";

/** Calculate total MRR for a client based on their agents. */
export async function calculateClientMRR(clientId: string): Promise<{
  totalMonthlyCents: number;
  agentCount: number;
  breakdown: Array<{ agentId: string; agentName: string; tier: string; monthlyCents: number }>;
}> {
  const agents = await prisma.agent.findMany({
    where: { clientId, status: "active" },
    select: { id: true, name: true, pricingTier: true, monthlyRetainerCents: true },
  });

  const breakdown = agents.map((a) => ({
    agentId: a.id,
    agentName: a.name,
    tier: a.pricingTier,
    monthlyCents: a.monthlyRetainerCents,
  }));

  const totalMonthlyCents = breakdown.reduce((sum, a) => sum + a.monthlyCents, 0);

  return { totalMonthlyCents, agentCount: agents.length, breakdown };
}

/**
 * Recalculate retainers for all agents of a client.
 * First agent (by createdAt) pays full tier price. 2nd+ get 20% off.
 * Killed agents are excluded from discount ordering so live agents don't get
 * bumped when historical agents exist.
 */
export async function recalcClientRetainers(clientId: string): Promise<{
  agentCount: number;
  totalMonthlyCents: number;
}> {
  const agents = await prisma.agent.findMany({
    where: { clientId, status: { in: ["active", "pending_approval"] } },
    select: { id: true, pricingTier: true },
    orderBy: { createdAt: "asc" },
  });

  let totalMonthlyCents = 0;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const tier = agent.pricingTier as PricingTier;
    const monthlyCents = computeAgentRetainerCents(tier, i);
    const interactionLimit = TIERS[tier]?.interactionsPerMonth ?? TIERS.starter.interactionsPerMonth;

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        monthlyRetainerCents: monthlyCents,
        interactionLimit,
      },
    });

    totalMonthlyCents += monthlyCents;
  }

  return { agentCount: agents.length, totalMonthlyCents };
}

/** Check if a client can add another agent based on their current tier. */
export async function canAddAgent(clientId: string, tier: PricingTier): Promise<boolean> {
  const config = TIERS[tier];
  if (config.maxAgents === -1) return true; // enterprise — unlimited

  const currentCount = await prisma.agent.count({
    where: { clientId, status: { in: ["active", "pending_approval"] } },
  });

  return currentCount < config.maxAgents;
}

import {
  getTierConfig as _gtc,
  getInteractionLimit as _gil,
  getOverageRate as _gor,
  getMonthlyPrice as _gmp,
  getAnnualPrice as _gap,
  currentBillingCycleMonth as _cbcm,
} from "./pricing-constants.js";

export default {
  TIERS,
  SECOND_AGENT_DISCOUNT_PCT,
  getTierConfig: _gtc,
  getInteractionLimit: _gil,
  getOverageRate: _gor,
  getMonthlyPrice: _gmp,
  getAnnualPrice: _gap,
  computeAgentRetainerCents,
  calculateClientMRR,
  recalcClientRetainers,
  canAddAgent,
  currentBillingCycleMonth: _cbcm,
};
