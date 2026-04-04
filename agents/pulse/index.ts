import { monitorReviews } from "./tasks/monitor-reviews.js";
import { sendReputationBrief } from "./tasks/send-brief.js";
import logger from "../../shared/logger.js";
import config from "./config.json";

const AGENT_ID = config.agentId;
const CLIENT_ID = config.clientId;
const KYLE_EMAIL = "kyle@ambittmedia.com";

export async function runPulse(): Promise<void> {
  logger.info("Pulse starting run", { agentId: AGENT_ID });

  try {
    // TODO: Pull real review data from Google Business, Yelp, social platforms once credentials connected
    const reviewData =
      "Pull all reviews and brand mentions from the past 7 days across: " +
      "Google Business Profile, Yelp, social media mentions (Twitter/X, LinkedIn, Instagram). " +
      "Include: reviewer name, platform, rating, review text, date, whether it's been responded to. " +
      "Also include any brand mentions in industry forums or communities.";

    const report = await monitorReviews(AGENT_ID, CLIENT_ID, reviewData);

    await sendReputationBrief(AGENT_ID, CLIENT_ID, KYLE_EMAIL, report);

    logger.info("Pulse run complete", {
      agentId: AGENT_ID,
      urgency: report.urgency,
      reviewCount: report.reviews.length,
    });
  } catch (error) {
    logger.error("Pulse run failed", { agentId: AGENT_ID, error });
    throw error;
  }
}

export default { runPulse };
