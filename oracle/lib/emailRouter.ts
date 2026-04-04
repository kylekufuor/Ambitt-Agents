import { sendEmail } from "../../shared/email.js";
import { logRecommendations, type RecommendationEntry } from "./logRecommendations.js";
import logger from "../../shared/logger.js";

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
  | "milestone";

// Union of all possible props — the router dispatches based on trigger type
export type EmailProps =
  | { trigger: "welcome"; to: string; agentId: string; agentName: string; agentPurpose: string; clientFirstName: string; clientBusinessName: string; tools: string[]; capabilities: string[] }
  | { trigger: "onboarding"; to: string; agentId: string; agentName: string; clientFirstName: string; clientBusinessName: string; agentType: string }
  | { trigger: "agent-response"; to: string; agentId: string; agentName: string; agentRole: string; clientBusinessName: string; responseBody: string; toolsUsed: Array<{ serverId: string; toolName: string; success: boolean }>; stats?: AlertEmailProps["summary"] extends string ? any : never; [key: string]: any }
  | { trigger: "alert"; to: string } & AlertEmailProps
  | { trigger: "digest"; to: string } & DigestEmailProps
  | { trigger: "action-required"; to: string } & ActionRequiredEmailProps
  | { trigger: "progress"; to: string } & ProgressEmailProps
  | { trigger: "error"; to: string } & ErrorEmailProps
  | { trigger: "permission"; to: string } & PermissionEmailProps
  | { trigger: "milestone"; to: string } & MilestoneEmailProps;

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
        clientFirstName: p.clientFirstName,
        clientBusinessName: p.clientBusinessName,
        agentType: p.agentType,
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

    default:
      throw new Error(`Unknown email trigger: ${trigger}`);
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
