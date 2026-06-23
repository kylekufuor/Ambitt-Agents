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
  maxEmailsPerDay: number | null; // client-set soft cap on outreach emails per working day
  followUpDays: number[]; // client-set follow-up cadence, e.g. [3, 7] days after first contact
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
    maxEmailsPerDay: agent.maxEmailsPerDay ?? null,
    followUpDays: agent.followUpDays ?? [],
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

  // 5c-ii. Client-set operating limits (outreach volume + follow-up cadence).
  // Only rendered when the client has actually set them in the portal.
  const limits = buildOperatingLimitsSection(ctx);
  if (limits) sections.push(limits);

  // 5d. Proactive insights — optional trailing section in every email when
  // the agent notices something worth flagging beyond the assigned task.
  sections.push(PROACTIVE_INSIGHTS_RULES);

  // 5e. Browser tool guidance — when web_search isn't enough.
  sections.push(BROWSER_RULES);

  // 5f. Credential / tool-access hierarchy — OAuth first, 1Password as fallback.
  sections.push(CREDENTIAL_RULES);

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

/**
 * Client-set operating limits — outreach volume cap + follow-up cadence.
 * These come straight from the portal Configure page. They are real
 * constraints the agent must honor; null/[] means the client left it to the
 * agent's judgement, so we render nothing rather than inventing a limit.
 */
function buildOperatingLimitsSection(ctx: AgentContext): string | null {
  const rules: string[] = [];

  if (typeof ctx.maxEmailsPerDay === "number" && ctx.maxEmailsPerDay > 0) {
    rules.push(
      `- **Outreach volume:** Send at most **${ctx.maxEmailsPerDay} outreach email${ctx.maxEmailsPerDay === 1 ? "" : "s"} per working day.** This is the client's explicit cap — never exceed it. If you have more good prospects than the cap allows, send the best ones today and carry the rest to the next working day. Replies, follow-ups to people who wrote back, and internal updates to the client do NOT count against this cap — only new cold outreach does.`
    );
  }

  if (Array.isArray(ctx.followUpDays) && ctx.followUpDays.length > 0) {
    const sorted = [...ctx.followUpDays].sort((a, b) => a - b);
    const ordinal = ["first", "second", "third", "fourth", "fifth"];
    const lines = sorted
      .map((d, i) => `${ordinal[i] ?? `${i + 1}th`} nudge ${d} day${d === 1 ? "" : "s"} after first contact`)
      .join(", then a ");
    rules.push(
      `- **Follow-up cadence:** When a prospect doesn't reply, follow up on this schedule — a ${lines}. Stop following up once they reply (positive or negative) or after the last nudge. Keep each follow-up short and add a new angle; never just "bumping this."`
    );
  }

  if (rules.length === 0) return null;

  return `## Operating Limits (set by the client)

The client has configured how hard you push. Treat these as firm boundaries, not suggestions:

${rules.join("\n")}`;
}

const CREDENTIAL_RULES = `## Getting Tool Access — OAuth First, Then Credentials

When you need a new tool or system to do your job, you have two ways to get access. Try them in this order:

**1. OAuth via \`request_tool_connection\` (PREFERRED).**
Use this when the work can be done through an API. The client clicks one link, authorizes via the provider's standard OAuth screen, and the access is scoped + revocable in seconds. No password is ever shared. This works for: posting to Slack/LinkedIn/Twitter, reading/writing Google Sheets/Calendar/Drive, sending email via Gmail, updating HubSpot/Salesforce/Notion records, querying analytics tools — anything with a real API.

**2. 1Password credentials via \`request_credential\` (FALLBACK ONLY).**
Use this when the work LITERALLY requires being logged in as the user in a browser — there's no API path, or the API doesn't expose the action. Examples: LinkedIn Easy Apply on job posts, applying to jobs on Indeed/Wellfound, anything behind a captcha-protected login page. Be specific about which fields you need (username, password, MFA codes, etc.). The credential goes into the client's 1Password vault; you reference it in browse goals via \`{{secret:op://<vault>/<item>/<field>}}\` and never see the value.

**Always justify your choice.** When you call \`request_credential\`, your \`reason\` field should briefly explain why OAuth wasn't enough — e.g. "LinkedIn's API doesn't support Easy Apply, so I need to log in as you in a browser to actually submit applications." That keeps the trust contract honest with the client.
`;

const BROWSER_RULES = `## When to Use the Browser

You have a \`browse\` tool that opens a real Chrome browser on Browserbase and runs a sub-agent to complete a goal — clicking, navigating, filling forms, extracting from JS-rendered pages.

**Use \`browse\` when:**
- The data lives behind a login, paywall, or interactive UI (\`web_search\` only sees public snippets).
- The page is dynamic / client-side rendered and won't show meaningful content to a fetcher.
- You need to perform an action (submit a form, post a message, update a dashboard).
- A site explicitly blocks scrapers and requires a real browser fingerprint.

**Do NOT use \`browse\` when:**
- A simple \`web_search\` would answer the question — \`browse\` is much slower and more expensive per call.
- You're looking for a public API or RSS feed.
- The information is in a static site and \`web_search\` results already include the snippet.

**Side-effects rule (ties into autonomy mode):** If your \`browse\` call would change external state (submit a form, post anything, modify a record), you must call \`request_approval\` FIRST in supervised mode and wait for the client to approve the plan. Read-only browse tasks (extracting data, looking something up, summarizing a page) don't need approval.

**One goal per call.** Keep the \`goal\` specific and singular — "extract the prices of the top 3 plans on /pricing" beats "research their pricing and competitors." Compound goals burn steps and time out.

**5-minute hard cap, 25-step max** per call. Plan accordingly. If a task is too big, decompose it into multiple browse calls.

**Using credentials inside browse:** When a browse task needs a credential (password, SSN, etc.) that's already in the client's 1Password vault, reference it with a placeholder of the form \`{{secret:op://<vault>/<item>/<field>}}\` inside your goal text. The browse handler resolves the placeholder via 1Password just before the browser starts — you (the orchestrator) never see the plaintext value, and the value is NEVER logged. Example goal: \`"Go to linkedin.com/login, enter the username {{secret:op://Ambitt-Kyle/LinkedIn/username}} and password {{secret:op://Ambitt-Kyle/LinkedIn/password}}, click Sign In, and return the URL of the page after login."\` If the item or field doesn't exist yet, call \`request_credential\` first to provision it and end your turn; the client fills it in, and the next run uses the placeholder.

**Logging into a site that texts/emails a one-time 2FA code:** Some sites send the client a verification code at login. Handle it like a human assistant who texts the client for the code:
1. \`browse\` with \`keep_session_open: true\` and a goal that logs in with the stored credentials and STOPS at the verification-code screen (tell it explicitly: "when you reach the code screen, stop — do not guess a code"). The result hands you a Session id.
2. Call \`request_2fa_code\` with the service name. This emails the client to reply with the code, and your turn ends.
3. When the client replies with the code, call \`browse\` again with \`resume_session_id\` set to that Session id and a goal like "Enter the verification code <code>, finish logging in, then <do the task>." Omit \`keep_session_open\` on this final call so the browser closes when done.
Never ask the client for a 2FA code in any way other than \`request_2fa_code\`, and never try to guess or brute-force a code.`;

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
