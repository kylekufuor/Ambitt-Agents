// ---------------------------------------------------------------------------
// MCP Integration Layer — Public API
// ---------------------------------------------------------------------------

// Client manager (singleton)
export { mcpManager } from "./client.js";

// Agent bridge — the primary interface for agents
export {
  executeAgentTool,
  listAllAgentTools,
  checkAgentToolHealth,
} from "./agent-bridge.js";

// Composio gateway — 850+ tools via OAuth
export {
  initiateConnection,
  getConnectedAccounts,
  getTools as getComposioTools,
  executeTool as executeComposioTool,
  listApps as listComposioApps,
  isAppConnected,
  getMCPEndpoint,
  getMCPHeaders,
} from "./composio.js";

// Registry — server definitions (fallback for direct MCP)
export {
  MCP_SERVERS,
  getServerDefinition,
  getServersByCategory,
  getAllServerIds,
  getOfficialServers,
} from "./registry.js";

// Types
export type {
  MCPTransport,
  MCPAuthMethod,
  MCPToolCategory,
  MCPServerDefinition,
  MCPToolResult,
  MCPToolInfo,
  MCPConnectionState,
  MCPConnectionConfig,
  AgentMCPMapping,
} from "./types.js";
