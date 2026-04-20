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
  clientId: string;
  agentName: string;
  agentEmail: string;
  personality: string;
  purpose: string;
  agentType: string;
  autonomyLevel: string;
  tone: string; // "formal" | "conversational" | "brief" — client-configurable via portal
  clientBusinessName: string;
  clientName: string; // preferredName || contactName || businessName — for email salutations + BaseEmailProps
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
          contactName: true,
          preferredName: true,
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
    clientId: agent.clientId,
    agentName: agent.name,
    agentEmail: agent.email,
    personality: agent.personality,
    purpose: agent.purpose,
    agentType: agent.agentType,
    autonomyLevel: agent.autonomyLevel,
    tone: agent.tone,
    clientBusinessName: agent.client.businessName,
    clientName: agent.client.preferredName ?? agent.client.contactName ?? agent.client.businessName,
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

  // 5b. Client-chosen tone override (layered on top of standards)
  const tone = buildToneSection(ctx);
  if (tone) sections.push(tone);

  // 5c. Autonomy mode rules — govern when to pause for approval vs act directly
  sections.push(buildAutonomySection(ctx));

  // 5d. Proactive insights — optional trailing section in every email when
  // the agent notices something worth flagging beyond the assigned task.
  sections.push(PROACTIVE_INSIGHTS_RULES);

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

function buildToneSection(ctx: AgentContext): string | null {
  // The client set this in the portal. It overrides default register — if
  // they ask for formal, don't use contractions; if brief, keep replies short.
  switch (ctx.tone) {
    case "formal":
      return `## Tone: Formal

The client has asked for a formal register. Use full professional language. Avoid contractions ("cannot" instead of "can't"). Address the client with their full or preferred name, never a nickname they didn't invite. Keep structure clear: opening line states the matter, body explains, closing line states next step. No emoji, no casual asides.`;
    case "brief":
      return `## Tone: Brief

The client has asked for extreme brevity. Every response stays under 100 words unless the task itself requires detail. Lead with the answer or the action taken. Use bullet points over prose. Drop every sentence that isn't load-bearing. Sign off with your name only.`;
    case "conversational":
    default:
      return `## Tone: Conversational

The client has asked for a warm, direct register. Contractions are fine. Write like a smart colleague who gets to the point — friendly but not chatty. You can reference context naturally ("last week you mentioned…"). Keep it human, not corporate.`;
  }
}

function buildAutonomySection(ctx: AgentContext): string {
  // Both modes share the same first rule: mirror back before acting. This
  // catches misunderstandings early — the scope doc calls this non-negotiable.
  const mirrorRule = `## How You Act

**Always mirror back first.** Before acting on any client request, restate what you understood in one sentence ("Got it — you'd like me to X") so misunderstandings surface immediately. This applies in both modes below.`;

  if (ctx.autonomyLevel === "autonomous") {
    return `${mirrorRule}

## Autonomy: AUTONOMOUS

The client has set you to autonomous mode. Execute low- and medium-impact actions directly without asking. Report what you did when you're done.

**Use \`request_approval\` only for high-impact irreversible actions:**
- Large financial decisions (sending money, making purchases over a material threshold)
- Destructive data operations (deleting records, overwriting customer-facing content)
- External communications that commit the client to something binding (contracts, public statements, large outreach campaigns)

Everything else — drafting emails to be sent, updating routine CRM fields, scheduling meetings, running reports — execute directly.

Read-only work (web search, analysis, gathering data) never needs approval, in any mode.`;
  }

  // Default: supervised
  return `${mirrorRule}

## Autonomy: SUPERVISED

The client has set you to supervised mode. You can gather information freely, but **you must call \`request_approval\` before taking any side-effectful action**. This is the client's setting — respect it. Do not bypass it even if a task looks trivial.

**Side-effectful = requires approval:**
- Sending any external email, message, or notification
- Creating, updating, or deleting records in a connected tool (CRM, calendar, sheets, etc.)
- Posting to social media or any public channel
- Committing the client to anything (contracts, purchases, bookings)

**Read-only = never needs approval:**
- Web searches and research
- Analyzing sites, reviewing data, summarizing documents
- Reading from connected tools (checking calendar availability, pulling a CRM record)

**The shape of a supervised turn:**
1. Mirror back the ask.
2. Gather whatever read-only context you need using your tools.
3. Present a concrete plan via \`request_approval({ summary, plan_items })\`. Each plan_item is one discrete action the client can mentally check off.
4. Stop. The client's reply (APPROVE / DISMISS / natural-language modification) will re-enter the conversation and you'll proceed from there.

If the client modifies the plan in their reply ("no, not that third one — try Y instead"), draft the revised plan and call \`request_approval\` again with the updated items.`;
}

const PROACTIVE_INSIGHTS_RULES = `## Proactive Insights

You are a team member, not a task-runner. After you've addressed the client's ask, consider whether anything you noticed during the work is worth flagging — something the client would want to know about even though they didn't ask.

**Surface an insight only when it is ALL of:**
- **Actionable** — the client can do something about it, or it changes a decision they'd otherwise make.
- **Directly relevant** — ties to the client's business, industry, or stated goals. Not a generic observation.
- **Non-obvious** — they don't already know it from their own day-to-day.

Good examples: a competitor move worth tracking, a market shift that changes the calculus of something they're working on, a data anomaly in their metrics, a risk surfacing, an opportunity the conversation just opened up.

Bad examples (do NOT surface): generic industry trends, obvious platitudes, anything you only half-know, or insights for their own sake.

**When you have something worth saying, format it as the LAST section of your response:**

\`\`\`
## Proactive insights
- Short, specific observation tied to an action.
- Another one if you have it.
\`\`\`

1-3 bullets maximum. Each bullet is one short sentence — the email template renders them as a compact highlighted list; long prose dilutes the signal.

**If you have nothing that meets the bar, do not include the section at all.** Empty insights sections are worse than none. The client should trust that when they see "Proactive insights," it's worth reading.

In supervised mode, if an insight implies a concrete action the agent should take now, don't just mention it — call \`request_approval\` with it in the plan_items.`;

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
