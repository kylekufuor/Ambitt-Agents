import prisma from "../db.js";
import { decrypt } from "../encryption.js";
import logger from "../logger.js";
import { mcpManager } from "./client.js";
import { getServerDefinition } from "./registry.js";
import {
  executeTool as composioExecute,
  getTools as composioGetTools,
  getConnectedAccounts,
  getMCPEndpoint,
  getMCPHeaders,
  isAppConnected,
} from "./composio.js";
import type { MCPToolResult, MCPToolInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Agent MCP Bridge — connects agents to their tools
// ---------------------------------------------------------------------------
// Routes tool calls through two paths:
//
// 1. COMPOSIO (primary) — if the tool is a Composio-managed app and the
//    client has an active Composio connection, route through Composio.
//    Composio handles OAuth, credentials, and execution for 850+ apps.
//
// 2. DIRECT MCP (fallback) — if the tool has a direct MCP server definition
//    in the registry and the client has stored credentials, connect directly.
//
// Agents never touch either path directly. They call these functions.
// ---------------------------------------------------------------------------

const USE_COMPOSIO = !!process.env.COMPOSIO_API_KEY;

/**
 * Execute a tool action on behalf of an agent.
 * Tries Composio first, falls back to direct MCP.
 */
export async function executeAgentTool(
  agentId: string,
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { clientId: true, name: true, tools: true },
  });

  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  if (!agent.tools.includes(serverId)) {
    return {
      success: false,
      content: [{ type: "text", text: `Agent ${agent.name} is not configured for tool: ${serverId}` }],
      isError: true,
    };
  }

  // Try Composio first
  if (USE_COMPOSIO) {
    try {
      const connected = await isAppConnected(agent.clientId, serverId);
      if (connected) {
        return await executeViaComposio(agent.clientId, serverId, toolName, args);
      }
    } catch (error) {
      logger.warn("Composio check failed, trying direct MCP", { agentId, serverId, error });
    }
  }

  // Fall back to direct MCP
  return await executeViaDirect(agentId, agent.clientId, serverId, toolName, args);
}

/**
 * List all tools available to an agent.
 * Combines Composio-connected tools with direct MCP tools.
 */
export async function listAllAgentTools(agentId: string): Promise<MCPToolInfo[]> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { clientId: true, tools: true },
  });

  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const allTools: MCPToolInfo[] = [];

  for (const serverId of agent.tools) {
    try {
      // Try Composio first
      if (USE_COMPOSIO) {
        const connected = await isAppConnected(agent.clientId, serverId);
        if (connected) {
          const tools = await composioGetTools(serverId);
          allTools.push(
            ...tools.map((t) => ({
              name: t.name,
              description: t.description,
              serverId,
            }))
          );
          continue;
        }
      }

      // Fall back to direct MCP
      const directTools = await listDirectTools(agentId, agent.clientId, serverId);
      allTools.push(...directTools);
    } catch (error) {
      logger.warn("Failed to list tools for server", { agentId, serverId, error });
    }
  }

  return allTools;
}

/**
 * Check connection health for all of an agent's tools.
 */
export async function checkAgentToolHealth(agentId: string): Promise<
  Array<{ serverId: string; connected: boolean; toolCount: number; source: "composio" | "direct" | "none"; error?: string }>
> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { clientId: true, tools: true },
  });

  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const results = [];

  for (const serverId of agent.tools) {
    // Check Composio
    if (USE_COMPOSIO) {
      try {
        const connected = await isAppConnected(agent.clientId, serverId);
        if (connected) {
          const tools = await composioGetTools(serverId);
          results.push({ serverId, connected: true, toolCount: tools.length, source: "composio" as const });
          continue;
        }
      } catch {
        // Fall through to direct check
      }
    }

    // Check direct MCP
    const server = getServerDefinition(serverId);
    if (!server) {
      results.push({ serverId, connected: false, toolCount: 0, source: "none" as const, error: "Unknown server" });
      continue;
    }

    const credential = await loadCredential(agent.clientId, serverId, server.credentialField);
    if (!credential) {
      results.push({ serverId, connected: false, toolCount: 0, source: "none" as const, error: "No credentials" });
      continue;
    }

    try {
      await mcpManager.connect({ server, credential });
      const tools = await mcpManager.listTools(serverId, credential);
      results.push({ serverId, connected: true, toolCount: tools.length, source: "direct" as const });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ serverId, connected: false, toolCount: 0, source: "none" as const, error: message });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Composio execution
// ---------------------------------------------------------------------------

async function executeViaComposio(
  clientId: string,
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const startTime = Date.now();

  // Composio action names are uppercase: e.g., GMAIL_SEND_EMAIL
  const actionName = toolName.toUpperCase();

  const result = await composioExecute(clientId, actionName, args);
  const elapsed = Date.now() - startTime;

  logger.info("Composio tool executed via bridge", {
    clientId,
    serverId,
    toolName: actionName,
    success: result.success,
    elapsed,
  });

  if (result.success) {
    const content = typeof result.data === "string"
      ? result.data
      : JSON.stringify(result.data, null, 2);

    return {
      success: true,
      content: [{ type: "text", text: content }],
      isError: false,
    };
  }

  return {
    success: false,
    content: [{ type: "text", text: result.error ?? "Composio execution failed" }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Direct MCP execution (fallback)
// ---------------------------------------------------------------------------

async function executeViaDirect(
  agentId: string,
  clientId: string,
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const server = getServerDefinition(serverId);
  if (!server) throw new Error(`Unknown MCP server: ${serverId}`);

  const credential = await loadCredential(clientId, serverId, server.credentialField);
  if (!credential) {
    return {
      success: false,
      content: [{ type: "text", text: `No credentials found for ${server.name}. Client needs to connect this tool.` }],
      isError: true,
    };
  }

  await mcpManager.connect({ server, credential });

  const startTime = Date.now();
  const result = await mcpManager.callTool(serverId, credential, toolName, args);
  const elapsed = Date.now() - startTime;

  logger.info("Direct MCP tool executed", {
    agentId,
    serverId,
    toolName,
    success: result.success,
    elapsed,
  });

  return result;
}

async function listDirectTools(
  agentId: string,
  clientId: string,
  serverId: string
): Promise<MCPToolInfo[]> {
  const server = getServerDefinition(serverId);
  if (!server) return [];

  const credential = await loadCredential(clientId, serverId, server.credentialField);
  if (!credential) return [];

  await mcpManager.connect({ server, credential });
  return mcpManager.listTools(serverId, credential);
}

// ---------------------------------------------------------------------------
// Credential loading (for direct MCP fallback)
// ---------------------------------------------------------------------------

async function loadCredential(
  clientId: string,
  serverId: string,
  credentialField: string
): Promise<string | null> {
  const cred = await prisma.credential.findUnique({
    where: { clientId_toolName: { clientId, toolName: serverId } },
  });

  if (!cred) return null;

  const encrypted = credentialField === "oauthToken"
    ? cred.oauthToken
    : credentialField === "apiKey"
      ? cred.apiKey
      : credentialField === "refreshToken"
        ? cred.refreshToken
        : cred.apiKey;

  if (!encrypted) return null;

  try {
    return decrypt(encrypted);
  } catch (error) {
    logger.error("Failed to decrypt credential", { clientId, serverId, error });
    return null;
  }
}
