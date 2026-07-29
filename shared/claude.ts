import Anthropic from "@anthropic-ai/sdk";
import logger from "./logger.js";
import prisma from "./db.js";

function getClient(): Anthropic {
  return new Anthropic();
}

interface ClaudeOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  cacheSystemPrompt?: boolean;
}

interface ClaudeResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

// Model routing — keep in sync with dashboard/src/lib/costs.ts
// Orchestration (Oracle meta-reasoning, agent scaffolding logic) and the
// client-facing runtime both run Opus 5. Orchestration was Opus 4.7 at the
// identical $5/$25, so that tier is a free upgrade; the client tier moved up
// from Sonnet 4.6 ($3/$15) deliberately, because that turn is what a client
// actually reads.
// TRIAGE_MODEL stays Haiku: it runs intermediate tool-selection loops at
// ~5× less than Opus and the engine escalates to CLIENT_MODEL for the final
// client-facing synthesis, so the expensive model only runs on the turn that
// reaches a human.
export const ORCHESTRATION_MODEL = "claude-opus-5";
export const CLIENT_MODEL = "claude-opus-5";
export const TRIAGE_MODEL = "claude-haiku-4-5-20251001";

// Opus 4.7 and later reject `temperature`/`top_p`/`top_k` outright — a request
// carrying one comes back 400 "`temperature` is deprecated for this model".
// This is not cosmetic: it is why every ORCHESTRATION_MODEL call was failing
// before Opus 5 landed, since callClaude sent temperature unconditionally.
// Haiku 4.5 and Sonnet 4.6 still accept it, and intent-classify deliberately
// passes temperature: 0 for a deterministic classifier, so we send the
// parameter per-model rather than dropping it fleet-wide.
const SAMPLING_REJECTED = /^claude-(opus-(4-7|4-8|5)|sonnet-5|fable-5|mythos-5)/;

export function acceptsSampling(model: string): boolean {
  return !SAMPLING_REJECTED.test(model);
}

// Prompt cache is only worth writing above ~1024 tokens. Below this threshold
// we skip cache_control to avoid paying the 1.25× cache-write premium for no hit.
const CACHE_MIN_SYSTEM_CHARS = 4000; // ~1k tokens at 4 chars/token

export async function callClaude(
  options: ClaudeOptions,
  retries = 3
): Promise<ClaudeResponse & { model: string }> {
  const {
    systemPrompt,
    userMessage,
    model = CLIENT_MODEL,
    // Opus 5 thinks by default (Opus 4.7/4.8 did not), and max_tokens caps
    // thinking PLUS response text together. The old 4096 default was sized for
    // a no-thinking Sonnet turn and would now risk truncating mid-answer.
    // Raising a cap costs nothing — billing is on tokens actually produced.
    maxTokens = 16000,
    temperature = 0.7,
    cacheSystemPrompt = true,
  } = options;

  const shouldCache = cacheSystemPrompt && systemPrompt.length >= CACHE_MIN_SYSTEM_CHARS;
  const systemParam: Anthropic.Messages.MessageCreateParams["system"] = shouldCache
    ? [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
    : systemPrompt;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await getClient().messages.create({
        model,
        max_tokens: maxTokens,
        ...(acceptsSampling(model) ? { temperature } : {}),
        system: systemParam,
        messages: [{ role: "user", content: userMessage }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const content = textBlock ? textBlock.text : "";
      const cacheCreationTokens = response.usage.cache_creation_input_tokens ?? 0;
      const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;

      return {
        content,
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens:
          response.usage.input_tokens +
          response.usage.output_tokens +
          cacheCreationTokens +
          cacheReadTokens,
        cacheCreationTokens,
        cacheReadTokens,
      };
    } catch (error) {
      logger.error(`Claude API attempt ${attempt}/${retries} failed`, {
        error,
        model,
      });
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("Claude API call failed after all retries");
}

// Pricing in cents per million tokens — keep in sync with dashboard/src/lib/costs.ts
// Cache write = 1.25× base input. Cache read = 0.10× base input.
// Opus was carried at 1500/7500 ($15/$75) until 2026-07-29. Real Opus 4.7 and
// Opus 5 pricing is $5/$25, so every Opus cost in the dashboard read 3× high
// and budget enforcement tripped against spend that never happened. Sonnet and
// Haiku were always correct. Old model rows stay — historical ApiUsage rows
// still need a price to cost out.
const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 500, output: 2500 },
  "claude-opus-4-7": { input: 500, output: 2500 },
  "claude-sonnet-4-6": { input: 300, output: 1500 },
  "claude-haiku-4-5-20251001": { input: 100, output: 500 },
  "claude-haiku-4-5": { input: 100, output: 500 },
};

export function computeClaudeCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens = 0,
  cacheReadTokens = 0
): number {
  const pricing = CLAUDE_PRICING[model] ?? CLAUDE_PRICING[CLIENT_MODEL];
  const rawCents =
    inputTokens * pricing.input +
    cacheCreationTokens * pricing.input * 1.25 +
    cacheReadTokens * pricing.input * 0.1 +
    outputTokens * pricing.output;
  return Math.ceil(rawCents / 1_000_000);
}

export async function logUsage(
  agentId: string,
  taskType: string,
  response: Partial<ClaudeResponse> & {
    model?: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    toolErrorCount?: number;
    isPrimaryRun?: boolean;
  },
  taskId?: string
): Promise<void> {
  const model = response.model ?? CLIENT_MODEL;
  const cacheCreationTokens = response.cacheCreationTokens ?? 0;
  const cacheReadTokens = response.cacheReadTokens ?? 0;
  const toolErrorCount = response.toolErrorCount ?? 0;
  const isPrimaryRun = response.isPrimaryRun ?? true;
  const costInCents = computeClaudeCostCents(
    model,
    response.inputTokens,
    response.outputTokens,
    cacheCreationTokens,
    cacheReadTokens
  );

  await prisma.apiUsage.create({
    data: {
      agentId,
      model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      totalTokens: response.totalTokens,
      cacheCreationTokens,
      cacheReadTokens,
      toolErrorCount,
      isPrimaryRun,
      costInCents,
      taskType,
      taskId,
    },
  });
}

export default { callClaude, logUsage };
