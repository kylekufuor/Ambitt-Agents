import { callGemini, logUsage as logGeminiUsage } from "../../../shared/gemini.js";
import { callClaude, logUsage as logClaudeUsage } from "../../../shared/claude.js";
import prisma from "../../../shared/db.js";
import logger from "../../../shared/logger.js";
import { LENS_SYSTEM_PROMPT } from "../prompts/system.js";

interface MetricSnapshot {
  metric: string;
  current: number;
  previous: number;
  changePercent: number;
  trend: "up" | "down" | "flat";
}

interface TrafficAnalysis {
  metrics: MetricSnapshot[];
  topPages: Array<{ page: string; views: number; bounceRate: number }>;
  funnelDropoff: string;
  recommendation: {
    title: string;
    description: string;
    expectedImpact: string;
    confidence: "low" | "medium" | "high";
  };
  urgency: "green" | "amber" | "red";
  summary: string;
  generatedAt: Date;
}

export async function analyzeTraffic(
  agentId: string,
  clientId: string,
  analyticsData: string
): Promise<TrafficAnalysis> {
  // Step 1: Gemini for data crunching (speed + cost on large datasets)
  const dataAnalysis = await callGemini({
    prompt: analyticsData,
    systemInstruction:
      "Analyze this website analytics data. Calculate week-over-week changes for all key metrics. " +
      "Identify the biggest funnel dropoff point. Find the top 5 pages by traffic and the bottom 5 by bounce rate. " +
      "Return structured JSON with: metrics (array of {metric, current, previous, changePercent, trend}), " +
      "topPages (array of {page, views, bounceRate}), funnelDropoff (string description).",
  });

  // Step 2: Claude for insight generation and recommendation
  const insight = await callClaude({
    systemPrompt: LENS_SYSTEM_PROMPT,
    userMessage:
      `Based on this analytics analysis, generate ONE specific actionable recommendation. ` +
      `Return JSON with:\n` +
      `- "recommendation": {title, description, expectedImpact, confidence}\n` +
      `- "urgency": "green" | "amber" | "red"\n` +
      `- "summary": 2-3 sentence executive summary leading with the most important insight\n\n` +
      `Analysis:\n${dataAnalysis.content}`,
  });

  await logClaudeUsage(agentId, "analysis", insight);

  let analysis: TrafficAnalysis;
  try {
    const data = JSON.parse(dataAnalysis.content);
    const insights = JSON.parse(insight.content);

    analysis = {
      metrics: data.metrics ?? [],
      topPages: data.topPages ?? [],
      funnelDropoff: data.funnelDropoff ?? "Unknown",
      recommendation: insights.recommendation ?? {
        title: "Review needed",
        description: "Insufficient data for recommendation",
        expectedImpact: "Unknown",
        confidence: "low" as const,
      },
      urgency: insights.urgency ?? "green",
      summary: insights.summary ?? "Analysis complete",
      generatedAt: new Date(),
    };
  } catch {
    logger.warn("Failed to parse analytics output", { agentId });
    analysis = {
      metrics: [],
      topPages: [],
      funnelDropoff: "Parse error",
      recommendation: {
        title: "Manual review needed",
        description: "Could not parse analytics data automatically",
        expectedImpact: "Unknown",
        confidence: "low",
      },
      urgency: "amber",
      summary: insight.content.slice(0, 500),
      generatedAt: new Date(),
    };
  }

  // Log to DB before sending
  await prisma.task.create({
    data: {
      agentId,
      clientId,
      taskType: "analysis",
      description: "Weekly traffic analysis",
      status: "completed",
      executedAt: new Date(),
      completedAt: new Date(),
      rawOutput: JSON.stringify(analysis),
    },
  });

  logger.info("Traffic analysis complete", {
    agentId,
    urgency: analysis.urgency,
    metricsCount: analysis.metrics.length,
  });

  return analysis;
}

export default { analyzeTraffic };
