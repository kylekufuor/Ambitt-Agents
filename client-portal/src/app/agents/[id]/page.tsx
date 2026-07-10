import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTierConfig, type PricingTier } from "@/lib/pricing-constants";
import { PortalShell } from "@/components/portal-shell";
import { getSendStats } from "@/lib/agent-activity";
import { PauseToggle } from "./pause-toggle";
import { AgentSettings } from "./agent-settings";
import { CommunicationSettings } from "./communication-settings";
import { ReachAgent } from "./reach-agent";
import { ExampleEmails, type ExampleEmail } from "./example-emails";
import { DocumentUpload } from "./document-upload";
import { ChangeRequest } from "./change-request";

export const dynamic = "force-dynamic";

const STATUS_PRESENTATION: Record<
  string,
  { label: string; pill: string; dot: string }
> = {
  active: { label: "Active", pill: "pill-emerald", dot: "dot-emerald dot-pulse" },
  paused: { label: "Paused", pill: "pill-muted", dot: "dot-muted" },
  pending_approval: { label: "Building", pill: "pill-blue", dot: "dot-blue dot-pulse" },
  building: { label: "Building", pill: "pill-blue", dot: "dot-blue dot-pulse" },
  killed: { label: "Offboarded", pill: "pill-red", dot: "dot-red" },
};

function parseDocuments(memoryObject: string | null): Array<{ filename: string; uploadedAt: string }> {
  if (!memoryObject) return [];
  try {
    const parsed = JSON.parse(memoryObject);
    if (Array.isArray(parsed.documents)) return parsed.documents;
  } catch {
    /* encrypted or empty */
  }
  return [];
}

export default async function AgentDetailPage(
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
      email: true,
      exampleEmails: true,
      clientDescription: true,
      status: true,
      schedule: true,
      tone: true,
      emailFrequency: true,
      digestHour: true,
      digestDayOfWeek: true,
      autonomyLevel: true,
      maxEmailsPerDay: true,
      followUpDays: true,
      timezone: true,
      pricingTier: true,
      lastRunAt: true,
      totalTasksCompleted: true,
      clientMemoryObject: true,
      client: { select: { email: true, businessName: true } },
    },
  });

  if (!agent) notFound();
  if (agent.client.email !== user.email) notFound(); // cross-client access → 404

  const tier = getTierConfig(agent.pricingTier as PricingTier);
  const status = STATUS_PRESENTATION[agent.status] ?? STATUS_PRESENTATION.paused;
  const docs = parseDocuments(agent.clientMemoryObject);
  const sendStats = await getSendStats(agent.id, agent.client.email, { take: 0 });

  // NEVER expose the raw system prompt — friendly description only.
  const description =
    agent.clientDescription ?? "Works on your behalf and keeps you in the loop.";

  // Cached example emails (server-rendered instantly). Null → the client
  // component lazy-generates them on first load. Array shape validated by Oracle.
  const initialExamples = Array.isArray(agent.exampleEmails)
    ? (agent.exampleEmails as unknown as ExampleEmail[])
    : null;

  return (
    <PortalShell
      user={{ email: user.email, name: agent.client.businessName }}
    >
      <div className="max-w-[920px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-[color:var(--text-3)] hover:text-[color:var(--text)] transition mb-6"
        >
          ← Back to overview
        </Link>

        {/* Header */}
        <header className="flex items-start justify-between gap-4 mb-3 reveal" style={{ ["--i" as never]: 0 }}>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-[34px] leading-none text-[color:var(--text)]">
                {agent.name}
              </h1>
              <span className={`pill ${status.pill} shrink-0`}>
                <span className={`dot ${status.dot}`} />
                {status.label}
              </span>
            </div>
            <p className="text-[15px] text-[color:var(--text-3)] mt-2.5 max-w-[600px]">
              {description}
            </p>
            <p className="text-[12.5px] text-[color:var(--text-4)] mt-2">
              {tier.label} plan
              {agent.totalTasksCompleted > 0 && ` · ${agent.totalTasksCompleted.toLocaleString()} tasks done`}
              {agent.lastRunAt
                ? ` · last worked ${new Date(agent.lastRunAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                : " · hasn't started yet"}
            </p>
          </div>
          <div className="shrink-0">
            <PauseToggle agentId={agent.id} status={agent.status} />
          </div>
        </header>

        {/* Reach the agent — its inbox address */}
        <section className="mt-8 reveal" style={{ ["--i" as never]: 1 }}>
          <ReachAgent agentName={agent.name} agentEmail={agent.email} />
        </section>

        {/* Things you can ask the agent — example emails (self-hides if none) */}
        <ExampleEmails
          agentId={agent.id}
          agentName={agent.name}
          agentEmail={agent.email}
          initial={initialExamples}
        />

        {/* Settings */}
        <section className="mt-10 reveal" style={{ ["--i" as never]: 3 }}>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-[22px] text-[color:var(--text)]">Settings</h2>
            <Link
              href={`/agents/${agent.id}/activity`}
              className="text-[12.5px] text-[color:var(--brand-hover)] hover:underline"
            >
              View activity →
            </Link>
          </div>
          <AgentSettings
            agentId={agent.id}
            agentName={agent.name}
            agentTimezone={agent.timezone}
            status={agent.status}
            sentToday={sendStats.today}
            initial={{
              schedule: agent.schedule,
              autonomyLevel: agent.autonomyLevel,
              tone: agent.tone,
              emailFrequency: agent.emailFrequency,
              digestHour: agent.digestHour,
              digestDayOfWeek: agent.digestDayOfWeek,
              maxEmailsPerDay: agent.maxEmailsPerDay,
              followUpDays: agent.followUpDays,
            }}
          />
        </section>

        {/* Communication — channels & outbound content policy */}
        <section id="communication" className="mt-10 reveal scroll-mt-20" style={{ ["--i" as never]: 4 }}>
          <h2 className="font-display text-[22px] text-[color:var(--text)] mb-1">Communication</h2>
          <p className="text-[13px] text-[color:var(--text-3)] mb-4 max-w-[560px]">
            Who can reach {agent.name}, how it reaches you for codes, and which inbox it
            sends from — plus the signature and footer on every email.
          </p>
          <CommunicationSettings agentId={agent.id} agentName={agent.name} />
        </section>

        {/* Documents */}
        <section className="mt-10 reveal" style={{ ["--i" as never]: 5 }}>
          <h2 className="font-display text-[22px] text-[color:var(--text)] mb-1">
            Knowledge
          </h2>
          <p className="text-[13px] text-[color:var(--text-3)] mb-4 max-w-[560px]">
            Give {agent.name}{" "}context to work from — SOPs, brand guides, price
            sheets, target criteria. Anything you&apos;d hand a new hire.
          </p>
          <div className="card p-5 md:p-6">
            <DocumentUpload agentId={agent.id} agentName={agent.name} initialDocs={docs} />
          </div>
        </section>

        {/* Scope-change boundary */}
        <section className="mt-10 reveal" style={{ ["--i" as never]: 6 }}>
          <ChangeRequest agentId={agent.id} agentName={agent.name} />
        </section>

        {/* Support footnote */}
        <p className="text-center text-[12.5px] text-[color:var(--text-3)] mt-14">
          Questions about {agent.name}? Reply to any of its emails or write to{" "}
          <a
            href="mailto:support@ambitt.agency"
            className="text-[color:var(--text-2)] hover:text-[color:var(--brand-hover)] transition-colors"
          >
            support@ambitt.agency
          </a>
          .
        </p>
      </div>
    </PortalShell>
  );
}
