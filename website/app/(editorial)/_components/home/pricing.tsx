"use client";

import { useState } from "react";
import { Ic } from "../icons";
import { Btn, Kicker, Words } from "../primitives";

/*
 * The price list, three cards and Seonovu's Monthly/Yearly toggle.
 *
 * These numbers mirror shared/pricing-constants.ts, which is what Oracle
 * actually bills. The website is built on Railway from website/ alone, so it
 * cannot import that file; editorial.test.ts fails if the two drift. Change
 * pricing there first, then here.
 */
export const TIERS = {
  starter: { label: "Starter", for: "One agent, one standing job", monthlyCents: 49_900, maxAgents: 1, interactionsPerMonth: 1000, overageRateCents: 60, setupFeeCentsMin: 100_000, setupFeeCentsMax: 250_000 },
  growth: { label: "Growth", for: "A small team of agents", monthlyCents: 149_900, maxAgents: 2, interactionsPerMonth: 3000, overageRateCents: 40, setupFeeCentsMin: 500_000, setupFeeCentsMax: 500_000 },
  scale: { label: "Scale", for: "The full roster", monthlyCents: 349_900, maxAgents: 3, interactionsPerMonth: 10000, overageRateCents: 30, setupFeeCentsMin: 500_000, setupFeeCentsMax: 500_000 },
} as const;

/** Each agent after the first, as a percentage off the plan price. */
export const SECOND_AGENT_DISCOUNT_PCT = 20;

/** A year is billed as this many months (mirrors getAnnualPrice: two months free). */
export const ANNUAL_MONTHS = 10;

/** The comparison every price is measured against, in whole dollars. */
export const COORDINATOR_SALARY = 55_000;

/** Whole dollars with thousands separators: 150000 cents -> "$1,500". */
export function usd(cents: number): string {
  return "$" + String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function features(t: (typeof TIERS)[keyof typeof TIERS]): string[] {
  return [
    t.maxAgents === 1 ? "1 agent, 1 standing job" : `Up to ${t.maxAgents} agents`,
    `${t.interactionsPerMonth.toLocaleString("en-US")} interactions a month`,
    `Then ${(t.overageRateCents / 100).toFixed(2).replace(/^/, "$")} each`,
    "Own inbox, own memory",
    "Portal with work log and playbook",
    t.maxAgents > 1 ? `Each agent after the first ${SECOND_AGENT_DISCOUNT_PCT}% off` : "Approval on anything with consequences",
  ];
}

export function Pricing() {
  const [yearly, setYearly] = useState(false);
  const [switching, setSwitching] = useState(false);
  const pick = (y: boolean) => {
    if (y === yearly) return;
    setSwitching(true);
    setYearly(y);
    window.setTimeout(() => setSwitching(false), 320);
  };
  const { starter, growth } = TIERS;

  return (
    <section className="section ruled" id="pricing">
      <div className="wrap">
        <div className="section-head center">
          <Kicker>Pricing</Kicker>
          <h2 className="h2 rv-words">
            <Words text={"What a coordinator costs, and what this costs."} accent="this" />
          </h2>
          <p className="dek rv">
            A full-time coordinator runs {usd(COORDINATOR_SALARY * 100)} a year before benefits, before the desk,
            before the laptop. Every tier here still comes in under that, and the agent's on the clock before your
            coffee's cold.
          </p>
        </div>

        <div className="toggle-row rv">
          <div className="toggle" data-yearly={yearly} role="group" aria-label="Billing period">
            <span className="thumb" aria-hidden="true" />
            <button type="button" aria-pressed={!yearly} onClick={() => pick(false)}>
              Monthly
            </button>
            <button type="button" aria-pressed={yearly} onClick={() => pick(true)}>
              Yearly <span className="save">2 months free</span>
            </button>
          </div>
        </div>

        {/* Reveal state lives in the class list (set by the observer); React must never rewrite it, so the switch is a data attribute. */}
        <div className="plans rv-seq" data-switching={switching}>
          {(Object.keys(TIERS) as Array<keyof typeof TIERS>).map((key) => {
            const t = TIERS[key];
            const flat = t.setupFeeCentsMin === t.setupFeeCentsMax;
            const perMonth = yearly ? Math.round((t.monthlyCents * ANNUAL_MONTHS) / 12) : t.monthlyCents;
            return (
              <div key={key} className={key === "growth" ? "plan featured" : "plan"}>
                {key === "growth" ? <span className="tag">Most popular</span> : null}
                <div>
                  <div className="name">{t.label}</div>
                  <div className="for">{t.for}</div>
                </div>
                <div className="price">
                  <span className="amt" data-plan={key}>{usd(perMonth)}</span>
                  <span className="per">/mo</span>
                </div>
                <div className="billed">{yearly ? `Billed ${usd(t.monthlyCents * ANNUAL_MONTHS)} a year` : "Billed monthly"}</div>
                <div className="build">
                  One-time build: <b>{flat ? `${usd(t.setupFeeCentsMin)} flat` : `${usd(t.setupFeeCentsMin)} to ${usd(t.setupFeeCentsMax)}`}</b>
                </div>
                <Btn href="#contact" kind={key === "growth" ? "primary" : "ghost"} icon="arrow-up-right">
                  Talk to us
                </Btn>
                <ul>
                  {features(t).map((f) => (
                    <li key={f}>
                      <Ic name="check" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="ledger-foot rv">
          Each agent has its own inbox and its own memory. Your first agent is your plan's price, and each one you
          add after that is {SECOND_AGENT_DISCOUNT_PCT}% off. Nobody on your team pays to read its work. You're
          hiring, not licensing seats.
        </p>
        <p className="ledger-foot rv" style={{ marginTop: "12px" }}>
          The build is billed once, at the start, not every month. It's a flat {usd(growth.setupFeeCentsMin)} on
          Growth and Scale. On Starter it's {usd(starter.setupFeeCentsMin)} to {usd(starter.setupFeeCentsMax)},
          quoted once we know the job. Count it into the first year and every tier still comes in under a
          coordinator.
        </p>
      </div>
    </section>
  );
}
