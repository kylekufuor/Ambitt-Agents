import { sendEmail } from "../../shared/email.js";
import { logRecommendations, type RecommendationEntry } from "./logRecommendations.js";
import logger from "../../shared/logger.js";
import prisma from "../../shared/db.js";
import { signChatToken } from "../../shared/chat-token.js";
import { checkOutboundSeatbelts } from "../../shared/seatbelts.js";
import { haltAgent } from "./pause-control.js";

// Template imports
import { buildWelcomeEmail } from "../templates/welcome-email.js";
import { buildOnboardingEmail } from "../templates/onboarding-email.js";
import { buildAgentResponseEmail } from "../templates/agent-response.js";
import { buildAlertEmail, type AlertEmailProps } from "../templates/alert-email.js";
import { buildDigestEmail, type DigestEmailProps } from "../templates/digest-email.js";
import { buildActionRequiredEmail, type ActionRequiredEmailProps } from "../templates/action-required-email.js";
import { buildProgressEmail, type ProgressEmailProps } from "../templates/progress-email.js";
import { buildErrorEmail, type ErrorEmailProps } from "../templates/error-email.js";
import { buildPermissionEmail, type PermissionEmailProps } from "../templates/permission-email.js";
import { buildMilestoneEmail, type MilestoneEmailProps } from "../templates/milestone-email.js";
import { buildCredentialRequestEmail, type CredentialRequestEmailProps } from "../templates/credential-request-email.js";

// ---------------------------------------------------------------------------
// Email Router — single dispatch for all agent emails
// ---------------------------------------------------------------------------
// Oracle calls this router. It selects the template, sends via Resend,
// and logs recommendations if the template includes them.
// ---------------------------------------------------------------------------

export type EmailTrigger =
  | "welcome"
  | "onboarding"
  | "agent-response"
  | "alert"
  | "digest"
  | "action-required"
  | "progress"
  | "error"
  | "permission"
  | "milestone"
  | "credential-request";

// Union of all possible props — the router dispatches based on trigger type
export type EmailProps =
  | { trigger: "welcome"; to: string; agentId: string; agentName: string; agentPurpose: string; clientFirstName: string; clientBusinessName: string; tools: string[]; capabilities: string[] }
  | { trigger: "onboarding"; to: string; agentId: string; agentName: string; preferredName: string; clientBusinessName: string; body: string }
  | { trigger: "agent-response"; to: string; agentId: string; agentName: string; agentRole: string; clientBusinessName: string; responseBody: string; toolsUsed: Array<{ serverId: string; toolName: string; success: boolean }>; stats?: AlertEmailProps["summary"] extends string ? any : never; [key: string]: any }
  | { trigger: "alert"; to: string } & AlertEmailProps
  | { trigger: "digest"; to: string } & DigestEmailProps
  | { trigger: "action-required"; to: string } & ActionRequiredEmailProps
  | { trigger: "progress"; to: string } & ProgressEmailProps
  | { trigger: "error"; to: string } & ErrorEmailProps
  | { trigger: "permission"; to: string } & PermissionEmailProps
  | { trigger: "milestone"; to: string } & MilestoneEmailProps
  | {
      trigger: "credential-request";
      to: string;
      agentId: string;
      agentName: string;
      clientId: string;
      // Accepts the same BaseEmailProps shape as other templates (callers
      // pass these uniformly) plus credential-specific fields. The
      // conversational template uses only what it needs.
      clientName?: string;
      productName?: string;
      itemTitle: string;
      fieldTitles?: string[];
      summary?: string;
      headline?: string;
      body?: string;
      steps?: string[];
      openUrl: string;
      approveActionId: string;
    };

export async function sendAgentEmail(props: EmailProps): Promise<void> {
  const { trigger, to } = props;

  let html: string;
  let subject: string;
  let agentId: string;
  let agentName: string;
  let recommendations: RecommendationEntry[] | undefined;
  let clientId: string | undefined;

  switch (trigger) {
    case "welcome": {
      const p = props as Extract<EmailProps, { trigger: "welcome" }>;
      const result = buildWelcomeEmail({
        agentName: p.agentName,
        agentId: p.agentId,
        agentPurpose: p.agentPurpose,
        clientFirstName: p.clientFirstName,
        clientBusinessName: p.clientBusinessName,
        tools: p.tools,
        capabilities: p.capabilities,
      });
      html = result.html;
      subject = result.subject;
      agentId = p.agentId;
      agentName = p.agentName;
      break;
    }

    case "onboarding": {
      const p = props as Extract<EmailProps, { trigger: "onboarding" }>;
      const result = buildOnboardingEmail({
        agentName: p.agentName,
        agentId: p.agentId,
        preferredName: p.preferredName,
        clientBusinessName: p.clientBusinessName,
        body: p.body,
      });
      html = result.html;
      subject = result.subject;
      agentId = p.agentId;
      agentName = p.agentName;
      break;
    }

    case "agent-response": {
      const p = props as Extract<EmailProps, { trigger: "agent-response" }>;
      html = buildAgentResponseEmail({
        agentName: p.agentName,
        agentId: p.agentId,
        agentRole: p.agentRole,
        clientBusinessName: p.clientBusinessName,
        responseBody: p.responseBody,
        toolsUsed: p.toolsUsed,
        stats: p.stats,
        tableHeaders: p.tableHeaders,
        tableRows: p.tableRows,
        sourceLinks: p.sourceLinks,
        recommendations: p.recommendations,
      });
      subject = `Re: ${p.agentName} — ${p.clientBusinessName}`;
      agentId = p.agentId;
      agentName = p.agentName;
      recommendations = p.recommendations;
      break;
    }

    case "alert": {
      const p = props as Extract<EmailProps, { trigger: "alert" }>;
      html = buildAlertEmail(p);
      subject = `${p.agentName} — Alert: ${p.metricLabel}`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    case "digest": {
      const p = props as Extract<EmailProps, { trigger: "digest" }>;
      html = buildDigestEmail(p);
      subject = `${p.agentName} — ${p.periodLabel} Digest`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      recommendations = p.recommendations;
      break;
    }

    case "action-required": {
      const p = props as Extract<EmailProps, { trigger: "action-required" }>;
      html = buildActionRequiredEmail(p);
      subject = `${p.agentName} — Action Required`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    case "progress": {
      const p = props as Extract<EmailProps, { trigger: "progress" }>;
      html = buildProgressEmail(p);
      subject = `${p.agentName} — Day ${p.dayNumber} of ${p.totalDays}`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    case "error": {
      const p = props as Extract<EmailProps, { trigger: "error" }>;
      html = buildErrorEmail(p);
      subject = `${p.agentName} — Error: ${p.errorCode}`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    case "permission": {
      const p = props as Extract<EmailProps, { trigger: "permission" }>;
      html = buildPermissionEmail(p);
      subject = `${p.agentName} — Permission Request`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    case "milestone": {
      const p = props as Extract<EmailProps, { trigger: "milestone" }>;
      html = buildMilestoneEmail(p);
      subject = `${p.agentName} — Milestone: ${p.milestoneValue} ${p.milestoneLabel}`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      recommendations = p.recommendations;
      break;
    }

    case "credential-request": {
      const p = props as Extract<EmailProps, { trigger: "credential-request" }>;
      html = buildCredentialRequestEmail({
        agentName: p.agentName,
        agentId: p.agentId,
        headline: p.headline ?? `I need your ${p.itemTitle} login`,
        body: p.body ?? p.summary ?? "",
        openUrl: p.openUrl,
        approveActionId: p.approveActionId,
        steps: p.steps,
      });
      subject = `${p.agentName} needs your ${p.itemTitle} login`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    default:
      throw new Error(`Unknown email trigger: ${trigger}`);
  }

  // Inject a fresh HMAC-signed chat token into the footer's chat link so
  // "Chat with {agent}" lands the client straight into chat.ambitt.agency
  // already authenticated. Best-effort — if the secret isn't configured or
  // the DB lookup fails, we send the email with the bare (unsigned) link.
  try {
    if (!clientId) {
      const a = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { clientId: true },
      });
      clientId = a?.clientId;
    }
    if (clientId && process.env.CHAT_TOKEN_SECRET) {
      const token = signChatToken(clientId, agentId);
      const bareUrl = `https://chat.ambitt.agency/${agentId}`;
      html = html.split(bareUrl).join(`${bareUrl}?t=${token}`);
    }
  } catch (err) {
    logger.warn("Chat token injection skipped", { agentId, error: err instanceof Error ? err.message : String(err) });
  }

  // Outbound seatbelt (control-plane Pillar 4) — gate ONLY client-facing agent
  // replies. Runtime client-facing sends (agent replies, request_2fa_code's
  // "reply with your verification code", etc.) route through this router and
  // call sendEmail() directly, bypassing the seatbelt enforced in
  // dispatchAgentResponse. That is exactly the path the "spammed Casey with
  // code requests" loop used. If this agent is looping — too many sends in a
  // short window, or the same message repeated to the same recipient — block
  // the send, system-pause the agent (operator-only resume), and alert the
  // operator. System/lifecycle mail (welcome, onboarding, checkpoint, digest,
  // alert, error, permission, milestone, credential-request, action-required,
  // progress) is never gated — it must always send.
  if (trigger === "agent-response") {
    const responseBody = (props as Extract<EmailProps, { trigger: "agent-response" }>).responseBody;
    const verdict = await checkOutboundSeatbelts(prisma, { agentId, recipient: to, subject, bodyText: responseBody });
    if (!verdict.allowed) {
      await haltAgent(prisma, { agentId, by: "system", reason: `seatbelt:${verdict.tripped} — ${verdict.reason ?? ""}`.slice(0, 300) });
      logger.warn("Outbound seatbelt tripped — send blocked, agent system-paused", { agentId, to, tripped: verdict.tripped, reason: verdict.reason });
      try {
        const { sendWhatsApp } = await import("../../shared/whatsapp.js");
        const kyle = process.env.KYLE_WHATSAPP_NUMBER;
        if (kyle) {
          await sendWhatsApp({
            to: kyle,
            message: `🚨 Seatbelt tripped for ${agentName} (${agentId}): ${verdict.tripped}. ${verdict.reason ?? ""}\nAgent auto-paused (system). Resume from the dashboard when it's safe.`,
          });
        }
      } catch (e) {
        logger.warn("Seatbelt operator alert (WhatsApp) failed", { agentId, err: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
  }

  // Send via Resend
  await sendEmail({
    agentId,
    agentName,
    to,
    subject,
    html,
    replyToAgentId: agentId,
  });

  logger.info("Agent email sent via router", { trigger, agentId, to, subject });

  // Log recommendations if present
  if (recommendations && recommendations.length > 0 && clientId) {
    await logRecommendations(recommendations, {
      agentId,
      clientId,
      emailType: trigger,
    });
  }
}
