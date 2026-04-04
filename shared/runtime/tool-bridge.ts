import Anthropic from "@anthropic-ai/sdk";
import { listAllAgentTools, executeAgentTool } from "../mcp/agent-bridge.js";
import logger from "../logger.js";
import type { MCPToolInfo } from "../mcp/types.js";

// ---------------------------------------------------------------------------
// Tool Bridge — connects Claude's tool_use to MCP servers
// ---------------------------------------------------------------------------
// Converts MCP tool schemas → Claude tool format.
// Executes Claude's tool_use calls → MCP bridge → returns results.
// This is the glue between Claude's brain and the agent's hands.
// ---------------------------------------------------------------------------

type ClaudeTool = Anthropic.Messages.Tool;
type ToolUseBlock = Anthropic.Messages.ToolUseBlock;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;

/**
 * Load all MCP tools for an agent and convert to Claude tool format.
 */
export async function loadClaudeTools(agentId: string): Promise<{
  claudeTools: ClaudeTool[];
  mcpTools: MCPToolInfo[];
}> {
  const mcpTools = await listAllAgentTools(agentId);

  const claudeTools: ClaudeTool[] = mcpTools.map((tool) => ({
    name: formatToolName(tool.serverId, tool.name),
    description: tool.description ?? `${tool.serverId} tool: ${tool.name}`,
    input_schema: (tool.inputSchema as Anthropic.Messages.Tool["input_schema"]) ?? {
      type: "object" as const,
      properties: {},
    },
  }));

  return { claudeTools, mcpTools };
}

/**
 * Execute a batch of Claude tool_use calls via MCP.
 * Returns tool results in the format Claude expects.
 */
export async function executeToolCalls(
  agentId: string,
  toolUseBlocks: ToolUseBlock[]
): Promise<ToolResultBlockParam[]> {
  const results: ToolResultBlockParam[] = [];

  for (const block of toolUseBlocks) {
    const { serverId, toolName } = parseToolName(block.name);

    try {
      const result = await executeAgentTool(
        agentId,
        serverId,
        toolName,
        (block.input as Record<string, unknown>) ?? {}
      );

      // Extract text content from MCP result
      const content = result.content
        .map((c) => {
          if (typeof c === "string") return c;
          if (typeof c === "object" && c !== null && "text" in c) return (c as { text: string }).text;
          return JSON.stringify(c);
        })
        .join("\n");

      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: content || (result.success ? "Action completed successfully." : "Action failed."),
        is_error: result.isError,
      });

      logger.info("Tool call executed", {
        agentId,
        serverId,
        toolName,
        success: result.success,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Tool call failed", { agentId, serverId, toolName, error: message });

      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `Tool execution failed: ${message}`,
        is_error: true,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tool name formatting
// ---------------------------------------------------------------------------
// Claude tool names must match ^[a-zA-Z0-9_-]{1,64}$
// We encode as: serverId__toolName (double underscore separator)
// ---------------------------------------------------------------------------

function formatToolName(serverId: string, toolName: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");
  const formatted = `${clean(serverId)}__${clean(toolName)}`;
  return formatted.slice(0, 64);
}

function parseToolName(claudeToolName: string): { serverId: string; toolName: string } {
  const separatorIndex = claudeToolName.indexOf("__");
  if (separatorIndex === -1) {
    return { serverId: "unknown", toolName: claudeToolName };
  }
  return {
    serverId: claudeToolName.slice(0, separatorIndex),
    toolName: claudeToolName.slice(separatorIndex + 2),
  };
}
