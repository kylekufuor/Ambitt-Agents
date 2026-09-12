import { createHmac, timingSafeEqual } from "node:crypto";

// Server-to-server only. Domain-separated from the email chat links, expires
// after one minute, and is bound to the exact HTTP request and tenant.
function secret() {
  const key = process.env.CHAT_TOKEN_SECRET;
  if (!key) throw new Error("Workspace authentication is unavailable");
  return key;
}
export function signWorkspaceRequest(
  clientId: string,
  agentId: string,
  method: string,
  path: string,
  body: string,
) {
  const payload = Buffer.from(
    JSON.stringify({
      clientId,
      agentId,
      method,
      path,
      exp: Date.now() + 60_000,
    }),
  ).toString("base64url");
  const mac = createHmac("sha256", secret())
    .update(`workspace-v1:${payload}:${body}`)
    .digest("base64url");
  return `${payload}.${mac}`;
}
export function verifyWorkspaceRequest(
  token: string,
  method: string,
  path: string,
  body: string,
): { clientId: string; agentId: string } {
  const parts = token.split(".");
  if (parts.length !== 2 || token.length > 2000)
    throw new Error("Unauthorized");
  const [payload, signature] = parts;
  const mac = createHmac("sha256", secret())
    .update(`workspace-v1:${payload}:${body}`)
    .digest();
  const got = Buffer.from(signature, "base64url");
  if (mac.length !== got.length || !timingSafeEqual(mac, got))
    throw new Error("Unauthorized");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (
    claims.method !== method ||
    claims.path !== path ||
    !Number.isFinite(claims.exp) ||
    claims.exp < Date.now() ||
    claims.exp > Date.now() + 65_000 ||
    typeof claims.clientId !== "string" ||
    typeof claims.agentId !== "string"
  )
    throw new Error("Unauthorized");
  return { clientId: claims.clientId, agentId: claims.agentId };
}
