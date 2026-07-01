import prisma from "../db.js";
import { encrypt, decrypt } from "../encryption.js";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// DB-backed custom-tool credentials
// ---------------------------------------------------------------------------
// The 1Password resolver (resolveSecret) needs a per-client vault, which the
// service account can't provision (and Casey has none). For non-Composio tools
// (CoStar, Crexi, The Analyst Pro) the client enters a username/password on the
// portal; we store the field values encrypted (AES-256-GCM) on the Credential
// row and the agent's browser tool resolves them at execution time — Claude
// never sees the plaintext, exactly like the op:// flow.
// ---------------------------------------------------------------------------

/** Save (upsert) a custom-tool's credential field values, encrypted. */
export async function saveCustomCredentials(
  clientId: string,
  toolName: string,
  fields: Record<string, string>
): Promise<void> {
  const secretsEncrypted = encrypt(JSON.stringify(fields));
  await prisma.credential.upsert({
    where: { clientId_toolName: { clientId, toolName } },
    create: { clientId, toolName, secretsEncrypted, status: "active" },
    update: { secretsEncrypted, status: "active" },
  });
  logger.info("Custom credentials saved", { clientId, toolName, fields: Object.keys(fields) });
}

/** Decrypt a client's stored field values for one custom tool. Null if none. */
export async function resolveCustomCredentials(
  clientId: string,
  toolName: string
): Promise<Record<string, string> | null> {
  const row = await prisma.credential.findUnique({
    where: { clientId_toolName: { clientId, toolName } },
    select: { secretsEncrypted: true },
  });
  if (!row?.secretsEncrypted) return null;
  try {
    const fields = JSON.parse(decrypt(row.secretsEncrypted)) as Record<string, string>;
    await prisma.credential
      .update({ where: { clientId_toolName: { clientId, toolName } }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return fields;
  } catch (error) {
    logger.warn("resolveCustomCredentials decrypt failed", {
      clientId,
      toolName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Tools (for this client) that have stored credentials, keyed by tool name,
 * with the outcome of the agent's last login — powers the Tools page status.
 */
export async function listCustomCredentialTools(
  clientId: string
): Promise<Map<string, { lastUseStatus: string | null; lastUseError: string | null }>> {
  const rows = await prisma.credential.findMany({
    where: { clientId, secretsEncrypted: { not: null } },
    select: { toolName: true, lastUseStatus: true, lastUseError: true },
  });
  const map = new Map<string, { lastUseStatus: string | null; lastUseError: string | null }>();
  for (const r of rows) map.set(r.toolName, { lastUseStatus: r.lastUseStatus, lastUseError: r.lastUseError });
  return map;
}

/** Remove a client's stored credentials for a custom tool (portal delete). */
export async function deleteCustomCredentials(clientId: string, toolName: string): Promise<void> {
  await prisma.credential.deleteMany({ where: { clientId, toolName } });
  logger.info("Custom credentials deleted", { clientId, toolName });
}

/**
 * Resolve `{{cred:ToolName/field}}` placeholders in a browser-task goal to the
 * client's stored values. Mirrors the op:// substitution so the agent can log
 * into custom sites without the plaintext ever entering Claude's context.
 * Returns the substituted string + the tool names whose creds were used (so the
 * caller can record whether the login then succeeded or failed).
 */
export async function substituteCustomCredentials(
  clientId: string,
  goal: string
): Promise<{ text: string; toolsUsed: string[] }> {
  const refs = [...goal.matchAll(/\{\{\s*cred:([^/}]+)\/([^}]+?)\s*\}\}/g)];
  if (refs.length === 0) return { text: goal, toolsUsed: [] };
  const cache = new Map<string, Record<string, string> | null>();
  const used = new Set<string>();
  let out = goal;
  for (const m of refs) {
    const toolName = m[1].trim();
    const field = m[2].trim();
    if (!cache.has(toolName)) cache.set(toolName, await resolveCustomCredentials(clientId, toolName));
    const fields = cache.get(toolName);
    const value = fields?.[field] ?? fields?.[field.toLowerCase()];
    if (value != null) {
      out = out.split(m[0]).join(value);
      used.add(toolName);
    }
  }
  return { text: out, toolsUsed: [...used] };
}

/**
 * Record the outcome of a browser login that used a tool's stored credentials,
 * so the Tools page can flag "last sign-in failed — check your login".
 */
export async function recordCredentialUse(
  clientId: string,
  toolName: string,
  ok: boolean,
  error?: string
): Promise<void> {
  await prisma.credential
    .updateMany({
      where: { clientId, toolName },
      data: {
        lastUsedAt: new Date(),
        lastUseStatus: ok ? "ok" : "failed",
        lastUseError: ok ? null : (error ?? "Sign-in did not complete").slice(0, 500),
      },
    })
    .catch(() => {});
}
