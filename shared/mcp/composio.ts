import { Composio } from "composio-core";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Composio MCP Gateway — 850+ tools through one integration
// ---------------------------------------------------------------------------
// Composio handles OAuth, credential storage, and tool execution for all
// connected apps. Each client gets a unique Composio "entity" (user ID).
// The agent connects to Composio's MCP endpoint and calls tools directly.
//
// Flow:
// 1. Client connects a tool → Composio OAuth popup → credentials stored in Composio
// 2. Agent needs to act → calls Composio execute with client's entity ID
// 3. Composio routes the tool call to the right app with the client's credentials
// ---------------------------------------------------------------------------

let _client: Composio | null = null;

function getClient(): Composio {
  if (!_client) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set");
    _client = new Composio({ apiKey });
  }
  return _client;
}

/**
 * Get or create a Composio entity for a client.
 * Entity ID maps 1:1 with our client ID.
 */
export async function getEntity(clientId: string) {
  const client = getClient();
  return client.getEntity(clientId);
}

/**
 * Initiate an OAuth connection for a client to a specific app.
 * Returns a redirect URL — send the client there to authorize.
 */
export async function initiateConnection(
  clientId: string,
  appName: string,
  redirectUrl?: string
): Promise<{ redirectUrl: string; connectionId: string }> {
  const client = getClient();
  const callbackUrl = redirectUrl ?? `${process.env.ORACLE_URL ?? "http://localhost:3000"}/composio/callback`;

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set");

  // Step 1: Get the integrationId for this app
  const intRes = await fetch(`https://backend.composio.dev/api/v1/integrations?appName=${appName}`, {
    headers: { "x-api-key": apiKey },
  });
  const intData = await intRes.json();
  const integrations = intData.items ?? intData ?? [];
  const integrationId = integrations[0]?.id;

  if (!integrationId) {
    throw new Error(`No auth config found for ${appName}. Set one up in Composio dashboard → Auth Configs.`);
  }

  // Step 2: Initiate connection with integrationId
  const response = await fetch("https://backend.composio.dev/api/v2/connectedAccounts/initiateConnection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      integrationId,
      entityId: clientId,
      redirectUri: callbackUrl,
      data: {},
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? `Composio connection failed: ${response.status}`);
  }

  const authRedirectUrl = data.connectionResponse?.redirectUrl ?? "";
  const connId = data.connectionResponse?.connectedAccountId ?? "";

  logger.info("Composio connection initiated", { clientId, appName, integrationId, connectionId: connId });

  return { redirectUrl: authRedirectUrl, connectionId: connId };
}

/**
 * Get all connected accounts for a client.
 */
export async function getConnectedAccounts(clientId: string): Promise<
  Array<{ id: string; appName: string; status: string }>
> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set");

  const res = await fetch(`https://backend.composio.dev/api/v1/connectedAccounts?user_uuid=${clientId}`, {
    headers: { "x-api-key": apiKey },
  });
  const data = await res.json();
  const connections = data.items ?? data ?? [];

  return connections.map((conn: any) => ({
    id: conn.id ?? conn.connectedAccountId ?? "",
    appName: conn.appName ?? conn.app_name ?? "",
    status: conn.status ?? "active",
  }));
}

/**
 * Get available tools/actions for a specific app.
 */
export async function getTools(
  appName?: string
): Promise<Array<{ name: string; description: string; appName: string }>> {
  const client = getClient();

  const params: any = {};
  if (appName) params.apps = appName;

  const response = await client.actions.list(params);
  const actions = (response as any).items ?? response ?? [];

  return actions.map((action: any) => ({
    name: action.name ?? "",
    description: action.description ?? "",
    appName: action.appName ?? action.app_name ?? appName ?? "",
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
  const client = getClient();

  try {
    const result = await client.actions.execute({
      actionName,
      requestBody: params,
      entityId: clientId,
    } as any);

    logger.info("Composio tool executed", { clientId, actionName, success: true });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Composio tool execution failed", { clientId, actionName, error: message });

    return {
      success: false,
      data: null,
      error: message,
    };
  }
}

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
  const data = await res.json();
  const apps = data.items ?? data ?? [];

  return apps.map((app: any) => ({
    name: app.displayName ?? app.name ?? "",
    key: app.key ?? app.appId ?? "",
    description: app.description ?? "",
    categories: app.categories ?? [],
  }));
}

/**
 * Check if a client has an active connection for a specific app.
 */
export async function isAppConnected(clientId: string, appName: string): Promise<boolean> {
  const connections = await getConnectedAccounts(clientId);
  return connections.some(
    (c) => c.appName.toLowerCase() === appName.toLowerCase() && c.status === "active"
  );
}

/**
 * Get the Composio MCP endpoint URL for a client.
 */
export function getMCPEndpoint(clientId: string): string {
  return `https://backend.composio.dev/v3/mcp/default?user_id=${clientId}`;
}

/**
 * Get the API key for MCP connection headers.
 */
export function getMCPHeaders(): Record<string, string> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set");
  return { "x-api-key": apiKey };
}
