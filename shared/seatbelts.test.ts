// Run: node_modules/.bin/tsx shared/seatbelts.test.ts
// Pure unit test for the outbound seatbelts circuit breaker — no server, no real DB.
import {
  checkOutboundSeatbelts,
  resolveSeatbeltConfig,
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
    name: "6 recent sends (same agent) -> rate_short",
    rows: [
      ago(1, { subject: "a" }),
      ago(2, { subject: "b" }),
      ago(3, { subject: "c" }),
      ago(4, { subject: "d" }),
      ago(5, { subject: "e" }),
      ago(6, { subject: "f" }),
    ],
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "g" },
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
    name: "20 sends in the hour (spread past short window) -> rate_hourly",
    // Keep <6 inside the 15-min window so rate_short doesn't fire first,
    // but >=20 inside the hour. All at 16-35 min ago: outside the 15-min
    // short window, inside the 60-min hourly window, subjects distinct so
    // repetition never trips.
    rows: Array.from({ length: 20 }, (_, i) =>
      ago(16 + i, { subject: `s${i}` }),
    ),
    args: { agentId: AGENT, recipient: RECIPIENT, subject: "s20" },
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
  if (SEATBELT_DEFAULTS.shortMax === 6 && SEATBELT_DEFAULTS.hourlyMax === 20) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  SEATBELT_DEFAULTS mutated: ${JSON.stringify(SEATBELT_DEFAULTS)}`);
  }

  // ---------------------------------------------------------------------------
  // resolveSeatbeltConfig — per-agent overrides merged onto defaults + clamped.
  // ---------------------------------------------------------------------------
  const eqConfig = (
    got: typeof SEATBELT_DEFAULTS,
    want: Partial<typeof SEATBELT_DEFAULTS>,
  ): boolean => {
    const expected = { ...SEATBELT_DEFAULTS, ...want };
    return (Object.keys(expected) as Array<keyof typeof expected>).every(
      (k) => got[k] === expected[k],
    );
  };

  const resolveCases: Array<{
    name: string;
    input: unknown;
    want: Partial<typeof SEATBELT_DEFAULTS>;
  }> = [
    { name: "null -> defaults", input: null, want: {} },
    { name: "undefined -> defaults", input: undefined, want: {} },
    { name: "garbage string -> defaults", input: "nope", want: {} },
    { name: "garbage number -> defaults", input: 42, want: {} },
    { name: "object w/o seatbelts -> defaults", input: { outbound: null }, want: {} },
    { name: "seatbelts:null -> defaults", input: { seatbelts: null }, want: {} },
    {
      name: "valid overrides applied",
      input: { seatbelts: { shortMax: 10, hourlyMax: 40, repetitionMax: 3 } },
      want: { shortMax: 10, hourlyMax: 40, repetitionMax: 3 },
    },
    {
      name: "partial override (shortMax only)",
      input: { seatbelts: { shortMax: 8 } },
      want: { shortMax: 8 },
    },
    {
      name: "over-ceiling clamped",
      input: { seatbelts: { shortMax: 999, hourlyMax: 999, repetitionMax: 99 } },
      want: { shortMax: 20, hourlyMax: 60, repetitionMax: 5 },
    },
    {
      name: "below-floor clamped",
      input: { seatbelts: { shortMax: 0, hourlyMax: 0, repetitionMax: 1 } },
      want: { shortMax: 1, hourlyMax: 1, repetitionMax: 2 },
    },
    {
      name: "non-numeric / non-finite overrides ignored -> defaults",
      input: { seatbelts: { shortMax: "10", hourlyMax: NaN, repetitionMax: Infinity } },
      want: {},
    },
  ];

  for (const rc of resolveCases) {
    const got = resolveSeatbeltConfig(rc.input);
    if (eqConfig(got, rc.want)) {
      pass++;
    } else {
      fail++;
      console.log(`FAIL  resolveSeatbeltConfig: ${rc.name}`);
      console.log(`        got  ${JSON.stringify(got)}`);
      console.log(`        want ${JSON.stringify({ ...SEATBELT_DEFAULTS, ...rc.want })}`);
    }
  }

  // Purity: resolving overrides must not mutate the shared defaults object.
  resolveSeatbeltConfig({ seatbelts: { shortMax: 999, repetitionMax: 99 } });
  if (SEATBELT_DEFAULTS.shortMax === 6 && SEATBELT_DEFAULTS.repetitionMax === 2) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  resolveSeatbeltConfig mutated SEATBELT_DEFAULTS: ${JSON.stringify(SEATBELT_DEFAULTS)}`);
  }

  // --- sensitivity scaling ---
  const chk = (name: string, cond: boolean, got?: unknown) => {
    if (cond) pass++;
    else { fail++; console.log(`FAIL  ${name}${got !== undefined ? ` — got ${JSON.stringify(got)}` : ""}`); }
  };
  const relaxed = resolveSeatbeltConfig(null, "relaxed");
  chk("relaxed doubles caps (short 12, hourly 40)", relaxed.shortMax === 12 && relaxed.hourlyMax === 40, relaxed);
  const strict = resolveSeatbeltConfig(null, "strict");
  chk("strict halves caps (short 3, hourly 10)", strict.shortMax === 3 && strict.hourlyMax === 10, strict);
  const standard = resolveSeatbeltConfig(null, "standard");
  chk("standard = defaults", standard.shortMax === 6 && standard.hourlyMax === 20, standard);
  const overrideWins = resolveSeatbeltConfig({ seatbelts: { shortMax: 5 } }, "relaxed");
  chk("explicit override beats sensitivity (short 5, hourly 40)", overrideWins.shortMax === 5 && overrideWins.hourlyMax === 40, overrideWins);
  chk("repetitionMax unchanged by sensitivity", relaxed.repetitionMax === 2 && strict.repetitionMax === 2);

  // --- smsHourlyMax (durable SMS 2FA relay cap) scales like the email caps ---
  chk("default smsHourlyMax = 6", resolveSeatbeltConfig(null).smsHourlyMax === 6);
  chk("relaxed doubles smsHourlyMax (12)", relaxed.smsHourlyMax === 12, relaxed);
  chk("strict halves smsHourlyMax (3)", strict.smsHourlyMax === 3, strict);
  chk("standard smsHourlyMax = 6", standard.smsHourlyMax === 6, standard);
  const smsOverride = resolveSeatbeltConfig({ seatbelts: { smsHourlyMax: 10 } });
  chk("smsHourlyMax override applied (10)", smsOverride.smsHourlyMax === 10, smsOverride);
  const smsOverrideWins = resolveSeatbeltConfig({ seatbelts: { smsHourlyMax: 4 } }, "relaxed");
  chk("explicit smsHourlyMax override beats sensitivity (4)", smsOverrideWins.smsHourlyMax === 4, smsOverrideWins);
  const smsClamped = resolveSeatbeltConfig({ seatbelts: { smsHourlyMax: 999 } });
  chk("smsHourlyMax clamped to ceiling (20)", smsClamped.smsHourlyMax === 20, smsClamped);

  console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
  process.exitCode = fail ? 1 : 0;
}

main();
