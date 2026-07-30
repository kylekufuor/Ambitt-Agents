import prisma from "@/lib/db";
import { V3Shell } from "@/components/v3-shell";
import { PageHead, Panel, Eyebrow, Empty } from "@/components/v3-ui";
import { requirePortalContext, describeSchedule } from "@/lib/portal-context";
import { presentText } from "@/lib/lead-presentation";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /approvals — everything the agent stopped for.

   The decision verbs are mailto links, not buttons that POST. That is
   deliberate and not a shortcut: an approval is a message to the agent, it
   already has a reply-to address per agent, and routing it through email means
   the client can add "yes but change the second line" in the same breath.
   A button can only say yes.
   --------------------------------------------------------------------------- */

export default async function ApprovalsPage() {
  const { email, client, agent } = await requirePortalContext();

  const pending = agent
    ? await prisma.recommendation.findMany({
        where: { agentId: agent.id, status: "pending" },
        orderBy: { sentAt: "desc" },
        select: {
          id: true, title: true, description: true, reasoning: true,
          actionItems: true, approveActionId: true, sentAt: true,
        },
      })
    : [];

  const decided = agent
    ? await prisma.recommendation.findMany({
        where: { agentId: agent.id, status: { not: "pending" } },
        orderBy: { resolvedAt: "desc" },
        take: 5,
        select: { id: true, title: true, status: true, resolvedAt: true },
      })
    : [];

  const name = agent?.name ?? "Your agent";

  return (
    <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Approvals" }]}>
      <PageHead
        title="Approvals"
        sub={`Everything ${name} has stopped for, and everything you have already decided.`}
      />

      {pending.length === 0 ? (
        <Empty title="Nothing is waiting on you.">
          {agent?.status === "active" ? (
            <>
              {name} runs {describeSchedule(agent.schedule).toLowerCase()} and emails you the moment
              something needs a decision. If it needs you before then, it shows up here and in your
              inbox at the same time.
            </>
          ) : (
            <>
              {name} is not running at the moment, so nothing new will arrive here until he is.
              Anything he had already decided is below.
            </>
          )}
        </Empty>
      ) : (
        <div className="space-y-3.5">
          {pending.map((r) => (
            <Panel key={r.id}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <Eyebrow>
                    {r.sentAt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                  </Eyebrow>
                  <h2 className="text-[16px] font-medium mt-1">{presentText(r.title)}</h2>
                </div>
                <span className="pill pill-amber shrink-0">Needs you</span>
              </div>

              <p className="text-[14px] text-[color:var(--text-2)] mt-2.5 leading-relaxed max-w-[70ch]">
                {presentText(r.description)}
              </p>

              {r.reasoning && (
                <div className="mt-3 rounded-[6px] p-3" style={{ background: "var(--bg)", boxShadow: "var(--well)" }}>
                  <Eyebrow>Why he thinks so</Eyebrow>
                  <p className="text-[13px] text-[color:var(--text-2)] mt-1 leading-relaxed">
                    {presentText(r.reasoning)}
                  </p>
                </div>
              )}

              {r.actionItems.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {r.actionItems.map((a, i) => (
                    <li key={i} className="text-[13px] text-[color:var(--text-2)] flex gap-2">
                      <span className="text-[color:var(--text-4)]">·</span>
                      {presentText(a)}
                    </li>
                  ))}
                </ul>
              )}

              {/* A decision is a message to the agent, so it goes by email and
                  the client can qualify it in the same breath. */}
              <div className="flex gap-2.5 items-center mt-4 flex-wrap">
                <a
                  className="btn btn-primary btn-sm no-underline"
                  href={`mailto:${agent?.email ?? ""}?subject=${encodeURIComponent(`Yes: ${r.title}`)}&body=${encodeURIComponent("Go ahead.\n\n")}`}
                >
                  Tell him yes
                </a>
                <a
                  className="btn btn-secondary btn-sm no-underline"
                  href={`mailto:${agent?.email ?? ""}?subject=${encodeURIComponent(`About: ${r.title}`)}&body=${encodeURIComponent("Change this before you go ahead:\n\n")}`}
                >
                  Change something first
                </a>
                <a
                  className="btn btn-ghost btn-sm no-underline"
                  href={`mailto:${agent?.email ?? ""}?subject=${encodeURIComponent(`No: ${r.title}`)}&body=${encodeURIComponent("Leave this one.\n\n")}`}
                >
                  Not this one
                </a>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div className="mt-6">
          <Eyebrow>Already decided</Eyebrow>
          <Panel className="mt-2">
            {decided.map((d) => (
              <div
                key={d.id}
                className="flex justify-between items-baseline gap-4 py-2 border-b border-[color:var(--border)] last:border-b-0"
              >
                <span className="text-[14px] text-[color:var(--text-2)] min-w-0">{presentText(d.title)}</span>
                <span className="text-[12.5px] text-[color:var(--text-3)] shrink-0 font-mono">
                  {d.status}
                  {d.resolvedAt ? ` · ${d.resolvedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                </span>
              </div>
            ))}
          </Panel>
        </div>
      )}
    </V3Shell>
  );
}
