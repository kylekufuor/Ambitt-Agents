"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { PLAN_PREVIEW, TOPUP_PREVIEW, CUSTOM_BUILD } from "../../../lib/plan-preview";
import { Ic } from "../icons";
import { Btn, Kicker, Words } from "../primitives";

export function usd(cents: number): string {
  return "$" + String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const audiences = ["individuals", "business"] as const;
type Audience = (typeof audiences)[number];

function PlanCard({ tier }: { tier: keyof typeof PLAN_PREVIEW }) {
  const plan = PLAN_PREVIEW[tier];
  return <article className={`plan${tier === "pro" ? " featured" : ""}`} data-tier={tier}>
    {tier === "pro" ? <span className="tag">For everyday work</span> : null}
    <div><h3 className="name">{plan.label}</h3><p className="for">{plan.description}</p></div>
    <div className="price"><span className="amt" data-plan={tier}>{usd(plan.monthlyCents)}</span><span className="per">/month</span></div>
    <p className="billed">{tier === "free" ? "Free plan · coming soon" : "Monthly plan · coming soon"}</p>
    <Btn href="#contact" kind={tier === "pro" || tier === "business" ? "primary" : "ghost"} icon="arrow-up-right">Ask about early access</Btn>
    <ul>
      <li className="plan-agents"><Ic name="check" />{plan.agents === 1 ? "1 personal agent" : `Up to ${plan.agents} agents`}</li>
      <li className="plan-credits"><Ic name="check" />{plan.credits} credits a month</li>
      <li className="plan-tools"><Ic name="check" />{plan.tools === null ? "Unlimited tool connections" : `${plan.tools} tool connections`}</li>
      <li className="plan-watch"><Ic name="check" />{plan.watchHours} hours of browser watching</li>
      <li><Ic name="check" />{tier === "free" ? "Upgrade when you need more" : "Add credits when you need them"}</li>
      <li><Ic name="check" />{plan.support}</li>
    </ul>
  </article>;
}

export function Pricing() {
  const [audience, setAudience] = useState<Audience>("individuals");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") next = 1 - index;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault();
    setAudience(audiences[next]);
    tabs.current[next]?.focus();
  }

  return <section className="section ruled" id="pricing">
    <div className="wrap">
      <div className="section-head center">
        <Kicker>Pricing</Kicker>
        <h2 className="h2 rv-words"><Words text="Start small. Make room for more." accent="more" /></h2>
        <p className="dek rv">A personal agent or a team built around your business. Choose how much help you need.</p>
      </div>
      <div className="toggle-row rv">
        <div className="pricing-tabs" role="tablist" aria-label="Plans for">
          {audiences.map((tab, index) => <button key={tab} type="button" role="tab"
            id={`pricing-tab-${tab}`} aria-controls={`pricing-${tab}`} aria-selected={audience === tab}
            tabIndex={audience === tab ? 0 : -1} ref={(element) => { tabs.current[index] = element; }}
            onClick={() => setAudience(tab)} onKeyDown={(event) => moveTab(event, index)}>
            {tab === "individuals" ? "Individuals" : "Business"}
          </button>)}
        </div>
      </div>
      <div className="pricing-body rv">
        <p className="pricing-availability"><span>Coming soon</span> Self-serve plans are in development. Custom builds are available by enquiry.</p>
        <div id="pricing-individuals" className="pricing-panel" role="tabpanel" aria-labelledby="pricing-tab-individuals" tabIndex={0} hidden={audience !== "individuals"}>
          <h3 className="pricing-panel-title">For individuals</h3>
          <div className="plans">{(["free", "pro", "max"] as const).map((tier) => <PlanCard key={tier} tier={tier} />)}</div>
        </div>
        <div id="pricing-business" className="pricing-panel" role="tabpanel" aria-labelledby="pricing-tab-business" tabIndex={0} hidden={audience !== "business"}>
          <h3 className="pricing-panel-title">For your business</h3>
          <div className="plans business-plans">
            <PlanCard tier="business" />
            <article className="plan custom-plan" data-tier="custom">
              <div><h3 className="name">Custom build</h3><p className="for">Your workflow. Built and managed for you.</p></div>
              <div className="price"><span className="per">From</span><span className="amt">{usd(CUSTOM_BUILD.fromCents)}</span></div>
              <p className="billed">One-time build + a quoted monthly retainer</p>
              <Btn href="#contact" kind="primary" icon="arrow-up-right">Talk about your workflow</Btn>
              <ul>{["A playbook built around your process", "Your tools connected and configured", "A dry run before your agent goes live", "We manage the agent with you"].map((feature) => <li key={feature}><Ic name="check" />{feature}</li>)}</ul>
              <p className="custom-note">For work that needs a closer fit. We scope the job, agree the price, and build around the way your team works.</p>
            </article>
          </div>
        </div>
        <div className="pricing-notes">
          <div><h3>More work, more credits.</h3><p>Paid plans will offer {TOPUP_PREVIEW.credits} extra credits for {usd(TOPUP_PREVIEW.priceCents)}. A typical run uses one credit; longer jobs can use more. Free has a hard cap.</p></div>
          <div><h3>Know what you're using.</h3><p>These are planned monthly allowances. Credit billing and browser watching are in development. Paid watching beyond the allowance will be $3 an hour.</p></div>
        </div>
      </div>
      <noscript><style>{"#pricing .pricing-tabs{display:none}#pricing .pricing-panel[hidden]{display:block}#pricing .pricing-panel-title{display:block;margin-top:32px}"}</style></noscript>
    </div>
  </section>;
}
