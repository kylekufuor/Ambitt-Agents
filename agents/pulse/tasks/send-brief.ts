import { sendEmail, logConversation } from "../../../shared/email.js";
import { callClaude } from "../../../shared/claude.js";
import { sendKyleWhatsApp } from "../../../shared/whatsapp.js";
import logger from "../../../shared/logger.js";
import { PULSE_SYSTEM_PROMPT } from "../prompts/system.js";

interface ReputationReport {
  reviews: Array<{ platform: string; author: string; rating: number; text: string }>;
  sentiment: { overall: number; positive: number; neutral: number; negative: number };
  avgRating: number;
  ratingTrend: string;
  topPositiveThemes: string[];
  topNegativeThemes: string[];
  urgentItems: Array<{ author: string; rating: number; text: string }>;
  draftedResponses: Array<{ reviewAuthor: string; response: string }>;
  recommendation: { title: string; description: string; confidence: string };
  urgency: string;
  summary: string;
  generatedAt: Date;
}

export async function sendReputationBrief(
  agentId: string,
  clientId: string,
  recipientEmail: string,
  report: ReputationReport
): Promise<void> {
  // If urgency is red, send WhatsApp alert immediately
  if (report.urgency === "red") {
    try {
      await sendKyleWhatsApp(
        `🔴 Pulse — Reputation Alert\n\n` +
          `${report.urgentItems.length} urgent item(s) detected.\n` +
          `${report.summary}\n\n` +
          `Check email for full report and drafted responses.`
      );
    } catch (error) {
      logger.error("Failed to send urgent WhatsApp alert", { agentId, error });
    }
  }

  const emailResponse = await callClaude({
    systemPrompt: PULSE_SYSTEM_PROMPT,
    userMessage:
      `Generate an HTML email for the reputation report. Follow the standard email anatomy:\n` +
      `1. Subject line with key metrics (e.g. "AmbittMedia · 4.7★ avg, 3 new reviews, 1 needs response")\n` +
      `2. Agent identity header (Pulse, Reputation, AmbittMedia)\n` +
      `3. The brief — 3-4 sentences, lead with urgency level\n` +
      `4. Sentiment scorecard — visual, color coded\n` +
      `5. New reviews with drafted responses\n` +
      `6. Themes section — what clients love vs what to fix\n` +
      `7. One recommendation\n` +
      `8. First truth check\n\n` +
      `Return JSON with "subject" and "html" fields.\n\n` +
      `Report:\n${JSON.stringify(report, null, 2)}`,
  });

  let subject: string;
  let html: string;

  try {
    const parsed = JSON.parse(emailResponse.content);
    subject = parsed.subject;
    html = parsed.html;
  } catch {
    subject = `AmbittMedia · ${report.avgRating}★ avg, ${report.reviews.length} reviews — ${report.urgency}`;
    html = `<h2>Reputation Report</h2><p>${report.summary}</p>`;
  }

  const result = await sendEmail({
    agentId,
    agentName: "Pulse",
    to: recipientEmail,
    subject,
    html,
  });

  await logConversation(
    agentId,
    clientId,
    "agent",
    `Reputation brief sent. Urgency: ${report.urgency}. ${report.summary}`,
    `thread-${agentId}-${clientId}`
  );

  logger.info("Reputation brief sent", { agentId, emailId: result.id, urgency: report.urgency });
}

export default { sendReputationBrief };
