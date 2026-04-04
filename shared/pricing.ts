import prisma from "./db.js";

// ---------------------------------------------------------------------------
// Ambitt Agents — Pricing Model
// ---------------------------------------------------------------------------
//
// SMB Track
// ─────────────────────────────────────────────────────────────────────────────
// Tier       | Price     | Agents | Tools | Interactions/mo | Setup Fee
// Starter    | $497/mo   | 1      | 3     | 1,000           | $500–1,500
// Growth     | $697/mo   | 1      | 3     | 3,000           | $500–1,500
// Scale      | $997/mo   | 2      | 3 each| Unlimited       | $500–1,500
// Annual     | 2 months free (10 months billed)
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

interface TierConfig {
  tier: PricingTier;
  label: string;
  monthlyCents: number;
  maxAgents: number;
  maxToolsPerAgent: number;
  interactionsPerMonth: number; // -1 = unlimited
  setupFeeCentsMin: number;
  setupFeeCentsMax: number;
}

export const TIERS: Record<PricingTier, TierConfig> = {
  starter: {
    tier: "starter",
    label: "Starter",
    monthlyCents: 49700,
    maxAgents: 1,
    maxToolsPerAgent: 3,
    interactionsPerMonth: 1000,
    setupFeeCentsMin: 50000,
    setupFeeCentsMax: 150000,
  },
  growth: {
    tier: "growth",
    label: "Growth",
    monthlyCents: 69700,
    maxAgents: 1,
    maxToolsPerAgent: 3,
    interactionsPerMonth: 3000,
    setupFeeCentsMin: 50000,
    setupFeeCentsMax: 150000,
  },
  scale: {
    tier: "scale",
    label: "Scale",
    monthlyCents: 99700,
    maxAgents: 2,
    maxToolsPerAgent: 3,
    interactionsPerMonth: -1, // unlimited
    setupFeeCentsMin: 50000,
    setupFeeCentsMax: 150000,
  },
  enterprise: {
    tier: "enterprise",
    label: "Enterprise",
    monthlyCents: 0, // custom pricing
    maxAgents: -1,    // unlimited
    maxToolsPerAgent: -1,
    interactionsPerMonth: -1,
    setupFeeCentsMin: 0,
    setupFeeCentsMax: 0,
  },
};

/** Get tier config by name. */
export function getTierConfig(tier: PricingTier): TierConfig {
  return TIERS[tier];
}

/** Get the interaction limit for a tier. Returns -1 for unlimited. */
export function getInteractionLimit(tier: PricingTier): number {
  return TIERS[tier].interactionsPerMonth;
}

/** Get monthly price in cents for a tier. */
export function getMonthlyPrice(tier: PricingTier): number {
  return TIERS[tier].monthlyCents;
}

/** Get annual price in cents (10 months — 2 months free). */
export function getAnnualPrice(tier: PricingTier): number {
  return TIERS[tier].monthlyCents * 10;
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
 * Recalculate retainers for all active agents of a client.
 * Updates each agent's monthly retainer based on its pricing tier.
 */
export async function recalcClientRetainers(clientId: string): Promise<{
  agentCount: number;
  totalMonthlyCents: number;
}> {
  const agents = await prisma.agent.findMany({
    where: { clientId, status: { in: ["active", "pending_approval"] } },
    select: { id: true, pricingTier: true },
  });

  let totalMonthlyCents = 0;

  for (const agent of agents) {
    const tier = agent.pricingTier as PricingTier;
    const config = TIERS[tier] ?? TIERS.starter;
    const monthlyCents = config.monthlyCents;

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        monthlyRetainerCents: monthlyCents,
        interactionLimit: config.interactionsPerMonth,
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

export default {
  TIERS,
  getTierConfig,
  getInteractionLimit,
  getMonthlyPrice,
  getAnnualPrice,
  calculateClientMRR,
  recalcClientRetainers,
  canAddAgent,
};
