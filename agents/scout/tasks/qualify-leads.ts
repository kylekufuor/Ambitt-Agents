// DEPRECATED — v1 task runner. Use shared/runtime/engine.ts instead.
import { callClaude, logUsage } from "../../../shared/claude.js";
import { callGemini } from "../../../shared/gemini.js";
import prisma from "../../../shared/db.js";
import logger from "../../../shared/logger.js";
import { SCOUT_SYSTEM_PROMPT } from "../prompts/system.js";

interface Lead {
  businessName: string;
  website: string | null;
  industry: string;
  sizeEstimate: string;
  onlinePresenceScore: number;
  icpFitScore: number;
  keyPainPoint: string;
  outreachAngle: string;
  decisionMaker: string | null;
  contactMethod: string;
  confidence: "low" | "medium" | "high";
}

interface LeadBrief {
  leads: Lead[];
  summary: string;
  generatedAt: Date;
}

const SEARCH_QUERIES = [
  "{industry} businesses near {location} with bad website",
  "{industry} {location} no social media presence",
  "new {industry} businesses {location} recently opened",
  "{industry} {location} low google reviews",
];

export async function qualifyLeads(
  agentId: string,
  clientId: string,
  targetIndustries: string[],
  targetLocation: string
): Promise<LeadBrief> {
  // Step 1: Use web search tool to find potential leads
  const allSearchResults: string[] = [];

  for (const industry of targetIndustries) {
    for (const queryTemplate of SEARCH_QUERIES) {
      const query = queryTemplate
        .replace("{industry}", industry)
        .replace("{location}", targetLocation);

      // DEPRECATED: was using runTool("mock-search", ...) — v1 tool system removed
      logger.warn("qualify-leads is deprecated — use agent runtime instead", { query });
      break;
    }
  }

  if (allSearchResults.length === 0) {
    logger.warn("No search results returned", { agentId });
    return {
      leads: [],
      summary: "No search results — check that web-search tool is connected.",
      generatedAt: new Date(),
    };
  }

  const researchData = allSearchResults.join("\n\n---\n\n");

  // Step 2: Gemini summarizes and structures the raw search data
  const researchSummary = await callGemini({
    prompt: researchData,
    systemInstruction:
      "Analyze these search results and extract potential business leads. " +
      "For each business found, extract: business name, website, industry, " +
      "any clues about size, what their online presence looks like (good/bad), " +
      "and any contact info visible. Focus on small to mid-size service businesses " +
      "(restaurants, salons, clinics, real estate, fitness) with weak online presence. " +
      "Return structured findings as JSON.",
  });

  // Step 3: Claude qualifies against ICP and formats final brief
  const qualification = await callClaude({
    systemPrompt: SCOUT_SYSTEM_PROMPT,
    userMessage:
      `Based on this research, qualify the top leads and return a JSON object with:\n` +
      `- "leads": array of qualified leads with fields: businessName, website, industry, sizeEstimate, onlinePresenceScore (1-10), icpFitScore (1-10), keyPainPoint, outreachAngle, decisionMaker, contactMethod, confidence\n` +
      `- "summary": 2-3 sentence executive summary\n\n` +
      `Research:\n${researchSummary.content}`,
  });

  await logUsage(agentId, "lead_qualification", qualification);

  let brief: LeadBrief;
  try {
    const parsed = JSON.parse(qualification.content);
    brief = {
      leads: parsed.leads ?? [],
      summary: parsed.summary ?? "No summary generated",
      generatedAt: new Date(),
    };
  } catch {
    logger.warn("Failed to parse lead qualification output", { agentId });
    brief = {
      leads: [],
      summary: qualification.content.slice(0, 500),
      generatedAt: new Date(),
    };
  }

  // Log task output to DB before sending
  await prisma.task.create({
    data: {
      agentId,
      clientId,
      taskType: "lead_qualification",
      description: `Lead qualification: ${targetIndustries.join(", ")} in ${targetLocation}`,
      status: "completed",
      executedAt: new Date(),
      completedAt: new Date(),
      rawOutput: JSON.stringify(brief),
    },
  });

  logger.info("Lead qualification complete", {
    agentId,
    leadsFound: brief.leads.length,
    searchQueries: allSearchResults.length,
  });

  return brief;
}

export default { qualifyLeads };
