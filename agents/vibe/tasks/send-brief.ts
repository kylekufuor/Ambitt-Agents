import { sendEmail, logConversation } from "../../../shared/email.js";
import { callClaude } from "../../../shared/claude.js";
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

export async function sendContentBrief(
  agentId: string,
  clientId: string,
  recipientEmail: string,
  brief: TrendBrief
): Promise<void> {
  const emailResponse = await callClaude({
    systemPrompt: VIBE_SYSTEM_PROMPT,
    userMessage:
      `Generate an HTML email for the content strategy brief. Follow the standard email anatomy:\n` +
      `1. Subject line with key info (e.g. "AmbittMedia · 5 content ideas, 3 trending sounds this week")\n` +
      `2. Agent identity header (Vibe, Content Strategy, AmbittMedia)\n` +
      `3. The brief — energetic, direct, 3-4 sentences\n` +
      `4. Content ideas cards — each with hook, concept, virality score, and CTA\n` +
      `5. Trending sounds and formats section\n` +
      `6. First truth check\n\n` +
      `Return JSON with "subject" and "html" fields.\n\n` +
      `Brief:\n${JSON.stringify(brief, null, 2)}`,
  });

  let subject: string;
  let html: string;

  try {
    const parsed = JSON.parse(emailResponse.content);
    subject = parsed.subject;
    html = parsed.html;
  } catch {
    subject = `AmbittMedia · ${brief.ideas.length} content ideas this week`;
    html = `<h2>Content Strategy Brief</h2><p>${brief.summary}</p>`;
  }

  const result = await sendEmail({
    agentId,
    agentName: "Vibe",
    to: recipientEmail,
    subject,
    html,
  });

  await logConversation(
    agentId,
    clientId,
    "agent",
    `Content brief sent: ${brief.ideas.length} ideas. ${brief.summary}`,
    `thread-${agentId}-${clientId}`
  );

  logger.info("Content brief sent", { agentId, emailId: result.id, ideasCount: brief.ideas.length });
}

export default { sendContentBrief };
