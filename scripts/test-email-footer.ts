// Verify emailRouter-style chat link injection without actually sending mail.
// Replicates the exact substitution in oracle/lib/emailRouter.ts against a
// real rendered template. Safe to delete after verification.

import { buildAgentResponseEmail } from "../oracle/templates/agent-response.js";
import { signChatToken, verifyChatToken } from "../shared/chat-token.js";

async function main(): Promise<void> {
  const agentId = "test_agent_abc";
  const clientId = "test_client_xyz";
  const agentName = "Test Agent";

  const html = buildAgentResponseEmail({
    agentName,
    agentId,
    agentRole: "Research analyst",
    clientBusinessName: "Acme",
    responseBody: "This is a probe.",
    toolsUsed: [],
  });

  const bareUrl = `https://chat.ambitt.agency/${agentId}`;
  if (!html.includes(bareUrl)) {
    throw new Error(`Bare chat URL ${bareUrl} not found in rendered email`);
  }
  console.log(`ok   rendered email contains bare chat URL`);

  const token = signChatToken(clientId, agentId);
  const injected = html.split(bareUrl).join(`${bareUrl}?t=${token}`);

  const tokenHref = `${bareUrl}?t=${token}`;
  if (!injected.includes(tokenHref)) {
    throw new Error("Injected URL not in final HTML");
  }
  console.log(`ok   injected URL present`);

  // Make sure we injected ALL occurrences (defensive — there is usually exactly
  // one in the footer, but the .split().join() pattern must handle duplicates
  // gracefully).
  const bareCount = injected.split(bareUrl).length - 1;
  // After injection, any occurrence should be followed by "?t=". Count the raw
  // bare URL *not* followed by a token query.
  const withoutToken = (injected.match(new RegExp(`${bareUrl.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?!\\?t=)`, "g")) ?? []).length;
  if (withoutToken !== 0) {
    throw new Error(`Found ${withoutToken} bare chat URLs still missing ?t= after injection`);
  }
  console.log(`ok   all ${bareCount} occurrence(s) carry the token`);

  // Extract the token back out and verify it
  const m = injected.match(new RegExp(`${bareUrl.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\?t=([^"&]+)`));
  if (!m) throw new Error("Could not extract token from injected HTML");
  const extracted = m[1];
  const claims = verifyChatToken(extracted);
  if (claims.clientId !== clientId || claims.agentId !== agentId) {
    throw new Error("Round-tripped token has wrong claims");
  }
  console.log(`ok   extracted token verifies back to (${claims.clientId}, ${claims.agentId})`);

  console.log("\nAll email injection checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });
