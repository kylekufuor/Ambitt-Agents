// ---------------------------------------------------------------------------
// Inbound-webhook idempotency (control-plane hardening)
// ---------------------------------------------------------------------------
// Resend redelivers /webhooks/email-inbound when our response is slow or our
// container restarts mid-run — and that handler holds the connection open
// for the WHOLE agent run, so a redelivery repeats every side effect,
// including re-sending an email that already went out. Production incident:
// a deploy killed a run mid-flight, Resend redelivered, and the repeat run
// re-sent the client's email.
//
// claimDelivery() runs as early as possible in the handler, before any side
// effect runs: it looks for an existing InboundEmailLog row for this
// Resend `emailId` and, if one exists — a redelivery, whether the first
// attempt is still running or has already finished — tells the caller to
// short-circuit instead of processing. Otherwise it writes an early
// "processing" row and hands back its id so finalizeDelivery() can UPDATE
// that same row once the real outcome is known, instead of leaving a stale
// row behind while a second one gets created.
//
// Not perfectly race-free: two deliveries of the same emailId arriving
// within the same few milliseconds could both pass the findFirst below
// before either has written its claim row — emailId has no unique
// constraint at the database level, so this check-then-insert isn't atomic.
// That window is real but narrow; the production trigger for redelivery (a
// slow run, or a restart) is separated by seconds to minutes, not
// milliseconds. A unique index on emailId would close the window completely
// via a create-and-catch-conflict pattern; that's a schema change and out of
// scope here (see the commit message / report).
//
// A short-circuited redelivery is NOT auto-retried even when the first
// attempt ended in "error" — see finalizeDelivery. Distinguishing "safe to
// retry, nothing sent yet" from "already sent, don't repeat" would need
// send-level tracking this schema doesn't have, and double-send is strictly
// worse than a failed run needing a manual nudge.
//
// DB access sits behind the InboundLogDb structural interface — same pattern
// as oracle/lib/pause-control.ts's PauseDb — so this is unit-testable with an
// in-memory store instead of a real database. Production passes `prisma`.
// ---------------------------------------------------------------------------

export interface InboundLogDb {
  inboundEmailLog: {
    findFirst(args: any): Promise<{ id: string; disposition: string } | null>;
    create(args: any): Promise<{ id: string }>;
    update(args: any): Promise<unknown>;
  };
}

/** The claim-row fields a human needs to find and re-run an unanswered email. */
export interface UnansweredRow {
  emailId: string | null;
  fromAddr: string | null;
  toAddr: string | null;
  subject: string | null;
  agentId: string | null;
}

export interface InboundSweepDb {
  inboundEmailLog: {
    findMany(args: any): Promise<Array<UnansweredRow & { id: string; createdAt: Date }>>;
    updateMany(args: any): Promise<{ count: number }>;
  };
}

export interface ClaimResult {
  /** True when a prior delivery of this emailId was already recorded — the
   * caller must respond and stop, not process the message. */
  duplicate: boolean;
  priorDisposition?: string;
  /** Row this delivery claimed, for finalizeDelivery() to update. Null when
   * the claim write itself failed — finalizeDelivery() then falls back to a
   * one-shot create, exactly as the handler behaved before this existed. */
  claimedId: string | null;
}

export async function claimDelivery(
  db: InboundLogDb,
  emailId: string,
  seed: { toAddr: string | null; fromAddr?: string | null; subject?: string | null }
): Promise<ClaimResult> {
  // Oldest first: that row is the original delivery's claim, whose disposition
  // is the real outcome. Newest-first would report "duplicate_delivery" from
  // the second redelivery on, because each short-circuit logs its own row.
  const prior = await db.inboundEmailLog.findFirst({
    where: { emailId },
    orderBy: { createdAt: "asc" },
    select: { id: true, disposition: true },
  });
  if (prior) {
    return { duplicate: true, priorDisposition: prior.disposition, claimedId: null };
  }

  try {
    const claimed = await db.inboundEmailLog.create({
      data: {
        emailId,
        toAddr: seed.toAddr,
        fromAddr: seed.fromAddr ?? null,
        subject: seed.subject ?? null,
        disposition: "processing",
      },
    });
    return { duplicate: false, claimedId: claimed.id };
  } catch {
    // Couldn't write the claim row (DB hiccup) — proceed rather than
    // black-holing inbound mail over a logging failure. claimedId stays
    // null, so finalizeDelivery() falls back to create() as before.
    return { duplicate: false, claimedId: null };
  }
}

export async function finalizeDelivery(
  db: InboundLogDb,
  claimedId: string | null,
  data: Record<string, unknown>
): Promise<void> {
  if (claimedId) {
    await db.inboundEmailLog.update({ where: { id: claimedId }, data });
  } else {
    await db.inboundEmailLog.create({ data });
  }
}

/**
 * Deliveries a previous Oracle process claimed and never finished. A deploy or
 * crash killed the run, so the row still says "processing", and it still
 * blocks Resend's redelivery (by design: it may have sent something before it
 * died). Marks them "interrupted" so each is reported once, and returns them
 * so the caller can tell a human.
 *
 * `bootedAt` must be this process's start time: rows this process claims are
 * newer and are never touched. Rows older than `lookbackMs` are left alone;
 * they predate this sweep and nobody can act on them now.
 */
export async function sweepInterruptedDeliveries(
  db: InboundSweepDb,
  bootedAt: Date,
  lookbackMs = 3 * 24 * 60 * 60 * 1000
): Promise<Array<UnansweredRow & { createdAt: Date }>> {
  const rows = await db.inboundEmailLog.findMany({
    where: { disposition: "processing", createdAt: { lt: bootedAt, gt: new Date(bootedAt.getTime() - lookbackMs) } },
    orderBy: { createdAt: "asc" },
    select: { id: true, emailId: true, fromAddr: true, toAddr: true, subject: true, agentId: true, createdAt: true },
  });
  if (rows.length === 0) return [];
  await db.inboundEmailLog.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, disposition: "processing" },
    data: { disposition: "interrupted" },
  });
  return rows.map(({ id: _id, ...rest }) => rest);
}

/** Operator alert text for an inbound email that will not be answered automatically. */
export function describeUnanswered(input: UnansweredRow & { reason: string }): string {
  const lines = [
    "An email to an agent was not answered, and Resend's retry will be skipped (it could send twice).",
    `Why: ${input.reason}`,
    `From: ${input.fromAddr ?? "unknown"}`,
    `To: ${input.toAddr ?? "unknown"}`,
    `Subject: ${input.subject ?? "(none)"}`,
    `Agent: ${input.agentId ?? "not resolved yet"}`,
    `Resend email id: ${input.emailId ?? "unknown"}`,
    "To re-run it: check nothing already went out for it, delete the InboundEmailLog rows with that email id, then replay the webhook from Resend.",
  ];
  return lines.join("\n");
}
