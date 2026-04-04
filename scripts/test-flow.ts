import "dotenv/config";
import { processInboundMessage } from "../shared/runtime/index.js";
import { sendEmail } from "../shared/email.js";
import { buildAgentResponseEmail } from "../oracle/templates/agent-response.js";
import prisma from "../shared/db.js";

// ---------------------------------------------------------------------------
// End-to-end flow test
// ---------------------------------------------------------------------------
// Simulates: client emails agent a task → agent runtime processes → email sent
//
// Usage:
//   npx tsx scripts/test-flow.ts <agentId> "<message>"
//   npx tsx scripts/test-flow.ts                          # interactive — picks first active agent
// ---------------------------------------------------------------------------

async function main() {
  const agentId = process.argv[2];
  const message = process.argv[3];

  if (!agentId || !message) {
    console.log("Usage: npx tsx scripts/test-flow.ts <agentId> \"<message>\"");
    console.log("\nAvailable active agents:");
    const agents = await prisma.agent.findMany({
      where: { status: "active" },
      include: { client: { select: { businessName: true } } },
      select: { id: true, name: true, email: true, agentType: true, tools: true, client: { select: { businessName: true } } },
    });
    for (const a of agents) {
      console.log(`  ${a.id}  ${a.name} (${a.agentType}) — ${a.client.businessName} — tools: [${a.tools.join(", ")}]`);
    }
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log("=== Ambitt Agents — Full Flow Test ===\n");

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { client: { select: { email: true, businessName: true } } },
  });

  if (!agent) {
    console.error(`Agent ${agentId} not found`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Agent: ${agent.name} (${agent.email})`);
  console.log(`Client: ${agent.client.businessName} (${agent.client.email})`);
  console.log(`MCP Tools: ${agent.tools.length > 0 ? agent.tools.join(", ") : "(none)"}`);
  console.log(`\nTask: "${message}"\n`);
  console.log("Running agent runtime...\n");

  const startTime = Date.now();

  const result = await processInboundMessage({
    agentId,
    userMessage: message,
    channel: "email",
    threadId: `test-flow-${Date.now()}`,
    senderEmail: agent.client.email,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n=== Runtime Complete (${elapsed}s) ===\n`);
  console.log(`Response (${result.response.length} chars):`);
  console.log("---");
  console.log(result.response.slice(0, 800));
  if (result.response.length > 800) console.log("...(truncated)");
  console.log("---\n");

  console.log(`Tools used: ${result.toolsUsed.length}`);
  for (const t of result.toolsUsed) {
    console.log(`  ${t.success ? "✓" : "✗"} ${t.serverId}/${t.toolName}`);
  }

  console.log(`\nAttachments: ${result.attachments.length}`);
  for (const a of result.attachments) {
    console.log(`  ${a.filename} (${(a.content.length / 1024).toFixed(1)}KB)`);
  }

  console.log(`\nTokens: ${result.totalInputTokens} in / ${result.totalOutputTokens} out`);
  console.log(`Loops: ${result.loopCount}`);

  // Send the email
  console.log(`\nSending email to ${agent.client.email}...`);

  const html = buildAgentResponseEmail({
    agentName: agent.name,
    agentRole: agent.purpose,
    clientBusinessName: agent.client.businessName,
    responseBody: result.response,
    toolsUsed: result.toolsUsed,
  });

  await sendEmail({
    agentId,
    agentName: agent.name,
    to: agent.client.email,
    subject: `${agent.name} — ${agent.client.businessName}`,
    html,
    replyToAgentId: agentId,
    attachments: result.attachments.length > 0 ? result.attachments : undefined,
  });

  console.log("Done — email sent.\n");

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Test failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
