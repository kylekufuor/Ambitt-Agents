import prisma from "@/lib/db";
import { OracleActivityLog } from "../oracle/oracle-actions";

export const dynamic = "force-dynamic";

// Activity — the global event feed plus fleet-ops controls, relocated from
// the Oracle home when that page became Atlas's room (orb + context bar
// only). Everything here is "what happened + run the sweeps".

interface ImprovementSuggestion {
  agentType: string;
  currentIssue: string;
  suggestedChange: string;
  confidence: "low" | "medium" | "high";
}

async function runFleetHealthAction() {
  "use server";
  const oracleUrl = process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
  await fetch(`${oracleUrl}/cron/fleet-health`, { method: "POST" });
  const { redirect } = await import("next/navigation");
  redirect("/activity");
}

async function runImprovementAction() {
  "use server";
  const oracleUrl = process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
  await fetch(`${oracleUrl}/cron/improvement`, { method: "POST" });
  const { redirect } = await import("next/navigation");
  redirect("/activity");
}

export default async function ActivityPage() {
  const now = new Date();

  const [oracleActions, improvementActions, activeAgents] = await Promise.all([
    prisma.oracleAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.oracleAction.findMany({
      where: { actionType: "improvement_cycle" },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.agent.findMany({
      where: { status: "active" },
      select: { name: true, lastRunAt: true },
    }),
  ]);

  const lastHealthCheck = oracleActions.find((a) => a.actionType === "fleet_health_check");

  const staleAgents: string[] = [];
  for (const agent of activeAgents) {
    if (agent.lastRunAt) {
      const hours = (now.getTime() - agent.lastRunAt.getTime()) / (1000 * 60 * 60);
      if (hours > 25) staleAgents.push(`${agent.name} (${Math.round(hours)}h ago)`);
    }
  }

  const suggestions: (ImprovementSuggestion & { createdAt: Date })[] = [];
  for (const action of improvementActions) {
    if (action.result) {
      try {
        const parsed = JSON.parse(action.result) as ImprovementSuggestion[];
        for (const s of parsed) {
          suggestions.push({ ...s, createdAt: action.createdAt });
        }
      } catch {
        /* ignore parse errors */
      }
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Activity</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Global event feed · last health check{" "}
            {lastHealthCheck ? timeAgo(lastHealthCheck.createdAt) : "never"}
          </p>
        </div>
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
      </div>

      {/* Stale Agents Warning */}
      {staleAgents.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
          <h3 className="text-red-400 text-[11px] font-semibold uppercase tracking-wider mb-2">Stale Agents</h3>
          <div className="space-y-1">
            {staleAgents.map((agent, i) => (
              <p key={i} className="text-muted-foreground text-sm">{agent}</p>
            ))}
          </div>
        </div>
      )}

      {/* Improvement Suggestions */}
      {suggestions.length > 0 && (
        <div>
          <h2 className="font-semibold text-foreground text-[15px] mb-4">Improvement Suggestions</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestions.map((s, i) => (
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
      <OracleActivityLog
        actions={oracleActions.map((a) => ({
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
