import prisma from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DryRunUI } from "./dry-run-ui";

export const dynamic = "force-dynamic";

// Operator-facing dry-run surface. Server component fetches the agent +
// recent DryRunLog captures (grouped by scenario label client-side).
// Heavy lifting + interactivity in DryRunUI.
export default async function DryRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [agent, captures] = await Promise.all([
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
  ]);

  if (!agent) notFound();

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
