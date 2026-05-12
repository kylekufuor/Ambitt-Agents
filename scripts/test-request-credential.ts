// End-to-end probe for the request_credential platform tool. Uses a stub
// sendActionRequiredEmail callback (no real email sent) but hits real
// 1Password to create + then delete the item. Verifies:
//   1. fresh call → status="emailed", isPause=true, recommendation row written
//   2. immediate retry → status="already_exists" (idempotency)
//   3. recommendation row carries the right metadata
//   4. cleanup leaves no orphan items in the vault

import "dotenv/config";
import prisma from "../shared/db.js";
import { requestCredential } from "../shared/platform-tools/request-credential.js";
import { deleteItem, findItemByTitle } from "../shared/secrets/onepassword.js";

const AGENT_ID = process.env.AGENT_ID ?? "cmnkvvtsf0002lz6xkloh21y0"; // Atlas
const CLIENT_ID = process.env.CLIENT_ID ?? "cmnkvvtjs0000lz6xvup4t4bm"; // Kyle
const TITLE = `ProbeCredential-${Date.now()}`;

interface CallCapture {
  called: boolean;
  args?: {
    itemTitle: string;
    fieldTitles: string[];
    openUrl: string;
    approveActionId: string;
  };
}

function makeStubEmail(): { stub: Parameters<typeof requestCredential>[0]["sendActionRequiredEmail"]; capture: CallCapture } {
  const capture: CallCapture = { called: false };
  const stub: Parameters<typeof requestCredential>[0]["sendActionRequiredEmail"] = async (args) => {
    capture.called = true;
    capture.args = {
      itemTitle: args.itemTitle,
      fieldTitles: args.fieldTitles,
      openUrl: args.openUrl,
      approveActionId: args.approveActionId,
    };
  };
  return { stub, capture };
}

async function main() {
  for (const k of [
    "OP_SERVICE_ACCOUNT_TOKEN",
    "ONEPASSWORD_ACCOUNT_DOMAIN",
    "DATABASE_URL",
  ]) {
    if (!process.env[k]) throw new Error(`${k} is required`);
  }

  console.log(`Item title under test: ${TITLE}`);
  console.log();

  // --- Test 1: fresh call
  console.log("Test 1: fresh request_credential → emailed + isPause=true");
  const stub1 = makeStubEmail();
  const r1 = await requestCredential({
    agentId: AGENT_ID,
    clientId: CLIENT_ID,
    itemTitle: TITLE,
    fields: [
      { title: "username", fieldType: "Text" },
      { title: "password", fieldType: "Concealed" },
    ],
    reason: "probe-test: verifying the request_credential flow end-to-end",
    sendActionRequiredEmail: stub1.stub,
  });

  if (r1.status !== "emailed") throw new Error(`expected status=emailed, got ${r1.status}: ${r1.message}`);
  if (!r1.isPause) throw new Error("expected isPause=true");
  if (!r1.itemId) throw new Error("missing itemId");
  if (!r1.openUrl?.startsWith("https://kufgroup.1password.com/vaults/")) {
    throw new Error(`URL doesn't look right: ${r1.openUrl}`);
  }
  if (!stub1.capture.called) throw new Error("email stub not called");
  if (stub1.capture.args!.itemTitle !== TITLE) throw new Error("title mismatch in email");
  if (stub1.capture.args!.fieldTitles.length !== 2) throw new Error("field count mismatch in email");
  if (stub1.capture.args!.openUrl !== r1.openUrl) throw new Error("url mismatch between result + email");
  console.log(`ok    item created (${r1.itemId.slice(0, 12)}…), email stub called with matching args`);
  console.log();

  // --- Test 2: recommendation row metadata
  console.log("Test 2: Recommendation row carries the right shape");
  const rec = await prisma.recommendation.findUnique({
    where: { id: stub1.capture.args!.approveActionId },
  });
  if (!rec) throw new Error("recommendation row missing");
  if (rec.emailType !== "credential-request") throw new Error(`emailType: ${rec.emailType}`);
  if (rec.status !== "pending") throw new Error(`status: ${rec.status}`);
  if (rec.approveActionId !== rec.id) throw new Error(`approveActionId mismatch`);
  if (!rec.title.includes(TITLE)) throw new Error(`title doesn't mention ${TITLE}: ${rec.title}`);
  console.log(`ok    recommendation row id=${rec.id.slice(0, 12)}…, emailType=credential-request`);
  console.log();

  // --- Test 3: idempotency
  console.log("Test 3: immediate retry → status=already_exists, no new email, same itemId");
  const stub3 = makeStubEmail();
  const r3 = await requestCredential({
    agentId: AGENT_ID,
    clientId: CLIENT_ID,
    itemTitle: TITLE, // same title
    fields: [
      { title: "username", fieldType: "Text" },
      { title: "password", fieldType: "Concealed" },
    ],
    reason: "probe-test: retry should hit the idempotency branch",
    sendActionRequiredEmail: stub3.stub,
  });
  if (r3.status !== "already_exists") throw new Error(`expected already_exists, got ${r3.status}`);
  if (!r3.isPause) throw new Error("expected isPause=true on already_exists");
  if (r3.itemId !== r1.itemId) throw new Error(`item id changed: ${r1.itemId} → ${r3.itemId}`);
  // NOTE: the email IS still re-sent on already_exists so the client gets a reminder. That's intentional.
  if (!stub3.capture.called) throw new Error("expected reminder email on already_exists");
  console.log(`ok    same itemId, reminder email sent`);
  console.log();

  // --- Cleanup
  console.log("Cleanup: delete the test item + recommendation rows");
  await deleteItem(CLIENT_ID, r1.itemId);
  const orphan = await findItemByTitle(CLIENT_ID, TITLE);
  if (orphan) throw new Error("item not deleted from vault");
  await prisma.recommendation.deleteMany({
    where: { id: { in: [rec.id, r3.itemId === r1.itemId ? rec.id : "_"] } },
  });
  console.log("ok    cleaned up");
  console.log();

  console.log("All request_credential probes passed.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
