/**
 * Manually enqueue a LocalTask for a client's paired device (the Ambitt Agents
 * Chrome extension). Useful for testing the extension pipe before Phase 2 wires
 * the agent's `browse` tool to this queue, and as a manual dispatch tool.
 *
 * Usage:
 *   set -a && source .env && set +a
 *   npx tsx scripts/enqueue-local-task.ts <agentId> [startingUrl] [goal]
 *
 * Defaults: startingUrl=https://example.com, goal="Capture what you see."
 */
import prisma from "../shared/db.js";
import { enqueueLocalTask, getOnlineDevice } from "../shared/local-tasks.js";

async function main() {
  const [agentId, startingUrl, ...goalParts] = process.argv.slice(2);
  if (!agentId) {
    console.error("Usage: tsx scripts/enqueue-local-task.ts <agentId> [startingUrl] [goal]");
    process.exit(1);
  }
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { clientId: true, name: true },
  });
  if (!agent) {
    console.error(`Agent not found: ${agentId}`);
    process.exit(1);
  }

  const online = await getOnlineDevice(agent.clientId);
  console.log(online ? `Device online: ${online.label ?? online.id}` : "No device online right now (task will wait in the queue).");

  const goal = goalParts.join(" ") || "Open the page and report what you see.";
  const url = startingUrl || "https://example.com";
  const task = await enqueueLocalTask({
    clientId: agent.clientId,
    agentId,
    goal,
    startingUrl: url,
    allowPromptText: `${agent.name} wants to open ${url} in your browser and ${goal.toLowerCase()}`,
  });
  console.log(`Enqueued LocalTask ${task.id} (status ${task.status}) → ${url}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
