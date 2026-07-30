import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { V3Shell } from "@/components/v3-shell";
import {
  presentLeadName,
  presentText,
  presentScenario,
  presentTemperature,
  presentContact,
  presentLastSpoke,
  DERIVED_TEMPERATURE_NOTE,
  type Temperature,
} from "@/lib/lead-presentation";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /leads — the screen the portal exists for.

   Board and table are the same rows, the same filters and the same URL, one
   toggle apart. Board answers "what needs me". Table answers "who have I gone
   quiet on", which is a sortable column and not something a card can carry.

   Every card states WHY it sits where it sits. That line is the product: an
   automatic sort nobody explains is a colour somebody else picked for you, and
   a broker stops trusting it within a week.
   --------------------------------------------------------------------------- */

const COLUMNS: { key: Temperature; title: string; note: string }[] = [
  { key: "hot", title: "Hot", note: "answer these" },
  { key: "warm", title: "Warm", note: "he is on these" },
  { key: "cold", title: "Cold", note: "parked, not gone" },
];

type LeadRow = {
  id: string;
  name: string;
  company: string | null;
  status: string;
  notes: string | null;
  details: unknown;
  temperature: string | null;
  temperatureReason: string | null;
  temperatureSetBy: string | null;
  lastContactedAt: Date | null;
  createdAt: Date;
};

function SparkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 mt-[1px] text-[color:var(--text-4)]">
      <path d="M12 3.2l2.1 5.5 5.5 2.1-5.5 2.1-2.1 5.5-2.1-5.5L4.4 10.8l5.5-2.1z" fill="currentColor" opacity=".25" />
      <path d="M12 3.2l2.1 5.5 5.5 2.1-5.5 2.1-2.1 5.5-2.1-5.5L4.4 10.8l5.5-2.1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function prepare(lead: LeadRow) {
  const name = presentLeadName(lead.name);
  return {
    id: lead.id,
    name,
    subtitle: name.subtitle ?? lead.company ?? null,
    temp: presentTemperature(lead),
    scenario: presentScenario(lead.details),
    contact: presentContact(lead.status, lead.lastContactedAt),
    lastSpoke: presentLastSpoke(lead.status, lead.lastContactedAt),
    // The agent's own summary of where this stands, trimmed to a card's worth.
    headline: presentText(lead.notes).split(/(?<=\.)\s+/)[0] ?? "",
  };
}

function TempPill({ t }: { t: Temperature }) {
  const cls = t === "hot" ? "pill-amber" : "pill-muted";
  return <span className={`pill ${cls}`}>{t}</span>;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { email: user.email },
    select: { businessName: true, agents: { select: { name: true }, take: 1, orderBy: { createdAt: "asc" } } },
  });
  if (!client) redirect("/login");
  const agentName = client.agents[0]?.name ?? "Your agent";

  const leads = (await prisma.lead.findMany({
    where: { client: { email: user.email } },
    orderBy: [{ lastContactedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, name: true, company: true, status: true, notes: true, details: true,
      temperature: true, temperatureReason: true, temperatureSetBy: true,
      lastContactedAt: true, createdAt: true,
    },
  })) as LeadRow[];

  const rows = leads.map(prepare);
  const isTable = view === "table";
  const byTemp = (t: Temperature) => rows.filter((r) => r.temp.value === t);
  // Nobody has judged any of these yet, which is true of every lead written
  // before the temperature column existed. Say so once, at the top, rather
  // than repeating it on every card.
  const allDerived = rows.length > 0 && rows.every((r) => r.temp.by === "derived");

  return (
    <V3Shell user={{ email: user.email, name: client.businessName }} crumbs={[{ label: "Leads" }]}>
      <div className="flex items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-medium tracking-[-0.01em]">Leads</h1>
          <p className="text-[14px] text-[color:var(--text-3)] mt-1">
            Every owner {agentName} is working for you, hottest first.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap mt-5 mb-3.5">
        <div className="inline-flex rounded-[5px] p-0.5 bg-[color:var(--surface-2)]" style={{ boxShadow: "var(--well)" }} role="group" aria-label="View">
          {[
            { k: "board", label: "Board", href: "/leads" },
            { k: "table", label: "Table", href: "/leads?view=table" },
          ].map((v) => {
            const on = (v.k === "table") === isTable;
            return (
              <Link
                key={v.k}
                href={v.href}
                aria-pressed={on}
                className={`h-7 px-3 rounded-[4px] text-[12.5px] inline-flex items-center no-underline ${
                  on ? "bg-[color:var(--surface)] text-[color:var(--text)] font-medium" : "text-[color:var(--text-2)]"
                }`}
                style={on ? { boxShadow: "var(--lit), 0 1px 2px rgba(27,49,57,0.11)" } : undefined}
              >
                {v.label}
              </Link>
            );
          })}
        </div>
        <span className="ml-auto text-[12.5px] text-[color:var(--text-3)]">
          {allDerived
            ? `${agentName} has not sorted these yet.`
            : `${agentName} sorted these. Move any one you disagree with.`}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="v3-panel p-8 max-w-[56ch]">
          <p className="text-[20px] font-medium">{agentName} has not logged an owner yet.</p>
          <p className="text-[14px] text-[color:var(--text-2)] mt-2.5 leading-relaxed">
            His first sourcing run will put them here, and he will email you the moment there is
            something worth looking at. You do not have to come back here to find out.
          </p>
        </div>
      ) : isTable ? (
        /* ---- TABLE: the view that answers "who have I gone quiet on" ---- */
        <div className="v3-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Owner", "Temperature", "Where it stands", "You last spoke"].map((h) => (
                    <th
                      key={h}
                      className="text-left font-mono text-[11px] font-medium tracking-[0.08em] uppercase text-[color:var(--text-3)] px-3.5 py-2.5 border-b border-[color:var(--border)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[color:var(--bg)]">
                    <td className="px-3.5 py-3 border-b border-[color:var(--border)] align-middle">
                      <Link href={`/leads/${r.id}`} className="no-underline">
                        <p className="text-[14px] font-medium text-[color:var(--text)]">{r.name.title}</p>
                        {r.subtitle && <p className="text-[12.5px] text-[color:var(--text-3)] mt-px">{r.subtitle}</p>}
                      </Link>
                    </td>
                    <td className="px-3.5 py-3 border-b border-[color:var(--border)] align-middle">
                      <TempPill t={r.temp.value} />
                    </td>
                    <td className="px-3.5 py-3 border-b border-[color:var(--border)] align-middle text-[14px] text-[color:var(--text-2)]">
                      {r.headline || "Sourced, nothing sent yet"}
                      {r.scenario && (
                        <span className="ml-2 inline-flex items-center h-5 px-2 rounded-[4px] bg-[color:var(--surface-2)] text-[color:var(--text-2)] text-[10.5px] font-medium uppercase tracking-[0.03em]">
                          {r.scenario}
                        </span>
                      )}
                    </td>
                    {/* "date not recorded" is the truth for every lead written
                        before 29 July, not a placeholder. */}
                    <td className="px-3.5 py-3 border-b border-[color:var(--border)] align-middle font-mono text-[12.5px] text-[color:var(--text-3)] whitespace-nowrap">
                      {r.lastSpoke}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ---- BOARD: the view that answers "what needs me" ---- */
        <div className="grid gap-3.5 items-start lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = byTemp(col.key);
            return (
              <section key={col.key} className="v3-well p-2.5" aria-label={col.title}>
                <div className="flex items-center gap-2 px-1 pb-2.5">
                  <span
                    className="w-[7px] h-[7px] rounded-full shrink-0"
                    style={{
                      background: col.key === "hot" ? "var(--amber)" : "var(--text-4)",
                      boxShadow: col.key === "hot"
                        ? "0 0 0 3px var(--amber-tint)"
                        : "0 0 0 3px rgba(120,148,159,.13)",
                    }}
                  />
                  <span className={`text-[14px] font-medium ${col.key === "hot" ? "text-[color:var(--amber)]" : ""}`}>
                    {col.title}
                  </span>
                  <span className="font-mono text-[12.5px] text-[color:var(--text-3)]">{items.length}</span>
                  <span className="ml-auto text-[11px] text-[color:var(--text-3)]">{col.note}</span>
                </div>

                <div className="flex flex-col gap-2">
                  {items.length === 0 && (
                    <p className="text-[12.5px] text-[color:var(--text-3)] px-1 py-2 leading-relaxed">
                      Nothing here right now.
                    </p>
                  )}
                  {items.map((r) => (
                    <Link key={r.id} href={`/leads/${r.id}`} className="v3-card block p-3 no-underline">
                      <p className="text-[14px] font-medium leading-tight text-[color:var(--text)]">{r.name.title}</p>
                      {r.subtitle && <p className="text-[12.5px] text-[color:var(--text-3)] mt-0.5">{r.subtitle}</p>}

                      {r.headline && (
                        <p className="text-[12.5px] text-[color:var(--text-2)] mt-2 pt-2 border-t border-[color:var(--border)] leading-snug">
                          {r.headline}
                        </p>
                      )}

                      {/* The reason line. Present when the agent judged it,
                          honest when nobody has. Never invented. */}
                      <p className="flex gap-1.5 items-start mt-2 text-[11px] text-[color:var(--text-3)] leading-snug">
                        <SparkIcon />
                        {r.temp.reason ?? DERIVED_TEMPERATURE_NOTE}
                      </p>

                      <p className="font-mono text-[11px] text-[color:var(--text-3)] mt-2">
                        {r.contact ?? "never contacted"}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </V3Shell>
  );
}
