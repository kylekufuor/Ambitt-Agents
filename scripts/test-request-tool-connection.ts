// Local verification of shared/platform-tools/request-tool-connection.ts.
// Hits real Composio + real DB, but uses a stubbed sendPermissionEmail so
// nothing actually sends. Cleans up the ToolConnectionRequest rows it
// creates. Safe to re-run; safe to delete after the feature lands.
//
// Usage:
//   COMPOSIO_API_KEY=<key> ORACLE_URL=<url> npx tsx scripts/test-request-tool-connection.ts
//
// Defaults to Atlas / Kyle's client. Override with AGENT_ID + CLIENT_ID.
//
// Branches verified:
//   1. unavailable     — bogus app name, Composio has no auth config
//   2. emailed         — real app, not connected → row + email callback fires
//   3. already_pending — second call within 24h → no new row, no email
//   4. already_connected — (only when the test client already has that app)
// The script picks whichever of (2) vs (4) matches reality and logs it.

import prisma from "../shared/db.js";
import { requestToolConnection } from "../shared/platform-tools/request-tool-connection.js";
import type { RequestToolConnectionResult } from "../shared/platform-tools/request-tool-connection.js";

const AGENT_ID = process.env.AGENT_ID ?? "cmnkvvtsf0002lz6xkloh21y0"; // Atlas
const CLIENT_ID = process.env.CLIENT_ID ?? "cmnkvvtjs0000lz6xvup4t4bm";
const REAL_APP = process.env.TEST_APP ?? "hubspot"; // pick one unlikely to be pre-connected on a test account
const BOGUS_APP = "definitely_not_a_real_composio_app_xyz123";

interface EmailCallCapture {
  called: boolean;
  args?: {
    agentId: string;
    to: string;
    summary: string;
    reason: string;
    appName: string;
    ctaUrl: string;
    approveActionId: string;
  };
}

function makeStubEmail(): { stub: Parameters<typeof requestToolConnection>[0]["sendPermissionEmail"]; capture: EmailCallCapture } {
  const capture: EmailCallCapture = { called: false };
  const stub: Parameters<typeof requestToolConnection>[0]["sendPermissionEmail"] = async (args) => {
    capture.called = true;
    capture.args = { ...args };
  };
  return { stub, capture };
}

async function cleanupRows(clientId: string, apps: string[]): Promise<void> {
  const deleted = await prisma.toolConnectionRequest.deleteMany({
    where: { clientId, appName: { in: apps.map((a) => a.toLowerCase()) } },
  });
  if (deleted.count > 0) {
    console.log(`    cleaned up ${deleted.count} prior ToolConnectionRequest rows`);
  }
}

async function main(): Promise<void> {
  if (!process.env.COMPOSIO_API_KEY) {
    throw new Error("COMPOSIO_API_KEY is required (pull from Railway Oracle service)");
  }

  const agent = await prisma.agent.findUnique({
    where: { id: AGENT_ID },
    select: { id: true, name: true, clientId: true, client: { select: { email: true } } },
  });
  if (!agent) throw new Error(`Agent ${AGENT_ID} not found`);
  if (agent.clientId !== CLIENT_ID) {
    throw new Error(`Agent belongs to clientId ${agent.clientId}, not ${CLIENT_ID}`);
  }
  console.log(`Agent: ${agent.name} (${agent.id}) client=${agent.client?.email}`);
  console.log(`Real app under test: ${REAL_APP}`);
  console.log();

  // Pre-clean so reruns start from a known state
  await cleanupRows(CLIENT_ID, [REAL_APP, BOGUS_APP]);

  // ------------------------------------------------------------------
  // Test 1 — unavailable path: bogus app name → Composio has no auth config
  // ------------------------------------------------------------------
  console.log("Test 1: bogus app → status=unavailable");
  const stub1 = makeStubEmail();
  const r1 = await requestToolConnection({
    agentId: AGENT_ID,
    clientId: CLIENT_ID,
    appName: BOGUS_APP,
    reason: "placeholder reason",
    sendPermissionEmail: stub1.stub,
  });
  if (r1.status !== "unavailable") {
    throw new Error(`expected unavailable, got ${r1.status} — message: ${r1.message}`);
  }
  if (stub1.capture.called) throw new Error("email callback fired on unavailable path");
  const bogusRows = await prisma.toolConnectionRequest.count({
    where: { clientId: CLIENT_ID, appName: BOGUS_APP },
  });
  if (bogusRows !== 0) throw new Error(`expected 0 rows for bogus app, got ${bogusRows}`);
  console.log(`ok   status=unavailable, no email, no row written`);
  console.log(`     message: ${r1.message.slice(0, 140)}...`);
  console.log();

  // ------------------------------------------------------------------
  // Test 2 — real app: either "emailed" (new connection) or "already_connected"
  // ------------------------------------------------------------------
  console.log(`Test 2: real app "${REAL_APP}" → status=emailed OR already_connected`);
  const stub2 = makeStubEmail();
  const r2 = await requestToolConnection({
    agentId: AGENT_ID,
    clientId: CLIENT_ID,
    appName: REAL_APP,
    reason: `run automated verification for the ${REAL_APP} mid-run connection flow`,
    sendPermissionEmail: stub2.stub,
  });

  if (r2.status === "already_connected") {
    if (stub2.capture.called) throw new Error("email sent on already_connected path");
    const rows = await prisma.toolConnectionRequest.count({
      where: { clientId: CLIENT_ID, appName: REAL_APP },
    });
    if (rows !== 0) throw new Error(`expected 0 rows for already_connected, got ${rows}`);
    console.log(`ok   status=already_connected (client already has ${REAL_APP}) — no row, no email`);
    console.log(`     Skipping dedup test since nothing was emailed.`);
    console.log();
    await finalize([BOGUS_APP]);
    return;
  }

  if (r2.status !== "emailed") {
    throw new Error(`expected emailed, got ${r2.status} — message: ${r2.message}`);
  }
  if (!stub2.capture.called) throw new Error("email callback did NOT fire on emailed path");
  if (!stub2.capture.args) throw new Error("capture has no args");
  const a2 = stub2.capture.args;
  if (a2.to !== agent.client?.email) throw new Error(`email sent to ${a2.to}, expected ${agent.client?.email}`);
  if (!a2.ctaUrl || !a2.ctaUrl.startsWith("https://")) {
    throw new Error(`ctaUrl missing or non-https: ${a2.ctaUrl}`);
  }
  if (!a2.approveActionId) throw new Error("missing approveActionId");
  console.log(`ok   status=emailed, email callback fired`);
  console.log(`     to:      ${a2.to}`);
  console.log(`     ctaUrl:  ${a2.ctaUrl.slice(0, 80)}...`);
  console.log(`     summary: ${a2.summary.slice(0, 100)}`);

  const row = await prisma.toolConnectionRequest.findUnique({
    where: { id: r2.requestId! },
    select: {
      id: true, clientId: true, agentId: true, appName: true,
      status: true, emailSentAt: true, composioConnectionId: true, redirectUrl: true,
    },
  });
  if (!row) throw new Error(`ToolConnectionRequest ${r2.requestId} not found in DB`);
  if (row.status !== "emailed") throw new Error(`expected row.status=emailed, got ${row.status}`);
  if (!row.emailSentAt) throw new Error("row.emailSentAt not set");
  if (!row.composioConnectionId) throw new Error("row.composioConnectionId not set");
  if (!row.redirectUrl) throw new Error("row.redirectUrl not set");
  console.log(`ok   DB row persisted: status=emailed, connectionId=${row.composioConnectionId.slice(0, 16)}..., emailSentAt set`);
  console.log();

  // ------------------------------------------------------------------
  // Test 3 — dedup: same (clientId, appName) again → already_pending, no email, no new row
  // ------------------------------------------------------------------
  console.log(`Test 3: immediate rerun → status=already_pending`);
  const stub3 = makeStubEmail();
  const r3 = await requestToolConnection({
    agentId: AGENT_ID,
    clientId: CLIENT_ID,
    appName: REAL_APP,
    reason: "second attempt — should be deduped",
    sendPermissionEmail: stub3.stub,
  });
  if (r3.status !== "already_pending") {
    throw new Error(`expected already_pending, got ${r3.status} — message: ${r3.message}`);
  }
  if (stub3.capture.called) throw new Error("email callback fired on already_pending path");
  if (r3.requestId !== r2.requestId) {
    throw new Error(`expected existing row id ${r2.requestId}, got ${r3.requestId}`);
  }
  const rowCount = await prisma.toolConnectionRequest.count({
    where: { clientId: CLIENT_ID, appName: REAL_APP.toLowerCase() },
  });
  if (rowCount !== 1) throw new Error(`expected exactly 1 row after dedup, got ${rowCount}`);
  console.log(`ok   status=already_pending, same row id, no email, no new row`);
  console.log();

  await finalize([REAL_APP, BOGUS_APP]);
}

async function finalize(appsToClean: string[]): Promise<void> {
  await cleanupRows(CLIENT_ID, appsToClean);
  await prisma.$disconnect();
  console.log("All handler checks passed.");
}

main().catch(async (err) => {
  console.error(err);
  await cleanupRows(CLIENT_ID, [REAL_APP, BOGUS_APP]).catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
