// Run: node_modules/.bin/tsx oracle/lib/throttle.test.ts
// Pure unit test for control-plane throttle stepping — no server boot, no DB.
import { nextThrottledFrequency, throttleConfirmation } from "./throttle.js";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    // console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
}

// --- busiest level steps down one notch ---
{
  const r = nextThrottledFrequency("immediate");
  check(
    "immediate -> daily_digest (changed)",
    r.changed === true && r.next === "daily_digest" && r.label === "one daily digest",
    `got changed=${r.changed} next="${r.next}" label="${r.label}"`
  );
}

// --- middle level steps to the quietest ---
{
  const r = nextThrottledFrequency("daily_digest");
  check(
    "daily_digest -> weekly_digest (changed)",
    r.changed === true && r.next === "weekly_digest" && r.label === "a weekly digest",
    `got changed=${r.changed} next="${r.next}" label="${r.label}"`
  );
}

// --- quietest level does not change ---
{
  const r = nextThrottledFrequency("weekly_digest");
  check(
    "weekly_digest -> no change (floor)",
    r.changed === false && r.next === "weekly_digest" && r.label === "a weekly digest",
    `got changed=${r.changed} next="${r.next}" label="${r.label}"`
  );
}

// --- unknown value treated as busiest, steps down ---
{
  const r = nextThrottledFrequency("hourly_blast");
  check(
    "unknown value -> steps down (changed)",
    r.changed === true && r.next === "daily_digest" && r.label === "one daily digest",
    `got changed=${r.changed} next="${r.next}" label="${r.label}"`
  );
}

// --- throttleConfirmation: non-empty, and differs changed vs not-changed ---
{
  const changed = nextThrottledFrequency("immediate"); // changed:true
  const floored = nextThrottledFrequency("weekly_digest"); // changed:false
  const msgChanged = throttleConfirmation("Arthur", changed);
  const msgFloored = throttleConfirmation("Arthur", floored);

  check(
    "confirmation (changed) is non-empty",
    typeof msgChanged === "string" && msgChanged.trim().length > 0,
    `got "${msgChanged}"`
  );
  check(
    "confirmation (not changed) is non-empty",
    typeof msgFloored === "string" && msgFloored.trim().length > 0,
    `got "${msgFloored}"`
  );
  check(
    "confirmation differs for changed vs not-changed",
    msgChanged !== msgFloored,
    `changed="${msgChanged}" floored="${msgFloored}"`
  );
}

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
