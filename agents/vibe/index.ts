import { detectTrends } from "./tasks/detect-trends.js";
import { generateScripts } from "./tasks/generate-scripts.js";
import { sendContentBrief } from "./tasks/send-brief.js";
import logger from "../../shared/logger.js";
import config from "./config.json";

const AGENT_ID = config.agentId;
const CLIENT_ID = config.clientId;
const KYLE_EMAIL = "kyle@ambittmedia.com";

export async function runVibe(): Promise<void> {
  logger.info("Vibe starting run", { agentId: AGENT_ID });

  try {
    // Step 1: Detect trends
    const brief = await detectTrends(
      AGENT_ID,
      CLIENT_ID,
      "Analyze current TikTok trends in the marketing, business, and agency niche. " +
        "Focus on: trending sounds used by business/marketing creators, " +
        "content formats gaining traction (POV, storytime, tutorials, transitions), " +
        "emerging hashtags in the small business and digital marketing space, " +
        "and viral patterns from the past 7 days."
    );

    if (brief.ideas.length === 0) {
      logger.info("Vibe found no strong content ideas this cycle", { agentId: AGENT_ID });
      return;
    }

    // Step 2: Generate scripts for top ideas
    const topIdeas = brief.ideas
      .filter((idea) => idea.viralityPotential >= 7)
      .slice(0, 3);

    if (topIdeas.length > 0) {
      await generateScripts(AGENT_ID, CLIENT_ID, topIdeas);
    }

    // Step 3: Send brief
    await sendContentBrief(AGENT_ID, CLIENT_ID, KYLE_EMAIL, brief);

    logger.info("Vibe run complete", {
      agentId: AGENT_ID,
      ideas: brief.ideas.length,
      scriptsGenerated: topIdeas.length,
    });
  } catch (error) {
    logger.error("Vibe run failed", { agentId: AGENT_ID, error });
    throw error;
  }
}

export default { runVibe };
