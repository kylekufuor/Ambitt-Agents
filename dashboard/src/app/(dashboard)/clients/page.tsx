import prisma from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    include: {
      agents: {
        select: {
          id: true,
          name: true,
          status: true,
          monthlyRetainerCents: true,
          totalTasksCompleted: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground text-sm mt-1">{clients.length} total</p>
        </div>
      </div>

      {clients.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => {
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
