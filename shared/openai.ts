import OpenAI from "openai";
import logger from "./logger.js";
import prisma from "./db.js";

function getClient(): OpenAI {
  return new OpenAI();
}

interface OpenAIOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface OpenAIResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export async function callOpenAI(
  options: OpenAIOptions,
  retries = 3
): Promise<OpenAIResponse> {
  const {
    systemPrompt,
    userMessage,
    model = "gpt-4o",
    maxTokens = 4096,
    temperature = 0.8,
  } = options;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await getClient().chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });

      const content = response.choices[0]?.message?.content ?? "";
      const usage = response.usage;

      return {
        content,
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      };
    } catch (error) {
      logger.error(`OpenAI API attempt ${attempt}/${retries} failed`, {
        error,
        model,
      });
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("OpenAI API call failed after all retries");
}

export async function logUsage(
  agentId: string,
  taskType: string,
  response: OpenAIResponse,
  taskId?: string
): Promise<void> {
  // GPT-4o pricing: ~$2.50/M input, ~$10/M output
  const costInCents = Math.ceil(
    (response.inputTokens * 250 + response.outputTokens * 1000) / 1_000_000
  );

  await prisma.apiUsage.create({
    data: {
      agentId,
      model: "gpt-4o",
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      totalTokens: response.totalTokens,
      costInCents,
      taskType,
      taskId,
    },
  });
}

export default { callOpenAI, logUsage };
