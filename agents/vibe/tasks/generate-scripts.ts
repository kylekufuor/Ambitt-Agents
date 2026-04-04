import { callOpenAI } from "../../../shared/openai.js";
import { callClaude } from "../../../shared/claude.js";
import prisma from "../../../shared/db.js";
import logger from "../../../shared/logger.js";
import { VIBE_SYSTEM_PROMPT } from "../prompts/system.js";

interface Script {
  title: string;
  duration: "15s" | "30s" | "60s";
  hookLine: string;
  scenes: Array<{ sceneNumber: number; action: string; onScreenText: string; duration: string }>;
  soundRecommendation: string;
  cta: string;
}

export async function generateScripts(
  agentId: string,
  clientId: string,
  contentIdeas: Array<{ hook: string; concept: string; contentPillar: string }>
): Promise<Script[]> {
  // GPT-4o for creative script writing
  const scriptResponse = await callOpenAI({
    systemPrompt: VIBE_SYSTEM_PROMPT,
    userMessage:
      `Write ready-to-film TikTok scripts for these content ideas. ` +
      `For each, return: title, duration (15s/30s/60s), hookLine, ` +
      `scenes (array of {sceneNumber, action, onScreenText, duration}), ` +
      `soundRecommendation, cta.\n\n` +
      `Return JSON with "scripts" array.\n\n` +
      `Ideas:\n${JSON.stringify(contentIdeas, null, 2)}`,
    temperature: 0.9,
  });

  // Claude quality gate
  const reviewed = await callClaude({
    systemPrompt: VIBE_SYSTEM_PROMPT,
    userMessage:
      `Review these TikTok scripts. Ensure:\n` +
      `- Hooks stop the scroll in under 2 seconds\n` +
      `- Every script has a clear business purpose\n` +
      `- CTAs are natural, not forced\n` +
      `- On-screen text is punchy and readable\n\n` +
      `Fix any issues and return the improved JSON with "scripts" array.\n\n` +
      `Scripts:\n${scriptResponse.content}`,
  });

  let scripts: Script[] = [];
  try {
    const parsed = JSON.parse(reviewed.content);
    scripts = parsed.scripts ?? [];
  } catch {
    logger.warn("Failed to parse scripts", { agentId });
  }

  await prisma.task.create({
    data: {
      agentId,
      clientId,
      taskType: "script_generation",
      description: `Generated ${scripts.length} TikTok scripts`,
      status: "completed",
      executedAt: new Date(),
      completedAt: new Date(),
      rawOutput: JSON.stringify(scripts),
    },
  });

  logger.info("Script generation complete", { agentId, scriptCount: scripts.length });
  return scripts;
}

export default { generateScripts };
