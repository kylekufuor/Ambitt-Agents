// ---------------------------------------------------------------------------
// Ambitt Agents — Pricing Constants (zero dependencies)
// ---------------------------------------------------------------------------
// This file holds the tier config and display-safe helpers. No DB imports —
// safe for client-side bundles (dashboard, client-portal, website).
//
// `shared/pricing.ts` re-exports from here and adds server-only helpers
// (calculateClientMRR, recalcClientRetainers, canAddAgent) that touch Prisma.
// Edit pricing in ONE place: this file. Both server and client read from it.
// ---------------------------------------------------------------------------

export type PricingTier = "starter" | "growth" | "scale" | "enterprise";

export const SECOND_AGENT_DISCOUNT_PCT = 20;

export interface TierConfig {
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

/** Get tier config by name. */
export function getTierConfig(tier: PricingTier): TierConfig {
  return TIERS[tier];
}

/** Get the interaction limit for a tier. Returns -1 for unlimited. */
export function getInteractionLimit(tier: PricingTier): number {
  return TIERS[tier].interactionsPerMonth;
}

/** Get overage rate (cents per extra interaction) for a tier. */
export function getOverageRate(tier: PricingTier): number {
  return TIERS[tier]?.overageRateCents ?? 0;
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
  return Math.round(base * (100 - SECOND_AGENT_DISCOUNT_PCT) / 100);
}

/** The month key used for grouping OverageEvent rows for end-of-month invoicing. */
export function currentBillingCycleMonth(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
