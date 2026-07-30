import { V3Shell } from "@/components/v3-shell";
import { PageHead, Panel, Eyebrow, Row } from "@/components/v3-ui";
import { requirePortalContext } from "@/lib/portal-context";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /people — who can get into this portal.

   There is no team model in the schema. One login per client, keyed on
   Client.email, and that is the whole truth today. So this page does NOT draw
   an invite form, a seat list or a roles column: every one of those would be a
   control that silently does nothing, which is worse than an honest sentence
   and much worse to discover after you have trusted it.

   It shows who has access, who the agent will answer, and how to add somebody
   — which is a real request to us, not a button.
   --------------------------------------------------------------------------- */

export default async function PeoplePage() {
  const { email, client, agent } = await requirePortalContext();
  const name = agent?.name ?? "your agent";

  return (
    <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "People" }]}>
      <PageHead title="People" sub={`Who can get into this portal, and who ${name} will answer.`} />

      <div className="grid gap-3.5 lg:grid-cols-2 items-start">
        <Panel>
          <Eyebrow>Portal access</Eyebrow>
          <div className="flex items-center gap-3 mt-3">
            <span className="w-9 h-9 rounded-full bg-[color:var(--brand-solid)] text-white text-[12px] font-semibold grid place-items-center shrink-0">
              {(client.contactName ?? client.businessName).split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{client.contactName ?? client.businessName}</p>
              <p className="font-mono text-[12.5px] text-[color:var(--text-3)] truncate">{client.email}</p>
            </div>
            <span className="pill pill-emerald ml-auto shrink-0">You</span>
          </div>
          <p className="text-[13px] text-[color:var(--text-2)] mt-3.5 leading-relaxed">
            One login today, and it is yours. We have not built shared logins yet, so rather than
            show you an invite button that does nothing, here is the honest version: tell us who
            should have access and we will set them up.
          </p>
          <a className="btn btn-primary btn-sm mt-3 inline-flex no-underline" href="mailto:support@ambitt.agency?subject=Add%20someone%20to%20our%20portal">
            Ask us to add someone
          </a>
        </Panel>

        <Panel>
          <Eyebrow>Who {name} answers</Eyebrow>
          <div className="mt-2.5">
            <Row label="By email" value={<span className="font-mono text-[12.5px]">{client.email}</span>} />
            {client.whatsappNumber && (
              <Row label="By WhatsApp" value={<span className="font-mono text-[12.5px]">{client.whatsappNumber}</span>} />
            )}
            <Row label="Invoices go to" value={<span className="font-mono text-[12.5px]">{client.billingEmail}</span>} />
          </div>
          <p className="text-[13px] text-[color:var(--text-2)] mt-3.5 leading-relaxed">
            Mail from anybody {name} does not know is ignored rather than answered, so a stranger
            cannot give him instructions by writing to him. Adding a colleague there is a separate
            thing from portal access, and lives on Email setup.
          </p>
        </Panel>
      </div>
    </V3Shell>
  );
}
