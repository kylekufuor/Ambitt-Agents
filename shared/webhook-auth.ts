// Webhook sender verification — Svix (Resend) + Twilio signatures.
//
// Oracle's webhook routes are internet-facing and, until this module, took the
// caller's word for who they were: /webhooks/email-inbound read the `from`
// address straight out of an unauthenticated POST body, so anyone who could
// spell a client's email address could drive that client's agent. Same class
// of hole on /webhooks/sms (forged 2FA codes) and /webhooks/whatsapp.
//
// This verifies the SENDER cryptographically, in front of — never instead of —
// the identity checks the routes already run (machine-email guard,
// classifyAutomatedInbound, checkInboundAuth, the Kyle-number check).
//
// Pure module: no express, no prisma, no logger. Routes hand in raw bytes +
// headers and get back a verdict plus a decision; the route owns the logging
// and the response. Nothing here ever returns, logs, or echoes secret or
// signature material — `detail` is always safe to put in a log line.
import twilio from "twilio";
import { Webhook } from "svix";

// observe = verify + report, process the request exactly as before.
// enforce = reject unverified requests.
// Default is observe, deliberately: these routes carry ALL client email, and a
// signing secret that is missing or wrong must never silently kill inbound
// mail. Flip to enforce only once the logs show real traffic verifying.
export type WebhookAuthMode = "observe" | "enforce";

export type VerifyStatus =
  | "verified" // signature present and valid
  | "failed" // signature present, did not verify
  | "missing_signature" // caller sent no signature headers at all
  | "unconfigured"; // no signing secret set for this route — cannot verify

export interface VerifyResult {
  status: VerifyStatus;
  /** Safe-to-log diagnostic. Never contains a secret, signature, or payload. */
  detail: string;
}

export interface WebhookAuthDecision {
  mode: WebhookAuthMode;
  /** Run the handler? */
  proceed: boolean;
  /** True when this request is being turned away (enforce mode only). */
  rejected: boolean;
  logLevel: "info" | "warn";
}

/** Parse WEBHOOK_AUTH_MODE. Anything that isn't exactly "enforce" is observe. */
export function readWebhookAuthMode(raw: string | undefined): WebhookAuthMode {
  return String(raw ?? "").trim().toLowerCase() === "enforce" ? "enforce" : "observe";
}

/** Live mode from the environment. */
export function webhookAuthMode(): WebhookAuthMode {
  return readWebhookAuthMode(process.env.WEBHOOK_AUTH_MODE);
}

/**
 * Normalise signing-secret env values into a candidate list. Accepts several
 * vars (Resend signs per-endpoint, so a route may legitimately have more than
 * one valid secret) and comma-separated values (rotation: old + new both
 * accepted for a window). Blanks dropped, duplicates dropped, order preserved.
 */
export function collectSecrets(values: (string | undefined | null)[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    for (const part of String(value ?? "").split(",")) {
      const secret = part.trim();
      if (secret && !out.includes(secret)) out.push(secret);
    }
  }
  return out;
}

/**
 * What the route should do with a verdict.
 *
 * `unconfigured` always proceeds, in BOTH modes. Failing closed on a missing
 * secret would take down inbound email the moment someone forgot a Railway
 * variable — an outage we have already lived through. It is logged loudly
 * instead so it cannot sit unnoticed.
 */
export function decideWebhookAuth(mode: WebhookAuthMode, result: VerifyResult): WebhookAuthDecision {
  if (result.status === "verified") {
    return { mode, proceed: true, rejected: false, logLevel: "info" };
  }
  if (result.status === "unconfigured") {
    return { mode, proceed: true, rejected: false, logLevel: "warn" };
  }
  const proceed = mode !== "enforce";
  return { mode, proceed, rejected: !proceed, logLevel: "warn" };
}

// --- header helpers ---------------------------------------------------------

export type HeaderBag = Record<string, string | string[] | undefined>;

/**
 * Header value, tolerating the array form Node uses for repeated headers.
 * Deliberately does NOT split on commas: a Svix signature header is literally
 * `v1,<base64>` (and may carry several space-separated versions), so comma
 * splitting would silently corrupt every signature.
 */
function headerValue(headers: HeaderBag, name: string): string {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  const raw = Array.isArray(direct) ? direct[0] : direct;
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Proxy hop header (x-forwarded-*). These DO get comma-joined when a request
 * crosses more than one proxy — the original client value is the first entry.
 */
function forwardedValue(headers: HeaderBag, name: string): string {
  return headerValue(headers, name).split(",")[0].trim();
}

// --- Svix (Resend) ----------------------------------------------------------

// Resend signs every webhook with Svix. Branded headers are svix-*; Svix also
// emits the unbranded webhook-* spelling, so accept either.
const SVIX_HEADER_SETS = [
  { id: "svix-id", timestamp: "svix-timestamp", signature: "svix-signature" },
  { id: "webhook-id", timestamp: "webhook-timestamp", signature: "webhook-signature" },
];

export interface SvixVerifyInput {
  /** EXACT bytes as received. A JSON round-trip will not reproduce them. */
  rawBody: Buffer | string | undefined;
  headers: HeaderBag;
  secrets: string[];
}

export function verifySvixSignature(input: SvixVerifyInput): VerifyResult {
  const { rawBody, headers, secrets } = input;

  if (secrets.length === 0) {
    return { status: "unconfigured", detail: "no_signing_secret_configured" };
  }

  let picked: Record<string, string> | null = null;
  for (const set of SVIX_HEADER_SETS) {
    const id = headerValue(headers, set.id);
    const timestamp = headerValue(headers, set.timestamp);
    const signature = headerValue(headers, set.signature);
    if (id && timestamp && signature) {
      picked = { [set.id]: id, [set.timestamp]: timestamp, [set.signature]: signature };
      break;
    }
  }
  if (!picked) {
    return { status: "missing_signature", detail: "no_svix_headers" };
  }

  if (rawBody === undefined || rawBody === null || rawBody.length === 0) {
    // The parser didn't stash the bytes (wrong content-type, or the route
    // wasn't registered for raw capture). Cannot verify — never guess.
    return { status: "failed", detail: "raw_body_unavailable" };
  }

  let lastError = "no_matching_signature";
  for (let i = 0; i < secrets.length; i++) {
    try {
      new Webhook(secrets[i]).verify(rawBody, picked);
      return { status: "verified", detail: `svix:secret_${i}` };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { status: "failed", detail: `svix:${lastError}`.slice(0, 160) };
}

// --- Twilio -----------------------------------------------------------------

export interface TwilioVerifyInput {
  authToken: string | undefined;
  /** X-Twilio-Signature header value. */
  signature: string;
  /** Full public URL Twilio was configured with, including any query string. */
  url: string;
  /** The parsed application/x-www-form-urlencoded body. */
  params: Record<string, string>;
}

export function verifyTwilioSignature(input: TwilioVerifyInput): VerifyResult {
  const { authToken, signature, url, params } = input;

  if (!authToken || !authToken.trim()) {
    return { status: "unconfigured", detail: "no_twilio_auth_token" };
  }
  if (!signature) {
    return { status: "missing_signature", detail: "no_x_twilio_signature" };
  }
  if (!url) {
    return { status: "failed", detail: "url_unresolvable" };
  }

  try {
    // HMAC-SHA1 over (url + alphabetically-sorted form params), per Twilio.
    const ok = twilio.validateRequest(authToken.trim(), signature, url, params);
    return ok
      ? { status: "verified", detail: "twilio:ok" }
      : { status: "failed", detail: "twilio:signature_mismatch" };
  } catch (err) {
    return {
      status: "failed",
      detail: `twilio:${err instanceof Error ? err.message : String(err)}`.slice(0, 160),
    };
  }
}

/**
 * Rebuild the exact public URL Twilio signed. Twilio signs the URL it was
 * configured with — protocol, host, path, query string — and Railway
 * terminates TLS in front of us, so req.protocol/req.host see the internal
 * hop. Read the forwarded headers directly (rather than switching on
 * `trust proxy`, which would change req.ip for everything else).
 *
 * TWILIO_WEBHOOK_BASE_URL overrides host+protocol entirely, for the case where
 * the number is pointed at a domain Oracle never sees in the Host header.
 */
export function buildTwilioWebhookUrl(input: {
  headers: HeaderBag;
  originalUrl: string;
  overrideBase?: string;
}): string {
  const { headers, originalUrl, overrideBase } = input;
  const path = originalUrl || "/";

  const base = String(overrideBase ?? "").trim();
  if (base) return base.replace(/\/+$/, "") + path;

  const proto = forwardedValue(headers, "x-forwarded-proto") || "https";
  const host = forwardedValue(headers, "x-forwarded-host") || headerValue(headers, "host");
  if (!host) return "";
  return `${proto}://${host}${path}`;
}

/** Flatten a parsed urlencoded body to the string map Twilio signs over. */
export function twilioFormParams(body: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!body || typeof body !== "object") return out;
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : String(value);
  }
  return out;
}

// --- raw-body stash ---------------------------------------------------------

// Svix verification needs the bytes exactly as they arrived, but
// /webhooks/email-inbound sits below the global express.json() and its handler
// is ~650 lines long — moving it above the parser would be a large, risky
// reshuffle of the one path all client email flows through. Instead the JSON
// parser's `verify` hook hands us the buffer as it parses, and we keep it here
// keyed by the request object. WeakMap so it is collected with the request and
// so no `any` cast or global type augmentation is needed.
const rawBodies = new WeakMap<object, Buffer>();

export function rememberRawBody(key: object, raw: Buffer): void {
  rawBodies.set(key, raw);
}

export function recallRawBody(key: object): Buffer | undefined {
  return rawBodies.get(key);
}
