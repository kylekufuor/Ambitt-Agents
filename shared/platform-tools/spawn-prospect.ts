import logger from "../logger.js";
import { findOrCreateProspect, ProspectInputError } from "../prospects.js";

// ---------------------------------------------------------------------------
// spawn_prospect — Atlas's "sales-from-the-inbox" capability
// ---------------------------------------------------------------------------
//
// Kyle (the platform operator) emails Atlas: "Send our onboarding link to
// Maya at maya@example.com. She runs a coffee roaster in Brooklyn, met her
// at Coffee Champs last week."
//
// Atlas reads the email, extracts name + email + context, calls this tool.
// The tool:
//   1. find-or-creates the Prospect (same resume rules as the public form)
//   2. composes a personalized teaser email using Atlas's custom_message as
//      the body, wrapped in the standard Ambitt brand chrome + onboard CTA
//   3. sends the teaser via Atlas
//   4. returns the prospect URL + status so Atlas can confirm to Kyle
//
// Authorization is enforced upstream — only senders flagged as
// platform_operator in checkInboundAuth can trigger Atlas runs that lead
// here. The tool itself doesn't re-check, on the assumption it's only ever
// callable from an authorized agent's runtime loop.
// ---------------------------------------------------------------------------

export interface SpawnProspectInput {
  name: string;
  email: string;
  /**
   * Personalized 2-4 sentence email body Atlas writes from the operator's
   * context. Wrapped in the brand chrome — Atlas owns the prose, the tool
   * owns the layout + CTA. Plain text (no HTML). When omitted, falls back
   * to a generic teaser.
   */
  custom_message?: string;
  /** Calling agent's id + name — needed to send the teaser FROM the agent. */
  callerAgentId: string;
  callerAgentName: string;
}

export interface SpawnProspectResult {
  status: "spawned" | "resumed" | "error";
  /** Plain-English summary the agent reads back as its tool result. */
  message: string;
  prospectId?: string;
  prospectToken?: string;
  onboardUrl?: string;
  isNew?: boolean;
}

export async function spawnProspect(input: SpawnProspectInput): Promise<SpawnProspectResult> {
  const { name, email, custom_message, callerAgentId, callerAgentName } = input;

  // 1) Find-or-create the Prospect.
  let result;
  try {
    result = await findOrCreateProspect({ name, email });
  } catch (err) {
    if (err instanceof ProspectInputError) {
      return { status: "error", message: `Invalid input: ${err.message}` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", message: `Couldn't create prospect: ${msg}` };
  }

  const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://portal.ambitt.agency";
  const onboardUrl = `${portalBase}/onboard/${result.token}`;
  const firstName = (result.contactName ?? name ?? "").trim().split(/\s+/)[0] || "there";

  // 2) Compose the personalized teaser email body. If Atlas didn't supply a
  //    custom_message, fall back to a generic line (still preferable to dropping
  //    the send entirely).
  const bodyText =
    custom_message && custom_message.trim().length > 0
      ? custom_message.trim()
      : "Quick intro — here's the link to start onboarding for the custom agent we're building. Takes about 5–10 minutes; we'll send a tailored proposal back within 30 minutes.";

  // 3) Send the email via the calling agent.
  try {
    const { sendEmail } = await import("../email.js");
    await sendEmail({
      agentId: callerAgentId,
      agentName: callerAgentName,
      to: email.toLowerCase().trim(),
      subject: "Your custom-agent onboarding link",
      html: renderSpawnTeaserEmail({
        firstName,
        bodyText,
        onboardUrl,
        portalBase,
      }),
      replyToAgentId: callerAgentId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("spawn_prospect: teaser email send failed", {
      prospectId: result.prospectId,
      callerAgentId,
      err: msg,
    });
    return {
      status: "error",
      message: `Created the prospect (id ${result.prospectId}) but the teaser email failed: ${msg}`,
      prospectId: result.prospectId,
      prospectToken: result.token,
      onboardUrl,
      isNew: result.isNew,
    };
  }

  logger.info("spawn_prospect: success", {
    prospectId: result.prospectId,
    email: email.toLowerCase().trim(),
    isNew: result.isNew,
    callerAgentId,
  });

  const verb = result.isNew ? "spawned" : "resumed";
  const verbCap = result.isNew ? "Spawned" : "Resumed";
  return {
    status: verb === "spawned" ? "spawned" : "resumed",
    message: `${verbCap} prospect for ${email} (${result.isNew ? "new row" : "existing row, returned same token"}). Personalized teaser sent. Their onboard URL: ${onboardUrl}`,
    prospectId: result.prospectId,
    prospectToken: result.token,
    onboardUrl,
    isNew: result.isNew,
  };
}

// ---------------------------------------------------------------------------
// Teaser email — mirrors the standard onboarding-link template, with the
// agent-written custom_message as the body paragraph in place of generic copy.
// ---------------------------------------------------------------------------

function renderSpawnTeaserEmail(input: {
  firstName: string;
  bodyText: string;
  onboardUrl: string;
  portalBase: string;
}): string {
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #171717;">
  <div style="margin-bottom: 28px;">
    <img src="${input.portalBase}/brand/ambitt-agents-lockup.svg" alt="Ambitt Agents" width="220" height="27" style="display: block; max-width: 220px; height: auto;" />
  </div>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.6;">Hey ${escapeHtml(input.firstName)},</p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 24px; line-height: 1.7;">${escapeHtml(input.bodyText)}</p>
  <div style="margin: 0 0 28px;">
    <a href="${input.onboardUrl}" style="display: inline-block; padding: 14px 30px; background: #00b3b3; color: #ffffff; text-decoration: none; border-radius: 9px; font-size: 15px; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0, 179, 179, 0.28);">Start onboarding →</a>
  </div>
  <p style="font-size: 13px; color: #737373; margin: 0 0 8px; line-height: 1.6;">
    Takes about 5–10 minutes. Your progress saves automatically — you can pause and come back any time.
  </p>
  <p style="font-size: 13px; color: #a3a3a3; margin: 32px 0 0;">— Atlas, your onboarding agent at Ambitt Agents</p>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

