import prisma from "@/lib/db";
import { OracleOrb } from "@/components/oracle-orb";

export const dynamic = "force-dynamic";

// Oracle is Atlas's room — the orb and its context bar, nothing else.
// Everything operational lives where it belongs now:
//   fleet stats + approval queue  → /agents
//   funnel queues (PRDs, quotes)  → /prospects
//   activity log + ops buttons    → /activity
// When the voice loop lands (Jarvis V2), this page is the HUD's resting
// state — waking Atlas dims and expands what's already here.
export default async function OraclePage() {
  const pendingCount = await prisma.agent.count({
    where: { status: "pending_approval" },
  });

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3rem)]">
      <OracleOrb pendingCount={pendingCount} />
    </div>
  );
}
