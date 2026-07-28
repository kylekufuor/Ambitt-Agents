// Run: node_modules/.bin/tsx oracle/scheduler.test.ts
// Unit test for the two P0 scheduler fixes. No DB, no network, no real cron
// tick: cron.schedule is swapped for a spy before registerAgent runs, and the
// failure-alert sender is injected, so nothing is scheduled and nobody is paged.
//
// The regressions this guards:
//   1. cron.schedule was called with NO timezone option, so every agent fired
//      on the process timezone (UTC on Railway). Arthur's "Monday 8am" brief
//      (America/Chicago) landed at 3:00am Central for the client, every week.
//   2. A scheduled run that threw wrote a `failed` OracleAction row and told
//      nobody. Arthur's 2026-07-06 run died on a context overflow and the
//      client missed four Mondays before a human noticed.
import cron from "node-cron";
import {
  registerAgent,
  unregisterAgent,
  resolveCronTimezone,
  scheduledFailureKey,
  shouldAlertScheduledFailure,
  buildScheduledFailureAlert,
  dispatchScheduledFailureAlert,
  resetScheduledFailureAlerts,
  SCHEDULED_FAILURE_ALERT_REPEAT_MS,
} from "./scheduler.js";

// --- cron.schedule spy -----------------------------------------------------
// scheduler.ts reads cron.schedule off the module object at call time, so
// swapping the property here (before any registerAgent call) intercepts the
// registration without ever starting a real cron job.
interface Registered {
  expression: string;
  options: unknown;
  handler: () => unknown;
}
const registered: Registered[] = [];
const realSchedule = cron.schedule;
(cron as unknown as { schedule: unknown }).schedule = (
  expression: string,
  handler: () => unknown,
  options?: unknown
) => {
  registered.push({ expression, options, handler });
  return { stop() {}, start() {}, destroy() {} };
};

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

// ---------------------------------------------------------------------------
// FIX 1 — timezone resolution
// ---------------------------------------------------------------------------
check("valid IANA zone passes through", resolveCronTimezone("America/Chicago").timezone === "America/Chicago");
check("valid zone is not a fallback", resolveCronTimezone("America/Chicago").fellBack === false);
check("UTC passes through", resolveCronTimezone("UTC").timezone === "UTC");
check("Europe/London passes through", resolveCronTimezone("Europe/London").timezone === "Europe/London");

for (const bad of ["Mars/Olympus", "America/Chicagoo", "", "   ", "not a zone"]) {
  const r = resolveCronTimezone(bad);
  check(`invalid tz "${bad}" falls back to UTC`, r.timezone === "UTC" && r.fellBack === true, JSON.stringify(r));
}
check("null tz falls back to UTC", resolveCronTimezone(null).timezone === "UTC");
check("undefined tz falls back to UTC", resolveCronTimezone(undefined).timezone === "UTC");
check("whitespace is trimmed", resolveCronTimezone("  America/Chicago  ").timezone === "America/Chicago");

// The reason the fallback exists: node-cron THROWS on a bad zone, and
// registerAgent runs in a loop at boot. One typo'd Agent.timezone would take
// the whole scheduler down with it.
let cronThrewOnBadZone = false;
try {
  realSchedule.call(cron, "0 8 * * 1", () => {}, { timezone: "Mars/Olympus" }).stop();
} catch {
  cronThrewOnBadZone = true;
}
check("node-cron rejects an invalid timezone (why the fallback exists)", cronThrewOnBadZone);

// The guard has to agree with node-cron, not with an idea of IANA purity: if we
// pass a zone through, node-cron must accept it (V8's Intl tolerates legacy
// aliases like "PST", and so does node-cron, which resolves zones the same way).
for (const candidate of ["America/Chicago", "UTC", "Europe/London", "PST", "Mars/Olympus", "not a zone", ""]) {
  const resolved = resolveCronTimezone(candidate);
  let cronAccepts = true;
  try {
    realSchedule.call(cron, "0 8 * * 1", () => {}, { timezone: resolved.timezone }).stop();
  } catch {
    cronAccepts = false;
  }
  check(`resolved zone for "${candidate}" is one node-cron accepts`, cronAccepts, JSON.stringify(resolved));
}

// ---------------------------------------------------------------------------
// FIX 1 — the option actually reaches cron.schedule
// ---------------------------------------------------------------------------
registered.length = 0;
registerAgent("agent-arthur", "0 8 * * 1", "America/Chicago");
check("agent with a schedule is registered", registered.length === 1, `got ${registered.length}`);
check("cron expression is passed through", registered[0]?.expression === "0 8 * * 1");
check(
  "timezone option is passed to cron.schedule",
  JSON.stringify(registered[0]?.options) === JSON.stringify({ timezone: "America/Chicago" }),
  JSON.stringify(registered[0]?.options)
);
unregisterAgent("agent-arthur");

registered.length = 0;
registerAgent("agent-bad-tz", "0 8 * * 1", "Mars/Olympus");
check(
  "invalid timezone registers in UTC rather than throwing",
  JSON.stringify(registered[0]?.options) === JSON.stringify({ timezone: "UTC" }),
  JSON.stringify(registered[0]?.options)
);
unregisterAgent("agent-bad-tz");

registered.length = 0;
registerAgent("agent-no-tz", "0 8 * * 1");
check(
  "missing timezone registers in UTC",
  JSON.stringify(registered[0]?.options) === JSON.stringify({ timezone: "UTC" }),
  JSON.stringify(registered[0]?.options)
);
unregisterAgent("agent-no-tz");

registered.length = 0;
registerAgent("agent-manual", "manual", "America/Chicago");
registerAgent("agent-empty", "", "America/Chicago");
registerAgent("agent-garbage-cron", "not a cron expression", "America/Chicago");
check("manual / empty / invalid cron register nothing", registered.length === 0, `got ${registered.length}`);

// ---------------------------------------------------------------------------
// FIX 2 — failure alert identity + dedupe
// ---------------------------------------------------------------------------
const OVERFLOW_1 = '400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 212067 tokens > 200000 maximum"}}';
const OVERFLOW_2 = '400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 213411 tokens > 200000 maximum"}}';
const OTHER_FAULT = "Tool execution failed: Composio connection expired";

check(
  "same fault with different token counts is ONE key",
  scheduledFailureKey("a1", OVERFLOW_1) === scheduledFailureKey("a1", OVERFLOW_2),
  `${scheduledFailureKey("a1", OVERFLOW_1)}\n        ${scheduledFailureKey("a1", OVERFLOW_2)}`
);
check(
  "a different fault is a different key",
  scheduledFailureKey("a1", OVERFLOW_1) !== scheduledFailureKey("a1", OTHER_FAULT)
);
check(
  "the same fault on a different agent is a different key",
  scheduledFailureKey("a1", OVERFLOW_1) !== scheduledFailureKey("a2", OVERFLOW_1)
);
check("only the first line is keyed", scheduledFailureKey("a1", "boom\nstack line 1\nstack line 2") === scheduledFailureKey("a1", "boom\ncompletely different stack"));

const T0 = Date.parse("2026-07-06T08:00:00.000Z");
const k1 = scheduledFailureKey("a1", OVERFLOW_1);
const k2 = scheduledFailureKey("a1", OTHER_FAULT);
check("first failure always alerts", shouldAlertScheduledFailure(k1, null, T0));
check("identical repeat inside the window is suppressed", shouldAlertScheduledFailure(k1, { key: k1, atMs: T0 }, T0 + 60_000) === false);
check(
  "identical repeat just under the window is suppressed",
  shouldAlertScheduledFailure(k1, { key: k1, atMs: T0 }, T0 + SCHEDULED_FAILURE_ALERT_REPEAT_MS - 1) === false
);
check(
  "identical repeat after the window alerts again",
  shouldAlertScheduledFailure(k1, { key: k1, atMs: T0 }, T0 + SCHEDULED_FAILURE_ALERT_REPEAT_MS)
);
check("a different fault alerts immediately", shouldAlertScheduledFailure(k2, { key: k1, atMs: T0 }, T0 + 1_000));
check(
  "a weekly agent failing the same way next week still alerts",
  shouldAlertScheduledFailure(k1, { key: k1, atMs: T0 }, T0 + 7 * 24 * 60 * 60 * 1000)
);

// ---------------------------------------------------------------------------
// FIX 2 — the alert is actually sent, once, through the injected sender
// ---------------------------------------------------------------------------
const WHO = 'Arthur (Litsey Real Estate), schedule "0 8 * * 1" America/Chicago';

async function alertTests(): Promise<void> {
  resetScheduledFailureAlerts();
  const sent: string[] = [];
  const fakeSend = async (text: string) => {
    sent.push(text);
    return "sms:test";
  };

  const first = await dispatchScheduledFailureAlert("a1", OVERFLOW_1, WHO, T0, fakeSend);
  check("failure path sends an alert", first.sent === true && sent.length === 1, JSON.stringify(first));
  check("alert names the agent and client", sent[0]?.includes("Arthur (Litsey Real Estate)") === true);
  check("alert carries the first line of the error", sent[0]?.includes("prompt is too long: 212067 tokens > 200000") === true);
  check("alert says the client missed the run", sent[0]?.includes("The client did not get this run.") === true);

  const second = await dispatchScheduledFailureAlert("a1", OVERFLOW_2, WHO, T0 + 60_000, fakeSend);
  check("same fault an hour later does not re-page", second.suppressed === true && sent.length === 1, JSON.stringify(second));

  const third = await dispatchScheduledFailureAlert("a1", OTHER_FAULT, WHO, T0 + 120_000, fakeSend);
  check("a different fault pages immediately", third.sent === true && sent.length === 2, JSON.stringify(third));

  const fourth = await dispatchScheduledFailureAlert("a2", OVERFLOW_1, WHO, T0 + 120_000, fakeSend);
  check("another agent's failure is never suppressed by this one", fourth.sent === true && sent.length === 3);

  const fifth = await dispatchScheduledFailureAlert(
    "a1",
    OTHER_FAULT,
    WHO,
    T0 + 120_000 + SCHEDULED_FAILURE_ALERT_REPEAT_MS,
    fakeSend
  );
  check("a still-broken agent re-pages once the window elapses", fifth.sent === true && sent.length === 4);
}

check(
  "alert builder keeps the message to five short lines",
  buildScheduledFailureAlert({ who: WHO, message: OVERFLOW_1 }).split("\n").length === 5
);

alertTests().then(() => {
  // What Kyle receives, for eyeball review:
  console.log("\n--- sample operator alert ---");
  console.log(buildScheduledFailureAlert({ who: WHO, message: OVERFLOW_1 }));
  console.log("-----------------------------");

  console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
  process.exitCode = fail ? 1 : 0;
});
