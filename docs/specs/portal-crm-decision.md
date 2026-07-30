# Decision doc — should a lightweight CRM be the core of the client portal?

**Status:** recommendation for Kyle. Nothing here is policy until he says so.
**Author:** Parker (PM) · **Date:** 2026-07-29
**Proposal being evaluated (Kyle):** *the client portal should become a dashboard users already recognise, and since all three beachhead verticals deal with leads, a lightweight CRM should be its core.*

**Recommendation in one line:** do a **narrower version**. Take the lead register we already have and turn it into a **results ledger** that borrows the CRM's visual grammar, keep the agent as the only writer of record, and write through to the CRM the client already pays for where we can reach it. Do not build a CRM.

**Rating of the idea as stated: 5/10.** Right screen, right instinct about proof and familiarity, wrong noun and wrong position in the stack. Full breakdown at the end.

---

## 1. Ground truth — what actually exists today (verified in code, 2026-07-29)

| Thing | Where | State |
|---|---|---|
| `Lead` model | `prisma/schema.prisma:1045-1078` | Real. `name`, `company`, `email`, `phone`, `status`, `source`, `valueUsd`, `notes`, `details Json`, `lastContactedAt`. Indexed on `agentId`, `clientId`, `(agentId,status)`, `(agentId,createdAt)`. `status` is a free-form string; the portal understands `new / contacted / replied / qualified / won / lost / archived`. |
| Agent write path | `shared/runtime/engine.ts:101, 247-…, 742-805` | `log_lead` platform tool. Upserts by `(agentId, case-insensitive name [+ email])` so re-logging advances a lead instead of duplicating. Validates status against the 7-value set. Optional `mark_contacted`. |
| Client read surface | `client-portal/src/app/agents/[id]/leads/page.tsx` | **Read-only.** Status-count pills, lead cards (value, status, contact, notes, `details` key/value chips, source, dates), crafted empty state, CSV export. |
| Client write surface | — | **None.** The only lead API route is `client-portal/src/app/api/agents/[id]/leads/export/route.ts`. No create / update / status-change endpoint. |
| Scale handling | same page | `findMany` with **no `take`, no filter, no search, no sort control**. Fine at 20 leads, breaks at 2,000. |
| Per-agent nav | `client-portal/src/components/sidebar.tsx:82-87` | Overview · Communication (anchor) · Tools · Activity · Leads · Configure. |
| Home page | `client-portal/src/app/page.tsx` | 5 nav tiles + usage card + plan card + roster. |
| CRMs reachable | `shared/mcp/registry.ts:17, 31, 442` | Salesforce, HubSpot, Pipedrive have registry entries. Buildout / Apto / ClientLook / ServiceTitan / Jobber / Housecall Pro / TaxDome / Karbon / Canopy: **none**. Those would need `browse` (Arthur Remote Hands), `http_request`, or a CSV drop. |

**Two corrections to the brief's premises, both load-bearing:**

1. **Portal chat is built, not unbuilt.** `client-portal/src/app/chat/[agentId]/page.tsx` + `chat-view.tsx` exist, and Oracle serves `POST /chat/:agentId/messages` (`oracle/index.ts:1517`) and `GET /chat/:agentId/history` (`:1588`). It is gated on `CHAT_TOKEN_SECRET` — when that env var is absent the home tile renders "Soon" (`page.tsx:112-115, 295-301`). So chat is a **config + security item** (the token is a bearer credential in a URL with no expiry, per the 2026-07-28 audit), not a build. It is not the thing a CRM would displace.
2. **The banned dollar figure is still live.** `USAGE_MARKUP = 15` at `page.tsx:17`, computed at `:161-168`, rendered as the home hero number at `:319-321`. Kyle's 2026-07-28 decision was work-delivered counts and **no dollar figure**. It has not shipped. This is the thing a CRM would displace, and it should not be displaced.

**So the real question is not "build a CRM from zero."** A lead register already exists and is read-only by design. The question is how far we take it, and whether we let humans write to it.

---

## 2. The central tension — does a CRM contradict the positioning?

### The "no login" claim survives. The "who does the work" claim does not.

The live copy is **"You never have to log in"** (`website/app/components/home/hero.tsx:21`, `website/app/layout.tsx:56, 66`). Kyle's 2026-07-28 correction already landed; the site does not claim the portal doesn't exist. That claim is compatible with a portal that has real depth, including a pipeline board.

So the positioning risk is **not** the login promise. It is this:

> A CRM is only correct if it's current, and it's only current if someone maintains it. The moment the portal becomes a system of record, we have created an obligation for the client. That is work handed back — which is precisely what the agent-prompt overhaul (`6a5a684`) forbids agents from doing. **Building a CRM does at the product level the thing we ban at the agent level.**

And it lands directly on the differentiator we just re-cut. The 2026-07-28 Lev finding was explicit: *"supervised not autonomous" is no longer a differentiator; reframe to **who does the work**.* A CRM is the canonical artifact of a human doing the work. Lev sells software a CRE firm operates itself, at $80–$400/seat. We charge $499–$3,499 because a worker does it. Putting a CRM at the centre invites exactly the comparison we decided never to invite.

### But there are two real insights inside the proposal, and they're worth keeping.

**Recognition is a genuine onboarding asset.** A CRE broker who opens the portal and sees a pipeline board understands it in two seconds with no training. That is real value and we should take it. But recognition is a **layout** problem, not a system-of-record problem. We can borrow the CRM's visual grammar (stages, a board, a record view, status, last-contacted) without accepting the CRM's obligation (the client keeps it current).

**Kyle is pointing at the right screen.** The 2026-07-28 audit found the #1 business problem: renewal is decided from memory, and memory favours whatever went wrong. Leads rated 7/10; home rated 5/10. For a lead-driven business, a pipeline the agent fills and visibly moves is the most legible proof we can produce. He's identified the right surface and named the wrong noun. It isn't a CRM. It's a **scoreboard for work the agent did**, which happens to look like a pipeline because the work is lead-shaped.

### Verdict on the tension

Adding a **results ledger** strengthens the positioning: it is evidence for "the agent does the work."
Adding a **CRM** requires repositioning, and the reposition is downward: from a hire to a tool.

---

## 3. Their existing CRM — replace, duplicate, or sync?

Every vertical has an incumbent, and in two of the three it's the operational spine, not just a contact list:

- **CRE:** Buildout (which absorbed Apto), ClientLook for small teams. Research note worth reading twice: for boutique brokerages the bottleneck *"is admin overhead and getting brokers to actually use the system."* The pain is not missing features. It's that data entry is a human chore nobody does.
- **Tax:** TaxDome / Karbon / Canopy, majority-adopted above ~$2M revenue but only **~a third of firms overall** — the rest run spreadsheets and ad-hoc chat. These hold documents, e-signature, invoicing and compliance history.
- **Home services:** ServiceTitan (enterprise) / Housecall Pro (mid) / Jobber (small). These run dispatch and invoicing.

| Option | What it costs us to build | What it costs us in trust |
|---|---|---|
| **(a) Replace** — they abandon theirs | Enormous and open-ended. A CRM without scheduling and invoicing is not a substitute for ServiceTitan or Jobber; without documents and e-sign it is not a substitute for TaxDome. | High. Being the system of record means churn equals data loss, which reads as hostage-taking. Also lands us with migration, retention and export obligations we do not want on a build-to-sell balance sheet. |
| **(b) Duplicate** — a parallel board they also maintain | Deceptively cheap. This is what "let clients edit leads in the portal" quietly produces. | **Highest, and the failure is silent.** Two records, both half-right, and the client discovers the divergence at the worst possible moment (a deal they thought was live). It converts our proof surface into a liability surface. **This is the option I want Kyle to rule out explicitly**, because it is the default outcome of not deciding. |
| **(c) Sync / write-through** — the agent updates the tool they already pay for; the portal shows what it did | Real but bounded, and **per connector**. HubSpot / Salesforce / Pipedrive are already in the registry and Composio-reachable. Buildout / ServiceTitan / Jobber / TaxDome are not — those go through `browse`, `http_request`, or a CSV drop, which is a sprint per vertical and the messy part. | **Net positive.** "Your agent keeps your CRM current" is a sentence a CRE broker pays $3,499 for, precisely because the research says nobody keeps it current today. |

**Recommended: (c) for the systems we can reach, with the portal ledger as the universal fallback for the ones we can't. Never (b).** And never promise a connector on the website before we've proven it against a real account.

---

## 4. What this displaces (opportunity cost, ranked)

1. **Killing the dollar figure** (`page.tsx:17, 161-168, 319-321`). Already decided by Kyle on 2026-07-28, still unshipped. Today a $1,499/mo client sees roughly "$12" of "value" as the hero number on their front door. Shipping a new surface while the front door argues against the price is the wrong order. Cheapest fix, highest ratio, goes first.
2. **No approvals inbox.** Supervised runs stall invisibly while the portal shows a green "Active." An agent that's silently waiting looks identical to an agent that's working. That's a product-integrity bug and it outranks a new surface.
3. **The monthly "Work delivered" email statement.** Same data as the ledger, delivered on-promise. If we build the ledger and skip the email, we've built proof that only exists if the client logs in, which is the same mistake in a new costume.
4. **Chat** — not displaced. It's built; it needs `CHAT_TOKEN_SECRET` set and a token-expiry fix.

---

## 5. Pricing — does a CRM justify $499 / $1,499 / $3,499?

**No. It argues against them.** Kyle's 2026-07-28 frame is to compete with a hire, never a software seat. A CRM is the most price-anchored software category there is: HubSpot Starter, Pipedrive, ClientLook and Jobber all sit in the tens of dollars per seat. The moment a prospect can name our core as "a CRM," their reference price moves from "a $55k coordinator" to "$29 a seat," and every objection becomes *"we already have one, and it's cheaper."*

A results ledger has no reference price, because it isn't a category. You can't buy a scoreboard for work an agent did. That asymmetry is worth more than any feature in this doc.

**One nuance that does help pricing:** `valueUsd` summed over `won` is the closest thing we have to attributable outcome value, and `project_pricing_sot` flags outcome pricing as the biggest unexploited lever (Sierra runs it in production; Bessemer recommends hybrid base+outcome). The ledger is the data foundation for that conversation. That is a better reason to build it than recognition.

---

## 6. Recommended scope — phased, one verified step at a time

Naming rule for the whole thing: **"Results," never "CRM,"** in product, site, and sales. Per-agent label comes from a new `Agent.resultsLabel` so a tax agent's board reads "Returns" and a home-services agent's reads "Jobs."

### Phase 0 — prerequisite, not part of this feature
Ship Kyle's 2026-07-28 decision: remove the marked-up dollar figure from the portal home, replace with work-delivered counts, move money to a Plan & billing page. Blocks Phase 1.

### Phase 1 — The ledger (recognisable, still read-only)
- Rename Leads → **Results**; label per agent via `Agent.resultsLabel` (nullable, defaults to "Results").
- Pipeline **board** grouped by status, with per-stage count and summed `valueUsd`. This is where we take the CRM's grammar.
- Search, status filter, sort, and **pagination** (today's `findMany` has no `take`).
- Hide the nav item entirely when the agent has never called `log_lead`, so a non-lead agent doesn't get a permanently empty tab.
- Export stays one click and stays loud on every view.

### Phase 2 — Redirect actions (the only human writes, and they are not edits)
Three verbs, no field editor: **Not a fit · Already talking to them · Chase this one.**

Each click writes a `ConversationMessage` on the agent's thread and runs the agent. The **agent** applies the status change and confirms, and stores the reason via `shared/memory.ts` so it changes future sourcing.

This framing is the entire decision, so it belongs in the spec as a hard rule, not a UI preference: *a click is a message to the agent, not a database write.* Framed that way the agent stays the actor and there is no divergence. Framed as "edit lead," we are in option (b) and my distinction has collapsed.

### Phase 3 — Write-through, one connector at a time
HubSpot first (already in registry, Composio-reachable, broadest overlap with agencies + CRE). Ledger stores the foreign record id + `lastSyncedAt`. Conflict rule: **agent wins on the fields it owns, never a silent two-way merge.** Prove it against one real account, then decide on the next. Buildout via `browse` is a separate, unproven bet — quote it separately.

### Phase 4 — Ledger to inbox
Monthly "Work delivered" statement email, reading the same aggregate. This is what keeps the ledger consistent with "work lands in your inbox."

### Phase 5 — optional, only on client pull
Expose the `won` value roll-up as the data basis for an outcome-priced tier conversation. **Data only. No pricing change without Kyle.**

---

## 7. What I would NOT build (explicit)

1. Client-editable lead fields, inline edit, or an "Add lead" button.
2. CSV import of the client's existing book.
3. Custom fields, custom pipeline stages, or a stage builder. `details Json` already absorbs domain fields; a stage builder makes us a configurable CRM and forces every downstream feature to branch on client config.
4. Deal-stage automations, workflow builder, if-this-then-that rules. That's the agent's job, and a rules engine competes with our own runtime.
5. Tasks, reminders, or a calendar for the human. Assigning the client work is the anti-product.
6. Per-contact activity timeline or an email-thread inbox per record. That's rebuilding a CRM's inbox; Activity already covers what was sent.
7. Two-way sync with a conflict-resolution UI.
8. Client-typed notes, @mentions, multi-user assignment, seats. No second seat exists today, and adding collaboration makes seat-price pressure real.
9. Reporting / BI, funnel-conversion charts, forecasting. Counts and a value roll-up, nothing more.
10. A mobile app or push notifications.
11. A cross-agent, account-level book merging every agent's leads. That is the specific step that makes us the system of record.
12. Any product, website, or sales copy that calls this a CRM.

---

## 8. The strongest argument against my own recommendation

**I may be defending positioning the market doesn't reward, and underpricing the recognition benefit.**

A $3,499/mo buyer's biggest unspoken fear is probably not "will this be a tool instead of a hire." It's **"will I be able to see what I bought."** Familiar software is how buyers de-risk. A pipeline board they recognise may close deals that a philosophically pure ledger doesn't, and closed deals fund everything else in this repo.

My "duplication is fatal" claim rests on divergence — but the incumbent CRM in these verticals is *already* stale, since the CRE research says the bottleneck is getting brokers to use it at all. A divergence I'm calling a liability may be an improvement on the status quo, and the client may not care which record is canonical as long as one of them is current.

And "system of record means churn equals data loss" cuts both ways. That is also the strongest retention mechanic in SMB software, and **we have zero retention mechanics today.** If Ambitt's real risk is churn at month 4 rather than mispositioning at month 0, Kyle's version is more right than mine. If he takes that bet, the mitigation is to keep export loud and one-click everywhere, so we earn the stickiness instead of trapping it.

**Second-order counter, and the one that would actually beat me:** the ledger-vs-CRM distinction may be invisible to the client. If they treat the board as a CRM no matter what we call it, I've bought positioning purity at the price of a worse CRM. The test for whether the distinction is real is narrow and checkable: **does the client ever have to keep it current?** If Phase 2's three verbs creep into a field editor, the distinction has collapsed and Kyle's version wins by default. That boundary is the thing to hold.

---

## 9. Acceptance criteria (QA-verifiable, Phase 1)

Phase 1 is not done until every line below passes. Phases 2–5 get their own criteria when scoped.

**Prereq — paste-ready sample data.** No lead seed exists today (`scripts/seed-mcquizzy.ts` seeds agents/tasks only, no `Lead` rows). Phase 1 ships `scripts/seed-leads.ts` first:

```bash
cd "/Users/kylekufuor/Projects/Ambitt Agents"
npx tsx scripts/seed-leads.ts --agent <AGENT_ID> --count 240
# expected stdout: "Seeded 240 leads for <Agent name>: 90 new, 60 contacted,
# 30 replied, 25 qualified, 20 won, 10 lost, 5 archived · total value $18.4M"
```

Seed must include the edge rows, not just the happy path: one lead with `valueUsd = null`, one with every optional field null except `name`, one with a 180-character name, one with 12 keys in `details`, one with `status` set to an unrecognised string (proves the fallback pill renders rather than crashing).

**User story.** *Casey opens the portal to see what Arthur has actually produced this month, filters to qualified deals, and exports them for his Monday partner meeting.*

| # | Steps | Expected |
|---|---|---|
| 1 | Sign in at `https://portal.ambitt.agency/login` as the owning client (OTP path; operator email 404s on every per-client surface). Go to `/agents/<AGENT_ID>/results`. | Board renders grouped by stage. Each stage header shows count + summed value. Totals equal the seed stdout exactly. |
| 2 | `/agents/<AGENT_ID>/leads` | 308-redirects to `/results`. No dead link anywhere in `sidebar.tsx` or the home nav tiles. |
| 3 | Sidebar + home tile label | Reads the value of `Agent.resultsLabel` when set (set it to "Deals", reload, confirm), "Results" when null. Never "Leads", never "CRM". |
| 4 | Filter to Qualified | 25 rows. URL carries the filter as a query param and survives a hard reload. |
| 5 | Search `Riverside` | Matches on `name` **and** `company`, case-insensitive. Zero-result state shows the crafted copy, not "No data available." |
| 6 | Scroll / paginate | Page 1 issues a query with `take` ≤ 50 (confirm in server logs). 240 rows do not arrive in one response. |
| 7 | `curl -sI "https://portal.ambitt.agency/api/agents/<AGENT_ID>/leads/export"` while signed out | 401 or redirect, never a CSV body. |
| 8 | Export CSV while signed in, with the Qualified filter on | Downloads 25 data rows + header. Opens clean in Excel and Numbers. Commas inside `notes` do not break columns. |
| 9 | Read-only check: `grep -rn "prisma.lead.update\|prisma.lead.create" client-portal/src` | **Zero hits.** The portal has no lead write path in Phase 1. |
| 10 | Agent with zero `log_lead` calls ever | Results does not appear in the sidebar or the home tiles at all. Direct navigation to `/results` renders the crafted empty state, not a 404 and not a broken board. |
| 11 | Design pass (`client-portal/DESIGN.md`) | No flat gray card outlines. Duotone icons only. Board columns separate by elevation and wash. Status pills use green/amber/red/blue/muted, never teal. No `--text-4` carrying a word. |
| 12 | Copy pass | Every string uses "we"/"our team". No operator name. No "leverage/robust/seamless/delve". No em-dash in any client-visible string (`npm test` in `oracle/templates` covers the email guard; the portal strings need a manual read). |
| 13 | `npx tsc --noEmit` in `client-portal/` and `npx next build` | Both clean. No literal `{" "}` rendering in any new string (known Next 16 gotcha, and ~12 existing instances are already logged as defects). |

---

## 10. Open questions for Kyle

**Only #1 is needed before Phase 1 starts.** The other two can wait for their phase.

1. **Per-agent or account-level ledger?** My default: **per-agent.** An account-level book merging every agent's leads is the specific step that turns us into the client's system of record, and it's very hard to walk back once clients have organised around it.
2. *(Phase 2)* **Do the redirect clicks count against the monthly interaction quota?** My default: **no**, non-billable, same treatment as onboarding mail. Charging a client for correcting us is the wrong incentive on both sides.
3. *(Phase 3)* **Which connector first?** My default: **HubSpot** — already in `shared/mcp/registry.ts`, Composio-reachable, broadest overlap. Buildout matches the CRE beachhead better but is browser-only via `browse` and unproven, so it should be quoted as its own bet rather than bundled.

---

## 11. Rating

**The idea as Kyle stated it: 5/10.**

| Half of the proposal | Rating | Why |
|---|---|---|
| "The portal should become a dashboard users already recognise" | **8/10** | Correct and underrated. Recognition is free onboarding, and the audit already showed the proof surface is our weakest business link. |
| "A lightweight CRM should be its core" | **3/10** | Attacks the differentiator (who does the work), imports a hard price anchor into a hire-priced product, and hands the client an obligation we forbid our own agents from creating. "Core" is the word that does the damage: as optional depth this would be a 6. |

The reframe — results ledger with CRM grammar, agent-only writes, write-through to the incumbent — keeps roughly 80% of the upside at roughly 30% of the build, with none of the positioning or pricing downside.

---

## Sources

- [CRM for Commercial Real Estate Brokers: 2026 Guide](https://www.nimble.com/blog/9-best-crms-for-commercial-real-estate-brokers/)
- [11 Best CRMs for Commercial Real Estate Brokers in 2026](https://ascendix.com/blog/best-commercial-real-estate-crm)
- [Best Commercial Real Estate CRMs for 2026 — CRE Daily](https://www.credaily.com/reviews/best-commercial-real-estate-crms/)
- [Karbon vs Canopy vs TaxDome: State of Accounting 2026](https://ustechautomations.com/resources/blog/state-of-accounting-automation-comparison-2026)
- [TaxDome vs Karbon vs Canopy for small accounting firms](https://practiq.dev/blog/taxdome-vs-karbon-vs-canopy-small-accounting-firms)
- [CRM Showdown: ServiceTitan vs Housecall Pro vs Jobber](https://pipelineon.com/blog/crm-showdown-home-service/)
- [ServiceTitan vs Housecall Pro vs Jobber: A 3-Way FSM Guide](https://fieldservicesoftware.io/comparisons/housecall-pro-vs-jobber-vs-servicetitan/)
