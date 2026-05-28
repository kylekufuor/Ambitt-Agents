import { Resend } from "resend";
import logger from "./logger.js";
import prisma from "./db.js";

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

interface SendEmailOptions {
  agentId: string;
  agentName: string;
  to: string;
  subject: string;
  html: string;
  replyToAgentId?: string;
  attachments?: EmailAttachment[];
  // Audit-trail links — optional. If known at call site, pass them so the
  // EmailSend row is queryable per-prospect / per-client and the dashboard
  // can show delivery status against the right artifact. Without these, the
  // row still lands (keyed by resendMessageId for webhook lookup) but isn't
  // linked back to the prospect/client.
  prospectId?: string;
  clientId?: string;
  // Free-form categorization for filtering, e.g. "proposal_teaser" |
  // "quote_teaser" | "thanks_email" | "agent_response" | "ops_notification".
  // Used by the dashboard delivery badge + bounce alerts to identify which
  // artifact failed delivery.
  emailType?: string;
}

interface EmailResult {
  id: string;
  sentAt: Date;
}

export async function sendEmail(
  options: SendEmailOptions,
  retries = 3
): Promise<EmailResult> {
  const { agentId, agentName, to, subject, html, replyToAgentId } = options;
  const domain = process.env.EMAIL_DOMAIN || "ambitt.agency";
  // FROM local-part is a slug of the agent name (e.g. "Atlas" → "atlas",
  // "Marketing Bot" → "marketing-bot"). Looks personal to the recipient
  // and reinforces the "I'm a real teammate named X" framing. Reply-To
  // keeps the agentId-routable form so the inbound webhook can dispatch
  // replies back to the right agent.
  const fromSlug = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")   // non-alphanum → hyphen
    .replace(/^-+|-+$/g, "")        // trim leading/trailing hyphens
    .slice(0, 32) || "agent";       // hard cap; fallback if name was all symbols
  const from = `${agentName} <${fromSlug}@${domain}>`;
  const replyTo = replyToAgentId
    ? `reply-${replyToAgentId}@${domain}`
    : `reply-${agentId}@${domain}`;

  const client = getClient();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await client.emails.send({
        from,
        to: [to],
        subject,
        html,
        replyTo,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })),
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      const sentAt = new Date();
      const messageId = result.data?.id ?? null;
      logger.info("Email sent", { agentId, to, subject, emailId: messageId });

      // Audit row — every successful Resend accept becomes a row keyed by
      // resendMessageId. The /webhooks/email-events endpoint updates the row
      // when Resend pushes delivered/bounced/complained events. Best-effort:
      // if the write fails (DB hiccup), we don't fail the send — the email
      // already left our hands and we'd rather not double-send on retry.
      try {
        await prisma.emailSend.create({
          data: {
            agentId,
            to,
            subject,
            status: "accepted",
            resendMessageId: messageId,
            prospectId: options.prospectId ?? null,
            clientId: options.clientId ?? null,
            emailType: options.emailType ?? null,
          },
        });
      } catch (err) {
        logger.warn("EmailSend audit row write failed (continuing)", {
          agentId,
          to,
          messageId,
          err: err instanceof Error ? err.message : String(err),
        });
      }

      return { id: messageId ?? "", sentAt };
    } catch (error) {
      logger.error(`Email send attempt ${attempt}/${retries} failed`, {
        error,
        agentId,
        to,
      });
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("Email send failed after all retries");
}

export async function logConversation(
  agentId: string,
  clientId: string,
  role: "agent" | "client",
  content: string,
  threadId: string,
  inReplyTo?: string
): Promise<void> {
  await prisma.conversationMessage.create({
    data: {
      agentId,
      clientId,
      role,
      content,
      channel: "email",
      threadId,
      inReplyTo,
    },
  });
}

export default { sendEmail, logConversation };
