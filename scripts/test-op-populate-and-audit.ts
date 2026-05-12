// Probe for step 2: audit-on-read + populateItem write helper.
// Creates a temp 1P item, asserts:
//   1. resolveSecret on the empty field throws or returns "" (depending on
//      1P behavior on empty Concealed fields)
//   2. populateItem with new values updates the item, returns updatedFields
//   3. resolveSecret on a populated field returns the new value
//   4. CredentialAccess audit row was written for each resolveSecret call
//      (agentId optional; metadata-only; no value)
//   5. Cleanup deletes the test item AND the audit rows so reruns are clean.

import "dotenv/config";
import prisma from "../shared/db.js";
import {
  createCredentialItem,
  populateItem,
  resolveSecret,
  deleteItem,
} from "../shared/secrets/onepassword.js";

const CLIENT_ID = process.env.CLIENT_ID ?? "cmnkvvtjs0000lz6xvup4t4bm";
const AGENT_ID = process.env.AGENT_ID ?? "cmnkvvtsf0002lz6xkloh21y0";
const TITLE = `AuditProbe-${Date.now()}`;
const VAULT_NAME = process.env.ONEPASSWORD_VAULT_NAME ?? "Ambitt-Kyle";
const TEST_VALUE = "audit-probe-value-1234";

async function main() {
  console.log(`Probe item title: ${TITLE}`);
  console.log();

  // Snapshot count before
  const before = await prisma.credentialAccess.count({ where: { clientId: CLIENT_ID, itemTitle: TITLE } });

  // --- Create empty item
  console.log("Setup: create empty 1P item");
  const created = await createCredentialItem(CLIENT_ID, TITLE, [
    { title: "username", fieldType: "Text" },
    { title: "password", fieldType: "Concealed" },
  ]);
  console.log(`ok    item ${created.itemId.slice(0, 12)}… created`);
  console.log();

  // --- Populate via the new helper
  console.log("Test 1: populateItem updates the empty fields");
  const populated = await populateItem(CLIENT_ID, created.itemId, {
    username: "audit-probe-user",
    password: TEST_VALUE,
  });
  if (populated.updatedFields.length !== 2) {
    throw new Error(`expected 2 updated fields, got ${populated.updatedFields.length}`);
  }
  if (!populated.updatedFields.includes("username") || !populated.updatedFields.includes("password")) {
    throw new Error(`unexpected updated fields: ${JSON.stringify(populated.updatedFields)}`);
  }
  if (populated.itemTitle !== TITLE) throw new Error("title mismatch");
  console.log(`ok    populated 2 fields: ${populated.updatedFields.join(", ")}`);
  console.log();

  // --- Resolve the new value
  console.log("Test 2: resolveSecret returns the just-populated value");
  const ref = `op://${VAULT_NAME}/${TITLE}/password`;
  const value = await resolveSecret(CLIENT_ID, ref, AGENT_ID);
  if (value !== TEST_VALUE) {
    throw new Error(`got "${value.slice(0, 12)}…", expected "${TEST_VALUE}"`);
  }
  console.log(`ok    resolveSecret returned the populated value (length=${value.length})`);
  console.log();

  // --- Audit row was written
  console.log("Test 3: CredentialAccess audit row was written for the resolveSecret call");
  const audits = await prisma.credentialAccess.findMany({
    where: { clientId: CLIENT_ID, itemTitle: TITLE },
    orderBy: { accessedAt: "desc" },
  });
  if (audits.length !== before + 1) {
    throw new Error(`expected exactly +1 audit row, got +${audits.length - before}`);
  }
  const row = audits[0];
  if (row.agentId !== AGENT_ID) throw new Error(`audit row agentId mismatch: ${row.agentId}`);
  if (row.vaultName !== VAULT_NAME) throw new Error(`audit row vaultName mismatch: ${row.vaultName}`);
  if (row.itemTitle !== TITLE) throw new Error(`audit row itemTitle mismatch: ${row.itemTitle}`);
  if (row.field !== "password") throw new Error(`audit row field mismatch: ${row.field}`);
  if (Math.abs(Date.now() - row.accessedAt.getTime()) > 60_000) {
    throw new Error("audit row accessedAt is more than 60s off");
  }
  console.log(`ok    audit row written: agentId=${row.agentId?.slice(0, 12)}…, field=${row.field}`);
  console.log();

  // --- Cleanup
  console.log("Cleanup: delete the test item + audit rows");
  await deleteItem(CLIENT_ID, created.itemId);
  await prisma.credentialAccess.deleteMany({
    where: { clientId: CLIENT_ID, itemTitle: TITLE },
  });
  console.log("ok    cleaned up");
  console.log();

  console.log("All step-2 probes passed.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
