import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "./logger.js";
import prisma from "./db.js";

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key);
}

interface GeminiOptions {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface GeminiResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export async function callGemini(
  options: GeminiOptions,
  retries = 3
): Promise<GeminiResponse> {
  const {
    prompt,
    systemInstruction,
    model = "gemini-2.0-flash",
    maxTokens = 4096,
    temperature = 0.7,
  } = options;

  const client = getClient();
  const genModel = client.getGenerativeModel({
    model,
    systemInstruction,
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await genModel.generateContent(prompt);
      const response = result.response;
      const content = response.text();
      const usage = response.usageMetadata;

      return {
        content,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      };
    } catch (error) {
      logger.error(`Gemini API attempt ${attempt}/${retries} failed`, {
        error,
        model,
      });
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("Gemini API call failed after all retries");
}

export async function logUsage(
  agentId: string,
  taskType: string,
  response: GeminiResponse,
  taskId?: string
): Promise<void> {
  // Gemini Flash pricing: ~$0.075/M input, ~$0.30/M output
  const costInCents = Math.ceil(
    (response.inputTokens * 7.5 + response.outputTokens * 30) / 1_000_000
  );

  await prisma.apiUsage.create({
    data: {
      agentId,
      model: "gemini",
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      totalTokens: response.totalTokens,
      costInCents,
      taskType,
      taskId,
    },
  });
}

export default { callGemini, logUsage };
