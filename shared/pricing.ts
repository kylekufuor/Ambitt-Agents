import prisma from "./db.js";

// ---------------------------------------------------------------------------
// Ambitt Agents — Volume Pricing
// ---------------------------------------------------------------------------
//
// Per-agent monthly rate decreases as the client adds more agents.
// Setup fee is flat per batch import, or per-agent for single adds.
//
// Tier      | Per Agent/mo | Example total
// 1 agent   | $99          | $99
// 2-3       | $79          | $158-237
// 4-6       | $59          | $236-354
// 7+        | $49          | $343+
//
// Setup: $199 per agent (single) or $499 flat (batch import of 3+)
// ---------------------------------------------------------------------------

const TIERS = [
  { minAgents: 7, perAgentCents: 4900 },
  { minAgents: 4, perAgentCents: 5900 },
  { minAgents: 2, perAgentCents: 7900 },
  { minAgents: 1, perAgentCents: 9900 },
];

const SETUP_FEE_SINGLE_CENTS = 19900;  // $199 per agent
const SETUP_FEE_BATCH_CENTS = 49900;   // $499 flat for batch (3+ agents)
const BATCH_THRESHOLD = 3;

/** Get per-agent monthly rate in cents based on total active agent count for a client. */
export function getPerAgentRate(totalAgents: number): number {
  for (const tier of TIERS) {
    if (totalAgents >= tier.minAgents) return tier.perAgentCents;
  }
  return 9900; // fallback
}

/** Get setup fee in cents. Batch discount if importing 3+ agents at once. */
export function getSetupFee(agentsBeingAdded: number): number {
  if (agentsBeingAdded >= BATCH_THRESHOLD) return SETUP_FEE_BATCH_CENTS;
  return SETUP_FEE_SINGLE_CENTS * agentsBeingAdded;
}

/** Calculate per-agent rate and total MRR for a client given their agent count. */
export function calculateClientPricing(totalAgents: number): {
  perAgentCents: number;
  totalMonthlyCents: number;
  tierLabel: string;
} {
  const perAgentCents = getPerAgentRate(totalAgents);
  return {
    perAgentCents,
    totalMonthlyCents: perAgentCents * totalAgents,
    tierLabel: `$${(perAgentCents / 100).toFixed(0)}/agent/mo (${totalAgents} agents)`,
  };
}

/**
 * Recalculate retainers for all active agents of a client.
 * Call this after adding/removing agents so pricing stays in sync.
 */
export async function recalcClientRetainers(clientId: string): Promise<{
  agentCount: number;
  perAgentCents: number;
  totalMonthlyCents: number;
}> {
  const agents = await prisma.agent.findMany({
    where: { clientId, status: { in: ["active", "pending_approval"] } },
    select: { id: true },
  });

  const count = agents.length;
  const perAgentCents = getPerAgentRate(count);

  // Update all agents to the new tier rate
  await prisma.agent.updateMany({
    where: { clientId, status: { in: ["active", "pending_approval"] } },
    data: { monthlyRetainerCents: perAgentCents },
  });

  return {
    agentCount: count,
    perAgentCents,
    totalMonthlyCents: perAgentCents * count,
  };
}

export default {
  getPerAgentRate,
  getSetupFee,
  calculateClientPricing,
  recalcClientRetainers,
  TIERS,
  SETUP_FEE_SINGLE_CENTS,
  SETUP_FEE_BATCH_CENTS,
  BATCH_THRESHOLD,
};
