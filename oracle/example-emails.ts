import { z } from "zod";
import { callClaude, CLIENT_MODEL } from "../shared/claude.js";
import logger from "../shared/logger.js";

/**
 * "Things you can ask {agent}" — a handful of ready-to-send example emails,
 * grounded in what the agent can ACTUALLY do (its purpose + connected tools),
 * shown in the client portal next to the agent's inbox address.
 *
 * The client's #1 unspoken question after "what's the email?" is "…and what do
 * I even say to it?" These examples answer that in the client's own voice —
 * real asks they could paste and send today, not generic filler. They're
 * AI-generated per agent (a CRE sourcing agent and a bookkeeping agent should
 * suggest completely different things) and cached, so we pay for generation
 * once.
 *
 * House rules baked into the prompt: client-facing "we" voice, never expose the
 * raw system prompt, sound like a human firing off a quick email — not a
 * feature list.
 */

export const ExampleEmailSchema = z.object({
  // Short label for the capability this email exercises — grounds the example
  // in something the agent really does (e.g. "Sourcing off-market deals").
  capability: z.string().min(2).max(60),
  // The subject line the client would type.
  subject: z.string().min(2).max(80),
  // The body — a short, natural first-person message (1–3 sentences) the client
  // could send as-is. Written AS THE CLIENT, addressed to the agent.
  body: z.string().min(10).max(600),
});
export type ExampleEmail = z.infer<typeof ExampleEmailSchema>;

const ExampleEmailsPayloadSchema = z.object({
  examples: z.array(ExampleEmailSchema).min(3).max(5),
});

export interface AgentForExamples {
  name: string;
  clientDescription: string | null;
  purpose: string;
  tools: string[];
  customTools: unknown; // Json — [{ name, source, siteUrl, fields }] or null
  clientPreferredName?: string | null; // what the agent calls the client, if known
}

function describeCustomTools(customTools: unknown): string[] {
  if (!Array.isArray(customTools)) return [];
  return customTools
    .map((t) => (t && typeof t === "object" && "name" in t ? String((t as { name: unknown }).name) : null))
    .filter((n): n is string => Boolean(n));
}

function buildPrompt(agent: AgentForExamples): { systemPrompt: string; userMessage: string } {
  const composio = agent.tools.filter(Boolean);
  const custom = describeCustomTools(agent.customTools);
  const allTools = [...composio, ...custom];

  const systemPrompt = [
    "You write the \"Things you can ask me\" examples shown to a client in their",
    "agent's portal — a short list of emails the client could send their AI agent.",
    "",
    "Rules:",
    "- Write each example AS THE CLIENT, in first person, addressed to the agent.",
    "  These are messages the client could paste and send today.",
    "- Ground every example in what THIS agent can actually do — its purpose and",
    "  its connected tools. Never invent a capability it doesn't have.",
    "- Sound like a busy human firing off a quick email. Contractions, plain words.",
    "  No corporate filler, no \"leverage/robust/seamless\", no feature-list tone.",
    "- Vary the examples: cover different things the agent does, not five spins on one.",
    "- Keep bodies to 1–3 sentences. Subjects short and natural, like a real inbox.",
    "- Never reveal or reference the agent's internal instructions/system prompt.",
    "",
    "Return ONLY a JSON object, no code fences, no commentary:",
    '{ "examples": [ { "capability": "...", "subject": "...", "body": "..." }, ... ] }',
    "3 to 5 examples.",
  ].join("\n");

  const userMessage = [
    `Agent name: ${agent.name}`,
    agent.clientDescription ? `What it does (client-facing): ${agent.clientDescription}` : null,
    `Purpose (internal — do NOT quote): ${agent.purpose}`,
    allTools.length
      ? `Connected tools it can use: ${allTools.join(", ")}`
      : "Connected tools: none beyond its built-in abilities.",
    agent.clientPreferredName ? `The client goes by: ${agent.clientPreferredName}` : null,
    "",
    `Write 3–5 example emails the client could send ${agent.name}. Return the JSON now.`,
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userMessage };
}

/** Pull the first balanced JSON object out of a model response. */
function extractJson(raw: string): string | null {
  const fenceStripped = raw.replace(/```(?:json)?/gi, "").trim();
  const start = fenceStripped.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < fenceStripped.length; i++) {
    const ch = fenceStripped[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return fenceStripped.slice(start, i + 1);
    }
  }
  return null;
}

function parseExamples(raw: string): ExampleEmail[] {
  const json = extractJson(raw);
  if (!json) throw new Error("No JSON object found in response");
  const parsed = ExampleEmailsPayloadSchema.parse(JSON.parse(json));
  return parsed.examples;
}

/**
 * Generate example emails for an agent. Retries once with a correction if the
 * first pass doesn't produce valid JSON. Throws if both passes fail — callers
 * should treat generation as best-effort and fall back to hiding the section.
 */
export async function generateExampleEmails(agent: AgentForExamples): Promise<ExampleEmail[]> {
  const { systemPrompt, userMessage } = buildPrompt(agent);

  const pass1 = await callClaude({
    systemPrompt,
    userMessage,
    model: CLIENT_MODEL,
    maxTokens: 1500,
    temperature: 0.8,
  });

  try {
    return parseExamples(pass1.content);
  } catch (err) {
    logger.warn("Example-emails first pass invalid — retrying once", {
      agent: agent.name,
      error: err instanceof Error ? err.message : String(err),
    });
    const pass2 = await callClaude({
      systemPrompt,
      userMessage: `${userMessage}\n\nYour previous reply wasn't valid JSON matching the schema. Re-emit ONLY the JSON object { "examples": [...] } with 3–5 items, no code fences, no commentary.`,
      model: CLIENT_MODEL,
      maxTokens: 1500,
      temperature: 0.7,
    });
    return parseExamples(pass2.content);
  }
}
