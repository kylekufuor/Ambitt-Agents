// Verify the write helpers in shared/secrets/onepassword.ts against the
// real 1Password vault. Creates a temporary item, asserts the URL shape +
// idempotency, then deletes it. Safe to re-run.
//
// Pre-reqs: OP_SERVICE_ACCOUNT_TOKEN, ONEPASSWORD_ACCOUNT_DOMAIN,
// Client.onepasswordVaultId set to a vault the service account can WRITE.

import "dotenv/config";
import prisma from "../shared/db.js";
import {
  findItemByTitle,
  createCredentialItem,
  deleteItem,
} from "../shared/secrets/onepassword.js";

const CLIENT_ID = process.env.CLIENT_ID ?? "cmnkvvtjs0000lz6xvup4t4bm";
const TEST_TITLE = `ProbeTest-${Date.now()}`;

async function main() {
  for (const k of [
    "OP_SERVICE_ACCOUNT_TOKEN",
    "ONEPASSWORD_ACCOUNT_DOMAIN",
    "DATABASE_URL",
  ]) {
    if (!process.env[k]) throw new Error(`${k} is required`);
  }

  console.log(`Probe item title: ${TEST_TITLE}`);
  console.log();

  // --- Test 1: findItemByTitle returns null for missing item
  console.log("Test 1: findItemByTitle returns null for non-existent item");
  const missing = await findItemByTitle(CLIENT_ID, TEST_TITLE);
  if (missing !== null) throw new Error(`expected null, got item id=${missing.id}`);
  console.log("ok    null for missing item");
  console.log();

  // --- Test 2: createCredentialItem creates with empty values
  console.log("Test 2: createCredentialItem creates empty item with URL");
  const created = await createCredentialItem(CLIENT_ID, TEST_TITLE, [
    { title: "username", fieldType: "Text" },
    { title: "password", fieldType: "Concealed" },
  ]);
  if (!created.itemId) throw new Error("missing itemId");
  if (!created.vaultId) throw new Error("missing vaultId");
  if (!created.openUrl.startsWith("https://kufgroup.1password.com/vaults/")) {
    throw new Error(`URL doesn't look right: ${created.openUrl}`);
  }
  console.log(`ok    item id: ${created.itemId}`);
  console.log(`ok    url:    ${created.openUrl}`);
  console.log();

  // --- Test 3: findItemByTitle now finds it
  console.log("Test 3: findItemByTitle finds the just-created item");
  const found = await findItemByTitle(CLIENT_ID, TEST_TITLE);
  if (!found) throw new Error("just-created item not found by title");
  if (found.id !== created.itemId) {
    throw new Error(`id mismatch: created=${created.itemId} found=${found.id}`);
  }
  if (found.title !== TEST_TITLE) throw new Error(`title mismatch: ${found.title}`);
  if (found.fields.length !== 2) {
    throw new Error(`expected 2 fields, got ${found.fields.length}`);
  }
  // Values should be empty — client fills via 1Password UI
  for (const f of found.fields) {
    if (f.value !== "") {
      throw new Error(`expected empty field "${f.title}", got "${f.value}"`);
    }
  }
  console.log(`ok    found by title, 2 fields, both empty as expected`);
  console.log();

  // --- Test 4: cleanup
  console.log("Test 4: deleteItem cleans up");
  await deleteItem(CLIENT_ID, created.itemId);
  const afterDelete = await findItemByTitle(CLIENT_ID, TEST_TITLE);
  if (afterDelete !== null) {
    throw new Error(`item still found after delete: ${afterDelete.id}`);
  }
  console.log(`ok    item deleted, no longer findable`);
  console.log();

  console.log("All write-helper probes passed.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
