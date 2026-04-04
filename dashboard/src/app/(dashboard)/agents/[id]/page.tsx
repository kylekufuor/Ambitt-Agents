import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { recalcCostCents, centsToUsd, projectMonthEnd } from "@/lib/costs";
import { AgentTabs } from "./agent-tabs";

export const dynamic = "force-dynamic";

async function getAgentData(id: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const daysElapsed = Math.max(1, (now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const [agent, tasks, conversations, thisMonthUsage, lastMonthUsage] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, businessName: true, industry: true } },
      },
    }),
    prisma.task.findMany({
      where: { agentId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.conversationMessage.findMany({
      where: { agentId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.apiUsage.findMany({
      where: { agentId: id, createdAt: { gte: monthStart } },
      select: { model: true, inputTokens: true, outputTokens: true, costInCents: true },
    }),
    prisma.apiUsage.findMany({
      where: { agentId: id, createdAt: { gte: lastMonthStart, lt: monthStart } },
      select: { model: true, inputTokens: true, outputTokens: true, costInCents: true },
    }),
  ]);

  if (!agent) return null;

  // Recalculate costs accurately
  let thisMonthCost = 0;
  let thisMonthCalls = 0;
  for (const row of thisMonthUsage) {
    thisMonthCost += recalcCostCents(row.model, row.inputTokens, row.outputTokens, row.costInCents);
    thisMonthCalls++;
  }

  let lastMonthCost = 0;
  for (const row of lastMonthUsage) {
    lastMonthCost += recalcCostCents(row.model, row.inputTokens, row.outputTokens, row.costInCents);
  }

  const projectedCost = projectMonthEnd(thisMonthCost, daysElapsed, daysInMonth, lastMonthCost > 0 ? lastMonthCost : undefined);
  const burnPct = agent.budgetMonthlyCents > 0 ? Math.min((thisMonthCost / agent.budgetMonthlyCents) * 100, 100) : 0;

  // Parse memory and documents
  let memoryEntries: { key: string; value: string }[] = [];
  let documents: { filename: string; uploadedAt: string }[] = [];
  try {
    const parsed = JSON.parse(agent.clientMemoryObject);
    // Extract documents separately
    if (Array.isArray(parsed.documents)) {
      documents = parsed.documents;
    }
    memoryEntries = Object.entries(parsed)
      .filter(([key]) => key !== "documents" && key !== "documentContents")
      .map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : JSON.stringify(value),
      }));
  } catch { /* encrypted or empty */ }

  return {
    agent,
    documents,
    tasks: tasks.map((t) => ({
      id: t.id,
      taskType: t.taskType,
      description: t.description,
      status: t.status,
      rawOutput: t.rawOutput,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
    })),
    conversations: conversations.map((c) => ({
      id: c.id,
      role: c.role,
      content: c.content,
      channel: c.channel,
      createdAt: c.createdAt.toISOString(),
    })),
    memoryEntries,
    stats: {
      thisMonthCost,
      projectedCost,
      lastMonthCost,
      thisMonthCalls,
      burnPct,
    },
  };
}

async function agentAction(formData: FormData) {
  "use server";
  const agentId = formData.get("agentId") as string;
  const action = formData.get("action") as string;
  const oracleUrl = process.env.ORACLE_URL ?? "https://ambitt-agents-production.up.railway.app";
  await fetch(`${oracleUrl}/agents/${agentId}/${action}`, { method: "POST" });
  const { redirect } = await import("next/navigation");
  redirect(`/agents/${agentId}`);
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getAgentData(id);
  if (!data) notFound();

  const { agent, documents, tasks, conversations, memoryEntries, stats } = data;

  const statusColors: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    pending_approval: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
    paused: "bg-muted text-muted-foreground ring-1 ring-border",
    killed: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
  };

  const burnColor = stats.burnPct >= 100 ? "bg-red-500" : stats.burnPct >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/agents" className="text-muted-foreground hover:text-foreground transition-colors">Agents</Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-foreground">{agent.name}</span>
      </div>

      {/* Agent Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{agent.name}</h1>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider ${statusColors[agent.status] ?? "bg-muted text-muted-foreground"}`}>
              {agent.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {agent.email} — <Link href={`/clients/${agent.client.id}`} className="hover:text-foreground transition-colors">{agent.client.businessName}</Link>
          </p>
          <p className="text-muted-foreground/60 text-xs mt-1 max-w-2xl">{agent.purpose}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {agent.status === "active" && (
            <>
              <form action={agentAction}>
                <input type="hidden" name="agentId" value={agent.id} />
                <input type="hidden" name="action" value="run" />
                <button className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 ring-1 ring-blue-500/20 transition-colors">
                  Run Now
                </button>
              </form>
              <form action={agentAction}>
                <input type="hidden" name="agentId" value={agent.id} />
                <input type="hidden" name="action" value="pause" />
                <button className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 ring-1 ring-amber-500/20 transition-colors">
                  Pause
                </button>
              </form>
            </>
          )}
          {agent.status === "paused" && (
            <form action={agentAction}>
              <input type="hidden" name="agentId" value={agent.id} />
              <input type="hidden" name="action" value="approve" />
              <button className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20 transition-colors">
                Resume
              </button>
            </form>
          )}
          {agent.status === "pending_approval" && (
            <>
              <form action={agentAction}>
                <input type="hidden" name="agentId" value={agent.id} />
                <input type="hidden" name="action" value="approve" />
                <button className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20 transition-colors">
                  Approve
                </button>
              </form>
              <form action={agentAction}>
                <input type="hidden" name="agentId" value={agent.id} />
                <input type="hidden" name="action" value="reject" />
                <button className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 ring-1 ring-red-500/20 transition-colors">
                  Reject
                </button>
              </form>
            </>
          )}
          {agent.status !== "killed" && (
            <form action={agentAction}>
              <input type="hidden" name="agentId" value={agent.id} />
              <input type="hidden" name="action" value="kill" />
              <button className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 ring-1 ring-red-500/20 transition-colors">
                Kill
              </button>
            </form>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Tasks Completed</p>
          <p className="text-3xl font-bold text-foreground mt-2 tabular-nums">{agent.totalTasksCompleted}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Cost (MTD)</p>
          <p className="text-3xl font-bold text-foreground mt-2 tabular-nums">{centsToUsd(stats.thisMonthCost)}</p>
          <p className="text-muted-foreground/60 text-xs mt-1">{stats.thisMonthCalls} calls</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Projected</p>
          <p className={`text-3xl font-bold mt-2 tabular-nums ${stats.projectedCost > agent.budgetMonthlyCents ? "text-red-400" : "text-foreground"}`}>
            {centsToUsd(stats.projectedCost)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Budget Burn</p>
          <div className="mt-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-foreground font-bold text-lg tabular-nums">{stats.burnPct.toFixed(0)}%</span>
              <span className="text-muted-foreground tabular-nums">{centsToUsd(agent.budgetMonthlyCents)}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${burnColor}`} style={{ width: `${stats.burnPct}%` }} />
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Last Run</p>
          <p className="text-foreground text-sm font-medium mt-2">
            {agent.lastRunAt ? timeAgo(agent.lastRunAt) : "Never"}
          </p>
          {agent.nextScheduledRun && (
            <p className="text-muted-foreground/60 text-xs mt-1">
              Next: {new Date(agent.nextScheduledRun).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <AgentTabs
        agentId={agent.id}
        agentStatus={agent.status}
        tasks={tasks}
        conversations={conversations}
        memoryEntries={memoryEntries}
        documents={documents}
        config={{
          personality: agent.personality,
          schedule: agent.schedule,
          autonomyLevel: agent.autonomyLevel,
          tools: agent.tools,
          primaryModel: agent.primaryModel,
          analyticsModel: agent.analyticsModel,
          creativeModel: agent.creativeModel,
          monthlyRetainerCents: agent.monthlyRetainerCents,
          setupFeeCents: agent.setupFeeCents,
          budgetMonthlyCents: agent.budgetMonthlyCents,
          historyTier: agent.historyTier,
          clientNorthStar: agent.clientNorthStar,
          approvalRate: agent.approvalRate,
          implementationRate: agent.implementationRate,
        }}
      />
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
