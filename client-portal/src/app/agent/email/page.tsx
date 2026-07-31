import { notFound } from "next/navigation";
import { V3Shell } from "@/components/v3-shell";
import { PageHead, Panel, Eyebrow, Row, AskNote } from "@/components/v3-ui";
import { requirePortalContext } from "@/lib/portal-context";
import prisma from "@/lib/db";
import { VerificationPhoneCard } from "@/components/verification-phone-card";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /agent/email — who can reach the agent, what he signs off as, who gets a copy.

   Reads Agent.communicationSettings, which is free-form JSON with a Zod parser
   living in shared/. The portal cannot import shared/, so this reads
   defensively and shows today's real behaviour when a role is unset, rather
   than printing "null" or pretending a setting exists.
   --------------------------------------------------------------------------- */

type Settings = {
  inbound?: { allowedSenders?: string[] } | null;
  mfaRelay?: { channel?: string } | null;
  outbound?: { identity?: string; signature?: string; footer?: string; bcc?: string[] } | null;
};

function parse(raw: unknown): Settings {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Settings) : {};
}

export default async function EmailSetupPage() {
  const { email, client, agent } = await requirePortalContext();
  if (!agent) notFound();

  const acct = await prisma.client.findUnique({
    where: { id: client.id },
    select: { verificationPhone: true },
  });

  const s = parse(agent.communicationSettings);
  const extra = s.inbound?.allowedSenders ?? [];
  const bcc = s.outbound?.bcc ?? [];

  return (
    <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Email setup" }]}>
      <PageHead
        title="Email setup"
        sub={`Who can reach ${agent.name}, what he signs off as, and who gets a copy. He never changes any of this on his own.`}
      />

      <div className="grid gap-3.5 lg:grid-cols-2 items-start">
        <Panel>
          <Eyebrow>His address</Eyebrow>
          <p className="font-mono text-[14px] mt-2">{agent.email}</p>
          <p className="text-[13px] text-[color:var(--text-2)] mt-2 leading-relaxed">
            Write to him here about anything. Put DOCS in the subject to send him a file to work from.
          </p>
        </Panel>

        <Panel>
          <Eyebrow>Who he answers</Eyebrow>
          <div className="mt-2.5">
            <Row label="You" value={<span className="font-mono text-[12.5px]">{client.email}</span>} />
            {extra.length > 0 ? (
              extra.map((a) => (
                <Row key={a} label="Also allowed" value={<span className="font-mono text-[12.5px]">{a}</span>} />
              ))
            ) : (
              <Row label="Anyone else" value="Nobody yet" />
            )}
          </div>
          {/* This is a real safety property, not a preference: mail from an
              address he does not know is dropped, not answered. */}
          <p className="text-[12.5px] text-[color:var(--text-3)] mt-3 leading-relaxed">
            Mail from anybody else is ignored rather than answered, so a stranger cannot give him
            instructions by writing to him.
          </p>
          <AskNote agentName={agent.name}>
            To let a colleague write to him, reply to one of his emails and say who.
          </AskNote>
        </Panel>
      </div>

      <div className="mt-3.5">
        <VerificationPhoneCard agentName={agent.name} initial={acct?.verificationPhone ?? null} />
      </div>

      <Panel className="mt-3.5">
        <Eyebrow>What goes out in your name</Eyebrow>
        <div className="mt-2.5">
          <Row label="Sends as" value={s.outbound?.identity ?? `${client.businessName}, from your own address`} wide />
          <Row
            label="Sign off"
            value={s.outbound?.signature ?? `Your name. Nothing says a machine wrote it, because it is your letter.`}
            wide
          />
          <Row label="Copies to" value={bcc.length > 0 ? bcc.join(", ") : "Nobody"} />
          <Row
            label="If a site texts a code"
            value={
              s.mfaRelay?.channel
                ? `He asks you on ${s.mfaRelay.channel} and waits.`
                : client.whatsappNumber
                  ? "He texts you for it and waits."
                  : "He emails you for it and waits."
            }
            wide
          />
        </div>
        <p className="text-[12.5px] text-[color:var(--text-3)] mt-3 leading-relaxed">
          He never asks you for a code you were not expecting.
        </p>
      </Panel>
    </V3Shell>
  );
}
