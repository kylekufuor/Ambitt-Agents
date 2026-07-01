import prisma from "../db.js";
import logger from "../logger.js";
import { executeTool } from "../mcp/composio.js";

// ---------------------------------------------------------------------------
// send_mail_merge — personalized bulk outreach through the client's Gmail
// ---------------------------------------------------------------------------
// The YAMM replacement: one subject/body template with {{placeholders}} + a
// list of recipient rows. Each row's values fill the template, and each email
// is sent from the CLIENT's connected Gmail (via Composio), throttled to
// protect deliverability. Respects the daily outreach cap; extras are carried
// to the next working day.
//
// SAFETY: this actually sends email on the client's behalf. Two guards:
//   1. Dry-run: if the agent is in dry-run mode, NOTHING is sent — the batch
//      is captured to DryRunLog for operator review (mirrors the platform's
//      other dry-run intercepts).
//   2. Daily cap: never sends more than maxEmailsPerDay (minus what's already
//      gone out today).
// The supervised-approval gate upstream is the third layer — an agent should
// present the batch and get client approval before calling this.
// ---------------------------------------------------------------------------

export interface MailMergeRow {
  email: string;
  [key: string]: string | number | undefined;
}

export interface MailMergeInput {
  agentId: string;
  clientId: string;
  subjectTemplate: string;
  bodyTemplate: string;
  rows: MailMergeRow[];
}

/** Fill {{placeholders}} from a row. Unknown placeholders are left intact so
 *  a missing var is visible rather than silently blank. */
function fill(tpl: string, row: MailMergeRow): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_ ]+?)\s*\}\}/g, (_m, raw) => {
    const key = String(raw).trim();
    const v =
      row[key] ??
      row[key.toLowerCase()] ??
      row[key.replace(/\s+/g, "_").toLowerCase()];
    return v != null && v !== "" ? String(v) : `{{${key}}}`;
  });
}

export async function sendMailMerge(input: MailMergeInput): Promise<{ message: string; isError: boolean }> {
  const { agentId, clientId, subjectTemplate, bodyTemplate, rows } = input;
  if (!Array.isArray(rows) || rows.length === 0) {
    return { message: "send_mail_merge: no recipient rows provided.", isError: true };
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { dryRun: true, maxEmailsPerDay: true },
  });
  const dryRun = !!agent?.dryRun;
  const cap = agent?.maxEmailsPerDay ?? null;

  // Enforce the daily cap: only send up to (cap - already-sent-today).
  let toProcess = rows;
  if (cap && cap > 0) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sentToday = await prisma.emailSend.count({
      where: { agentId, acceptedAt: { gte: startOfDay } },
    });
    const remaining = Math.max(0, cap - sentToday);
    if (remaining <= 0) {
      return {
        message: `Daily send cap reached (${cap}/day, ${sentToday} already sent). Hold these for the next working day.`,
        isError: true,
      };
    }
    if (rows.length > remaining) toProcess = rows.slice(0, remaining);
  }

  const prepared = toProcess
    .map((r) => ({ to: (r.email ?? "").trim(), subject: fill(subjectTemplate, r), body: fill(bodyTemplate, r) }))
    .filter((p) => p.to && /.+@.+\..+/.test(p.to));

  const carried = rows.length - prepared.length;

  if (prepared.length === 0) {
    return { message: "send_mail_merge: no rows had a valid email address.", isError: true };
  }

  // Dry-run: capture, never send.
  if (dryRun) {
    await prisma.dryRunLog
      .create({
        data: {
          agentId,
          kind: "batch_email_send",
          payload: {
            count: prepared.length,
            samples: prepared.slice(0, 3),
          } as object,
        },
      })
      .catch(() => {});
    return {
      message: `Dry-run: captured ${prepared.length} personalized email(s) for review — nothing was sent. In live mode these would go out from the client's Gmail.`,
      isError: false,
    };
  }

  // Live send, one at a time with a human-like gap.
  let sent = 0;
  let failed = 0;
  for (const p of prepared) {
    try {
      const res = await executeTool(clientId, "GMAIL_SEND_EMAIL", {
        recipient_email: p.to,
        subject: p.subject,
        body: p.body,
        is_html: false,
      });
      if (res.success) {
        sent++;
        await prisma.emailSend
          .create({
            data: {
              agentId,
              clientId,
              to: p.to,
              subject: p.subject.slice(0, 300),
              status: "accepted",
              emailType: "mail_merge",
            },
          })
          .catch(() => {});
      } else {
        failed++;
        logger.warn("mail-merge send failed", { agentId, to: p.to, err: res.error });
      }
    } catch (err) {
      failed++;
      logger.warn("mail-merge send threw", { agentId, to: p.to, err: err instanceof Error ? err.message : String(err) });
    }
    // Throttle between sends — deliverability + anti-spam behaviour.
    await new Promise((r) => setTimeout(r, 900 + Math.floor(Math.random() * 900)));
  }

  const parts = [`Sent ${sent} personalized email${sent === 1 ? "" : "s"} via the client's Gmail`];
  if (failed) parts.push(`${failed} failed`);
  if (carried > 0) parts.push(`${carried} held for the next day (daily cap)`);
  return { message: parts.join(", ") + ".", isError: sent === 0 };
}
