import { Resend } from "resend";
import prisma from "../../shared/db.js";
import logger from "../../shared/logger.js";

/* ---------------------------------------------------------------------------
   Forward inbound mail that matches no agent to whoever operates the platform.

   Inbound resolves a recipient two ways: reply-{agentId}@ or an exact match on
   Agent.email. Everything else was logged "ignored" and discarded — including
   support@, hello@ and team@, which are printed on the website, in the privacy
   policy and terms, on the SMS opt-in page, and across the client portal. Mail
   to a published address vanished, silently, and the audit row said "ignored"
   rather than "lost".

   That was found the hard way: Twilio's toll-free verification declares
   support@ambitt.agency as both the notification address and the business
   contact, and a message to support@ was dropped two minutes after the filing
   went in.

   Why this does not go through shared/email.ts sendEmail():
     - A forward is someone else's mail. sendEmail applies the em-dash scrub to
       client-audience copy, and mangling a vendor's text would be wrong.
     - EmailSend.agentId is a hard foreign key to Agent, and a forward has no
       agent to attribute to. A synthetic id would fail that write.
   So this sends through Resend directly and records itself in the
   InboundEmailLog disposition instead.
   --------------------------------------------------------------------------- */

/**
 * Ceiling on forwards per rolling hour.
 *
 * A published address attracts spam eventually, and the failure mode of an
 * uncapped forwarder is burying the operator in exactly the inbox they use to
 * notice real problems. Past the cap, mail is still logged — it is visible as
 * `unrouted_capped` — it just stops being pushed.
 */
const HOURLY_FORWARD_CAP = 20;

export type ForwardOutcome =
  | "forwarded_operator"
  | "unrouted_capped"
  | "unrouted_no_operator"
  | "unrouted_foreign_domain"
  | "unrouted_loop_risk"
  | "unrouted_forward_failed";

export interface ForwardInput {
  toAddresses: string[];
  from: string;
  subject: string;
  emailId: string | null;
  /** Resend's event.data — may already carry text/html on synthetic payloads. */
  emailData: Record<string, unknown>;
}

function ourDomain(): string {
  return (process.env.EMAIL_DOMAIN || "ambitt.agency").toLowerCase();
}

export interface ForwardDecisionInput {
  toAddresses: string[];
  /** Envelope sender, used only to spot our own forwarder coming back round. */
  from: string;
  /** Our inbound domain, lower-case, no leading @. */
  domain: string;
  /** OPERATOR_EMAIL, or "" when unset. */
  operator: string;
  forwardsThisHour: number;
  cap: number;
}

export type ForwardDecision =
  | { forward: true; recipients: string[] }
  | { forward: false; outcome: Exclude<ForwardOutcome, "forwarded_operator" | "unrouted_forward_failed"> };

/**
 * Every reason not to forward, with no IO in sight.
 *
 * Split out because these are the rules worth being sure about — a wrong answer
 * here either loses mail or builds a mail loop — and a rule you can only
 * exercise by standing up a webhook and a mail provider is a rule that does not
 * get exercised.
 */
export function decideForward(input: ForwardDecisionInput): ForwardDecision {
  const { toAddresses, from, domain, operator, forwardsThisHour, cap } = input;

  // Only our own domain. Other domains on the same Resend account (mcquizzy.ai's
  // QA addresses, say) belong to a different product, and pushing them at this
  // operator would be noise rather than signal.
  const recipients = toAddresses.filter((a) => a.toLowerCase().trim().endsWith(`@${domain}`));
  if (recipients.length === 0) return { forward: false, outcome: "unrouted_foreign_domain" };

  if (!operator.trim()) return { forward: false, outcome: "unrouted_no_operator" };

  // An operator address on our own domain forwards to an address that is itself
  // unrouted, which forwards again. Refuse rather than build the loop.
  if (operator.trim().toLowerCase().endsWith(`@${domain}`)) {
    return { forward: false, outcome: "unrouted_loop_risk" };
  }

  // Our own forwarder arriving back in the inbox it forwards from.
  if (from.toLowerCase().includes(`forward@${domain}`)) {
    return { forward: false, outcome: "unrouted_loop_risk" };
  }

  if (forwardsThisHour >= cap) return { forward: false, outcome: "unrouted_capped" };

  return { forward: true, recipients };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pull the body from Resend's Received Emails API.
 *
 * The email.received webhook is metadata-only. Deliberately its own fetch
 * rather than sharing the handler's: that one runs after sender authorization
 * on the agent path, and this branch has no agent and therefore no concept of
 * an authorized sender. Keeping them separate means neither can quietly change
 * the other's ordering.
 */
async function fetchBody(emailId: string | null, emailData: Record<string, unknown>): Promise<string> {
  const inline = typeof emailData.text === "string" ? emailData.text : "";
  if (inline.trim()) return inline;
  if (!emailId) return "";

  const key = process.env.RESEND_INBOUND_KEY || process.env.RESEND_API_KEY || "";
  if (!key) return "";

  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      logger.warn("Unrouted forward: body fetch failed, forwarding headers only", {
        emailId,
        status: res.status,
        hint: res.status === 401 ? "RESEND_INBOUND_KEY needs a read-capable key" : undefined,
      });
      return "";
    }
    const full = (await res.json()) as Record<string, unknown>;
    if (typeof full.text === "string" && full.text.trim()) return full.text;
    if (typeof full.html === "string") return full.html.replace(/<[^>]+>/g, " ");
    return "";
  } catch (err) {
    logger.warn("Unrouted forward: body fetch threw", {
      emailId,
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

async function forwardsThisHour(): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.inboundEmailLog.count({
    where: { disposition: "forwarded_operator", createdAt: { gte: since } },
  });
}

/**
 * Forward one unrouted message. Returns the disposition to record.
 *
 * Never throws: this runs on the inbound webhook's drop path, and a failure to
 * forward must not turn a 200 into a Resend retry storm.
 */
export async function forwardUnroutedInbound(input: ForwardInput): Promise<ForwardOutcome> {
  const { toAddresses, from, subject, emailId, emailData } = input;
  const domain = ourDomain();
  const operator = (process.env.OPERATOR_EMAIL || "").trim();
  const fromAddress = `forward@${domain}`;

  const decision = decideForward({
    toAddresses,
    from,
    domain,
    operator,
    forwardsThisHour: await forwardsThisHour(),
    cap: HOURLY_FORWARD_CAP,
  });

  if (!decision.forward) {
    // Loudness by consequence: a misconfigured operator address is an error
    // because it silently disables the whole forwarder, while foreign-domain
    // mail is expected traffic and not worth a line at all.
    if (decision.outcome === "unrouted_loop_risk") {
      logger.error("Unrouted inbound not forwarded: would loop", {
        hint: `OPERATOR_EMAIL must be a mailbox outside ${domain}`,
      });
    } else if (decision.outcome === "unrouted_no_operator") {
      logger.warn("Unrouted inbound not forwarded: OPERATOR_EMAIL is not set", { to: toAddresses });
    } else if (decision.outcome === "unrouted_capped") {
      logger.warn("Unrouted inbound not forwarded: hourly cap reached", {
        cap: HOURLY_FORWARD_CAP,
        to: toAddresses,
      });
    }
    return decision.outcome;
  }

  const ours = decision.recipients;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.error("Unrouted inbound not forwarded: RESEND_API_KEY is not set");
    return "unrouted_forward_failed";
  }

  const body = await fetchBody(emailId, emailData);
  const recipients = ours.join(", ");
  const shownSubject = subject.trim() || "(no subject)";

  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1c2b31">`,
    `<p style="margin:0 0 4px"><strong>Forwarded from ${escapeHtml(recipients)}</strong></p>`,
    `<p style="margin:0 0 16px;color:#5b6b72">No agent owns this address, so it would otherwise have been dropped.</p>`,
    `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:13px;color:#5b6b72">`,
    `<tr><td style="padding-right:12px">From</td><td style="color:#1c2b31">${escapeHtml(from || "(unknown)")}</td></tr>`,
    `<tr><td style="padding-right:12px">To</td><td style="color:#1c2b31">${escapeHtml(recipients)}</td></tr>`,
    `<tr><td style="padding-right:12px">Subject</td><td style="color:#1c2b31">${escapeHtml(shownSubject)}</td></tr>`,
    `</table>`,
    `<hr style="border:none;border-top:1px solid #dfe6e8;margin:0 0 16px">`,
    body.trim()
      ? `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${escapeHtml(body.trim())}</pre>`
      : `<p style="margin:0;color:#8a999f"><em>Body unavailable — forwarding headers only. This usually means the Resend key in use is send-only and cannot read received mail.</em></p>`,
    `</div>`,
  ].join("");

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: `Ambitt Agents <${fromAddress}>`,
      to: [operator],
      subject: `[${recipients}] ${shownSubject}`,
      html,
      // Reply goes to whoever actually wrote in, so answering a message sent to
      // a published address is one keystroke rather than a copy-paste.
      replyTo: from || undefined,
    });
    if (result.error) throw new Error(result.error.message);

    logger.info("Unrouted inbound forwarded to operator", { to: recipients, emailId });
    return "forwarded_operator";
  } catch (err) {
    logger.error("Unrouted inbound forward failed", {
      to: recipients,
      emailId,
      error: err instanceof Error ? err.message : String(err),
    });
    return "unrouted_forward_failed";
  }
}
