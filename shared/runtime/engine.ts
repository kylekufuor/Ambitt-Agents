import Anthropic from "@anthropic-ai/sdk";
import { loadAgentContext, assembleSystemPrompt } from "./prompt-assembler.js";
import { loadClaudeTools, executeToolCalls } from "./tool-bridge.js";
import { generateCSV } from "../attachments/csv.js";
import { generatePDF } from "../attachments/pdf.js";
import { analyzePerformanceFull, formatPageSpeedResults } from "../platform-tools/pagespeed.js";
import { scanSite, formatScanResults } from "../platform-tools/site-scanner.js";
import { webSearch, formatSearchResults } from "../platform-tools/web-search.js";
import { requestToolConnection } from "../platform-tools/request-tool-connection.js";
import { requestApproval } from "../platform-tools/request-approval.js";
import { sendAgentEmail } from "../../oracle/lib/emailRouter.js";
import { logUsage, CLIENT_MODEL, TRIAGE_MODEL } from "../claude.js";
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
const MAX_TOKENS = 4096;

// Triage routing: Haiku handles intermediate tool-selection loops (~10× cheaper
// than Sonnet), then escalates to CLIENT_MODEL once Haiku decides research is
// done, so the client-facing response is written by the stronger model. Set
// DISABLE_TRIAGE_ROUTING=1 to force CLIENT_MODEL for the whole loop.
const TRIAGE_ENABLED = process.env.DISABLE_TRIAGE_ROUTING !== "1";

// Built-in tool names (not MCP — handled internally)
// Built-in tools are platform-level capabilities that don't require a client
// tool connection. Everything else (email, calendar, CRM, etc.) goes through
// Composio tool connections.
const BUILTIN_TOOLS = new Set([
  "web_search",
  "generate_csv",
  "generate_pdf",
  "analyze_website_performance",
  "analyze_website_technology",
  "request_tool_connection",
  "request_approval",
]);

export interface RuntimeInput {
  agentId: string;
  userMessage: string;
  channel: "email" | "whatsapp" | "chat";
  threadId: string;
  senderEmail?: string;
  // When false, this run does NOT count toward the client's monthly interaction
  // quota and bypasses overage enforcement. Used for system-initiated onboarding
  // and checkpoint emails ("on us"). API cost is still logged for accounting.
  billable?: boolean;
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
  // --- Web search ---
  {
    name: "web_search",
    description:
      "Search the web for real-time information. Use this to research businesses, competitors, reviews, news, market data, people, companies, or any public information. Returns relevant results with titles, URLs, and content snippets. Use multiple searches to build a complete picture.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query. Be specific — include business name, location, industry, or topic. Example: 'Jake\\'s Pizza Houston Google reviews' or 'best pizza restaurants Houston competitor analysis'.",
        },
        max_results: {
          type: "number",
          description: "Number of results to return (1-10). Default: 5.",
        },
        search_depth: {
          type: "string",
          enum: ["basic", "advanced"],
          description: "Search depth. 'basic' is fast. 'advanced' is slower but more thorough — use for detailed research.",
        },
      },
      required: ["query"],
    },
  },
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
  // --- Approval gate (supervised mode) ---
  // Pauses the run and emails the client an action-required plan with
  // Approve / Ask / Dismiss buttons. In supervised mode, any side-effectful
  // action must call this first and wait for the client's reply. In
  // autonomous mode, Claude is told to execute directly and only call this
  // for high-impact irreversible actions. See prompt-assembler.ts for the
  // per-mode guidance Claude receives.
  {
    name: "request_approval",
    description:
      "Ask the client to approve a plan before you execute any side-effectful action (send emails, update CRM/calendar, post anywhere, create/modify/delete external records). In SUPERVISED mode this is mandatory before any write action. In AUTONOMOUS mode only call this for high-impact irreversible actions (large financial moves, destructive data changes). Read-only research, analysis, and web search are always fine without approval in both modes. After calling this, do NOT make any more tool calls — end your turn with a brief note to the client. Their APPROVE / DISMISS reply will re-enter the runtime with the full conversation, and you'll execute (or adjust) then.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description:
            "One-sentence headline of what you're proposing, in the client's voice. Example: 'I'd like to send these 3 follow-up emails to leads from last week.' or 'I've drafted the monthly report — approve to send it to your list.' Under 200 characters.",
        },
        plan_items: {
          type: "array",
          items: { type: "string" },
          description:
            "Ordered concrete steps you'll take on approval. Each item should be a single action the client can mentally check off. Example: ['Send email to Alice re: Q3 proposal', 'Send email to Bob re: contract renewal', 'Log both in HubSpot as touched today']. 1-8 items.",
        },
        reasoning: {
          type: "string",
          description:
            "Optional 1-2 sentence why — surfaced in the email under 'Reasoning'. Explain why this action makes sense now.",
        },
      },
      required: ["summary", "plan_items"],
    },
  },
  // --- Tool connection request ---
  // Emails the client a one-click Composio OAuth link for a specific app.
  // Full handler (de-dup, DB row, email dispatch) lives in
  // shared/platform-tools/request-tool-connection.ts.
  {
    name: "request_tool_connection",
    description:
      "Ask the client to connect an external tool (app) you need. Call this ONLY when you genuinely need a specific app (e.g. Gmail, Google Calendar, Slack, HubSpot, Salesforce, Calendly, Notion) to complete the task, and it is NOT already available to you as one of your MCP tools. The client receives an email with a one-click OAuth link and authorizes in ~30 seconds. You will NOT get access inside this run — continue the task with what you can do without it, and the tool will be available on your next run once they authorize. Do not call this preemptively or for tools already in your toolset. If the same app has been requested recently (last 24 hours), this is a no-op.",
    input_schema: {
      type: "object" as const,
      properties: {
        app_name: {
          type: "string",
          description:
            "Composio app slug — lowercase, no spaces. Common values: 'gmail', 'googlecalendar', 'googlesheets', 'googledrive', 'slack', 'hubspot', 'salesforce', 'calendly', 'linkedin', 'notion', 'airtable', 'shopify', 'stripe'. If you're unsure of the slug, use the common lowercase form of the app name (the handler normalizes it).",
        },
        reason: {
          type: "string",
          description:
            "Plain-English reason you need this tool, written as you'd explain it to the client. Example: 'send your weekly client reports for you' or 'check your calendar availability before booking meetings'. This text goes verbatim into the email the client receives, so it should be action-oriented and benefit-focused — not technical.",
        },
      },
      required: ["app_name", "reason"],
    },
  },
];

// ---------------------------------------------------------------------------
// Built-in tool execution
// ---------------------------------------------------------------------------

async function executeBuiltinTool(
  toolName: string,
  args: Record<string, unknown>,
  agentId: string,
  clientId: string,
  agentName: string,
  clientName: string,
  clientBusinessName: string,
  attachments: EmailAttachment[]
): Promise<{ content: string; isError: boolean; isPause?: boolean }> {
  try {
    if (toolName === "web_search") {
      const { query, max_results, search_depth } = args as {
        query: string;
        max_results?: number;
        search_depth?: "basic" | "advanced";
      };
      const result = await webSearch(query, {
        maxResults: max_results,
        searchDepth: search_depth,
      });
      return {
        content: formatSearchResults(result),
        isError: false,
      };
    }

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

    if (toolName === "request_approval") {
      const { summary, plan_items, reasoning } = args as {
        summary: string;
        plan_items: string[];
        reasoning?: string;
      };
      const result = await requestApproval({
        agentId,
        clientId,
        summary,
        planItems: plan_items,
        reasoning,
        sendActionRequiredEmail: async ({ to, summary: s, planItems, reasoning: why, approveActionId }) => {
          await sendAgentEmail({
            trigger: "action-required",
            to,
            agentName,
            agentId,
            clientName,
            clientId,
            productName: clientBusinessName,
            summary: s,
            actionSteps: planItems.map((step) => ({ step })),
            reasoning: why,
            impactStatement: "These changes will be made on your behalf once you approve.",
            approveActionId,
            ctaUrl: `mailto:reply-${agentId}@ambitt.agency?subject=APPROVE%20${approveActionId}`,
          });
        },
      });
      return {
        content: result.message,
        isError: result.status === "error",
        isPause: result.isPause,
      };
    }

    if (toolName === "request_tool_connection") {
      const { app_name, reason } = args as { app_name: string; reason: string };
      const result = await requestToolConnection({
        agentId,
        clientId,
        appName: app_name,
        reason,
        sendPermissionEmail: async ({ to, summary, appName, ctaUrl, approveActionId, reason: why }) => {
          await sendAgentEmail({
            trigger: "permission",
            to,
            agentName,
            agentId,
            clientName,
            clientId,
            productName: clientBusinessName,
            summary,
            permissions: [
              {
                toolName: appName,
                accessLevel: "OAuth",
                description: `Access to your ${appName} account to ${why}.`,
              },
            ],
            intentSteps: [{ step: why }],
            approveActionId,
            ctaUrl,
          });
        },
      });
      return {
        content: result.message,
        // Not an error from Claude's perspective — these are expected outcomes.
        // We only flag true failures (status="error") as tool errors.
        isError: result.status === "error",
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
  const billable = input.billable !== false; // default true
  const startTime = Date.now();

  // Check interaction limit before running. Overage is always on: when the
  // agent passes its tier's interactionLimit, each extra interaction is
  // charged at the tier's overage rate (see pricing.ts) and logged as an
  // OverageEvent row for end-of-month invoicing.
  const agentRecord = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      interactionCount: true,
      interactionLimit: true,
      interactionResetAt: true,
      pricingTier: true,
      clientId: true,
    },
  });

  let isOverageInteraction = false;

  if (agentRecord && billable) {
    if (agentRecord.interactionResetAt && new Date() >= agentRecord.interactionResetAt) {
      // Reset counter if past the reset date
      const nextReset = new Date();
      nextReset.setMonth(nextReset.getMonth() + 1);
      nextReset.setDate(1);
      nextReset.setHours(0, 0, 0, 0);

      await prisma.agent.update({
        where: { id: agentId },
        data: { interactionCount: 0, overageCount: 0, interactionResetAt: nextReset },
      });
    } else if (agentRecord.interactionLimit > 0 && agentRecord.interactionCount >= agentRecord.interactionLimit) {
      isOverageInteraction = true;
    }
  }
  // Non-billable runs skip the counter bump and overage branch entirely —
  // treated as free system work that still logs API cost for internal accounting.

  // Step 1: Load agent context
  const ctx = await loadAgentContext(agentId);

  // Step 2: Load MCP tools + built-in tools
  const { claudeTools, mcpTools } = await loadClaudeTools(agentId);
  ctx.tools = mcpTools;

  const allClaudeTools = [...claudeTools, ...BUILTIN_CLAUDE_TOOLS];

  // Step 3: Assemble system prompt
  const systemPrompt = assembleSystemPrompt(ctx);

  // Prompt caching — system prompt and tool definitions are stable across the
  // tool loop and across runs until the agent's memory/tools change. Caching
  // them cuts input cost by ~90% on repeat calls (5-min TTL).
  const systemParam: Anthropic.Messages.MessageCreateParams["system"] = [
    { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
  ];
  const cachedTools: Anthropic.Messages.Tool[] = allClaudeTools.length > 0
    ? allClaudeTools.map((tool, idx) =>
        idx === allClaudeTools.length - 1
          ? { ...tool, cache_control: { type: "ephemeral" } }
          : tool
      )
    : [];

  // Step 4: Build initial messages
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  // Step 5: Agentic loop with triage routing (Haiku → Sonnet escalation).
  // See TRIAGE_ENABLED comment for the pattern.
  const client = new Anthropic();
  interface ModelUsage {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  }
  const usageByModel: Record<string, ModelUsage> = {};
  const trackUsage = (model: string, u: Anthropic.Messages.Usage) => {
    const bucket = usageByModel[model] ??= {
      inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    };
    bucket.inputTokens += u.input_tokens;
    bucket.outputTokens += u.output_tokens;
    bucket.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
    bucket.cacheReadTokens += u.cache_read_input_tokens ?? 0;
  };

  let currentModel = TRIAGE_ENABLED ? TRIAGE_MODEL : CLIENT_MODEL;
  let hasEscalated = !TRIAGE_ENABLED; // if triage off, we're "already" at final model
  const toolsUsed: RuntimeOutput["toolsUsed"] = [];
  const attachments: EmailAttachment[] = [];
  let loopCount = 0;
  let finalResponse = "";

  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    loopCount = i + 1;

    const apiResponse = await client.messages.create({
      model: currentModel,
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
      system: systemParam,
      messages,
      tools: cachedTools.length > 0 ? cachedTools : undefined,
    });

    trackUsage(currentModel, apiResponse.usage);

    // Extract text and tool_use blocks
    const textBlocks = apiResponse.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    );
    const toolUseBlocks = apiResponse.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );

    // No tool calls — the model wants to respond.
    if (apiResponse.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      // If Haiku finished research and we haven't escalated yet, escalate to
      // CLIENT_MODEL to write the client-facing response. Haiku's text is
      // discarded so Sonnet regenerates from the full tool context.
      if (!hasEscalated && toolsUsed.length > 0) {
        currentModel = CLIENT_MODEL;
        hasEscalated = true;
        continue;
      }
      finalResponse = textBlocks.map((b) => b.text).join("\n\n");
      break;
    }

    // Split tool calls: built-in vs MCP
    const builtinCalls = toolUseBlocks.filter((b) => BUILTIN_TOOLS.has(b.name));
    const mcpCalls = toolUseBlocks.filter((b) => !BUILTIN_TOOLS.has(b.name));

    // Execute built-in tools
    const builtinResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    let pauseRequested = false;
    let pausePlanText: string | null = null;
    for (const block of builtinCalls) {
      const result = await executeBuiltinTool(
        block.name,
        (block.input as Record<string, unknown>) ?? {},
        ctx.agentId,
        ctx.clientId,
        ctx.agentName,
        ctx.clientName,
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
      if (result.isPause) {
        pauseRequested = true;
        // Capture the plan so it persists in ConversationMessage — otherwise
        // the next run (triggered by the client's APPROVE reply) sees history
        // without the plan items and Claude can't execute it.
        if (block.name === "request_approval") {
          const input = (block.input as { summary?: string; plan_items?: string[] }) ?? {};
          const items = Array.isArray(input.plan_items) ? input.plan_items : [];
          pausePlanText = [
            input.summary ? input.summary : "Here's the plan I'd like to run:",
            ...items.map((s) => `- ${s}`),
            "",
            "Approve and I'll proceed. Reply with changes if you'd like it adjusted.",
          ].join("\n");
        }
      }
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

    // Approval gate fired — run ends here. The client's reply re-enters
    // the runtime with full conversation history; Claude picks up from
    // "plan approved/rejected" and proceeds. Final response embeds the
    // plan items so they persist in ConversationMessage for the next run.
    if (pauseRequested) {
      finalResponse = pausePlanText ?? finalResponse
        ?? "I've drafted a plan and sent it over for your approval. I'll proceed as soon as you reply.";
      break;
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

  // Increment interaction counter (only for billable runs). If this was an
  // overage interaction, also bump overageCount and record an OverageEvent
  // for end-of-month billing.
  if (billable) {
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        interactionCount: { increment: 1 },
        ...(isOverageInteraction && { overageCount: { increment: 1 } }),
      },
    });

    if (isOverageInteraction && agentRecord) {
      const { currentBillingCycleMonth, getOverageRate } = await import("../pricing.js");
      const unitCostCents = getOverageRate(agentRecord.pricingTier as import("../pricing.js").PricingTier);
      await prisma.overageEvent.create({
        data: {
          clientId: agentRecord.clientId,
          agentId,
          unitCostCents,
          billingCycleMonth: currentBillingCycleMonth(),
        },
      });
    }
  }

  const toolErrorCount = toolsUsed.filter((t) => !t.success).length;
  // Log API usage per model — triage routing may have used both Haiku + Sonnet.
  // The "primary" row represents this run for dashboard counts: it carries the
  // tool error attribution and isPrimaryRun=true. Secondary rows (Haiku when
  // Sonnet also wrote) set isPrimaryRun=false so run-level panels don't double.
  const modelsWithUsage = Object.keys(usageByModel);
  const primaryModel = modelsWithUsage.includes(CLIENT_MODEL) ? CLIENT_MODEL : modelsWithUsage[0];
  for (const [model, u] of Object.entries(usageByModel)) {
    const isPrimary = model === primaryModel;
    await logUsage(agentId, "agent_runtime", {
      content: finalResponse,
      model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      totalTokens: u.inputTokens + u.outputTokens + u.cacheCreationTokens + u.cacheReadTokens,
      cacheCreationTokens: u.cacheCreationTokens,
      cacheReadTokens: u.cacheReadTokens,
      toolErrorCount: isPrimary ? toolErrorCount : 0,
      isPrimaryRun: isPrimary,
    });
  }

  const totalInputTokens = Object.values(usageByModel).reduce((s, u) => s + u.inputTokens, 0);
  const totalOutputTokens = Object.values(usageByModel).reduce((s, u) => s + u.outputTokens, 0);
  const totalCacheCreationTokens = Object.values(usageByModel).reduce((s, u) => s + u.cacheCreationTokens, 0);
  const totalCacheReadTokens = Object.values(usageByModel).reduce((s, u) => s + u.cacheReadTokens, 0);

  logger.info("Agent runtime complete", {
    agentId,
    agentName: ctx.agentName,
    loopCount,
    toolsUsed: toolsUsed.length,
    attachments: attachments.length,
    elapsed,
    tokens: totalInputTokens + totalOutputTokens,
    cacheCreationTokens: totalCacheCreationTokens,
    cacheReadTokens: totalCacheReadTokens,
    escalated: hasEscalated,
    modelsUsed: Object.keys(usageByModel),
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
