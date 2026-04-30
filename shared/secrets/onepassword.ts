import { createClient, type Client, Secrets } from "@1password/sdk";
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
