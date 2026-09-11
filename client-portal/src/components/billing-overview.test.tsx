import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingOverview, type BillingAgent } from "./billing-overview";
import { TIERS } from "../lib/pricing-constants";

const base: BillingAgent = {id:"one",name:"Morgan",status:"active",pricingTier:"starter",monthlyRetainerCents:49900,setupFeeCents:100000,interactionCount:1050,interactionLimit:1000};
const render = (agents: BillingAgent[], hasBillingAccount = true) => renderToStaticMarkup(<BillingOverview agents={agents} billingEmail="billing@example.com" billingStatus="active" hasBillingAccount={hasBillingAccount} />).replace(/<[^>]+>/g, "");
for (const [tier, config] of Object.entries(TIERS)) {
  const output = render([{...base, pricingTier:tier, interactionLimit:config.interactionsPerMonth}]);
  if (config.interactionsPerMonth > 0) assert.ok(output.includes(`Extra interactions cost $${(config.overageRateCents / 100).toFixed(2)} each.`));
  else assert.ok(output.includes("unlimited"));
}
const mixed = render([base,{...base,id:"two",name:"Sage",pricingTier:"enterprise",interactionLimit:-1,interactionCount:42}]);
assert.match(mixed,/1,050 \/ 1,000 included/);
assert.match(mixed,/42 · unlimited/);
assert.doesNotMatch(mixed,/They stop|Renews|Cancel any time before/);
assert.match(render([{...base,status:"paused"}]),/Pausing an agent does not cancel/);
assert.match(render([],false),/No agent plan yet/);
assert.doesNotMatch(render([],false),/Manage card and invoices/);
assert.doesNotMatch(render([],false),/Growth/);
console.log("billing presentation: 11 checks passed");
