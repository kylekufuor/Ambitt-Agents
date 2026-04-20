import prisma from "../../shared/db.js";
import { sendEmail, type EmailAttachment } from "../../shared/email.js";
import { buildAgentResponseEmail } from "../templates/agent-response.js";
import logger from "../../shared/logger.js";

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
}

export async function dispatchAgentResponse(input: DispatchInput): Promise<
  { mode: "immediate"; emailId?: string } | { mode: "queued"; scheduledEmailId: string }
> {
  const { agentId, runtimeOutput, isReply } = input;

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      name: true,
      purpose: true,
      emailFrequency: true,
      clientId: true,
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
      agentRole: agent.purpose,
      clientBusinessName: agent.client.businessName,
      responseBody,
      toolsUsed: runtimeOutput.toolsUsed,
      proactiveInsights: proactiveInsights.length > 0 ? proactiveInsights : undefined,
    });

    await sendEmail({
      agentId,
      agentName: agent.name,
      to: agent.client.email,
      subject: isReply
        ? `Re: ${agent.name} — ${agent.client.businessName}`
        : `${agent.name} — ${agent.client.businessName}`,
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
