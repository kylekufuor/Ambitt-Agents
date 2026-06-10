import prisma from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImprovementsList } from "./improvements-list";

export const dynamic = "force-dynamic";

// Operator review surface for Atlas-Improver's weekly proposals. Server
// component fetches the agent + recent AgentImprovement rows. The client
// component handles approve / reject / revert with optimistic UI.
export default async function ImprovementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [agent, improvements] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, businessName: true, email: true } },
      },
    }),
    prisma.agentImprovement.findMany({
      where: { agentId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  if (!agent) notFound();

  const initial = improvements.map((i) => ({
    id: i.id,
    status: i.status,
    sessionId: i.sessionId,
    proposedPersonality: i.proposedPersonality,
    proposedPurpose: i.proposedPurpose,
    proposedNorthStar: i.proposedNorthStar,
    proposedToolSlugs: (i.proposedToolSlugs as string[] | null) ?? null,
    rationale: i.rationale,
    previousPersonality: i.previousPersonality,
    previousPurpose: i.previousPurpose,
    previousNorthStar: i.previousNorthStar,
    regressionResults: (i.regressionResults as unknown[]) ?? [],
    activitySummary: i.activitySummary as Record<string, unknown> | null,
    reviewedAt: i.reviewedAt?.toISOString() ?? null,
    reviewedNote: i.reviewedNote,
    failureReason: i.failureReason,
    costCents: i.costCents,
    budgetCents: i.budgetCents,
    startedAt: i.startedAt?.toISOString() ?? null,
    completedAt: i.completedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  }));

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div>
        <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
          <Link href="/agents" className="hover:text-foreground">
            Agents
          </Link>{" "}
          ·{" "}
          <Link href={`/agents/${agent.id}`} className="hover:text-foreground">
            {agent.name}
          </Link>{" "}
          · Improvements
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {agent.name}
          <span className="text-muted-foreground font-normal"> · self-improvement</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {agent.client.businessName} · weekly cycles run Sundays 02:00 UTC.
          Every proposal needs your sign-off before it ships to {agent.name}'s prompt.
        </p>
      </div>

      <ImprovementsList
        agentId={agent.id}
        agentName={agent.name}
        currentPersonality={agent.personality}
        currentPurpose={agent.purpose}
        initial={initial}
      />
    </div>
  );
}
