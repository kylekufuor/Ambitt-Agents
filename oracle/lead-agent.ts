import { callClaude } from "../shared/claude.js";
import { Resend } from "resend";
import prisma from "../shared/db.js";
import logger from "../shared/logger.js";
import { buildProspectEmail } from "./templates/prospect-email.js";
import { buildKyleConfirmation, buildKyleNeedEmail } from "./templates/kyle-confirmation.js";

// ---------------------------------------------------------------------------
// Lead Agent — Bar Demo Pipeline
// ---------------------------------------------------------------------------
// Kyle meets someone → fires brief from phone → Claude parses → personalized
// email sent to prospect with Calendly link → Kyle gets confirmation.
// Under 90 seconds end-to-end.
// ---------------------------------------------------------------------------

export interface ParsedLead {
  prospectName: string;
  prospectEmail: string | null;
  businessName: string;
  businessType: string;
  businessSize: string | null;
  painPoint: string;
  proposedUseCase: string;
  location: string | null;
  meetingContext: string | null;
  nextStep: string;
}

export interface LeadResult {
  status: "sent" | "need_email" | "error";
  lead: ParsedLead;
  leadId?: string;
  emailSentTo?: string;
  error?: string;
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

// ---------------------------------------------------------------------------
// Step 1: Parse the brief with Claude
// ---------------------------------------------------------------------------

export async function parseBrief(brief: string): Promise<ParsedLead> {
  const response = await callClaude({
    systemPrompt: `You extract structured lead data from a brief natural language message. The message comes from a founder who just met someone at a bar, event, or meeting. Extract as much as you can. If a field isn't mentioned, use null.

Return ONLY valid JSON matching this exact schema:
{
  "prospectName": "string",
  "prospectEmail": "string or null",
  "businessName": "string",
  "businessType": "string (e.g. boutique hotel, law firm, restaurant)",
  "businessSize": "string or null (e.g. 15-person, 50 employees)",
  "painPoint": "string — their core problem in plain English",
  "proposedUseCase": "string — what an AI agent could do for them",
  "location": "string or null",
  "meetingContext": "string or null (where/how they met)",
  "nextStep": "string (default: demo call)"
}

Be precise. Don't invent details that aren't in the brief. If the business name isn't stated, infer from context or use the person's name + "business".`,
    userMessage: brief,
    maxTokens: 1024,
    temperature: 0.3,
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in Claude response");
    return JSON.parse(jsonMatch[0]) as ParsedLead;
  } catch (error) {
    logger.error("Failed to parse lead brief", { error, response: response.content });
    throw new Error(`Failed to parse brief: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Step 2: Generate personalized prospect email with Claude
// ---------------------------------------------------------------------------

async function generateEmailBody(lead: ParsedLead): Promise<string> {
  const calendlyUrl = process.env.CALENDLY_URL ?? "https://calendly.com/ambitt";

  const response = await callClaude({
    systemPrompt: `You write warm, personalized outreach emails on behalf of Kyle Kufuor, founder of Ambitt Agents. The email is being sent to someone Kyle just met in person. It should feel like a natural follow-up from a real conversation — not a cold email, not a sales pitch, not AI-generated slop.

Rules:
- First name basis — Kyle already met them
- Reference their specific business and pain point
- Briefly explain how an AI agent could help (2-3 sentences max, specific to their use case)
- End with a clear CTA to book a 15-minute demo call
- Sign as Kyle, not as a company
- Tone: confident, direct, warm — like a text from a smart friend who can actually help
- SHORT. Under 150 words. They're busy.

Do NOT include subject line. Just the email body as plain text (no HTML tags). Use line breaks for paragraphs.`,
    userMessage: `Prospect: ${lead.prospectName}
Business: ${lead.businessName} (${lead.businessType}${lead.businessSize ? `, ${lead.businessSize}` : ""})
Pain point: ${lead.painPoint}
Proposed use case: ${lead.proposedUseCase}
Where we met: ${lead.meetingContext ?? "in person"}
Calendly link: ${calendlyUrl}`,
    maxTokens: 1024,
    temperature: 0.7,
  });

  return response.content.trim();
}

// ---------------------------------------------------------------------------
// Step 3: Send emails
// ---------------------------------------------------------------------------

async function sendToProspect(lead: ParsedLead, emailBody: string): Promise<string> {
  const resend = getResend();
  const domain = process.env.EMAIL_DOMAIN ?? "ambitt.agency";
  const calendlyUrl = process.env.CALENDLY_URL ?? "https://calendly.com/ambitt";
  const html = buildProspectEmail(lead, emailBody, calendlyUrl);

  const result = await resend.emails.send({
    from: `Kyle from Ambitt <hello@${domain}>`,
    to: [lead.prospectEmail!],
    subject: `Great meeting you, ${lead.prospectName.split(" ")[0]}`,
    html,
    replyTo: `kyle@${domain}`,
  });

  if (result.error) throw new Error(result.error.message);
  return result.data?.id ?? "";
}

async function sendKyleConfirm(lead: ParsedLead, emailBody: string, emailId: string): Promise<void> {
  const resend = getResend();
  const kyleEmail = process.env.KYLE_EMAIL ?? "kylekufuor@gmail.com";
  const domain = process.env.EMAIL_DOMAIN ?? "ambitt.agency";
  const html = buildKyleConfirmation(lead, emailBody, emailId);

  await resend.emails.send({
    from: `Ambitt Lead Agent <hello@${domain}>`,
    to: [kyleEmail],
    subject: `✓ Sent to ${lead.prospectName} (${lead.businessName})`,
    html,
  });
}

async function sendKyleNeedEmailNotice(lead: ParsedLead, leadId: string): Promise<void> {
  const resend = getResend();
  const kyleEmail = process.env.KYLE_EMAIL ?? "kylekufuor@gmail.com";
  const domain = process.env.EMAIL_DOMAIN ?? "ambitt.agency";
  const oracleUrl = process.env.ORACLE_URL ?? "https://ambitt-agents-production.up.railway.app";
  const html = buildKyleNeedEmail(lead, leadId, oracleUrl);

  await resend.emails.send({
    from: `Ambitt Lead Agent <hello@${domain}>`,
    to: [kyleEmail],
    subject: `⏳ Need email for ${lead.prospectName} (${lead.businessName})`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function processLead(brief: string): Promise<LeadResult> {
  const startTime = Date.now();

  // Step 1: Parse
  logger.info("Lead agent: parsing brief", { brief: brief.slice(0, 100) });
  const lead = await parseBrief(brief);
  logger.info("Lead agent: parsed", { prospectName: lead.prospectName, hasEmail: !!lead.prospectEmail });

  // Log to DB
  const oracleAction = await prisma.oracleAction.create({
    data: {
      actionType: "lead_capture",
      description: `Lead captured: ${lead.prospectName} at ${lead.businessName} (${lead.businessType})`,
      status: lead.prospectEmail ? "completed" : "pending",
      result: JSON.stringify(lead),
    },
  });

  // Step 2: If no email, ask Kyle
  if (!lead.prospectEmail) {
    await sendKyleNeedEmailNotice(lead, oracleAction.id);
    logger.info("Lead agent: no email, asked Kyle", { leadId: oracleAction.id });
    return { status: "need_email", lead, leadId: oracleAction.id };
  }

  // Step 3: Generate personalized email
  const emailBody = await generateEmailBody(lead);

  // Step 4: Send to prospect
  const emailId = await sendToProspect(lead, emailBody);
  logger.info("Lead agent: sent to prospect", {
    to: lead.prospectEmail,
    emailId,
    elapsed: Date.now() - startTime,
  });

  // Step 5: Confirm to Kyle
  await sendKyleConfirm(lead, emailBody, emailId);

  // Update oracle action
  await prisma.oracleAction.update({
    where: { id: oracleAction.id },
    data: {
      status: "completed",
      result: JSON.stringify({ ...lead, emailId, emailBody }),
    },
  });

  const elapsed = Date.now() - startTime;
  logger.info("Lead agent: pipeline complete", { elapsed, prospectName: lead.prospectName });

  return {
    status: "sent",
    lead,
    leadId: oracleAction.id,
    emailSentTo: lead.prospectEmail,
  };
}

// ---------------------------------------------------------------------------
// Resume pipeline when Kyle provides email
// ---------------------------------------------------------------------------

export async function resumeWithEmail(leadId: string, prospectEmail: string): Promise<LeadResult> {
  const action = await prisma.oracleAction.findUnique({ where: { id: leadId } });
  if (!action || !action.result) throw new Error("Lead not found");

  const lead: ParsedLead = { ...JSON.parse(action.result), prospectEmail };

  const emailBody = await generateEmailBody(lead);
  const emailId = await sendToProspect(lead, emailBody);
  await sendKyleConfirm(lead, emailBody, emailId);

  await prisma.oracleAction.update({
    where: { id: leadId },
    data: {
      status: "completed",
      result: JSON.stringify({ ...lead, emailId, emailBody }),
    },
  });

  logger.info("Lead agent: resumed with email", { leadId, to: prospectEmail });

  return { status: "sent", lead, leadId, emailSentTo: prospectEmail };
}

export default { processLead, resumeWithEmail, parseBrief };
