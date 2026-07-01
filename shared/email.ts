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

  // The agent's canonical, unique inbox address (e.g. "arthur-litsey@ambitt.agency").
  // We send FROM this so the address the client sees in their inbox is the same
  // one stored on the agent, shown in the portal, and matched by the inbound
  // webhook's direct-path lookup (Oracle resolves by Agent.email). Without it,
  // From fell back to a slug of the agent NAME ("arthur@…"), which is neither
  // unique nor routable — a cold email to it got silently dropped. Populated by
  // the lookup below; stays null (→ name-slug fallback) only on a DB hiccup.
  let agentInboxAddress: string | null = null;

  // Dry-run intercept — if the agent is flagged dryRun, record the would-be
  // send to DryRunLog and return a synthetic success. The agent's runtime
  // behavior is identical to a live send (we return an id + sentAt), but
  // nothing actually leaves the building. Operators review captures via the
  // dashboard before flipping dryRun off + status to "active".
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { dryRun: true, email: true },
    });
    agentInboxAddress = agent?.email ?? null;
    if (agent?.dryRun) {
      const captured = await prisma.dryRunLog.create({
        data: {
          agentId,
          kind: "email",
          payload: {
            to,
            subject,
            html,
            replyToAgentId: replyToAgentId ?? null,
            agentName,
            emailType: options.emailType ?? null,
            attachmentCount: options.attachments?.length ?? 0,
          },
        },
        select: { id: true, capturedAt: true },
      });
      logger.info("Dry-run: email captured (not sent)", {
        agentId,
        to,
        subject,
        dryRunLogId: captured.id,
      });
      return { id: `dryrun:${captured.id}`, sentAt: captured.capturedAt };
    }
  } catch (err) {
    // Don't fail the send if the dry-run check itself errors — log + continue.
    // Worst case a real send goes out when it shouldn't have. We'd rather
    // err on the side of "do the work" than block a real-client agent on a
    // DB hiccup.
    logger.warn("Dry-run check failed, falling through to live send", {
      agentId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const domain = process.env.EMAIL_DOMAIN || "ambitt.agency";
  // FROM address is the agent's canonical Agent.email — the unique, routable
  // handle the client also sees in the portal and can cold-email. Falls back to
  // a slug of the agent name (e.g. "Atlas" → "atlas") only if the DB lookup
  // above failed. Reply-To keeps the agentId-routable form so the inbound
  // webhook can dispatch replies back to the right agent even if the address
  // is later renamed.
  const fromSlug = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")   // non-alphanum → hyphen
    .replace(/^-+|-+$/g, "")        // trim leading/trailing hyphens
    .slice(0, 32) || "agent";       // hard cap; fallback if name was all symbols
  const fromAddress = agentInboxAddress ?? `${fromSlug}@${domain}`;
  const from = `${agentName} <${fromAddress}>`;
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
