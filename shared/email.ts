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
  const from = `${agentName} <noreply@${domain}>`;
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
      logger.info("Email sent", { agentId, to, subject, emailId: result.data?.id });

      return { id: result.data?.id ?? "", sentAt };
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
