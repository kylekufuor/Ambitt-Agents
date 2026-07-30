import { V3Shell } from "@/components/v3-shell";
import { PageHead, Panel, Eyebrow, Row } from "@/components/v3-ui";
import { requirePortalContext } from "@/lib/portal-context";
import { presentText } from "@/lib/lead-presentation";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /settings — the account, not the agent.

   How the agent behaves lives on "How he works"; what he sends lives on "Email
   setup". This page is the boring, important stuff: who you are to us, where
   your data is, and how to leave.

   Same rule as People — nothing here is a control that does not work. Changing
   a business name is a support request today, so it says so.
   --------------------------------------------------------------------------- */

export default async function SettingsPage() {
  const { email, client, agent } = await requirePortalContext();

  return (
    <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Settings" }]}>
      <PageHead title="Settings" sub="Your account with us." />

      <div className="grid gap-3.5 lg:grid-cols-2 items-start">
        <Panel>
          <Eyebrow>Your business</Eyebrow>
          <div className="mt-2.5">
            <Row label="Name" value={presentText(client.businessName)} />
            <Row label="You" value={presentText(client.contactName ?? "") || "Not set"} />
            <Row
              label={`What ${agent?.name ?? "your agent"} calls you`}
              value={presentText(client.preferredName ?? client.contactName ?? "") || "Not set"}
            />
            <Row label="With us since" value={client.createdAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} />
          </div>
          <p className="text-[12.5px] text-[color:var(--text-3)] mt-3 leading-relaxed">
            Any of this wrong? Reply to {agent?.name ?? "your agent"} and he will pass it on, or
            write to support@ambitt.agency.
          </p>
        </Panel>

        <Panel>
          <Eyebrow>Your data</Eyebrow>
          <p className="text-[13px] text-[color:var(--text-2)] mt-2 leading-relaxed">
            Everything {agent?.name ?? "your agent"} finds is yours. You can take it with you at any
            time, and you do not have to ask us first.
          </p>
          <div className="flex gap-2.5 items-center mt-3 flex-wrap">
            {agent && (
              <a className="btn btn-secondary btn-sm no-underline" href={`/api/agents/${agent.id}/leads/export`}>
                Export your leads
              </a>
            )}
          </div>
          <p className="text-[12.5px] text-[color:var(--text-3)] mt-3 leading-relaxed">
            Sign in details are handled by our login provider, so we never see or store your
            password. Signing out is under your initials, top right.
          </p>
        </Panel>
      </div>

      <Panel className="mt-3.5">
        <Eyebrow>Stopping</Eyebrow>
        <p className="text-[13px] text-[color:var(--text-2)] mt-2 leading-relaxed max-w-[70ch]">
          You can stop {agent?.name ?? "your agent"} whenever you like, and nothing goes out in your
          name while he is stopped. Cancelling the plan is a message to us, not a hidden setting:
          tell us and we will do it and confirm, with no retention call.
        </p>
        <div className="flex gap-2.5 items-center mt-3 flex-wrap">
          <a
            className="btn btn-secondary btn-sm no-underline"
            href="mailto:support@ambitt.agency?subject=Cancelling%20our%20plan"
          >
            Write to us about cancelling
          </a>
        </div>
      </Panel>
    </V3Shell>
  );
}
