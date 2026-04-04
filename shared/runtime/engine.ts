import Anthropic from "@anthropic-ai/sdk";
import { loadAgentContext, assembleSystemPrompt } from "./prompt-assembler.js";
import { loadClaudeTools, executeToolCalls } from "./tool-bridge.js";
import { generateCSV } from "../attachments/csv.js";
import { generatePDF } from "../attachments/pdf.js";
import { analyzePerformanceFull, formatPageSpeedResults } from "../platform-tools/pagespeed.js";
import { scanSite, formatScanResults } from "../platform-tools/site-scanner.js";
import { logUsage } from "../claude.js";
import type { EmailAttachment } from "../email.js";
import prisma from "../db.js";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Agent Runtime Engine — the brain
// ---------------------------------------------------------------------------
// This is THE core of Ambitt Agents. The agentic loop:
//
// 1. Load agent context (identity, client, memory, conversation history)
// 2. Load MCP tools + built-in tools (CSV, PDF) and convert to Claude format
// 3. Assemble system prompt
// 4. Call Claude with tools enabled
// 5. If Claude returns tool_use → execute via MCP or built-in → send results back
// 6. Loop until Claude returns a final text response
// 7. Return the response + any attachments for sending via email
//
// Max 10 tool loops to prevent runaway. Claude is always the decision maker.
// ---------------------------------------------------------------------------

const MAX_TOOL_LOOPS = 10;
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

// Built-in tool names (not MCP — handled internally)
const BUILTIN_TOOLS = new Set([
  "generate_csv",
  "generate_pdf",
  "analyze_website_performance",
  "analyze_website_technology",
]);

export interface RuntimeInput {
  agentId: string;
  userMessage: string;
  channel: "email" | "whatsapp";
  threadId: string;
  senderEmail?: string;
}

export interface RuntimeOutput {
  response: string;
  toolsUsed: Array<{ serverId: string; toolName: string; success: boolean }>;
  attachments: EmailAttachment[];
  totalInputTokens: number;
  totalOutputTokens: number;
  loopCount: number;
}

// ---------------------------------------------------------------------------
// Built-in tool definitions (Claude format)
// ---------------------------------------------------------------------------

const BUILTIN_CLAUDE_TOOLS: Anthropic.Messages.Tool[] = [
  // --- Platform analysis tools (free, no client credentials needed) ---
  {
    name: "analyze_website_performance",
    description:
      "Analyze any website's performance using Google PageSpeed Insights. Returns performance scores (0-100), Core Web Vitals (FCP, LCP, TBT, CLS), and specific improvement opportunities. Runs both mobile and desktop analysis. Free — works on any public URL. Use this to show prospects real data about their site.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The website URL or domain to analyze (e.g. 'acmecorp.com' or 'https://acmecorp.com').",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "analyze_website_technology",
    description:
      "Scan any website to detect its technology stack, SSL certificate status, security headers grade, and basic metadata. Detects: CMS (WordPress, Shopify, Webflow, etc.), frameworks (React, Next.js, etc.), analytics (GA, GTM, Meta Pixel, etc.), CDN, hosting, marketing tools, and more. Free — works on any public URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The website URL or domain to scan (e.g. 'acmecorp.com').",
        },
      },
      required: ["url"],
    },
  },
  // --- Attachment generation tools ---
  {
    name: "generate_csv",
    description:
      "Generate a CSV file attachment from structured data. Use this when the client needs exportable data — contact lists, invoice tables, metrics, etc. The CSV will be attached to your email response.",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string",
          description: "Filename for the CSV (e.g. 'contacts-export.csv'). Must end in .csv.",
        },
        headers: {
          type: "array",
          items: { type: "string" },
          description: "Column headers.",
        },
        rows: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
          description: "Data rows. Each row is an array of string values matching the headers.",
        },
      },
      required: ["filename", "headers", "rows"],
    },
  },
  {
    name: "generate_pdf",
    description:
      "Generate a PDF report attachment. Use this when the client needs a formatted report — analysis summaries, recommendations, audits, etc. Write the content in markdown-style text (## for headings, - for bullets). The PDF will be styled with Ambitt branding and attached to your email response.",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string",
          description: "Filename for the PDF (e.g. 'monthly-report.pdf'). Must end in .pdf.",
        },
        title: {
          type: "string",
          description: "Report title shown at the top of the PDF.",
        },
        content: {
          type: "string",
          description:
            "Report content in markdown-style text. Use ## for section headings, ### for sub-headings, - for bullet points. Write in plain English, concise and actionable.",
        },
      },
      required: ["filename", "title", "content"],
    },
  },
];

// ---------------------------------------------------------------------------
// Built-in tool execution
// ---------------------------------------------------------------------------

async function executeBuiltinTool(
  toolName: string,
  args: Record<string, unknown>,
  agentName: string,
  clientBusinessName: string,
  attachments: EmailAttachment[]
): Promise<{ content: string; isError: boolean }> {
  try {
    if (toolName === "analyze_website_performance") {
      const { url } = args as { url: string };
      const { mobile, desktop } = await analyzePerformanceFull(url);
      const mobileText = formatPageSpeedResults(mobile);
      const desktopText = formatPageSpeedResults(desktop);
      return {
        content: `${mobileText}\n\n${desktopText}`,
        isError: false,
      };
    }

    if (toolName === "analyze_website_technology") {
      const { url } = args as { url: string };
      const result = await scanSite(url);
      return {
        content: formatScanResults(result),
        isError: false,
      };
    }

    if (toolName === "generate_csv") {
      const { filename, headers, rows } = args as {
        filename: string;
        headers: string[];
        rows: string[][];
      };
      const buffer = generateCSV({ headers, rows });
      attachments.push({ filename, content: buffer });
      return {
        content: `CSV generated: ${filename} (${rows.length} rows, ${headers.length} columns). It will be attached to your email response.`,
        isError: false,
      };
    }

    if (toolName === "generate_pdf") {
      const { filename, title, content } = args as {
        filename: string;
        title: string;
        content: string;
      };
      const buffer = await generatePDF({
        title,
        content,
        agentName,
        clientBusinessName,
      });
      attachments.push({ filename, content: buffer });
      return {
        content: `PDF generated: ${filename} ("${title}"). It will be attached to your email response.`,
        isError: false,
      };
    }

    return { content: `Unknown built-in tool: ${toolName}`, isError: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Built-in tool failed", { toolName, error: message });
    return { content: `Attachment generation failed: ${message}`, isError: true };
  }
}

// ---------------------------------------------------------------------------
// Main runtime
// ---------------------------------------------------------------------------

export async function runAgent(input: RuntimeInput): Promise<RuntimeOutput> {
  const { agentId, userMessage, channel, threadId } = input;
  const startTime = Date.now();

  // Check interaction limit before running
  const agentRecord = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { interactionCount: true, interactionLimit: true, interactionResetAt: true, pricingTier: true },
  });

  if (agentRecord) {
    // Reset counter if past the reset date
    if (agentRecord.interactionResetAt && new Date() >= agentRecord.interactionResetAt) {
      const nextReset = new Date();
      nextReset.setMonth(nextReset.getMonth() + 1);
      nextReset.setDate(1);
      nextReset.setHours(0, 0, 0, 0);

      await prisma.agent.update({
        where: { id: agentId },
        data: { interactionCount: 0, interactionResetAt: nextReset },
      });
    } else if (agentRecord.interactionLimit > 0 && agentRecord.interactionCount >= agentRecord.interactionLimit) {
      // Limit reached — return limit message instead of running
      const tierName = agentRecord.pricingTier.charAt(0).toUpperCase() + agentRecord.pricingTier.slice(1);
      return {
        response: `You've reached your ${tierName} plan limit of ${agentRecord.interactionLimit.toLocaleString()} interactions this month. Reply "upgrade" to increase your limit, or contact support@ambitt.agency.`,
        toolsUsed: [],
        attachments: [],
        totalInputTokens: 0,
        totalOutputTokens: 0,
        loopCount: 0,
      };
    }
  }

  // Step 1: Load agent context
  const ctx = await loadAgentContext(agentId);

  // Step 2: Load MCP tools + built-in tools
  const { claudeTools, mcpTools } = await loadClaudeTools(agentId);
  ctx.tools = mcpTools;

  const allClaudeTools = [...claudeTools, ...BUILTIN_CLAUDE_TOOLS];

  // Step 3: Assemble system prompt
  const systemPrompt = assembleSystemPrompt(ctx);

  // Step 4: Build initial messages
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  // Step 5: Agentic loop
  const client = new Anthropic();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolsUsed: RuntimeOutput["toolsUsed"] = [];
  const attachments: EmailAttachment[] = [];
  let loopCount = 0;
  let finalResponse = "";

  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    loopCount = i + 1;

    const apiResponse = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
      system: systemPrompt,
      messages,
      tools: allClaudeTools.length > 0 ? allClaudeTools : undefined,
    });

    totalInputTokens += apiResponse.usage.input_tokens;
    totalOutputTokens += apiResponse.usage.output_tokens;

    // Extract text and tool_use blocks
    const textBlocks = apiResponse.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    );
    const toolUseBlocks = apiResponse.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );

    // If no tool calls, we're done
    if (apiResponse.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      finalResponse = textBlocks.map((b) => b.text).join("\n\n");
      break;
    }

    // Split tool calls: built-in vs MCP
    const builtinCalls = toolUseBlocks.filter((b) => BUILTIN_TOOLS.has(b.name));
    const mcpCalls = toolUseBlocks.filter((b) => !BUILTIN_TOOLS.has(b.name));

    // Execute built-in tools
    const builtinResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of builtinCalls) {
      const result = await executeBuiltinTool(
        block.name,
        (block.input as Record<string, unknown>) ?? {},
        ctx.agentName,
        ctx.clientBusinessName,
        attachments
      );
      builtinResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.content,
        is_error: result.isError,
      });
      toolsUsed.push({
        serverId: "builtin",
        toolName: block.name,
        success: !result.isError,
      });
    }

    // Execute MCP tools
    const mcpResults = mcpCalls.length > 0
      ? await executeToolCalls(agentId, mcpCalls)
      : [];

    // Track MCP tool usage
    for (const block of mcpCalls) {
      const separatorIndex = block.name.indexOf("__");
      const serverId = separatorIndex !== -1 ? block.name.slice(0, separatorIndex) : "unknown";
      const toolName = separatorIndex !== -1 ? block.name.slice(separatorIndex + 2) : block.name;
      const result = mcpResults.find((r) => r.tool_use_id === block.id);
      toolsUsed.push({
        serverId,
        toolName,
        success: !result?.is_error,
      });
    }

    // Combine all results in original order
    const allResults: Anthropic.Messages.ToolResultBlockParam[] = toolUseBlocks.map((block) => {
      const builtin = builtinResults.find((r) => r.tool_use_id === block.id);
      if (builtin) return builtin;
      const mcp = mcpResults.find((r) => r.tool_use_id === block.id);
      if (mcp) return mcp;
      return {
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: "Tool execution skipped",
        is_error: true,
      };
    });

    // Add assistant response and tool results to messages for next loop
    messages.push({ role: "assistant", content: apiResponse.content });
    messages.push({ role: "user", content: allResults });

    // If there was text alongside tool calls, capture it
    if (textBlocks.length > 0) {
      finalResponse = textBlocks.map((b) => b.text).join("\n\n");
    }
  }

  // If we exhausted loops without a final response, use what we have
  if (!finalResponse) {
    finalResponse = `I've completed the actions requested. Here's a summary of what I did:\n\n${toolsUsed
      .map((t) => `- ${t.serverId}/${t.toolName}: ${t.success ? "completed" : "failed"}`)
      .join("\n")}`;
  }

  const elapsed = Date.now() - startTime;

  // Log conversation to DB
  await prisma.conversationMessage.create({
    data: {
      agentId,
      clientId: (await prisma.agent.findUnique({ where: { id: agentId }, select: { clientId: true } }))!.clientId,
      role: "agent",
      content: finalResponse,
      channel,
      threadId,
    },
  });

  // Increment interaction counter
  await prisma.agent.update({
    where: { id: agentId },
    data: { interactionCount: { increment: 1 } },
  });

  // Log API usage
  await logUsage(agentId, "agent_runtime", {
    content: finalResponse,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
  });

  logger.info("Agent runtime complete", {
    agentId,
    agentName: ctx.agentName,
    loopCount,
    toolsUsed: toolsUsed.length,
    attachments: attachments.length,
    elapsed,
    tokens: totalInputTokens + totalOutputTokens,
  });

  return {
    response: finalResponse,
    toolsUsed,
    attachments,
    totalInputTokens,
    totalOutputTokens,
    loopCount,
  };
}

/**
 * Process an inbound client message end-to-end:
 * log inbound → run agent → return response + attachments for sending.
 */
export async function processInboundMessage(input: RuntimeInput): Promise<RuntimeOutput> {
  const { agentId, userMessage, channel, threadId, senderEmail } = input;

  // Log the inbound message
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { clientId: true, status: true, name: true },
  });

  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  if (agent.status !== "active") throw new Error(`Agent ${agentId} is not active (status: ${agent.status})`);

  await prisma.conversationMessage.create({
    data: {
      agentId,
      clientId: agent.clientId,
      role: "client",
      content: userMessage,
      channel,
      threadId,
      inReplyTo: senderEmail,
    },
  });

  // Run the agent
  return runAgent(input);
}
