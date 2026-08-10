import prisma from "../db.js";
import { encrypt, decrypt } from "../encryption.js";
import logger from "../logger.js";
import { redactSecrets } from "./redact.js";

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
 *
 * The error text is model-authored and is redacted before it is stored. This
 * is not belt-and-braces: on 2026-07-10 an agent explained a failed CoStar
 * sign-in by narrating what it had typed, and a client's password sat readable
 * in this column for a month — in the same row whose encrypted secret was
 * working perfectly. Redaction lives HERE rather than at the call sites so a
 * future caller cannot forget it, and it runs against the client's own stored
 * values, which catches the secret whatever sentence it was wrapped in.
 */
export async function recordCredentialUse(
  clientId: string,
  toolName: string,
  ok: boolean,
  error?: string
): Promise<void> {
  let safeError: string | null = null;
  if (!ok) {
    const raw = error ?? "Sign-in did not complete";
    // Only on the failure path, and only to redact — the decrypt never leaves
    // this function and the plaintext is never logged.
    let known: string[] = [];
    try {
      const fields = await resolveCustomCredentials(clientId, toolName);
      known = fields ? Object.values(fields).filter((v): v is string => typeof v === "string") : [];
    } catch {
      // No stored values to compare against; the labelled-shape pass still runs.
    }
    safeError = redactSecrets(raw, known).slice(0, 500);
  }

  await prisma.credential
    .updateMany({
      where: { clientId, toolName },
      data: {
        lastUsedAt: new Date(),
        lastUseStatus: ok ? "ok" : "failed",
        lastUseError: safeError,
      },
    })
    .catch(() => {});

  // Close the 2FA loop. If we texted this client for a code, they are sitting
  // there not knowing whether it worked; this is the only place that knows the
  // login finished, and it is already called on both the browser-tool and
  // worker paths. Fire-and-forget and non-throwing: a courtesy text must never
  // fail a sign-in that actually succeeded. Dynamic import keeps the secrets
  // module free of a static dependency on the relay.
  void import("../mfa-relay.js")
    .then(({ notifySignedIn, clearSignInConfirmation }) => {
      if (ok) return notifySignedIn({ clientId, service: toolName });
      // Failed login: drop the debt rather than leave it to fire against some
      // later, unrelated success. The failure is reported on the Tools page.
      clearSignInConfirmation(clientId);
      return undefined;
    })
    .catch(() => {});
}
