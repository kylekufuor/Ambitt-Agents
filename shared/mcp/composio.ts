import { Composio, AuthScheme } from "@composio/core";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Composio Integration — v3 API with @composio/core SDK
// ---------------------------------------------------------------------------
// Uses auth_config_id (not integrationId) for proper OAuth routing.
// OAuth tools redirect to the correct provider (not Airtable).
// API key tools connect instantly without redirect.
// ---------------------------------------------------------------------------

let _client: Composio | null = null;

function getClient(): Composio {
  if (!_client) {
    if (!process.env.COMPOSIO_API_KEY) throw new Error("COMPOSIO_API_KEY is not set");
    _client = new Composio();  // Reads COMPOSIO_API_KEY from env
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Auth config helpers
// ---------------------------------------------------------------------------

/** Get the auth config ID for an app. Returns null if no config exists. */
async function getAuthConfigId(appName: string): Promise<{ id: string; authScheme: string } | null> {
  try {
    const client = getClient();
    const configs = await client.authConfigs.list();
    const items = configs.items ?? [];

    // Normalize: remove spaces, hyphens, underscores for comparison
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
    const normalizedAppName = normalize(appName);

    const match = items.find((c: any) => {
      // Exact match on appName/appKey fields
      if (c.appName && normalize(c.appName) === normalizedAppName) return true;
      if (c.appKey && normalize(c.appKey) === normalizedAppName) return true;
      // Fuzzy match on config name (e.g., "google sheets-9zza8o" contains "googlesheets")
      const configName = normalize(c.name ?? "");
      return configName.startsWith(normalizedAppName) || normalizedAppName.startsWith(configName.slice(0, normalizedAppName.length));
    });

    if (!match) return null;
    return { id: match.id, authScheme: match.authScheme ?? "UNKNOWN" };
  } catch (error) {
    logger.warn("Failed to fetch auth config", { appName, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Connection initiation
// ---------------------------------------------------------------------------

/**
 * Initiate an OAuth connection. Returns a redirect URL to the actual provider.
 * If already connected, returns success without creating a new connection.
 */
export async function initiateOAuthConnection(
  clientId: string,
  appName: string,
  redirectUrl?: string,
  force?: boolean
): Promise<{ redirectUrl: string; connectionId: string; alreadyConnected?: boolean }> {
  // Check if already connected — unless force=true ("Add another account", so
  // the client can connect a second inbox even though one is already linked).
  if (!force) {
    const alreadyConnected = await isAppConnected(clientId, appName);
    if (alreadyConnected) {
      logger.info("App already connected", { clientId, appName });
      return { redirectUrl: "", connectionId: "", alreadyConnected: true };
    }
  }

  const client = getClient();
  const authConfig = await getAuthConfigId(appName);
  if (!authConfig) throw new Error(`No auth config for ${appName}. Set one up in Composio → Auth Configs.`);

  const callbackUrl = redirectUrl ?? `${process.env.ORACLE_URL ?? "http://localhost:3000"}/composio/callback`;

  // `initiate()` for Composio-managed OAuth is being retired (returns 400 for
  // all orgs from 2026-07-03); `link()` is the replacement and returns the same
  // { redirectUrl, id } shape.
  const conn = await client.connectedAccounts.link(
    clientId,
    authConfig.id,
    { callbackUrl, allowMultiple: true } as any
  );

  logger.info("OAuth connection initiated", { clientId, appName, connectionId: conn.id });

  return {
    redirectUrl: conn.redirectUrl ?? "",
    connectionId: conn.id ?? "",
  };
}

/**
 * Connect with API key directly (no redirect needed).
 * If already connected, returns success without creating a new connection.
 */
export async function initiateApiKeyConnection(
  clientId: string,
  appName: string,
  apiKey: string,
  extraFields?: Record<string, string>
): Promise<{ connectionId: string; status: string }> {
  const client = getClient();
  const authConfig = await getAuthConfigId(appName);
  if (!authConfig) throw new Error(`No auth config for ${appName}. Set one up in Composio → Auth Configs.`);

  // Build the correct field map per tool — each tool has its own required field names
  const fieldMap: Record<string, Record<string, string>> = {
    posthog: { apiKey: apiKey, subdomain: extraFields?.subdomain ?? "us" },
    supabase: { supabase_personal_token: apiKey, base_url: extraFields?.base_url ?? "https://api.supabase.com" },
    _1password: { api_key: apiKey, full: extraFields?.base_url ?? "https://connect.1password.com" },
    resend: { api_key: apiKey },
  };

  const fields = fieldMap[appName] ?? { api_key: apiKey };

  const conn = await client.connectedAccounts.initiate(
    clientId,
    authConfig.id,
    { config: AuthScheme.APIKey(fields), allowMultiple: true } as any
  );

  logger.info("API key connection created", { clientId, appName, connectionId: conn.id });

  return {
    connectionId: conn.id ?? "",
    status: "ACTIVE",
  };
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

// Composio retired the v1/v2 REST APIs ("This endpoint is no longer available.
// Please upgrade to v3 APIs."). Everything below talks to v3 directly. v3
// scopes connections + execution to `user_id` (formerly `entityId`); we pass
// the client's id as that user_id everywhere, matching the connect flow.
const COMPOSIO_API = "https://backend.composio.dev/api/v3";

function composioKey(): string {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set");
  return apiKey;
}

/** v3 connected accounts for one client (user_id). Empty on any error. */
async function listConnectedAccountsV3(clientId: string): Promise<any[]> {
  try {
    const res = await fetch(
      `${COMPOSIO_API}/connected_accounts?user_ids=${encodeURIComponent(clientId)}`,
      { headers: { "x-api-key": composioKey() } }
    );
    if (!res.ok) {
      logger.warn("Composio v3 connected_accounts failed", { clientId, status: res.status });
      return [];
    }
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch (error) {
    logger.warn("Composio v3 connected_accounts threw", {
      clientId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Get all connected accounts for a client (v3).
 */
export async function getConnectedAccounts(clientId: string): Promise<
  Array<{ id: string; appName: string; status: string }>
> {
  const items = await listConnectedAccountsV3(clientId);
  return items.map((conn: any) => ({
    id: conn.id ?? "",
    appName: conn.toolkit?.slug ?? "",
    status: conn.status ?? "",
  }));
}

/**
 * Check if a client has an ACTIVE connection for a specific app (v3).
 */
export async function isAppConnected(clientId: string, appName: string): Promise<boolean> {
  const items = await listConnectedAccountsV3(clientId);
  const normalize = (s: string) => (s ?? "").toLowerCase().replace(/[\s_-]/g, "");
  return items.some(
    (conn: any) => normalize(conn.toolkit?.slug ?? "") === normalize(appName) && conn.status === "ACTIVE"
  );
}

/**
 * Delete ALL of a client's connections for one app (v3). Used by the portal's
 * disconnect button — reconnecting leaves stale/duplicate connection rows, so
 * "disconnect Gmail" clears every Gmail connection. Returns the count removed.
 */
export async function disconnectApp(clientId: string, appName: string): Promise<number> {
  const items = await listConnectedAccountsV3(clientId);
  const normalize = (s: string) => (s ?? "").toLowerCase().replace(/[\s_-]/g, "");
  const targets = items.filter((c: any) => normalize(c.toolkit?.slug ?? "") === normalize(appName));
  let removed = 0;
  for (const c of targets) {
    try {
      const res = await fetch(`${COMPOSIO_API}/connected_accounts/${c.id}`, {
        method: "DELETE",
        headers: { "x-api-key": composioKey() },
      });
      if (res.ok) removed++;
      else logger.warn("disconnectApp delete non-OK", { id: c.id, status: res.status });
    } catch (error) {
      logger.warn("disconnectApp delete threw", { id: c.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  logger.info("disconnectApp complete", { clientId, appName, removed, found: targets.length });
  return removed;
}

/** Delete ONE connection by id (per-account disconnect for multi-account apps). */
export async function disconnectConnection(connectionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${COMPOSIO_API}/connected_accounts/${connectionId}`, {
      method: "DELETE",
      headers: { "x-api-key": composioKey() },
    });
    return res.ok;
  } catch (error) {
    logger.warn("disconnectConnection threw", { connectionId, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

// Connection-id → account email. Resolving requires a live profile call, so we
// cache it (emails don't change). 1h TTL.
const gmailEmailCache = new Map<string, { email: string; at: number }>();
const GMAIL_EMAIL_TTL = 60 * 60 * 1000;

/** The Gmail address behind a connection (cached). Null if it can't be read. */
export async function resolveGmailConnectionEmail(clientId: string, connectionId: string): Promise<string | null> {
  const cached = gmailEmailCache.get(connectionId);
  if (cached && Date.now() - cached.at < GMAIL_EMAIL_TTL) return cached.email;
  try {
    const res = await fetch(`${COMPOSIO_API}/tools/execute/GMAIL_GET_PROFILE`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": composioKey() },
      body: JSON.stringify({ user_id: clientId, connected_account_id: connectionId, arguments: {} }),
    });
    const data = (await res.json().catch(() => ({}))) as { data?: { response_data?: { emailAddress?: string } } };
    const email = data?.data?.response_data?.emailAddress ?? null;
    if (email) gmailEmailCache.set(connectionId, { email, at: Date.now() });
    return email;
  } catch {
    return null;
  }
}

/**
 * A client's distinct connected Gmail accounts (deduped by email — collapses
 * duplicate connections of the same inbox, keeps genuinely different inboxes).
 */
export async function getGmailAccounts(clientId: string): Promise<Array<{ connectionId: string; email: string }>> {
  const items = await listConnectedAccountsV3(clientId);
  const gmails = items.filter((c: any) => c.toolkit?.slug === "gmail" && c.status === "ACTIVE");
  const byEmail = new Map<string, { connectionId: string; email: string }>();
  await Promise.all(
    gmails.map(async (c: any) => {
      const email = await resolveGmailConnectionEmail(clientId, c.id);
      if (email && !byEmail.has(email.toLowerCase())) byEmail.set(email.toLowerCase(), { connectionId: c.id, email });
    })
  );
  return [...byEmail.values()];
}

/** Connection id for the client's Gmail account matching `fromEmail`, else null. */
export async function resolveGmailAccountId(clientId: string, fromEmail: string): Promise<string | null> {
  const target = fromEmail.trim().toLowerCase();
  const accounts = await getGmailAccounts(clientId);
  return accounts.find((a) => a.email.toLowerCase() === target)?.connectionId ?? null;
}

// ---------------------------------------------------------------------------
// Tool discovery and execution
// ---------------------------------------------------------------------------

/**
 * Get available tools/actions for a specific app.
 */
export async function getTools(
  appName?: string
): Promise<Array<{ name: string; description: string; appName: string }>> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set");

  // v3 tools list. Filter param is `toolkit_slug` (singular); default page is
  // 20 tools so we raise the limit to capture a whole toolkit.
  const params = appName ? `?toolkit_slug=${encodeURIComponent(appName)}&limit=200` : "?limit=200";
  const res = await fetch(`${COMPOSIO_API}/tools${params}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    logger.warn("Composio v3 tools list failed", { appName, status: res.status });
    return [];
  }
  const data = await res.json();
  const actions = Array.isArray(data?.items) ? data.items : [];

  return actions.map((action: any) => ({
    // The executable identifier is the slug (e.g. GMAIL_SEND_EMAIL), not the
    // human name — callers pass this straight to executeTool.
    name: action.slug ?? action.name ?? "",
    description: action.description ?? action.name ?? "",
    appName: action.toolkit?.slug ?? appName ?? "",
  }));
}

/**
 * Execute a tool action via Composio on behalf of a client.
 */
export async function executeTool(
  clientId: string,
  actionName: string,
  params: Record<string, unknown>,
  connectedAccountId?: string
): Promise<{ success: boolean; data: unknown; error?: string }> {
  const run = () =>
    fetch(`${COMPOSIO_API}/tools/execute/${encodeURIComponent(actionName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": composioKey() },
      // v3 scopes execution to user_id (== clientId, matching the connect call).
      // connected_account_id targets a SPECIFIC connection when a client has
      // multiple accounts for one app (e.g. two Gmail inboxes).
      body: JSON.stringify({
        user_id: clientId,
        arguments: params,
        ...(connectedAccountId ? { connected_account_id: connectedAccountId } : {}),
      }),
    });

  // A freshly-connected account can report ACTIVE while Composio's execution
  // gateway is still syncing the token (~30-60s), failing the first call with
  // an "authenticate"/"connection error". Retry once after a short wait.
  const looksLikeAuthGap = (d: any, ok: boolean) =>
    (!ok || d?.successful === false) &&
    /authenticate|connection error|not connected|no connected/i.test(JSON.stringify(d?.error ?? ""));

  try {
    let res = await run();
    let data = await res.json().catch(() => ({}) as any);

    if (looksLikeAuthGap(data, res.ok)) {
      await new Promise((r) => setTimeout(r, 8000));
      res = await run();
      data = await res.json().catch(() => ({}) as any);
    }

    if (!res.ok || data?.successful === false) {
      const err =
        typeof data?.error === "string" ? data.error : JSON.stringify(data?.error ?? `HTTP ${res.status}`);
      return { success: false, data: data?.data ?? null, error: err };
    }

    logger.info("Composio tool executed", { clientId, actionName, success: true });
    // v3 wraps the tool output under `data`; hand callers the useful payload.
    return { success: true, data: data?.data ?? data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Composio tool execution failed", { clientId, actionName, error: message });
    return { success: false, data: null, error: message };
  }
}

// ---------------------------------------------------------------------------
// App catalog
// ---------------------------------------------------------------------------

/**
 * List all available toolkits (formerly "apps") in Composio's catalog.
 *
 * Migrated 2026-05-26 off the deprecated raw HTTP call to
 * `backend.composio.dev/api/v1/apps` (which now returns HTTP 410 Gone)
 * onto the official `@composio/core` SDK's `toolkits.list()`. Composio
 * renamed "apps" → "toolkits" in v3; we preserve the legacy output shape
 * here so callers (Oracle's `/composio/catalog`, the portal proxy) keep
 * working without touching their code:
 *   - new `toolkit.name`            → legacy `name`
 *   - new `toolkit.slug`            → legacy `key`
 *   - new `toolkit.meta.description`→ legacy `description`
 *   - new `toolkit.meta.categories` → legacy `categories` (we collapse
 *     each `{slug, name}` entry to its slug for stability)
 */
export async function listApps(): Promise<
  Array<{ name: string; key: string; description: string; categories: string[]; logo: string | null }>
> {
  const client = getClient();
  // NOTE: Composio overloaded `toolkits.get()` — calling with no args / a
  // query object returns the full list; calling with a slug string returns
  // a single toolkit. There is no `.list()` despite what the docs imply.
  const toolkits = await client.toolkits.get();

  // SDK returns the list directly, but defensively handle an `items` envelope
  // in case a future SDK version wraps it.
  const items: any[] = Array.isArray(toolkits)
    ? toolkits
    : ((toolkits as any)?.items ?? []);

  return items.map((t: any) => ({
    name: t.name ?? "",
    key: t.slug ?? "",
    description: t.meta?.description ?? "",
    categories: Array.isArray(t.meta?.categories)
      ? t.meta.categories.map((c: any) => c.slug ?? c.name ?? "").filter(Boolean)
      : [],
    // Composio serves brand logos at logos.composio.dev/api/<slug>.
    logo: t.meta?.logo ?? (t.slug ? `https://logos.composio.dev/api/${t.slug}` : null),
  }));
}

/**
 * Get the auth scheme for a specific app (from auth configs).
 */
export async function getAuthScheme(appName: string): Promise<string> {
  const config = await getAuthConfigId(appName);
  return config?.authScheme ?? "NONE";
}

// ---------------------------------------------------------------------------
// MCP endpoint helpers (for direct MCP connections)
// ---------------------------------------------------------------------------

export function getMCPEndpoint(clientId: string): string {
  return `https://backend.composio.dev/v3/mcp/default?user_id=${clientId}`;
}

export function getMCPHeaders(): Record<string, string> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set");
  return { "x-api-key": apiKey };
}
