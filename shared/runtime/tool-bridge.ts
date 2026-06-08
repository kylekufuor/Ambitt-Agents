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
 * Read-verb prefixes — when a tool name (lowercased) starts with one of
 * these we treat it as read-only and let it execute live even in dry-run.
 * Everything else is presumed to mutate something (send / create / update /
 * delete / post / reply / schedule / etc.) and gets stubbed.
 *
 * Defaulting to stub is intentional: it's the safe failure mode.
 */
const READ_VERB_PREFIXES = [
  "list", "get", "fetch", "read", "search", "find", "show", "view",
  "observe", "describe", "lookup", "check", "count", "summarize",
];

function isReadOnlyTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return READ_VERB_PREFIXES.some((p) =>
    lower === p || lower.startsWith(`${p}_`) || lower.startsWith(`${p}-`)
  );
}

/**
 * Execute a batch of Claude tool_use calls via MCP.
 * Returns tool results in the format Claude expects.
 *
 * Dry-run behavior: if the agent has dryRun=true, write-like tools are
 * intercepted — we record the would-be call to DryRunLog and return a
 * synthetic success ("Captured for review — would have called X with these
 * params"). Read-only tools (list_/get_/search_/etc) execute live so the
 * agent can still chain on real context (e.g. read inbox → decide to reply).
 */
export async function executeToolCalls(
  agentId: string,
  toolUseBlocks: ToolUseBlock[]
): Promise<ToolResultBlockParam[]> {
  const results: ToolResultBlockParam[] = [];

  // One lookup per batch, not per block. Cached in agent var; if dryRun
  // isn't found (e.g. agent deleted mid-loop) we default to false (live)
  // and let the call proceed normally.
  let dryRun = false;
  try {
    const { default: prisma } = await import("../db.js");
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { dryRun: true },
    });
    dryRun = Boolean(agent?.dryRun);
  } catch {
    /* default false on lookup error */
  }

  for (const block of toolUseBlocks) {
    const { serverId, toolName } = parseToolName(block.name);
    const input = (block.input as Record<string, unknown>) ?? {};

    // Dry-run intercept — stub write-like tools, log them for operator review.
    if (dryRun && !isReadOnlyTool(toolName)) {
      try {
        const { default: prisma } = await import("../db.js");
        const captured = await prisma.dryRunLog.create({
          data: {
            agentId,
            kind: "composio",
            payload: {
              serverId,
              toolName,
              input,
              fullName: block.name,
            } as object,
          },
          select: { id: true },
        });
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Captured for review (dry-run, log id ${captured.id}). In live mode this would have called ${block.name} with the provided input.`,
          is_error: false,
        });
        logger.info("Dry-run: tool call captured (not executed)", {
          agentId,
          serverId,
          toolName,
          dryRunLogId: captured.id,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn("Dry-run capture failed, falling through to live execution", {
          agentId,
          serverId,
          toolName,
          err: message,
        });
        // Fall through to live execution below — better to act than block on a DB hiccup.
      }
      if (results[results.length - 1]?.tool_use_id === block.id) {
        continue; // captured successfully; move to next block
      }
    }

    try {
      const result = await executeAgentTool(
        agentId,
        serverId,
        toolName,
        input
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
