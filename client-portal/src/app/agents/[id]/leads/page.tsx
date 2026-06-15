import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PortalShell } from "@/components/portal-shell";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; pill: string }> = {
  new: { label: "New", pill: "pill-blue" },
  contacted: { label: "Contacted", pill: "pill-amber" },
  replied: { label: "Replied", pill: "pill-emerald" },
  qualified: { label: "Qualified", pill: "pill-emerald" },
  won: { label: "Won", pill: "pill-emerald" },
  lost: { label: "Lost", pill: "pill-muted" },
  archived: { label: "Archived", pill: "pill-muted" },
};

// Order the summary chips follow.
const STATUS_ORDER = ["new", "contacted", "replied", "qualified", "won", "lost", "archived"];

function fmtUsd(v: number | null): string | null {
  if (v == null) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v.toLocaleString()}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function AgentLeadsPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: { id: true, name: true, client: { select: { email: true, businessName: true } } },
  });
  if (!agent) notFound();
  if (agent.client.email !== user.email) notFound();

  const leads = await prisma.lead.findMany({
    where: { agentId: agent.id },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      phone: true,
      status: true,
      source: true,
      valueUsd: true,
      notes: true,
      details: true,
      lastContactedAt: true,
      createdAt: true,
    },
  });

  const counts: Record<string, number> = {};
  for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1;
  const summary = STATUS_ORDER.filter((s) => counts[s]).map((s) => ({
    status: s,
    label: STATUS[s]?.label ?? s,
    count: counts[s],
  }));

  return (
    <PortalShell user={{ email: user.email, name: agent.client.businessName }}>
      <div className="max-w-[920px] mx-auto px-6 pt-10 pb-16">
        <Link
          href={`/agents/${agent.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-[color:var(--text-3)] hover:text-[color:var(--text)] transition mb-6"
        >
          ← Back to {agent.name}
        </Link>

        <header className="flex items-end justify-between gap-4 mb-7 reveal" style={{ ["--i" as never]: 0 }}>
          <div>
            <p className="eyebrow mb-2">{agent.name}</p>
            <h1 className="font-display text-[34px] leading-none text-[color:var(--text)]">Leads</h1>
            <p className="text-[14px] text-[color:var(--text-3)] mt-2.5 max-w-[560px]">
              Everything {agent.name} has sourced and worked for you. Updated automatically
              as {agent.name} finds and follows up on opportunities.
            </p>
          </div>
          {leads.length > 0 && (
            <a
              href={`/api/agents/${agent.id}/leads/export`}
              className="btn-ghost shrink-0 whitespace-nowrap"
            >
              ↓ Export CSV
            </a>
          )}
        </header>

        {/* Status summary */}
        {leads.length > 0 && (
          <section className="flex flex-wrap items-center gap-2 mb-6 reveal" style={{ ["--i" as never]: 1 }}>
            <span className="pill pill-muted">{leads.length} total</span>
            {summary.map((s) => (
              <span key={s.status} className={`pill ${STATUS[s.status]?.pill ?? "pill-muted"}`}>
                {s.count} {s.label}
              </span>
            ))}
          </section>
        )}

        {/* List */}
        <section className="reveal" style={{ ["--i" as never]: 2 }}>
          {leads.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="font-display text-[20px] text-[color:var(--text)] mb-1.5">
                No leads yet
              </p>
              <p className="text-[13.5px] text-[color:var(--text-3)] max-w-md mx-auto">
                As soon as {agent.name} starts sourcing, every opportunity — with its owner,
                deal details, and status — shows up here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {leads.map((l) => (
                <LeadCard key={l.id} lead={l} />
              ))}
            </div>
          )}
        </section>

        <p className="text-center text-[12px] text-[color:var(--text-4)] mt-10">
          Want these flowing into a Google Sheet automatically? Just reply to {agent.name} and
          ask.
        </p>
      </div>
    </PortalShell>
  );
}

type LeadRow = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  valueUsd: number | null;
  notes: string | null;
  details: unknown;
  lastContactedAt: Date | null;
  createdAt: Date;
};

function LeadCard({ lead }: { lead: LeadRow }) {
  const status = STATUS[lead.status] ?? { label: lead.status, pill: "pill-muted" };
  const value = fmtUsd(lead.valueUsd);
  const detailEntries =
    lead.details && typeof lead.details === "object" && !Array.isArray(lead.details)
      ? Object.entries(lead.details as Record<string, unknown>).filter(([, v]) => v != null && v !== "")
      : [];

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15.5px] font-medium text-[color:var(--text)] leading-tight">
            {lead.name}
          </h3>
          {lead.company && (
            <p className="text-[13px] text-[color:var(--text-3)] mt-0.5">{lead.company}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {value && (
            <span className="font-display text-[16px] text-[color:var(--text)]">{value}</span>
          )}
          <span className={`pill ${status.pill}`}>{status.label}</span>
        </div>
      </div>

      {(lead.email || lead.phone) && (
        <p className="text-[13px] text-[color:var(--text-2)] mt-2">
          {[lead.email, lead.phone].filter(Boolean).join("  ·  ")}
        </p>
      )}

      {lead.notes && (
        <p className="text-[13px] text-[color:var(--text-3)] mt-2 leading-relaxed">{lead.notes}</p>
      )}

      {detailEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {detailEntries.map(([k, v]) => (
            <span
              key={k}
              className="text-[11.5px] rounded-[7px] px-2 py-1 bg-[color:var(--surface-2)] text-[color:var(--text-2)]"
            >
              <span className="text-[color:var(--text-4)]">{k}:</span> {String(v)}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3.5 pt-3 border-t border-[color:var(--border)] text-[12px] text-[color:var(--text-4)]">
        {lead.source && <span>{lead.source}</span>}
        {lead.source && <span>·</span>}
        <span>Added {fmtDate(lead.createdAt)}</span>
        {lead.lastContactedAt && (
          <>
            <span>·</span>
            <span>Last contacted {fmtDate(lead.lastContactedAt)}</span>
          </>
        )}
      </div>
    </div>
  );
}
