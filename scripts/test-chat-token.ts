// Manual token primitive test — not wired into any test runner.
// Run with: npx tsx scripts/test-chat-token.ts
// Safe to delete after verification.

process.env.CHAT_TOKEN_SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // hex, 32 bytes

import { signChatToken, verifyChatToken } from "../shared/chat-token.js";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok   ${msg}`);
}

function assertThrows(fn: () => unknown, msg: string): void {
  try {
    fn();
  } catch {
    console.log(`ok   ${msg}`);
    return;
  }
  console.error(`FAIL: ${msg} (did not throw)`);
  process.exit(1);
}

// 1. Round-trip returns same claims
const t = signChatToken("client_abc", "agent_xyz");
const claims = verifyChatToken(t);
assert(claims.clientId === "client_abc", "clientId survives round-trip");
assert(claims.agentId === "agent_xyz", "agentId survives round-trip");
assert(claims.issuedAt instanceof Date, "issuedAt is Date");
assert(Date.now() - claims.issuedAt.getTime() < 5000, "issuedAt is fresh");

// 2. Format shape — two base64url segments joined by "."
const parts = t.split(".");
assert(parts.length === 2, "token has exactly two parts");
assert(/^[A-Za-z0-9_-]+$/.test(parts[0]), "payload is base64url");
assert(/^[A-Za-z0-9_-]+$/.test(parts[1]), "mac is base64url");

// 3. Tampered payload → throws
const [payload, mac] = parts;
const tampered = payload.slice(0, -2) + (payload.endsWith("A") ? "BB" : "AA") + "." + mac;
assertThrows(() => verifyChatToken(tampered), "tampered payload rejected");

// 4. Tampered MAC → throws
const tamperedMac = payload + "." + mac.slice(0, -2) + (mac.endsWith("A") ? "BB" : "AA");
assertThrows(() => verifyChatToken(tamperedMac), "tampered mac rejected");

// 5. Missing separator → throws
assertThrows(() => verifyChatToken("nopeatall"), "malformed (no dot) rejected");
assertThrows(() => verifyChatToken(""), "empty string rejected");

// 6. Wrong secret → throws
const original = process.env.CHAT_TOKEN_SECRET;
process.env.CHAT_TOKEN_SECRET = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
assertThrows(() => verifyChatToken(t), "token signed with different secret rejected");
process.env.CHAT_TOKEN_SECRET = original;

async function main(): Promise<void> {
  // 7. Distinct tokens across calls (issuedAt differs)
  const t1 = signChatToken("c", "a");
  await new Promise((r) => setTimeout(r, 5));
  const t2 = signChatToken("c", "a");
  assert(t1 !== t2, "successive tokens differ (issuedAt advances)");

  // 8. utf-8 secret path (non-hex)
  process.env.CHAT_TOKEN_SECRET = "not-hex-just-a-passphrase";
  const tUtf = signChatToken("c2", "a2");
  const utfClaims = verifyChatToken(tUtf);
  assert(utfClaims.clientId === "c2" && utfClaims.agentId === "a2", "utf-8 secret path works");

  console.log("\nAll token primitive checks passed.");
}

main();
