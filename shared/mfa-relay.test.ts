// Run: node_modules/.bin/tsx shared/mfa-relay.test.ts
// Pure unit test for the MFA-relay state module — no server boot, no DB, no
// Twilio. relayMfaRequest (prisma + send paths) is covered by the synthetic
// webhook/QA flow, not here. State is module-global, so every case uses its
// own clientId/phone.
import {
  MFA_TTL_MS,
  phoneKey,
  extractMfaCode,
  registerPendingByClient,
  registerPendingByPhone,
  capturePhoneCode,
  captureEmailCode,
  takeCode,
  relayThrottled,
  smsCapExceeded,
  recordSmsSend,
} from "./mfa-relay.js";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    console.log(`        got  ${g}`);
    console.log(`        want ${w}`);
  }
}

// --- phoneKey ---------------------------------------------------------------
check("phoneKey formatted US", phoneKey("+1 (817) 809-7106"), "8178097106");
check("phoneKey whatsapp prefix", phoneKey("whatsapp:+18178097106"), "8178097106");
check("phoneKey bare 10-digit", phoneKey("8178097106"), "8178097106");
check("phoneKey short number", phoneKey("55123"), "55123");
check("phoneKey empty", phoneKey(""), "");

// --- extractMfaCode ---------------------------------------------------------
check("code: bare digits", extractMfaCode("123456"), "123456");
check("code: in a sentence", extractMfaCode("my code is 482913."), "482913");
check("code: G- prefix (Google style)", extractMfaCode("G-482913"), "482913");
check("code: hyphen pair", extractMfaCode("123-456"), "123456");
check("code: space pair", extractMfaCode("123 456"), "123456");
check("code: 4-digit min", extractMfaCode("code 1234 ok"), "1234");
check("code: 8-digit max", extractMfaCode("12345678"), "12345678");
check("code: 3-digit reject", extractMfaCode("123"), null);
check("code: 9-digit reject", extractMfaCode("123456789"), null);
check("code: no digits", extractMfaCode("what code?"), null);
check("code: empty", extractMfaCode(""), null);
check(
  "code: email reply, code above quoted history",
  extractMfaCode("Here you go: 774421\n\nOn Mon, Jul 21, CoStar wrote:\n> Your code is 999999"),
  "774421"
);
check(
  "code: only digits are in the quote → null",
  extractMfaCode("Is this what you need?\n> Your code is 999999"),
  null
);

// --- phone capture round-trip (worker origin) -------------------------------
registerPendingByPhone("+18175550001", { clientId: "cw1", origin: "worker" });
check(
  "worker capture matches by any phone shape",
  capturePhoneCode("whatsapp:+1 817 555 0001", "482913"),
  { kind: "captured", clientId: "cw1", agentId: undefined, origin: "worker", code: "482913" }
);
check("worker capture fed the poll map", takeCode("cw1"), "482913");
check("takeCode consumed on read", takeCode("cw1"), null);
check("phone pending consumed by capture", capturePhoneCode("+18175550001", "482913"), { kind: "no_match" });

// --- engine origin: code does NOT land in the worker poll map ---------------
registerPendingByPhone("+18175550002", { clientId: "ce1", agentId: "agent-e1", origin: "engine" });
check(
  "engine capture returns agentId + origin",
  capturePhoneCode("+18175550002", "my code is 555777"),
  { kind: "captured", clientId: "ce1", agentId: "agent-e1", origin: "engine", code: "555777" }
);
check("engine capture skips codes2fa", takeCode("ce1"), null);

// --- garbage reply: nudge exactly once --------------------------------------
registerPendingByPhone("+18175550003", { clientId: "cn1", origin: "worker" });
check("first garbage reply nudges", capturePhoneCode("+18175550003", "what code?"), { kind: "no_code", nudge: true });
check("second garbage reply is silent", capturePhoneCode("+18175550003", "hello??"), { kind: "no_code", nudge: false });
check(
  "real code still captures after garbage",
  capturePhoneCode("+18175550003", "774421"),
  { kind: "captured", clientId: "cn1", agentId: undefined, origin: "worker", code: "774421" }
);

// --- unknown sender ---------------------------------------------------------
check("unknown sender no-match", capturePhoneCode("+19998887777", "482913"), { kind: "no_match" });

// --- TTL expiry (faked `at`) ------------------------------------------------
const stale = Date.now() - MFA_TTL_MS - 1000;
registerPendingByPhone("+18175550004", { clientId: "ct1", origin: "worker" }, stale);
check("expired phone pending no-match", capturePhoneCode("+18175550004", "482913"), { kind: "no_match" });
registerPendingByClient("ct2", "task-t2", stale);
check("expired email pending no-match", captureEmailCode("ct2", "482913"), { matched: false });
// expired code never returned by the poll
registerPendingByClient("ct3", "task-t3");
check("email capture within TTL", captureEmailCode("ct3", "Here it is 998877"), { matched: true, code: "998877" });
// simulate the code sitting past TTL by re-registering with a stale capture:
// takeCode TTL-checks the stored `at`, so drive it via capturePhoneCode(now=stale-capture)
registerPendingByPhone("+18175550005", { clientId: "ct4", origin: "worker" }, stale + 500);
check(
  "capture at the TTL edge still no-match",
  capturePhoneCode("+18175550005", "482913", stale + 500 + MFA_TTL_MS),
  { kind: "no_match" }
);

// --- sibling sweeps (wrong-channel coexistence) -----------------------------
// Ask went out by SMS (worker), client replies by EMAIL → phone pending swept.
registerPendingByClient("cs1", "task-s1");
registerPendingByPhone("+18175550006", { clientId: "cs1", origin: "worker" });
check("email capture wins", captureEmailCode("cs1", "code: 111222"), { matched: true, code: "111222" });
check("phone sibling swept after email capture", capturePhoneCode("+18175550006", "111222"), { kind: "no_match" });
// Ask went out by SMS, client texts back → email guard (pending2fa) swept.
registerPendingByClient("cs2", "task-s2");
registerPendingByPhone("+18175550007", { clientId: "cs2", origin: "worker" });
check(
  "phone capture wins",
  capturePhoneCode("+18175550007", "333444"),
  { kind: "captured", clientId: "cs2", agentId: undefined, origin: "worker", code: "333444" }
);
check("email guard swept after phone capture", captureEmailCode("cs2", "333444"), { matched: false });

// --- throttle ---------------------------------------------------------------
// No prior relay → not throttled.
check("no relay history → not throttled", relayThrottled("cth0"), null);
// relayThrottled needs lastRelay set by relayMfaRequest (private) — the
// observable contract here: with NO un-answered pending, never throttled.
registerPendingByClient("cth1", "task-th1");
check("pending but no recent relay → not throttled", relayThrottled("cth1"), null);

// --- hourly SMS cap ---------------------------------------------------------
const capNow = Date.now();
for (let i = 0; i < 5; i++) recordSmsSend("ccap1", capNow - i * 60_000);
check("under cap (5 in the hour)", smsCapExceeded("ccap1", capNow), { exceeded: false, alertOperator: false });
recordSmsSend("ccap1", capNow);
check("at cap → exceeded + alert once", smsCapExceeded("ccap1", capNow), { exceeded: true, alertOperator: true });
check("still capped → no second alert", smsCapExceeded("ccap1", capNow + 1000), { exceeded: true, alertOperator: false });
check(
  "window drained → cap lifts",
  smsCapExceeded("ccap1", capNow + 61 * 60_000),
  { exceeded: false, alertOperator: false }
);

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
