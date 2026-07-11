// Control-plane Pillar 4 — outbound email "seatbelts" (circuit breaker).
//
// Prevents runaway agent loops from spamming a recipient or blasting too many
// emails in a short window. Reads recent rows from the existing EmailSend table
// to count sends, then trips one of three checks (short-window rate, hourly
// rate, or subject repetition to the same recipient).
//
// Thresholds here are GLOBAL defaults for now; they are made per-agent
// configurable later (pass overrides via the `cfg` argument in the meantime).

// Rate caps are tuned to tolerate legitimately chatty exchanges: a client
// firing off several quick replies must NOT system-pause the agent. The rate
// checks are the blunt fallback; the repetition detector (same subject → same
// recipient) is the real runaway signal, so it stays tight at 2.
export const SEATBELT_DEFAULTS = {
  shortWindowMs: 15 * 60_000,
  shortMax: 6,
  hourlyWindowMs: 60 * 60_000,
  hourlyMax: 20,
  repetitionWindowMs: 30 * 60_000,
  repetitionMax: 2,
};

export type SeatbeltTrip = "rate_short" | "rate_hourly" | "repetition";

export interface SeatbeltVerdict {
  allowed: boolean;
  tripped?: SeatbeltTrip;
  reason?: string;
}

// Minimal structural DB interface so the real PrismaClient satisfies it AND
// tests can supply a lightweight in-memory mock.
export interface SeatbeltDb {
  emailSend: {
    count(args: { where: any }): Promise<number>;
    findMany(args: {
      where: any;
      select: { subject: true };
    }): Promise<Array<{ subject: string }>>;
  };
}

// Normalize a subject for repetition comparison:
// lowercase, trim, collapse internal whitespace, strip a single leading Re:/Fw:/Fwd:.
function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(re|fwd?):\s*/i, "")
    .trim();
}

export async function checkOutboundSeatbelts(
  db: SeatbeltDb,
  args: { agentId: string; recipient: string; subject: string; bodyText?: string },
  cfg?: Partial<typeof SEATBELT_DEFAULTS>,
): Promise<SeatbeltVerdict> {
  const c = { ...SEATBELT_DEFAULTS, ...cfg };
  const now = Date.now();

  // 1. Short-window rate limit (default: 3 emails / 15 min for this agent).
  const shortCount = await db.emailSend.count({
    where: {
      agentId: args.agentId,
      acceptedAt: { gte: new Date(now - c.shortWindowMs) },
    },
  });
  if (shortCount >= c.shortMax) {
    return {
      allowed: false,
      tripped: "rate_short",
      reason: `${shortCount} emails in the last 15 min (cap ${c.shortMax})`,
    };
  }

  // 2. Hourly rate limit (default: 10 emails / 60 min for this agent).
  const hourCount = await db.emailSend.count({
    where: {
      agentId: args.agentId,
      acceptedAt: { gte: new Date(now - c.hourlyWindowMs) },
    },
  });
  if (hourCount >= c.hourlyMax) {
    return {
      allowed: false,
      tripped: "rate_hourly",
      reason: `${hourCount} emails in the last hour (cap ${c.hourlyMax})`,
    };
  }

  // 3. Repetition: same normalized subject to the same recipient in-window
  //    (default: 2 identical subjects / 30 min).
  const rows = await db.emailSend.findMany({
    where: {
      agentId: args.agentId,
      to: args.recipient,
      acceptedAt: { gte: new Date(now - c.repetitionWindowMs) },
    },
    select: { subject: true },
  });
  const target = normalizeSubject(args.subject);
  const repeatCount = rows.filter((r) => normalizeSubject(r.subject) === target).length;
  if (repeatCount >= c.repetitionMax) {
    return {
      allowed: false,
      tripped: "repetition",
      reason: `"${args.subject}" already sent ${repeatCount}x to ${args.recipient} in the last 30 min (cap ${c.repetitionMax})`,
    };
  }

  return { allowed: true };
}

// Safe range for each per-agent override. A client can LOOSEN a cap to reduce
// false pauses, but never disable safety: the floor keeps the circuit breaker
// meaningful, and repetitionMax can never be raised above 5 (the loop-catcher
// must stay tight) nor dropped below its default of 2.
const SEATBELT_CLAMP: Record<"shortMax" | "hourlyMax" | "repetitionMax", { min: number; max: number }> = {
  shortMax: { min: 1, max: 20 },
  hourlyMax: { min: 1, max: 60 },
  repetitionMax: { min: 2, max: 5 },
};

/**
 * Resolve the effective seatbelt config for an agent by merging optional
 * per-agent overrides (from CommunicationSettings.seatbelts) on top of the
 * global defaults, then clamping every tunable value into its safe range.
 *
 * Pure + defensive: accepts arbitrary `unknown` (e.g. raw Agent.communicationSettings
 * JSON), ignores non-numeric / non-finite overrides, and always returns a full
 * config object of the same shape as SEATBELT_DEFAULTS. No DB, no throw.
 */
export function resolveSeatbeltConfig(commSettings: unknown, sensitivity?: string | null): typeof SEATBELT_DEFAULTS {
  const resolved = { ...SEATBELT_DEFAULTS };

  // Operator safety sensitivity scales the volume caps first: "relaxed" doubles
  // them (a legitimately high-volume agent trips later), "strict" halves them.
  // repetitionMax is left alone (a repeat is always suspicious). Explicit
  // per-agent overrides below still win over the sensitivity-scaled base.
  const f = sensitivity === "relaxed" ? 2 : sensitivity === "strict" ? 0.5 : 1;
  if (f !== 1) {
    resolved.shortMax = Math.round(resolved.shortMax * f);
    resolved.hourlyMax = Math.round(resolved.hourlyMax * f);
  }

  const overrides =
    commSettings != null &&
    typeof commSettings === "object" &&
    typeof (commSettings as { seatbelts?: unknown }).seatbelts === "object" &&
    (commSettings as { seatbelts?: unknown }).seatbelts != null
      ? ((commSettings as { seatbelts: Record<string, unknown> }).seatbelts)
      : undefined;

  if (overrides) {
    for (const key of ["shortMax", "hourlyMax", "repetitionMax"] as const) {
      const raw = overrides[key];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        const { min, max } = SEATBELT_CLAMP[key];
        resolved[key] = Math.min(max, Math.max(min, raw));
      }
    }
  }

  // Final safety clamp — keeps the sensitivity-scaled base within safe bounds too.
  for (const key of ["shortMax", "hourlyMax", "repetitionMax"] as const) {
    const { min, max } = SEATBELT_CLAMP[key];
    resolved[key] = Math.min(max, Math.max(min, resolved[key]));
  }

  return resolved;
}
