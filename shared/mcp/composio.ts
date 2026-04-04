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

  const connection = await client.connectedAccounts.initiate({
    appName,
    entityId: clientId,
    redirectUri: callbackUrl,
  } as any);

  logger.info("Composio connection initiated", { clientId, appName });

  return {
    redirectUrl: (connection as any).redirectUrl ?? (connection as any).redirect_url ?? "",
    connectionId: (connection as any).connectedAccountId ?? (connection as any).id ?? "",
  };
}

/**
 * Get all connected accounts for a client.
 */
export async function getConnectedAccounts(clientId: string): Promise<
  Array<{ id: string; appName: string; status: string }>
> {
  const client = getClient();
  const response = await client.connectedAccounts.list({
    entityId: clientId,
  });

  const connections = (response as any).items ?? response ?? [];
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
  const client = getClient();
  const response = await client.apps.list();
  const apps = (response as any).items ?? response ?? [];

  return apps.map((app: any) => ({
    name: app.name ?? "",
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
