// Run: node_modules/.bin/tsx oracle/lib/inbound-idempotency.test.ts
// Pure unit test for Resend redelivery idempotency — no server boot, in-memory DB.
import {
  claimDelivery,
  describeUnanswered,
  finalizeDelivery,
  sweepInterruptedDeliveries,
  type InboundLogDb,
  type InboundSweepDb,
} from "./inbound-idempotency.js";

// --- In-memory mock InboundLogDb, backed by a Map --------------------------
interface Row {
  id: string;
  emailId: string | null;
  toAddr: string | null;
  fromAddr: string | null;
  subject: string | null;
  agentId: string | null;
  disposition: string;
  createdAt: number;
}

function makeDb(): InboundLogDb & InboundSweepDb & { rows: Row[]; failNextCreate?: boolean; failNextFind?: boolean } {
  const rows: Row[] = [];
  let nextId = 1;
  const db = {
    rows,
    failNextCreate: false,
    failNextFind: false,
    inboundEmailLog: {
      async findFirst(args: { where: { emailId: string }; orderBy?: { createdAt: "asc" | "desc" } }) {
        if (db.failNextFind) {
          db.failNextFind = false;
          throw new Error("simulated pool timeout");
        }
        const dir = args.orderBy?.createdAt === "asc" ? 1 : -1;
        const matches = rows
          .filter((r) => r.emailId === args.where.emailId)
          .sort((a, b) => dir * (a.createdAt - b.createdAt));
        const hit = matches[0];
        return hit ? { id: hit.id, disposition: hit.disposition } : null;
      },
      async create(args: { data: { emailId?: string | null; toAddr?: string | null; fromAddr?: string | null; subject?: string | null; agentId?: string | null; disposition?: string; createdAt?: number } }) {
        if (db.failNextCreate) {
          db.failNextCreate = false;
          throw new Error("simulated DB hiccup");
        }
        const row: Row = {
          id: `row_${nextId++}`,
          emailId: args.data.emailId ?? null,
          toAddr: args.data.toAddr ?? null,
          fromAddr: args.data.fromAddr ?? null,
          subject: args.data.subject ?? null,
          agentId: args.data.agentId ?? null,
          disposition: args.data.disposition ?? "received",
          createdAt: args.data.createdAt ?? Date.now() + nextId, // monotonic even within the same ms
        };
        rows.push(row);
        return { id: row.id };
      },
      async update(args: { where: { id: string }; data: { disposition?: string } }) {
        const row = rows.find((r) => r.id === args.where.id);
        if (!row) throw new Error("row not found");
        if (args.data.disposition !== undefined) row.disposition = args.data.disposition;
        return row;
      },
      async findMany(args: { where: { disposition: string; createdAt: { lt: Date; gt: Date } } }) {
        const { lt, gt } = args.where.createdAt;
        return rows
          .filter((r) => r.disposition === args.where.disposition && r.createdAt < lt.getTime() && r.createdAt > gt.getTime())
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((r) => ({ id: r.id, emailId: r.emailId, fromAddr: r.fromAddr, toAddr: r.toAddr, subject: r.subject, agentId: r.agentId, createdAt: new Date(r.createdAt) }));
      },
      async updateMany(args: { where: { id: { in: string[] }; disposition: string }; data: { disposition: string } }) {
        let count = 0;
        for (const r of rows) {
          if (args.where.id.in.includes(r.id) && r.disposition === args.where.disposition) {
            r.disposition = args.data.disposition;
            count++;
          }
        }
        return { count };
      },
    },
  };
  return db;
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
}

async function main() {
  // --- first delivery claims cleanly ---
  {
    const db = makeDb();
    const r = await claimDelivery(db, "email-1", { toAddr: "atlas@ambitt.agency" });
    check("first delivery is not a duplicate", !r.duplicate);
    check("first delivery gets a claimed row id", typeof r.claimedId === "string" && r.claimedId.length > 0);
    check("exactly one row exists after the claim", db.rows.length === 1);
    check("the claimed row starts as processing", db.rows[0].disposition === "processing");
  }

  // --- THE core property: a redelivery arriving while the first is still
  // "processing" (mid-flight, or the container died before finishing) is
  // short-circuited, not reprocessed. This is exactly the production
  // incident: a deploy killed a run mid-flight and Resend redelivered. ---
  {
    const db = makeDb();
    const first = await claimDelivery(db, "email-2", { toAddr: "a@b.com" });
    const redelivery = await claimDelivery(db, "email-2", { toAddr: "a@b.com" });
    check("a redelivered emailId does not re-run (duplicate=true)", redelivery.duplicate);
    check("the redelivery reports the prior (processing) disposition", redelivery.priorDisposition === "processing");
    check("the redelivery does NOT get a claimed row of its own", redelivery.claimedId === null);
    check("still exactly one row for this emailId — no second claim written", db.rows.filter((r) => r.emailId === "email-2").length === 1);
    void first;
  }

  // --- a redelivery arriving AFTER the first attempt finished successfully
  // is also short-circuited — this is the "our response was slow" case. ---
  {
    const db = makeDb();
    const first = await claimDelivery(db, "email-3", { toAddr: "a@b.com" });
    await finalizeDelivery(db, first.claimedId, { disposition: "replied", ms: 4200 });
    check("finalize updates the SAME row rather than creating a second one", db.rows.length === 1);
    check("the row reflects the real final disposition", db.rows[0].disposition === "replied");

    const redelivery = await claimDelivery(db, "email-3", { toAddr: "a@b.com" });
    check("a redelivery after successful completion is also short-circuited", redelivery.duplicate);
    check("it reports the true final disposition, not 'processing'", redelivery.priorDisposition === "replied");
  }

  // --- different emailIds never collide ---
  {
    const db = makeDb();
    const a = await claimDelivery(db, "email-A", { toAddr: null });
    const b = await claimDelivery(db, "email-B", { toAddr: null });
    check("two distinct emailIds both claim cleanly", !a.duplicate && !b.duplicate);
    check("they get different row ids", a.claimedId !== b.claimedId);
  }

  // --- claim write fails (DB hiccup): must not block processing, and must
  // not falsely report a duplicate. finalizeDelivery falls back to create(). ---
  {
    const db = makeDb();
    db.failNextCreate = true;
    const r = await claimDelivery(db, "email-4", { toAddr: null });
    check("a claim-write failure still lets the request proceed", !r.duplicate);
    check("no row id to update when the claim write failed", r.claimedId === null);
    check("no row was actually written", db.rows.length === 0);

    await finalizeDelivery(db, r.claimedId, { emailId: "email-4", disposition: "replied" });
    check("finalizeDelivery falls back to create() when there was no claim", db.rows.length === 1);
    check("the fallback row has the real disposition", db.rows[0].disposition === "replied");
  }

  // --- the reported prior outcome is the ORIGINAL delivery's, however many
  // redeliveries came before. Each short-circuit logs its own row (the
  // handler's finally, with no claim), so newest-first would report
  // "duplicate_delivery" from the second redelivery on. ---
  {
    const db = makeDb();
    const first = await claimDelivery(db, "email-5", { toAddr: "a@b.com" });
    await finalizeDelivery(db, first.claimedId, { disposition: "replied" });
    const r1 = await claimDelivery(db, "email-5", { toAddr: "a@b.com" });
    await finalizeDelivery(db, r1.claimedId, { emailId: "email-5", disposition: "duplicate_delivery" });
    const r2 = await claimDelivery(db, "email-5", { toAddr: "a@b.com" });
    check("second redelivery is still a duplicate", r2.duplicate);
    check("second redelivery reports the original outcome, not duplicate_delivery", r2.priorDisposition === "replied", String(r2.priorDisposition));
  }

  // --- the claim row says who wrote and about what, so a run that never
  // finishes is still attributable. ---
  {
    const db = makeDb();
    await claimDelivery(db, "email-6", { toAddr: "atlas@ambitt.agency", fromAddr: "Kyle <k@example.com>", subject: "Prospect" });
    check("claim row records the sender", db.rows[0].fromAddr === "Kyle <k@example.com>");
    check("claim row records the subject", db.rows[0].subject === "Prospect");
  }

  // --- a failed duplicate CHECK is not swallowed: the handler must see it,
  // answer 503 and leave no emailId-keyed row, so Resend's retry runs. ---
  {
    const db = makeDb();
    db.failNextFind = true;
    let threw = false;
    try {
      await claimDelivery(db, "email-7", { toAddr: null });
    } catch {
      threw = true;
    }
    check("a failed duplicate check throws to the caller", threw);
    check("a failed duplicate check writes nothing", db.rows.length === 0);
    const retry = await claimDelivery(db, "email-7", { toAddr: null });
    check("the retry then claims cleanly", !retry.duplicate && retry.claimedId !== null);
  }

  // --- boot sweep: runs a previous process claimed and never finished ---
  {
    const db = makeDb();
    const boot = new Date(Date.now() + 1_000_000);
    const before = (msAgo: number) => boot.getTime() - msAgo;
    await db.inboundEmailLog.create({ data: { emailId: "killed", fromAddr: "k@example.com", subject: "Prospect", toAddr: "atlas@ambitt.agency", disposition: "processing", createdAt: before(60_000) } });
    await db.inboundEmailLog.create({ data: { emailId: "finished", disposition: "replied", createdAt: before(50_000) } });
    await db.inboundEmailLog.create({ data: { emailId: "ancient", disposition: "processing", createdAt: before(10 * 24 * 3600_000) } });
    await db.inboundEmailLog.create({ data: { emailId: "this-process", disposition: "processing", createdAt: boot.getTime() + 5 } });

    const found = await sweepInterruptedDeliveries(db, boot);
    check("the sweep finds the run a restart killed", found.length === 1 && found[0].emailId === "killed", JSON.stringify(found));
    check("it carries who wrote and about what", found[0]?.fromAddr === "k@example.com" && found[0]?.subject === "Prospect");
    const row = (id: string) => db.rows.find((r) => r.emailId === id)!;
    check("the killed run is marked interrupted", row("killed").disposition === "interrupted");
    check("a finished run is left alone", row("finished").disposition === "replied");
    check("a row older than the lookback is left alone", row("ancient").disposition === "processing");
    check("this process's own in-flight claim is never swept", row("this-process").disposition === "processing");
    check("each interrupted run is reported once", (await sweepInterruptedDeliveries(db, boot)).length === 0);
    const redelivery = await claimDelivery(db, "killed", { toAddr: null });
    check("an interrupted run still blocks a redelivery (it may have sent)", redelivery.duplicate && redelivery.priorDisposition === "interrupted");
  }

  // --- the alert a human reads ---
  {
    const text = describeUnanswered({ reason: "Oracle restarted", emailId: "e-9", fromAddr: "k@example.com", toAddr: "atlas@ambitt.agency", subject: "Prospect", agentId: null });
    check("alert names the sender, subject and email id", text.includes("k@example.com") && text.includes("Prospect") && text.includes("e-9"));
    check("alert says how to re-run it", /replay the webhook from Resend/.test(text));
    check("alert copes with an unresolved agent", text.includes("Agent: not resolved yet"));
  }

  // --- routes that return before a claim is even attempted (bad signature,
  // wrong event type) never call claimDelivery — finalizeDelivery with a
  // null claimedId is exactly the pre-existing "always create" behaviour, so
  // that path is exercised by the fallback case above.

  console.log(`${pass}/${pass + fail} passed`);
  if (fail > 0) process.exitCode = 1;
}

main();
