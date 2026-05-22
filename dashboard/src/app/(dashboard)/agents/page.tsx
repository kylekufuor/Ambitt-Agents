import prisma from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PRDIdentity {
  agentName?: string;
  agentEmailSlug?: string;
  agentRole?: string;
  ownerBusinessName?: string;
}
interface PRDPricing {
  suggestedTier?: string;
  suggestedSetupCents?: number;
  suggestedMonthlyCents?: number;
}
interface PRDLike {
  identity?: PRDIdentity;
  pricing?: PRDPricing;
}
interface QuotePricing {
  setupCents?: number;
  monthlyCents?: number;
  tierLabel?: string;
}
interface QuoteLike {
  pricing?: QuotePricing;
}

export default async function AgentsPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [agents, apiUsageMonth, pendingFromPRD] = await Promise.all([
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
    // Pipeline: PRD approved but not yet converted. Virtual "agents-to-be"
    // shown above the real fleet so Kyle sees everything in motion in one
    // view. Once Convert + Scaffold fires, these flip into the real Agent
    // table below (and disappear from this list because convertedClientId
    // is no longer null).
    prisma.prospect.findMany({
      where: {
        prdApprovedAt: { not: null },
        convertedClientId: null,
        status: { notIn: ["archived", "ghosted"] },
      },
      orderBy: { prdApprovedAt: "desc" },
      select: {
        id: true,
        contactName: true,
        businessName: true,
        email: true,
        status: true,
        prdApprovedAt: true,
        prdData: true,
        quoteDraft: true,
        quoteSentAt: true,
        quoteAcceptedAt: true,
      },
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
          <p className="text-muted-foreground text-sm mt-1">
            {agents.length} live · {pendingFromPRD.length} in pipeline
          </p>
        </div>
      </div>

      {/* Status summary — live fleet only */}
      <div className="flex gap-6">
        <FleetDot color="bg-emerald-500" label="Active" count={statusCounts.active} />
        <FleetDot color="bg-amber-500" label="Pending" count={statusCounts.pending} />
        <FleetDot color="bg-zinc-500" label="Paused" count={statusCounts.paused} />
        <FleetDot color="bg-red-500" label="Killed" count={statusCounts.killed} />
      </div>

      {/* ─── Pipeline · awaiting build ─────────────────────────────────────── */}
      {pendingFromPRD.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-foreground text-sm font-semibold flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              Pipeline · awaiting build
            </h2>
            <p className="text-muted-foreground/70 text-[11px]">
              PRDs approved, not yet converted. Click to review the quote.
            </p>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-500/15">
                  <th className="text-left px-5 py-3 text-blue-300/80 text-[11px] font-semibold uppercase tracking-wider">Agent (proposed)</th>
                  <th className="text-left px-5 py-3 text-blue-300/80 text-[11px] font-semibold uppercase tracking-wider">Client (prospect)</th>
                  <th className="text-left px-5 py-3 text-blue-300/80 text-[11px] font-semibold uppercase tracking-wider">Role</th>
                  <th className="text-left px-5 py-3 text-blue-300/80 text-[11px] font-semibold uppercase tracking-wider">Stage</th>
                  <th className="text-left px-5 py-3 text-blue-300/80 text-[11px] font-semibold uppercase tracking-wider">Quoted</th>
                  <th className="text-left px-5 py-3 text-blue-300/80 text-[11px] font-semibold uppercase tracking-wider">PRD locked</th>
                </tr>
              </thead>
              <tbody>
                {pendingFromPRD.map((p, i) => {
                  const prd = p.prdData as PRDLike | null;
                  const quote = p.quoteDraft as QuoteLike | null;
                  const proposedName = prd?.identity?.agentName ?? "(unnamed agent)";
                  const proposedSlug = prd?.identity?.agentEmailSlug
                    ? `${prd.identity.agentEmailSlug}@ambitt.agency`
                    : "—";
                  const proposedRole = prd?.identity?.agentRole ?? "—";
                  const businessName = p.businessName ?? prd?.identity?.ownerBusinessName ?? "—";
                  const setup = quote?.pricing?.setupCents ?? prd?.pricing?.suggestedSetupCents;
                  const monthly = quote?.pricing?.monthlyCents ?? prd?.pricing?.suggestedMonthlyCents;
                  const tier = quote?.pricing?.tierLabel ?? prd?.pricing?.suggestedTier;
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-blue-500/8 transition-colors ${i < pendingFromPRD.length - 1 ? "border-b border-blue-500/10" : ""}`}
                    >
                      <td className="px-5 py-3.5">
                        <Link href={`/prospects/${p.id}/prd`} className="block group/agent">
                          <p className="font-medium text-foreground group-hover/agent:text-blue-300 transition-colors">{proposedName}</p>
                          <p className="text-muted-foreground/60 text-xs mt-0.5 font-mono">{proposedSlug}</p>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-muted-foreground text-sm">{businessName}</p>
                        <p className="text-muted-foreground/50 text-[10.5px] mt-0.5">{p.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs">{proposedRole}</td>
                      <td className="px-5 py-3.5">
                        <Link href={`/prospects/${p.id}/quote`} className="hover:opacity-80 transition-opacity">
                          <PipelineStageChip prospect={p} />
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        {setup !== undefined && monthly !== undefined ? (
                          <div className="text-xs text-muted-foreground">
                            <div className="text-foreground tabular-nums">${(setup / 100).toLocaleString()} + ${(monthly / 100).toLocaleString()}/mo</div>
                            {tier && <div className="text-muted-foreground/60 text-[10.5px]">{tier}</div>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs tabular-nums">
                        {p.prdApprovedAt ? relTime(p.prdApprovedAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── Live fleet (real Agent rows) ──────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-foreground text-sm font-semibold flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Live fleet
          </h2>
          <p className="text-muted-foreground/70 text-[11px]">Built, registered, billable.</p>
        </div>
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
              <p className="text-muted-foreground text-sm">
                {pendingFromPRD.length > 0 ? "No live agents yet — convert one from the pipeline above." : "No agents yet."}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PipelineStageChip({
  prospect,
}: {
  prospect: { status: string; quoteDraft: unknown; quoteSentAt: Date | null; quoteAcceptedAt: Date | null };
}) {
  let label: string;
  let cls: string;
  if (prospect.quoteAcceptedAt) {
    label = "Quote accepted — Convert";
    cls = "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30";
  } else if (prospect.quoteSentAt) {
    label = "Quote sent";
    cls = "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30";
  } else if (prospect.quoteDraft) {
    label = "Quote drafted";
    cls = "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30";
  } else {
    label = "PRD approved";
    cls = "bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30";
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

function relTime(d: Date | string): string {
  const t = new Date(d).getTime();
  const seconds = Math.floor((Date.now() - t) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
