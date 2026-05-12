import { createClient, type Client, Secrets, ItemCategory, ItemFieldType, type Item, type ItemField } from "@1password/sdk";
import prisma from "../db.js";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// 1Password resolver — multi-tenant credential fetch with vault gating
// ---------------------------------------------------------------------------
// Single Ambitt-owned service account (env: OP_SERVICE_ACCOUNT_TOKEN) has
// READ access to each client's vault. Each Client.onepasswordVaultId pins
// that client to one vault. The resolver validates that any op:// ref
// targets the client's pinned vault before calling 1Password — so a buggy
// agent or a client-supplied secret ref can't read another tenant's secrets.
//
// IMPORTANT — field naming gotcha (verified 2026-05-12):
// Despite the column being named `onepasswordVaultId`, the value stored
// MUST be the vault's NAME (e.g. "Ambitt-Kyle"), not its URL-style UUID.
// The 1Password SDK's secrets.resolve() expects vault names in op:// refs
// and rejects the 26-char base32 UUID with "no vault matched the secret
// reference query". When the platform graduates to multi-tenant, generate
// distinct vault names per client (e.g. "Ambitt-<clientId-prefix>") so the
// gating constraint stays meaningful.
//
// Secret values returned by resolve() are NEVER logged. Callers that pass
// values into Claude prompts will leak them; consume them in the secret
// injection layer (Phase C) where they go straight into Playwright field
// fills, never through the LLM.
// ---------------------------------------------------------------------------

let _client: Client | null = null;

async function getOnePasswordClient(): Promise<Client> {
  if (_client) return _client;
  const token = process.env.OP_SERVICE_ACCOUNT_TOKEN;
  if (!token) {
    throw new Error(
      "OP_SERVICE_ACCOUNT_TOKEN is not set. Provision a 1Password service account scoped to client vaults and add the token to env."
    );
  }
  _client = await createClient({
    auth: token,
    integrationName: "Ambitt Agents",
    integrationVersion: "v1.0.0",
  });
  return _client;
}

interface ParsedSecretReference {
  vault: string;
  item: string;
  section?: string;
  field: string;
}

/**
 * Parse `op://<vault>/<item>[/<section>]/<field>`. Throws on malformed input.
 * Use this before any vault-gating check.
 */
export function parseSecretReference(ref: string): ParsedSecretReference {
  // Defer syntax validation to the SDK — they own the canonical grammar.
  Secrets.validateSecretReference(ref);
  const trimmed = ref.replace(/^op:\/\//, "");
  const parts = trimmed.split("/");
  if (parts.length === 3) {
    return { vault: parts[0], item: parts[1], field: parts[2] };
  }
  if (parts.length === 4) {
    return { vault: parts[0], item: parts[1], section: parts[2], field: parts[3] };
  }
  throw new Error(`Unexpected secret reference shape: ${ref}`);
}

/**
 * Resolve a single secret reference for a specific client. Validates the
 * ref's vault matches the client's pinned vault.
 *
 * @throws if the client has no vault provisioned, the ref targets a
 * different vault, or 1Password rejects the call.
 */
export async function resolveSecret(clientId: string, ref: string): Promise<string> {
  const parsed = parseSecretReference(ref);

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { onepasswordVaultId: true },
  });
  if (!client) throw new Error(`Client not found: ${clientId}`);
  if (!client.onepasswordVaultId) {
    throw new Error(
      `Client ${clientId} has no 1Password vault provisioned. Set Client.onepasswordVaultId via the dashboard before issuing browser tasks that need credentials.`
    );
  }

  if (parsed.vault !== client.onepasswordVaultId) {
    logger.warn("Cross-tenant secret access blocked", {
      clientId,
      requestedVault: parsed.vault,
      pinnedVault: client.onepasswordVaultId,
      itemHint: parsed.item,
    });
    throw new Error(
      `Vault mismatch: ref targets vault "${parsed.vault}" but client is pinned to a different vault.`
    );
  }

  const op = await getOnePasswordClient();
  // Do NOT log the resolved value, ever. Even truncated.
  const value = await op.secrets.resolve(ref);
  logger.info("Secret resolved", {
    clientId,
    vault: parsed.vault,
    item: parsed.item,
    field: parsed.field,
    valueLength: value.length,
  });
  return value;
}

/**
 * Resolve many refs at once for a single client. All refs must target the
 * client's pinned vault. Failures on any ref reject the whole batch — we
 * don't want a partial fill leaking some secrets to a flow that expected
 * all of them. Returns an ordered array matching the input refs.
 */
export async function resolveSecrets(clientId: string, refs: string[]): Promise<string[]> {
  if (refs.length === 0) return [];
  // Per-ref vault check before any network call.
  for (const ref of refs) {
    const parsed = parseSecretReference(ref);
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { onepasswordVaultId: true },
    });
    if (!client?.onepasswordVaultId) {
      throw new Error(`Client ${clientId} has no 1Password vault provisioned.`);
    }
    if (parsed.vault !== client.onepasswordVaultId) {
      logger.warn("Cross-tenant secret access blocked (batch)", {
        clientId,
        requestedVault: parsed.vault,
        pinnedVault: client.onepasswordVaultId,
      });
      throw new Error(`Vault mismatch in batch: ref targets "${parsed.vault}".`);
    }
  }

  const op = await getOnePasswordClient();
  // resolveAll returns errors per-ref; reject the whole batch if any fail
  // rather than returning partial results — a flow that needed N secrets
  // shouldn't run with N-1.
  const result = await op.secrets.resolveAll(refs);
  const out: string[] = [];
  for (const ref of refs) {
    const entry = result.individualResponses?.[ref];
    if (!entry) {
      throw new Error(`resolveAll missing response for ${ref}`);
    }
    if (entry.error) {
      throw new Error(`resolveAll failed for ${ref}: ${JSON.stringify(entry.error)}`);
    }
    if (!entry.content) {
      throw new Error(`resolveAll empty content for ${ref}`);
    }
    out.push(entry.content.secret);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Write helpers (used by request_credential platform tool)
// ---------------------------------------------------------------------------

/** Description of a single field to provision on an empty credential item. */
export interface CredentialFieldDef {
  title: string;                 // e.g. "username", "password", "SSN"
  fieldType: "Text" | "Concealed" | "Email" | "Url" | "Phone" | "Totp";
}

/** Resolve a vault name → its UUID via the SDK. Cached per-process. */
const vaultIdCache = new Map<string, string>();
async function getVaultIdByName(vaultName: string): Promise<string> {
  const cached = vaultIdCache.get(vaultName);
  if (cached) return cached;
  const op = await getOnePasswordClient();
  const vaults = await op.vaults.list();
  const match = vaults.find((v) => v.title === vaultName);
  if (!match) {
    throw new Error(
      `1Password vault "${vaultName}" not found. Either the name is wrong or the service account doesn't have access to it.`
    );
  }
  vaultIdCache.set(vaultName, match.id);
  return match.id;
}

/**
 * Look up an item by title within the client's pinned vault. Returns the
 * item if found, null otherwise. Used by request_credential for idempotency
 * — don't create a second "LinkedIn" item if the agent already asked for it
 * and the client hasn't filled it in yet.
 */
export async function findItemByTitle(
  clientId: string,
  itemTitle: string
): Promise<Item | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { onepasswordVaultId: true },
  });
  if (!client?.onepasswordVaultId) {
    throw new Error(`Client ${clientId} has no 1Password vault provisioned.`);
  }
  const vaultId = await getVaultIdByName(client.onepasswordVaultId);
  const op = await getOnePasswordClient();
  // SDK filter only supports ByState (active/archived); list all active and
  // filter by title client-side. Fine for realistic vault sizes (dozens of
  // items per client).
  const overviews = await op.items.list(vaultId, {
    type: "ByState",
    content: { active: true, archived: false },
  });
  const overview = overviews.find((o) => o.title === itemTitle);
  if (!overview) return null;
  return op.items.get(vaultId, overview.id);
}

/**
 * Create an empty credential item in the client's pinned vault with the
 * given title and field definitions. Each field is initialized with an
 * empty string value — the client fills them in via 1Password's UI by
 * clicking the URL returned here.
 *
 * Returns { itemId, openUrl } where openUrl deep-links to the item in
 * 1Password's web UI for the configured account domain. The 1Password
 * desktop/mobile app + browser extension also intercept this URL and
 * open the item in the native app.
 */
export async function createCredentialItem(
  clientId: string,
  itemTitle: string,
  fields: CredentialFieldDef[]
): Promise<{ itemId: string; vaultId: string; openUrl: string }> {
  const dbClient = await prisma.client.findUnique({
    where: { id: clientId },
    select: { onepasswordVaultId: true },
  });
  if (!dbClient?.onepasswordVaultId) {
    throw new Error(`Client ${clientId} has no 1Password vault provisioned.`);
  }
  const vaultId = await getVaultIdByName(dbClient.onepasswordVaultId);
  const op = await getOnePasswordClient();

  const fieldTypeMap: Record<CredentialFieldDef["fieldType"], ItemFieldType> = {
    Text: ItemFieldType.Text,
    Concealed: ItemFieldType.Concealed,
    Email: ItemFieldType.Email,
    Url: ItemFieldType.Url,
    Phone: ItemFieldType.Phone,
    Totp: ItemFieldType.Totp,
  };

  const itemFields: ItemField[] = fields.map((f, i) => ({
    id: `field-${i}-${f.title.toLowerCase().replace(/\s+/g, "-")}`,
    title: f.title,
    fieldType: fieldTypeMap[f.fieldType],
    value: "", // empty — client fills via 1Password UI
  }));

  const created = await op.items.create({
    vaultId,
    title: itemTitle,
    category: ItemCategory.Login,
    fields: itemFields,
  });

  const openUrl = buildItemOpenUrl(vaultId, created.id);

  logger.info("Credential item created", {
    clientId,
    vaultName: dbClient.onepasswordVaultId,
    itemId: created.id,
    title: itemTitle,
    fieldCount: itemFields.length,
  });

  return { itemId: created.id, vaultId, openUrl };
}

/**
 * Construct the 1Password web URL for a specific item. The 1Password
 * desktop app + browser extension intercept these URLs and open the item
 * natively. Falls back to web UI if no client is installed.
 *
 * Requires ONEPASSWORD_ACCOUNT_DOMAIN env var (e.g. "kufgroup.1password.com").
 * For Ambitt's multi-tenant production this stays one value (Ambitt's own
 * Business account hosts all client vaults).
 */
function buildItemOpenUrl(vaultId: string, itemId: string): string {
  const domain = process.env.ONEPASSWORD_ACCOUNT_DOMAIN;
  if (!domain) {
    throw new Error("ONEPASSWORD_ACCOUNT_DOMAIN is not set");
  }
  return `https://${domain}/vaults/${vaultId}/allitems/${itemId}`;
}

/** Test-only: delete an item from a vault by id. Used by probes for cleanup. */
export async function deleteItem(clientId: string, itemId: string): Promise<void> {
  const dbClient = await prisma.client.findUnique({
    where: { id: clientId },
    select: { onepasswordVaultId: true },
  });
  if (!dbClient?.onepasswordVaultId) throw new Error(`Client ${clientId} has no vault`);
  const vaultId = await getVaultIdByName(dbClient.onepasswordVaultId);
  const op = await getOnePasswordClient();
  await op.items.delete(vaultId, itemId);
}
