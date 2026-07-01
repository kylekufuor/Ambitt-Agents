import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PortalShell } from "@/components/portal-shell";
import { getSendStats, sendStatusPresentation } from "@/lib/agent-activity";

export const dynamic = "force-dynamic";

function formatWhen(d: Date): string {
  const ms = Date.now() - d.getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function AgentActivityPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      maxEmailsPerDay: true,
      client: { select: { email: true, businessName: true } },
    },
  });
  if (!agent) notFound();
  if (agent.client.email !== user.email) notFound();

  const stats = await getSendStats(agent.id, agent.client.email, { take: 40 });
  const cap = agent.maxEmailsPerDay;
  const capPct = cap && cap > 0 ? Math.min(100, Math.round((stats.today / cap) * 100)) : 0;

  return (
    <PortalShell user={{ email: user.email, name: agent.client.businessName }}>
      <div className="max-w-[820px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        <Link
          href={`/agents/${agent.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-[color:var(--text-3)] hover:text-[color:var(--text)] transition mb-6"
        >
          ← Back to {agent.name}
        </Link>

        <header className="mb-8 reveal" style={{ ["--i" as never]: 0 }}>
          <p className="eyebrow mb-2">{agent.name}</p>
          <h1 className="font-display text-[34px] leading-none text-[color:var(--text)]">Activity</h1>
          <p className="text-[14px] text-[color:var(--text-3)] mt-2.5 max-w-[560px]">
            Every email {agent.name} sends on your behalf — who it went to, when, and
            whether it landed.
          </p>
        </header>

        {/* Summary */}
        <section className="grid grid-cols-3 gap-3 mb-8 reveal" style={{ ["--i" as never]: 1 }}>
          <StatCard label="Sent today" value={stats.today} />
          <StatCard label="This week" value={stats.week} />
          <StatCard label="Last 30 days" value={stats.month} />
        </section>

        {/* Cap context */}
        {cap && cap > 0 && (
          <section className="card p-5 mb-8 reveal" style={{ ["--i" as never]: 2 }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[14px] text-[color:var(--text-2)]">
                Today&apos;s outreach
              </p>
              <p className="text-[13px] text-[color:var(--text-3)]">
                <span className="text-[color:var(--text)] font-medium">{stats.today}</span> of {cap} daily limit
              </p>
            </div>
            <div className="bar-track">
              <div
                className={`bar-fill ${stats.today >= cap ? "warn" : ""}`}
                style={{ width: `${Math.max(2, capPct)}%` }}
              />
            </div>
            <p className="text-[12px] text-[color:var(--text-4)] mt-2.5">
              You can change this limit on{" "}
              <Link href={`/agents/${agent.id}`} className="text-[color:var(--brand-hover)] hover:underline">
                {agent.name}&apos;s settings
              </Link>
              .
            </p>
          </section>
        )}

        {/* Timeline */}
        <section className="reveal" style={{ ["--i" as never]: 3 }}>
          <h2 className="font-display text-[20px] text-[color:var(--text)] mb-4">Recent emails</h2>

          {stats.recent.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="font-display text-[18px] text-[color:var(--text)] mb-1.5">
                Nothing sent yet
              </p>
              <p className="text-[13.5px] text-[color:var(--text-3)] max-w-sm mx-auto">
                Once {agent.name} starts reaching out, every email shows up here with its
                delivery status.
              </p>
            </div>
          ) : (
            <div className="card divide-y divide-[color:var(--border)]">
              {stats.recent.map((s) => {
                const status = sendStatusPresentation(s.status);
                return (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-[color:var(--text)] truncate">
                        {s.subject || "(no subject)"}
                      </p>
                      <p className="text-[12.5px] text-[color:var(--text-3)] mt-0.5 truncate">
                        {s.isToClient ? (
                          <span className="text-[color:var(--text-4)]">To you</span>
                        ) : (
                          <>To {s.to}</>
                        )}
                        <span className="text-[color:var(--text-4)]"> · {formatWhen(s.acceptedAt)}</span>
                      </p>
                    </div>
                    <span className={`pill ${status.pill} shrink-0`}>{status.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PortalShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4 text-center">
      <div className="font-display text-[28px] text-[color:var(--text)] leading-none">
        {value.toLocaleString()}
      </div>
      <p className="text-[11.5px] uppercase tracking-[0.07em] text-[color:var(--text-4)] mt-2">
        {label}
      </p>
    </div>
  );
}
