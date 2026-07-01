import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { oracleUrl } from "@/lib/agent-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PortalShell } from "@/components/portal-shell";
import { ManageBillingButton } from "./billing-button";
import { getTierConfig, type PricingTier } from "@/lib/pricing-constants";

export const dynamic = "force-dynamic";

// Client-facing usage markup: the dollar figure we show clients is the real
// API/token cost times this. Display only — does not change billing.
const USAGE_MARKUP = 15;

/**
 * Portal home — the workforce view, built for NON-TECHNICAL clients.
 *
 * Design intent: warm-minimal, editorial. Fraunces display over a teal
 * eyebrow. Every word is plain English — no "interactions", no system
 * prompts, no jargon. A setup banner guides a new client to the one thing
 * they must do (connect tools), and a four-card nav hub means they always
 * know where to go: Tools, Configure, Leads, Chat.
 */
export default async function PortalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { email: user.email },
    include: {
      agents: {
        select: {
          id: true,
          name: true,
          agentType: true,
          purpose: true,
          clientDescription: true,
          status: true,
          schedule: true,
          pricingTier: true,
          monthlyRetainerCents: true,
          interactionCount: true,
          interactionLimit: true,
          overageCount: true,
          interactionResetAt: true,
          lastRunAt: true,
          runningSince: true,
          totalTasksCompleted: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!client) {
    return (
      <div className="page-wash flex items-center justify-center min-h-screen">
        <div className="max-w-md text-center px-6">
          <p className="eyebrow mb-3">Account not found</p>
          <h1 className="font-display text-[28px] leading-tight text-[color:var(--text)]">
            We can&apos;t find an account on this email
          </h1>
          <p className="text-[14px] text-[color:var(--text-3)] mt-3">
            If you believe this is a mistake, reach out to{" "}
            <a
              href="mailto:support@ambitt.agency"
              className="text-[color:var(--brand-hover)] hover:underline"
            >
              support@ambitt.agency
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  const activeAgents = client.agents.filter(
    (a) => a.status === "active" || a.status === "paused"
  );
  const primaryAgent = activeAgents[0] ?? null;

  // Setup state — does the primary agent still need tools connected? This
  // drives the guided banner. Best-effort: a failed Oracle call just hides
  // the banner rather than blocking the page.
  let toolsNeedingSetup = 0;
  let toolsConnected = 0;
  if (primaryAgent) {
    try {
      const res = await fetch(`${oracleUrl()}/agents/${primaryAgent.id}/tools`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          tools: Array<{ status: string }>;
        };
        toolsNeedingSetup = data.tools.filter((t) => t.status !== "connected").length;
        toolsConnected = data.tools.filter((t) => t.status === "connected").length;
      }
    } catch {
      /* hide banner on error */
    }
  }
  const needsSetup = toolsNeedingSetup > 0;

  // MRR = sum of active (running) agents' retainers; paused excluded.
  const mrrCents = client.agents
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + a.monthlyRetainerCents, 0);

  const usedThisCycle = activeAgents.reduce((s, a) => s + a.interactionCount, 0);

  // Usage in $$, over a rolling 30-day window. We take the real API/token cost
  // (the authoritative figure logged per run) and mark it up for the client.
  // DISPLAY ONLY — the retainer is what they actually pay; this just puts a
  // dollar value on the work the agent did. A rolling window keeps the number
  // live (a calendar month resets to $0 on the 1st, which reads as broken).
  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const usageAgg = await prisma.apiUsage.aggregate({
    where: {
      agentId: { in: client.agents.map((a) => a.id) },
      createdAt: { gte: windowStart },
    },
    _sum: { costInCents: true },
  });
  const usageCents = (usageAgg._sum.costInCents ?? 0) * USAGE_MARKUP;

  const distinctTiers = Array.from(new Set(activeAgents.map((a) => a.pricingTier)));
  const tierLabel =
    distinctTiers.length === 1
      ? getTierConfig(distinctTiers[0] as PricingTier).label
      : distinctTiers.length > 1
        ? "Mixed plans"
        : "—";

  const greetName =
    (client.preferredName?.split(" ")[0] ?? client.contactName?.split(" ")[0] ?? "").trim() ||
    client.businessName;

  const oneAgent = activeAgents.length === 1;
  const agentLabel = oneAgent ? activeAgents[0].name : "your team";

  // Only show the Stripe billing portal button when there's a real Stripe
  // customer. Manually-converted / $0 clients carry a "pending_stripe_…"
  // placeholder, and the Stripe portal call would silently fail.
  const hasRealBilling =
    !!client.stripeCustomerId && !client.stripeCustomerId.startsWith("pending_stripe_");

  return (
    <PortalShell
      user={{
        email: user.email,
        name: client.contactName ?? client.preferredName ?? client.businessName,
      }}
    >
      <div className="max-w-[1200px] mx-auto px-6 pt-10 pb-16">
        {/* Hero */}
        <header className="mb-8 reveal" style={{ ["--i" as never]: 0 }}>
          <p className="eyebrow mb-3">{client.businessName}</p>
          <h1 className="font-display text-[40px] md:text-[44px] leading-[1.05] text-[color:var(--text)]">
            Good to see you, {greetName}.
          </h1>
          <p className="text-[15px] text-[color:var(--text-3)] mt-3 max-w-[640px]">
            {activeAgents.length === 0
              ? "Your workforce is being set up. We'll email you the moment your first agent is live."
              : needsSetup
                ? `${agentLabel} is ready — there's just one quick step to get going.`
                : oneAgent
                  ? `${activeAgents[0].name} is on the clock. Here's how this month is going.`
                  : `Your ${activeAgents.length}-person team is on the clock.`}
          </p>
        </header>

        {/* Guided setup banner — only when something needs connecting */}
        {primaryAgent && needsSetup && (
          <section className="mb-10 reveal" style={{ ["--i" as never]: 1 }}>
            <div
              className="card p-6 md:p-7 relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand-tint) 0%, var(--surface) 60%)",
                borderColor: "color-mix(in srgb, var(--brand) 22%, var(--border))",
              }}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-5">
                <div className="shrink-0 w-12 h-12 rounded-[14px] grid place-items-center bg-[color:var(--surface)] border border-[color:var(--border)]">
                  <PlugIcon />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="eyebrow mb-1.5" style={{ color: "var(--brand-hover)" }}>
                    One step to go
                  </p>
                  <h2 className="font-display text-[22px] text-[color:var(--text)] leading-tight">
                    Connect {primaryAgent.name}&apos;s tools
                  </h2>
                  <p className="text-[14px] text-[color:var(--text-3)] mt-1.5 max-w-[520px]">
                    {primaryAgent.name} needs access to {toolsNeedingSetup === 1 ? "one tool" : `${toolsNeedingSetup} tools`} to
                    start working — like your email and your tracker. It takes about a
                    minute, and your passwords are never shared with us.
                  </p>
                </div>
                <Link
                  href={`/agents/${primaryAgent.id}/tools`}
                  className="btn-primary shrink-0 self-start md:self-center whitespace-nowrap"
                >
                  Connect tools →
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Navigation hub — the client always knows where to go */}
        {primaryAgent && (
          <section className="mb-12 reveal" style={{ ["--i" as never]: 2 }}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <NavCard
                href={`/agents/${primaryAgent.id}/tools`}
                icon={<PlugIcon small />}
                label="Tools"
                desc={
                  toolsConnected > 0
                    ? `${toolsConnected} connected`
                    : "Connect email & more"
                }
                flag={needsSetup ? "Action needed" : undefined}
              />
              <NavCard
                href={`/agents/${primaryAgent.id}/leads`}
                icon={<TableIcon />}
                label="Leads"
                desc="The work, tracked"
              />
              <NavCard
                href={`/agents/${primaryAgent.id}/activity`}
                icon={<ActivityIcon />}
                label="Activity"
                desc="See what's been sent"
              />
              <NavCard
                href={`/agents/${primaryAgent.id}`}
                icon={<SlidersIcon />}
                label="Configure"
                desc={`Set ${primaryAgent.name}'s pace`}
              />
              <NavCard
                icon={<ChatIcon />}
                label="Chat"
                desc={`Message ${primaryAgent.name}`}
                soon
              />
            </div>
          </section>
        )}

        {/* This-month summary */}
        <section className="mb-12 reveal" style={{ ["--i" as never]: 3 }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Usage this month ($) */}
            <div className="card lg:col-span-2 p-6 relative overflow-hidden">
              <div className="flex items-start justify-between gap-6 mb-2">
                <div>
                  <p className="eyebrow mb-2">Last 30 days</p>
                  <h2 className="font-display text-[22px] text-[color:var(--text)] leading-tight">
                    {oneAgent ? `${activeAgents[0].name}'s usage` : "Your team's usage"}
                  </h2>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-[28px] text-[color:var(--text)] leading-none">
                    {formatCents(usageCents)}
                  </div>
                  <div className="text-[12px] text-[color:var(--text-3)] mt-1">
                    {usedThisCycle > 0
                      ? `${usedThisCycle.toLocaleString()} task${usedThisCycle === 1 ? "" : "s"}`
                      : "getting started"}
                  </div>
                </div>
              </div>

              <p className="text-[12.5px] text-[color:var(--text-4)] mb-4">
                The value of the work {oneAgent ? activeAgents[0].name : "your team"} has done
                for you lately — outreach, leads sourced, research, and follow-ups.
              </p>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2 text-[13px] text-[color:var(--text-3)]">
                <span>Included in your plan — no extra charge.</span>
              </div>
            </div>

            {/* MRR */}
            <div className="card p-6">
              <p className="eyebrow mb-2">Monthly plan</p>
              <div className="font-display text-[32px] text-[color:var(--text)] leading-none mt-3">
                {formatCents(mrrCents)}
              </div>
              <p className="text-[13px] text-[color:var(--text-3)] mt-2">
                {tierLabel}
                {activeAgents.length > 0 &&
                  ` · ${activeAgents.length} agent${activeAgents.length === 1 ? "" : "s"}`}
              </p>
              <div className="mt-5 pt-4 border-t border-[color:var(--border)]">
                {hasRealBilling ? (
                  <ManageBillingButton />
                ) : (
                  <p className="text-[12.5px] text-[color:var(--text-3)] leading-relaxed">
                    Billed directly — no card on file. Questions about your plan? Reach us at{" "}
                    <a
                      href="mailto:support@ambitt.agency"
                      className="text-[color:var(--brand-hover)] hover:underline"
                    >
                      support@ambitt.agency
                    </a>
                    .
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Roster */}
        <section className="mb-12 reveal" style={{ ["--i" as never]: 4 }}>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-display text-[24px] text-[color:var(--text)]">
              {oneAgent ? "Your agent" : "Your team"}
            </h2>
            <span className="text-[12px] text-[color:var(--text-4)]">
              {client.agents.length} {client.agents.length === 1 ? "agent" : "agents"}
            </span>
          </div>

          {client.agents.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="font-display text-[20px] text-[color:var(--text)] mb-2">
                Your first agent is being assembled.
              </p>
              <p className="text-[14px] text-[color:var(--text-3)] max-w-md mx-auto">
                We&apos;ll email you with a build update shortly. If something doesn&apos;t
                feel right, hit us at{" "}
                <a
                  href="mailto:support@ambitt.agency"
                  className="text-[color:var(--brand-hover)] hover:underline"
                >
                  support@ambitt.agency
                </a>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {client.agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </section>

        {/* Support footnote */}
        <p className="text-center text-[12.5px] text-[color:var(--text-3)] mt-16">
          Anything off? Reply to any agent email or write to{" "}
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

/* -------------------------------------------------------------------------- */
/*  Nav hub card                                                              */
/* -------------------------------------------------------------------------- */

function NavCard({
  href,
  icon,
  label,
  desc,
  flag,
  soon,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
  flag?: string;
  soon?: boolean;
}) {
  const inner = (
    <div
      className={`card relative p-4 h-full flex flex-col gap-2.5 ${
        href ? "card-hover" : "opacity-65"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-[10px] grid place-items-center bg-[color:var(--surface-2)] text-[color:var(--text-2)]">
          {icon}
        </span>
        {flag && <span className="pill pill-amber">{flag}</span>}
        {soon && <span className="pill pill-muted">Soon</span>}
      </div>
      <div>
        <p className="text-[14.5px] font-medium text-[color:var(--text)] leading-tight truncate">
          {label}
        </p>
        <p className="text-[12.5px] text-[color:var(--text-3)] mt-0.5 truncate">{desc}</p>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/* -------------------------------------------------------------------------- */
/*  Agent card                                                               */
/* -------------------------------------------------------------------------- */

type AgentCardProps = {
  agent: {
    id: string;
    name: string;
    purpose: string;
    clientDescription: string | null;
    status: string;
    schedule: string;
    pricingTier: string;
    interactionCount: number;
    interactionLimit: number;
    lastRunAt: Date | null;
    runningSince: Date | null;
    totalTasksCompleted: number;
  };
};

function AgentCard({ agent }: AgentCardProps) {
  const tier = getTierConfig(agent.pricingTier as PricingTier);
  const limit = agent.interactionLimit;
  const used = agent.interactionCount;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const overLimit = limit > 0 && used >= limit;
  const nearLimit = limit > 0 && pct >= 90 && !overLimit;

  const status = STATUS_PRESENTATION[agent.status] ?? STATUS_PRESENTATION.default;

  // "Working now" only if a run started recently — a stale runningSince (from
  // an error path that skipped the clear) is treated as idle, so the badge
  // can never get stuck on "working".
  const isWorking =
    !!agent.runningSince && Date.now() - new Date(agent.runningSince).getTime() < 15 * 60 * 1000;

  // NEVER show the raw system prompt (agent.purpose). Friendly description
  // only, with a safe generic fallback.
  const description =
    agent.clientDescription ?? "Works on your behalf and keeps you in the loop.";

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="card card-hover relative overflow-hidden p-5 pl-6 flex flex-col"
    >
      <span className={`accent-stripe ${status.stripe}`} />

      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h3 className="font-display text-[19px] text-[color:var(--text)] truncate leading-tight">
            {agent.name}
          </h3>
          <p className="text-[13px] text-[color:var(--text-3)] mt-0.5 line-clamp-2">
            {description}
          </p>
        </div>
        <span className={`pill ${status.pill} shrink-0`}>
          <span className={`dot ${status.dot}`} />
          {status.label}
        </span>
      </div>

      {limit > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-[11.5px] text-[color:var(--text-3)] mb-1.5 uppercase tracking-[0.08em]">
            <span>Tasks this month</span>
            <span className="text-[color:var(--text-2)] font-medium normal-case tracking-normal">
              {used.toLocaleString()} / {limit.toLocaleString()}
            </span>
          </div>
          <div className="bar-track">
            <div
              className={`bar-fill ${overLimit ? "danger" : nearLimit ? "warn" : ""}`}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-[color:var(--border)] text-[12px] text-[color:var(--text-3)]">
        <span>{tier.label}</span>
        <span className="text-[color:var(--text-4)]">·</span>
        {isWorking ? (
          <span className="inline-flex items-center gap-1.5 text-[color:var(--brand-hover)] font-medium">
            <span className="dot dot-emerald dot-pulse" />
            Working now
          </span>
        ) : agent.status === "active" ? (
          <span>On standby · runs {friendlySchedule(agent.schedule)}</span>
        ) : (
          <span>
            {agent.lastRunAt
              ? `Last worked ${formatRelative(agent.lastRunAt)}`
              : "Hasn't started yet"}
          </span>
        )}
        {agent.totalTasksCompleted > 0 && (
          <>
            <span className="text-[color:var(--text-4)]">·</span>
            <span>{agent.totalTasksCompleted.toLocaleString()} done</span>
          </>
        )}
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Icons (inline, stroke — no icon dep)                                      */
/* -------------------------------------------------------------------------- */

function PlugIcon({ small }: { small?: boolean }) {
  const s = small ? 18 : 22;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={small ? undefined : { color: "var(--brand-hover)" }}>
      <path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v6" />
    </svg>
  );
}
function SlidersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5M14 4v4M6 10v4M11 16v4" />
    </svg>
  );
}
function ActivityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
function TableIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const STATUS_PRESENTATION: Record<
  string,
  { label: string; pill: string; dot: string; stripe: string }
> = {
  active: { label: "Active", pill: "pill-emerald", dot: "dot-emerald dot-pulse", stripe: "" },
  paused: { label: "Paused", pill: "pill-muted", dot: "dot-muted", stripe: "muted" },
  pending_approval: { label: "Building", pill: "pill-blue", dot: "dot-blue dot-pulse", stripe: "blue" },
  killed: { label: "Offboarded", pill: "pill-red", dot: "dot-red", stripe: "warn" },
  default: { label: "Unknown", pill: "pill-muted", dot: "dot-muted", stripe: "muted" },
};

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// Turn the agent's cron string into a plain-English cadence for the "on
// standby · runs X" line. Matches the presets offered on the Configure page.
function friendlySchedule(cron: string): string {
  const map: Record<string, string> = {
    "0 8 * * 1": "Mondays",
    "0 8 * * 1,4": "Mondays & Thursdays",
    "0 8 * * 1-5": "weekdays",
    "0 8 * * *": "daily",
    manual: "only when you ask",
  };
  return map[cron?.trim()] ?? "on schedule";
}

function formatRelative(d: Date): string {
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
