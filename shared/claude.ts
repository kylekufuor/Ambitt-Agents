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
// Orchestration (Oracle meta-reasoning, agent scaffolding logic) uses the
// strongest available model. Client-facing runtime uses the cheaper tier.
// TRIAGE_MODEL runs intermediate tool-selection loops; the runtime engine
// escalates to CLIENT_MODEL for the final client-facing synthesis.
export const ORCHESTRATION_MODEL = "claude-opus-4-7";
export const CLIENT_MODEL = "claude-sonnet-4-6";
export const TRIAGE_MODEL = "claude-haiku-4-5-20251001";

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
    maxTokens = 4096,
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
        temperature,
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
const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 1500, output: 7500 },
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
