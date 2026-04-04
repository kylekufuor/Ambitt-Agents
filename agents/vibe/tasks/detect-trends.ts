import { callGemini } from "../../../shared/gemini.js";
import { callClaude, logUsage } from "../../../shared/claude.js";
import { callOpenAI } from "../../../shared/openai.js";
import prisma from "../../../shared/db.js";
import logger from "../../../shared/logger.js";
import { VIBE_SYSTEM_PROMPT } from "../prompts/system.js";

interface ContentIdea {
  hook: string;
  concept: string;
  trendReference: string;
  viralityPotential: number;
  cta: string;
  bestPostingTime: string;
  contentPillar: string;
}

interface TrendBrief {
  ideas: ContentIdea[];
  trendingSounds: string[];
  trendingFormats: string[];
  summary: string;
  generatedAt: Date;
}

export async function detectTrends(
  agentId: string,
  clientId: string,
  trendData: string
): Promise<TrendBrief> {
  // Step 1: Gemini for trend data analysis (speed on large data)
  const trendAnalysis = await callGemini({
    prompt: trendData,
    systemInstruction:
      "Analyze TikTok trend data for the marketing/business niche. Identify: " +
      "top 5 trending sounds, top 5 content formats gaining traction, " +
      "emerging hashtags, and content patterns that are growing fastest. " +
      "Return structured JSON with: trendingSounds, trendingFormats, emergingHashtags, patterns.",
  });

  // Step 2: GPT-4o for creative content ideation
  const creativeIdeas = await callOpenAI({
    systemPrompt: VIBE_SYSTEM_PROMPT,
    userMessage:
      `Based on these TikTok trends, generate 5 content ideas for AmbittMedia. ` +
      `Each idea must have: hook, concept, trendReference, viralityPotential (1-10), cta, bestPostingTime, contentPillar. ` +
      `Return JSON with "ideas" array.\n\n` +
      `Trends:\n${trendAnalysis.content}`,
  });

  // Step 3: Claude for quality check and final brief
  const qualityCheck = await callClaude({
    systemPrompt: VIBE_SYSTEM_PROMPT,
    userMessage:
      `Review these content ideas for AmbittMedia's TikTok. Filter out anything that:\n` +
      `- Doesn't align with the brand\n` +
      `- Has a weak hook (won't stop the scroll)\n` +
      `- Chases trends without business purpose\n\n` +
      `Return JSON with:\n` +
      `- "ideas": filtered and improved array of content ideas\n` +
      `- "trendingSounds": top sounds to use\n` +
      `- "trendingFormats": top formats\n` +
      `- "summary": 2-3 sentence executive summary\n\n` +
      `Ideas to review:\n${creativeIdeas.content}\n\nTrend data:\n${trendAnalysis.content}`,
  });

  await logUsage(agentId, "trend_detection", qualityCheck);

  let brief: TrendBrief;
  try {
    const parsed = JSON.parse(qualityCheck.content);
    brief = {
      ideas: parsed.ideas ?? [],
      trendingSounds: parsed.trendingSounds ?? [],
      trendingFormats: parsed.trendingFormats ?? [],
      summary: parsed.summary ?? "Trend analysis complete",
      generatedAt: new Date(),
    };
  } catch {
    logger.warn("Failed to parse trend brief", { agentId });
    brief = {
      ideas: [],
      trendingSounds: [],
      trendingFormats: [],
      summary: qualityCheck.content.slice(0, 500),
      generatedAt: new Date(),
    };
  }

  await prisma.task.create({
    data: {
      agentId,
      clientId,
      taskType: "trend_detection",
      description: "TikTok trend detection and content ideation",
      status: "completed",
      executedAt: new Date(),
      completedAt: new Date(),
      rawOutput: JSON.stringify(brief),
    },
  });

  logger.info("Trend detection complete", { agentId, ideasCount: brief.ideas.length });
  return brief;
}

export default { detectTrends };
