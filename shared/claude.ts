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
}

interface ClaudeResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export async function callClaude(
  options: ClaudeOptions,
  retries = 3
): Promise<ClaudeResponse> {
  const {
    systemPrompt,
    userMessage,
    model = "claude-sonnet-4-20250514",
    maxTokens = 4096,
    temperature = 0.7,
  } = options;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await getClient().messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const content = textBlock ? textBlock.text : "";

      return {
        content,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens:
          response.usage.input_tokens + response.usage.output_tokens,
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

export async function logUsage(
  agentId: string,
  taskType: string,
  response: ClaudeResponse,
  taskId?: string
): Promise<void> {
  const costPerMillionInput = 300; // $3/M input tokens for Sonnet
  const costPerMillionOutput = 1500; // $15/M output tokens for Sonnet
  const costInCents = Math.ceil(
    (response.inputTokens * costPerMillionInput +
      response.outputTokens * costPerMillionOutput) /
      1_000_000
  );

  await prisma.apiUsage.create({
    data: {
      agentId,
      model: "claude-sonnet-4-6",
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      totalTokens: response.totalTokens,
      costInCents,
      taskType,
      taskId,
    },
  });
}

export default { callClaude, logUsage };
