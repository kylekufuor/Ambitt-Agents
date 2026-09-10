import logger from "../logger.js";

// ---------------------------------------------------------------------------
// send_email_for_operator — Atlas sends a personalized email on the operator's
// instruction, to anyone the operator names.
// ---------------------------------------------------------------------------
//
// Kyle emails Atlas: "Send Dale a note about what an agent could do for his
// roofing company. He runs Whitlock Roofing in Tulsa and uses Roofr."
// Atlas researches the business, writes the email, and calls this tool, which
// sends it FROM Atlas TO the named person.
//
// Three decisions worth knowing before you change this file:
//
// 1. AUTHORIZATION IS CHECKED HERE, IN CODE, NOT IN THE PROMPT.
//    spawn_prospect trusts that only operator-mode prompts mention it, but the
//    engine exposes every built-in tool to every agent. For an onboarding link
//    that risk is bounded. For "email anyone" it is not: an instruction hidden
//    in any client's inbound mail could talk an agent into emailing arbitrary
//    people. So this tool refuses unless the run was started by the operator's
//    own address. The prompt is guidance; this check is the lock.
//
// 2. REPLIES GO TO THE OPERATOR, NOT TO ATLAS.
//    The recipient is neither a prospect nor a client, so a reply to Atlas's own
//    reply-{id} address would be dropped by inbound auth and silently lost. The
//    Reply-To is the operator, so a reply always reaches a human.
//
// 3. THE "YOU'D GET YOUR OWN AGENT" LINE IS IN THE TEMPLATE, NOT LEFT TO ATLAS.
//    The recipient must not think Atlas now works for them. Atlas is asked to
//    say so, and the footer says so regardless, so it cannot be forgotten.
// ---------------------------------------------------------------------------

export interface OperatorSendInput {
  toName: string;
  toEmail: string;
  subject: string;
  /** Atlas-written plain text. Blank lines separate paragraphs. */
  body: string;
  /** The address that started this run. Must be the operator's. */
  senderEmail: string | undefined;
  callerAgentId: string;
  callerAgentName: string;
}

export interface OperatorSendResult {
  status: "sent" | "refused" | "error";
  message: string;
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const MAX_BODY_CHARS = 4_000;

/** "Kyle Kufuor <kyle@x.com>" or "kyle@x.com" -> "kyle@x.com", lowercased. */
export function extractAddress(raw: string | undefined): string | null {
  if (!raw) return null;
  const angled = raw.match(/<([^>]+)>/);
  const addr = (angled ? angled[1] : raw).trim().toLowerCase();
  return EMAIL_RE.test(addr) ? addr : null;
}

/**
 * Same rule as oracle/index.ts getOperatorAllowlist(): a single OPERATOR_EMAIL,
 * lowercased. Kept in sync by hand because shared/ cannot import from oracle/.
 * Empty or unset means nobody is the operator, so this fails closed.
 */
export function isOperator(senderEmail: string | undefined): boolean {
  const operator = (process.env.OPERATOR_EMAIL ?? "").toLowerCase().trim();
  if (!operator) return false;
  return extractAddress(senderEmail) === operator;
}

export async function sendEmailForOperator(input: OperatorSendInput): Promise<OperatorSendResult> {
  // 1) The lock. Nothing below runs unless the operator started this run.
  if (!isOperator(input.senderEmail)) {
    logger.warn("send_email_for_operator refused: run not started by the operator", {
      callerAgentId: input.callerAgentId,
    });
    return {
      status: "refused",
      message:
        "Refused. Only the platform operator can ask me to email someone on the business's behalf, and this request did not come from them. Nothing was sent.",
    };
  }

  const to = extractAddress(input.toEmail);
  if (!to) {
    return { status: "error", message: `"${input.toEmail}" is not a valid email address. Nothing was sent.` };
  }
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!subject) return { status: "error", message: "No subject line. Nothing was sent." };
  if (!body) return { status: "error", message: "No message body. Nothing was sent." };
  if (body.length > MAX_BODY_CHARS) {
    return {
      status: "error",
      message: `The message is ${body.length} characters; keep it under ${MAX_BODY_CHARS}. A first email should be short. Nothing was sent.`,
    };
  }

  const firstName = (input.toName ?? "").trim().split(/\s+/)[0] || "there";
  const operator = (process.env.OPERATOR_EMAIL ?? "").toLowerCase().trim();
  const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://portal.ambitt.agency";

  try {
    const { sendEmail } = await import("../email.js");
    await sendEmail({
      agentId: input.callerAgentId,
      agentName: input.callerAgentName,
      to,
      subject,
      html: renderOperatorEmail({ firstName, body, portalBase }),
      replyToAddress: operator,
      emailType: "operator_outreach",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("send_email_for_operator: send failed", { callerAgentId: input.callerAgentId, err: msg });
    return { status: "error", message: `The send failed: ${msg}` };
  }

  logger.info("send_email_for_operator: sent", { callerAgentId: input.callerAgentId, subject });
  return {
    status: "sent",
    message: `Sent to ${input.toName || to} <${to}> with the subject "${subject}". Replies will go to the operator, not to me.`,
  };
}

/** Exported for tests. */
export function renderOperatorEmail(input: { firstName: string; body: string; portalBase: string }): string {
  const paragraphs = input.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="font-size:15px;color:#404040;margin:0 0 16px;line-height:1.7;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`,
    )
    .join("\n  ");

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;color:#171717;">
  <div style="margin-bottom:28px;">
    <img src="${input.portalBase}/brand/ambitt-agents-lockup.svg" alt="Ambitt Agents" width="220" height="27" style="display:block;max-width:220px;height:auto;" />
  </div>
  <p style="font-size:15px;color:#404040;margin:0 0 16px;line-height:1.6;">Hi ${escapeHtml(input.firstName)},</p>
  ${paragraphs}
  <p style="font-size:15px;color:#404040;margin:24px 0 0;line-height:1.6;">Atlas<br /><span style="color:#737373;">Ambitt Agents</span></p>
  <div style="margin-top:32px;padding-top:18px;border-top:1px solid #ececec;">
    <p style="font-size:12.5px;color:#8a8a8a;margin:0 0 6px;line-height:1.6;">
      I'm Atlas, an agent at Ambitt. I researched your business and wrote this myself.
      Businesses that work with us get their own agent, named for them, that does work like this every day.
    </p>
    <p style="font-size:12.5px;color:#8a8a8a;margin:0;line-height:1.6;">
      Replies to this email go to our team.
    </p>
  </div>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
