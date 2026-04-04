import { analyzeTraffic } from "./tasks/analyze-traffic.js";
import { sendAnalyticsBrief } from "./tasks/send-brief.js";
import logger from "../../shared/logger.js";
import config from "./config.json";

const AGENT_ID = config.agentId;
const CLIENT_ID = config.clientId;
const KYLE_EMAIL = "kyle@ambittmedia.com";

export async function runLens(): Promise<void> {
  logger.info("Lens starting weekly run", { agentId: AGENT_ID });

  try {
    // TODO: Pull real analytics data from PostHog/GA once credentials are connected
    const analyticsData =
      "Pull website analytics for the past 7 days. Include: total visitors, unique sessions, " +
      "page views, bounce rate, avg session duration, traffic sources breakdown, " +
      "top pages by views, conversion funnel (visitor → contact form → booking → client), " +
      "and any notable changes from the previous week.";

    const analysis = await analyzeTraffic(AGENT_ID, CLIENT_ID, analyticsData);

    await sendAnalyticsBrief(AGENT_ID, CLIENT_ID, KYLE_EMAIL, analysis);

    logger.info("Lens weekly run complete", {
      agentId: AGENT_ID,
      urgency: analysis.urgency,
    });
  } catch (error) {
    logger.error("Lens weekly run failed", { agentId: AGENT_ID, error });
    throw error;
  }
}

export default { runLens };
