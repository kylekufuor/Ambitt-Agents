import { notFound } from "next/navigation";
import { V3Shell } from "@/components/v3-shell";
import { PageHead, Row, AskNote } from "@/components/v3-ui";
import { requirePortalContext } from "@/lib/portal-context";
import prisma from "@/lib/db";
import { VerificationPhoneCard } from "@/components/verification-phone-card";
import { CollapsibleSection } from "@/components/v3-collapsible";
import { getClientTodos, hasTodo } from "@/lib/client-todos";
import { prettyPhone } from "@/lib/phone";
import { oracleUrl } from "@/lib/agent-auth";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /agent/email — who can reach the agent, what he signs off as, who gets a copy.

   Reads Agent.communicationSettings, which is free-form JSON with a Zod parser
   living in shared/. The portal cannot import shared/, so this reads
   defensively and shows today's real behaviour when a role is unset, rather
   than printing "null" or pretending a setting exists.

   Every block is a collapsible section with its own icon. Settled sections
   start shut and show a one-line summary; the section that needs the client
   starts open, carries a red rail, and cannot be folded away and forgotten.
   Before this, the empty mobile-number field looked exactly like the three
   settled blocks around it, which is most of why it sat unset for days.
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

  const [acct, todos] = await Promise.all([
    prisma.client.findUnique({
      where: { id: client.id },
      select: {
        verificationPhone: true,
        verificationPhoneConfirmedAt: true,
        verificationPhoneRoundTripMs: true,
      },
    }),
    getClientTodos(email),
  ]);

  // Asked of the shared to-do source rather than checked here, so this section
  // and the notification bell can never disagree about whether the number is
  // missing. One of them being wrong is worse than neither existing.
  const phoneNeeded = hasTodo(todos, "verification-phone");

  // Named on the page so the client can save it BEFORE the first text. An
  // unknown sender asking for a login code is what a phishing text looks like,
  // and iOS prints "may be spam · Report Spam" underneath it. A saved contact
  // removes that banner entirely, which matters more here than anywhere else
  // in the product.
  let smsFrom: string | null = null;
  try {
    const r = await fetch(`${oracleUrl()}/public/sms-number`, { cache: "no-store" });
    if (r.ok) smsFrom = (await r.json()).number ?? null;
  } catch {
    // Non-fatal: the card just omits the "save this number" line.
  }

  const s = parse(agent.communicationSettings);
  const extra = s.inbound?.allowedSenders ?? [];
  const bcc = s.outbound?.bcc ?? [];
  const sendsAs = s.outbound?.identity ?? `${client.businessName}, from your own address`;

  return (
    <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Email setup" }]}>
      <PageHead
        title="Email setup"
        sub={`Who can reach ${agent.name}, what he signs off as, and who gets a copy. He never changes any of this on his own.`}
      />

      <div className="grid gap-3">
        <CollapsibleSection title="His address" icon="mail" summary={agent.email}>
          <p className="font-mono text-[14px]">{agent.email}</p>
          <p className="text-[13px] text-[color:var(--text-2)] mt-2 leading-relaxed">
            Write to him here about anything. Put DOCS in the subject to send him a file to work
            from.
          </p>
        </CollapsibleSection>

        <CollapsibleSection
          title="Who he answers"
          icon="inbox"
          summary={
            extra.length === 0
              ? "Only you"
              : `You and ${extra.length} ${extra.length === 1 ? "other" : "others"}`
          }
        >
          <div>
            <Row label="You" value={<span className="font-mono text-[12.5px]">{client.email}</span>} />
            {extra.length > 0 ? (
              extra.map((a) => (
                <Row
                  key={a}
                  label="Also allowed"
                  value={<span className="font-mono text-[12.5px]">{a}</span>}
                />
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
        </CollapsibleSection>

        {/* The one section that can demand attention. needsYou both forces it
            open and paints the rail, so the client cannot arrive at this page
            and miss it. */}
        <CollapsibleSection
          title="Where login codes go"
          icon="shield"
          needsYou={phoneNeeded}
          summary={
            acct?.verificationPhone
              ? acct.verificationPhoneConfirmedAt
                ? `${prettyPhone(acct.verificationPhone)} \u00b7 confirmed working`
                : `${prettyPhone(acct.verificationPhone)} \u00b7 not tested yet`
              : "Not set yet"
          }
        >
          <VerificationPhoneCard
            agentName={agent.name}
            initial={acct?.verificationPhone ?? null}
            confirmedAt={acct?.verificationPhoneConfirmedAt?.toISOString() ?? null}
            confirmedRoundTripMs={acct?.verificationPhoneRoundTripMs ?? null}
            smsFrom={smsFrom}
            chromeless
          />
        </CollapsibleSection>

        <CollapsibleSection title="What goes out in your name" icon="signature" summary={sendsAs}>
          <div>
            <Row label="Sends as" value={sendsAs} wide />
            <Row
              label="Sign off"
              value={
                s.outbound?.signature ??
                `Your name. Nothing says a machine wrote it, because it is your letter.`
              }
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
        </CollapsibleSection>
      </div>
    </V3Shell>
  );
}
