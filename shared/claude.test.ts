// Run: node_modules/.bin/tsx shared/claude.test.ts
//
// Pins the sampling-parameter guard. No network, no DB.
//
// Why this file exists: callClaude sent `temperature` on every request, and
// ORCHESTRATION_MODEL was claude-opus-4-7, which rejects it with
//   400 invalid_request_error: `temperature` is deprecated for this model.
// So oracle/improve.ts and the orchestration branch of oracle/router.ts were
// retrying a permanent 400 three times and throwing, in production, unnoticed —
// because Sonnet 4.6 still accepts temperature and the client-facing path was
// therefore healthy. Getting this predicate wrong in either direction is a
// silent outage: too strict and the deterministic classifier loses temperature 0,
// too loose and the whole Opus tier 400s again.
import {
  acceptsSampling,
  ORCHESTRATION_MODEL,
  CLIENT_MODEL,
  TRIAGE_MODEL,
  computeClaudeCostCents,
} from "./claude.js";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, ctx?: unknown) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL  ${name}${ctx === undefined ? "" : `\n  ctx: ${JSON.stringify(ctx)}`}`);
  }
}

// --- models that reject temperature/top_p/top_k --------------------------
for (const m of [
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-5",
  "claude-fable-5",
]) {
  check(`${m} rejects sampling params`, acceptsSampling(m) === false, m);
}

// --- models that still accept them --------------------------------------
for (const m of [
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
]) {
  check(`${m} accepts sampling params`, acceptsSampling(m) === true, m);
}

// --- the three configured tiers, by behaviour not by name ----------------
check("orchestration tier must NOT be sent temperature", acceptsSampling(ORCHESTRATION_MODEL) === false, ORCHESTRATION_MODEL);
check("client tier must NOT be sent temperature", acceptsSampling(CLIENT_MODEL) === false, CLIENT_MODEL);
// intent-classify.ts deliberately passes temperature: 0 for determinism, so the
// triage tier has to keep accepting it.
check("triage tier MUST still accept temperature", acceptsSampling(TRIAGE_MODEL) === true, TRIAGE_MODEL);

// --- an unknown id must not be assumed to reject -------------------------
// Guessing "rejects" would silently drop a caller's temperature; guessing
// "accepts" only risks a loud 400 on a model we haven't adopted yet.
check("unknown model id accepts (fails loud, not silent)", acceptsSampling("claude-something-new") === true);

// --- pricing: Opus is $5/$25, not the $15/$75 we carried until 2026-07-29 -
// 1M input + 1M output at $5/$25 = 500 + 2500 = 3000 cents = $30.
const opusCents = computeClaudeCostCents("claude-opus-5", 1_000_000, 1_000_000);
check("opus 5 priced at $5/$25 per MTok", opusCents === 3000, { opusCents });
const opus47Cents = computeClaudeCostCents("claude-opus-4-7", 1_000_000, 1_000_000);
check("opus 4.7 corrected to the same $5/$25", opus47Cents === 3000, { opus47Cents });
// Haiku was always right — 1M+1M at $1/$5 = 100 + 500 = 600 cents.
const haikuCents = computeClaudeCostCents(TRIAGE_MODEL, 1_000_000, 1_000_000);
check("haiku still $1/$5 per MTok", haikuCents === 600, { haikuCents });
// The tier split only pays off if triage is meaningfully cheaper.
check("triage is >=4x cheaper than the client tier", opusCents / haikuCents >= 4, {
  opusCents,
  haikuCents,
  ratio: opusCents / haikuCents,
});

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
