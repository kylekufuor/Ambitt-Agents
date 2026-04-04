import prisma from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    pending_approval: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
    paused: "bg-muted text-muted-foreground ring-1 ring-border",
    killed: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
    completed: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
    pending: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
    executing: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider ${colors[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

async function agentAction(formData: FormData) {
  "use server";
  const agentId = formData.get("agentId") as string;
  const action = formData.get("action") as string;
  const clientId = formData.get("clientId") as string;
  const oracleUrl = process.env.ORACLE_URL ?? "https://ambitt-agents-production.up.railway.app";
  await fetch(`${oracleUrl}/agents/${agentId}/${action}`, { method: "POST" });
  const { redirect } = await import("next/navigation");
  redirect(`/clients/${clientId}`);
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      agents: {
        orderBy: { createdAt: "desc" },
      },
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: {
          agent: { select: { name: true, agentType: true } },
        },
      },
    },
  });

  if (!client) notFound();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const agentIds = client.agents.map((a) => a.id);

  const monthlyUsage = agentIds.length > 0
    ? await prisma.apiUsage.groupBy({
        by: ["agentId"],
        where: { agentId: { in: agentIds }, createdAt: { gte: monthStart } },
        _sum: { costInCents: true },
      })
    : [];

  const agentSpend: Record<string, number> = {};
  for (const row of monthlyUsage) {
    agentSpend[row.agentId] = row._sum.costInCents ?? 0;
  }

  const clientMrr = client.agents
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + a.monthlyRetainerCents, 0) / 100;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/clients" className="text-muted-foreground hover:text-foreground transition-colors">Clients</Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-foreground">{client.businessName}</span>
      </div>

      {/* Client Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{client.businessName}</h1>
          <p className="text-muted-foreground text-sm mt-1">{client.industry} — {client.email}</p>
        </div>
        <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
          client.billingStatus === "active"
            ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
            : client.billingStatus === "paused"
              ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20"
              : "bg-red-500/10 text-red-400 ring-1 ring-red-500/20"
        }`}>
          {client.billingStatus}
        </div>
      </div>

      {/* Client KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="MRR" value={`$${clientMrr}`} />
        <KpiCard label="Active Agents" value={`${client.agents.filter((a) => a.status === "active").length}`} />
        <KpiCard label="Total Tasks" value={`${client.agents.reduce((sum, a) => sum + a.totalTasksCompleted, 0)}`} />
        <KpiCard label="Channel" value={client.preferredChannel} />
      </div>

      {/* Business Profile */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground text-[15px] mb-3">Business Profile</h2>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground/60 text-[11px] uppercase tracking-wider mb-1">Goal</p>
            <p className="text-muted-foreground">{client.businessGoal}</p>
          </div>
          <div>
            <p className="text-muted-foreground/60 text-[11px] uppercase tracking-wider mb-1">Brand Voice</p>
            <p className="text-muted-foreground">{client.brandVoice.slice(0, 200)}</p>
          </div>
          {client.northStarMetric && (
            <div>
              <p className="text-muted-foreground/60 text-[11px] uppercase tracking-wider mb-1">North Star Metric</p>
              <p className="text-muted-foreground">{client.northStarMetric}</p>
            </div>
          )}
          {client.agentGoal && (
            <div>
              <p className="text-muted-foreground/60 text-[11px] uppercase tracking-wider mb-1">Agent Goal (90 days)</p>
              <p className="text-muted-foreground">{client.agentGoal}</p>
            </div>
          )}
        </div>
      </div>

      {/* Agents Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-[15px]">Agents</h2>
          <span className="text-muted-foreground/60 text-xs">{client.agents.length} total</span>
        </div>
        {client.agents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Agent</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Schedule</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Last Run</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Tasks</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Retainer</th>
                  <th className="text-left px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Budget Burn</th>
                  <th className="text-right px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {client.agents.map((agent, i) => (
                  <tr key={agent.id} className={`hover:bg-muted/50 transition-colors ${i < client.agents.length - 1 ? "border-b border-border/40" : ""}`}>
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="font-medium text-foreground">{agent.name}</p>
                        <p className="text-muted-foreground/60 text-xs mt-0.5">{agent.email}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-muted-foreground font-mono text-xs">{agent.agentType}</span>
                    </td>
                    <td className="px-5 py-3.5"><StatusBadge status={agent.status} /></td>
                    <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{agent.schedule}</td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs tabular-nums">
                      {agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground tabular-nums">{agent.totalTasksCompleted}</td>
                    <td className="px-5 py-3.5 text-muted-foreground tabular-nums">${agent.monthlyRetainerCents / 100}/mo</td>
                    <td className="px-5 py-3.5">
                      {(() => {
                        const spent = agentSpend[agent.id] ?? 0;
                        const budget = agent.budgetMonthlyCents;
                        const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                        const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
                        return (
                          <div className="w-24">
                            <div className="flex justify-between text-[10px] mb-0.5">
                              <span className="text-muted-foreground">${(spent / 100).toFixed(0)}</span>
                              <span className="text-muted-foreground/60">${(budget / 100).toFixed(0)}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex gap-1.5 justify-end">
                        {agent.status === "pending_approval" && (
                          <ActionBtn agentId={agent.id} clientId={client.id} action="approve" label="Approve" variant="green" />
                        )}
                        {agent.status === "active" && (
                          <ActionBtn agentId={agent.id} clientId={client.id} action="pause" label="Pause" variant="amber" />
                        )}
                        {agent.status === "paused" && (
                          <ActionBtn agentId={agent.id} clientId={client.id} action="approve" label="Resume" variant="green" />
                        )}
                        {agent.status !== "killed" && (
                          <ActionBtn agentId={agent.id} clientId={client.id} action="kill" label="Kill" variant="red" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="text-muted-foreground/60 text-sm">No agents for this client yet</p>
          </div>
        )}
      </div>

      {/* Recent Output */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground text-[15px]">Recent Output</h2>
        </div>
        {client.tasks.length > 0 ? (
          <div className="divide-y divide-border/40">
            {client.tasks.map((task) => (
              <div key={task.id} className="px-5 py-3.5 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm">{task.agent.name}</span>
                    <span className="text-muted-foreground/60 text-xs font-mono">{task.taskType}</span>
                  </div>
                  <StatusBadge status={task.status} />
                </div>
                <p className="text-muted-foreground text-xs mt-1 truncate">{task.description.slice(0, 100)}</p>
                <span className="text-muted-foreground/40 text-[11px] tabular-nums mt-1 block">
                  {new Date(task.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="text-muted-foreground/60 text-sm">No tasks yet</p>
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
      <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">{value}</p>
    </div>
  );
}

function ActionBtn({ agentId, clientId, action, label, variant }: {
  agentId: string; clientId: string; action: string; label: string; variant: "green" | "amber" | "red";
}) {
  const styles = {
    green: "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 ring-1 ring-amber-500/20",
    red: "bg-red-500/10 text-red-400 hover:bg-red-500/20 ring-1 ring-red-500/20",
  };
  return (
    <form action={agentAction}>
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="clientId" value={clientId} />
      <button type="submit" className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${styles[variant]}`}>
        {label}
      </button>
    </form>
  );
}
