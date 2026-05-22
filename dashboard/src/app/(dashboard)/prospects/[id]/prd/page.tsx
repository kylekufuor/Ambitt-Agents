import prisma from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PRDActions } from "./actions";

// PRD review page. Server component fetches the prospect; the rendered PRD
// HTML is embedded via iframe pointing at Oracle's /prd-html endpoint so the
// dashboard chrome and the PRD's own dark theme don't collide.
export const dynamic = "force-dynamic";

const ORACLE_BASE =
  process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";

export default async function PRDPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prospect = await prisma.prospect.findUnique({
    where: { id },
    select: {
      id: true,
      contactName: true,
      businessName: true,
      email: true,
      status: true,
      prdData: true,
      prdGeneratedAt: true,
      prdApprovedAt: true,
    },
  });

  if (!prospect) notFound();

  const prdUrl = `${ORACLE_BASE}/onboarding/prospects/${prospect.id}/prd-html`;
  const generated = Boolean(prospect.prdData);
  const approved = Boolean(prospect.prdApprovedAt);

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
            <Link href="/prospects" className="hover:text-foreground">Prospects</Link> · PRD
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {prospect.contactName ?? "(no name)"}
            {prospect.businessName && (
              <span className="text-muted-foreground font-normal"> · {prospect.businessName}</span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {prospect.email}
            {generated && (
              <> · Generated {timeAgo(prospect.prdGeneratedAt!)}</>
            )}
            {approved && (
              <> · <span className="text-emerald-400">Approved {timeAgo(prospect.prdApprovedAt!)}</span></>
            )}
          </p>
        </div>
        <PRDActions
          prospectId={prospect.id}
          hasPRD={generated}
          approved={approved}
        />
      </div>

      {generated ? (
        <iframe
          src={prdUrl}
          title="Agent PRD"
          className="w-full border border-border rounded-xl bg-[#0a0a0a]"
          style={{ height: "calc(100vh - 220px)", minHeight: 600 }}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl px-5 py-16 text-center">
          <p className="text-muted-foreground text-sm">PRD not generated yet.</p>
          <p className="text-muted-foreground/60 text-xs mt-1">
            Atlas runs ~2 min after the prospect approves scope. If they just approved,
            give it a moment and refresh.
          </p>
        </div>
      )}
    </div>
  );
}

function timeAgo(d: Date): string {
  const seconds = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
