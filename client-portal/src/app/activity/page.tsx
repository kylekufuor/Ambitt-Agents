import prisma from "@/lib/db";
import { V3Shell } from "@/components/v3-shell";
import { PageHead, Panel, Eyebrow, Empty } from "@/components/v3-ui";
import { requirePortalContext, describeSchedule } from "@/lib/portal-context";
import { presentText } from "@/lib/lead-presentation";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /activity — everything the agent has done, newest first.

   One list, not three stat cards. v2's activity page opened with a row of
   counters, which is the shape you reach for when you do not trust the log to
   be interesting. The log IS the product: a client who can read what their
   agent actually did does not need a number telling them it was a lot.

   Every row here has a database row behind it. Nothing is inferred.
   --------------------------------------------------------------------------- */

type Item = { at: Date; title: string; detail?: string; tone: "sent" | "lead" | "run" | "bad" };

export default async function ActivityPage() {
  const { email, client, agent } = await requirePortalContext();
  const name = agent?.name ?? "Your agent";

  const [sends, leads] = agent
    ? await Promise.all([
        prisma.emailSend.findMany({
          where: { agentId: agent.id },
          orderBy: { acceptedAt: "desc" },
          take: 40,
          select: { id: true, to: true, subject: true, acceptedAt: true, bouncedAt: true, bounceReason: true },
        }),
        prisma.lead.findMany({
          where: { clientId: client.id },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: { id: true, name: true, createdAt: true },
        }),
      ])
    : [[], []];

  const items: Item[] = [];
  for (const s of sends) {
    items.push(
      s.bouncedAt
        ? {
            at: s.bouncedAt,
            title: `A letter to ${s.to} did not get through.`,
            detail: presentText(s.bounceReason) || undefined,
            tone: "bad",
          }
        : {
            at: s.acceptedAt,
            title: `Wrote to ${s.to}, in your name.`,
            detail: presentText(s.subject),
            tone: "sent",
          },
    );
  }
  for (const l of leads) {
    items.push({
      at: l.createdAt,
      title: `Added ${presentText(l.name).split(/\s+[,.]\s+|,\s/)[0]} to your book.`,
      tone: "lead",
    });
  }
  if (agent?.lastRunAt) {
    items.push({ at: agent.lastRunAt, title: `${name} finished a run.`, tone: "run" });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  const dot = (t: Item["tone"]) =>
    t === "bad" ? "var(--red)" : t === "sent" ? "var(--brand-solid)" : t === "lead" ? "var(--emerald)" : "var(--text-4)";

  return (
    <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Activity" }]}>
      <PageHead title="Activity" sub={`Everything ${name} has done for you, newest first.`} />

      {items.length === 0 ? (
        <Empty title={`${name} has not done anything yet.`}>
          {agent?.status === "active" ? (
            <>
              His first run is {describeSchedule(agent.schedule).toLowerCase()}. Everything he does
              lands here, and he emails you the moment there is something worth reading.
            </>
          ) : (
            <>He is not running at the moment, so there is nothing to show yet.</>
          )}
        </Empty>
      ) : (
        <Panel>
          <ul className="list-none">
            {items.map((it, i) => (
              <li key={i} className="relative pl-5 pb-4 last:pb-0">
                {i < items.length - 1 && (
                  <span className="absolute left-1 top-[15px] bottom-0 w-px bg-[color:var(--border)]" aria-hidden="true" />
                )}
                <span
                  className="absolute left-0 top-[5px] w-[9px] h-[9px] rounded-full border-[1.5px]"
                  style={{ background: dot(it.tone), borderColor: dot(it.tone) }}
                  aria-hidden="true"
                />
                <p className="font-mono text-[11px] text-[color:var(--text-3)]">
                  {it.at.toLocaleString("en-GB", {
                    weekday: "short", day: "numeric", month: "short",
                    hour: "numeric", minute: "2-digit", hour12: true,
                  })}
                </p>
                <p className="text-[14px] text-[color:var(--text-2)] mt-0.5">
                  <b className="font-medium text-[color:var(--text)]">{it.title}</b>
                  {it.detail && <> {it.detail}</>}
                </p>
              </li>
            ))}
          </ul>
          {items.length >= 40 && (
            <p className="text-[12.5px] text-[color:var(--text-3)] mt-3 pt-3 border-t border-[color:var(--border)]">
              Showing the most recent {items.length}. Ask {name} for anything older and he will pull it.
            </p>
          )}
        </Panel>
      )}
    </V3Shell>
  );
}
