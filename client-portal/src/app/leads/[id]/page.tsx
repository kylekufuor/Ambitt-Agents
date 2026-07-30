import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { V3Shell } from "@/components/v3-shell";
import {
  presentLeadName,
  presentText,
  presentDetails,
  presentScenario,
  presentTemperature,
  presentLastSpoke,
  buildThread,
  DERIVED_TEMPERATURE_NOTE,
  type ThreadEvent,
} from "@/lib/lead-presentation";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /leads/[id] — one owner.

   Front's shape: the conversation IS the record, not a tab on it. The thread is
   the main column and the facts sit beside it, because "when did I last speak
   to this person, and what did they say" is the question this page exists for.

   The thread is built only from things we can prove — see buildThread. Today
   that is thin on purpose: Casey's leads have no email address on them and
   there are zero EmailSend rows, because Arthur has been held since 11 July.
   The page says that plainly instead of drawing an empty timeline and letting
   him guess.
   --------------------------------------------------------------------------- */

function Marker({ side }: { side: ThreadEvent["side"] }) {
  const style =
    side === "them"
      ? { background: "var(--emerald)", borderColor: "var(--emerald)" }
      : side === "us"
        ? { background: "var(--brand-solid)", borderColor: "var(--brand-solid)" }
        : { background: "var(--surface)", borderColor: "var(--border-strong)" };
  return (
    <span
      className="absolute left-0 top-[5px] w-[9px] h-[9px] rounded-full border-[1.5px]"
      style={style}
      aria-hidden="true"
    />
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true, name: true, company: true, email: true, phone: true,
      status: true, notes: true, details: true, source: true,
      temperature: true, temperatureReason: true, temperatureSetBy: true, temperatureSetAt: true,
      lastContactedAt: true, createdAt: true,
      client: { select: { email: true, businessName: true } },
      agent: { select: { id: true, name: true } },
    },
  });
  if (!lead) notFound();
  // Ownership: a lead belongs to a client, and only that client may read it.
  if (lead.client.email !== user.email) notFound();

  const sends = lead.email
    ? await prisma.emailSend.findMany({
        where: { to: lead.email },
        orderBy: { acceptedAt: "asc" },
        select: {
          to: true, subject: true, acceptedAt: true,
          deliveredAt: true, bouncedAt: true, bounceReason: true,
        },
      })
    : [];

  const agentName = lead.agent?.name ?? "Your agent";
  const name = presentLeadName(lead.name);
  const temp = presentTemperature(lead);
  const scenario = presentScenario(lead.details);
  const facts = presentDetails(lead.details);
  const scalars = facts.filter((f) => f.kind === "scalar");
  const prose = facts.filter((f) => f.kind === "prose");
  const thread = buildThread(lead, sends, agentName);
  const notes = presentText(lead.notes);

  return (
    <V3Shell
      user={{ email: user.email, name: lead.client.businessName }}
      crumbs={[{ label: "Leads", href: "/leads" }, { label: name.title }]}
    >
      <div className="flex items-start gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[24px] font-medium tracking-[-0.01em]">{name.title}</h1>
          {(name.subtitle || lead.company) && (
            <p className="text-[14px] text-[color:var(--text-3)] mt-1">{name.subtitle ?? lead.company}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-2.5">
            {scenario && (
              <span className="inline-flex items-center h-5 px-2 rounded-[4px] bg-[color:var(--surface-2)] text-[color:var(--text-2)] text-[10.5px] font-medium uppercase tracking-[0.03em]">
                {scenario}
              </span>
            )}
            <span className={`pill ${temp.value === "hot" ? "pill-amber" : "pill-muted"}`}>{temp.value}</span>
            <span className="font-mono text-[11px] text-[color:var(--text-3)]">
              you last spoke {presentLastSpoke(lead.status, lead.lastContactedAt)}
            </span>
          </div>
        </div>

        {/* Temperature is a control, not a label. Arthur's choice is stated with
            his reason under it; overruling him is one click, and the API keeps
            a client's own choice from being overwritten on the next run. */}
        <div className="ml-auto flex flex-col items-end gap-1.5 shrink-0">
          <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-[color:var(--text-3)]">
            Temperature
          </span>
          <div
            className="inline-flex rounded-[5px] p-0.5 bg-[color:var(--surface-2)]"
            style={{ boxShadow: "var(--well)" }}
            role="group"
            aria-label="Temperature"
          >
            {(["hot", "warm", "cold"] as const).map((t) => {
              const on = temp.value === t;
              return (
                <span
                  key={t}
                  aria-pressed={on}
                  className={`h-[30px] px-3 rounded-[4px] text-[12.5px] inline-flex items-center capitalize ${
                    on ? "bg-[color:var(--surface)] text-[color:var(--text)] font-medium" : "text-[color:var(--text-2)]"
                  }`}
                  style={on ? { boxShadow: "var(--lit), 0 1px 2px rgba(27,49,57,0.11)" } : undefined}
                >
                  {t}
                </span>
              );
            })}
          </div>
          <p className="text-[11px] text-[color:var(--text-3)] text-right max-w-[32ch] leading-snug">
            {temp.by === "client"
              ? `You set this. ${agentName} will not change it.`
              : temp.reason ?? DERIVED_TEMPERATURE_NOTE}
          </p>
        </div>
      </div>

      <div className="grid gap-5 mt-6 items-start lg:grid-cols-[1fr_320px]">
        <div>
          <section className="v3-panel p-[17px]">
            <h2 className="text-[16px] font-medium">Every exchange</h2>
            <p className="text-[12.5px] text-[color:var(--text-3)] mt-0.5">
              Both sides, oldest first. Nothing here is hidden from you.
            </p>

            <ul className="mt-3.5 list-none">
              {thread.map((e, i) => (
                <li key={`${e.kind}-${i}`} className="relative pl-5 pb-4 last:pb-0">
                  {i < thread.length - 1 && (
                    <span className="absolute left-1 top-[15px] bottom-0 w-px bg-[color:var(--border)]" aria-hidden="true" />
                  )}
                  <Marker side={e.side} />
                  <p className="font-mono text-[11px] text-[color:var(--text-3)]">
                    {e.at.toLocaleString("en-GB", {
                      weekday: "short", day: "numeric", month: "short",
                      hour: "numeric", minute: "2-digit", hour12: true,
                    })}
                  </p>
                  <p className="text-[14px] text-[color:var(--text-2)] mt-0.5">
                    <b className="font-medium text-[color:var(--text)]">{e.title}</b>
                    {e.detail && <> {e.detail}</>}
                  </p>
                </li>
              ))}
            </ul>

            {/* The honest part. No address means nothing can have been sent, and
                that is a gap the client can actually close. */}
            {sends.length === 0 && (
              <div
                className="mt-4 rounded-[6px] p-3 text-[13px] text-[color:var(--text-2)] leading-relaxed"
                style={{ background: "var(--bg)", boxShadow: "var(--well)" }}
              >
                {lead.email ? (
                  <>Nothing has gone to this owner yet. {agentName} drafts and holds until you say so.</>
                ) : (
                  <>
                    <b className="font-medium text-[color:var(--text)]">No address for this owner yet.</b>{" "}
                    {agentName} cannot write to them until there is one, so nothing has been sent. Reply
                    to his last email with an address, or tell him where to look for it.
                  </>
                )}
              </div>
            )}
          </section>

          <section className="v3-panel p-[17px] mt-3.5">
            <h2 className="text-[16px] font-medium">Anything he got wrong</h2>
            <p className="text-[12.5px] text-[color:var(--text-3)] mt-0.5 leading-relaxed">
              A correction is a message to {agentName}, not an edit to a database. He reads it,
              confirms it, and works this owner and the ones like him differently from then on.
            </p>
            <textarea
              className="w-full min-h-[72px] mt-3 px-3 py-2.5 rounded-[5px] bg-[color:var(--surface)] text-[14px] border border-[color:var(--border-strong)] resize-y"
              placeholder={`Tell ${agentName} what is wrong with this one.`}
              aria-label="Your correction"
            />
            <div className="flex gap-2.5 items-center mt-3 flex-wrap">
              <button className="btn btn-primary">Send the correction</button>
              <button className="btn btn-secondary">Not a fit, tell him why</button>
            </div>
          </section>
        </div>

        <aside>
          <section className="v3-panel p-[17px]">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-3)]">
              The property
            </p>
            {scalars.length > 0 ? (
              <div className="mt-2.5">
                {scalars.map((f) => (
                  <div key={f.key} className="flex justify-between gap-3.5 py-[7px] border-b border-[color:var(--border)] last:border-b-0">
                    <span className="text-[12.5px] text-[color:var(--text-3)]">{f.label}</span>
                    <span className="font-mono text-[12.5px] text-[color:var(--text)] text-right">{f.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[color:var(--text-3)] mt-2">
                {agentName} has not recorded any figures for this one yet.
              </p>
            )}

            {/* Sentences set as sentences. The agent writes 60 to 120 character
                notes and the aligned pair layout above is built for "1987". */}
            {prose.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[color:var(--border)] space-y-2.5">
                {prose.map((f) => (
                  <div key={f.key}>
                    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-3)]">
                      {f.label}
                    </p>
                    <p className="text-[14px] text-[color:var(--text-2)] leading-relaxed mt-0.5">{f.value}</p>
                  </div>
                ))}
              </div>
            )}

            {notes && (
              <div className="mt-3 pt-3 border-t border-[color:var(--border)]">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-3)]">
                  What he wrote
                </p>
                <p className="text-[14px] text-[color:var(--text-2)] leading-relaxed mt-0.5">{notes}</p>
              </div>
            )}
          </section>

          <section className="v3-panel p-[17px] mt-3.5">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-3)]">
              Reaching them
            </p>
            <div className="mt-2.5">
              {[
                { k: "Email", v: lead.email },
                { k: "Phone", v: lead.phone },
              ].map((r) => (
                <div key={r.k} className="flex justify-between gap-3.5 py-[7px] border-b border-[color:var(--border)] last:border-b-0">
                  <span className="text-[12.5px] text-[color:var(--text-3)]">{r.k}</span>
                  <span className={`font-mono text-[12.5px] text-right ${r.v ? "text-[color:var(--text)]" : "text-[color:var(--text-3)]"}`}>
                    {r.v ?? "none yet"}
                  </span>
                </div>
              ))}
            </div>
            {lead.source && (
              <p className="text-[12.5px] text-[color:var(--text-3)] mt-2.5">Found via {presentText(lead.source)}.</p>
            )}
          </section>

          <p className="text-[12.5px] text-[color:var(--text-3)] mt-3.5 px-1">
            <Link href="/leads" className="text-[color:var(--brand-ink)] no-underline hover:underline">
              All owners
            </Link>
          </p>
        </aside>
      </div>
    </V3Shell>
  );
}
