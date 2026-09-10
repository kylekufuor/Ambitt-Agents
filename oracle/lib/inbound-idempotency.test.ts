// Run: node_modules/.bin/tsx oracle/lib/inbound-idempotency.test.ts
// Pure unit test for Resend redelivery idempotency — no server boot, in-memory DB.
import { claimDelivery, finalizeDelivery, type InboundLogDb } from "./inbound-idempotency.js";

// --- In-memory mock InboundLogDb, backed by a Map --------------------------
interface Row {
  id: string;
  emailId: string | null;
  toAddr: string | null;
  disposition: string;
  createdAt: number;
}

function makeDb(): InboundLogDb & { rows: Row[]; failNextCreate?: boolean } {
  const rows: Row[] = [];
  let nextId = 1;
  const db = {
    rows,
    failNextCreate: false,
    inboundEmailLog: {
      async findFirst(args: { where: { emailId: string } }) {
        const matches = rows
          .filter((r) => r.emailId === args.where.emailId)
          .sort((a, b) => b.createdAt - a.createdAt);
        const hit = matches[0];
        return hit ? { id: hit.id, disposition: hit.disposition } : null;
      },
      async create(args: { data: { emailId?: string | null; toAddr?: string | null; disposition?: string } }) {
        if (db.failNextCreate) {
          db.failNextCreate = false;
          throw new Error("simulated DB hiccup");
        }
        const row: Row = {
          id: `row_${nextId++}`,
          emailId: args.data.emailId ?? null,
          toAddr: args.data.toAddr ?? null,
          disposition: args.data.disposition ?? "received",
          createdAt: Date.now() + nextId, // monotonic even within the same ms
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

  // --- routes that return before a claim is even attempted (bad signature,
  // wrong event type) never call claimDelivery — finalizeDelivery with a
  // null claimedId is exactly the pre-existing "always create" behaviour, so
  // that path is exercised by the fallback case above.

  console.log(`${pass}/${pass + fail} passed`);
  if (fail > 0) process.exitCode = 1;
}

main();
