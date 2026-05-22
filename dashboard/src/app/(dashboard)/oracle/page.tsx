import prisma from "@/lib/db";
import Link from "next/link";
import { OracleActivityLog } from "./oracle-actions";
import { OracleOrb } from "@/components/oracle-orb";

export const dynamic = "force-dynamic";

interface ImprovementSuggestion {
  agentType: string;
  currentIssue: string;
  suggestedChange: string;
  confidence: "low" | "medium" | "high";
}

async function getOracleData() {
  const now = new Date();

  // Sales-pipeline queues — surface what needs Kyle's action so /oracle is the
  // one-glance "what do I do right now" view instead of just fleet ops.
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [pendingApprovals, agents, oracleActions, improvementActions, scaffoldedFromProspects, prdsPendingReview, quotesAwaitingConvert, recentQuoteDecisions] = await Promise.all([
    prisma.agent.findMany({
      where: { status: "pending_approval" },
      include: {
        client: { select: { id: true, businessName: true, industry: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        lastRunAt: true,
        agentType: true,
      },
    }),
    prisma.oracleAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.oracleAction.findMany({
      where: { actionType: "improvement_cycle" },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    // Look up source prospects for any pending agents — Phase-D-scaffolded
    // agents originated from a Prospect.convertedClientId; the "View PRD"
    // link on the pending-approval card sends Kyle to /prospects/[id]/prd
    // so he can review the full spec before approving.
    prisma.prospect.findMany({
      where: { convertedClientId: { not: null } },
      select: { id: true, convertedClientId: true },
    }),
    // PRDs generated but Kyle hasn't approved yet — soft queue. Limit 10 so
    // the panel stays scannable; if there are more it's a sign Kyle should
    // batch-review.
    prisma.prospect.findMany({
      where: {
        prdGeneratedAt: { not: null },
        prdApprovedAt: null,
        status: { notIn: ["archived", "ghosted"] },
      },
      orderBy: { prdGeneratedAt: "desc" },
      take: 10,
      select: {
        id: true,
        contactName: true,
        businessName: true,
        email: true,
        prdGeneratedAt: true,
        status: true,
      },
    }),
    // Quotes accepted but not yet converted to Client+Agent — Kyle's action:
    // click Convert + Scaffold.
    prisma.prospect.findMany({
      where: {
        quoteAcceptedAt: { not: null },
        convertedClientId: null,
        status: { notIn: ["archived", "ghosted"] },
      },
      orderBy: { quoteAcceptedAt: "desc" },
      take: 10,
      select: {
        id: true,
        contactName: true,
        businessName: true,
        email: true,
        quoteAcceptedAt: true,
      },
    }),
    // Recent quote decisions (approved + denied) — for awareness even after
    // Kyle's acted on them. Past 7 days.
    prisma.prospect.findMany({
      where: {
        OR: [
          { quoteAcceptedAt: { gte: oneWeekAgo } },
          { quoteDeniedAt: { gte: oneWeekAgo } },
        ],
      },
      orderBy: [{ quoteAcceptedAt: "desc" }, { quoteDeniedAt: "desc" }],
      take: 15,
      select: {
        id: true,
        contactName: true,
        businessName: true,
        quoteAcceptedAt: true,
        quoteDeniedAt: true,
        quoteDeniedReason: true,
        convertedClientId: true,
      },
    }),
  ]);
  const prospectByClient = new Map<string, string>();
  for (const p of scaffoldedFromProspects) {
    if (p.convertedClientId) prospectByClient.set(p.convertedClientId, p.id);
  }

  // Fleet summary
  const statusCounts = { active: 0, pending: 0, paused: 0, killed: 0 };
  const staleAgents: string[] = [];
  for (const agent of agents) {
    if (agent.status === "active") statusCounts.active++;
    else if (agent.status === "pending_approval") statusCounts.pending++;
    else if (agent.status === "paused") statusCounts.paused++;
    else if (agent.status === "killed") statusCounts.killed++;

    if (agent.status === "active" && agent.lastRunAt) {
      const hours = (now.getTime() - agent.lastRunAt.getTime()) / (1000 * 60 * 60);
      if (hours > 25) staleAgents.push(`${agent.name} (${Math.round(hours)}h ago)`);
    }
  }

  // Parse improvement suggestions
  const suggestions: (ImprovementSuggestion & { createdAt: Date })[] = [];
  for (const action of improvementActions) {
    if (action.result) {
      try {
        const parsed = JSON.parse(action.result) as ImprovementSuggestion[];
        for (const s of parsed) {
          suggestions.push({ ...s, createdAt: action.createdAt });
        }
      } catch { /* ignore parse errors */ }
    }
  }

  // Last health check
  const lastHealthCheck = oracleActions.find((a) => a.actionType === "fleet_health_check");

  return {
    pendingApprovals,
    statusCounts,
    staleAgents,
    oracleActions,
    suggestions,
    lastHealthCheck,
    totalAgents: agents.length,
    prospectByClient,
    prdsPendingReview,
    quotesAwaitingConvert,
    recentQuoteDecisions,
  };
}

async function approveAction(formData: FormData) {
  "use server";
  const agentId = formData.get("agentId") as string;
  const oracleUrl = process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
  await fetch(`${oracleUrl}/agents/${agentId}/approve`, { method: "POST" });
  const { redirect } = await import("next/navigation");
  redirect("/oracle");
}

async function rejectAction(formData: FormData) {
  "use server";
  const agentId = formData.get("agentId") as string;
  const oracleUrl = process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
  await fetch(`${oracleUrl}/agents/${agentId}/reject`, { method: "POST" });
  const { redirect } = await import("next/navigation");
  redirect("/oracle");
}

async function runFleetHealthAction() {
  "use server";
  const oracleUrl = process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
  await fetch(`${oracleUrl}/cron/fleet-health`, { method: "POST" });
  const { redirect } = await import("next/navigation");
  redirect("/oracle");
}

async function runImprovementAction() {
  "use server";
  const oracleUrl = process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
  await fetch(`${oracleUrl}/cron/improvement`, { method: "POST" });
  const { redirect } = await import("next/navigation");
  redirect("/oracle");
}

export default async function OraclePage() {
  const data = await getOracleData();

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Oracle Orb — Hero */}
      <OracleOrb pendingCount={data.pendingApprovals.length} />

      {/* Fleet Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Agents" value={data.totalAgents} />
        <StatCard label="Active" value={data.statusCounts.active} color="text-emerald-400" />
        <StatCard label="Pending" value={data.statusCounts.pending} color="text-amber-400" />
        <StatCard label="Paused" value={data.statusCounts.paused} color="text-muted-foreground" />
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Last Health Check</p>
          <p className="text-foreground text-sm font-medium mt-2">
            {data.lastHealthCheck
              ? timeAgo(data.lastHealthCheck.createdAt)
              : "Never"}
          </p>
        </div>
      </div>

      {/* Sales pipeline — most-urgent funnel actions first */}

      {/* Quotes accepted → click Convert (most urgent — paying-customer waiting) */}
      {data.quotesAwaitingConvert.length > 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-emerald-500/15 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-semibold text-emerald-300 text-[15px]">Quotes accepted — convert now</h2>
            <span className="text-emerald-400/60 text-xs ml-auto">{data.quotesAwaitingConvert.length}</span>
          </div>
          <div className="divide-y divide-emerald-500/15">
            {data.quotesAwaitingConvert.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground text-sm">
                    {p.contactName ?? "(no name)"}
                    {p.businessName && <span className="text-muted-foreground font-normal"> · {p.businessName}</span>}
                  </div>
                  <div className="text-muted-foreground text-xs mt-0.5">
                    {p.email} · accepted {timeAgo(p.quoteAcceptedAt!)}
                  </div>
                </div>
                <Link
                  href={`/prospects/${p.id}/quote`}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-400"
                >
                  Convert →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRDs awaiting Kyle's review */}
      {data.prdsPendingReview.length > 0 && (
        <div className="bg-blue-500/5 border border-blue-500/25 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-blue-500/15 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <h2 className="font-semibold text-blue-300 text-[15px]">PRDs awaiting your review</h2>
            <span className="text-blue-400/60 text-xs ml-auto">{data.prdsPendingReview.length}</span>
          </div>
          <div className="divide-y divide-blue-500/15">
            {data.prdsPendingReview.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground text-sm">
                    {p.contactName ?? "(no name)"}
                    {p.businessName && <span className="text-muted-foreground font-normal"> · {p.businessName}</span>}
                  </div>
                  <div className="text-muted-foreground text-xs mt-0.5">
                    {p.email} · PRD generated {timeAgo(p.prdGeneratedAt!)} · status {p.status}
                  </div>
                </div>
                <Link
                  href={`/prospects/${p.id}/prd`}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 ring-1 ring-blue-500/30"
                >
                  Review →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Approvals */}
      {data.pendingApprovals.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-500/10 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="font-semibold text-amber-400 text-[15px]">Awaiting Approval</h2>
            <span className="text-amber-500/60 text-xs ml-auto">{data.pendingApprovals.length} pending</span>
          </div>
          <div className="divide-y divide-amber-500/10">
            {data.pendingApprovals.map((agent) => {
              const sourceProspectId = data.prospectByClient.get(agent.client.id);
              return (
              <div key={agent.id} className="px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{agent.name}</span>
                      <span className="text-muted-foreground text-xs font-mono">{agent.agentType}</span>
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      {agent.client.businessName} — {agent.client.industry}
                    </p>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground/60 flex-wrap">
                      <span>Retainer: ${agent.monthlyRetainerCents / 100}/mo</span>
                      <span>Setup: ${agent.setupFeeCents / 100}</span>
                      <span>Schedule: {agent.schedule || "triggered"}</span>
                      <span>Autonomy: {agent.autonomyLevel}</span>
                      {sourceProspectId ? (
                        <Link
                          href={`/prospects/${sourceProspectId}/prd`}
                          className="text-amber-400 hover:text-amber-300 font-medium"
                        >
                          View source PRD →
                        </Link>
                      ) : (
                        <span className="text-muted-foreground/40">No source PRD (manual)</span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs mt-1.5 max-w-2xl">{agent.purpose}</p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-4">
                    <Link
                      href={`/agents/${agent.id}`}
                      className="text-[11px] font-medium px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                    >
                      Open
                    </Link>
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
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* Recent quote decisions — awareness card. Past 7 days. */}
      {data.recentQuoteDecisions.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <h2 className="font-semibold text-foreground text-sm">Recent quote decisions</h2>
            <span className="text-muted-foreground text-xs ml-auto">past 7 days</span>
          </div>
          <div className="divide-y divide-border">
            {data.recentQuoteDecisions.map((p) => {
              const accepted = Boolean(p.quoteAcceptedAt);
              const ts = accepted ? p.quoteAcceptedAt! : p.quoteDeniedAt!;
              const labelColor = accepted ? "text-emerald-400" : "text-amber-400";
              const labelText = accepted
                ? p.convertedClientId
                  ? "Accepted · Converted"
                  : "Accepted · Convert pending"
                : "Denied";
              return (
                <Link
                  key={p.id}
                  href={accepted ? `/prospects/${p.id}/quote` : `/prospects/${p.id}/quote`}
                  className="px-5 py-2.5 flex items-center justify-between hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-[10.5px] font-semibold uppercase tracking-wider ${labelColor}`}>
                      {labelText}
                    </span>
                    <span className="text-foreground text-sm">
                      {p.contactName ?? "(no name)"}
                      {p.businessName && <span className="text-muted-foreground"> · {p.businessName}</span>}
                    </span>
                    {!accepted && p.quoteDeniedReason && (
                      <span className="text-muted-foreground/70 text-xs italic max-w-md truncate">
                        “{p.quoteDeniedReason}”
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">{timeAgo(ts)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-3">
        <form action={runFleetHealthAction}>
          <button className="text-sm font-medium px-4 py-2 rounded-lg bg-card border border-border text-foreground hover:bg-muted transition-colors">
            Run Fleet Health Check
          </button>
        </form>
        <form action={runImprovementAction}>
          <button className="text-sm font-medium px-4 py-2 rounded-lg bg-card border border-border text-foreground hover:bg-muted transition-colors">
            Run Improvement Cycle
          </button>
        </form>
      </div>

      {/* Stale Agents Warning */}
      {data.staleAgents.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
          <h3 className="text-red-400 text-[11px] font-semibold uppercase tracking-wider mb-2">Stale Agents</h3>
          <div className="space-y-1">
            {data.staleAgents.map((agent, i) => (
              <p key={i} className="text-muted-foreground text-sm">{agent}</p>
            ))}
          </div>
        </div>
      )}

      {/* Improvement Suggestions */}
      {data.suggestions.length > 0 && (
        <div>
          <h2 className="font-semibold text-foreground text-[15px] mb-4">Improvement Suggestions</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.suggestions.map((s, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-foreground font-medium text-sm">{s.agentType}</span>
                  <ConfidenceBadge confidence={s.confidence} />
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">Issue</p>
                    <p className="text-muted-foreground text-sm">{s.currentIssue}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">Suggested Change</p>
                    <p className="text-foreground text-sm">{s.suggestedChange}</p>
                  </div>
                </div>
                <p className="text-muted-foreground/40 text-[11px] mt-3">{timeAgo(s.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div>
        <h2 className="font-semibold text-foreground text-[15px] mb-4">Activity Log</h2>
        <OracleActivityLog
          actions={data.oracleActions.map((a) => ({
            id: a.id,
            actionType: a.actionType,
            description: a.description,
            status: a.status,
            agentId: a.agentId,
            clientId: a.clientId,
            createdAt: a.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold mt-2 tabular-nums ${color ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    high: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    medium: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
    low: "bg-muted text-muted-foreground ring-1 ring-border",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md ${styles[confidence] ?? styles.low}`}>
      {confidence}
    </span>
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
