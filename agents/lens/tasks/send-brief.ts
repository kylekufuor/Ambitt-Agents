import { sendEmail, logConversation } from "../../../shared/email.js";
import { callClaude } from "../../../shared/claude.js";
import logger from "../../../shared/logger.js";
import { LENS_SYSTEM_PROMPT } from "../prompts/system.js";

interface TrafficAnalysis {
  metrics: Array<{ metric: string; current: number; previous: number; changePercent: number; trend: string }>;
  topPages: Array<{ page: string; views: number; bounceRate: number }>;
  funnelDropoff: string;
  recommendation: { title: string; description: string; expectedImpact: string; confidence: string };
  urgency: string;
  summary: string;
  generatedAt: Date;
}

export async function sendAnalyticsBrief(
  agentId: string,
  clientId: string,
  recipientEmail: string,
  analysis: TrafficAnalysis
): Promise<void> {
  const emailResponse = await callClaude({
    systemPrompt: LENS_SYSTEM_PROMPT,
    userMessage:
      `Generate an HTML email for the weekly analytics brief. Follow the standard email anatomy:\n` +
      `1. Subject line with key metrics (e.g. "AmbittMedia · 1,200 visitors (+12%), conversion down 3%")\n` +
      `2. Agent identity header (Lens, Analytics, AmbittMedia)\n` +
      `3. The brief — 3-4 sentences, plain English, lead with the most important insight\n` +
      `4. Metrics table — clean, with trend arrows and color coding\n` +
      `5. One clear recommendation with expected impact\n` +
      `6. Bottleneck highlight — color coded by urgency\n` +
      `7. First truth check\n\n` +
      `Return JSON with "subject" and "html" fields.\n\n` +
      `Analysis:\n${JSON.stringify(analysis, null, 2)}`,
  });

  let subject: string;
  let html: string;

  try {
    const parsed = JSON.parse(emailResponse.content);
    subject = parsed.subject;
    html = parsed.html;
  } catch {
    const topMetric = analysis.metrics[0];
    subject = topMetric
      ? `AmbittMedia · ${topMetric.metric}: ${topMetric.current} (${topMetric.changePercent > 0 ? "+" : ""}${topMetric.changePercent}%)`
      : `AmbittMedia · Weekly Analytics Brief`;
    html = `<h2>Weekly Analytics Brief</h2><p>${analysis.summary}</p>`;
  }

  const result = await sendEmail({
    agentId,
    agentName: "Lens",
    to: recipientEmail,
    subject,
    html,
  });

  await logConversation(
    agentId,
    clientId,
    "agent",
    `Weekly analytics brief sent. Urgency: ${analysis.urgency}. ${analysis.summary}`,
    `thread-${agentId}-${clientId}`
  );

  logger.info("Analytics brief sent", { agentId, emailId: result.id, urgency: analysis.urgency });
}

export default { sendAnalyticsBrief };
