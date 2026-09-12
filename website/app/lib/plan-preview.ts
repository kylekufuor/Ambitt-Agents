/**
 * Upcoming public plans agreed in Kyle's Claude session on 2026-09-11.
 * See docs/decisions/2026-09-11-public-pricing.md for the source and rollout.
 * These are a marketing preview, NOT active billing entitlements. Oracle and
 * the portal keep their existing billing constants until credit metering,
 * checkout, signup, and the account migration are implemented.
 */
export const PLAN_PREVIEW = {
  free: { label: "Free", description: "Get to know your agent", monthlyCents: 0, agents: 1, credits: 30, watchHours: 2, tools: 3, support: "Guides to get you started" },
  pro: { label: "Pro", description: "Help with the work you do every day", monthlyCents: 7_900, agents: 1, credits: 80, watchHours: 8, tools: 6, support: "Email support" },
  max: { label: "Max", description: "More room for a fuller workload", monthlyCents: 19_900, agents: 1, credits: 200, watchHours: 20, tools: null, support: "Email support" },
  business: { label: "Business", description: "A small team working together", monthlyCents: 59_900, agents: 3, credits: 600, watchHours: 60, tools: null, support: "Priority support" },
} as const;

export const TOPUP_PREVIEW = { priceCents: 2_500, credits: 40 } as const;
export const CUSTOM_BUILD = { fromCents: 500_000 } as const;
