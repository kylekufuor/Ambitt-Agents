// Live probe for shared/secrets/onepassword.ts against real 1Password.
// Hits real DB + real 1Password service account. Tests:
//   1. Happy path: ref matches client's pinned vault → returns secret value
//   2. Vault mismatch: ref targets different vault → throws, no SDK call
//   3. No vault pinned: client.onepasswordVaultId null → throws cleanly
//   4. Value NEVER appears in logs (the only acceptable mention is in the
//      probe's own assertion print at the end)
// Safe to re-run; doesn't mutate vault or client.

import "dotenv/config";
import prisma from "../shared/db.js";
import { resolveSecret, resolveSecrets, parseSecretReference } from "../shared/secrets/onepassword.js";

// NOTE: 1Password op:// refs use vault NAME, not the URL-style UUID. We
// read the name from the same env var for now since this is a single-tenant
// probe; long-term Client.onepasswordVaultId holds the name.
const CLIENT_ID = process.env.CLIENT_ID ?? "cmnkvvtjs0000lz6xvup4t4bm"; // Kyle
const VAULT_NAME = process.env.ONEPASSWORD_VAULT_NAME ?? "Ambitt-Kyle";
const EXPECTED_VALUE = "hello-from-1password";

async function main() {
  for (const k of ["OP_SERVICE_ACCOUNT_TOKEN", "DATABASE_URL"]) {
    if (!process.env[k]) throw new Error(`${k} is required`);
  }

  const client = await prisma.client.findUnique({
    where: { id: CLIENT_ID },
    select: { email: true, businessName: true, onepasswordVaultId: true },
  });
  if (!client) throw new Error(`Client ${CLIENT_ID} not found`);
  console.log(`Client: ${client.businessName} <${client.email}>`);
  console.log(`Pinned vault: ${client.onepasswordVaultId ?? "(none)"}`);
  if (client.onepasswordVaultId !== VAULT_NAME) {
    throw new Error(`Client vault mismatch — expected ${VAULT_NAME}, got ${client.onepasswordVaultId}`);
  }
  console.log();

  // --- Test parser
  console.log("Test 0: parser shape");
  const parsed = parseSecretReference(`op://${VAULT_NAME}/AmbittTest/value`);
  if (parsed.vault !== VAULT_NAME) throw new Error(`vault parse mismatch: ${parsed.vault}`);
  if (parsed.item !== "AmbittTest") throw new Error(`item parse mismatch: ${parsed.item}`);
  if (parsed.field !== "value") throw new Error(`field parse mismatch: ${parsed.field}`);
  console.log("ok    parser returns correct vault/item/field");
  console.log();

  // --- Test 1: happy path
  console.log("Test 1: resolveSecret happy path");
  const ref = `op://${VAULT_NAME}/AmbittTest/value`;
  const value = await resolveSecret(CLIENT_ID, ref);
  if (value !== EXPECTED_VALUE) {
    throw new Error(`Got "${value.slice(0, 20)}…", expected "${EXPECTED_VALUE}"`);
  }
  console.log(`ok    resolveSecret returned expected value (length=${value.length})`);
  console.log();

  // --- Test 2: vault mismatch
  console.log("Test 2: vault mismatch is rejected before SDK call");
  const badRef = `op://wrong-vault-uuid/AmbittTest/value`;
  let threw = false;
  try {
    await resolveSecret(CLIENT_ID, badRef);
  } catch (err) {
    threw = true;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("Vault mismatch")) {
      throw new Error(`Expected 'Vault mismatch' error, got: ${msg}`);
    }
    console.log(`ok    rejected with: ${msg.slice(0, 80)}…`);
  }
  if (!threw) throw new Error("Expected vault mismatch to throw");
  console.log();

  // --- Test 3: no-vault-pinned rejection (temp clear, then restore)
  console.log("Test 3: client with no vault is rejected");
  await prisma.client.update({ where: { id: CLIENT_ID }, data: { onepasswordVaultId: null } });
  try {
    let threw3 = false;
    try {
      await resolveSecret(CLIENT_ID, ref);
    } catch (err) {
      threw3 = true;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("no 1Password vault provisioned")) {
        throw new Error(`Expected 'no vault provisioned', got: ${msg}`);
      }
      console.log(`ok    rejected with: ${msg.slice(0, 80)}…`);
    }
    if (!threw3) throw new Error("Expected null-vault to throw");
  } finally {
    // Restore vault binding
    await prisma.client.update({ where: { id: CLIENT_ID }, data: { onepasswordVaultId: VAULT_NAME } });
  }
  console.log();

  // --- Test 4: batch resolve
  console.log("Test 4: resolveSecrets batch with 1 ref");
  const batch = await resolveSecrets(CLIENT_ID, [ref]);
  if (batch.length !== 1 || batch[0] !== EXPECTED_VALUE) {
    throw new Error(`batch result wrong: ${JSON.stringify(batch.map((b) => b.slice(0, 8)))}`);
  }
  console.log(`ok    batch returned 1 value`);
  console.log();

  console.log("All probes passed.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  // Always restore vault in case test 3 left it cleared
  try {
    await prisma.client.update({
      where: { id: CLIENT_ID },
      data: { onepasswordVaultId: VAULT_NAME },
    });
  } catch {}
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
