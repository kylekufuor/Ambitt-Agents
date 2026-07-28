// Run: node_modules/.bin/tsx oracle/monitor.test.ts
// Pure unit test for fleet-health repeat-alert suppression. No DB, no cron.
//
// Context: the fleet-health sweep now runs hourly (it previously only ran when
// something POSTed /cron/fleet-health). The stale list re-reports the SAME
// agents every tick — a weekly-schedule agent is ">25h since last run" six days
// out of seven — so without suppression, wiring the cron up would have paged
// the operator every hour forever.
import { fleetAlertKey, shouldSendFleetAlert, FLEET_ALERT_REPEAT_MS } from "./monitor.js";

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

// --- fleetAlertKey: stable identity of "what's wrong right now" -------------
check("empty parts → empty key", fleetAlertKey([]) === "");
check("single part", fleetAlertKey(["stale:a1"]) === "stale:a1");
check(
  "order independent",
  fleetAlertKey(["stale:a2", "stale:a1"]) === fleetAlertKey(["stale:a1", "stale:a2"]),
  fleetAlertKey(["stale:a2", "stale:a1"])
);
check("duplicates collapse", fleetAlertKey(["stale:a1", "stale:a1"]) === "stale:a1");
check(
  "different agents → different keys",
  fleetAlertKey(["stale:a1"]) !== fleetAlertKey(["stale:a2"])
);
check(
  "different problem, same agent → different keys",
  fleetAlertKey(["stale:a1"]) !== fleetAlertKey(["budget-warning:a1"])
);
check(
  "adding an agent changes the key",
  fleetAlertKey(["stale:a1"]) !== fleetAlertKey(["stale:a1", "budget-exceeded:a2"])
);

// --- shouldSendFleetAlert ---------------------------------------------------
const t0 = Date.parse("2026-07-28T00:00:00.000Z");
const key = fleetAlertKey(["stale:a1"]);

check("nothing wrong → never sends", shouldSendFleetAlert("", null, t0) === false);
check("nothing wrong → never sends even after a prior alert", shouldSendFleetAlert("", { key, atMs: t0 }, t0 + FLEET_ALERT_REPEAT_MS * 2) === false);
check("first alert always sends", shouldSendFleetAlert(key, null, t0) === true);
check("same set, 1h later → suppressed", shouldSendFleetAlert(key, { key, atMs: t0 }, t0 + 60 * 60_000) === false);
check("same set, 23h later → suppressed", shouldSendFleetAlert(key, { key, atMs: t0 }, t0 + 23 * 60 * 60_000) === false);
check("same set, just under 24h → suppressed", shouldSendFleetAlert(key, { key, atMs: t0 }, t0 + FLEET_ALERT_REPEAT_MS - 1) === false);
check("same set, exactly 24h → re-sends", shouldSendFleetAlert(key, { key, atMs: t0 }, t0 + FLEET_ALERT_REPEAT_MS) === true);

// A NEW problem must page immediately — suppression is per alert-set, never a
// blanket mute. This is the operator-safety half of the dedupe.
const grown = fleetAlertKey(["stale:a1", "budget-exceeded:a2"]);
check("new agent joins the alert set → sends immediately", shouldSendFleetAlert(grown, { key, atMs: t0 }, t0 + 60_000) === true);
const shrunk = fleetAlertKey(["budget-exceeded:a2"]);
check("alert set changes membership → sends immediately", shouldSendFleetAlert(shrunk, { key: grown, atMs: t0 }, t0 + 60_000) === true);
check("budget escalation (warning → exceeded) → sends immediately", shouldSendFleetAlert(fleetAlertKey(["budget-exceeded:a1"]), { key: fleetAlertKey(["budget-warning:a1"]), atMs: t0 }, t0 + 60_000) === true);
check("custom repeat window honoured", shouldSendFleetAlert(key, { key, atMs: t0 }, t0 + 60_000, 30_000) === true);

// --- Behavioural: one stale agent across a week of hourly ticks --------------
// 168 hourly runs with an unchanged alert set must page 7×, not 168×.
{
  let last: { key: string; atMs: number } | null = null;
  let sends = 0;
  for (let hour = 0; hour < 168; hour++) {
    const now = t0 + hour * 60 * 60_000;
    if (shouldSendFleetAlert(key, last, now)) {
      sends++;
      last = { key, atMs: now };
    }
  }
  check("unchanged stale set over 7 days → 7 alerts", sends === 7, `sends=${sends}`);
}

// A second agent going stale mid-week still pages on the hour it happens.
{
  let last: { key: string; atMs: number } | null = null;
  let sends = 0;
  const sendHours: number[] = [];
  for (let hour = 0; hour < 48; hour++) {
    const now = t0 + hour * 60 * 60_000;
    const k = hour < 30 ? key : grown; // a2 blows its budget at hour 30
    if (shouldSendFleetAlert(k, last, now)) {
      sends++;
      sendHours.push(hour);
      last = { key: k, atMs: now };
    }
  }
  check("escalation mid-window pages on the hour it happens", sendHours.includes(30), JSON.stringify(sendHours));
  check("48h with one escalation → 3 alerts (h0, h24, h30)", sends === 3 && sendHours.join(",") === "0,24,30", JSON.stringify(sendHours));
}

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
