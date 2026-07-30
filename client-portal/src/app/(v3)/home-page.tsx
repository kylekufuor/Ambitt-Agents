import Link from "next/link";
import prisma from "@/lib/db";
import { V3Shell } from "@/components/v3-shell";
import { PageHead, Panel, Eyebrow, Empty } from "@/components/v3-ui";
import { requirePortalContext, describeAgentStatus, describeSchedule } from "@/lib/portal-context";
import { presentLeadName, presentTemperature, presentText } from "@/lib/lead-presentation";

/* ---------------------------------------------------------------------------
   Home. The answer to "what did my agent do", in a sentence, with the two or
   three things that actually need the client underneath it.

   Explicitly NOT a dashboard of tiles. v2's home was a five-tile nav grid over
   a stat wall, which is a second copy of the rail plus numbers nobody acts on.
   The rail is the navigation. This page is the news.
   --------------------------------------------------------------------------- */

export async function HomePage() {
  const { email, client, agent } = await requirePortalContext();

  if (!agent) {
    return (
      <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Home" }]}>
        <PageHead title={`Hello, ${client.preferredName ?? client.contactName ?? client.businessName}.`} />
        <Empty title="Your agent is being set up.">
          We are building them now. You will get an email from them the moment they are ready, with
          what they are going to do first.
        </Empty>
      </V3Shell>
    );
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [leadsTotal, leadsThisWeek, sentThisWeek, pendingApprovals, hotLeads] = await Promise.all([
    prisma.lead.count({ where: { clientId: client.id } }),
    prisma.lead.count({ where: { clientId: client.id, createdAt: { gte: since } } }),
    prisma.emailSend.count({ where: { agentId: agent.id, acceptedAt: { gte: since } } }),
    prisma.recommendation.count({ where: { agentId: agent.id, status: "pending" } }),
    prisma.lead.findMany({
      where: { clientId: client.id, temperature: "hot" },
      orderBy: { temperatureSetAt: "desc" },
      take: 3,
      select: {
        id: true, name: true, company: true, status: true,
        temperature: true, temperatureReason: true, temperatureSetBy: true,
      },
    }),
  ]);

  const status = describeAgentStatus(agent);
  const name = agent.name;

  // Only claim what actually happened this week. A sentence that says "sourced
  // 0 owners and sent 0 letters" is worse than saying he has not run.
  const did: string[] = [];
  if (leadsThisWeek > 0) did.push(`added ${leadsThisWeek} ${leadsThisWeek === 1 ? "owner" : "owners"} to your book`);
  if (sentThisWeek > 0) did.push(`wrote ${sentThisWeek} ${sentThisWeek === 1 ? "letter" : "letters"}`);

  return (
    <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Home" }]}>
      <PageHead
        title={`Hello, ${client.preferredName ?? client.contactName ?? client.businessName}.`}
        sub={agent.clientDescription ? presentText(agent.clientDescription) : undefined}
      />

      <Panel>
        <div className="flex items-start gap-3">
          <span
            className="w-[7px] h-[7px] rounded-full shrink-0 mt-[7px]"
            style={{ background: status.dot, boxShadow: `0 0 0 3px color-mix(in srgb, ${status.dot} 12%, transparent)` }}
          />
          <div className="min-w-0">
            <p className="text-[16px]">
              <b className="font-medium">
                {name} is {status.label.toLowerCase()}.
              </b>{" "}
              {did.length > 0 ? (
                <>
                  This week he {did.join(" and ")}.
                </>
              ) : (
                <>He has not logged anything new in the last seven days.</>
              )}
            </p>
            <p className="text-[13px] text-[color:var(--text-3)] mt-1.5">
              {status.line}
              {agent.status === "active" && ` Runs ${describeSchedule(agent.schedule).toLowerCase()}.`}
            </p>
          </div>
        </div>
      </Panel>

      {/* What needs the client. Ordered by how much it costs to ignore. */}
      <div className="grid gap-3.5 mt-3.5 lg:grid-cols-2 items-start">
        <Panel>
          <Eyebrow>Waiting on you</Eyebrow>
          {pendingApprovals > 0 ? (
            <>
              <p className="text-[16px] mt-2">
                <b className="font-medium">
                  {pendingApprovals} {pendingApprovals === 1 ? "thing needs" : "things need"} your decision.
                </b>
              </p>
              <p className="text-[13px] text-[color:var(--text-2)] mt-1.5 leading-relaxed">
                {name} has stopped and will not go ahead until you say so.
              </p>
              <Link href="/approvals" className="btn btn-primary btn-sm mt-3 inline-flex no-underline">
                Look at them
              </Link>
            </>
          ) : (
            <>
              <p className="text-[16px] mt-2 font-medium">Nothing is waiting on you.</p>
              <p className="text-[13px] text-[color:var(--text-2)] mt-1.5 leading-relaxed">
                {agent.status === "active"
                  ? `${name} will email you when something needs a decision. You do not have to check.`
                  : `${name} is not running, so nothing new will arrive until he is.`}
              </p>
            </>
          )}
        </Panel>

        <Panel>
          <Eyebrow>Your book</Eyebrow>
          <p className="text-[16px] mt-2">
            <b className="font-medium">
              {leadsTotal} {leadsTotal === 1 ? "owner" : "owners"}
            </b>{" "}
            {leadsTotal === 0 ? "so far." : "in your book."}
          </p>
          {hotLeads.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {hotLeads.map((l) => {
                const n = presentLeadName(l.name);
                const t = presentTemperature(l);
                return (
                  <li key={l.id} className="text-[13px] leading-snug">
                    <Link href={`/leads/${l.id}`} className="text-[color:var(--text)] no-underline hover:underline font-medium">
                      {n.title}
                    </Link>
                    {t.reason && <span className="text-[color:var(--text-3)]"> {t.reason}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] text-[color:var(--text-2)] mt-1.5 leading-relaxed">
              {leadsTotal === 0
                ? `${name} has not logged an owner yet.`
                : `None of them are hot right now. ${name} moves one up the moment somebody answers.`}
            </p>
          )}
          {leadsTotal > 0 && (
            <Link href="/leads" className="btn btn-secondary btn-sm mt-3 inline-flex no-underline">
              See all {leadsTotal}
            </Link>
          )}
        </Panel>
      </div>
    </V3Shell>
  );
}
