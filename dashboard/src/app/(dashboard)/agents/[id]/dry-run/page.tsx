import prisma from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DryRunUI } from "./dry-run-ui";
import { BuildPanel, type BuildScenario, type BuildSnapshot, type VeraVerdict } from "./build-panel";

export const dynamic = "force-dynamic";

// Operator-facing dry-run + build-report surface. Server component fetches:
//   1. The agent + its recent DryRunLog captures (operator + Fable both write
//      here).
//   2. The most recent Atlas-on-Fable Build linked to this agent (if any).
//      If found, BuildPanel renders the build report above the dry-run UI
//      and polls /api/builds/:id for live updates. Hybrid UX target: same
//      page, Fable populates → operator approves OR hits "Skip Fable".
export default async function DryRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [agent, captures, latestBuild] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, businessName: true, email: true } },
      },
    }),
    prisma.dryRunLog.findMany({
      where: { agentId: id },
      orderBy: { capturedAt: "desc" },
      take: 200,
    }),
    // Most recent build linked to this agent. We only need the latest; if a
    // rebuild ever happens, the new Build supersedes the old in this view.
    prisma.build.findFirst({
      where: { agentId: id },
      orderBy: { createdAt: "desc" },
      include: {
        prospect: { select: { id: true, token: true } },
      },
    }),
  ]);

  if (!agent) notFound();

  const buildSnapshot: BuildSnapshot | null = latestBuild
    ? {
        id: latestBuild.id,
        status: latestBuild.status as BuildSnapshot["status"],
        prospectId: latestBuild.prospectId,
        agentId: latestBuild.agentId,
        sessionId: latestBuild.sessionId,
        environmentId: latestBuild.environmentId,
        scenarios: (latestBuild.scenarios as unknown as BuildScenario[]) ?? [],
        veraVerdicts: (latestBuild.veraVerdicts as unknown as VeraVerdict[]) ?? [],
        costCents: latestBuild.costCents,
        budgetCents: latestBuild.budgetCents,
        failureReason: latestBuild.failureReason,
        startedAt: latestBuild.startedAt?.toISOString() ?? null,
        completedAt: latestBuild.completedAt?.toISOString() ?? null,
        createdAt: latestBuild.createdAt.toISOString(),
      }
    : null;

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
            <Link href="/agents" className="hover:text-foreground">
              Agents
            </Link>{" "}
            ·{" "}
            <Link href={`/agents/${agent.id}`} className="hover:text-foreground">
              {agent.name}
            </Link>{" "}
            · Dry-run
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {agent.name}
            <span className="text-muted-foreground font-normal"> · dry-run</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {agent.client.businessName} · {agent.client.email} · status{" "}
            <span className="text-foreground font-mono text-xs">{agent.status}</span>
          </p>
        </div>
      </div>

      {buildSnapshot && (
        <BuildPanel
          initialBuild={buildSnapshot}
          agentId={agent.id}
          prospectToken={latestBuild?.prospect?.token ?? null}
        />
      )}

      <DryRunUI
        agentId={agent.id}
        agentName={agent.name}
        agentStatus={agent.status}
        initialDryRun={agent.dryRun}
        initialCaptures={captures.map((c) => ({
          id: c.id,
          kind: c.kind,
          payload: c.payload as Record<string, unknown>,
          scenario: c.scenario,
          reviewedAt: c.reviewedAt?.toISOString() ?? null,
          reviewedOk: c.reviewedOk,
          reviewNote: c.reviewNote,
          capturedAt: c.capturedAt.toISOString(),
        }))}
      />
    </div>
  );
}
