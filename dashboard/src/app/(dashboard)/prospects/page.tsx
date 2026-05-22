import prisma from "@/lib/db";
import Link from "next/link";
import { SpawnProspectForm } from "./spawn-form";

// Read-only prospects list. Step 3 of the prospects flow (find-or-create
// shipped Step 1, public /onboard entry Step 2). Step 4 adds an Add-prospect
// button + Atlas-sends-the-link.
//
// Surfaces:
//   - Who's in the pipeline (the question Kyle asked: "track if they have
//     filled in the questionnaire").
//   - Status at a glance (colored pill).
//   - Last activity (relative time — when did they last touch the form?).
//   - Direct link to their hosted proposal if Atlas has generated one.
//
// Sorted by lastActivityAt desc so the most-recently-moved prospects bubble
// to the top.
export const dynamic = "force-dynamic";

const PORTAL_BASE =
  process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";

export default async function ProspectsPage() {
  const prospects = await prisma.prospect.findMany({
    select: {
      id: true,
      email: true,
      token: true,
      contactName: true,
      businessName: true,
      status: true,
      presentationGeneratedAt: true,
      prdGeneratedAt: true,
      prdApprovedAt: true,
      quoteDraft: true,
      quoteSentAt: true,
      quoteAcceptedAt: true,
      quoteDeniedAt: true,
      convertedClientId: true,
      lastActivityAt: true,
      createdAt: true,
    },
    orderBy: { lastActivityAt: "desc" },
  });

  const buckets = bucketByStatus(prospects);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Prospects</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {prospects.length} total
            {buckets.inFlight > 0 && <> · <span className="text-amber-400">{buckets.inFlight} active</span></>}
            {buckets.awaitingQuote > 0 && <> · <span className="text-emerald-400">{buckets.awaitingQuote} awaiting quote</span></>}
          </p>
        </div>
        <SpawnProspectForm />
      </div>

      {prospects.length === 0 ? (
        <div className="bg-card border border-border rounded-xl px-5 py-16 text-center">
          <p className="text-muted-foreground text-sm">No prospects yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">
            Share <span className="text-foreground">{PORTAL_BASE.replace(/^https?:\/\//, "")}/onboard</span> with a warm lead, or use <span className="text-foreground">+ Add prospect</span> above to email a specific person their personal link.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium px-4 py-3">Contact</th>
                <th className="text-left font-medium px-4 py-3">Business</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Last activity</th>
                <th className="text-left font-medium px-4 py-3">Proposal</th>
                <th className="text-left font-medium px-4 py-3">PRD</th>
                <th className="text-left font-medium px-4 py-3">Quote</th>
                <th className="text-left font-medium px-4 py-3">Client</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {prospects.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{p.contactName || <span className="text-muted-foreground/60">(no name yet)</span>}</div>
                    <div className="text-muted-foreground text-xs mt-0.5">{p.email}</div>
                  </td>
                  <td className="px-4 py-3 text-foreground/80">
                    {p.businessName || <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" title={p.lastActivityAt.toISOString()}>
                    {relativeTime(p.lastActivityAt)}
                  </td>
                  <td className="px-4 py-3">
                    {p.presentationGeneratedAt ? (
                      <a
                        href={`${PORTAL_BASE}/proposals/${p.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 text-xs font-medium"
                      >
                        View →
                      </a>
                    ) : (
                      <span className="text-muted-foreground/60 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.prdGeneratedAt ? (
                      <Link
                        href={`/prospects/${p.id}/prd`}
                        className={`text-xs font-medium ${
                          p.prdApprovedAt
                            ? "text-emerald-400 hover:text-emerald-300"
                            : "text-amber-400 hover:text-amber-300"
                        }`}
                      >
                        {p.prdApprovedAt ? "Approved →" : "Review →"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/60 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.quoteDraft ? (
                      <Link
                        href={`/prospects/${p.id}/quote`}
                        className={`text-xs font-medium ${
                          p.quoteAcceptedAt
                            ? "text-emerald-400 hover:text-emerald-300"
                            : p.quoteDeniedAt
                              ? "text-red-400 hover:text-red-300"
                              : p.quoteSentAt
                                ? "text-blue-400 hover:text-blue-300"
                                : "text-amber-400 hover:text-amber-300"
                        }`}
                      >
                        {p.quoteAcceptedAt
                          ? "Accepted →"
                          : p.quoteDeniedAt
                            ? "Denied →"
                            : p.quoteSentAt
                              ? "Sent →"
                              : "Draft →"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/60 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.convertedClientId ? (
                      <Link
                        href={`/clients/${p.convertedClientId}`}
                        className="text-emerald-400 hover:text-emerald-300 text-xs font-medium"
                      >
                        View →
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/60 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status pill — matches the prospect status enum in shared/db schema.
// Colors echo the same family used elsewhere in the dashboard (emerald for
// "done", amber for "in motion", red for "stalled", muted for "ended").
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  discovery: { label: "Discovery", cls: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20" },
  discovery_complete: { label: "Submitted", cls: "bg-blue-500/10 text-blue-400 ring-blue-500/20" },
  presentation_sent: { label: "Proposal sent", cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20" },
  revising: { label: "Revising", cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20" },
  quote_pending: { label: "Scope approved", cls: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" },
  quote_sent: { label: "Quote sent", cls: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" },
  accepted: { label: "Accepted", cls: "bg-emerald-600/15 text-emerald-300 ring-emerald-500/30" },
  ghosted: { label: "Ghosted", cls: "bg-red-500/10 text-red-400 ring-red-500/20" },
  archived: { label: "Archived", cls: "bg-muted text-muted-foreground ring-border" },
};

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, cls: "bg-muted text-muted-foreground ring-border" };
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 ${style.cls}`}>
      {style.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bucketByStatus(prospects: Array<{ status: string }>): { inFlight: number; awaitingQuote: number } {
  let inFlight = 0;
  let awaitingQuote = 0;
  for (const p of prospects) {
    if (p.status === "quote_pending") awaitingQuote++;
    if (["discovery", "discovery_complete", "presentation_sent", "revising"].includes(p.status)) inFlight++;
  }
  return { inFlight, awaitingQuote };
}

function relativeTime(d: Date): string {
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
