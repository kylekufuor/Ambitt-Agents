// Run: node_modules/.bin/tsx oracle/lib/pause-control.test.ts
// Pure unit test for pause/resume authority (Pillar 5) — no server boot, in-memory DB.
import {
  pauseRank,
  canResume,
  haltAgent,
  resumeAgent,
  type PauseDb,
  type PausedBy,
} from "./pause-control.js";

// --- In-memory mock PauseDb, backed by a Map ------------------------------
interface Row {
  status: string;
  pausedBy: string | null;
}

function makeDb(seed: Record<string, Row> = {}): PauseDb & { rows: Map<string, Row> } {
  const rows = new Map<string, Row>(Object.entries(seed));
  return {
    rows,
    agent: {
      async findUnique(args: { where: { id: string }; select?: any }) {
        const r = rows.get(args.where.id);
        if (!r) return null;
        return { status: r.status, pausedBy: r.pausedBy };
      },
      async update(args: { where: { id: string }; data: any }) {
        const r = rows.get(args.where.id) ?? { status: "active", pausedBy: null };
        if (typeof args.data.status === "string") r.status = args.data.status;
        if ("pausedBy" in args.data) r.pausedBy = args.data.pausedBy;
        rows.set(args.where.id, r);
        return r;
      },
    },
  };
}

// --- Tiny assertion harness ------------------------------------------------
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

// --- Pure helper cases -----------------------------------------------------
check("pauseRank system=3", pauseRank("system") === 3);
check("pauseRank operator=2", pauseRank("operator") === 2);
check("pauseRank client=1", pauseRank("client") === 1);
check("pauseRank ordering system>operator>client", pauseRank("system") > pauseRank("operator") && pauseRank("operator") > pauseRank("client"));

check("canResume operator over client pause", canResume("client", "operator") === true);
check("canResume operator over system pause", canResume("system", "operator") === true);
check("canResume operator over operator pause", canResume("operator", "operator") === true);
check("canResume operator over null pause", canResume(null, "operator") === true);
check("canResume client over client pause", canResume("client", "client") === true);
check("canResume client DENIED over system pause", canResume("system", "client") === false);
check("canResume client DENIED over operator pause", canResume("operator", "client") === false);
check("canResume client DENIED over null pause", canResume(null, "client") === false);

// --- Flow: client halt -> client resume OK ---------------------------------
async function run() {
  {
    const db = makeDb({ a1: { status: "active", pausedBy: null } });
    const h = await haltAgent(db, { agentId: "a1", by: "client", reason: "client asked" });
    check("client halt -> ok+paused", h.ok && h.status === "paused" && h.pausedBy === "client", JSON.stringify(h));
    const r = await resumeAgent(db, { agentId: "a1", requester: "client" });
    check("client resume of client pause -> active", r.ok && r.status === "active", JSON.stringify(r));
    check("client resume clears pausedBy", db.rows.get("a1")?.pausedBy === null);
  }

  // --- Flow: system halt -> client resume DENIED, operator resume OK --------
  {
    const db = makeDb({ a2: { status: "active", pausedBy: null } });
    await haltAgent(db, { agentId: "a2", by: "system", reason: "runaway loop seatbelt" });
    const denied = await resumeAgent(db, { agentId: "a2", requester: "client" });
    check("system pause: client resume DENIED", denied.ok === false && denied.status === "paused" && denied.pausedBy === "system", JSON.stringify(denied));
    check("system pause: still paused after denied client resume", db.rows.get("a2")?.status === "paused");
    const op = await resumeAgent(db, { agentId: "a2", requester: "operator" });
    check("system pause: operator resume OK", op.ok && op.status === "active", JSON.stringify(op));
  }

  // --- Flow: operator halt -> client resume DENIED, operator resume OK ------
  {
    const db = makeDb({ a3: { status: "active", pausedBy: null } });
    await haltAgent(db, { agentId: "a3", by: "operator" });
    const denied = await resumeAgent(db, { agentId: "a3", requester: "client" });
    check("operator pause: client resume DENIED", denied.ok === false && denied.pausedBy === "operator", JSON.stringify(denied));
    const op = await resumeAgent(db, { agentId: "a3", requester: "operator" });
    check("operator pause: operator resume OK", op.ok && op.status === "active", JSON.stringify(op));
  }

  // --- Flow: client halt THEN system halt -> upgrades to "system" -----------
  {
    const db = makeDb({ a4: { status: "active", pausedBy: null } });
    await haltAgent(db, { agentId: "a4", by: "client" });
    const up = await haltAgent(db, { agentId: "a4", by: "system", reason: "seatbelt" });
    check("client-then-system halt: upgrades to system", up.ok && up.noop !== true && up.pausedBy === "system", JSON.stringify(up));
    check("client-then-system halt: db pausedBy=system", db.rows.get("a4")?.pausedBy === "system");
  }

  // --- Flow: system halt THEN client halt -> noop, stays "system" -----------
  {
    const db = makeDb({ a5: { status: "active", pausedBy: null } });
    await haltAgent(db, { agentId: "a5", by: "system" });
    const noop = await haltAgent(db, { agentId: "a5", by: "client" });
    check("system-then-client halt: noop", noop.ok === true && noop.noop === true && noop.pausedBy === "system", JSON.stringify(noop));
    check("system-then-client halt: db stays system", db.rows.get("a5")?.pausedBy === "system");
  }

  // --- Flow: equal-rank halt is a noop (no churn) ---------------------------
  {
    const db = makeDb({ a6: { status: "active", pausedBy: null } });
    await haltAgent(db, { agentId: "a6", by: "operator" });
    const noop = await haltAgent(db, { agentId: "a6", by: "operator" });
    check("operator-then-operator halt: noop, stays operator", noop.ok && noop.noop === true && noop.pausedBy === "operator", JSON.stringify(noop));
  }

  // --- Flow: resume when not paused -> noop ok:true --------------------------
  {
    const db = makeDb({ a7: { status: "active", pausedBy: null } });
    const r = await resumeAgent(db, { agentId: "a7", requester: "client" });
    check("resume when not paused: noop ok:true", r.ok === true && r.noop === true && r.status === "active", JSON.stringify(r));
  }

  // --- Edge: LEGACY null pause (paused before pausedBy existed) --------------
  // A client/operator halt must NOT re-pause it (that re-confirms to the client
  // + downgrades the owner). Treated as operator-rank: client & operator halts
  // no-op (silent), only a system halt escalates.
  {
    const db = makeDb({ n1: { status: "paused", pausedBy: null } });
    const r = await haltAgent(db, { agentId: "n1", by: "client" });
    check("legacy null-pause + client halt: noop (silent, not downgraded)", r.ok === true && r.noop === true, JSON.stringify(r));
  }
  {
    const db = makeDb({ n2: { status: "paused", pausedBy: null } });
    const r = await haltAgent(db, { agentId: "n2", by: "operator" });
    check("legacy null-pause + operator halt: noop", r.ok === true && r.noop === true, JSON.stringify(r));
  }
  {
    const db = makeDb({ n3: { status: "paused", pausedBy: null } });
    const r = await haltAgent(db, { agentId: "n3", by: "system" });
    check("legacy null-pause + system halt: escalates to system", r.ok === true && r.noop !== true && r.pausedBy === "system", JSON.stringify(r));
  }

  // --- Edge: killed agent cannot be paused ----------------------------------
  {
    const db = makeDb({ a8: { status: "killed", pausedBy: null } });
    const h = await haltAgent(db, { agentId: "a8", by: "operator" });
    check("killed agent: halt denied", h.ok === false && h.status === "killed", JSON.stringify(h));
  }

  // --- Edge: unknown agent --------------------------------------------------
  {
    const db = makeDb({});
    const h = await haltAgent(db, { agentId: "nope", by: "client" });
    check("unknown agent halt: ok:false status unknown", h.ok === false && h.status === "unknown", JSON.stringify(h));
    const r = await resumeAgent(db, { agentId: "nope", requester: "operator" });
    check("unknown agent resume: ok:false status unknown", r.ok === false && r.status === "unknown", JSON.stringify(r));
  }

  console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
  process.exitCode = fail ? 1 : 0;
}

run();
