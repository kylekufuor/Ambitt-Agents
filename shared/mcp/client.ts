import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import logger from "../logger.js";
import { HIGHLEVEL_ID, highLevelHeaders, parseHighLevelCredential, credentialFingerprint, createHighLevelFetch, bindHighLevelLocation } from "./highlevel.js";
import type {
  MCPConnectionConfig,
  MCPConnectionState,
  MCPToolInfo,
  MCPToolResult,
  MCPServerDefinition,
} from "./types.js";

// ---------------------------------------------------------------------------
// MCP Client Manager — Universal connection manager for all MCP servers
// ---------------------------------------------------------------------------
// Manages connections to any MCP server (HTTP remote or stdio local).
// Caches active connections. Handles auth. Provides clean API for agents.
// ---------------------------------------------------------------------------

interface ActiveConnection {
  client: Client;
  transport: StreamableHTTPClientTransport | SSEClientTransport | StdioClientTransport;
  server: MCPServerDefinition;
  connectedAt: Date;
  tools: MCPToolInfo[];
}

export class MCPClientManager {
  private connections = new Map<string, ActiveConnection>();

  // -------------------------------------------------------------------------
  // Connect to an MCP server
  // -------------------------------------------------------------------------

  async connect(config: MCPConnectionConfig, options?: RequestOptions): Promise<void> {
    const { server, credential } = config;
    const key = this.connectionKey(server.id, credential);

    // Reuse existing connection
    if (this.connections.has(key)) {
      const existing = this.connections.get(key)!;
      if (await this.isHealthy(key)) return;
      // Stale connection — disconnect and reconnect
      await this.disconnect(key);
    }

    const client = new Client(
      { name: "ambitt-agent", version: "2.0.0" },
      { capabilities: {} }
    );

    let transport: ActiveConnection["transport"];

    if (server.transport === "http") {
      transport = await this.connectHTTP(server, credential);
    } else {
      transport = await this.connectStdio(server, credential, config.additionalEnv);
    }

    const tools: MCPToolInfo[] = [];
    try {
      await client.connect(transport, options);
      // Include every page of scoped tools.
      let cursor: string | undefined;
      do {
        const toolsResult = await client.listTools(cursor ? { cursor } : undefined, options);
        tools.push(...(toolsResult.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown> | undefined,
          serverId: server.id,
        })));
        cursor = toolsResult.nextCursor;
      } while (cursor);
    } catch (error) {
      await client.close().catch(() => undefined);
      if (server.id === HIGHLEVEL_ID) throw new Error("We couldn't connect to GoHighLevel. Check your token, Location ID and permissions.");
      throw error;
    }

    this.connections.set(key, {
      client,
      transport,
      server,
      connectedAt: new Date(),
      tools,
    });

    logger.info("MCP connected", {
      serverId: server.id,
      transport: server.transport,
      toolCount: tools.length,
    });
  }

  // -------------------------------------------------------------------------
  // List tools from a connected server
  // -------------------------------------------------------------------------

  async listTools(serverId: string, credential: string): Promise<MCPToolInfo[]> {
    const conn = this.getConnection(serverId, credential);
    if (!conn) throw new Error(`Not connected to MCP server: ${serverId}`);
    return conn.tools;
  }

  // -------------------------------------------------------------------------
  // Call a tool on a connected server
  // -------------------------------------------------------------------------

  async callTool(
    serverId: string,
    credential: string,
    toolName: string,
    args: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<MCPToolResult> {
    const conn = this.getConnection(serverId, credential);
    if (!conn) throw new Error(`Not connected to MCP server: ${serverId}`);

    try {
      // The discovered schema names the location parameters; the configured
      // location overwrites every one of them (see bindHighLevelLocation).
      const bound = serverId === HIGHLEVEL_ID
        ? bindHighLevelLocation(args, parseHighLevelCredential(credential).locationId, conn.tools.find((tool) => tool.name === toolName)?.inputSchema)
        : args;
      const result = await conn.client.callTool({
        name: toolName,
        arguments: bound,
      }, undefined, options);

      if (serverId === HIGHLEVEL_ID && result.isError) return {
        success: false, isError: true,
        content: [{ type: "text", text: "GoHighLevel declined that action. Check the selected location and permissions." }],
      };

      return {
        success: !result.isError,
        content: result.content as unknown[],
        isError: !!result.isError,
        rawResult: result,
      };
    } catch (error) {
      const message = serverId === HIGHLEVEL_ID
        ? "GoHighLevel couldn't complete that action. Check the connection and its location before trying again."
        : error instanceof Error ? error.message : String(error);
      logger.error("MCP tool call failed", { serverId, toolName, error: message });
      return {
        success: false,
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Disconnect from a server
  // -------------------------------------------------------------------------

  async disconnect(key: string): Promise<void> {
    const conn = this.connections.get(key);
    if (!conn) return;

    try {
      await conn.client.close();
    } catch {
      // Ignore close errors
    }

    this.connections.delete(key);
    logger.info("MCP disconnected", { key });
  }

  async disconnectServer(serverId: string, credential: string): Promise<void> {
    await this.disconnect(this.connectionKey(serverId, credential));
  }

  async disconnectAll(): Promise<void> {
    const keys = Array.from(this.connections.keys());
    await Promise.all(keys.map((key) => this.disconnect(key)));
  }

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  async healthCheck(serverId: string, credential: string): Promise<boolean> {
    return this.isHealthy(this.connectionKey(serverId, credential));
  }

  getConnectionState(serverId: string, credential: string): MCPConnectionState {
    const conn = this.getConnection(serverId, credential);
    if (!conn) {
      return {
        serverId,
        connected: false,
        connectedAt: null,
        toolCount: 0,
        lastHealthCheck: null,
        healthy: false,
      };
    }
    return {
      serverId,
      connected: true,
      connectedAt: conn.connectedAt,
      toolCount: conn.tools.length,
      lastHealthCheck: new Date(),
      healthy: true,
    };
  }

  getActiveConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  // -------------------------------------------------------------------------
  // Private — transport creation
  // -------------------------------------------------------------------------

  private async connectHTTP(
    server: MCPServerDefinition,
    credential: string
  ): Promise<StreamableHTTPClientTransport | SSEClientTransport> {
    if (!server.url) throw new Error(`No URL for HTTP MCP server: ${server.id}`);

    const url = new URL(server.url);

    // Build auth headers
    const headers: Record<string, string> = server.id === HIGHLEVEL_ID ? highLevelHeaders(credential) : {};
    if (server.id === HIGHLEVEL_ID) {
      return new StreamableHTTPClientTransport(url, {
        requestInit: { headers },
        fetch: createHighLevelFetch(parseHighLevelCredential(credential).locationId),
      });
    } else if (server.auth === "bearer" || server.auth === "api_key_header") {
      headers[server.authHeader ?? "Authorization"] = server.auth === "bearer"
        ? `Bearer ${credential}`
        : credential;
    } else if (server.auth === "oauth") {
      headers["Authorization"] = `Bearer ${credential}`;
    }

    // Try StreamableHTTP first, fall back to SSE
    try {
      const transport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers },
      });
      return transport;
    } catch {
      logger.info("StreamableHTTP failed, falling back to SSE", { serverId: server.id });
      const transport = new SSEClientTransport(url, {
        requestInit: { headers },
      });
      return transport;
    }
  }

  private async connectStdio(
    server: MCPServerDefinition,
    credential: string,
    additionalEnv?: Record<string, string>
  ): Promise<StdioClientTransport> {
    if (!server.command) throw new Error(`No command for stdio MCP server: ${server.id}`);

    // Build env with credential
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...additionalEnv,
    };

    if (server.envKey) {
      env[server.envKey] = credential;
    }

    // For connection_string auth (e.g., PostgreSQL), pass as last arg
    const args = [...(server.args ?? [])];
    if (server.auth === "connection_string") {
      args.push(credential);
    }

    const transport = new StdioClientTransport({
      command: server.command,
      args,
      env,
    });

    return transport;
  }

  // -------------------------------------------------------------------------
  // Private — helpers
  // -------------------------------------------------------------------------

  private connectionKey(serverId: string, credential: string): string {
    // Hash the credential to avoid storing it as a map key
    const credHash = credentialFingerprint(credential);
    return `${serverId}:${credHash}`;
  }

  private getConnection(serverId: string, credential: string): ActiveConnection | undefined {
    return this.connections.get(this.connectionKey(serverId, credential));
  }

  private async isHealthy(key: string): Promise<boolean> {
    const conn = this.connections.get(key);
    if (!conn) return false;

    try {
      // Ping by listing tools — if it responds, connection is alive
      await conn.client.listTools();
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const mcpManager = new MCPClientManager();

export default mcpManager;
