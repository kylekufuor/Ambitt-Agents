import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { V3Shell } from "@/components/v3-shell";
import { TIERS, type PricingTier } from "@/lib/pricing-constants";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /billing — Stripe's shape, because a plan, a usage meter, a card on file and
   a list of invoices is a solved problem and being different helps nobody.

   This is the ONE page where a dollar figure belongs. The no-money rule across
   the rest of the portal is about VALUE: never tell a client his agent
   generated $27 of something. What he pays us is legitimately money, and
   hiding it on the billing page would read as evasive.

   Card details and invoices deliberately live in Stripe's own portal rather
   than here. We never take a card number into our app, so "Update card" is a
   handoff to Stripe, not a form. That is both the safer design and less to
   build.
   --------------------------------------------------------------------------- */

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { email: user.email },
    select: {
      businessName: true, billingEmail: true, billingStatus: true,
      overageEnabled: true, overageRateCents: true,
      agents: {
        where: { status: { not: "killed" } },
        orderBy: { createdAt: "asc" },
        select: {
          name: true, status: true, pricingTier: true, monthlyRetainerCents: true,
          setupFeeCents: true, interactionCount: true, interactionLimit: true,
          interactionResetAt: true,
        },
      },
    },
  });
  if (!client) redirect("/login");

  // Every agent the client is contracted for, INCLUDING paused ones. Excluding
  // paused agents meant a client whose only agent was on an operator hold saw
  // a $0 plan, which is both wrong and alarming.
  const agents = client.agents;
  const monthlyCents = agents.reduce((s, a) => s + a.monthlyRetainerCents, 0);
  const primary = agents[0] ?? null;
  const tier = (primary?.pricingTier ?? "growth") as PricingTier;
  const tierCfg = TIERS[tier];

  const used = agents.reduce((s, a) => s + a.interactionCount, 0);
  const limit = agents.reduce((s, a) => (a.interactionLimit < 0 ? -1 : s < 0 ? s : s + a.interactionLimit), 0);
  const unlimited = limit < 0;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));

  const resetAt = primary?.interactionResetAt ?? null;
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  return (
    <V3Shell user={{ email: user.email, name: client.businessName }} crumbs={[{ label: "Billing" }]}>
      <div className="flex items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-medium tracking-[-0.01em]">Billing</h1>
          <p className="text-[14px] text-[color:var(--text-3)] mt-1">
            What you are on, what you have used, and every invoice.
          </p>
        </div>
      </div>

      <div className="grid gap-3.5 mt-5 lg:grid-cols-[1.4fr_1fr] items-start">
        <section className="v3-panel p-[17px]">
          <div className="flex justify-between items-start gap-4">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-3)]">
                Your plan
              </p>
              <h2 className="text-[20px] font-medium mt-1.5">{tierCfg?.label ?? "Custom"}</h2>
              <p className="text-[12.5px] text-[color:var(--text-3)] mt-1">
                {agents.length === 1 ? "One agent" : `${agents.length} agents`}
                {unlimited
                  ? ", unlimited conversations."
                  : `, ${limit.toLocaleString("en-US")} conversations a month.`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono text-[24px] font-medium leading-none tabular-nums">{usd(monthlyCents)}</p>
              <p className="text-[12.5px] text-[color:var(--text-3)] mt-1">a month</p>
            </div>
          </div>

          {agents.length > 1 && (
            <div className="mt-3.5 pt-3.5 border-t border-[color:var(--border)]">
              {agents.map((a) => (
                <div key={a.name} className="flex justify-between gap-3 py-1.5 text-[13px]">
                  <span className="text-[color:var(--text-2)]">
                    {a.name}
                    {a.status !== "active" && (
                      <span className="text-[color:var(--text-3)]"> ({a.status === "paused" ? "on hold" : a.status})</span>
                    )}
                  </span>
                  <span className="font-mono text-[color:var(--text)] tabular-nums">{usd(a.monthlyRetainerCents)}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[12.5px] text-[color:var(--text-3)] mt-3.5 leading-relaxed">
            {/* "Cancel any time before then" needs a "then". interactionResetAt
                is null on Casey's account today, so the dated sentence would
                have read as a dangling reference. */}
            {resetAt ? `Renews ${fmt(resetAt)}. ` : ""}
            {client.billingStatus === "active"
              ? resetAt
                ? "Cancel any time before then."
                : "Cancel any time."
              : `Billing status: ${client.billingStatus}.`}
            {agents.some((a) => a.status === "paused") &&
              " An agent on hold still counts toward your plan, because we hold their place."}
          </p>
        </section>

        <section className="v3-panel p-[17px]">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-3)]">
            This month
          </p>
          {unlimited ? (
            <>
              <p className="font-mono text-[24px] font-medium mt-2 tabular-nums">{used.toLocaleString("en-US")}</p>
              <p className="text-[12.5px] text-[color:var(--text-3)] mt-0.5">conversations, no cap on your plan</p>
            </>
          ) : (
            <>
              <p className="font-mono text-[24px] font-medium mt-2 tabular-nums">
                {used.toLocaleString("en-US")}
                <span className="text-[color:var(--text-3)]"> / {limit.toLocaleString("en-US")}</span>
              </p>
              <p className="text-[12.5px] text-[color:var(--text-3)] mt-0.5">conversations used</p>
              <div
                className="h-1.5 rounded-full mt-2.5 overflow-hidden bg-[color:var(--surface-2)]"
                role="img"
                aria-label={`${pct}% of your monthly conversations used`}
              >
                <span className="block h-full rounded-full bg-[color:var(--brand-solid)]" style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
          <p className="text-[12.5px] text-[color:var(--text-3)] mt-2.5 leading-relaxed">
            Onboarding emails, and anything your agent sends you about their own setup, do not count.
          </p>
          {!unlimited && client.overageEnabled && (
            <p className="text-[12.5px] text-[color:var(--text-3)] mt-2 leading-relaxed">
              Past {limit.toLocaleString("en-US")} they keep working and we bill{" "}
              {(client.overageRateCents / 100).toFixed(2)} per extra conversation.
            </p>
          )}
          {!unlimited && !client.overageEnabled && (
            <p className="text-[12.5px] text-[color:var(--text-3)] mt-2 leading-relaxed">
              They stop at {limit.toLocaleString("en-US")} rather than run up a bill you did not agree to.
            </p>
          )}
        </section>
      </div>

      {/* Card and invoices live in Stripe. We never take a card number into
          this app, so this is a handoff rather than a form. */}
      <section className="v3-panel p-[17px] mt-3.5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-3)]">
          How you pay
        </p>
        <p className="text-[14px] text-[color:var(--text-2)] mt-2 leading-relaxed max-w-[62ch]">
          Your card, your invoices and your receipts are held by Stripe, not by us. We never see or
          store a card number.
        </p>
        <div className="flex gap-2.5 items-center mt-3.5 flex-wrap">
          <a className="btn btn-primary" href="/api/billing/portal">Manage card and invoices</a>
        </div>
        <p className="text-[12.5px] text-[color:var(--text-3)] mt-3">
          Invoices go to {client.billingEmail}.
        </p>
      </section>

      {primary && primary.setupFeeCents > 0 && (
        <p className="text-[12.5px] text-[color:var(--text-3)] mt-3.5 px-1 max-w-[62ch] leading-relaxed">
          Your first invoice included a one off setup fee of {usd(primary.setupFeeCents)}. It does not repeat.
        </p>
      )}
    </V3Shell>
  );
}
