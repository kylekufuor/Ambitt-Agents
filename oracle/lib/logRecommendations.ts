import prisma from "../../shared/db.js";
import logger from "../../shared/logger.js";

// ---------------------------------------------------------------------------
// Recommendation Logger — writes recommendations to DB after email send
// ---------------------------------------------------------------------------

export interface RecommendationEntry {
  title: string;
  description: string;
  reasoning: string;
  approveLabel: string;
  approveActionId: string;
}

export interface RecommendationContext {
  agentId: string;
  clientId: string;
  emailType: string;
  baselineMetric?: string;
  expectedOutcome?: string;
}

/**
 * Log an array of recommendations to the Recommendation table in a single
 * transaction. Called by the email router after Resend confirms delivery.
 */
export async function logRecommendations(
  recommendations: RecommendationEntry[],
  context: RecommendationContext
): Promise<void> {
  if (recommendations.length === 0) return;

  try {
    await prisma.$transaction(
      recommendations.map((rec) =>
        prisma.recommendation.create({
          data: {
            agentId: context.agentId,
            clientId: context.clientId,
            emailType: context.emailType,
            title: rec.title,
            description: rec.description,
            reasoning: rec.reasoning,
            approveActionId: rec.approveActionId,
            status: "pending",
            actionItems: [],
            expectedMetric: context.baselineMetric ?? "",
            baselineValue: 0,
            expectedDirection: "up",
          },
        })
      )
    );

    logger.info("Recommendations logged", {
      agentId: context.agentId,
      emailType: context.emailType,
      count: recommendations.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to log recommendations", {
      agentId: context.agentId,
      emailType: context.emailType,
      error: message,
    });
  }
}
