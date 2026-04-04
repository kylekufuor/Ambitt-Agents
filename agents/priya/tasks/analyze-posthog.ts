import { callGemini } from "../../../shared/gemini.js";
import { callClaude, logUsage } from "../../../shared/claude.js";
import prisma from "../../../shared/db.js";
import logger from "../../../shared/logger.js";
import { buildPriyaSystemPrompt } from "../prompts/system.js";

interface FunnelStep {
  step: string;
  users: number;
  conversionRate: number;
  dropoffRate: number;
}

interface RetentionCohort {
  period: string;
  rate: number;
  previousRate: number;
  trend: "up" | "down" | "stable";
}

interface ProductAnalysis {
  northStar: { metric: string; value: number; previous: number; changePercent: number; trend: string };
  activationFunnel: FunnelStep[];
  retention: RetentionCohort[];
  featureAdoption: Array<{ feature: string; usageRate: number; trend: string }>;
  frictionPoints: Array<{ description: string; severity: string; affectedUsers: number }>;
  recommendation: { title: string; description: string; expectedImpact: string; confidence: string; measurementMethod: string };
  urgency: "green" | "amber" | "red";
  summary: string;
  generatedAt: Date;
}

export async function analyzePostHog(
  agentId: string,
  clientId: string,
  posthogData: string,
  clientName: string,
  productDescription: string,
  northStarMetric: string
): Promise<ProductAnalysis> {
  const systemPrompt = buildPriyaSystemPrompt(clientName, productDescription, northStarMetric);

  // Step 1: Gemini for heavy data processing
  const dataProcessed = await callGemini({
    prompt: posthogData,
    systemInstruction:
      `Analyze this PostHog analytics data for ${clientName}. Calculate:\n` +
      `- North star metric (${northStarMetric}): current value, previous week, % change\n` +
      `- Activation funnel: step-by-step conversion and dropoff rates\n` +
      `- Retention cohorts: D1, D7, D30 rates with trends\n` +
      `- Feature adoption: usage rates per feature\n` +
      `- Friction points: rage clicks, errors, drop-off hotspots\n` +
      `Return structured JSON.`,
  });

  // Step 2: Claude for strategic insight
  const insight = await callClaude({
    systemPrompt,
    userMessage:
      `Based on this product analytics data, generate:\n` +
      `- ONE specific recommendation tied to the north star metric (${northStarMetric})\n` +
      `- Urgency level (green/amber/red)\n` +
      `- Executive summary (2-3 sentences, lead with what matters most)\n\n` +
      `Return JSON with: recommendation (title, description, expectedImpact, confidence, measurementMethod), urgency, summary.\n\n` +
      `Data:\n${dataProcessed.content}`,
  });

  await logUsage(agentId, "analysis", insight);

  let analysis: ProductAnalysis;
  try {
    const data = JSON.parse(dataProcessed.content);
    const strategy = JSON.parse(insight.content);

    analysis = {
      northStar: data.northStar ?? { metric: northStarMetric, value: 0, previous: 0, changePercent: 0, trend: "stable" },
      activationFunnel: data.activationFunnel ?? [],
      retention: data.retention ?? [],
      featureAdoption: data.featureAdoption ?? [],
      frictionPoints: data.frictionPoints ?? [],
      recommendation: strategy.recommendation ?? { title: "Review needed", description: "Insufficient data", expectedImpact: "Unknown", confidence: "low", measurementMethod: "manual" },
      urgency: strategy.urgency ?? "green",
      summary: strategy.summary ?? "Analysis complete",
      generatedAt: new Date(),
    };
  } catch {
    logger.warn("Failed to parse PostHog analysis", { agentId });
    analysis = {
      northStar: { metric: northStarMetric, value: 0, previous: 0, changePercent: 0, trend: "stable" },
      activationFunnel: [],
      retention: [],
      featureAdoption: [],
      frictionPoints: [],
      recommendation: { title: "Parse error", description: "Could not parse analytics data", expectedImpact: "Unknown", confidence: "low", measurementMethod: "manual" },
      urgency: "amber",
      summary: insight.content.slice(0, 500),
      generatedAt: new Date(),
    };
  }

  await prisma.task.create({
    data: {
      agentId,
      clientId,
      taskType: "analysis",
      description: `PostHog analytics for ${clientName}`,
      status: "completed",
      executedAt: new Date(),
      completedAt: new Date(),
      rawOutput: JSON.stringify(analysis),
    },
  });

  logger.info("PostHog analysis complete", { agentId, urgency: analysis.urgency, northStarTrend: analysis.northStar.trend });
  return analysis;
}

export default { analyzePostHog };
