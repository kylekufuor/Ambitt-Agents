import { notFound } from "next/navigation";
import { V3Shell } from "@/components/v3-shell";
import { PageHead, Panel, Eyebrow, Row, AskNote } from "@/components/v3-ui";
import { requirePortalContext, describeSchedule, describeAgentStatus } from "@/lib/portal-context";
import { presentText } from "@/lib/lead-presentation";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /agent/how — the operating limits, in the client's words.

   Read-only on purpose. Every one of these values is also injected into the
   agent's system prompt, so a form here would be a second place the truth
   lives, and the two would drift the first time somebody changed one of them
   in a hurry. Changing it by replying is not a workaround: the agent confirms
   the change back, which is the receipt a silent form never gives you.

   The client-facing text NEVER shows personality/purpose. That is the internal
   system prompt. clientDescription is the one sentence written for them.
   --------------------------------------------------------------------------- */

const TONE: Record<string, string> = {
  formal: "Formal. Full sentences, no contractions, nothing chatty.",
  conversational: "Conversational. How you would write to somebody you have met.",
  brief: "Brief. Short lines, no preamble.",
};

const AUTONOMY: Record<string, { label: string; line: string }> = {
  supervised: {
    label: "Supervised",
    line: "He researches, drafts and follows up on his own, and stops before anything leaves in your name.",
  },
  autonomous: {
    label: "Autonomous",
    line: "He sends without asking first, and tells you afterwards. He still stops for anything unusual.",
  },
};

export default async function HowHeWorksPage() {
  const { email, client, agent } = await requirePortalContext();
  if (!agent) notFound();

  const status = describeAgentStatus(agent);
  const autonomy = AUTONOMY[agent.autonomyLevel] ?? {
    label: agent.autonomyLevel,
    line: "",
  };

  const followUps =
    agent.followUpDays.length === 0
      ? "He uses his judgement."
      : agent.followUpDays.length === 1
        ? `Once, ${agent.followUpDays[0]} days after the first letter.`
        : `After ${agent.followUpDays.slice(0, -1).join(", ")} and ${agent.followUpDays[agent.followUpDays.length - 1]} days.`;

  return (
    <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "How he works" }]}>
      <PageHead
        title={`How ${agent.name} works`}
        sub={agent.clientDescription ? presentText(agent.clientDescription) : undefined}
      />

      <div className="grid gap-3.5 lg:grid-cols-2 items-start">
        <Panel>
          <Eyebrow>Right now</Eyebrow>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="w-[7px] h-[7px] rounded-full shrink-0"
              style={{ background: status.dot, boxShadow: `0 0 0 3px color-mix(in srgb, ${status.dot} 12%, transparent)` }}
            />
            <p className="text-[16px] font-medium">{status.label}</p>
          </div>
          <p className="text-[13px] text-[color:var(--text-2)] mt-1.5 leading-relaxed">{status.line}</p>
          {agent.status === "paused" && agent.pausedBy !== "client" && agent.pausedReason && (
            <p className="text-[12.5px] text-[color:var(--text-3)] mt-2 leading-relaxed">
              {presentText(agent.pausedReason)}
            </p>
          )}
          <div className="mt-3.5">
            <Row label="Runs" value={describeSchedule(agent.schedule)} />
            <Row label="Time zone" value={agent.timezone.replace(/_/g, " ")} />
            <Row
              label="Last run"
              value={
                agent.lastRunAt
                  ? agent.lastRunAt.toLocaleString("en-GB", {
                      weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
                    })
                  : "Not yet"
              }
            />
          </div>
        </Panel>

        <Panel>
          <Eyebrow>What he will and will not do</Eyebrow>
          <p className="text-[16px] font-medium mt-2">{autonomy.label}</p>
          <p className="text-[13px] text-[color:var(--text-2)] mt-1.5 leading-relaxed">{autonomy.line}</p>
          <div className="mt-3.5">
            <Row
              label="Letters a day, at most"
              value={agent.maxEmailsPerDay ?? "No limit set"}
            />
            <Row label="Follows up" value={followUps} wide={agent.followUpDays.length > 1} />
            <Row label="How he writes" value={TONE[agent.tone] ?? agent.tone} wide />
          </div>
          <AskNote agentName={agent.name} />
        </Panel>
      </div>

      <Panel className="mt-3.5">
        <Eyebrow>Where his work goes</Eyebrow>
        <div className="mt-2.5">
          <Row
            label="He emails you"
            value={
              agent.emailFrequency === "immediate"
                ? "As things happen"
                : agent.emailFrequency === "daily_digest"
                  ? "Once a day, rolled up"
                  : "Once a week, rolled up"
            }
          />
          <Row label="You reply to" value={<span className="font-mono text-[12.5px]">{agent.email}</span>} />
        </div>
        <p className="text-[12.5px] text-[color:var(--text-3)] mt-3 leading-relaxed">
          Anything he finds also lands in your leads, whether he emails about it or not.
        </p>
      </Panel>
    </V3Shell>
  );
}
