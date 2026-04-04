import prisma from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [clients, agents, apiUsage24h, apiUsageMonth, oracleActions, pendingApprovals] = await Promise.all([
    prisma.client.findMany({
      include: {
        agents: {
          select: {
            id: true,
            name: true,
            agentType: true,
            status: true,
            monthlyRetainerCents: true,
            totalTasksCompleted: true,
            lastRunAt: true,
            budgetMonthlyCents: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        agentType: true,
        status: true,
        monthlyRetainerCents: true,
        lastRunAt: true,
        budgetMonthlyCents: true,
        clientId: true,
        client: { select: { businessName: true } },
      },
    }),
    prisma.apiUsage.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    prisma.apiUsage.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { agentId: true, costInCents: true, model: true },
    }),
    prisma.oracleAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.agent.findMany({
      where: { status: "pending_approval" },
      include: { client: { select: { businessName: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const mrr = agents
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + a.monthlyRetainerCents, 0) / 100;

  const costByModel: Record<string, number> = {};
  for (const usage of apiUsage24h) {
    costByModel[usage.model] = (costByModel[usage.model] ?? 0) + usage.costInCents;
  }

  const agentMonthlySpend: Record<string, number> = {};
  for (const usage of apiUsageMonth) {
    agentMonthlySpend[usage.agentId] = (agentMonthlySpend[usage.agentId] ?? 0) + usage.costInCents;
  }

  const statusCounts = { active: 0, pending: 0, paused: 0, killed: 0 };
  const staleAgents: typeof agents = [];
  for (const agent of agents) {
    if (agent.status === "active") statusCounts.active++;
    else if (agent.status === "pending_approval") statusCounts.pending++;
    else if (agent.status === "paused") statusCounts.paused++;
    else if (agent.status === "killed") statusCounts.killed++;

    if (agent.status === "active" && agent.lastRunAt) {
      const hours = (now.getTime() - agent.lastRunAt.getTime()) / (1000 * 60 * 60);
      if (hours > 25) staleAgents.push(agent);
    }
  }

  return {
    clients,
    agents,
    mrr,
    costByModel,
    statusCounts,
    staleAgents,
    agentMonthlySpend,
    pendingApprovals,
    oracleActions,
    totalCostCents: Object.values(costByModel).reduce((a, b) => a + b, 0),
  };
}

async function approveAction(formData: FormData) {
  "use server";
  const agentId = formData.get("agentId") as string;
  const oracleUrl = process.env.ORACLE_URL ?? "https://ambitt-agents-production.up.railway.app";
  await fetch(`${oracleUrl}/agents/${agentId}/approve`, { method: "POST" });
  const { redirect } = await import("next/navigation");
  redirect("/");
}

async function rejectAction(formData: FormData) {
  "use server";
  const agentId = formData.get("agentId") as string;
  const oracleUrl = process.env.ORACLE_URL ?? "https://ambitt-agents-production.up.railway.app";
  await fetch(`${oracleUrl}/agents/${agentId}/reject`, { method: "POST" });
  const { redirect } = await import("next/navigation");
  redirect("/");
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="MRR" value={`$${data.mrr.toLocaleString()}`} />
        <KpiCard label="Clients" value={`${data.clients.length}`} />
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">API Cost (24h)</p>
          <p className="text-3xl font-bold text-foreground mt-2 tabular-nums">${(data.totalCostCents / 100).toFixed(2)}</p>
          {Object.keys(data.costByModel).length > 0 && (
            <div className="mt-3 space-y-1">
              {Object.entries(data.costByModel).map(([model, cents]) => (
                <div key={model} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{model}</span>
                  <span className="text-muted-foreground/80 tabular-nums">${(cents / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Fleet status */}
        <div className="bg-card border border-border rounded-xl p-5 col-span-2">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider mb-3">Fleet Status</p>
          <div className="flex gap-4">
            <FleetDot color="bg-emerald-500" label="Active" count={data.statusCounts.active} />
            <FleetDot color="bg-amber-500" label="Pending" count={data.statusCounts.pending} />
            <FleetDot color="bg-zinc-500" label="Paused" count={data.statusCounts.paused} />
            <FleetDot color="bg-red-500" label="Killed" count={data.statusCounts.killed} />
          </div>
          {data.staleAgents.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-amber-400 text-[11px] font-semibold uppercase tracking-wider mb-1">Stale Agents</p>
              {data.staleAgents.map((a) => (
                <p key={a.id} className="text-muted-foreground text-xs">
                  {a.name} — last ran {Math.round((Date.now() - a.lastRunAt!.getTime()) / 3600000)}h ago
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Approval Queue */}
      {data.pendingApprovals.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-500/10 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="font-semibold text-amber-400 text-[15px]">Awaiting Approval</h2>
            <span className="text-amber-500/60 text-xs ml-auto">{data.pendingApprovals.length} pending</span>
          </div>
          <div className="divide-y divide-amber-500/10">
            {data.pendingApprovals.map((agent) => (
              <div key={agent.id} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{agent.name}</span>
                    <span className="text-muted-foreground text-xs font-mono">{agent.agentType}</span>
                  </div>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {agent.client.businessName} — ${agent.monthlyRetainerCents / 100}/mo — Budget: ${agent.budgetMonthlyCents / 100}/mo
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={approveAction}>
                    <input type="hidden" name="agentId" value={agent.id} />
                    <button className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20 transition-colors">
                      Approve
                    </button>
                  </form>
                  <form action={rejectAction}>
                    <input type="hidden" name="agentId" value={agent.id} />
                    <button className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 ring-1 ring-red-500/20 transition-colors">
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent Budget Burn Rates */}
      {data.agents.filter((a) => a.status === "active").length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground text-[15px]">Agent Budgets (This Month)</h2>
          </div>
          <div className="p-5 space-y-3">
            {data.agents
              .filter((a) => a.status === "active" || a.status === "paused")
              .map((agent) => {
                const spent = data.agentMonthlySpend[agent.id] ?? 0;
                const budget = agent.budgetMonthlyCents;
                const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

                return (
                  <div key={agent.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground text-sm font-medium">{agent.name}</span>
                        <span className="text-muted-foreground/60 text-xs">{agent.client.businessName}</span>
                      </div>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        ${(spent / 100).toFixed(2)} / ${(budget / 100).toFixed(2)}
                        {pct >= 100 && <span className="text-red-400 ml-1.5 font-semibold">PAUSED</span>}
                        {pct >= 80 && pct < 100 && <span className="text-amber-400 ml-1.5 font-semibold">WARNING</span>}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Clients */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground text-[15px]">Clients</h2>
          <Link href="/clients" className="text-muted-foreground text-xs hover:text-foreground transition-colors">
            View all →
          </Link>
        </div>
        {data.clients.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.clients.slice(0, 6).map((client) => {
              const activeAgents = client.agents.filter((a) => a.status === "active").length;
              const pendingAgents = client.agents.filter((a) => a.status === "pending_approval").length;
              const clientMrr = client.agents
                .filter((a) => a.status === "active")
                .reduce((sum, a) => sum + a.monthlyRetainerCents, 0) / 100;
              const totalTasks = client.agents.reduce((sum, a) => sum + a.totalTasksCompleted, 0);

              return (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="bg-card border border-border rounded-xl p-5 hover:border-foreground/10 transition-colors group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                        {client.businessName}
                      </h3>
                      <p className="text-muted-foreground text-xs mt-0.5">{client.industry}</p>
                    </div>
                    <StatusDot status={client.billingStatus} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <MiniStat label="Agents" value={`${activeAgents}`} alert={pendingAgents > 0 ? `${pendingAgents} pending` : undefined} />
                    <MiniStat label="MRR" value={`$${clientMrr}`} />
                    <MiniStat label="Tasks" value={`${totalTasks}`} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {client.agents.map((agent) => (
                      <AgentPill key={agent.id} name={agent.name} status={agent.status} />
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl px-5 py-16 text-center">
            <p className="text-muted-foreground text-sm">No clients yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Use the Oracle API to onboard your first client</p>
          </div>
        )}
      </div>

      {/* Oracle Activity */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-[15px]">Oracle Activity</h2>
          <Link href="/oracle" className="text-muted-foreground text-xs hover:text-foreground transition-colors">
            View all →
          </Link>
        </div>
        {data.oracleActions.length > 0 ? (
          <div className="divide-y divide-border/40">
            {data.oracleActions.map((action) => {
              const typeColors: Record<string, string> = {
                scaffold_agent: "text-blue-400 bg-blue-500/10",
                approval_request: "text-amber-400 bg-amber-500/10",
                alert_kyle: "text-red-400 bg-red-500/10",
                fleet_health_check: "text-muted-foreground bg-muted",
                kill_agent: "text-red-400 bg-red-500/10",
                retry_agent: "text-amber-400 bg-amber-500/10",
                improvement_cycle: "text-purple-400 bg-purple-500/10",
              };
              return (
                <div key={action.id} className="px-5 py-3.5 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded ${typeColors[action.actionType] ?? "text-muted-foreground bg-muted"}`}>
                        {action.actionType}
                      </span>
                      <span className="text-muted-foreground text-sm">{action.description.slice(0, 80)}</span>
                    </div>
                    <span className="text-muted-foreground/40 text-[11px] tabular-nums whitespace-nowrap ml-4">
                      {new Date(action.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="text-muted-foreground/60 text-sm">No Oracle actions yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold text-foreground mt-2 tabular-nums">{value}</p>
    </div>
  );
}

function FleetDot({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <div>
        <p className="text-foreground font-bold text-lg tabular-nums leading-none">{count}</p>
        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, alert }: { label: string; value: string; alert?: string }) {
  return (
    <div>
      <p className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-foreground font-semibold mt-0.5">{value}</p>
      {alert && <p className="text-amber-400 text-[10px] mt-0.5">{alert}</p>}
    </div>
  );
}

function AgentPill({ name, status }: { name: string; status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    pending_approval: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
    paused: "bg-muted text-muted-foreground ring-1 ring-border",
    killed: "bg-red-500/10 text-red-500/60 ring-1 ring-red-500/20",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[status] ?? "bg-muted text-muted-foreground"}`}>
      {name}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-500",
    paused: "bg-zinc-500",
    cancelled: "bg-red-500",
  };
  return <div className={`w-2.5 h-2.5 rounded-full ${colors[status] ?? "bg-zinc-600"}`} />;
}
