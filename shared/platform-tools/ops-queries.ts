import prisma from "../db.js";

// ---------------------------------------------------------------------------
// Atlas's ops-assistant toolbox — read-only views into the business state
// for the platform operator (Kyle). Only intended for use in operator-mode
// runs (sender === OPERATOR_EMAIL, gated by the operator-mode prompt prefix).
//
// Each function does a single Prisma query + formats the result as plain
// text Claude can read and weave into a natural reply. Returning text (not
// raw JSON) lets Atlas summarize naturally without re-formatting.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. Pipeline summary — the "where do I stand" one-liner
// ---------------------------------------------------------------------------

export async function pipelineSummary(): Promise<string> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [byStatus, prdsPending, quotesAwaitingConvert, recentDecisions, formsThisWeek] = await Promise.all([
    prisma.prospect.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { status: { notIn: ["archived", "ghosted"] } },
    }),
    prisma.prospect.count({
      where: {
        prdGeneratedAt: { not: null },
        prdApprovedAt: null,
        status: { notIn: ["archived", "ghosted"] },
      },
    }),
    prisma.prospect.count({
      where: {
        quoteAcceptedAt: { not: null },
        convertedClientId: null,
        status: { notIn: ["archived", "ghosted"] },
      },
    }),
    prisma.prospect.findMany({
      where: {
        OR: [
          { quoteAcceptedAt: { gte: oneWeekAgo } },
          { quoteDeniedAt: { gte: oneWeekAgo } },
        ],
      },
      select: { contactName: true, businessName: true, quoteAcceptedAt: true, quoteDeniedAt: true, convertedClientId: true },
      orderBy: [{ quoteAcceptedAt: "desc" }, { quoteDeniedAt: "desc" }],
      take: 10,
    }),
    prisma.prospect.count({
      where: { createdAt: { gte: oneWeekAgo } },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of byStatus) counts[row.status] = row._count._all;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const lines: string[] = [];
  lines.push(`# Pipeline as of ${now.toISOString().split("T")[0]}`);
  lines.push("");
  lines.push(`Total active prospects: ${total}`);
  lines.push(`Forms submitted past 7d: ${formsThisWeek}`);
  lines.push("");
  lines.push(`## Counts by status`);
  for (const s of ["discovery", "discovery_complete", "presentation_sent", "revising", "quote_pending", "quote_sent", "quote_denied", "accepted"]) {
    if (counts[s]) lines.push(`- ${s}: ${counts[s]}`);
  }
  lines.push("");
  lines.push(`## Needs your action`);
  lines.push(`- PRDs awaiting review: ${prdsPending}`);
  lines.push(`- Quotes accepted, Convert + Scaffold pending: ${quotesAwaitingConvert}`);
  lines.push("");
  if (recentDecisions.length > 0) {
    lines.push(`## Quote decisions past 7d (${recentDecisions.length})`);
    for (const p of recentDecisions) {
      const verdict = p.quoteAcceptedAt
        ? p.convertedClientId
          ? "Accepted · Converted"
          : "Accepted · Convert pending"
        : "Denied";
      lines.push(`- ${verdict}: ${p.contactName ?? "(no name)"} · ${p.businessName ?? "—"}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 2. List prospects — filtered table
// ---------------------------------------------------------------------------

export interface ListProspectsInput {
  status?: string;
  search?: string;
  limit?: number;
}

export async function listProspects(input: ListProspectsInput): Promise<string> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const where: Record<string, unknown> = {};
  if (input.status) where.status = input.status;
  if (input.search) {
    const q = input.search.trim();
    where.OR = [
      { contactName: { contains: q, mode: "insensitive" } },
      { businessName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.prospect.findMany({
    where,
    select: {
      id: true,
      email: true,
      contactName: true,
      businessName: true,
      status: true,
      lastActivityAt: true,
      presentationGeneratedAt: true,
      prdApprovedAt: true,
      quoteSentAt: true,
      quoteAcceptedAt: true,
      convertedClientId: true,
    },
    orderBy: { lastActivityAt: "desc" },
    take: limit,
  });

  if (rows.length === 0) return "No prospects match those filters.";

  const lines: string[] = [];
  lines.push(`# Prospects (${rows.length} returned${input.status ? `, status=${input.status}` : ""}${input.search ? `, search="${input.search}"` : ""})`);
  lines.push("");
  for (const p of rows) {
    const flags: string[] = [];
    if (p.presentationGeneratedAt) flags.push("proposal");
    if (p.prdApprovedAt) flags.push("PRD✓");
    if (p.quoteSentAt) flags.push("quote sent");
    if (p.quoteAcceptedAt) flags.push("accepted");
    if (p.convertedClientId) flags.push("converted");
    const flagStr = flags.length > 0 ? ` [${flags.join(" · ")}]` : "";
    lines.push(`- ${p.contactName ?? "(no name)"} · ${p.businessName ?? "—"} · ${p.email} · status=${p.status}${flagStr} · ${relTime(p.lastActivityAt)}`);
    lines.push(`  id: ${p.id}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 3. Get prospect — single deep-dive
// ---------------------------------------------------------------------------

export interface GetProspectInput {
  email_or_id: string;
}

export async function getProspect(input: GetProspectInput): Promise<string> {
  const key = input.email_or_id.trim();
  const isEmailish = key.includes("@");
  const p = await prisma.prospect.findFirst({
    where: isEmailish ? { email: key.toLowerCase() } : { id: key },
  });
  if (!p) return `No prospect found matching "${key}".`;

  const fd = (p.formData ?? {}) as Record<string, unknown>;
  const get = (k: string) => (typeof fd[k] === "string" ? (fd[k] as string) : "");
  const quoteDraft = p.quoteDraft as { pricing?: { setupCents?: number; monthlyCents?: number; tierLabel?: string } } | null;

  const lines: string[] = [];
  lines.push(`# Prospect detail`);
  lines.push("");
  lines.push(`**Contact:** ${p.contactName ?? "(no name)"} <${p.email}>`);
  lines.push(`**Business:** ${p.businessName ?? "—"}`);
  lines.push(`**Role:** ${p.role ?? "—"}`);
  lines.push(`**Website:** ${p.website ?? "—"}`);
  lines.push(`**Status:** ${p.status}`);
  lines.push(`**Token:** ${p.token}`);
  lines.push(`**Created:** ${p.createdAt.toISOString()}`);
  lines.push(`**Last activity:** ${relTime(p.lastActivityAt)}`);
  lines.push("");
  lines.push(`## Form intake`);
  lines.push(`- Agent name: ${get("agentName") || "—"}`);
  lines.push(`- Agent role: ${get("agentRole") || "—"}`);
  lines.push(`- Pitch: ${get("agentPitch") || "—"}`);
  lines.push(`- Industry: ${get("industry") || "—"}`);
  lines.push(`- Run mode: ${get("cadence") || "—"}`);
  lines.push(`- Volume: ${get("volume") || "—"}`);
  lines.push(`- Channel: ${get("channel") || "—"}`);
  lines.push(`- Autonomy: ${get("autonomy") || "—"}`);
  lines.push("");
  lines.push(`## Funnel state`);
  lines.push(`- Presentation: ${p.presentationGeneratedAt ? relTime(p.presentationGeneratedAt) : "not generated"}`);
  lines.push(`- PRD generated: ${p.prdGeneratedAt ? relTime(p.prdGeneratedAt) : "not generated"}`);
  lines.push(`- PRD approved: ${p.prdApprovedAt ? relTime(p.prdApprovedAt) : "not approved"}`);
  lines.push(`- Quote draft: ${quoteDraft ? "present" : "none"}`);
  if (quoteDraft?.pricing) {
    const pr = quoteDraft.pricing;
    lines.push(`  · Pricing: ${formatCents(pr.setupCents)} setup + ${formatCents(pr.monthlyCents)}/mo (${pr.tierLabel ?? "—"})`);
  }
  lines.push(`- Quote sent: ${p.quoteSentAt ? relTime(p.quoteSentAt) : "not sent"}`);
  lines.push(`- Quote accepted: ${p.quoteAcceptedAt ? relTime(p.quoteAcceptedAt) : "not accepted"}`);
  if (p.quoteDeniedAt) {
    lines.push(`- Quote DENIED: ${relTime(p.quoteDeniedAt)}${p.quoteDeniedReason ? ` — "${p.quoteDeniedReason}"` : ""}`);
  }
  lines.push(`- Converted to Client: ${p.convertedClientId ?? "not converted"}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 4. List agents — filtered fleet view
// ---------------------------------------------------------------------------

export interface ListAgentsInput {
  status?: string;
  clientId?: string;
  limit?: number;
}

export async function listAgents(input: ListAgentsInput): Promise<string> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const where: Record<string, unknown> = {};
  if (input.status) where.status = input.status;
  if (input.clientId) where.clientId = input.clientId;
  const rows = await prisma.agent.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      agentType: true,
      status: true,
      schedule: true,
      lastRunAt: true,
      monthlyRetainerCents: true,
      pricingTier: true,
      client: { select: { id: true, businessName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (rows.length === 0) return "No agents match those filters.";
  const lines: string[] = [];
  lines.push(`# Agents (${rows.length} returned${input.status ? `, status=${input.status}` : ""})`);
  lines.push("");
  for (const a of rows) {
    lines.push(`- ${a.name} · ${a.email} · ${a.agentType} · status=${a.status} · ${a.client.businessName}`);
    lines.push(`  tier=${a.pricingTier} retainer=${formatCents(a.monthlyRetainerCents)}/mo · sched="${a.schedule || "triggered"}" · last run ${a.lastRunAt ? relTime(a.lastRunAt) : "never"}`);
    lines.push(`  id: ${a.id} · clientId: ${a.client.id}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 5. Get agent — single deep-dive
// ---------------------------------------------------------------------------

export interface GetAgentInput {
  email_or_id: string;
}

export async function getAgent(input: GetAgentInput): Promise<string> {
  const key = input.email_or_id.trim();
  const isEmailish = key.includes("@");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const a = await prisma.agent.findFirst({
    where: isEmailish ? { email: key.toLowerCase() } : { id: key },
    include: {
      client: { select: { id: true, businessName: true, email: true } },
    },
  });
  if (!a) return `No agent found matching "${key}".`;

  const [mtdUsage, recentTurns] = await Promise.all([
    prisma.apiUsage.aggregate({
      where: { agentId: a.id, createdAt: { gte: monthStart } },
      _sum: { costInCents: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.conversationMessage.findMany({
      where: { agentId: a.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { role: true, content: true, createdAt: true, channel: true },
    }),
  ]);

  const lines: string[] = [];
  lines.push(`# Agent detail`);
  lines.push("");
  lines.push(`**${a.name}** · ${a.email}`);
  lines.push(`**Owner:** ${a.client.businessName} <${a.client.email}>`);
  lines.push(`**Type:** ${a.agentType} · **Status:** ${a.status}`);
  lines.push(`**Approved:** ${a.approvedAt ? relTime(a.approvedAt) : "not yet"}`);
  lines.push(`**Last run:** ${a.lastRunAt ? relTime(a.lastRunAt) : "never"}`);
  lines.push("");
  lines.push(`## Runtime config`);
  lines.push(`- Schedule: ${a.schedule || "(triggered, no cron)"} · tz=${a.timezone}`);
  lines.push(`- Autonomy: ${a.autonomyLevel}`);
  lines.push(`- Channel: ${a.deliveryFormat} · freq=${a.emailFrequency}`);
  lines.push(`- Models: primary=${a.primaryModel}`);
  lines.push("");
  lines.push(`## Commercial`);
  lines.push(`- Tier: ${a.pricingTier}`);
  lines.push(`- Setup fee: ${formatCents(a.setupFeeCents)}`);
  lines.push(`- Monthly retainer: ${formatCents(a.monthlyRetainerCents)}`);
  lines.push(`- Interaction count: ${a.interactionCount} / ${a.interactionLimit === -1 ? "unlimited" : a.interactionLimit}`);
  lines.push(`- Budget: ${formatCents(a.budgetMonthlyCents)}/mo`);
  lines.push("");
  lines.push(`## Cost this month`);
  const cost = mtdUsage._sum.costInCents ?? 0;
  const inputTok = mtdUsage._sum.inputTokens ?? 0;
  const outputTok = mtdUsage._sum.outputTokens ?? 0;
  const calls = mtdUsage._count._all;
  lines.push(`- ${formatCents(cost)} across ${calls} API call(s) · ${inputTok.toLocaleString()} in / ${outputTok.toLocaleString()} out tokens`);
  lines.push("");
  if (recentTurns.length > 0) {
    lines.push(`## Last ${recentTurns.length} conversation turn(s)`);
    for (const t of recentTurns) {
      const preview = t.content.replace(/\s+/g, " ").slice(0, 160) + (t.content.length > 160 ? "…" : "");
      lines.push(`- [${relTime(t.createdAt)}] ${t.role} (${t.channel}): ${preview}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 6. Cost summary — MTD spend by model + by agent
// ---------------------------------------------------------------------------

export interface CostSummaryInput {
  period?: "this_month" | "last_month" | "past_7_days";
}

export async function costSummary(input: CostSummaryInput): Promise<string> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let start: Date;
  let end: Date | undefined;
  let label: string;
  switch (input.period ?? "this_month") {
    case "last_month":
      start = lastMonthStart;
      end = monthStart;
      label = "Last month";
      break;
    case "past_7_days":
      start = weekAgo;
      label = "Past 7 days";
      break;
    case "this_month":
    default:
      start = monthStart;
      label = "Month-to-date";
  }
  const dateFilter: { gte: Date; lt?: Date } = { gte: start };
  if (end) dateFilter.lt = end;

  const rows = await prisma.apiUsage.findMany({
    where: { createdAt: dateFilter },
    select: { agentId: true, model: true, costInCents: true, inputTokens: true, outputTokens: true },
  });

  if (rows.length === 0) return `${label}: no API usage recorded.`;

  const total = rows.reduce((a, r) => a + r.costInCents, 0);
  const byModel = new Map<string, number>();
  const byAgent = new Map<string, number>();
  for (const r of rows) {
    byModel.set(r.model, (byModel.get(r.model) ?? 0) + r.costInCents);
    byAgent.set(r.agentId, (byAgent.get(r.agentId) ?? 0) + r.costInCents);
  }
  const agentNames = await prisma.agent.findMany({
    where: { id: { in: Array.from(byAgent.keys()) } },
    select: { id: true, name: true, client: { select: { businessName: true } } },
  });
  const nameMap = new Map(agentNames.map((a) => [a.id, `${a.name} (${a.client.businessName})`]));

  const lines: string[] = [];
  lines.push(`# Cost · ${label}`);
  lines.push("");
  lines.push(`**Total:** ${formatCents(total)} across ${rows.length} call(s)`);
  lines.push("");
  lines.push(`## By model`);
  for (const [model, cents] of [...byModel.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${model}: ${formatCents(cents)}`);
  }
  lines.push("");
  lines.push(`## By agent (top 10)`);
  for (const [agentId, cents] of [...byAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    lines.push(`- ${nameMap.get(agentId) ?? agentId}: ${formatCents(cents)}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relTime(d: Date | string): string {
  const t = new Date(d).getTime();
  const seconds = Math.floor((Date.now() - t) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatCents(cents: number | undefined | null): string {
  if (cents === null || cents === undefined) return "—";
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  if (dollars >= 1) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(4)}`; // sub-dollar precision for tiny costs
}
