// Live end-to-end probe for the mid-run tool connection flow. Unlike
// test-request-tool-connection.ts (which stubs the email), this fires a
// real permission email to the client's inbox via the Resend-backed
// email router, leaves the row in place, and prints the row id so you
// can watch reconciliation when the client clicks.
//
// Prereqs: .env set with ANTHROPIC_API_KEY, COMPOSIO_API_KEY, RESEND_API_KEY,
// DATABASE_URL (URL-encoded password), DIRECT_URL, ORACLE_URL, EMAIL_DOMAIN.
//
// Usage:
//   npx tsx scripts/test-tool-connection-live.ts
//
// Defaults: Atlas + Kyle's client, app=hubspot. Override via env.

import prisma from "../shared/db.js";
import { requestToolConnection } from "../shared/platform-tools/request-tool-connection.js";
import { sendAgentEmail } from "../oracle/lib/emailRouter.js";

const AGENT_ID = process.env.AGENT_ID ?? "cmnkvvtsf0002lz6xkloh21y0"; // Atlas
const CLIENT_ID = process.env.CLIENT_ID ?? "cmnkvvtjs0000lz6xvup4t4bm";
const APP = process.env.TEST_APP ?? "hubspot";

async function main(): Promise<void> {
  for (const k of ["COMPOSIO_API_KEY", "RESEND_API_KEY", "DATABASE_URL"]) {
    if (!process.env[k]) throw new Error(`${k} is required`);
  }

  const agent = await prisma.agent.findUnique({
    where: { id: AGENT_ID },
    select: {
      id: true, name: true, clientId: true,
      client: {
        select: { email: true, businessName: true, contactName: true, preferredName: true },
      },
    },
  });
  if (!agent) throw new Error(`Agent ${AGENT_ID} not found`);
  if (agent.clientId !== CLIENT_ID) throw new Error("Agent client mismatch");

  console.log(`\n=== LIVE E2E TEST ===`);
  console.log(`Agent:   ${agent.name} (${agent.id})`);
  console.log(`Client:  ${agent.client?.businessName} <${agent.client?.email}>`);
  console.log(`App:     ${APP}`);
  console.log();

  // Clear any prior open row so we get a fresh end-to-end signal
  const cleared = await prisma.toolConnectionRequest.deleteMany({
    where: { clientId: CLIENT_ID, appName: APP.toLowerCase() },
  });
  if (cleared.count > 0) console.log(`Cleared ${cleared.count} prior row(s) for ${APP}\n`);

  const clientName =
    agent.client?.preferredName ?? agent.client?.contactName ?? agent.client?.businessName ?? "there";
  const clientBusinessName = agent.client?.businessName ?? "your business";

  console.log(`Calling handler with REAL email dispatch...`);
  const result = await requestToolConnection({
    agentId: AGENT_ID,
    clientId: CLIENT_ID,
    appName: APP,
    reason: `connect your ${APP} account so I can manage records on your behalf (live E2E test)`,
    sendPermissionEmail: async ({ to, summary, appName, ctaUrl, approveActionId, reason: why }) => {
      await sendAgentEmail({
        trigger: "permission",
        to,
        agentName: agent.name,
        agentId: agent.id,
        clientName,
        clientId: CLIENT_ID,
        productName: clientBusinessName,
        summary,
        permissions: [
          {
            toolName: appName,
            accessLevel: "OAuth",
            description: `Access to your ${appName} account to ${why}.`,
          },
        ],
        intentSteps: [{ step: why }],
        approveActionId,
        ctaUrl,
      });
    },
  });

  console.log();
  console.log(`status:  ${result.status}`);
  console.log(`message: ${result.message}`);

  if (result.status !== "emailed") {
    console.log("\nNot 'emailed' — nothing to click. Exiting.");
    await prisma.$disconnect();
    return;
  }

  const row = await prisma.toolConnectionRequest.findUnique({
    where: { id: result.requestId! },
    select: {
      id: true, appName: true, status: true,
      composioConnectionId: true, redirectUrl: true, emailSentAt: true,
    },
  });

  console.log(`\n=== ROW CREATED ===`);
  console.log(`requestId:    ${row!.id}`);
  console.log(`connectionId: ${row!.composioConnectionId}`);
  console.log(`redirectUrl:  ${row!.redirectUrl}`);
  console.log(`emailSentAt:  ${row!.emailSentAt?.toISOString()}`);
  console.log();
  console.log(`Next steps:`);
  console.log(`  1. Check ${agent.client?.email} for the permission email.`);
  console.log(`  2. Click "Grant Access" — OR paste the redirectUrl above into a browser.`);
  console.log(`  3. Complete the ${APP} OAuth handshake.`);
  console.log(`  4. Composio redirects to /composio/callback, which should mark this row "connected".`);
  console.log(`  5. Verify with:`);
  console.log(`       npx tsx -e "import('./shared/db.js').then(async m => {`);
  console.log(`         const r = await m.default.toolConnectionRequest.findUnique({ where: { id: '${row!.id}' } });`);
  console.log(`         console.log(r); await m.default.\$disconnect(); })"`);
  console.log();
  console.log(`To clean up without OAuthing:`);
  console.log(`  npx tsx -e "import('./shared/db.js').then(async m => { await m.default.toolConnectionRequest.delete({ where: { id: '${row!.id}' } }); await m.default.\$disconnect(); })"`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
