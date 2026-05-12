// Live end-to-end probe for request_credential. Unlike
// test-request-credential.ts (stubbed email), this fires a real
// action-required email via Resend so Kyle can experience the full UX:
//
//   1. Agent creates an empty "LinkedIn" item in the Ambitt-Kyle vault
//      with username + password fields.
//   2. Real email lands in Kyle's inbox with the 1Password item URL.
//   3. Kyle clicks the link → 1Password opens → fills in values → saves.
//   4. Verify by calling resolveSecret on op://Ambitt-Kyle/LinkedIn/username
//      to confirm the value was provisioned.
//
// Safe to re-run — idempotent on the 1Password side (existing item is
// reused). Each run still fires a fresh email (it's a reminder).

import "dotenv/config";
import prisma from "../shared/db.js";
import { requestCredential } from "../shared/platform-tools/request-credential.js";
import { sendAgentEmail } from "../oracle/lib/emailRouter.js";

const AGENT_ID = process.env.AGENT_ID ?? "cmnkvvtsf0002lz6xkloh21y0"; // Atlas
const CLIENT_ID = process.env.CLIENT_ID ?? "cmnkvvtjs0000lz6xvup4t4bm";

async function main() {
  const agent = await prisma.agent.findUnique({
    where: { id: AGENT_ID },
    select: {
      name: true, clientId: true,
      client: { select: { email: true, businessName: true, contactName: true, preferredName: true } },
    },
  });
  if (!agent) throw new Error(`Agent ${AGENT_ID} not found`);
  // TO_EMAIL override — keeps Client.email untouched (still mcquizzyapp@…
  // for the underlying McQuizzy client record) but routes THIS test email
  // to a different inbox.
  const recipient = process.env.TO_EMAIL ?? agent.client?.email;
  if (!recipient) throw new Error("No recipient — set TO_EMAIL or Client.email");
  console.log(`Agent:  ${agent.name}`);
  console.log(`Client: ${agent.client?.businessName} <${agent.client?.email}>`);
  console.log(`Email override → ${recipient}`);
  console.log();

  const clientName =
    agent.client?.preferredName ?? agent.client?.contactName?.split(" ")[0] ?? agent.client?.businessName ?? "there";

  console.log("Calling requestCredential with REAL email dispatch...");
  const result = await requestCredential({
    agentId: AGENT_ID,
    clientId: CLIENT_ID,
    itemTitle: "LinkedIn",
    fields: [
      { title: "username", fieldType: "Text" },
      { title: "password", fieldType: "Concealed" },
    ],
    reason:
      "I need your LinkedIn login so I can browse postings and apply for roles on your behalf. Your credentials never pass through me — I read them directly from 1Password only when I'm filling in a form.",
    sendActionRequiredEmail: async ({ itemTitle, fieldTitles, reason: why, openUrl, approveActionId }) => {
      await sendAgentEmail({
        trigger: "credential-request",
        to: recipient,
        agentName: agent.name,
        agentId: AGENT_ID,
        clientName,
        clientId: CLIENT_ID,
        productName: "Ambitt Agents",
        summary: why,
        itemTitle,
        fieldTitles,
        openUrl,
        approveActionId,
      });
    },
  });

  console.log();
  console.log(`status:   ${result.status}`);
  console.log(`itemId:   ${result.itemId}`);
  console.log(`openUrl:  ${result.openUrl}`);
  console.log();
  console.log(`Message returned to (hypothetical) Claude:`);
  console.log(`  ${result.message}`);
  console.log();
  console.log("=== NEXT STEPS FOR YOU (Kyle) ===");
  console.log(`1. Check ${recipient} — you should have a new email titled`);
  console.log(`   "${agent.name} — Action Required"`);
  console.log(`2. Click the primary CTA in the email ("Approve This Action") — it'll`);
  console.log(`   open this 1Password URL: ${result.openUrl}`);
  console.log(`3. In 1Password, fill in the username + password fields and save.`);
  console.log(`4. Once filled in, the agent can resolve op://Ambitt-Kyle/LinkedIn/username`);
  console.log(`   and op://Ambitt-Kyle/LinkedIn/password on any subsequent browse run.`);
  console.log();
  console.log("To verify your values were stored, after filling in 1Password run:");
  console.log(`   npx tsx scripts/_verify-linkedin.ts`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
