import { TIERS, getOverageRate, type PricingTier } from "@/lib/pricing-constants";
import { BillingPortalButton } from "./billing-portal-button";

export interface BillingAgent {
  id: string;
  name: string;
  status: string;
  pricingTier: string;
  monthlyRetainerCents: number;
  setupFeeCents: number;
  interactionCount: number;
  interactionLimit: number;
}

export function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });
}

export function BillingOverview({ agents, billingEmail, billingStatus, hasBillingAccount }: {
  agents: BillingAgent[];
  billingEmail: string;
  billingStatus: string;
  hasBillingAccount: boolean;
}) {
  const monthlyCents = agents.reduce((sum, agent) => sum + agent.monthlyRetainerCents, 0);
  const used = agents.reduce((sum, agent) => sum + agent.interactionCount, 0);
  const setupCents = agents.reduce((sum, agent) => sum + agent.setupFeeCents, 0);
  const tiers = [...new Set(agents.map(agent => TIERS[agent.pricingTier as PricingTier]?.label ?? "Custom"))];

  return <>
    <h1 className="text-[24px] font-medium">Billing</h1>
    <p className="text-[14px] text-[color:var(--text-3)] mt-1">Your plan, usage and invoices, in one place.</p>
    <div className="grid gap-3.5 mt-5 lg:grid-cols-[1fr_1.2fr] items-start">
      <section className="v3-panel p-[17px]" aria-labelledby="billing-plan">
        <p className="eyebrow" id="billing-plan">Your plan</p>
        {agents.length === 0 ? <>
          <h2 className="text-[20px] font-medium mt-2">No agent plan yet</h2>
          <p className="text-[13px] text-[color:var(--text-2)] mt-2">Your plan and included usage will appear here once your agent is set up.</p>
        </> : <>
          <h2 className="text-[20px] font-medium mt-2">{tiers.length === 1 ? tiers[0] : "Your agents"}</h2>
          <p className="font-mono text-[28px] font-medium mt-3 tabular-nums">{usd(monthlyCents)} <span className="text-[13px] text-[color:var(--text-3)]">/ month</span></p>
          <p className="text-[12.5px] text-[color:var(--text-3)] mt-1">Recurring agent fees, before any extra interactions. Check Stripe for your billing period and renewal date.</p>
          <ul className="mt-4 border-t border-[color:var(--border)]">
            {agents.map(agent => <li key={agent.id} className="flex justify-between gap-3 py-2.5 text-[13px]">
              <span className="min-w-0 break-words">{agent.name}{agent.status !== "active" && <span className="text-[color:var(--text-3)]"> · {agent.status === "paused" ? "on hold" : "getting set up"}</span>}</span>
              <span className="font-mono shrink-0 tabular-nums">{usd(agent.monthlyRetainerCents)}</span>
            </li>)}
          </ul>
          {agents.some(agent => agent.status === "paused") && <p className="text-[12.5px] text-[color:var(--text-3)] mt-2">Pausing an agent does not cancel the subscription. Manage your subscription in Stripe.</p>}
        </>}
        <p className="text-[12.5px] text-[color:var(--text-3)] mt-3">Billing status: {billingStatus.replaceAll("_", " ")}.</p>
      </section>
      <section className="v3-panel p-[17px]" aria-labelledby="billing-usage">
        <p className="eyebrow" id="billing-usage">Current usage</p>
        <p className="font-mono text-[28px] font-medium mt-2 tabular-nums">{used.toLocaleString("en-US")} <span className="text-[13px] text-[color:var(--text-3)]">interactions</span></p>
        <p className="text-[12.5px] text-[color:var(--text-3)] mt-1">Each agent has a separate allowance. Usage is not pooled across agents.</p>
        <div className="mt-4 space-y-4">
          {agents.map(agent => {
            // Match the runtime: only a positive limit triggers overage billing.
            const capped = agent.interactionLimit > 0;
            const pct = capped ? Math.min(100, Math.round(agent.interactionCount / agent.interactionLimit * 100)) : 0;
            const rate = getOverageRate(agent.pricingTier as PricingTier);
            return <div key={agent.id} className="border-t border-[color:var(--border)] pt-3">
              <div className="flex flex-wrap justify-between gap-1 text-[13px]">
                <b className="font-medium break-words">{agent.name}</b>
                <span className="font-mono tabular-nums">{agent.interactionCount.toLocaleString("en-US")}{capped ? ` / ${agent.interactionLimit.toLocaleString("en-US")} included` : " · unlimited"}</span>
              </div>
              {capped && <div className="h-1.5 rounded-full mt-2 overflow-hidden bg-[color:var(--surface-2)]" role="img" aria-label={`${agent.name}: ${agent.interactionCount} interactions used, ${agent.interactionLimit} included`}>
                <span className="block h-full rounded-full bg-[color:var(--brand-solid)]" style={{ width: `${pct}%` }} />
              </div>}
              {capped && <p className="text-[12.5px] text-[color:var(--text-3)] mt-2 leading-relaxed">{agent.name} keeps working after the included allowance. Extra interactions cost {usd(rate)} each.</p>}
            </div>;
          })}
        </div>
        <p className="text-[12.5px] text-[color:var(--text-3)] mt-4 leading-relaxed">Welcome emails and onboarding check-ins do not count toward your allowance.</p>
      </section>
    </div>
    <section className="v3-panel p-[17px] mt-3.5">
      <h2 className="text-[16px] font-medium">Card, subscription and invoices</h2>
      <p className="text-[13px] text-[color:var(--text-2)] mt-2 max-w-[62ch] leading-relaxed">Manage your payment details and view your invoices securely with Stripe.</p>
      <div className="mt-3.5"><BillingPortalButton hasBillingAccount={hasBillingAccount} /></div>
      <p className="text-[12.5px] text-[color:var(--text-3)] mt-3 break-words">Invoices go to {billingEmail}.</p>
    </section>
    {setupCents > 0 && <p className="text-[12.5px] text-[color:var(--text-3)] mt-3.5 px-1">One-time setup fees: {usd(setupCents)} across your agents. These do not repeat.</p>}
  </>;
}
