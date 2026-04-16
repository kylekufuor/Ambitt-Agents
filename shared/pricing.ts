import prisma from "./db.js";

// ---------------------------------------------------------------------------
// Ambitt Agents — Pricing Model
// ---------------------------------------------------------------------------
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

export type PricingTier = "starter" | "growth" | "scale" | "enterprise";

export const SECOND_AGENT_DISCOUNT_PCT = 20;

interface TierConfig {
  tier: PricingTier;
  label: string;
  monthlyCents: number;
  maxAgents: number;
  interactionsPerMonth: number; // -1 = unlimited
  overageRateCents: number;     // price per interaction beyond the tier's limit
  setupFeeCentsMin: number;
  setupFeeCentsMax: number;
}

export const TIERS: Record<PricingTier, TierConfig> = {
  starter: {
    tier: "starter",
    label: "Starter",
    monthlyCents: 49900,
    maxAgents: 1,
    interactionsPerMonth: 1000,
    overageRateCents: 60,
    setupFeeCentsMin: 100000,
    setupFeeCentsMax: 250000,
  },
  growth: {
    tier: "growth",
    label: "Growth",
    monthlyCents: 99900,
    maxAgents: 2,
    interactionsPerMonth: 3000,
    overageRateCents: 40,
    setupFeeCentsMin: 100000,
    setupFeeCentsMax: 250000,
  },
  scale: {
    tier: "scale",
    label: "Scale",
    monthlyCents: 249900,
    maxAgents: 3,
    interactionsPerMonth: 10000,
    overageRateCents: 30,
    setupFeeCentsMin: 100000,
    setupFeeCentsMax: 250000,
  },
  enterprise: {
    tier: "enterprise",
    label: "Enterprise",
    monthlyCents: 0, // custom pricing
    maxAgents: -1,    // unlimited
    interactionsPerMonth: -1,
    overageRateCents: 0, // billed separately
    setupFeeCentsMin: 0,
    setupFeeCentsMax: 0,
  },
};

/** Get overage rate (cents per extra interaction) for a tier. */
export function getOverageRate(tier: PricingTier): number {
  return TIERS[tier]?.overageRateCents ?? 0;
}

/** Get tier config by name. */
export function getTierConfig(tier: PricingTier): TierConfig {
  return TIERS[tier];
}

/** Get the interaction limit for a tier. Returns -1 for unlimited. */
export function getInteractionLimit(tier: PricingTier): number {
  return TIERS[tier].interactionsPerMonth;
}

/** Get monthly price in cents for a tier (undiscounted). */
export function getMonthlyPrice(tier: PricingTier): number {
  return TIERS[tier].monthlyCents;
}

/** Get annual price in cents (10 months — 2 months free). */
export function getAnnualPrice(tier: PricingTier): number {
  return TIERS[tier].monthlyCents * 10;
}

/**
 * Compute effective per-agent monthly retainer for a given agent position.
 * agentIndex is zero-based: 0 = first agent on account (full price), 1+ = 20% off.
 * Enterprise is custom — always returns 0 (billed separately).
 */
export function computeAgentRetainerCents(tier: PricingTier, agentIndex: number): number {
  if (tier === "enterprise") return 0;
  const base = TIERS[tier].monthlyCents;
  if (agentIndex === 0) return base;
  // 20% off for 2nd+ agent, round to nearest cent.
  return Math.round(base * (100 - SECOND_AGENT_DISCOUNT_PCT) / 100);
}

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

/** The month key used for grouping OverageEvent rows for end-of-month invoicing. */
export function currentBillingCycleMonth(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default {
  TIERS,
  SECOND_AGENT_DISCOUNT_PCT,
  getTierConfig,
  getInteractionLimit,
  getOverageRate,
  getMonthlyPrice,
  getAnnualPrice,
  computeAgentRetainerCents,
  calculateClientMRR,
  recalcClientRetainers,
  canAddAgent,
  currentBillingCycleMonth,
};
