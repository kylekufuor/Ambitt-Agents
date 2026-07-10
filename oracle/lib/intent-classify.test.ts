// Run: node_modules/.bin/tsx oracle/lib/intent-classify.test.ts
// Pure unit test for the control-intent classifier — no server boot, no DB,
// and NEVER a real model/network call (non-keyword cases inject a stub callModel).
import {
  classifyControlIntent,
  isHaltIntent,
  type ControlIntent,
  type IntentResult,
} from "./intent-classify.js";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
}

// Stub model caller that always returns a fixed JSON string (never hits network).
function stubReturning(json: string): (s: string, u: string) => Promise<string> {
  return async () => json;
}
// Stub model caller that throws — exercises the availability-safe fallback.
function stubThrows(): (s: string, u: string) => Promise<string> {
  return async () => {
    throw new Error("model down");
  };
}

async function main(): Promise<void> {
  // --- Keyword fast-path (no model) ---
  {
    const r = await classifyControlIntent("please pause");
    check(
      "'please pause' -> halt (keyword)",
      r.intent === "halt" && r.source === "keyword" && r.confidence === 1,
      `got intent=${r.intent} source=${r.source} confidence=${r.confidence}`
    );
  }
  {
    const r = await classifyControlIntent("STOP");
    check(
      "'STOP' -> halt (keyword)",
      r.intent === "halt" && r.source === "keyword",
      `got intent=${r.intent} source=${r.source}`
    );
  }
  {
    const r = await classifyControlIntent("you can resume now");
    check(
      "'you can resume now' -> resume (keyword)",
      r.intent === "resume" && r.source === "keyword",
      `got intent=${r.intent} source=${r.source}`
    );
  }
  {
    const r = await classifyControlIntent("send me fewer emails");
    check(
      "'send me fewer emails' -> throttle (keyword)",
      r.intent === "throttle" && r.source === "keyword",
      `got intent=${r.intent} source=${r.source}`
    );
  }
  {
    // Conflicting control keywords (halt + resume) -> ambiguous -> fail-safe halt.
    // Regression for the live-test miss where "start again" flipped a clear pause.
    const r = await classifyControlIntent("can you pause for now? I'll tell you when to start again");
    check(
      "'pause ... start again' -> ambiguous (keyword), isHaltIntent true",
      r.intent === "ambiguous" && r.source === "keyword" && isHaltIntent(r) === true,
      `got intent=${r.intent} source=${r.source} isHalt=${isHaltIntent(r)}`
    );
  }

  // --- Model path (stubbed) ---
  {
    const r = await classifyControlIntent("pull the downtown comps", {
      callModel: stubReturning('{"intent":"normal","confidence":0.9}'),
    });
    check(
      "clear task -> normal (source model)",
      r.intent === "normal" && r.source === "model" && r.confidence === 0.9,
      `got intent=${r.intent} source=${r.source} confidence=${r.confidence}`
    );
  }
  {
    const r = await classifyControlIntent("about that thing earlier", {
      callModel: stubReturning('{"intent":"ambiguous","confidence":0.5}'),
    });
    check(
      "ambiguous -> intent ambiguous AND isHaltIntent true (fail-safe)",
      r.intent === "ambiguous" && r.source === "model" && isHaltIntent(r) === true,
      `got intent=${r.intent} source=${r.source} isHalt=${isHaltIntent(r)}`
    );
  }
  {
    const r = await classifyControlIntent("do the weekly report", {
      callModel: stubThrows(),
    });
    check(
      "model throws -> normal (source fallback, availability-safe)",
      r.intent === "normal" && r.source === "fallback" && r.confidence === 0,
      `got intent=${r.intent} source=${r.source} confidence=${r.confidence}`
    );
  }
  {
    const r = await classifyControlIntent("no json here at all", {
      callModel: stubReturning("sorry, I can't help with that"),
    });
    check(
      "unparseable model output -> normal (source fallback)",
      r.intent === "normal" && r.source === "fallback",
      `got intent=${r.intent} source=${r.source}`
    );
  }

  // --- isHaltIntent unit cases ---
  const mk = (intent: ControlIntent): IntentResult => ({
    intent,
    confidence: 1,
    source: "keyword",
  });
  check("isHaltIntent(halt) === true", isHaltIntent(mk("halt")) === true);
  check("isHaltIntent(ambiguous) === true", isHaltIntent(mk("ambiguous")) === true);
  check("isHaltIntent(normal) === false", isHaltIntent(mk("normal")) === false);
  check("isHaltIntent(resume) === false", isHaltIntent(mk("resume")) === false);
  check("isHaltIntent(throttle) === false", isHaltIntent(mk("throttle")) === false);

  console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
