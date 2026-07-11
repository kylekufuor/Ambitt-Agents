import prisma from "../../shared/db.js";
import { sendEmail, type EmailAttachment } from "../../shared/email.js";
import { buildAgentResponseEmail } from "../templates/agent-response.js";
import logger from "../../shared/logger.js";
import { checkOutboundSeatbelts, resolveSeatbeltConfig, type SeatbeltTrip } from "../../shared/seatbelts.js";
import { haltAgent } from "./pause-control.js";

// ---------------------------------------------------------------------------
// dispatchAgentResponse — single entry point for all agent-response email
// delivery. Inbound-email webhook, scheduler trigger, and any future caller
// should go through this helper.
//
// When agent.emailFrequency === "immediate" (default), behaves identically to
// the legacy `buildAgentResponseEmail + sendEmail` pairing that existed on
// each caller. When emailFrequency is "daily_digest" or "weekly_digest", the
// run is instead queued as a ScheduledEmail row (kind="digest_pending") and
// will be rolled up by the processDueDigests cron.
//
// Attachments: in digest mode we drop them but record their filenames in the
// payload, so the digest body can say "3 attachments this period" without
// re-materializing multi-megabyte PDFs per run.
// ---------------------------------------------------------------------------

export interface DispatchInput {
  agentId: string;
  runtimeOutput: {
    response: string;
    toolsUsed: Array<{ serverId: string; toolName: string; success: boolean }>;
    attachments: EmailAttachment[];
  };
  // When true, use the "Re: ..." subject form (inbound email reply). When
  // false, use the scheduled-run subject form. Mirrors the two call sites'
  // existing subjects so behaviour is a no-op when emailFrequency=immediate.
  isReply: boolean;
  // Override the reply-to recipient. Default behaviour (when omitted) is to
  // send to agent.client.email — the right thing for scheduled runs and
  // client conversations. Inbound-email replies should override this with the
  // actual sender (operator-mode → OPERATOR_EMAIL; prospect-mode → prospect.email)
  // so the reply goes where the email came from, not to Atlas's owning client.
  recipientEmail?: string;
}

export async function dispatchAgentResponse(input: DispatchInput): Promise<
  | { mode: "immediate"; emailId?: string }
  | { mode: "queued"; scheduledEmailId: string }
  | { mode: "blocked_seatbelt"; tripped?: SeatbeltTrip; reason?: string }
> {
  const { agentId, runtimeOutput, isReply, recipientEmail } = input;

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      name: true,
      purpose: true,
      emailFrequency: true,
      clientId: true,
      communicationSettings: true,
      client: { select: { email: true, businessName: true } },
    },
  });

  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  if (!agent.client) throw new Error(`Agent ${agentId} has no client`);

  const mode = agent.emailFrequency === "immediate" ? "immediate" : "queued";

  if (mode === "immediate") {
    // Split any trailing "## Proactive insights" section off the response so
    // it renders in a dedicated email block rather than inline prose. Claude
    // is instructed to use this heading (see prompt-assembler.ts).
    const { body: responseBody, insights: proactiveInsights } = extractProactiveInsights(runtimeOutput.response);

    const responseHtml = buildAgentResponseEmail({
      agentName: agent.name,
      agentId,
      // A short, human role for the signature — NOT the full internal operating
      // brief (agent.purpose contains directives like "NEVER price autonomously"
      // that must never reach a client). First clause, capped.
      agentRole: (agent.purpose || "").split(/[.\n]/)[0].slice(0, 60).trim() || "Ambitt Agents",
      clientBusinessName: agent.client.businessName,
      responseBody,
      toolsUsed: runtimeOutput.toolsUsed,
      proactiveInsights: proactiveInsights.length > 0 ? proactiveInsights : undefined,
    });

    const to = recipientEmail ?? agent.client.email;
    const subject = isReply
      ? `Re: ${agent.name} — ${agent.client.businessName}`
      : `${agent.name} — ${agent.client.businessName}`;

    // Outbound seatbelt (control-plane Pillar 4). If this agent is looping —
    // too many sends in a short window, or the same message repeated to the
    // same recipient — block the send, system-pause the agent (operator-only
    // resume), and alert the operator. Defense-in-depth behind the inbound
    // machine-email guard: catches a runaway even if the trigger wasn't email.
    const seatbeltCfg = resolveSeatbeltConfig(agent.communicationSettings);
    const verdict = await checkOutboundSeatbelts(prisma, { agentId, recipient: to, subject, bodyText: responseBody }, seatbeltCfg);
    if (!verdict.allowed) {
      await haltAgent(prisma, { agentId, by: "system", reason: `seatbelt:${verdict.tripped} — ${verdict.reason ?? ""}`.slice(0, 300) });
      logger.warn("Outbound seatbelt tripped — send blocked, agent system-paused", { agentId, to, tripped: verdict.tripped, reason: verdict.reason });
      try {
        const { sendWhatsApp } = await import("../../shared/whatsapp.js");
        const kyle = process.env.KYLE_WHATSAPP_NUMBER;
        if (kyle) {
          await sendWhatsApp({
            to: kyle,
            message: `🚨 Seatbelt tripped for ${agent.name} (${agentId}): ${verdict.tripped}. ${verdict.reason ?? ""}\nAgent auto-paused (system). Resume from the dashboard when it's safe.`,
          });
        }
      } catch (e) {
        logger.warn("Seatbelt operator alert (WhatsApp) failed", { agentId, err: e instanceof Error ? e.message : String(e) });
      }
      return { mode: "blocked_seatbelt", tripped: verdict.tripped, reason: verdict.reason };
    }

    await sendEmail({
      agentId,
      agentName: agent.name,
      to,
      subject,
      html: responseHtml,
      replyToAgentId: agentId,
      attachments: runtimeOutput.attachments.length > 0 ? runtimeOutput.attachments : undefined,
    });

    return { mode: "immediate" };
  }

  // ---- Digest mode: queue the run; the cron rolls it up
  const attachmentMeta = runtimeOutput.attachments.map((a) => ({
    filename: a.filename,
    sizeBytes: a.content.byteLength,
  }));

  const payload = JSON.stringify({
    response: runtimeOutput.response,
    toolsUsed: runtimeOutput.toolsUsed,
    attachmentMeta,
    isReply,
    ranAt: new Date().toISOString(),
  });

  const row = await prisma.scheduledEmail.create({
    data: {
      agentId,
      clientId: agent.clientId,
      kind: "digest_pending",
      scheduledAt: new Date(), // "available since" — the cron picks up all pending rows at digest time
      status: "pending",
      payload,
    },
    select: { id: true },
  });

  logger.info("Agent response queued for digest", {
    agentId,
    scheduledEmailId: row.id,
    emailFrequency: agent.emailFrequency,
    responseLength: runtimeOutput.response.length,
    attachmentCount: runtimeOutput.attachments.length,
  });

  return { mode: "queued", scheduledEmailId: row.id };
}

// Extract a trailing "## Proactive insights" (case-insensitive, any pluralization)
// section from Claude's response text. Returns the body with that section
// stripped + the insight bullets as an array. If no such section exists,
// returns the original body and an empty insights array. Tolerant of minor
// formatting variance since Claude's output is free-form markdown.
export function extractProactiveInsights(raw: string): { body: string; insights: string[] } {
  const headingRegex = /\n?#+\s*proactive\s+insights?\s*\n/i;
  const match = raw.match(headingRegex);
  if (!match || match.index === undefined) {
    return { body: raw.trim(), insights: [] };
  }

  const before = raw.slice(0, match.index).trim();
  const after = raw.slice(match.index + match[0].length);

  // Pull bullet items until we hit a blank double-newline or another heading.
  const nextHeading = after.search(/\n#+\s/);
  const section = nextHeading === -1 ? after : after.slice(0, nextHeading);

  const insights = section
    .split(/\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter((line) => line.length > 0 && !line.match(/^#+/));

  return { body: before, insights };
}
