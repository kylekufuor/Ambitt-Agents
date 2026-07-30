# Portal-as-lightweight-CRM: what "a dashboard they already know" means in our three verticals

Research date: 2026-07-29 · Analyst: Rex · All sources live-fetched, dates noted inline.

---

## Verdict

**4/10 as literally stated ("make the client portal a lightweight CRM"). 8/10 for the
narrower thing the idea is reaching for: a per-vertical "Work + Needs you" surface with a
write-out path into the tool they already pay for.**

The "familiar dashboard" goal is cheap and achievable — the shared mental model across all
three verticals is a **status-tagged list under a "needs attention" strip**, not a kanban
pipeline, and we can adopt its vocabulary for near-zero cost. The "CRM" part is the weak
half: a CRM is a *system of record*, it earns its place by being where the human types, and
our entire promise is that the human doesn't type. Every vertical-AI company that grew in
2026 wrote into the incumbent instead of replacing it; the ones that tried to own the
workflow churned 70–80%.

Constants to build against:

| Thing | Number | Source |
|---|---|---|
| CRE brokers reporting "no need" for a CRM | up to **80%** (n=21, WI) | CARW |
| CRE tools per broker | ~**7** | 2026 DNA of CRE |
| CRE leaders citing disconnected tools + duplicate entry as #1 pain | >**60%** | 2026 DNA of CRE |
| CRE pros who trust AI for deal decisions | **5%** (66% use it weekly+) | DealGround, Apr 2026 |
| Accounting apps per firm | **10** avg, 1-in-3 use 11+ | Intuit, 2026 (n=725) |
| Accounting firms with fully integrated tools | **41%** | Intuit, 2026 |
| ServiceTitan active customers | ~**10,800** (FY2026) | ServiceTitan IR |
| Jobber users / Housecall Pro contractors | **300k+** / **40k+** | vendor |
| AI-SDR annual tool churn | **50–70%** vs 5–10% SaaS norm | UserGems via Harbor BD |
| Composio ServiceTitan / Jobber toolkits | **0** (404). HubSpot=244 tools, QuickBooks=105 | Composio catalog |

---

## 1. What each vertical actually runs today

### (1) Commercial real estate brokers

**The CRM layer is thin and contested.**

- **Buildout** is the consolidator — it absorbed **Apto** and **Rethink** (Apto content now
  redirects to the Buildout homepage), claims **"trusted by over 50,000 brokers"**, and on
  **10 March 2026 launched its own CRM** to complete a "prospect to commission" engine across
  Find & Win → Market → Transact.
  ([Buildout press](https://www.buildout.com/press/buildout-launches-crm-completing-the-industrys-first-ai-powered-end-to-end-deal-engine-for-cre),
  [Ascendix](https://ascendix.com/blog/buildout-crm-alternatives-overview/))
- **AscendixRE** — Salesforce-based, enterprise brokerages (JLL, CBRE, Cresa cited).
  **ClientLook** (LightBox-owned) — smaller teams. **VTS** — landlord / tenant-rep leasing
  lifecycle. ([Ascendix](https://ascendix.com/blog/best-commercial-real-estate-crm),
  [CRE Daily](https://www.credaily.com/reviews/best-commercial-real-estate-crms/))
- **What they actually live in alongside CoStar:** CoStar, LoopNet, MLS, Moody's, Crexi are
  the "widely adopted" tier; CompStak, Placer.ai, ESRI, Cherre, Tableau are
  "high-interest but underutilized."
  ([CARW survey](https://carw.com/what-tools-are-cre-pros-using-carw-data-survey-insights/))
- **Adoption is the story.** In the CARW data survey, **up to 80% of brokers reported "no
  need"** for Salesforce / Apto / ReThink / HubSpot and continue on spreadsheets. *Caveat:
  n=21, Wisconsin, 2025 — small and regional; treat as directional.* A vendor-side estimate
  puts all CRE CRMs combined at **~one third of working brokers**, with the rest "doing it in
  spreadsheets and refusing to feel bad about it."
  ([Station CRM](https://getstationcrm.com/blog/best-crm-replace-excel-cre-brokers))
- **The pain is integration, not absence.** 2026 DNA of CRE (Buildout + theBrokerList, 8th
  annual): brokers run **~7 tools**, **>60% name disconnected tools and duplicate data entry
  as their biggest operational challenge**, **46% of time goes to admin/manual tasks**, and
  **missed follow-ups is the #1 deal-management challenge nationwide.**
  ([Buildout](https://www.buildout.com/blog-posts/why-cre-technology-is-moving-toward-unified-platforms))
- **Trust gap, freshly measured.** DealGround surveyed **255 CRE professionals, 31 Mar – 8 Apr
  2026**: **66% use AI weekly or daily**, but only **5% trust it enough for deal decisions**
  and **53% exclude AI from final decision-making entirely**. Top barriers: 34% don't know
  which tool, 32% accuracy concerns, only 5% cost.
  ([DealGround](https://www.dealground.com/articles/survey-report-high-usage-low-trust))

### (2) Tax professionals / accountants

- **Practice management triumvirate: TaxDome, Karbon, Canopy.** TaxDome's own Accounting
  Industry Index (Apr 2026) is built on operational data from **15,000+ firms** and it claims
  **1.4M users**. ([Morningstar/AccessWire](https://www.morningstar.com/news/accesswire/1154854msn/taxdome-publishes-first-of-its-kind-accounting-industry-index-revealing-client-bases-grew-22-in-2025),
  [TaxDome](https://taxdome.com/accounting-industry-index-q1-2026))
- Underneath sits the real system of record: **QuickBooks / Xero** as the ledger, plus
  Ignition-type proposal tools and Jetpack/Financial Cents in the long tail.
- **Adoption is roughly a third.** One secondary analysis puts practice-management adoption at
  **~38% for firms above $2M revenue** and describes the profession as bifurcated — a third
  automated, the rest "on spreadsheets and ad hoc Slack." *Low confidence, SEO-tier source.*
  ([US Tech Automations](https://ustechautomations.com/resources/blog/karbon-vs-canopy-vs-taxdome-2026))
- **Best-sourced number in this whole brief:** the **Intuit 2026 Accountant Technology Survey
  (725 US accounting/bookkeeping professionals)** — the average firm runs **10 apps**, **1 in 3
  run 11+**, only **41% say their tools are fully integrated**, **manual data cleanup is the #1
  barrier to higher-value advisory work (30%)**, and **app overload is named by 16%**.
  ([Firm of the Future](https://www.firmofthefuture.com/news/accountant-tech-survey-2026/),
  [Insightful Accountant](https://blog.insightfulaccountant.com/intuit-releases-2026-accountant-tech-survey))

### (3) Home services (HVAC / plumbing / roofing)

- **ServiceTitan** — mid-to-large. Exited **FY2026 (year ended 31 Jan 2026) with ~10,800 active
  customers, +14% YoY**, on **$961M revenue, +24%**, past a $1B annualized run rate.
  ([Yahoo/ServiceTitan Q4 call](https://finance.yahoo.com/news/servicetitan-q4-earnings-call-highlights-031828218.html))
- **Jobber** — **300,000+ users across 50+ industries**, the default for growing SMB
  contractors. ([Jobber](https://www.getjobber.com/academy/housecall-pro-competitors/))
- **Housecall Pro** — **40,000+ active contractors** (2024 parent disclosure), residential
  1–10 techs. ([US Tech Automations](https://ustechautomations.com/resources/blog/housecall-pro-review-2026-2026))
- Tail: Workiz, FieldPulse, Service Fusion, ContractorPlus, Field Promax.
  ([IFS](https://www.ifs.com/en/glossary/compare/top-10-field-service-management-software-2026))
- **Everything reconciles to QuickBooks**, and the FSM explicitly claims primacy: Jobber's
  rebuilt QBO integration is **one-way (Jobber → QuickBooks)** with a one-time client/product
  import, and "**after that, Jobber is the source of truth**."
  ([KAJ Analytics](https://home.kaj-analytics.com/guides/jobber-integrations.html))
- **Practitioner grievances are about weight and price, not missing features.** Documented
  complaints: slow support, long onboarding, "**overcomplicated interface**"; a Reddit-sourced
  case of **~$3K → ~$10K/month in Feb 2026**; **5–15% annual increases** compounding to 20–30%
  above year 1 by year 3; termination fees of **$24,000–$39,375** quoted to firms trying to
  leave during failed implementations; and the money quote — "*it's almost like it's too big to
  where my people are scared to dive in and learn, so I end up only getting the bare features
  from it.*"
  ([getonecrew](https://www.getonecrew.com/post/servicetitan-reviews),
  [projul](https://projul.com/blog/servicetitan-pricing-analysis-2026/),
  [myquoteiq](https://myquoteiq.com/servicetitan-pricing/))

---

## 2. The shared mental model — and it is NOT a kanban

I expected kanban. The vendor docs say otherwise. **Two of the three verticals have no kanban
at all.** What all three share is a **queue over a status-tagged list**.

**Home services — pure queue, no funnel.** Jobber's job list filters are
`Today` · `Upcoming` · `Active` · `Late` · `Unscheduled` · `Action Required` ·
`Requires Invoicing` · `Archived`. "Late" = a visit whose date passed uncompleted;
"Action Required" = active but no upcoming visits; "Requires Invoicing" = work done, money not
asked for. ([Jobber Help](https://help.getjobber.com/hc/en-us/articles/39133110680343-Jobs-List-Page-and-Key-Metrics),
[Job Basics](https://help.getjobber.com/hc/en-us/articles/115009379027-Job-Basics))
Housecall Pro's mobile dashboard leads with a **"Needs Attention Queue"** whose only two
qualifying statuses are **Unscheduled** and **Unpaid**; techs advance jobs with
**On My Way → Start → Finish**.
([Housecall Pro Help](https://help.housecallpro.com/en/articles/2981393-open-work-section),
[Job Details](https://help.housecallpro.com/en/articles/1153614-the-job-details-page-overview-with-progress-invoicing-and-appointments))

**Accounting — a hybrid: inbox + five statuses, with kanban for process work.** Karbon's five
primary statuses are **Planned · Ready to Start · In Progress · Waiting · Complete**, with
sub-statuses, the canonical example being **"Waiting on client."** Its home surfaces are
**Triage** (an inbox) and a **To-do list** filtered by status.
([Karbon Help](https://help.karbonhq.com/en/articles/11586003-set-up-your-workflow),
[Karbon dashboards](https://karbonhq.com/resources/karbon-work-dashboards/))
TaxDome is the one true kanban: pipelines are "**designed to look like a kanban board, with
jobs displayed on cards that move from stage to stage**," and the default tax-return stages are
**send engagement letter → collect documents → prepare return → review → deliver**.
([TaxDome Help](https://help.taxdome.com/article/1826-pipelines-overview),
[pipelines setup](https://help.taxdome.com/article/106-pipelines-create-setup))

**CRE — a funnel, expressed as a list.** Stage vocabulary in use:
**prospect identification → outreach initiated → owner responded → preliminary analysis → LOI
submitted → under contract → due diligence → closing**; the compressed residential-adjacent
version is **New Lead → Contacting → Qualified → Showing → Offer Made → Under Contract →
Closed**. ([Occupier](https://www.occupier.com/blog/commercial-real-estate-pipeline-management-tips-for-deal-success/),
[Nimble](https://www.nimble.com/blog/examples-of-sales-pipeline-stages-in-the-crm/))

### The instantly-recognisable intersection

Anyone from any of the three verticals would read this layout without a tooltip:

```
┌ NEEDS YOU (3) ─────────────────────────────────────────────┐  ← the universal element
│  · Waiting on you since Tue — approve outreach to 4 owners │
└────────────────────────────────────────────────────────────┘

WHO                  WHAT              STATUS            VALUE     NEXT STEP        LAST
Northgate Plaza      Listing pitch     Waiting on them   $4.2M     Follow up Aug 3  Jul 26
Cardoza HVAC         Q2 return         Waiting on client  $1,850   Chase 1099s      Jul 24
```

- **Row entity is named after the money, never after the database.** "Deal" (CRE), "Job" (home
  services), "Job"/"Return"/"Work item" (tax). Never "Opportunity", never "Record", never
  "Lead" outside CRE.
- **Six columns, universal:** Who · What · Status · Value · Next step + due date · Last
  activity. (Owner as a 7th only for multi-seat.)
- **Three status buckets are the true lingua franca:** **Waiting on us / Waiting on them /
  Done.** The single phrase that appears verbatim in more than one vendor's docs is
  **"Waiting on client."**
- **A "needs attention" count at the top is the one element present in every vendor's default
  view** — Housecall Pro's Needs Attention Queue, Jobber's Action Required + Late, Karbon's
  Triage, TaxDome's stuck-in-stage jobs.
- **"Value" means three different things** — CRE: one large number per deal. Home services:
  many small, plus paid/unpaid. Tax: recurring engagement fee. So the column must be
  per-vertical-labelled, not a single hardcoded "Deal value."

---

## 3. The actual failure mode of "another CRM"

**Headline CRM failure statistics (use with care — these come from aggregator/statistics-roundup
sites that recycle each other; directional only, not primary):** CRM failure rates ~**30% in
2026** (down from ~50% a decade ago), with the wider literature spanning **20–70%**; **SMB
deployments fail at 22% vs 38% enterprise**; root causes **poor user adoption 43%**, **bad data
quality 34%**, **insufficient training 22%**; **43% of businesses use fewer than half the
features**; **76% of CRM users say less than half their CRM data is accurate**; **32% of reps
spend >1hr/day on manual entry**.
([Axis Intelligence](https://axis-intelligence.com/crm-statistics/),
[Searchlab](https://searchlab.nl/en/statistics/crm-statistics-2026),
[Demandsage](https://www.demandsage.com/crm-statistics/))

**The vertical-specific, better-sourced version of the same failure is more useful:** it is not
that the CRM is bad, it is that **nobody keeps it current, and the cost of keeping it current is
the complaint.** >60% of CRE brokerage leaders name duplicate entry as their top operational
problem; only 41% of accounting firms have integrated tools and 30% name manual data cleanup as
what blocks advisory work; Buildout's own CEO framed it as "**the real pain isn't a lack of
software, it's overlap and disconnect**."

**Client-portal adoption specifically:** accounting firms and service providers typically see
**35–50% portal adoption, plateauing by month 4**, with automated engagement workflows claimed
to push it to 70–82% by month 3. *Low confidence — vendor-adjacent SEO source, no methodology.*
([US Tech Automations](https://ustechautomations.com/resources/blog/accounting-client-portal-automation-2026))

**The AI-specific abandonment numbers are the ones that should worry us:**

- **Gartner, 25 Jun 2025: over 40% of agentic AI projects will be canceled by end of 2027** —
  escalating costs, unclear business value, inadequate risk controls. Gartner also estimates
  only **~130 of the thousands of self-described agentic vendors are real**.
  ([Gartner](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027))
- **AI SDR tools churn at 50–70% annually vs 5–10% for typical SaaS — roughly 10× faster.**
  ([Harbor BD](https://www.harborbd.com/blogs/ai-sdr-outbound-results-2026))
- **11x**: TechCrunch's Mar 2025 exposé, then sourced reporting of **70–80% churn on ~$14M
  reported ARR**, with only ~$3M surviving past the 90-day break clause — **~75% churn inside 3
  months**. **Artisan** ("stop hiring humans" billboards): gross retention estimated **below
  60%**. ([VA Horizon](https://www.vahorizon.site/b2b/blog/what-the-11x-story-means-for-buyers/),
  [TechCrunch on inflated ARR](https://techcrunch.com/2026/05/22/how-vcs-and-founders-use-inflated-arr-to-kingmake-ai-startups/))
- The stated consensus from that wreckage: "**vendors with staying power built human oversight
  into their products and sold augmentation rather than replacement.**" That is our positioning
  already ([[project_distribution_gtm]] — "supervised, never autonomous").

**One failure mode inverts in our favour, and one inverts against us.** In our favour: an
agent-written pipeline *cannot go stale*, which kills the 43%-poor-adoption / 34%-bad-data
mechanism outright. Against us: it can go **wrong**, and a wrong stage is worse than a blank
one, because "an AI agent writing to your CRM is **editing a ledger, not just a database**" and
the real question is "what happens to the eleven downstream processes that read that stage the
moment the agent is wrong."
([CET Digit](https://www.cetdigit.com/blog/what-is-the-difference-between-crm-system-of-record-and-the-system-of-action),
[GaaS](https://gaas.co.com/vs-saas/the-system-of-record-vs-system-of-action/))

---

## 4. Prior art: "agent does the work, thin surface shows the output"

**It exists, it works, and in all three of our verticals the winners chose write-into-the-incumbent
over build-your-own-CRM.**

| Who | Vertical | Positioning | Outcome |
|---|---|---|---|
| **Avoca** | home services | AI front office; answers calls, works leads, "**books directly into ServiceTitan**" | Reported **unicorn valuation 2026**; company claim (27 Apr) of being **on track to book $1B of jobs in 2026**; KP / Meritech / General Catalyst / YC |
| **Sameday** | home services | AI voice booking **into ServiceTitan, Housecall Pro, Jobber, FieldRoutes, Service Fusion** | Named as Avoca's primary competitor; listed on the ServiceTitan marketplace |
| **Basis** | accounting | Agents that "onboard engagements, learn, reason and take action," **integrating with existing accounting software and file systems, supporting financial processes without replacing current systems** | **$100M raise, Feb 2026**; claims 20–50% practice efficiency |
| **Truewind** | accounting | "AI digital staff accountant," integrates **QBO + Sage Intacct**; "**not replacing your accountant**" | $17M; QBO/Intacct-native |
| **DealGround** | CRE | Deliberately **no destination app** — surfaces deal intelligence "**directly inside the AI assistants they already use, including Claude and ChatGPT**," "without switching between tools" | Ran the 255-person trust survey above |

Sources: [Avoca on ServiceTitan marketplace](https://marketplace.servicetitan.com/partner/Avoca-AI),
[Avoca unicorn](https://enterprisedna.co/resources/news/avoca-voice-ai-trades-unicorn-2026/),
[Revin comparison incl. Sameday](https://revin.ai/blog/best-ai-voice-agents-for-home-services-compared),
[Basis $100M](https://www.cpapracticeadvisor.com/2026/02/24/basis-raises-100-million-to-deploy-ai-agents-for-accounting-firms/178759/),
[Truewind](https://belitsoft.com/truewind-ai-case-study-finance-accounting),
[DealGround](https://www.dealground.com/articles/survey-report-high-usage-low-trust).

Note what all of these still have: a **thin review surface** (call transcripts, QA scoring,
close checklists) sitting *beside* the incumbent record. Nobody's review surface claims to be
the CRM.

**The opposing camp — AI-native CRMs that DO build the destination — is real but not our fight:**

- **Attio** — **$141M raised** incl. a $52M Series B from GV; **5,000 customers**, 4× ARR
  growth; credited with defining the category.
- **Day.ai** — **$20M Series A led by Sequoia, Feb 2026**; founder Christopher O'Donnell,
  ex-HubSpot decade; spent 18 months building "**the Cursor of CRM**"; calls the category
  **"CRMx"** where x = context.
- **Clarify** — "autonomous AI CRM with ambient intelligence": auto-enrichment, self-updating
  deals; claims **80% reduction in administrative work**.
  ([Automation Consulting](https://www.automationconsultingservices.org/blog/attio-vs-clarify),
  [Clarify](https://www.clarify.ai/blog/best-ai-crms))

Two facts about that camp matter for us: they are **horizontal, sold to startups and tech
teams — not to HVAC owners or CPA firms** — and they are **capitalised specifically to win the
system-of-record fight**, which is a fight we are not funded to win.

**And the incumbents closed the door during 2026:** Buildout shipped its own CRM on 10 Mar 2026
explicitly to end "overlap and disconnect"; **Salesforce Agentforce reached 18,500 customers
and 3B+ monthly workflows in early 2026**; **HubSpot passed 299,458 customers / $3.45B ARR in
Q1 2026** and moved Breeze to outcome-based pricing. So the "thin CRM parked next to your CRM"
slot is being squeezed from both directions at once. *(Those Agentforce/Breeze figures are
vendor marketing — the customer-outcome claims attached to them, e.g. "750 hours/week saved,"
are unaudited vendor case studies and should not be repeated as evidence.)*
([Resonate on HubSpot](https://www.resonatehq.com/blog/hubspot-market-share),
[Vantage Point](https://vantagepoint.io/blog/sf/hubspot-vs-salesforce-ai-agent-ready-2026-comparison))

**Verdict on prior art:** the integrate-don't-replace camp raised more, churned less, and
produced concrete throughput numbers. The replace-the-workflow camp produced the 70–80% churn
stories. That is the single clearest signal in this brief.

---

## 5. New place to look, or push it into what they already pay for?

### Evidence for PUSH (strong)

1. Every 2026 vertical-AI winner writes into the incumbent (table above).
2. The incumbents assert primacy in their own docs: "**after that, Jobber is the source of
   truth.**"
3. **61% of SMBs prefer a single platform over separate tools.**
   ([Searchlab](https://searchlab.nl/en/statistics/crm-statistics-2026))
4. The #1 stated pain in our lead vertical is duplicate entry across ~7 tools (>60% of CRE
   leaders). **Shipping an 8th surface is directly adverse to the stated pain.**
5. Integration *is* the buying criterion. Brokers' framing: if a tool "doesn't talk to email
   (Gmail/Outlook), calendar, listing data and document storage, the broker is back to
   copy-paste, which is **just Excel with extra steps**."
   ([Station CRM](https://getstationcrm.com/blog/best-crm-replace-excel-cre-brokers))

### Evidence for a NEW SURFACE (weaker on volume, stronger on our specific buyer)

1. **There is frequently no incumbent to push into.** Up to **80% of CRE brokers say they have
   no need for a CRM**; combined CRE CRM penetration is ~⅓ of working brokers; roughly **⅔ of
   accounting firms** have no practice-management platform. For those buyers we are not the 8th
   tool, we are the 1st.
2. **The trust gap requires a review surface that a CRM field cannot provide.** 5% of CRE pros
   trust AI for deal decisions; 53% exclude it from final decisions. You cannot deliver
   "approve this outreach" into a stage picklist. The approval-design literature says the
   approval UI should be **email, Slack, or a purpose-built panel**, that it must show
   "**source evidence, expected result, and downside if wrong**" rather than raw logs, and
   explicitly that you should **reuse your existing observability rather than create a second
   shadow system**.
   ([Digital Thought Disruption](https://digitalthoughtdisruption.com/2026/07/12/human-in-the-loop-ai-agent-approval-paths/),
   [Waxell](https://waxell.ai/blog/ai-agent-approval-workflows))
3. **Writing into their record is the genuinely risky direction** — the ledger problem above.
4. **Push is expensive and gated for exactly the platforms we'd need.** ServiceTitan requires a
   **written developer/partner agreement**, gives third parties an **Integration environment
   only**, and runs a **certification review of functionality, security and data transparency**
   with **public-app approvals batched roughly weekly**.
   ([ServiceTitan dev portal](https://developer.servicetitan.io/docs/get-going-getting-access/),
   [App Marketplace Program Guide](https://www.servicetitan.com/legal/app-marketplace-program-guide))
   And our tool layer doesn't cover them: **Composio has no ServiceTitan toolkit and no Jobber
   toolkit** (both `composio.dev/toolkits/{servicetitan,jobber}` return HTTP 404 as of
   2026-07-29), while **HubSpot (244 tools, OAuth2/API key)** and **QuickBooks (105 tools,
   OAuth2)** are fully supported. Also documented: Jobber, Housecall Pro and ServiceTitan have
   **no native HubSpot integration — Zapier only**.
   ([Contractor ToolStack](https://contractortoolstack.com/software/hubspot/))

### Synthesis

They want **two different things and only one of them is ours to build**:

- **Output** where they already work — inbox, their FSM, their ledger, their spreadsheet.
- **Proof and approvals** in one thin place that belongs to us, because that's where trust is
  manufactured and renewal is decided.

"Lightweight CRM" accidentally merges those two, and the merge is what makes it a 4/10.

---

## 6. What this means in our codebase

- **`client-portal/src/app/agents/[id]/leads/page.tsx`** already ships a status taxonomy:
  `new · contacted · replied · qualified · won · lost · archived`, with `pill-blue/amber/
  emerald/muted` and a `fmtUsd` that abbreviates to `$4.2M` / `$185k`. That is a **generic B2B
  sales funnel** — a decent fit for CRE, wrong for home services (which needs
  `Unscheduled · Scheduled · Today · Late · Requires invoicing · Paid`) and wrong for tax
  (which needs `Not started · Waiting on client · In progress · In review · Filed`). The
  cheapest correct change is a **per-vertical status preset keyed off the existing
  `Agent.resultsLabel`** rather than one hardcoded funnel — same table, three vocabularies.
- **Parker's IA plan already is the right answer** ([[project_portal_dashboard_audit]]):
  `Activity → Work` as the default agent page, `Leads → Results` with a per-agent label, and a
  badge-driven **"Needs you"** top-level. Independent vendor docs converge on exactly that
  shape (Housecall Pro's Needs Attention Queue, Jobber's Action Required, Karbon's Triage).
  **Ship that and skip the CRM claim** — it buys the whole "familiar dashboard" benefit at a
  fraction of the scope.
- **Write-out path, cheapest first:** `generate_csv` is already a built-in platform tool, so
  **CSV-by-email is a same-day v1** and it lands squarely on the Excel-based majority of CRE
  brokers. Then Google Sheets (Composio), then HubSpot/QuickBooks (Composio, 244/105 tools).
  **ServiceTitan and Jobber are bespoke builds behind a partner agreement — price them as
  such, and don't promise them in a sales call.**
- **The value column must be THEIR pipeline value, never our cost** — Kyle's standing portal
  decision (work-delivered counts, no dollar figure of ours anywhere near their invoice).
- **Design constraints hold:** table rows separate on `--border` hairlines, never card
  outlines; status pills already exist in the portal's system; empty states get the same craft
  as the happy path (`client-portal/DESIGN.md`).
- **Do not let the agent write a stage into a client's system of record without an approval
  step.** We already have the machinery — `request_approval`, supervised mode, dry-run,
  outbound seatbelts ([[project_control_plane_redesign]], [[project_autonomy_modes]]) — so
  the write-out should route through it rather than around it.

---

## 7. Rating

### 4/10 for "make the Ambitt client portal a lightweight CRM"

Because the CRM half is the weak half. A CRM is a system of record; it earns its keep by being
where the human types, and our entire product promise is that the human doesn't type. The
demand signal points the other way — >60% of CRE leaders and 59% of accounting firms are
complaining about *too many disconnected surfaces*, the 2026 winners in all three verticals
wrote into the incumbent, and the ones who tried to own the workflow churned 70–80% inside a
quarter. Meanwhile Buildout, Salesforce and HubSpot are pointing far more capital at the record
layer than we can. And the *good* part of the idea — vocabulary and layout users recognise
instantly — is available for almost nothing, because the shared model turns out to be a
status-tagged list under a "Needs you" strip, which is roughly what Parker already specced.

### 8/10 for the narrower version

A **per-vertical "Work + Results + Needs you" surface** whose rows are agent-written, whose
vocabulary is borrowed verbatim from the vertical's own tool, whose top strip is approvals, and
whose export button pushes into the client's real system of record. Same screens, different
claim, and it's on the winning side of every piece of 2026 evidence in this brief.

### The strongest argument against my own rating

**CRE — the vertical Kyle chose to lead with — is precisely the one where up to 80% of brokers
report having no CRM at all.**

If that holds for our actual buyers, my central objection ("you'd be the 8th tool") is a fake
objection: we'd be the 1st, and the two-thirds-to-four-fifths of brokers running a spreadsheet
are exactly the people for whom **a pipeline that stays current without them touching it is a
step up, not a step sideways**. The failure mode I quantified — 43% poor adoption, 34% bad
data, 32% of reps losing an hour a day to entry — is a failure mode of *human-maintained* CRMs,
and it structurally cannot happen to ours. On that reading the ceiling isn't 4/10, it's 8–9/10,
and the reason my number is low is a sampling error I should own: **I weighted a duplicate-entry
statistic collected from brokerage *leaders* (who own systems, and whose pain is reconciling
them) over the solo and small-team brokers who are actually our buyers (who own nothing, and
whose pain is that nothing exists).** The 80%-no-CRM figure also rests on n=21 in one state, so
neither side of this is settled by the data I found.

**The one question that settles it, cheaply:** ask Casey Litsey what he opens today to see his
pipeline. If the answer is a spreadsheet or his own head, raise the rating and build the thing.
If the answer names a product, build the export instead.
