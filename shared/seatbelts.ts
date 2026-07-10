// Control-plane Pillar 4 — outbound email "seatbelts" (circuit breaker).
//
// Prevents runaway agent loops from spamming a recipient or blasting too many
// emails in a short window. Reads recent rows from the existing EmailSend table
// to count sends, then trips one of three checks (short-window rate, hourly
// rate, or subject repetition to the same recipient).
//
// Thresholds here are GLOBAL defaults for now; they are made per-agent
// configurable later (pass overrides via the `cfg` argument in the meantime).

export const SEATBELT_DEFAULTS = {
  shortWindowMs: 15 * 60_000,
  shortMax: 3,
  hourlyWindowMs: 60 * 60_000,
  hourlyMax: 10,
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
