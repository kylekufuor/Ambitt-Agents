import Link from "next/link";
import prisma from "@/lib/db";
import { RailNav, MobileRail, type RailProps } from "./v3-rail";
import { TIERS, type PricingTier } from "@/lib/pricing-constants";

/* ---------------------------------------------------------------------------
   V3 shell. A 232px rail and a content plane, on three depth planes: the rail
   is recessed, the page sits in front of it, and cards/panels lift off the
   page. See the DEPTH block in globals.css.

   One query feeds the whole rail, because the counts (leads, approvals) and
   the agent's live status are chrome on every page and must not be re-fetched
   per screen.
   --------------------------------------------------------------------------- */

export interface Crumb {
  label: string;
  href?: string;
}

async function loadRail(email: string): Promise<RailProps | null> {
  const client = await prisma.client.findUnique({
    where: { email },
    select: {
      businessName: true,
      agents: {
        where: { status: { not: "killed" } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, name: true, status: true, nextScheduledRun: true,
          pausedBy: true, customTools: true, pricingTier: true,
        },
      },
    },
  });
  if (!client) return null;

  // One agent is the common case and the only one v3 draws today. When a
  // client has more, the first live one owns the rail's agent group; the
  // multi-agent roster is not built yet and pretending otherwise in the nav
  // would be worse than showing one.
  const agent = client.agents[0] ?? null;

  const [leads, approvals, credentials] = await Promise.all([
    prisma.lead.count({ where: { client: { email } } }),
    agent
      ? prisma.recommendation.count({ where: { agentId: agent.id, status: "pending" } })
      : Promise.resolve(0),
    prisma.credential.count({ where: { client: { email }, secretsEncrypted: { not: null } } }),
  ]);

  // "Needs setup" means the agent has browser tools configured that have no
  // stored credentials behind them.
  const customTools = Array.isArray(agent?.customTools) ? (agent!.customTools as unknown[]) : [];
  const toolsNeedSetup = customTools.length > credentials;

  const tier = (agent?.pricingTier ?? "growth") as PricingTier;
  const planLabel = TIERS[tier] ? `${TIERS[tier].label} plan` : "Your plan";

  return {
    businessName: client.businessName,
    planLabel,
    agent: agent
      ? {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          nextScheduledRun: agent.nextScheduledRun?.toISOString() ?? null,
          pausedBy: agent.pausedBy ?? null,
        }
      : null,
    counts: { leads, approvals },
    toolsNeedSetup,
  };
}

export async function V3Shell({
  user,
  crumbs,
  children,
}: {
  user: { email: string; name?: string | null };
  /** Last crumb is the current page and is not a link. */
  crumbs: Crumb[];
  children: React.ReactNode;
}) {
  const rail = await loadRail(user.email);
  if (!rail) return <>{children}</>;

  const initials =
    (user.name ?? user.email).split(/[\s@.]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="min-h-screen grid lg:grid-cols-[232px_1fr] bg-[color:var(--bg)]">
      <aside className="v3-rail hidden lg:flex flex-col py-2.5">
        <RailNav {...rail} />
      </aside>

      <div className="v3-main min-w-0 flex flex-col">
        <header className="v3-top h-[52px] flex items-center gap-3 px-4 lg:px-5 shrink-0">
          <div className="lg:hidden"><MobileRail {...rail} /></div>
          <nav className="text-[14px] text-[color:var(--text-3)] min-w-0 truncate" aria-label="Breadcrumb">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <span key={`${c.label}-${i}`}>
                  {i > 0 && <span className="px-1.5 text-[color:var(--text-4)]">/</span>}
                  {last || !c.href ? (
                    <span className="text-[color:var(--text)] font-medium" aria-current="page">{c.label}</span>
                  ) : (
                    <Link href={c.href} className="hover:text-[color:var(--text)] transition-colors">{c.label}</Link>
                  )}
                </span>
              );
            })}
          </nav>
          <span className="flex-1" />
          <Link
            href="/settings"
            className="w-[26px] h-[26px] rounded-full bg-[color:var(--brand-solid)] text-white text-[10.5px] font-semibold grid place-items-center shrink-0"
            aria-label="Your account"
          >
            {initials}
          </Link>
        </header>

        <main className="flex-1 min-w-0 px-4 lg:px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
