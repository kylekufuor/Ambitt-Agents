// End-to-end chat probe — signs a real token with Oracle's secret, hits the
// live Oracle, verifies DB side-effects. Safe to delete after verification.
//
// Usage:
//   CHAT_TOKEN_SECRET=<oracle secret> ORACLE=<oracle url> AGENT_ID=<id> \
//     npx tsx scripts/test-chat-e2e.ts
//
// Defaults: Atlas agent on prod Oracle.

import { signChatToken } from "../shared/chat-token.js";
import prisma from "../shared/db.js";

const ORACLE = process.env.ORACLE ?? "https://oracle-production-c0ff.up.railway.app";
const AGENT_ID = process.env.AGENT_ID ?? "cmnkvvtsf0002lz6xkloh21y0"; // Atlas

async function main(): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: AGENT_ID },
    select: { id: true, name: true, status: true, clientId: true },
  });
  if (!agent) throw new Error(`Agent ${AGENT_ID} not found`);
  console.log(`Agent: ${agent.name} (${agent.status}) clientId=${agent.clientId}`);

  // 0. ToolRequest table must exist
  const toolReqCount = await prisma.toolRequest.count();
  console.log(`ok   ToolRequest table queryable (${toolReqCount} rows)`);

  // 1. Missing token → 401 on history
  const r401 = await fetch(`${ORACLE}/chat/${AGENT_ID}/history`);
  if (r401.status !== 401) throw new Error(`expected 401, got ${r401.status}`);
  console.log(`ok   GET /history with no token → 401`);

  // 2. Bad token → 401
  const rBad = await fetch(`${ORACLE}/chat/${AGENT_ID}/history?t=not.a.token`);
  if (rBad.status !== 401) throw new Error(`expected 401, got ${rBad.status}`);
  console.log(`ok   GET /history with bad token → 401`);

  // 3. Token bound to wrong agent → 403
  const wrongAgentToken = signChatToken(agent.clientId, "agent_does_not_exist_xyz");
  const rWrong = await fetch(`${ORACLE}/chat/${AGENT_ID}/history?t=${wrongAgentToken}`);
  if (rWrong.status !== 403) throw new Error(`expected 403 for mismatched agent, got ${rWrong.status}`);
  console.log(`ok   GET /history with agent-mismatched token → 403`);

  // 4. Token bound to wrong client → 403/404 (404 because agent-then-client check)
  const wrongClientToken = signChatToken("client_nope", AGENT_ID);
  const rWrongC = await fetch(`${ORACLE}/chat/${AGENT_ID}/history?t=${wrongClientToken}`);
  if (rWrongC.status !== 404 && rWrongC.status !== 403) {
    throw new Error(`expected 403 or 404 for client mismatch, got ${rWrongC.status}`);
  }
  console.log(`ok   GET /history with client-mismatched token → ${rWrongC.status}`);

  // 5. Valid token → 200 + shape
  const goodToken = signChatToken(agent.clientId, AGENT_ID);
  const rGood = await fetch(`${ORACLE}/chat/${AGENT_ID}/history?t=${goodToken}`);
  if (!rGood.ok) throw new Error(`valid history fetch failed: ${rGood.status} ${await rGood.text()}`);
  const history = await rGood.json() as {
    agentId: string; agentName: string; agentStatus: string;
    threadId: string; messages: Array<{ id: string; role: string; content: string; channel: string; createdAt: string }>;
  };
  if (history.agentId !== AGENT_ID) throw new Error("history.agentId mismatch");
  if (history.threadId !== `thread-${AGENT_ID}-${agent.clientId}`) {
    throw new Error(`unexpected threadId: ${history.threadId}`);
  }
  console.log(`ok   GET /history valid → 200, ${history.messages.length} msgs, thread=${history.threadId}`);

  // 6. Snapshot message count before we post
  const threadId = history.threadId;
  const before = await prisma.conversationMessage.count({ where: { threadId } });

  // Skip the paid inference + DB-write portion unless POST_MESSAGE=1 is set.
  if (process.env.POST_MESSAGE !== "1") {
    console.log("skip POST /messages (set POST_MESSAGE=1 to run the billable inference probe)");
    await prisma.$disconnect();
    console.log("\nAll non-billable checks passed.");
    return;
  }

  // 7. POST /messages with no token → 401
  const rPostNoToken = await fetch(`${ORACLE}/chat/${AGENT_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  });
  if (rPostNoToken.status !== 401) throw new Error(`POST no token expected 401, got ${rPostNoToken.status}`);
  console.log(`ok   POST /messages with no token → 401`);

  // 8. POST /messages with empty body → 400
  const rPostEmpty = await fetch(`${ORACLE}/chat/${AGENT_ID}/messages?t=${goodToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "   " }),
  });
  if (rPostEmpty.status !== 400) throw new Error(`POST empty expected 400, got ${rPostEmpty.status}`);
  console.log(`ok   POST /messages with empty message → 400`);

  // 9. POST /messages valid → 200 + agent response
  const probe = `automated chat probe ${new Date().toISOString()} — reply briefly with "pong"`;
  console.log(`    POST /messages: "${probe}"`);
  const rPost = await fetch(`${ORACLE}/chat/${AGENT_ID}/messages?t=${goodToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: probe }),
  });
  if (!rPost.ok) throw new Error(`POST /messages failed: ${rPost.status} ${await rPost.text()}`);
  const postBody = await rPost.json() as { response: string; threadId: string };
  if (!postBody.response || postBody.response.length === 0) throw new Error("empty agent response");
  if (postBody.threadId !== threadId) throw new Error("threadId changed");
  console.log(`ok   POST /messages valid → 200`);
  console.log(`     agent reply (first 200 chars): ${postBody.response.slice(0, 200).replace(/\n/g, " ")}${postBody.response.length > 200 ? "…" : ""}`);

  // 10. DB: both client + agent rows appended with channel="chat"
  const after = await prisma.conversationMessage.count({ where: { threadId } });
  if (after < before + 2) throw new Error(`expected +2 messages, got +${after - before}`);
  console.log(`ok   ConversationMessage rows grew from ${before} → ${after}`);

  const latest = await prisma.conversationMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { role: true, channel: true, content: true },
  });
  console.log(`     latest 2 rows:`);
  for (const m of latest.reverse()) {
    console.log(`     - ${m.role} [${m.channel}]: ${m.content.slice(0, 120).replace(/\n/g, " ")}`);
  }

  const chatRows = latest.filter((m) => m.channel === "chat");
  if (chatRows.length !== 2) throw new Error(`expected 2 chat rows, got ${chatRows.length}`);
  console.log(`ok   both new rows have channel="chat"`);

  await prisma.$disconnect();
  console.log("\nAll end-to-end checks passed.");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
