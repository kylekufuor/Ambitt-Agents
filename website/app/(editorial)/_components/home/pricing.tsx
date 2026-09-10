import { MaskLine, RuleDraw } from "../primitives";

/*
 * The price list, as one ledger against the cost of hiring a coordinator.
 *
 * These numbers mirror shared/pricing-constants.ts, which is what Oracle
 * actually bills. The website is built on Railway from website/ alone, so it
 * cannot import that file; editorial.test.ts fails if the two drift. Change
 * pricing there first, then here.
 */
export const TIERS = {
  starter: { label: "Starter", for: "One agent, one standing job", monthlyCents: 49_900, setupFeeCentsMin: 100_000, setupFeeCentsMax: 250_000, against: "About a tenth of a coordinator's salary" },
  growth: { label: "Growth", for: "A small team of agents", monthlyCents: 149_900, setupFeeCentsMin: 500_000, setupFeeCentsMax: 500_000, against: "About a third of a coordinator's salary" },
  scale: { label: "Scale", for: "The full roster", monthlyCents: 349_900, setupFeeCentsMin: 500_000, setupFeeCentsMax: 500_000, against: "Still under one coordinator's salary" },
} as const;

/** Each agent after the first, as a percentage off the plan price. */
export const SECOND_AGENT_DISCOUNT_PCT = 20;

/** The comparison every row is measured against, in whole dollars. */
export const COORDINATOR_SALARY = 55_000;

/** Whole dollars with thousands separators: 150000 cents -> "$1,500". */
export function usd(cents: number): string {
  return "$" + String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function Pricing() {
  const { starter, growth } = TIERS;
  return (
    <section className="section" id="pricing">
      <RuleDraw />
      <div className="wrap">
        <div className="section-head reveal">
          <p className="kicker">What this costs</p>
          <h2 className="h2">
            <MaskLine>What a coordinator costs, and what this costs.</MaskLine>
          </h2>
          <p className="dek" style={{ marginTop: "12px" }}>
            A full-time coordinator runs {usd(COORDINATOR_SALARY * 100)} a year before benefits, before the desk,
            before the laptop. Every tier here still comes in under that, and the agent's on the clock before
            your coffee's cold.
          </p>
        </div>
        <div className="reveal scroller">
          <table className="ledger" style={{ minWidth: "760px" }}>
            <thead>
              <tr>
                <th>Tier</th>
                <th>Monthly</th>
                <th>One-time build</th>
                <th>Annualized</th>
                <th>Against a ${COORDINATOR_SALARY / 1000}k coordinator</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(TIERS).map((tier) => {
                const flat = tier.setupFeeCentsMin === tier.setupFeeCentsMax;
                return (
                  <tr key={tier.label}>
                    <td>
                      <div className="tier">{tier.label}</div>
                      <div className="tfor">{tier.for}</div>
                    </td>
                    <td className="price">
                      {usd(tier.monthlyCents)}
                      <span className="per">/mo</span>
                    </td>
                    {flat ? (
                      <td className="price">
                        {usd(tier.setupFeeCentsMin)}
                        <span className="per"> flat</span>
                      </td>
                    ) : (
                      <td className="price" style={{ whiteSpace: "nowrap" }}>
                        {usd(tier.setupFeeCentsMin)}
                        <span className="per"> to </span>
                        {usd(tier.setupFeeCentsMax)}
                      </td>
                    )}
                    <td className="price">
                      {usd(tier.monthlyCents * 12)}
                      <span className="per">/yr</span>
                    </td>
                    <td className="against">{tier.against}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="ledger-foot reveal">
          Each agent has its own inbox and its own memory. Your first agent is your plan's price, and each one
          you add after that is {SECOND_AGENT_DISCOUNT_PCT}% off. Nobody on your team pays to read its work.
          You're hiring, not licensing seats.
        </p>
        <p className="ledger-foot reveal">
          The build is billed once, at the start, not every month. It's a flat {usd(growth.setupFeeCentsMin)} on
          Growth and Scale. On Starter it's {usd(starter.setupFeeCentsMin)} to {usd(starter.setupFeeCentsMax)},
          quoted once we know the job. Count it into the first year and every tier still comes in under a
          coordinator.
        </p>
        <div className="reveal" style={{ marginTop: "24px" }}>
          <a href="#contact" className="btn btn-primary">
            Talk to us
          </a>
        </div>
      </div>
    </section>
  );
}
