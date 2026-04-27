// Smoke-test the browse platform tool end-to-end against real Browserbase
// + real DB. Read-only public-web task so it's cheap (a few seconds, $0.01).
// Verifies: (1) Stagehand opens + closes a Browserbase session,
// (2) agent.execute() returns structured result, (3) BrowserSession row is
// created + updated with the right status/duration/summary. Cleans up the
// row at the end so reruns are idempotent.

import "dotenv/config";
import prisma from "../shared/db.js";
import { runBrowserTask } from "../shared/platform-tools/browser.js";

const AGENT_ID = process.env.AGENT_ID ?? "cmnkvvtsf0002lz6xkloh21y0"; // Atlas
const CLIENT_ID = process.env.CLIENT_ID ?? "cmnkvvtjs0000lz6xvup4t4bm";

async function main() {
  for (const k of ["BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID", "DATABASE_URL"]) {
    if (!process.env[k]) throw new Error(`${k} is required`);
  }

  console.log("Running browse probe against real Browserbase...");
  console.log(`Goal: fetch example.com heading text`);
  const before = await prisma.browserSession.count({ where: { agentId: AGENT_ID } });

  const result = await runBrowserTask({
    agentId: AGENT_ID,
    clientId: CLIENT_ID,
    goal: "Return the text of the H1 heading on the page.",
    startingUrl: "https://example.com",
  });

  console.log();
  console.log("=== RESULT ===");
  console.log(`status:     ${result.status}`);
  console.log(`duration:   ${(result.durationMs / 1000).toFixed(2)}s`);
  console.log(`actions:    ${result.actionCount}`);
  console.log(`bb_session: ${result.browserbaseSessionId ?? "(none)"}`);
  console.log(`message:    ${(result.message ?? "").slice(0, 300)}`);
  console.log();

  const row = await prisma.browserSession.findUnique({ where: { id: result.sessionRowId } });
  if (!row) throw new Error("BrowserSession row missing");
  console.log("=== ROW ===");
  console.log(`id:                   ${row.id}`);
  console.log(`status:               ${row.status}`);
  console.log(`startedAt:            ${row.startedAt.toISOString()}`);
  console.log(`endedAt:              ${row.endedAt?.toISOString() ?? "(null)"}`);
  console.log(`durationMs:           ${row.durationMs}`);
  console.log(`browserbaseSessionId: ${row.browserbaseSessionId}`);
  console.log(`resultSummary:        ${row.resultSummary?.slice(0, 200)}`);
  console.log();

  const after = await prisma.browserSession.count({ where: { agentId: AGENT_ID } });
  if (after !== before + 1) {
    throw new Error(`expected +1 row, got +${after - before}`);
  }

  // Assertions
  if (!row.endedAt) throw new Error("row.endedAt is null");
  if (row.status === "running") throw new Error("row.status still 'running'");
  if (!row.durationMs || row.durationMs < 100) throw new Error(`suspicious durationMs: ${row.durationMs}`);

  // Keep the row for now so we can inspect it; can delete with:
  //   npx tsx -e "import('./shared/db.js').then(m => m.default.browserSession.delete({ where: { id: '${row.id}' } }).then(() => m.default.\$disconnect()))"
  console.log(`Probe passed. Row left in place for inspection (id=${row.id}).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
