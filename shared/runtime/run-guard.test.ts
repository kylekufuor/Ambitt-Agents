// Run: node_modules/.bin/tsx shared/runtime/run-guard.test.ts
//
// Pure unit test for runRefusalReason — the policy that decides whether a run
// may proceed. No DB, no network. Exists because the previous inline version
// refused every non-active agent unconditionally, which silently made the
// whole dry-run harness useless: you could only test an agent that was
// already live, i.e. the one state where you least need a dry run.
import { runRefusalReason } from "./engine.js";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL  ${name}\n  got:  ${g}\n  want: ${w}`);
  }
}
function checkTrue(name: string, cond: boolean, ctx?: unknown) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL  ${name}${ctx === undefined ? "" : `\n  ctx: ${JSON.stringify(ctx)}`}`);
  }
}

// --- active agents always run, dryRun is irrelevant to the gate -------------
check("active + no flag", runRefusalReason({ status: "active", dryRun: false }), null);
check("active + dryRun", runRefusalReason({ status: "active", dryRun: true }), null);
check(
  "active + allowInactive is a no-op",
  runRefusalReason({ status: "active", dryRun: false }, { allowInactive: true }),
  null,
);

// --- client traffic: a pause must actually stop the agent -------------------
// These are the paths that carry real client mail. None of them pass
// allowInactive, so every one must refuse regardless of dryRun.
for (const status of ["paused", "pending_approval", "building", "killed"]) {
  for (const dryRun of [true, false]) {
    checkTrue(
      `client traffic refused: ${status} dryRun=${dryRun}`,
      runRefusalReason({ status, dryRun }) === `is not active (status: ${status})`,
      { status, dryRun },
    );
  }
}

// --- operator test path: allowed, but only inside dry-run ------------------
for (const status of ["paused", "pending_approval", "building"]) {
  check(
    `operator dry-run allowed: ${status}`,
    runRefusalReason({ status, dryRun: true }, { allowInactive: true }),
    null,
  );
  checkTrue(
    `operator run refused when dryRun is off: ${status}`,
    runRefusalReason({ status, dryRun: false }, { allowInactive: true })?.includes(
      "not in dry-run mode",
    ) === true,
    { status },
  );
}

// --- the regression this file exists for ----------------------------------
// Arthur's exact posture on 2026-07-29: paused by an operator hold, dryRun on,
// which is precisely the state the harness is meant to exercise.
check(
  "REGRESSION: paused + dryRun + operator test → runs",
  runRefusalReason({ status: "paused", dryRun: true }, { allowInactive: true }),
  null,
);
// And the Fable builder's candidates, created pending_approval + dryRun.
check(
  "REGRESSION: Fable candidate pending_approval + dryRun → runs",
  runRefusalReason({ status: "pending_approval", dryRun: true }, { allowInactive: true }),
  null,
);

// --- allowInactive can never un-gate a live-capable agent ------------------
// The dangerous combination is a stopped agent with writes NOT intercepted.
checkTrue(
  "killed + dryRun off + allowInactive still refuses",
  runRefusalReason({ status: "killed", dryRun: false }, { allowInactive: true }) !== null,
);

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
