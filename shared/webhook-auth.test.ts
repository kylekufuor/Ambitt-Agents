// Run: node_modules/.bin/tsx shared/webhook-auth.test.ts
// Pure unit test for webhook sender verification — no server boot, no DB, no
// network. Signatures are generated locally with the same libraries the
// verifiers use (svix Webhook.sign / twilio.getExpectedTwilioSignature), so a
// "valid signature" case is a real signature, not a stub.
import twilio from "twilio";
import { Webhook } from "svix";
import {
  readWebhookAuthMode,
  collectSecrets,
  decideWebhookAuth,
  verifySvixSignature,
  verifyTwilioSignature,
  buildTwilioWebhookUrl,
  twilioFormParams,
  rememberRawBody,
  recallRawBody,
  type HeaderBag,
} from "./webhook-auth.js";

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
function checkTrue(name: string, cond: boolean, context?: unknown) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    if (context !== undefined) console.log(`        context ${JSON.stringify(context)}`);
  }
}

// --- readWebhookAuthMode ----------------------------------------------------
check("mode: unset → observe", readWebhookAuthMode(undefined), "observe");
check("mode: blank → observe", readWebhookAuthMode("  "), "observe");
check("mode: observe → observe", readWebhookAuthMode("observe"), "observe");
check("mode: enforce → enforce", readWebhookAuthMode("enforce"), "enforce");
check("mode: ENFORCE (case) → enforce", readWebhookAuthMode("  ENFORCE "), "enforce");
check("mode: garbage → observe (never accidentally enforce)", readWebhookAuthMode("yes"), "observe");
check("mode: 'true' → observe", readWebhookAuthMode("true"), "observe");

// --- collectSecrets ---------------------------------------------------------
check("secrets: all blank → empty", collectSecrets([undefined, "", "   ", null]), []);
check("secrets: order preserved", collectSecrets(["a", "b"]), ["a", "b"]);
check("secrets: comma-separated split + trimmed", collectSecrets(["a , b"]), ["a", "b"]);
check("secrets: duplicates dropped", collectSecrets(["a", "a", "b"]), ["a", "b"]);
check("secrets: blank inside a list dropped", collectSecrets(["a,,b"]), ["a", "b"]);

// --- decideWebhookAuth ------------------------------------------------------
check(
  "decide: verified in observe → proceed",
  decideWebhookAuth("observe", { status: "verified", detail: "" }),
  { mode: "observe", proceed: true, rejected: false, logLevel: "info" }
);
check(
  "decide: verified in enforce → proceed",
  decideWebhookAuth("enforce", { status: "verified", detail: "" }),
  { mode: "enforce", proceed: true, rejected: false, logLevel: "info" }
);
check(
  "decide: failed in observe → proceed (process exactly as before) + warn",
  decideWebhookAuth("observe", { status: "failed", detail: "" }),
  { mode: "observe", proceed: true, rejected: false, logLevel: "warn" }
);
check(
  "decide: failed in enforce → reject",
  decideWebhookAuth("enforce", { status: "failed", detail: "" }),
  { mode: "enforce", proceed: false, rejected: true, logLevel: "warn" }
);
check(
  "decide: missing signature in observe → proceed",
  decideWebhookAuth("observe", { status: "missing_signature", detail: "" }),
  { mode: "observe", proceed: true, rejected: false, logLevel: "warn" }
);
check(
  "decide: missing signature in enforce → reject",
  decideWebhookAuth("enforce", { status: "missing_signature", detail: "" }),
  { mode: "enforce", proceed: false, rejected: true, logLevel: "warn" }
);
check(
  "decide: NO SECRET in observe → proceed + warn",
  decideWebhookAuth("observe", { status: "unconfigured", detail: "" }),
  { mode: "observe", proceed: true, rejected: false, logLevel: "warn" }
);
check(
  "decide: NO SECRET in enforce → still proceeds (never fail closed on a missing secret)",
  decideWebhookAuth("enforce", { status: "unconfigured", detail: "" }),
  { mode: "enforce", proceed: true, rejected: false, logLevel: "warn" }
);

// --- verifySvixSignature ----------------------------------------------------
const SECRET_A = "whsec_" + Buffer.from("ambitt-inbound-test-secret-key-1").toString("base64");
const SECRET_B = "whsec_" + Buffer.from("ambitt-inbound-test-secret-key-2").toString("base64");
const PAYLOAD = JSON.stringify({
  type: "email.received",
  data: { email_id: "1a2b3c", from: "client@example.com", to: ["reply-ag_1@ambitt.agency"] },
});
const MSG_ID = "msg_2abcDEF";

function svixHeaders(secret: string, payload: string, when: Date, id = MSG_ID): HeaderBag {
  const signature = new Webhook(secret).sign(id, when, payload);
  return {
    "svix-id": id,
    "svix-timestamp": String(Math.floor(when.getTime() / 1000)),
    "svix-signature": signature,
  };
}

const now = new Date();
{
  const headers = svixHeaders(SECRET_A, PAYLOAD, now);
  const r = verifySvixSignature({ rawBody: Buffer.from(PAYLOAD), headers, secrets: [SECRET_A] });
  check("svix: valid signature → verified", r.status, "verified");
}
{
  // Same signature, body altered — this is the attack: swap the `from` address
  // on a genuine payload.
  const headers = svixHeaders(SECRET_A, PAYLOAD, now);
  const tampered = PAYLOAD.replace("client@example.com", "attacker@evil.com");
  const r = verifySvixSignature({ rawBody: Buffer.from(tampered), headers, secrets: [SECRET_A] });
  check("svix: tampered body → failed", r.status, "failed");
}
{
  const headers = svixHeaders(SECRET_A, PAYLOAD, now);
  const r = verifySvixSignature({ rawBody: Buffer.from(PAYLOAD), headers, secrets: [SECRET_B] });
  check("svix: wrong secret → failed", r.status, "failed");
}
{
  const headers = svixHeaders(SECRET_B, PAYLOAD, now);
  const r = verifySvixSignature({
    rawBody: Buffer.from(PAYLOAD),
    headers,
    secrets: [SECRET_A, SECRET_B],
  });
  check("svix: second secret in the list matches (rotation) → verified", r.status, "verified");
  check("svix: detail names the index, never the secret", r.detail, "svix:secret_1");
  checkTrue("svix: detail leaks no secret material", !r.detail.includes(SECRET_B), r.detail);
}
{
  const headers = svixHeaders(SECRET_A, PAYLOAD, now);
  const r = verifySvixSignature({ rawBody: Buffer.from(PAYLOAD), headers, secrets: [] });
  check("svix: no secret configured → unconfigured", r.status, "unconfigured");
  check("svix: unconfigured detail", r.detail, "no_signing_secret_configured");
}
{
  const r = verifySvixSignature({ rawBody: Buffer.from(PAYLOAD), headers: {}, secrets: [SECRET_A] });
  check("svix: no headers at all → missing_signature", r.status, "missing_signature");
}
{
  const headers = svixHeaders(SECRET_A, PAYLOAD, now);
  delete headers["svix-timestamp"];
  const r = verifySvixSignature({ rawBody: Buffer.from(PAYLOAD), headers, secrets: [SECRET_A] });
  check("svix: partial headers (no timestamp) → missing_signature", r.status, "missing_signature");
}
{
  const headers = svixHeaders(SECRET_A, PAYLOAD, now);
  const r = verifySvixSignature({ rawBody: undefined, headers, secrets: [SECRET_A] });
  check("svix: raw body not captured → failed (never guess)", r.status, "failed");
  check("svix: raw-body detail is diagnosable", r.detail, "raw_body_unavailable");
}
{
  // Unbranded webhook-* spelling of the same headers.
  const signed = svixHeaders(SECRET_A, PAYLOAD, now);
  const headers: HeaderBag = {
    "webhook-id": signed["svix-id"],
    "webhook-timestamp": signed["svix-timestamp"],
    "webhook-signature": signed["svix-signature"],
  };
  const r = verifySvixSignature({ rawBody: Buffer.from(PAYLOAD), headers, secrets: [SECRET_A] });
  check("svix: unbranded webhook-* headers → verified", r.status, "verified");
}
{
  // Regression: the signature header is literally "v1,<base64>" and Svix may
  // send several space-separated versions. Any comma-splitting of the header
  // (fine for x-forwarded-*, fatal here) corrupts every signature.
  const signed = svixHeaders(SECRET_A, PAYLOAD, now);
  const headers: HeaderBag = {
    ...signed,
    "svix-signature": `v0,ZmFrZXNpZ25hdHVyZQ== ${signed["svix-signature"]}`,
  };
  const r = verifySvixSignature({ rawBody: Buffer.from(PAYLOAD), headers, secrets: [SECRET_A] });
  check("svix: multi-version signature header → verified", r.status, "verified");
}
{
  // Replay of a genuine, correctly-signed payload from an hour ago.
  const old = new Date(Date.now() - 60 * 60 * 1000);
  const headers = svixHeaders(SECRET_A, PAYLOAD, old);
  const r = verifySvixSignature({ rawBody: Buffer.from(PAYLOAD), headers, secrets: [SECRET_A] });
  check("svix: stale timestamp (replay) → failed", r.status, "failed");
}
{
  // String body accepted as well as Buffer.
  const headers = svixHeaders(SECRET_A, PAYLOAD, now);
  const r = verifySvixSignature({ rawBody: PAYLOAD, headers, secrets: [SECRET_A] });
  check("svix: string raw body → verified", r.status, "verified");
}

// --- verifyTwilioSignature --------------------------------------------------
const TWILIO_TOKEN = "test_auth_token_not_a_real_credential";
const SMS_URL = "https://oracle.example.com/webhooks/sms";
const SMS_PARAMS = {
  From: "+18175551234",
  To: "+18178097106",
  Body: "482913",
  MessageSid: "SM00000000000000000000000000000001",
};
const smsSignature = twilio.getExpectedTwilioSignature(TWILIO_TOKEN, SMS_URL, SMS_PARAMS);

{
  const r = verifyTwilioSignature({
    authToken: TWILIO_TOKEN,
    signature: smsSignature,
    url: SMS_URL,
    params: SMS_PARAMS,
  });
  check("twilio: valid signature → verified", r.status, "verified");
}
{
  // The attack: same signature, forged code.
  const r = verifyTwilioSignature({
    authToken: TWILIO_TOKEN,
    signature: smsSignature,
    url: SMS_URL,
    params: { ...SMS_PARAMS, Body: "000000" },
  });
  check("twilio: tampered param (forged 2FA code) → failed", r.status, "failed");
}
{
  const r = verifyTwilioSignature({
    authToken: TWILIO_TOKEN,
    signature: smsSignature,
    url: "https://oracle.example.com/webhooks/whatsapp",
    params: SMS_PARAMS,
  });
  check("twilio: signature replayed onto another route → failed", r.status, "failed");
}
{
  const r = verifyTwilioSignature({
    authToken: "some_other_token",
    signature: smsSignature,
    url: SMS_URL,
    params: SMS_PARAMS,
  });
  check("twilio: wrong auth token → failed", r.status, "failed");
}
{
  const r = verifyTwilioSignature({
    authToken: TWILIO_TOKEN,
    signature: "",
    url: SMS_URL,
    params: SMS_PARAMS,
  });
  check("twilio: missing X-Twilio-Signature → missing_signature", r.status, "missing_signature");
}
{
  const r = verifyTwilioSignature({
    authToken: undefined,
    signature: smsSignature,
    url: SMS_URL,
    params: SMS_PARAMS,
  });
  check("twilio: no auth token configured → unconfigured", r.status, "unconfigured");
  check("twilio: unconfigured detail", r.detail, "no_twilio_auth_token");
}
{
  const r = verifyTwilioSignature({
    authToken: TWILIO_TOKEN,
    signature: smsSignature,
    url: "",
    params: SMS_PARAMS,
  });
  check("twilio: URL could not be rebuilt → failed", r.status, "failed");
}
{
  const r = verifyTwilioSignature({
    authToken: TWILIO_TOKEN,
    signature: smsSignature,
    url: SMS_URL,
    params: SMS_PARAMS,
  });
  checkTrue("twilio: detail leaks no token material", !r.detail.includes(TWILIO_TOKEN), r.detail);
}

// --- buildTwilioWebhookUrl --------------------------------------------------
check(
  "url: forwarded proto + host (Railway TLS termination)",
  buildTwilioWebhookUrl({
    headers: { "x-forwarded-proto": "https", host: "oracle-production-c0ff.up.railway.app" },
    originalUrl: "/webhooks/sms",
  }),
  "https://oracle-production-c0ff.up.railway.app/webhooks/sms"
);
check(
  "url: defaults to https when no forwarded proto",
  buildTwilioWebhookUrl({ headers: { host: "oracle.example.com" }, originalUrl: "/webhooks/sms" }),
  "https://oracle.example.com/webhooks/sms"
);
check(
  "url: honours http when the proxy says http",
  buildTwilioWebhookUrl({
    headers: { "x-forwarded-proto": "http", host: "localhost:3000" },
    originalUrl: "/webhooks/sms",
  }),
  "http://localhost:3000/webhooks/sms"
);
check(
  "url: comma-joined proxy header takes the first hop",
  buildTwilioWebhookUrl({
    headers: { "x-forwarded-proto": "https,http", host: "oracle.example.com" },
    originalUrl: "/webhooks/sms",
  }),
  "https://oracle.example.com/webhooks/sms"
);
check(
  "url: x-forwarded-host wins over host",
  buildTwilioWebhookUrl({
    headers: { "x-forwarded-host": "oracle.ambitt.agency", host: "internal:8080" },
    originalUrl: "/webhooks/sms",
  }),
  "https://oracle.ambitt.agency/webhooks/sms"
);
check(
  "url: query string preserved (Twilio signs it)",
  buildTwilioWebhookUrl({
    headers: { host: "oracle.example.com" },
    originalUrl: "/webhooks/sms?x=1",
  }),
  "https://oracle.example.com/webhooks/sms?x=1"
);
check(
  "url: override base wins and its trailing slash is trimmed",
  buildTwilioWebhookUrl({
    headers: { host: "internal:8080" },
    originalUrl: "/webhooks/sms",
    overrideBase: "https://oracle.ambitt.agency/",
  }),
  "https://oracle.ambitt.agency/webhooks/sms"
);
check(
  "url: blank override ignored",
  buildTwilioWebhookUrl({
    headers: { host: "oracle.example.com" },
    originalUrl: "/webhooks/sms",
    overrideBase: "   ",
  }),
  "https://oracle.example.com/webhooks/sms"
);
check(
  "url: no host at all → empty (verifier reports failed, never crashes)",
  buildTwilioWebhookUrl({ headers: {}, originalUrl: "/webhooks/sms" }),
  ""
);

// End-to-end: rebuild the URL from headers, then verify a signature made for it.
{
  const url = buildTwilioWebhookUrl({
    headers: { "x-forwarded-proto": "https", host: "oracle-production-c0ff.up.railway.app" },
    originalUrl: "/webhooks/sms",
  });
  const sig = twilio.getExpectedTwilioSignature(TWILIO_TOKEN, url, SMS_PARAMS);
  const r = verifyTwilioSignature({
    authToken: TWILIO_TOKEN,
    signature: sig,
    url,
    params: SMS_PARAMS,
  });
  check("twilio: rebuilt-URL round trip → verified", r.status, "verified");
}

// --- twilioFormParams -------------------------------------------------------
check("params: strings pass through", twilioFormParams({ From: "+1", Body: "hi" }), {
  From: "+1",
  Body: "hi",
});
check("params: undefined body → empty", twilioFormParams(undefined), {});
check("params: non-object body → empty", twilioFormParams("From=+1"), {});
check("params: null values dropped", twilioFormParams({ From: "+1", Body: null }), { From: "+1" });

// --- raw-body stash ---------------------------------------------------------
{
  const reqA = {};
  const reqB = {};
  rememberRawBody(reqA, Buffer.from("A"));
  check("rawBody: recalled for the request it was stored against", recallRawBody(reqA)?.toString(), "A");
  check("rawBody: not leaked to a different request", recallRawBody(reqB), undefined);
}

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
