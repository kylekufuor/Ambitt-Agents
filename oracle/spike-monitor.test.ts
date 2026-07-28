// Run: node_modules/.bin/tsx oracle/spike-monitor.test.ts
// Pure unit test for the spike-monitor watchdog heartbeat + down-alert dedupe.
// No DB, no cron: buildSpikeUpdate/shouldAlertMonitorDown are side-effect free.
//
// The regression this guards: the monitor used to write spikeCheckedAt ONLY
// when a spike was found or cleared, so a dead watchdog and a healthy fleet
// looked identical (spikeCheckedAt was null on every prod agent).
import { buildSpikeUpdate, shouldAlertMonitorDown, MONITOR_DOWN_COOLDOWN_MS } from "./spike-monitor.js";
import { assessSpike, type SpikeMetrics, type SpikeVerdict } from "../shared/spike-detect.js";

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

const CHECKED_AT = new Date("2026-07-28T12:00:00.000Z");

// --- Real verdicts, straight from the detector ------------------------------
// Built through assessSpike so the fixtures can't drift from production.
function metrics(over: Partial<SpikeMetrics> = {}): SpikeMetrics {
  return {
    emails1h: 0,
    emails24h: 2,
    dailyEmails7: [2, 2, 2, 2, 2, 2, 2],
    cost24hCents: 0,
    dailyCost7Cents: [0, 0, 0, 0, 0, 0, 0],
    budgetMonthlyCents: 0,
    established: true,
    ...over,
  };
}

const quiet = assessSpike(metrics());
const warn = assessSpike(metrics({ emails1h: 8 }));
const critical = assessSpike(metrics({ emails1h: 20 }));

check("fixture: quiet agent is not spiking", quiet.spiking === false, JSON.stringify(quiet));
check("fixture: 8 emails/1h is a warn", warn.spiking && warn.severity === "warn", JSON.stringify(warn));
check("fixture: 20 emails/1h is critical", critical.spiking && critical.severity === "critical", JSON.stringify(critical));

// --- THE heartbeat invariant ------------------------------------------------
// Every branch, every outcome, must stamp spikeCheckedAt.
const branches: Array<{ label: string; v: SpikeVerdict; didAlert: boolean }> = [
  { label: "quiet agent", v: quiet, didAlert: false },
  { label: "warn agent", v: warn, didAlert: false },
  { label: "critical agent (alerted)", v: critical, didAlert: true },
  { label: "critical agent (in alert cooldown)", v: critical, didAlert: false },
];
for (const b of branches) {
  const u = buildSpikeUpdate(b.v, CHECKED_AT, b.didAlert);
  check(`heartbeat written — ${b.label}`, u.spikeCheckedAt === CHECKED_AT, JSON.stringify(u));
}

// --- Clearing branch --------------------------------------------------------
const cleared = buildSpikeUpdate(quiet, CHECKED_AT, false);
check("not spiking clears severity", cleared.spikeSeverity === null);
check("not spiking clears badge", cleared.spikeBadge === null);
check("not spiking clears reason", cleared.spikeReason === null);
check("not spiking never sets spikeAlertedAt", !("spikeAlertedAt" in cleared), JSON.stringify(cleared));

// --- Spiking branch ---------------------------------------------------------
const warnUpdate = buildSpikeUpdate(warn, CHECKED_AT, false);
check("warn persists severity", warnUpdate.spikeSeverity === "warn");
check("warn persists badge", warnUpdate.spikeBadge === warn.badge && warnUpdate.spikeBadge !== "");
check("warn persists reason", (warnUpdate.spikeReason ?? "").includes("emails in the last hour"), String(warnUpdate.spikeReason));
check("warn without alert leaves spikeAlertedAt untouched", !("spikeAlertedAt" in warnUpdate), JSON.stringify(warnUpdate));

const critUpdate = buildSpikeUpdate(critical, CHECKED_AT, true);
check("critical persists severity", critUpdate.spikeSeverity === "critical");
check("critical + alert stamps spikeAlertedAt", critUpdate.spikeAlertedAt === CHECKED_AT, JSON.stringify(critUpdate));
check("critical without alert omits spikeAlertedAt", !("spikeAlertedAt" in buildSpikeUpdate(critical, CHECKED_AT, false)));

// Reason is a String? column with a 500-char guard in the DB write.
const longVerdict: SpikeVerdict = { ...warn, reasons: ["x".repeat(400), "y".repeat(400)] };
check(
  "reason truncated to 500 chars",
  (buildSpikeUpdate(longVerdict, CHECKED_AT, false).spikeReason ?? "").length === 500,
  String((buildSpikeUpdate(longVerdict, CHECKED_AT, false).spikeReason ?? "").length)
);

// --- Monitor-down alert dedupe ---------------------------------------------
// The 2026-07-24 Supabase outage failed every agent check with zero operator
// signal. First failure pages; a sustained outage re-pages once per window.
const t0 = Date.parse("2026-07-28T00:00:00.000Z");
check("first failure always pages", shouldAlertMonitorDown(null, t0) === true);
check("15 min later (next tick) stays quiet", shouldAlertMonitorDown(t0, t0 + 15 * 60_000) === false);
check("1h later stays quiet", shouldAlertMonitorDown(t0, t0 + 60 * 60_000) === false);
check("just under the cooldown stays quiet", shouldAlertMonitorDown(t0, t0 + MONITOR_DOWN_COOLDOWN_MS - 1) === false);
check("at the cooldown boundary re-pages", shouldAlertMonitorDown(t0, t0 + MONITOR_DOWN_COOLDOWN_MS) === true);
check("well past the cooldown re-pages", shouldAlertMonitorDown(t0, t0 + 12 * 60 * 60_000) === true);
check("custom cooldown honoured", shouldAlertMonitorDown(t0, t0 + 60_000, 30_000) === true);

// A 24h outage on a 15-min cron = 96 ticks. Count the pages.
{
  let last: number | null = null;
  let pages = 0;
  for (let i = 0; i < 96; i++) {
    const now = t0 + i * 15 * 60_000;
    if (shouldAlertMonitorDown(last, now)) {
      pages++;
      last = now;
    }
  }
  check("24h sustained outage pages 4×, not 96×", pages === 4, `pages=${pages}`);
}

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
