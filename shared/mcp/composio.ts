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
 */
export async function initiateOAuthConnection(
  clientId: string,
  appName: string,
  redirectUrl?: string
): Promise<{ redirectUrl: string; connectionId: string }> {
  const client = getClient();
  const authConfig = await getAuthConfigId(appName);
  if (!authConfig) throw new Error(`No auth config for ${appName}. Set one up in Composio → Auth Configs.`);

  const callbackUrl = redirectUrl ?? `${process.env.ORACLE_URL ?? "http://localhost:3000"}/composio/callback`;

  const conn = await client.connectedAccounts.initiate(
    clientId,
    authConfig.id,
    { callbackUrl }
  );

  logger.info("OAuth connection initiated", { clientId, appName, connectionId: conn.id });

  return {
    redirectUrl: conn.redirectUrl ?? "",
    connectionId: conn.id ?? "",
  };
}

/**
 * Connect with API key directly (no redirect needed).
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
  };

  const fields = fieldMap[appName] ?? { api_key: apiKey };

  const conn = await client.connectedAccounts.initiate(
    clientId,
    authConfig.id,
    { config: AuthScheme.APIKey(fields) }
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

/**
 * Get all connected accounts for a client.
 */
export async function getConnectedAccounts(clientId: string): Promise<
  Array<{ id: string; appName: string; status: string }>
> {
  const client = getClient();
  const response = await client.connectedAccounts.list({ user_id: clientId } as any);
  const items = (response as any).items ?? response ?? [];

  return items.map((conn: any) => ({
    id: conn.id ?? "",
    appName: conn.appName ?? conn.app_name ?? "",
    status: conn.status ?? "ACTIVE",
  }));
}

/**
 * Check if a client has an active connection for a specific app.
 */
export async function isAppConnected(clientId: string, appName: string): Promise<boolean> {
  const connections = await getConnectedAccounts(clientId);
  return connections.some(
    (c) => c.appName.toLowerCase() === appName.toLowerCase() && c.status === "ACTIVE"
  );
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

  const params = appName ? `?apps=${appName}` : "";
  const res = await fetch(`https://backend.composio.dev/api/v2/actions${params}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const actions = Array.isArray(data) ? data : (data.items ?? []);

  return actions.map((action: any) => ({
    name: action.name ?? "",
    description: action.description ?? "",
    appName: action.appName ?? appName ?? "",
  }));
}

/**
 * Execute a tool action via Composio on behalf of a client.
 */
export async function executeTool(
  clientId: string,
  actionName: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; data: unknown; error?: string }> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set");

  try {
    const res = await fetch("https://backend.composio.dev/api/v2/actions/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        actionName,
        input: params,
        entityId: clientId,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      return { success: false, data: null, error: data.error?.message ?? JSON.stringify(data.error) };
    }

    logger.info("Composio tool executed", { clientId, actionName, success: true });
    return { success: true, data };
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
 * List all available apps in Composio's catalog.
 */
export async function listApps(): Promise<
  Array<{ name: string; key: string; description: string; categories: string[] }>
> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set");

  const res = await fetch("https://backend.composio.dev/api/v1/apps", {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`Composio apps API failed (${res.status})`);
  }
  const data = await res.json();
  const apps = Array.isArray(data) ? data : (data.items ?? []);

  return apps.map((app: any) => ({
    name: app.displayName ?? app.name ?? "",
    key: app.key ?? app.appId ?? "",
    description: app.description ?? "",
    categories: app.categories ?? [],
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
