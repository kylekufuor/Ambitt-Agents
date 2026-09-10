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
  seed: { toAddr: string | null }
): Promise<ClaimResult> {
  const prior = await db.inboundEmailLog.findFirst({
    where: { emailId },
    orderBy: { createdAt: "desc" },
    select: { id: true, disposition: true },
  });
  if (prior) {
    return { duplicate: true, priorDisposition: prior.disposition, claimedId: null };
  }

  try {
    const claimed = await db.inboundEmailLog.create({
      data: { emailId, toAddr: seed.toAddr, disposition: "processing" },
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
