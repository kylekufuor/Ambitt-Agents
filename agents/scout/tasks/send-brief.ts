import { sendEmail, logConversation } from "../../../shared/email.js";
import { callClaude } from "../../../shared/claude.js";
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

export async function sendWeeklyBrief(
  agentId: string,
  clientId: string,
  recipientEmail: string,
  brief: LeadBrief
): Promise<void> {
  // Generate email HTML via Claude
  const emailResponse = await callClaude({
    systemPrompt: SCOUT_SYSTEM_PROMPT,
    userMessage:
      `Generate an HTML email for the weekly lead brief. Follow the standard email anatomy:\n` +
      `1. Subject line with key metrics\n` +
      `2. Agent identity header (Scout, Lead Generation, AmbittMedia)\n` +
      `3. The brief — 3-4 sentences, plain English\n` +
      `4. The leads table — clean, color-coded by ICP fit score\n` +
      `5. First truth check — honest assessment\n\n` +
      `Return JSON with "subject" and "html" fields.\n\n` +
      `Brief data:\n${JSON.stringify(brief, null, 2)}`,
  });

  let subject: string;
  let html: string;

  try {
    const parsed = JSON.parse(emailResponse.content);
    subject = parsed.subject;
    html = parsed.html;
  } catch {
    subject = `Scout · ${brief.leads.length} leads qualified this week`;
    html = `<h2>Weekly Lead Brief</h2><p>${brief.summary}</p><p>${brief.leads.length} leads found. Full details attached.</p>`;
  }

  const result = await sendEmail({
    agentId,
    agentName: "Scout",
    to: recipientEmail,
    subject,
    html,
  });

  await logConversation(
    agentId,
    clientId,
    "agent",
    `Weekly lead brief sent: ${brief.leads.length} leads. ${brief.summary}`,
    `thread-${agentId}-${clientId}`
  );

  logger.info("Weekly brief sent", {
    agentId,
    emailId: result.id,
    leadsCount: brief.leads.length,
  });
}

export default { sendWeeklyBrief };
