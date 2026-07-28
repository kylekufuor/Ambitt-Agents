import { sendEmail } from "../../shared/email.js";
import { logRecommendations, type RecommendationEntry } from "./logRecommendations.js";
import logger from "../../shared/logger.js";
import prisma from "../../shared/db.js";
import { signChatToken } from "../../shared/chat-token.js";
import { checkOutboundSeatbelts, resolveSeatbeltConfig } from "../../shared/seatbelts.js";
import { haltAgent } from "./pause-control.js";
import { actionRequiredSubject, permissionSubject } from "./email-subject.js";

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

// Which triggers the outbound seatbelt gates, and what body text each one
// contributes to the runaway signal. Returns null for mail that must never be
// gated. Pure + exhaustive: the union has no `default` arm, so adding a new
// trigger to EmailProps without classifying it here is a compile error — a new
// agent-initiated email can't quietly slip past the seatbelt.
//
// Body text falls back to the subject rather than "" so a trigger whose props
// carry no prose still produces a usable repetition signal.
function seatbeltBodyFor(props: EmailProps, subject: string): string | null {
  switch (props.trigger) {
    // --- Agent-initiated, client-facing: GATED ---
    // Runtime reply to the client (inbound reply, scheduled run).
    case "agent-response":
      return props.responseBody || subject;
    // request_credential tool — "send me your X login".
    case "credential-request":
      return props.body || props.summary || subject;
    // request_approval tool — "approve this plan".
    case "action-required":
      return props.summary || subject;
    // request_tool_connection tool — "connect your X account".
    case "permission":
      return props.summary || subject;

    // --- System / lifecycle: NEVER gated ---
    case "welcome":
    case "onboarding":
    case "digest":
    case "alert":
    case "error":
    case "milestone":
    case "progress":
      return null;
  }
}

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
      // Same string dispatchAgentResponse composes for this trigger. Both paths
      // must normalize identically or the seatbelt's repetition check stops
      // seeing a loop that alternates between them.
      subject = `Re: ${p.agentName} at ${p.clientBusinessName}`;
      agentId = p.agentId;
      agentName = p.agentName;
      recommendations = p.recommendations;
      break;
    }

    case "alert": {
      const p = props as Extract<EmailProps, { trigger: "alert" }>;
      html = buildAlertEmail(p);
      subject = `Heads up from ${p.agentName}: ${p.metricLabel}`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    case "digest": {
      const p = props as Extract<EmailProps, { trigger: "digest" }>;
      html = buildDigestEmail(p);
      // periodLabel is "Today" / "This week" (see digestCron.ts), so this reads
      // as a sentence rather than a label.
      subject = `${p.periodLabel} with ${p.agentName}`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      recommendations = p.recommendations;
      break;
    }

    case "action-required": {
      const p = props as Extract<EmailProps, { trigger: "action-required" }>;
      html = buildActionRequiredEmail(p);
      // Subject carries the actual ask, not a constant banner — see
      // email-subject.ts for why (the seatbelt's repetition check keys on the
      // subject, so a constant one halts an agent making distinct asks).
      subject = actionRequiredSubject(p.agentName, p.summary, p.actionSteps?.[0]?.step);
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    case "progress": {
      const p = props as Extract<EmailProps, { trigger: "progress" }>;
      html = buildProgressEmail(p);
      subject = `Day ${p.dayNumber} of ${p.totalDays} with ${p.agentName}`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    case "error": {
      const p = props as Extract<EmailProps, { trigger: "error" }>;
      html = buildErrorEmail(p);
      subject = `${p.agentName} ran into a problem: ${p.errorCode}`;
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    case "permission": {
      const p = props as Extract<EmailProps, { trigger: "permission" }>;
      html = buildPermissionEmail(p);
      // Same rule as action-required: the app being requested is what makes
      // this ask different from the last one, so it goes in the subject.
      subject = permissionSubject(p.agentName, (p.permissions ?? []).map((x) => x.toolName), p.summary);
      agentId = p.agentId;
      agentName = p.agentName;
      clientId = p.clientId;
      break;
    }

    case "milestone": {
      const p = props as Extract<EmailProps, { trigger: "milestone" }>;
      html = buildMilestoneEmail(p);
      subject = `${p.agentName} hit ${p.milestoneValue} ${p.milestoneLabel}`;
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

  const seatbeltBody = seatbeltBodyFor(props, subject);

  // One agent lookup serves two callers below: the chat-token injection (needs
  // clientId) and the seatbelt (needs the per-agent overrides + safety
  // sensitivity). Only fetched when something actually needs it, so ungated
  // mail that already carries clientId in its props costs no extra query.
  // Best-effort: a failed lookup degrades to an unsigned chat link and the
  // GLOBAL seatbelt defaults — it never blocks the send.
  let agentRow: { clientId: string; communicationSettings: unknown; safetySensitivity: string | null } | null = null;
  if (!clientId || seatbeltBody !== null) {
    try {
      agentRow = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { clientId: true, communicationSettings: true, safetySensitivity: true },
      });
    } catch (err) {
      logger.warn("Agent lookup failed — chat token skipped, seatbelt on global defaults", {
        agentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    clientId = clientId ?? agentRow?.clientId;
  }

  // Inject a fresh HMAC-signed chat token into the footer's chat link so
  // "Chat with {agent}" lands the client straight into chat.ambitt.agency
  // already authenticated. Best-effort — if the secret isn't configured or
  // signing fails, we send the email with the bare (unsigned) link.
  try {
    if (clientId && process.env.CHAT_TOKEN_SECRET) {
      const token = signChatToken(clientId, agentId);
      const bareUrl = `https://chat.ambitt.agency/${agentId}`;
      html = html.split(bareUrl).join(`${bareUrl}?t=${token}`);
    }
  } catch (err) {
    logger.warn("Chat token injection skipped", { agentId, error: err instanceof Error ? err.message : String(err) });
  }

  // Outbound seatbelt (control-plane Pillar 4) — the rule is AGENT-INITIATED
  // client-facing mail is gated; genuine system/lifecycle mail is not.
  //
  // Everything an agent decides to send mid-run reaches the client through this
  // router and calls sendEmail() directly, bypassing the seatbelt enforced in
  // dispatchAgentResponse. That is exactly the path the "spammed Casey with
  // code requests" loop used. The reply path (agent-response) was gated first;
  // the three tool-triggered sends inside a run — request_credential
  // (credential-request), request_approval (action-required) and
  // request_tool_connection (permission) — are the same failure shape: a loop
  // in the agentic loop mails the client again and again. They are gated too.
  //
  // Not gated, ever: welcome, onboarding, digest, alert, error, milestone,
  // progress. Those are fired by Oracle itself (lifecycle, scheduler, monitor),
  // not chosen by a looping agent, and a suppressed one is worse than a
  // duplicate — an error or alert that never lands hides the incident.
  //
  // Caps come from the agent's own config — per-agent overrides in
  // communicationSettings.seatbelts on top of the operator's safety
  // sensitivity (relaxed/standard/strict), same resolution dispatchAgentResponse
  // uses. Without this a "Relaxed" or "Strict" agent was silently held to the
  // global defaults on every trigger this router gates.
  //
  // On trip: block the send, system-pause the agent (operator-only resume),
  // and alert the operator.
  if (seatbeltBody !== null) {
    const seatbeltCfg = resolveSeatbeltConfig(agentRow?.communicationSettings, agentRow?.safetySensitivity);
    const verdict = await checkOutboundSeatbelts(prisma, { agentId, recipient: to, subject, bodyText: seatbeltBody }, seatbeltCfg);
    if (!verdict.allowed) {
      await haltAgent(prisma, { agentId, by: "system", reason: `seatbelt:${verdict.tripped} — ${verdict.reason ?? ""}`.slice(0, 300) });
      logger.warn("Outbound seatbelt tripped — send blocked, agent system-paused", { agentId, to, trigger, tripped: verdict.tripped, reason: verdict.reason });
      try {
        // alertOperator (not sendWhatsApp) — SMS first, operator email when SMS
        // is unavailable, which it is today. The old direct sendWhatsApp call
        // was skipped entirely unless KYLE_WHATSAPP_NUMBER was set, so seatbelt
        // trips halted agents silently.
        const { alertOperator } = await import("../../shared/alert-operator.js");
        await alertOperator(
          `🚨 Seatbelt tripped for ${agentName} (${agentId}) on ${trigger}: ${verdict.tripped}. ${verdict.reason ?? ""}\nAgent auto-paused (system). Resume from the dashboard when it's safe.`,
        );
      } catch (e) {
        logger.warn("Seatbelt operator alert failed", { agentId, err: e instanceof Error ? e.message : String(e) });
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
