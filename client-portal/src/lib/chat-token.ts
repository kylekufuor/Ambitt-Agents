import crypto from "crypto";

// ---------------------------------------------------------------------------
// Chat Token — MIRROR of shared/chat-token.ts (Railway rootDirectory isolates
// client-portal from shared/, so shared modules must be copied in — same as
// pricing-constants). Keep this byte-for-byte in sync with the canonical file;
// the portal signs tokens here and Oracle verifies them with the SAME
// CHAT_TOKEN_SECRET, so any drift breaks chat auth.
// ---------------------------------------------------------------------------
// HMAC-signed opaque tokens binding a URL to a (clientId, agentId) pair.
// Stateless verification — the server only keeps CHAT_TOKEN_SECRET. Rotate the
// secret to revoke everyone. No expiry check.
//
// Token format:  base64url(payload).base64url(hmac_sha256(secret, payload))
// Payload shape: { c: clientId, a: agentId, i: issuedAtMs }
// ---------------------------------------------------------------------------

interface ChatTokenPayload {
  c: string; // clientId
  a: string; // agentId
  i: number; // issuedAt (ms since epoch)
}

export interface ChatTokenClaims {
  clientId: string;
  agentId: string;
  issuedAt: Date;
}

function getSecret(): Buffer {
  const raw = process.env.CHAT_TOKEN_SECRET;
  if (!raw) throw new Error("CHAT_TOKEN_SECRET is not set");
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

export function signChatToken(clientId: string, agentId: string): string {
  const payload: ChatTokenPayload = { c: clientId, a: agentId, i: Date.now() };
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const mac = crypto.createHmac("sha256", getSecret()).update(payloadBytes).digest();
  return `${b64url(payloadBytes)}.${b64url(mac)}`;
}

export function verifyChatToken(token: string): ChatTokenClaims {
  const [payloadStr, macStr] = token.split(".");
  if (!payloadStr || !macStr) throw new Error("Malformed chat token");

  const payloadBytes = fromB64url(payloadStr);
  const expectedMac = crypto.createHmac("sha256", getSecret()).update(payloadBytes).digest();
  const gotMac = fromB64url(macStr);

  if (expectedMac.length !== gotMac.length || !crypto.timingSafeEqual(expectedMac, gotMac)) {
    throw new Error("Invalid chat token signature");
  }

  let parsed: ChatTokenPayload;
  try {
    parsed = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw new Error("Malformed chat token payload");
  }

  if (typeof parsed.c !== "string" || typeof parsed.a !== "string" || typeof parsed.i !== "number") {
    throw new Error("Invalid chat token claims");
  }

  return { clientId: parsed.c, agentId: parsed.a, issuedAt: new Date(parsed.i) };
}
