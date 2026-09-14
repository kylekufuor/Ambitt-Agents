// Canonical source. Mirrored byte-for-byte in client-portal/src/lib/.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const key = process.env.CHAT_TOKEN_SECRET;
  if (!key) throw new Error("Tool connection authentication isn't configured.");
  return key;
}

function signature(payload: string): Buffer {
  // Separate purpose from chat tokens, using the existing shared secret.
  return createHmac("sha256", secret()).update(`tool-connection:v1:${payload}`).digest();
}

export function signToolConnection(clientId: string, agentId: string, body: unknown, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ clientId, agentId, expires: now + 60_000,
    bodyHash: createHash("sha256").update(JSON.stringify(body)).digest("hex") })).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyToolConnection(token: string, agentId: string, body: unknown, now = Date.now()): string {
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra) throw new Error("Unauthorized");
  const expected = signature(payload);
  const actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Unauthorized");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  // The signer sets exactly now + 60 s; allow 5 s of clock skew between the
  // portal and Oracle, as workspace-auth.ts does.
  if (claims.agentId !== agentId || typeof claims.clientId !== "string" || !claims.clientId ||
      typeof claims.expires !== "number" || claims.expires <= now || claims.expires > now + 65_000 || claims.bodyHash !== hash) throw new Error("Unauthorized");
  return claims.clientId;
}
