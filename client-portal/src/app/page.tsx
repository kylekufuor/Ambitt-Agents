import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ManageBillingButton } from "./billing-button";
import {
  getTierConfig,
  currentBillingCycleMonth,
  type PricingTier,
} from "@/lib/pricing-constants";

export const dynamic = "force-dynamic";

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-500",
    paused: "bg-zinc-400",
    pending_approval: "bg-amber-500",
    killed: "bg-red-500",
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] ?? "bg-zinc-300"}`} />;
}

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export default async function PortalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
          status: true,
          schedule: true,
          pricingTier: true,
          monthlyRetainerCents: true,
          interactionCount: true,
          interactionLimit: true,
          overageCount: true,
          interactionResetAt: true,
          lastRunAt: true,
          totalTasksCompleted: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">No account found</h1>
          <p className="text-base text-zinc-500 mt-2">
            Contact support@ambitt.agency if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  const activeAgents = client.agents.filter((a) => a.status === "active" || a.status === "paused");

  // MRR = sum of active agents' retainers (paused agents are not billed; pending_approval/killed excluded)
  const mrrCents = client.agents
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + a.monthlyRetainerCents, 0);

  // Cycle interactions roll-up across all non-killed agents
  const usedThisCycle = activeAgents.reduce((sum, a) => sum + a.interactionCount, 0);
  const limitThisCycle = activeAgents.reduce(
    (sum, a) => sum + (a.interactionLimit > 0 ? a.interactionLimit : 0),
    0
  );
  const overageThisCycle = activeAgents.reduce((sum, a) => sum + a.overageCount, 0);
  const cyclePct = limitThisCycle > 0 ? Math.min(100, Math.round((usedThisCycle / limitThisCycle) * 100)) : 0;
  const cycleOverLimit = limitThisCycle > 0 && usedThisCycle >= limitThisCycle;

  // Overage charges accrued this month (not yet invoiced)
  const cycleMonth = currentBillingCycleMonth();
  const overageEvents = await prisma.overageEvent.findMany({
    where: { clientId: client.id, billingCycleMonth: cycleMonth },
    select: { unitCostCents: true },
  });
  const overageCostCents = overageEvents.reduce((sum, e) => sum + e.unitCostCents, 0);

  // Next reset — earliest interactionResetAt across active agents (usually identical)
  const nextReset = activeAgents
    .map((a) => a.interactionResetAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  // Tier label display — if all agents share a tier show that, else show "Mixed"
  const distinctTiers = Array.from(new Set(activeAgents.map((a) => a.pricingTier)));
  const tierLabel =
    distinctTiers.length === 1
      ? getTierConfig(distinctTiers[0] as PricingTier).label
      : distinctTiers.length > 1
        ? "Mixed"
        : "—";

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{client.businessName}</h1>
          <p className="text-sm text-zinc-500 mt-1">Ambitt Client Portal</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm text-zinc-500 hover:text-zinc-900 transition"
          >
            Sign out
          </button>
        </form>
      </div>

      {/* This-cycle summary */}
      <section className="mb-8">
        <h2 className="text-base font-medium text-zinc-900 mb-3">This month</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Interactions */}
          <div className="md:col-span-2 border border-zinc-200 rounded-lg px-4 py-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-zinc-500">Interactions across your agents</p>
              <p className="text-sm text-zinc-900 font-medium">
                {usedThisCycle.toLocaleString()} / {limitThisCycle > 0 ? limitThisCycle.toLocaleString() : "∞"}
              </p>
            </div>
            {limitThisCycle > 0 && (
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    cycleOverLimit ? "bg-amber-500" : cyclePct >= 90 ? "bg-amber-400" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.max(2, cyclePct)}%` }}
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-zinc-600">
              {overageThisCycle > 0 && (
                <span className="text-amber-700">
                  {overageThisCycle.toLocaleString()} over limit · {formatCents(overageCostCents)} accrued
                </span>
              )}
              {overageThisCycle === 0 && limitThisCycle > 0 && (
                <span>No overage yet this cycle.</span>
              )}
              {nextReset && (
                <span className="ml-auto text-zinc-500">
                  Resets {nextReset.toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* MRR */}
          <div className="border border-zinc-200 rounded-lg px-4 py-3 bg-white">
            <p className="text-sm text-zinc-500">Monthly retainer</p>
            <p className="text-2xl font-bold text-zinc-900 mt-1">{formatCents(mrrCents)}</p>
            <p className="text-sm text-zinc-500 mt-1">
              {tierLabel}
              {activeAgents.length > 0 && ` · ${activeAgents.length} agent${activeAgents.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      </section>

      {/* Active Agents */}
      <section className="mb-8">
        <h2 className="text-base font-medium text-zinc-900 mb-3">Your agents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {client.agents.map((agent) => {
            const tier = getTierConfig(agent.pricingTier as PricingTier);
            const limit = agent.interactionLimit;
            const used = agent.interactionCount;
            const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
            const overLimit = limit > 0 && used >= limit;
            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="group border border-zinc-200 rounded-lg px-4 py-3 bg-white hover:border-zinc-400 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-1.5"><StatusDot status={agent.status} /></div>
                    <div className="min-w-0">
                      <p className="text-base font-medium text-zinc-900 truncate">{agent.name}</p>
                      <p className="text-sm text-zinc-500 truncate">{agent.purpose}</p>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-400 capitalize whitespace-nowrap">
                    {agent.status.replace("_", " ")}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <span>Interactions</span>
                    <span>
                      {used.toLocaleString()} / {limit > 0 ? limit.toLocaleString() : "∞"}
                    </span>
                  </div>
                  {limit > 0 && (
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          overLimit ? "bg-amber-500" : pct >= 90 ? "bg-amber-400" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-3 text-xs text-zinc-500">
                  <span>{tier.label}</span>
                  <span>·</span>
                  <span>
                    Last run:{" "}
                    {agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleDateString() : "not yet"}
                  </span>
                </div>
              </Link>
            );
          })}
          {client.agents.length === 0 && (
            <div className="md:col-span-2 border border-zinc-200 rounded-lg px-4 py-6 text-center text-sm text-zinc-500">
              No agents assigned yet. Your agent is being set up.
            </div>
          )}
        </div>
      </section>

      {/* Billing */}
      <section className="mb-8">
        <h2 className="text-base font-medium text-zinc-900 mb-3">Billing</h2>
        <div className="border border-zinc-200 rounded-lg px-4 py-3 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-sm text-zinc-500">Status</p>
              <p className="text-base font-medium text-zinc-900 capitalize">{client.billingStatus}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Plan</p>
              <p className="text-base font-medium text-zinc-900">
                {tierLabel}
                {activeAgents.length > 0 && (
                  <span className="text-zinc-500 font-normal">
                    {" "}· {formatCents(mrrCents)}/mo
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Billing email</p>
              <p className="text-base font-medium text-zinc-900 truncate">{client.billingEmail}</p>
            </div>
          </div>

          {activeAgents.length > 1 && (
            <div className="border-t border-zinc-100 pt-3 mb-4">
              <p className="text-sm text-zinc-500 mb-2">Per-agent retainer</p>
              <ul className="space-y-1">
                {activeAgents.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-900">{a.name}</span>
                    <span className="text-zinc-600">
                      {getTierConfig(a.pricingTier as PricingTier).label} ·{" "}
                      {formatCents(a.monthlyRetainerCents)}/mo
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {overageCostCents > 0 && (
            <div className="border-t border-zinc-100 pt-3 mb-4">
              <p className="text-sm text-zinc-500">Overage this cycle</p>
              <p className="text-base font-medium text-amber-700 mt-0.5">
                {formatCents(overageCostCents)}
                <span className="text-sm text-zinc-500 font-normal">
                  {" "}· billed at month end
                </span>
              </p>
            </div>
          )}

          <ManageBillingButton />
        </div>
      </section>

      {/* Support */}
      <section>
        <div className="border border-zinc-200 rounded-lg px-4 py-3 text-center">
          <p className="text-sm text-zinc-500">
            Questions? Email{" "}
            <a
              href="mailto:support@ambitt.agency"
              className="text-zinc-900 font-medium hover:underline"
            >
              support@ambitt.agency
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
