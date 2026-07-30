// Run: node_modules/.bin/tsx shared/runtime/temperature.test.ts
//
// Pins the two rules that make the leads board worth looking at. No DB, no
// network.
//
// Rule 1: a temperature without a reason is refused at the tool boundary.
// Rule 2: once the client has moved a lead by hand, the agent proposes but
//         does not overwrite.
//
// Both are enforced here rather than in the prompt because a prompt
// instruction is a request and these are requirements. The failure mode for
// rule 1 is a broker looking at somebody else's sort with no explanation and
// quietly deciding not to trust it. The failure mode for rule 2 is Casey
// dragging a card to Cold and finding it back in Hot on Monday, which reads as
// the product arguing with him.
import { resolveTemperatureWrite } from "./engine.js";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
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
const AT = new Date("2026-07-30T12:00:00Z");
const err = (r: ReturnType<typeof resolveTemperatureWrite>) => ("error" in r ? r.error : null);
const wr = (r: ReturnType<typeof resolveTemperatureWrite>) => ("error" in r ? null : r.write);
const note = (r: ReturnType<typeof resolveTemperatureWrite>) => ("error" in r ? null : r.note ?? null);

// ═══════════════════════════════════════════════════════════════════════════
// Rule 1 — no reason, no temperature
// ═══════════════════════════════════════════════════════════════════════════
for (const t of ["hot", "warm", "cold"]) {
  const r = resolveTemperatureWrite({ temperature: t }, null, AT);
  checkTrue(`REGRESSION: "${t}" with no reason is refused`, err(r)?.includes("without saying why") === true, err(r));
  checkTrue(`"${t}" with no reason writes nothing`, wr(r) === null || err(r) !== null);
}
checkTrue(
  "a blank/whitespace reason counts as no reason",
  err(resolveTemperatureWrite({ temperature: "hot", reason: "   " }, null, AT)) !== null,
);
// The refusal has to tell the agent how to fix it, or it just retries the same call.
const fixIt = err(resolveTemperatureWrite({ temperature: "hot" }, null, AT))!;
checkTrue("the refusal names the parameter to send", fixIt.includes("temperature_reason"), fixIt);
checkTrue("the refusal says nothing was changed", /nothing was changed/i.test(fixIt), fixIt);

// ═══════════════════════════════════════════════════════════════════════════
// Rule 2 — the client outranks the agent
// ═══════════════════════════════════════════════════════════════════════════
const clientCold = { temperature: "cold", temperatureSetBy: "client" };
const r2 = resolveTemperatureWrite({ temperature: "hot", reason: "he replied" }, clientCold, AT);
check("REGRESSION: agent cannot overwrite a client's own temperature", wr(r2), null);
checkTrue("and the agent is told why, in terms it can act on", (note(r2) ?? "").includes("client set this one"), note(r2));
checkTrue("the note tells it to raise this in conversation instead", /rather than changing it/.test(note(r2) ?? ""));

// Agreeing with the client is not an overwrite, so it is allowed through.
const agree = resolveTemperatureWrite({ temperature: "cold", reason: "already listed" }, clientCold, AT);
checkTrue("agent may re-affirm the same temperature the client chose", wr(agree)?.temperature === "cold");

// An agent-set temperature is the agent's to change.
const agentWarm = { temperature: "warm", temperatureSetBy: "agent" };
checkTrue(
  "agent may change a temperature it set itself",
  wr(resolveTemperatureWrite({ temperature: "hot", reason: "he replied" }, agentWarm, AT))?.temperature === "hot",
);
// A lead nobody has judged yet is fair game.
checkTrue(
  "agent may set a temperature on a lead with none",
  wr(resolveTemperatureWrite({ temperature: "warm", reason: "written to, early" }, { temperature: null, temperatureSetBy: null }, AT))
    ?.temperature === "warm",
);

// ═══════════════════════════════════════════════════════════════════════════
// The happy path writes provenance, not just a value
// ═══════════════════════════════════════════════════════════════════════════
check(
  "a good call writes value, reason, author and time",
  wr(resolveTemperatureWrite({ temperature: "hot", reason: "he asked for a number after saying no" }, null, AT)),
  {
    temperature: "hot",
    temperatureReason: "he asked for a number after saying no",
    temperatureSetBy: "agent",
    temperatureSetAt: AT.toISOString(),
  },
);
checkTrue(
  "case and padding are tolerated from the model",
  wr(resolveTemperatureWrite({ temperature: "  HOT ", reason: " he replied " }, null, AT))?.temperature === "hot",
);
check(
  "the reason is trimmed, not reformatted",
  wr(resolveTemperatureWrite({ temperature: "hot", reason: "  he replied  " }, null, AT))?.temperatureReason,
  "he replied",
);

// ═══════════════════════════════════════════════════════════════════════════
// Nothing asked for, nothing done
// ═══════════════════════════════════════════════════════════════════════════
check("no temperature in the call is not an error", wr(resolveTemperatureWrite({}, null, AT)), null);
checkTrue("no temperature in the call does not error", err(resolveTemperatureWrite({}, null, AT)) === null);
check(
  "a reason with no temperature is ignored rather than refused",
  wr(resolveTemperatureWrite({ reason: "he seems keen" }, null, AT)),
  null,
);
// A junk value must not be silently coerced into a real temperature.
for (const junk of ["lukewarm", "HOT!", "1", "true", "boiling"]) {
  checkTrue(`junk temperature "${junk}" is refused`, err(resolveTemperatureWrite({ temperature: junk, reason: "x" }, null, AT)) !== null, junk);
}
checkTrue("non-string temperature is ignored", err(resolveTemperatureWrite({ temperature: 3 }, null, AT)) === null);

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
