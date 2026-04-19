import prisma from "../../shared/db.js";
import { callClaude, CLIENT_MODEL, logUsage } from "../../shared/claude.js";
import { sendAgentEmail } from "./emailRouter.js";
import { signChatToken } from "../../shared/chat-token.js";
import logger from "../../shared/logger.js";

// ---------------------------------------------------------------------------
// processDueDigests — hourly cron that rolls up queued agent runs into a
// single digest email per agent. Lives alongside processDueCheckpoints.
//
// Activation conditions for a given agent (evaluated with agent.timezone):
//   - status="active", emailFrequency in ("daily_digest", "weekly_digest")
//   - current hour in agent tz === agent.digestHour
//   - for weekly_digest: current weekday in agent tz === agent.digestDayOfWeek
//   - agent.lastDigestSentAt < start-of-current-period (prevents double-send
//     if the cron fires twice in the same hour)
//   - at least one ScheduledEmail(kind="digest_pending", status="pending") row
//     exists for the agent
//
// On fire:
//   1. Pull all pending rows (oldest first).
//   2. Ask Claude (Sonnet) for a 1-2 sentence period summary across runs.
//   3. Render DigestEmailProps and send via sendAgentEmail("digest").
//   4. Mark every rolled-up row sent, write an audit kind="digest" row, bump
//      agent.lastDigestSentAt.
// ---------------------------------------------------------------------------

const DIGEST_TICK_CAP = 10; // agents per tick — don't blast Claude on hour 0

export async function processDueDigests(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const now = new Date();

  const agents = await prisma.agent.findMany({
    where: {
      status: "active",
      emailFrequency: { in: ["daily_digest", "weekly_digest"] },
    },
    select: {
      id: true,
      name: true,
      purpose: true,
      timezone: true,
      emailFrequency: true,
      digestHour: true,
      digestDayOfWeek: true,
      lastDigestSentAt: true,
      clientId: true,
      client: {
        select: {
          email: true,
          businessName: true,
          contactName: true,
          preferredName: true,
        },
      },
    },
    take: 200, // pull wider list, filter by cadence below
  });

  const stats = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  let sentThisTick = 0;

  for (const agent of agents) {
    if (sentThisTick >= DIGEST_TICK_CAP) break;
    stats.processed++;

    if (!agent.client) { stats.skipped++; continue; }
    if (!isDigestDue(agent, now)) { stats.skipped++; continue; }

    const pending = await prisma.scheduledEmail.findMany({
      where: {
        agentId: agent.id,
        kind: "digest_pending",
        status: "pending",
      },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, payload: true, scheduledAt: true },
    });

    if (pending.length === 0) { stats.skipped++; continue; }

    try {
      const periodLabel = agent.emailFrequency === "weekly_digest" ? "This week" : "Today";
      await rollUpAndSend({ agent, pendingRows: pending, periodLabel, now });
      stats.sent++;
      sentThisTick++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Digest roll-up failed", { agentId: agent.id, error: message });
      stats.failed++;
      // Rows stay pending — next tick retries. If this fails repeatedly we'll
      // see it in logs.
    }
  }

  if (stats.processed > 0) logger.info("Digest cron tick complete", stats);
  return stats;
}

// ---------------------------------------------------------------------------

interface DigestAgent {
  id: string;
  name: string;
  purpose: string;
  timezone: string;
  emailFrequency: string;
  digestHour: number;
  digestDayOfWeek: number;
  lastDigestSentAt: Date | null;
  clientId: string;
  client: {
    email: string;
    businessName: string;
    contactName: string | null;
    preferredName: string | null;
  } | null;
}

function isDigestDue(agent: DigestAgent, now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: agent.timezone,
    hour: "numeric",
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour12: false,
  }).formatToParts(now);

  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "-1", 10);
  const weekdayLabel = parts.find((p) => p.type === "weekday")?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[weekdayLabel] ?? -1;

  if (hour !== agent.digestHour) return false;
  if (agent.emailFrequency === "weekly_digest" && weekday !== agent.digestDayOfWeek) return false;

  // Double-send guard: if we already sent in the current period, skip.
  if (agent.lastDigestSentAt) {
    const lastParts = new Intl.DateTimeFormat("en-US", {
      timeZone: agent.timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(agent.lastDigestSentAt);
    const lastDay = `${lastParts.find((p) => p.type === "year")?.value}-${lastParts.find((p) => p.type === "month")?.value}-${lastParts.find((p) => p.type === "day")?.value}`;
    const nowDay = `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
    if (lastDay === nowDay) return false; // already sent today in agent tz
  }

  return true;
}

interface PendingRow {
  id: string;
  payload: string | null;
  scheduledAt: Date;
}

interface RunPayload {
  response: string;
  toolsUsed: Array<{ serverId: string; toolName: string; success: boolean }>;
  attachmentMeta: Array<{ filename: string; sizeBytes: number }>;
  isReply: boolean;
  ranAt: string;
}

function parsePayload(raw: string | null): RunPayload | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj.response !== "string") return null;
    return {
      response: obj.response,
      toolsUsed: Array.isArray(obj.toolsUsed) ? obj.toolsUsed : [],
      attachmentMeta: Array.isArray(obj.attachmentMeta) ? obj.attachmentMeta : [],
      isReply: Boolean(obj.isReply),
      ranAt: typeof obj.ranAt === "string" ? obj.ranAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function rollUpAndSend(opts: {
  agent: DigestAgent;
  pendingRows: PendingRow[];
  periodLabel: string;
  now: Date;
}): Promise<void> {
  const { agent, pendingRows, periodLabel, now } = opts;
  if (!agent.client) throw new Error("agent.client missing");

  const runs = pendingRows.map((r) => parsePayload(r.payload)).filter((p): p is RunPayload => p !== null);
  if (runs.length === 0) {
    // All payloads unparseable — mark rows failed so they don't re-trigger every hour.
    await prisma.scheduledEmail.updateMany({
      where: { id: { in: pendingRows.map((r) => r.id) } },
      data: { status: "failed", errorMessage: "payload unparseable" },
    });
    throw new Error("no parseable payloads in batch");
  }

  // --- Claude synthesis: 1-2 sentence summary across all runs
  const summary = await synthesizeDigestSummary(agent, runs, periodLabel);

  // --- Stats grid
  const totalTools = runs.reduce((sum, r) => sum + r.toolsUsed.length, 0);
  const totalAttachments = runs.reduce((sum, r) => sum + r.attachmentMeta.length, 0);
  // StatItem requires delta/deltaType; for a v1 digest we have no prior-period
  // baseline to compute deltas against, so pass empty strings and default "up".
  // TODO: once we track prior digests, surface week-over-week deltas here.
  const stats = [
    { value: String(runs.length), label: "runs", delta: "", deltaType: "up" as const },
    { value: String(totalTools), label: "tool calls", delta: "", deltaType: "up" as const },
    { value: String(totalAttachments), label: "attachments", delta: "", deltaType: "up" as const },
  ];

  // --- Tasks table: one row per run
  const tasksTable = runs.map((r) => {
    const firstLine = r.response.split(/\n/)[0].slice(0, 160).trim();
    const toolCount = r.toolsUsed.length;
    const anyFailed = r.toolsUsed.some((t) => !t.success);
    return {
      task: firstLine || "(no summary)",
      output: toolCount > 0 ? `${toolCount} tools used` : "no tools used",
      status: anyFailed ? "warn" : "done",
      statusType: (anyFailed ? "warn" : "done") as "done" | "warn",
    };
  });

  // --- CTA: chat link with a signed token so the client can reply in-browser
  const chatBase = process.env.CHAT_BASE_URL ?? "https://chat.ambitt.agency";
  const token = signChatToken(agent.clientId, agent.id);
  const ctaUrl = `${chatBase}/${agent.id}?t=${token}`;

  const clientName =
    agent.client.preferredName ??
    agent.client.contactName?.split(" ")[0] ??
    agent.client.businessName;

  await sendAgentEmail({
    trigger: "digest",
    to: agent.client.email,
    agentName: agent.name,
    agentId: agent.id,
    clientName,
    clientId: agent.clientId,
    productName: agent.client.businessName,
    periodLabel,
    summary,
    stats,
    tasksTable,
    sourceLinks: [],
    recommendations: [], // v1: skip — recommendations live in their own table
    ctaUrl,
  });

  // --- Mark all rolled-up rows sent + write audit row + bump lastDigestSentAt
  await prisma.$transaction([
    prisma.scheduledEmail.updateMany({
      where: { id: { in: pendingRows.map((r) => r.id) } },
      data: { status: "sent", sentAt: now },
    }),
    prisma.scheduledEmail.create({
      data: {
        agentId: agent.id,
        clientId: agent.clientId,
        kind: "digest",
        scheduledAt: now,
        status: "sent",
        sentAt: now,
        payload: JSON.stringify({ rolledUpIds: pendingRows.map((r) => r.id), runCount: runs.length }),
      },
    }),
    prisma.agent.update({
      where: { id: agent.id },
      data: { lastDigestSentAt: now },
    }),
  ]);

  logger.info("Digest sent", {
    agentId: agent.id,
    runCount: runs.length,
    totalTools,
    totalAttachments,
    period: periodLabel,
  });
}

async function synthesizeDigestSummary(
  agent: DigestAgent,
  runs: RunPayload[],
  periodLabel: string
): Promise<string> {
  const systemPrompt = `You are ${agent.name}, an AI agent working for ${agent.client?.businessName}. Your role: ${agent.purpose}.

Write a 1-2 sentence summary of the work you've done in the current period that introduces a digest email to your client. Plain-English, conversational. No preamble. Use first person ("I") and reference concrete actions where possible. Do not list individual items — the email body has a table. Start with something like "${periodLabel} I …" or a similar opener.`;

  const userMessage = `Here are summaries of each thing I did this period (most recent last):\n\n${runs
    .map((r, i) => `--- Run ${i + 1} (${new Date(r.ranAt).toISOString()}):\n${r.response.slice(0, 1200)}`)
    .join("\n\n")}`;

  const response = await callClaude({
    systemPrompt,
    userMessage,
    model: CLIENT_MODEL,
    maxTokens: 200,
    temperature: 0.6,
    cacheSystemPrompt: false, // system prompt varies by agent; cache hit rate would be ~0
  });

  // Fire-and-forget usage log. Mark non-primary so it doesn't inflate run counts.
  void logUsage(agent.id, "digest_synthesis", {
    content: response.content,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    totalTokens: response.totalTokens,
    cacheCreationTokens: response.cacheCreationTokens,
    cacheReadTokens: response.cacheReadTokens,
    model: response.model,
    isPrimaryRun: false,
  }).catch((err) => {
    logger.warn("logUsage failed for digest synthesis", { agentId: agent.id, err: (err as Error).message });
  });

  return response.content.trim() || `${periodLabel} I completed ${runs.length} tasks for ${agent.client?.businessName}.`;
}
