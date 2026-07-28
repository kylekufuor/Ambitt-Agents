// Run: node_modules/.bin/tsx dashboard/src/lib/oracle.test.ts   (from repo root)
// Pure unit test for the operator-action wiring. No fetch, no Next, no DB.
//
// The regression this guards: the dashboard's Resume button POSTed to
// /agents/:id/approve, which re-runs first-time activation — welcome email +
// AI brief + PDF, site re-scan, T+3/7/14 drip re-enqueued, dryRun flipped off.
// Resuming a spam-paused agent therefore re-spammed the client and disarmed
// containment. Resume must hit /agents/:id/resume with operator authority.
import { agentActionRequest, opErrorHref, readOpError, ORACLE_URL_FALLBACK, oracleUrl } from "./oracle.js";

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

// --- The Resume/Approve split ----------------------------------------------
const resume = agentActionRequest("agt_1", "resume");
check("resume → /resume endpoint", resume?.path === "/agents/agt_1/resume", JSON.stringify(resume));
check("resume NEVER hits /approve", !(resume?.path ?? "").endsWith("/approve"), JSON.stringify(resume));
check("resume claims operator authority", resume?.body?.requester === "operator", JSON.stringify(resume?.body));

const approve = agentActionRequest("agt_1", "approve");
check("approve (first-time activation) still → /approve", approve?.path === "/agents/agt_1/approve", JSON.stringify(approve));
check("approve sends no authority body", approve?.body === undefined, JSON.stringify(approve));

// --- Pause carries operator authority --------------------------------------
// Oracle treats any caller that doesn't say "operator" as a CLIENT, and a
// client pause is the weakest halt (a client can lift it from the portal).
const pause = agentActionRequest("agt_1", "pause");
check("pause → /pause endpoint", pause?.path === "/agents/agt_1/pause", JSON.stringify(pause));
check("pause claims operator authority", pause?.body?.by === "operator", JSON.stringify(pause?.body));
check("pause records a reason", typeof pause?.body?.reason === "string", JSON.stringify(pause?.body));

// --- Pass-through actions ---------------------------------------------------
for (const action of ["run", "reject", "kill", "send-tools-invite"]) {
  const req = agentActionRequest("agt_1", action);
  check(`${action} → /agents/:id/${action}`, req?.path === `/agents/agt_1/${action}`, JSON.stringify(req));
  check(`${action} sends no body`, req?.body === undefined, JSON.stringify(req));
}

// --- Unknown / hostile actions are refused, not proxied ---------------------
check("unknown action rejected", agentActionRequest("agt_1", "delete-everything") === null);
check("empty action rejected", agentActionRequest("agt_1", "") === null);
check("path traversal rejected", agentActionRequest("agt_1", "../../clients") === null);
check("agent id is URL-encoded", agentActionRequest("a/b", "kill")?.path === "/agents/a%2Fb/kill", JSON.stringify(agentActionRequest("a/b", "kill")));

// --- Host ------------------------------------------------------------------
check("fallback host is the live Oracle", ORACLE_URL_FALLBACK === "https://oracle-production-c0ff.up.railway.app", ORACLE_URL_FALLBACK);
check("dead Railway edge is gone", !ORACLE_URL_FALLBACK.includes("ambitt-agents-production"));
check("oracleUrl() honours ORACLE_URL when set", (() => {
  const prev = process.env.ORACLE_URL;
  process.env.ORACLE_URL = "http://localhost:3000";
  const got = oracleUrl();
  if (prev === undefined) delete process.env.ORACLE_URL;
  else process.env.ORACLE_URL = prev;
  return got === "http://localhost:3000";
})());

// --- Failure round-trip: action → href → banner -----------------------------
check("success redirects clean", opErrorHref("/agents/agt_1", null) === "/agents/agt_1");
check("empty error redirects clean", opErrorHref("/agents/agt_1", "") === "/agents/agt_1");
const href = opErrorHref("/agents/agt_1", "/agents/agt_1/pause failed — 500: Pause failed");
check("failure carries the message", href.startsWith("/agents/agt_1?opError="), href);
check(
  "message survives the round trip",
  readOpError({ opError: decodeURIComponent(href.split("opError=")[1]) }) === "/agents/agt_1/pause failed — 500: Pause failed",
  href
);
check("query-string metachars are encoded", !opErrorHref("/x", "a&b=c#d").slice("/x?opError=".length).includes("&"), opErrorHref("/x", "a&b=c#d"));

// --- readOpError -----------------------------------------------------------
check("no searchParams → null", readOpError(undefined) === null);
check("no opError key → null", readOpError({ tab: "config" }) === null);
check("blank opError → null", readOpError({ opError: "   " }) === null);
check("repeated opError takes the first", readOpError({ opError: ["first", "second"] }) === "first");
check("long message is capped", (readOpError({ opError: "z".repeat(1000) }) ?? "").length === 220);

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
