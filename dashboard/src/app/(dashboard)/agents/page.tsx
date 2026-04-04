import prisma from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [agents, apiUsageMonth] = await Promise.all([
    prisma.agent.findMany({
      include: {
        client: { select: { id: true, businessName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.apiUsage.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { agentId: true, costInCents: true },
    }),
  ]);

  const agentSpend: Record<string, number> = {};
  for (const usage of apiUsageMonth) {
    agentSpend[usage.agentId] = (agentSpend[usage.agentId] ?? 0) + usage.costInCents;
  }

  const statusCounts = { active: 0, pending: 0, paused: 0, killed: 0 };
  for (const agent of agents) {
    if (agent.status === "active") statusCounts.active++;
    else if (agent.status === "pending_approval") statusCounts.pending++;
    else if (agent.status === "paused") statusCounts.paused++;
    else if (agent.status === "killed") statusCounts.killed++;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agents</h1>
          <p className="text-muted-foreground text-sm mt-1">{agents.length} total across all clients</p>
        </div>
        <Link
          href="/agents/create"
          className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/80 transition-colors"
        >
          + Create Agent
        </Link>
      </div>

      {/* Status summary */}
      <div className="flex gap-6">
        <FleetDot color="bg-emerald-500" label="Active" count={statusCounts.active} />
        <FleetDot color="bg-amber-500" label="Pending" count={statusCounts.pending} />
        <FleetDot color="bg-zinc-500" label="Paused" count={statusCounts.paused} />
        <FleetDot color="bg-red-500" label="Killed" count={statusCounts.killed} />
      </div>

      {/* Agent table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {agents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Agent</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Client</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Schedule</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Tasks</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Budget Burn</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Last Run</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, i) => {
                  const spent = agentSpend[agent.id] ?? 0;
                  const budget = agent.budgetMonthlyCents;
                  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                  const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

                  const statusColors: Record<string, string> = {
                    active: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
                    pending_approval: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
                    paused: "bg-muted text-muted-foreground ring-1 ring-border",
                    killed: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
                  };

                  return (
                    <tr key={agent.id} className={`hover:bg-muted/50 transition-colors ${i < agents.length - 1 ? "border-b border-border/40" : ""}`}>
                      <td className="px-5 py-3.5">
                        <Link href={`/agents/${agent.id}`} className="block group/agent">
                          <p className="font-medium text-foreground group-hover/agent:text-emerald-400 transition-colors">{agent.name}</p>
                          <p className="text-muted-foreground/60 text-xs mt-0.5">{agent.email}</p>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <Link href={`/clients/${agent.client.id}`} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                          {agent.client.businessName}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-muted-foreground font-mono text-xs">{agent.agentType}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider ${statusColors[agent.status] ?? "bg-muted text-muted-foreground"}`}>
                          {agent.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{agent.schedule}</td>
                      <td className="px-5 py-3.5 text-muted-foreground tabular-nums">{agent.totalTasksCompleted}</td>
                      <td className="px-5 py-3.5">
                        <div className="w-24">
                          <div className="flex justify-between text-[10px] mb-0.5">
                            <span className="text-muted-foreground">${(spent / 100).toFixed(0)}</span>
                            <span className="text-muted-foreground/60">${(budget / 100).toFixed(0)}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs tabular-nums">
                        {agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleDateString() : "Never"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-16 text-center">
            <p className="text-muted-foreground text-sm">No agents yet</p>
          </div>
        )}
      </div>
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
