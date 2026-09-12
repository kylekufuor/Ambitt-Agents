import { missingCustomTools } from "@/lib/tool-setup";
import prisma from "@/lib/db";
import { getClientTodos } from "@/lib/client-todos";
import { WorkspaceFrame } from "./workspace-frame";
import type { RailProps } from "./v3-rail";
import { TIERS, type PricingTier } from "@/lib/pricing-constants";

/* ---------------------------------------------------------------------------
   Portal data loader. A 224px rail and a content plane, on three depth planes: the rail
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
          id: true, name: true, status: true, nextScheduledRun: true, timezone: true,
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
    prisma.credential.findMany({ where: { client: { email }, secretsEncrypted: { not: null } }, select: { toolName: true } }),
  ]);

  // "Needs setup" means the agent has browser tools configured that have no
  // stored credentials behind them.
  const toolsNeedSetup = missingCustomTools(agent?.customTools, credentials) > 0;

  const tier = (agent?.pricingTier ?? "growth") as PricingTier;
  const planLabel = agent ? (TIERS[tier] ? `${TIERS[tier].label} plan` : "Your plan") : "Getting started";

  return {
    businessName: client.businessName,
    planLabel,
    agent: agent
      ? {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          nextScheduledRun: agent.nextScheduledRun?.toISOString() ?? null,
          timezone: agent.timezone,
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
  // Loaded here rather than per-page: the bell is chrome on every screen, and
  // it reads the same source as the rail counts so the two cannot disagree.
  const [rail, todos] = await Promise.all([
    loadRail(user.email),
    getClientTodos(user.email),
  ]);
  if (!rail) return <>{children}</>;

  return <WorkspaceFrame user={user} crumbs={crumbs} rail={rail}
    notifications={{ items: todos.items, requiredCount: todos.requiredCount }}>{children}</WorkspaceFrame>;
}
