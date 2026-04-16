import prisma from "../db.js";
import logger from "../logger.js";
import { decrypt } from "../encryption.js";
import type { MCPToolInfo } from "../mcp/types.js";

// ---------------------------------------------------------------------------
// Prompt Assembler — builds system prompts dynamically per agent
// ---------------------------------------------------------------------------
// Every agent gets a unique system prompt assembled from:
// 1. First Truth Principle (always first — no exceptions)
// 2. Agent identity (name, personality, purpose, domain)
// 3. Client context (business, goals, preferences, memory)
// 4. Tool expertise (what tools are connected, what they can do)
// 5. Communication standards (email format, confirmation, clarification)
// 6. Conversation history summary
// ---------------------------------------------------------------------------

export interface AgentContext {
  agentId: string;
  agentName: string;
  agentEmail: string;
  personality: string;
  purpose: string;
  agentType: string;
  autonomyLevel: string;
  clientBusinessName: string;
  clientIndustry: string;
  clientBusinessGoal: string;
  clientBrandVoice: string;
  clientNorthStar: string | null;
  clientPreferredChannel: string;
  clientMemory: Record<string, unknown>;
  tools: MCPToolInfo[];
  recentMessages: Array<{ role: string; content: string; createdAt: Date }>;
}

/**
 * Load all context needed to build an agent's system prompt.
 */
export async function loadAgentContext(agentId: string): Promise<AgentContext> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      client: {
        select: {
          businessName: true,
          industry: true,
          businessGoal: true,
          brandVoice: true,
          northStarMetric: true,
          preferredChannel: true,
        },
      },
    },
  });

  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  if (!agent.client) throw new Error(`Agent ${agentId} has no client`);

  // Decrypt and parse memory object safely — memory is AES-GCM encrypted at rest
  let clientMemory: Record<string, unknown> = {};
  if (agent.clientMemoryObject) {
    try {
      const plaintext = decrypt(agent.clientMemoryObject);
      clientMemory = JSON.parse(plaintext || "{}");
    } catch (error) {
      logger.warn("Failed to decrypt/parse client memory object", { agentId, error });
    }
  }

  // Load recent conversation history (last 20 messages for context window)
  const recentMessages = await prisma.conversationMessage.findMany({
    where: { agentId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { role: true, content: true, createdAt: true },
  });

  return {
    agentId,
    agentName: agent.name,
    agentEmail: agent.email,
    personality: agent.personality,
    purpose: agent.purpose,
    agentType: agent.agentType,
    autonomyLevel: agent.autonomyLevel,
    clientBusinessName: agent.client.businessName,
    clientIndustry: agent.client.industry,
    clientBusinessGoal: agent.client.businessGoal,
    clientBrandVoice: agent.client.brandVoice,
    clientNorthStar: agent.client.northStarMetric ?? agent.clientNorthStar,
    clientPreferredChannel: agent.client.preferredChannel,
    clientMemory,
    tools: [], // populated externally by tool-bridge
    recentMessages: recentMessages.reverse(),
  };
}

/**
 * Assemble the full system prompt for an agent.
 */
export function assembleSystemPrompt(ctx: AgentContext): string {
  const sections: string[] = [];

  // 1. First Truth Principle — always first
  sections.push(FIRST_TRUTH_PRINCIPLE);

  // 2. Agent identity
  sections.push(buildIdentitySection(ctx));

  // 3. Client context
  sections.push(buildClientSection(ctx));

  // 4. Operating manual (SOPs uploaded at scaffold time)
  const manual = buildOperatingManualSection(ctx);
  if (manual) sections.push(manual);

  // 5. Tool expertise
  if (ctx.tools.length > 0) {
    sections.push(buildToolSection(ctx));
  }

  // 5. Communication standards
  sections.push(COMMUNICATION_STANDARDS);

  // 6. Clarification rules
  sections.push(CLARIFICATION_RULES);

  // 7. Conversation context
  if (ctx.recentMessages.length > 0) {
    sections.push(buildConversationContext(ctx));
  }

  return sections.join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Prompt sections
// ---------------------------------------------------------------------------

const FIRST_TRUTH_PRINCIPLE = `## First Truth Principle

You exist to make the client's business genuinely better. Not to generate output. Not to look busy. To create real, measurable value. Before every communication, every task, every action — ask one question: does this make the business better? If the answer is no, it doesn't happen.

You belong fully to the client you serve. You learn their voice, earn their trust, and operate as a true member of their team. Value is not a feature. It is the only reason you exist.`;

function buildIdentitySection(ctx: AgentContext): string {
  return `## Who You Are

You are ${ctx.agentName}, an AI agent at Ambitt Agents.
Email: ${ctx.agentEmail}
Personality: ${ctx.personality}
Purpose: ${ctx.purpose}
Domain: ${ctx.agentType}
Autonomy level: ${ctx.autonomyLevel}

You are a dedicated member of the ${ctx.clientBusinessName} team. You communicate directly with the client via email. You sign every message as ${ctx.agentName}.`;
}

// Max characters for the memory section in the system prompt
const MAX_MEMORY_CHARS = 8_000;

function buildClientSection(ctx: AgentContext): string {
  // Separate document contents from general memory — docs are too large for system prompt
  const filteredMemory = Object.entries(ctx.clientMemory)
    .filter(([k, v]) => {
      if (k === "documentContents") return false; // full text — never in system prompt
      if (k === "sops") return false; // rendered separately in Operating Manual section
      if (v === null || v === undefined || v === "") return false;
      return true;
    });

  // Format documents as summaries only
  const docs = ctx.clientMemory.documents as Array<{ filename: string; summary: string }> | undefined;
  const docLines = docs && docs.length > 0
    ? `\nUploaded documents (${docs.length}):\n${docs.map((d) => `- ${d.filename}: ${d.summary.slice(0, 200)}`).join("\n")}`
    : "";

  // Format other memory entries
  const memoryLines = filteredMemory
    .filter(([k]) => k !== "documents") // already handled above
    .map(([k, v]) => {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      return `- ${k}: ${val.slice(0, 500)}`;
    })
    .join("\n");

  let memorySection = "";
  if (memoryLines || docLines) {
    memorySection = `\nClient memory:\n${memoryLines}${docLines}`;
    // Cap total memory size
    if (memorySection.length > MAX_MEMORY_CHARS) {
      memorySection = memorySection.slice(0, MAX_MEMORY_CHARS) + "\n[... memory truncated]";
    }
  }

  return `## Your Client

Business: ${ctx.clientBusinessName}
Industry: ${ctx.clientIndustry}
Goal: ${ctx.clientBusinessGoal}
Brand voice: ${ctx.clientBrandVoice}
North star metric: ${ctx.clientNorthStar ?? "Not set"}
Preferred channel: ${ctx.clientPreferredChannel}${memorySection}`;
}

// Max characters per SOP when injected into the prompt.
// Full text, separate from the 8K ambient-memory cap — SOPs are load-bearing.
const MAX_SOP_CHARS = 40_000;

interface SOPEntry {
  filename: string;
  text: string;
  uploadedAt?: string;
}

function buildOperatingManualSection(ctx: AgentContext): string | null {
  const raw = ctx.clientMemory.sops;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const sops = raw as SOPEntry[];
  const blocks = sops.map((sop) => {
    let text = sop.text ?? "";
    let trailer = "";
    if (text.length > MAX_SOP_CHARS) {
      text = text.slice(0, MAX_SOP_CHARS);
      trailer = `\n\n[... SOP truncated at ${MAX_SOP_CHARS.toLocaleString()} characters]`;
    }
    return `### ${sop.filename}\n\n${text}${trailer}`;
  });

  return `## Your Operating Manual

The following documents were provided by the client as your authoritative playbook. They describe exactly how the client does this work today and how they expect you to do it. Treat them as load-bearing instructions — not background context. When a procedure in the manual conflicts with a guess you'd otherwise make, the manual wins.

${blocks.join("\n\n---\n\n")}`;
}

function buildToolSection(ctx: AgentContext): string {
  const toolsByServer = new Map<string, MCPToolInfo[]>();
  for (const tool of ctx.tools) {
    const list = toolsByServer.get(tool.serverId) ?? [];
    list.push(tool);
    toolsByServer.set(tool.serverId, list);
  }

  const toolDescriptions = Array.from(toolsByServer.entries())
    .map(([serverId, tools]) => {
      const toolList = tools
        .map((t) => `  - ${t.name}${t.description ? `: ${t.description}` : ""}`)
        .join("\n");
      return `### ${serverId} (${tools.length} tools)\n${toolList}`;
    })
    .join("\n\n");

  return `## Your Tools

You have access to the following tools via MCP connections. Use them to take real actions on behalf of the client. Always confirm what you did after executing a tool action.

${toolDescriptions}

Rules:
- Use tools when the client's request requires action, not just advice.
- After every tool action, confirm to the client: what you did, what the result was, and any next steps.
- If a tool call fails, explain the issue clearly and suggest alternatives.
- Never fabricate tool results. If you can't execute something, say so.`;
}

const COMMUNICATION_STANDARDS = `## Communication Standards

Every response follows this structure:
1. Direct answer or action taken — lead with the result, not the process
2. Key details — only what the client needs to know
3. Next steps — what happens next or what you need from them

Rules:
- Write in plain English. No jargon unless the client uses it first.
- Be concise. Under 200 words for routine responses.
- Be specific. Reference their business by name, their metrics, their context.
- Sign every message: "— [Your Name], [Your Role] at Ambitt"
- When reporting actions taken, include: what was done, to whom/where, timestamp, and result.`;

const CLARIFICATION_RULES = `## When to Ask for Clarification

When a request is ambiguous, ask for clarification rather than guessing. Specifically:
- If the client references a person/entity that could match multiple records, ask which one.
- If the request type is unclear (e.g., "send an update" — what kind?), ask.
- If critical details are missing (recipient, amount, date), ask.

Format clarification requests as:
"I want to make sure I get this right. A few questions:
- [Question 1]
- [Question 2]"

Never guess on: recipient identity, financial amounts, or deletion/cancellation actions.
It is always safe to guess on: tone, formatting, and minor details you can correct later.`;

function buildConversationContext(ctx: AgentContext): string {
  const lines = ctx.recentMessages
    .slice(-10) // last 10 for prompt size
    .map((m) => {
      const sender = m.role === "agent" ? ctx.agentName : "Client";
      return `${sender}: ${m.content.slice(0, 500)}`;
    })
    .join("\n\n");

  return `## Recent Conversation

${lines}`;
}
