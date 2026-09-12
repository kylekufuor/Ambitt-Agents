import assert from "node:assert/strict";
import prisma from "../../shared/db.js";
import { closeBrowser } from "../../shared/workspace/browser.js";
async function main() {
  assert(new URL(process.env.DATABASE_URL!).searchParams.get("schema")?.startsWith("workspace_qa_"));
  const sessions = await prisma.workspaceSession.findMany({ where: { clientId: "workspace-qa-client", status: { in: ["starting", "running"] } }, select: { id: true } });
  for (const s of sessions) await closeBrowser(s.id);
  console.log(`Closed ${sessions.length} owned QA sessions.`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
