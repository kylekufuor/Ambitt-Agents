import { callGemini } from "../../../shared/gemini.js";
import { callClaude, logUsage } from "../../../shared/claude.js";
import prisma from "../../../shared/db.js";
import logger from "../../../shared/logger.js";
import { PULSE_SYSTEM_PROMPT } from "../prompts/system.js";

interface Review {
  platform: string;
  author: string;
  rating: number;
  text: string;
  date: string;
  responded: boolean;
}

interface SentimentScore {
  overall: number;
  positive: number;
  neutral: number;
  negative: number;
}

interface ReputationReport {
  reviews: Review[];
  sentiment: SentimentScore;
  avgRating: number;
  ratingTrend: "up" | "down" | "stable";
  topPositiveThemes: string[];
  topNegativeThemes: string[];
  urgentItems: Review[];
  draftedResponses: Array<{ reviewAuthor: string; response: string }>;
  recommendation: { title: string; description: string; confidence: string };
  urgency: "green" | "amber" | "red";
  summary: string;
  generatedAt: Date;
}

export async function monitorReviews(
  agentId: string,
  clientId: string,
  reviewData: string
): Promise<ReputationReport> {
  // Step 1: Gemini for sentiment analysis on review data
  const sentimentAnalysis = await callGemini({
    prompt: reviewData,
    systemInstruction:
      "Analyze these business reviews. Calculate: overall sentiment score (0-100), " +
      "percentage positive/neutral/negative, average rating, rating trend, " +
      "top 3 positive themes, top 3 negative themes. " +
      "Flag any reviews that need urgent attention (1-2 star, unresponded, or containing threats). " +
      "Return structured JSON.",
  });

  // Step 2: Claude for response drafting and strategic recommendation
  const strategic = await callClaude({
    systemPrompt: PULSE_SYSTEM_PROMPT,
    userMessage:
      `Based on this reputation analysis, do three things:\n` +
      `1. Draft responses for any unaddressed reviews (especially negative ones)\n` +
      `2. Generate ONE actionable recommendation to improve reputation\n` +
      `3. Assess urgency level (green/amber/red)\n\n` +
      `Return JSON with:\n` +
      `- "draftedResponses": [{reviewAuthor, response}]\n` +
      `- "recommendation": {title, description, confidence}\n` +
      `- "urgency": "green"|"amber"|"red"\n` +
      `- "summary": 2-3 sentence executive summary\n\n` +
      `Analysis:\n${sentimentAnalysis.content}`,
  });

  await logUsage(agentId, "review_monitoring", strategic);

  let report: ReputationReport;
  try {
    const sentiment = JSON.parse(sentimentAnalysis.content);
    const strategy = JSON.parse(strategic.content);

    report = {
      reviews: sentiment.reviews ?? [],
      sentiment: sentiment.sentiment ?? { overall: 0, positive: 0, neutral: 0, negative: 0 },
      avgRating: sentiment.avgRating ?? 0,
      ratingTrend: sentiment.ratingTrend ?? "stable",
      topPositiveThemes: sentiment.topPositiveThemes ?? [],
      topNegativeThemes: sentiment.topNegativeThemes ?? [],
      urgentItems: sentiment.urgentItems ?? [],
      draftedResponses: strategy.draftedResponses ?? [],
      recommendation: strategy.recommendation ?? {
        title: "Review needed",
        description: "Manual review recommended",
        confidence: "low",
      },
      urgency: strategy.urgency ?? "green",
      summary: strategy.summary ?? "Reputation check complete",
      generatedAt: new Date(),
    };
  } catch {
    logger.warn("Failed to parse reputation report", { agentId });
    report = {
      reviews: [],
      sentiment: { overall: 0, positive: 0, neutral: 0, negative: 0 },
      avgRating: 0,
      ratingTrend: "stable",
      topPositiveThemes: [],
      topNegativeThemes: [],
      urgentItems: [],
      draftedResponses: [],
      recommendation: {
        title: "Parse error",
        description: "Could not parse review data",
        confidence: "low",
      },
      urgency: "amber",
      summary: strategic.content.slice(0, 500),
      generatedAt: new Date(),
    };
  }

  await prisma.task.create({
    data: {
      agentId,
      clientId,
      taskType: "review_monitoring",
      description: "Reputation monitoring and review analysis",
      status: "completed",
      executedAt: new Date(),
      completedAt: new Date(),
      rawOutput: JSON.stringify(report),
    },
  });

  logger.info("Review monitoring complete", {
    agentId,
    urgency: report.urgency,
    reviewCount: report.reviews.length,
    urgentCount: report.urgentItems.length,
  });

  return report;
}

export default { monitorReviews };
