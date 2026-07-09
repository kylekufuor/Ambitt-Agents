import crypto from "crypto";

// ---------------------------------------------------------------------------
// Device Token — HMAC-signed opaque tokens for paired local workers
// ---------------------------------------------------------------------------
// The "Ambitt Agents" Chrome extension pairs once (portal mints a short code,
// the extension exchanges it for one of these tokens) and then sends the token
// on every poll/result request. Verification is stateless: the token encodes
// the ClientDevice id, and the caller re-checks the device row's status +
// revokedAt on each request. Rotate DEVICE_TOKEN_SECRET to revoke everything.
//
// Token format:  base64url(payload).base64url(hmac_sha256(secret, payload))
// Payload shape: { t: "d", d: deviceId, i: issuedAtMs }   ("d" tags the domain
// so a chat token can never be replayed as a device token, even when both fall
// back to the same secret.)
// ---------------------------------------------------------------------------

interface DeviceTokenPayload {
  t: "d";
  d: string; // deviceId
  i: number; // issuedAt (ms since epoch)
}

export interface DeviceTokenClaims {
  deviceId: string;
  issuedAt: Date;
}

function getSecret(): Buffer {
  // Prefer a dedicated secret; fall back to CHAT_TOKEN_SECRET so this works in
  // existing environments before a dedicated one is provisioned on Railway.
  const raw = process.env.DEVICE_TOKEN_SECRET || process.env.CHAT_TOKEN_SECRET;
  if (!raw) throw new Error("DEVICE_TOKEN_SECRET (or CHAT_TOKEN_SECRET) is not set");
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  return Buffer.from(raw, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str: string): Buffer {
  const pad = str.length % 4 === 0 ? 0 : 4 - (str.length % 4);
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(padded, "base64");
}

export function signDeviceToken(deviceId: string): string {
  const payload: DeviceTokenPayload = { t: "d", d: deviceId, i: Date.now() };
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const mac = crypto.createHmac("sha256", getSecret()).update(payloadBytes).digest();
  return `${b64url(payloadBytes)}.${b64url(mac)}`;
}

/**
 * Verify a device token. Returns the decoded claims, or throws on tampering /
 * malformed input. No expiry check here — revocation is the per-request
 * ClientDevice.status/revokedAt lookup done by the caller.
 */
export function verifyDeviceToken(token: string): DeviceTokenClaims {
  const [payloadStr, macStr] = (token ?? "").split(".");
  if (!payloadStr || !macStr) throw new Error("Malformed device token");

  const payloadBytes = fromB64url(payloadStr);
  const expectedMac = crypto.createHmac("sha256", getSecret()).update(payloadBytes).digest();
  const gotMac = fromB64url(macStr);

  if (expectedMac.length !== gotMac.length || !crypto.timingSafeEqual(expectedMac, gotMac)) {
    throw new Error("Invalid device token signature");
  }

  let parsed: DeviceTokenPayload;
  try {
    parsed = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw new Error("Malformed device token payload");
  }

  if (parsed.t !== "d" || typeof parsed.d !== "string" || typeof parsed.i !== "number") {
    throw new Error("Invalid device token claims");
  }

  return { deviceId: parsed.d, issuedAt: new Date(parsed.i) };
}
