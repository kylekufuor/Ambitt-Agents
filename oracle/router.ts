import {
  callClaude,
  logUsage as logClaudeUsage,
  ORCHESTRATION_MODEL,
  CLIENT_MODEL,
} from "../shared/claude.js";
import { callGemini, logUsage as logGeminiUsage } from "../shared/gemini.js";
import { callOpenAI, logUsage as logOpenAIUsage } from "../shared/openai.js";
import logger from "../shared/logger.js";

type TaskType =
  | "client_conversation"
  | "orchestration"
  | "analysis"
  | "creative"
  | "general";

interface RouteResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function resolveModel(taskType: TaskType): "claude" | "gemini" | "openai" {
  switch (taskType) {
    case "client_conversation":
    case "orchestration":
    case "general":
      return "claude";
    case "analysis":
      return "gemini";
    case "creative":
      return "openai";
  }
}

export async function routeTask(
  taskType: TaskType,
  systemPrompt: string,
  userMessage: string,
  agentId?: string
): Promise<RouteResult> {
  const target = resolveModel(taskType);

  // Oracle orchestration gets the strongest model; client-facing stays cheap.
  const claudeModel =
    taskType === "orchestration" ? ORCHESTRATION_MODEL : CLIENT_MODEL;

  try {
    switch (target) {
      case "claude": {
        const response = await callClaude({ systemPrompt, userMessage, model: claudeModel });
        if (agentId) await logClaudeUsage(agentId, taskType, response);
        return { ...response, model: claudeModel };
      }
      case "gemini": {
        const response = await callGemini({
          prompt: userMessage,
          systemInstruction: systemPrompt,
        });
        if (agentId) await logGeminiUsage(agentId, taskType, response);
        return { ...response, model: "gemini" };
      }
      case "openai": {
        const response = await callOpenAI({ systemPrompt, userMessage });
        if (agentId) await logOpenAIUsage(agentId, taskType, response);
        return { ...response, model: "gpt-4o" };
      }
    }
  } catch (error) {
    // Fallback to Claude if other models fail
    if (target !== "claude") {
      logger.warn(`${target} failed, falling back to Claude`, {
        taskType,
        error,
      });
      const response = await callClaude({ systemPrompt, userMessage, model: claudeModel });
      if (agentId) await logClaudeUsage(agentId, taskType, response);
      return { ...response, model: claudeModel };
    }
    throw error;
  }
}

export default { routeTask };
