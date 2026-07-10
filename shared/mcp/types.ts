// ---------------------------------------------------------------------------
// MCP Integration Layer — Type Definitions
// ---------------------------------------------------------------------------

/** How the MCP server is reached */
export type MCPTransport = "http" | "stdio";

/** How authentication is provided */
export type MCPAuthMethod = "bearer" | "api_key_header" | "oauth" | "env" | "connection_string" | "none";

/** Tool category for grouping in UI */
export type MCPToolCategory = "crm" | "payments" | "analytics" | "database" | "project_management" | "communication" | "support" | "finance" | "commerce" | "marketing" | "seo" | "advertising" | "email_marketing" | "product_analytics";

/**
 * Communication channel type — tags a tool as a channel the agent can send/receive
 * personal messages through. Drives which connected tools surface in an agent's
 * Communication Settings (inbound / MFA relay / outbound roles). `chat`/`sms` are
 * real-time and preferred for the MFA-relay role over `email`.
 */
export type MCPChannelType = "email" | "chat" | "sms";

/** Defines how to connect to an MCP server */
export interface MCPServerDefinition {
  id: string;
  name: string;
  description: string;
  category: MCPToolCategory;
  logoUrl: string;

  // Connection
  transport: MCPTransport;

  // HTTP transport config
  url?: string;

  // stdio transport config
  command?: string;
  args?: string[];

  // Authentication
  auth: MCPAuthMethod;
  credentialField: string;        // which Credential field to use (apiKey, oauthToken, etc.)
  envKey?: string;                // for stdio servers that need env vars
  authHeader?: string;            // custom header name (defaults to "Authorization")

  // Metadata
  docsUrl?: string;
  officialServer: boolean;        // maintained by the tool vendor
  readOnly?: boolean;             // server only supports read operations

  // Communication routing — set only on tools usable as a personal comms channel.
  // Surfaces the tool in an agent's Communication Settings roles. See channel-types.ts.
  channelType?: MCPChannelType;
}

/** Result from calling an MCP tool */
export interface MCPToolResult {
  success: boolean;
  content: unknown[];             // MCP content blocks (text, image, etc.)
  isError: boolean;
  rawResult?: unknown;
}

/** A tool exposed by an MCP server */
export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  serverId: string;
}

/** Active connection state */
export interface MCPConnectionState {
  serverId: string;
  connected: boolean;
  connectedAt: Date | null;
  toolCount: number;
  lastHealthCheck: Date | null;
  healthy: boolean;
  error?: string;
}

/** Config needed to establish a connection (server def + credentials) */
export interface MCPConnectionConfig {
  server: MCPServerDefinition;
  credential: string;             // decrypted credential value
  additionalEnv?: Record<string, string>;
}

/** Agent type → MCP server mapping */
export interface AgentMCPMapping {
  agentType: string;
  serverIds: string[];
  description: string;
}
