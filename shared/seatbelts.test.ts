// Run: node_modules/.bin/tsx shared/seatbelts.test.ts
// Pure unit test for the outbound seatbelts circuit breaker — no server, no real DB.
import {
  checkOutboundSeatbelts,
  SEATBELT_DEFAULTS,
  type SeatbeltDb,
  type SeatbeltTrip,
} from "./seatbelts.js";

interface FakeSend {
  agentId: string;
  to: string;
  subject: string;
  acceptedAt: Date;
}

// In-memory SeatbeltDb backed by a seeded array of sends. Honors only the
// filters checkOutboundSeatbelts actually uses: agentId equality,
// acceptedAt { gte }, and to equality.
function makeDb(rows: FakeSend[]): SeatbeltDb {
  const matches = (r: FakeSend, where: any): boolean => {
    if (where.agentId !== undefined && r.agentId !== where.agentId) return false;
    if (where.to !== undefined && r.to !== where.to) return false;
    if (where.acceptedAt?.gte !== undefined && r.acceptedAt < where.acceptedAt.gte) return false;
    return true;
  };
  return {
    emailSend: {
      async count(args) {
        return rows.filter((r) => matches(r, args.where)).length;
      },
      async findMany(args) {
        return rows.filter((r) => matches(r, args.where)).map((r) => ({ subject: r.subject }));
      },
    },
  };
}

const AGENT = "agent_1";
const OTHER_AGENT = "agent_2";
const RECIPIENT = "casey@acme.com";
const OTHER_RECIPIENT = "sam@acme.com";

// Helper: a send that landed `minsAgo` minutes before now.
function ago(minsAgo: number, over: Partial<FakeSend> = {}): FakeSend {
  return {
    agentId: AGENT,
    to: RECIPIENT,
    subject: "Weekly report",
    acceptedAt: new Date(Date.now() - minsAgo * 60_000),
    ...over,
  };
}

interface Case {
  name: string;
  rows: FakeSend[];
  args: { agentId: string; recipient: string; subject: string; bodyText?: string };
  wantAllowed: boolean;
  wantTripped?: SeatbeltTrip;
}

const cases: Case[] = [
  {
    name: "under all limits -> allowed",
    rows: [ago(2), ago(20, { subject: "Different topic" })],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "Fresh subject" },
    wantAllowed: true,
  },
  {
    name: "empty history -> allowed",
    rows: [],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "Hello" },
    wantAllowed: true,
  },
  {
    name: "3 recent sends (same agent) -> rate_short",
    rows: [
      ago(1, { subject: "a" }),
      ago(2, { subject: "b" }),
      ago(3, { subject: "c" }),
    ],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "d" },
    wantAllowed: false,
    wantTripped: "rate_short",
  },
  {
    name: "short-window ignores sends outside 15 min -> allowed",
    rows: [
      ago(20, { subject: "a" }),
      ago(25, { subject: "b" }),
      ago(30, { subject: "c" }),
    ],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "d" },
    wantAllowed: true,
  },
  {
    name: "short-window ignores other agents -> allowed",
    rows: [
      ago(1, { agentId: OTHER_AGENT, subject: "a" }),
      ago(2, { agentId: OTHER_AGENT, subject: "b" }),
      ago(3, { agentId: OTHER_AGENT, subject: "c" }),
    ],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "d" },
    wantAllowed: true,
  },
  {
    name: "10 sends in the hour (spread past short window) -> rate_hourly",
    // Keep <3 inside the 15-min window so rate_short doesn't fire first,
    // but >=10 inside the hour.
    rows: [
      ago(20, { subject: "s0" }),
      ago(22, { subject: "s1" }),
      ago(24, { subject: "s2" }),
      ago(26, { subject: "s3" }),
      ago(28, { subject: "s4" }),
      ago(30, { subject: "s5" }),
      ago(32, { subject: "s6" }),
      ago(34, { subject: "s7" }),
      ago(36, { subject: "s8" }),
      ago(38, { subject: "s9" }),
    ],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "s10" },
    wantAllowed: false,
    wantTripped: "rate_hourly",
  },
  {
    name: "2 identical subjects to same recipient in-window -> repetition",
    rows: [
      ago(5, { subject: "Your invoice is ready" }),
      ago(10, { subject: "Your invoice is ready" }),
    ],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "Your invoice is ready" },
    wantAllowed: false,
    wantTripped: "repetition",
  },
  {
    name: "repetition does NOT trip across different recipients -> allowed",
    rows: [
      ago(5, { to: RECIPIENT, subject: "Your invoice is ready" }),
      ago(10, { to: OTHER_RECIPIENT, subject: "Your invoice is ready" }),
    ],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "Your invoice is ready" },
    wantAllowed: true,
  },
  {
    name: "'Re: Your code' vs 'Your code' normalize-equal -> repetition",
    rows: [
      ago(5, { subject: "Re: Your code" }),
      ago(10, { subject: "  your   CODE  " }),
    ],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "Your code" },
    wantAllowed: false,
    wantTripped: "repetition",
  },
  {
    name: "single prior identical subject (below repetitionMax) -> allowed",
    rows: [ago(5, { subject: "Ping" })],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "Ping" },
    wantAllowed: true,
  },
  {
    name: "repetition ignores sends outside 30 min -> allowed",
    rows: [
      ago(40, { subject: "Old ping" }),
      ago(45, { subject: "Old ping" }),
    ],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "Old ping" },
    wantAllowed: true,
  },
];

async function main() {
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const db = makeDb(c.rows);
    const v = await checkOutboundSeatbelts(db, c.args);
    const okAllowed = v.allowed === c.wantAllowed;
    const okTripped = c.wantTripped === undefined ? true : v.tripped === c.wantTripped;
    if (okAllowed && okTripped) {
      pass++;
    } else {
      fail++;
      console.log(`FAIL  ${c.name}`);
      console.log(`        got allowed=${v.allowed} tripped=${v.tripped ?? "-"} reason="${v.reason ?? ""}"`);
      console.log(`        want allowed=${c.wantAllowed}${c.wantTripped ? ` tripped=${c.wantTripped}` : ""}`);
    }
  }

  // Sanity: cfg overrides merge over defaults (repetitionMax=1 trips on first repeat).
  {
    const db = makeDb([ago(5, { subject: "Once" })]);
    const v = await checkOutboundSeatbelts(
      db,
      { agentId: AGENT, recipient: RECIPIENT, subject: "Once" },
      { repetitionMax: 1 },
    );
    if (!v.allowed && v.tripped === "repetition") {
      pass++;
    } else {
      fail++;
      console.log(`FAIL  cfg override repetitionMax=1`);
      console.log(`        got allowed=${v.allowed} tripped=${v.tripped ?? "-"}`);
    }
  }

  // Sanity: defaults object is intact (guards against accidental mutation).
  if (SEATBELT_DEFAULTS.shortMax === 3 && SEATBELT_DEFAULTS.hourlyMax === 10) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  SEATBELT_DEFAULTS mutated: ${JSON.stringify(SEATBELT_DEFAULTS)}`);
  }

  console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
  process.exitCode = fail ? 1 : 0;
}

main();
