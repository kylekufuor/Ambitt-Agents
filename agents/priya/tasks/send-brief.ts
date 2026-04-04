import { sendEmail, logConversation } from "../../../shared/email.js";
import { callClaude } from "../../../shared/claude.js";
import logger from "../../../shared/logger.js";
import { buildPriyaSystemPrompt } from "../prompts/system.js";

interface ProductAnalysis {
  northStar: { metric: string; value: number; previous: number; changePercent: number; trend: string };
  activationFunnel: Array<{ step: string; users: number; conversionRate: number; dropoffRate: number }>;
  retention: Array<{ period: string; rate: number; previousRate: number; trend: string }>;
  featureAdoption: Array<{ feature: string; usageRate: number; trend: string }>;
  frictionPoints: Array<{ description: string; severity: string; affectedUsers: number }>;
  recommendation: { title: string; description: string; expectedImpact: string; confidence: string };
  urgency: string;
  summary: string;
  generatedAt: Date;
}

export async function sendProductBrief(
  agentId: string,
  clientId: string,
  recipientEmail: string,
  analysis: ProductAnalysis,
  clientName: string,
  productDescription: string,
  northStarMetric: string
): Promise<void> {
  const systemPrompt = buildPriyaSystemPrompt(clientName, productDescription, northStarMetric);

  const emailResponse = await callClaude({
    systemPrompt,
    userMessage:
      `Generate an HTML email for the weekly product analytics brief. Follow the standard email anatomy:\n` +
      `1. Subject line: "${clientName} · ${analysis.northStar.metric}: ${analysis.northStar.value} (${analysis.northStar.changePercent > 0 ? "+" : ""}${analysis.northStar.changePercent}%)"\n` +
      `2. Agent identity header (Priya, Analytics, ${clientName})\n` +
      `3. The brief — 3-4 sentences, lead with north star insight\n` +
      `4. North star metric card — big number, trend, context\n` +
      `5. Activation funnel visualization — step by step with dropoff highlights\n` +
      `6. Retention cohorts — D1/D7/D30\n` +
      `7. One recommendation with expected impact\n` +
      `8. Friction points — color coded\n` +
      `9. First truth check\n\n` +
      `Use clean, modern HTML with inline styles. Green/amber/red color coding.\n` +
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
    const ns = analysis.northStar;
    subject = `${clientName} · ${ns.metric}: ${ns.value} (${ns.changePercent > 0 ? "+" : ""}${ns.changePercent}%)`;
    html = `<h2>Weekly Product Analytics</h2><p>${analysis.summary}</p>`;
  }

  const result = await sendEmail({
    agentId,
    agentName: "Priya",
    to: recipientEmail,
    subject,
    html,
  });

  await logConversation(
    agentId,
    clientId,
    "agent",
    `Product analytics brief sent. Urgency: ${analysis.urgency}. ${analysis.summary}`,
    `thread-${agentId}-${clientId}`
  );

  logger.info("Product brief sent", { agentId, clientName, emailId: result.id, urgency: analysis.urgency });
}

export default { sendProductBrief };
