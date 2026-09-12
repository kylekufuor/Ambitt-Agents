# Public pricing, September 11, 2026

Source: Kyle's Claude Code conversation `bc9c4a70-3937-4ea5-92ce-13af1c548fc3`, ordinary messages at 22:22:39, 22:24:26, and 22:25:51 UTC. Kyle requested profitable allowances at full use, Pro at $79, Free unchanged, Individuals / Business tabs, and a separate custom-build offering; his final correction set tool caps to 3 / 6 / unlimited. The following numbers incorporate that correction.

- Individuals: Free $0, 30 credits, 2 watching hours, 3 tools; Pro $79/month, 80 credits, 8 hours, 6 tools; Max $199/month, 200 credits, 20 hours, unlimited tools. One agent each.
- Business: $599/month, up to 3 agents, 600 credits, 60 hours, unlimited tools, priority support.
- Custom build: from $5,000 once, plus a quoted monthly retainer.
- Paid top-ups: $25 for 40 credits. Paid watching beyond the allowance: $3/hour. Free has a hard cap.
- No annual offer for this release. Credits describe an allowance, not a guaranteed number of jobs; a longer run can consume more than one.

## Current release

`website/app/lib/plan-preview.ts` holds the upcoming public catalog. The page clearly identifies all self-serve plans and allowances as coming soon and routes enquiries to the working contact section. Custom builds have a distinct enquiry CTA. It does not link to an unbuilt signup or checkout.

Existing billing constants, subscriptions, usage counters and portal invoices are unchanged. The existing billing screenshot and video segment are removed from marketing so the old plan ladder does not contradict the new catalog. The updated walkthrough uses a fictional workspace without a plan label.

## Before self-serve launch

The broader usage-pricing draft remains a proposal for implementation, not a completed billing system. Credit metering and receipts, watching consent/timing/hard caps, tool limits, signup, plan checkout, top-up fulfilment, and existing-account migration still need implementation and verification. The Business plan also needs multi-agent support in the portal. Do not remove the availability labels or change actual charges by simply importing this preview catalog into billing.

Phone answering and the GHL connector are separate work. This pricing update adds no claims that they are available.
