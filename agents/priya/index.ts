import { analyzePostHog } from "./tasks/analyze-posthog.js";
import { sendProductBrief } from "./tasks/send-brief.js";
import prisma from "../../shared/db.js";
import logger from "../../shared/logger.js";

export async function runPriya(agentId: string): Promise<void> {
  logger.info("Priya starting run", { agentId });

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { client: true },
  });

  if (!agent || agent.status !== "active") {
    logger.warn("Priya agent not found or inactive", { agentId });
    return;
  }

  const clientName = agent.client.businessName;
  const productDescription = agent.client.businessGoal;
  const northStarMetric = agent.clientNorthStar ?? agent.client.northStarMetric ?? "weekly_active_users";

  try {
    // TODO: Pull real PostHog data via API once credentials are connected
    const posthogData =
      `Pull PostHog analytics for ${clientName} for the past 7 days. Include: ` +
      `north star metric (${northStarMetric}), activation funnel (signup → onboard → first value → retained), ` +
      `retention cohorts (D1, D7, D30), feature usage rates, ` +
      `rage clicks, error events, and session recording highlights.`;

    const analysis = await analyzePostHog(
      agentId,
      agent.clientId,
      posthogData,
      clientName,
      productDescription,
      northStarMetric
    );

    await sendProductBrief(
      agentId,
      agent.clientId,
      agent.client.email,
      analysis,
      clientName,
      productDescription,
      northStarMetric
    );

    // Update agent run timestamp
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        lastRunAt: new Date(),
        totalTasksCompleted: { increment: 1 },
      },
    });

    logger.info("Priya run complete", { agentId, clientName, urgency: analysis.urgency });
  } catch (error) {
    logger.error("Priya run failed", { agentId, clientName, error });
    throw error;
  }
}

export default { runPriya };
