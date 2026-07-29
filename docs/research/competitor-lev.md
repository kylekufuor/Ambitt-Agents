# Competitor teardown — Lev (lev.com)

**Researched:** 2026-07-28 · **Analyst:** Rex · **For:** Kyle (CEO), CTO
**Framing per Kyle:** take *patterns and approaches* — structure, use-case framing, IA, proof strategy. **Not** copy, assets, or a design clone.

---

## 0. Verdict (read this first)

Lev is the most direct competitor we've found, but **they are not selling what we sell**. Lev sells *software a CRE firm operates itself* — 35 product pages, a credit meter, a free tier, an API/MCP/CLI. We sell *a hired worker that does the job and mails you the result*.

The single most valuable finding is from a third-party review, not from Lev: CRE Daily's "should avoid if" line says avoid Lev if **"you prefer outsourced financing services or lack bandwidth to manage the self-serve platform"** and that it's "not ideal for less tech-savvy users." ([CRE Daily, updated 2025-11-24](https://www.credaily.com/reviews/lev-review/)) That describes our ICP exactly. Lev's disqualified prospect is our qualified one.

What we should actually take: **their information architecture and their per-product page template.** What we should not take: their vocabulary, their naming system, their headline, or their credit-metering pricing.

---

## 1. Who they are & how they position

**One-line:** a CRE-native AI/software platform for capital-markets and deal teams — CRM + pipeline + data room + lender data + AI agents + an API.

**Exact headline (H1):**
> "Helping commercial real estate professionals become superhuman"

**Subhead:**
> "Lev builds apps, agents and data on a unified platform to help commercial real estate companies grow."

**Recurring CTA band (appears on nearly every page):** "Unlock professional-class AI for your firm"

### History — they pivoted, hard
- Founded 2019 as a **CRE debt brokerage/marketplace**. Raised ~$200M across 5 rounds incl. a $70M Series B (Parker89, Cross River Digital Ventures) plus $100M debt facility. ([AlleyWatch, 2022](https://www.alleywatch.com/2022/05/lev-commercial-real-estate-financing-platform-digital-lending-marketplace-yaakov-zar/))
- Was on track for **$2B in loan originations in 2022** when rate hikes killed the market.
- **Shut the brokerage down** and turned their internal CRM into the product. Zar's own LinkedIn post (≈Nov 2025, 152 reactions): *"We were a software people pretending to be brokers… We shifted the entire business. Walked away from what was comfortable, to build what was right."* ([LinkedIn](https://www.linkedin.com/posts/yjzar_we-made-the-hardest-decision-of-my-career-activity-7399501877241094144-bSsa))
- Analyst framing of the pivot as Slack/Shopify-style internal-tool monetization: [Thesis Driven deep dive](https://www.thesisdriven.com/letters/deep-dive-lev/)

**Strategic read:** Lev *tried* done-for-you (brokerage) and quit it because the economics broke in a bad market. They concluded software is the durable business. We are betting the opposite — that done-for-you is the durable business when the "labor" is an agent, not a salaried broker. Worth understanding this is a considered position, not an oversight.

### Their exact AI vocabulary

| They say | They notably **avoid** |
|---|---|
| "agents", "AI agents", "Lev Agent" | "autonomous" — never used in marketing copy |
| "source-backed answers" / "cite sources" | "copilot" |
| "approval gate", "writes stay gated", "needs confirmation" | "replaces your team" |
| "governed", "traceable", "inspectable" | "hands-free" |
| "agent clients", "production agent", "operating patterns" | |
| "148 capabilities across 20 domains" | |

**Key line to internalize** — their Lev Agent page:
> "Keep humans in control of sends, updates, and external work while reducing manual setup."

And Lev Cortex:
> "Every capability an agent can call is classified by access — read, write, or needs confirmation."

**This is our supervised-mode positioning, already in market, from a funded competitor.** That's validation, not a threat — it means the "human-approved agent" frame is the category-accepted safe posture. It also means "supervised" alone is *not* a differentiator anymore; the differentiator has to be *who does the work*, not *who approves it*.

Their anti-chatbot wedge (from `/commercial-real-estate-ai`):
> "CRE teams do not need generic chat layered on top of broken workflows."

---

## 2. USE-CASE PRESENTATION (highest priority)

This is where Lev is genuinely excellent and where the transferable lessons live.

### 2.1 The macro structure: a four-bucket "product system"

`/products` is not a feature list. It's a **catalog split into four named layers**, 35 items total, each with a dedicated page:

| Layer | Count | What it means | Examples |
|---|---|---|---|
| **Apps** | 12 | Things you open and use | Lev CRM, Pipeline, Vault, Agent, Checklist, Memo, Index, Inbox, Cortex, Campaigns, Commissions, Match |
| **Agents** | 11 | Things that do a job for you | Lender Outreach, Term Sheet Extractor, Document Extractor, Checklist Creator, Underwriting, Origination, Market Expert, Sales Comps, Investment Sales OM Creator, Debt Financing OM Creator, Credit Memo Creator |
| **Data** | 6 | Proprietary data assets | Lender Search, Lender Contact Routing, Lender Profiles, Lead Sourcing, Lender Pulse, Recent Market Terms |
| **Platform** | 6 | Build-on-it surfaces | Lev MCP, Lev API, Lev CLI, Integrations, Lev in Claude, Lev in ChatGPT |

**Why this works:** a buyer self-selects their layer in one glance. A broker goes to Apps, an ops lead goes to Agents, a CTO goes to Platform. No persona toggle needed — the taxonomy *is* the segmentation.

**The copy formula is rigidly consistent — every one of the 35 is a verb-first sentence fragment naming the artifact produced:**
- "Draft, sequence, and manage lender outreach using source-backed deal context."
- "Normalize term sheets into comparable economics, sources, and review exceptions."
- "Turn rent rolls, statements, comps, and assumptions into review-ready underwriting."
- "Build a sales comp set from a property type and address, with full detail and a clear read."

Note what's absent: no adjectives, no "powerful", no "seamless". Every line is **input → transformation → output.**

### 2.2 The micro structure: the per-agent page template

Dissected from `/products/lender-outreach-agent`. This is the highest-value pattern in the whole teardown:

1. **Hero** — product name as H1 (plain, no cleverness) + one verb-first sentence naming the full span of the job: *"Draft, sequence, and manage lender outreach with source-backed deal context, from lender lists to reply follow-up and send approvals."*
2. **Three sequential steps, each a full-width section with real product UI:**
   - *Prepare the list* — a filterable lender table showing "128 total companies, 14 match filters", columns Company / Deals / Last contact / Latest note. Two labelled sub-capabilities: "Fit context", "Warm paths".
   - *Draft the outreach* — an actual email composer with a **real, specific draft** ("$2.37M loan amount, 70% LTV"). Sub-capabilities: "Tailored language", "Approval before send".
   - *Summarize replies* — a reply table → next actions. Sub-capabilities: "Reply intelligence", "Next action".
3. **Three-statement outcome summary** in passive, declarative voice: *"Lender lists are prepared." / "Drafts are controlled." / "Replies become next steps."*
4. **Docs deep-links** — "Launching a deal", "Adding lenders to a deal", "Lender search guide". Ties marketing to real documentation, which reads as proof the thing exists.
5. **Three related-product cards** — internal-link mesh across the 35 pages.
6. **CTA band** — "Start for free" / "Book a demo".

**The three transferable mechanics:**
- **Step-per-section, not feature-grid.** One page = one job = three steps in the order the human experiences them.
- **Specific fake data beats generic fake data.** "$2.37M loan amount, 70% LTV" is far more convincing than "Property A". Vague placeholder data signals vaporware.
- **Named micro-capabilities under each step** ("Warm paths", "Approval before send") give sales-engineering detail without a spec sheet.

### 2.3 Ordering across the site

Their sequence is consistently: **fragmentation problem → unified entity model → mapped products → buying criteria → objections → CTA.** From `/commercial-real-estate-software`:

1. "The CRE software stack for modern deal teams"
2. "A CRE system should know the work, not just the contacts"
3. "Lev products mapped to the CRE software stack"
4. "Buying criteria for CRE software"
5. "Questions about commercial real estate software"
6. "Run your CRE deals on one operating system"

Opening pain line: *"Most commercial real estate teams have a CRM, folders, email, spreadsheets, and point tools. The problem is that the work spans all of them."*

**Pattern worth stealing: the "buying criteria" section.** They publish a 5-point evaluation framework for the category — conveniently one Lev wins on. It reframes the page from pitch to buyer's guide, which converts better and earns links. Their `/commercial-real-estate-ai` version:
> Read deal documents and cite sources · Access live CRM/pipeline/lender/market data · Draft work product fitting CRE workflows · Route actions through permissions and approvals · Update system of record after approval

### 2.4 What they conspicuously do NOT do
- **No role-based segmentation.** No broker/lender/investor toggle anywhere. The product taxonomy does that job.
- **No before/after sliders, no workflow diagrams** on the positioning pages.
- **No video hero.** Static product UI stills carry the demo load.
- **No interactive sandbox.** The free tier *is* the demo.

---

## 3. Design teardown

**Confidence flag:** I could not verify typefaces or hex values — the site is JS-rendered and my fetch tool returns markdown, stripping CSS, and no third-party design writeup of lev.com exists. **Treat the typography/color notes below as inference, not fact. Someone should open DevTools before we act on any of it.** Everything about *structure* below is directly evidenced from the fetched content.

### Verified structure
- **Nav:** Products · Platform · Stories · Enterprise · Pricing · Blog · About · Docs — 8 items, flat, no mega-menu labels like "Solutions". Product-led, not solution-led.
- **Persistent promo banner** above the nav: *"Get 3,000 credits and unlimited Lev Agent through August"* — a dated, expiring offer used as a urgency strip.
- **Dual CTA in header, always:** "Start for free" (primary) + "Book a demo" (secondary).
- **Section treatment:** alternating full-width bands, each pairing a copy column against a **product-UI panel** (tables, email composers, reply grids). The UI panel *is* the imagery — no stock photography, no abstract 3D, no illustration in the product pages.
- **Card treatment:** the 35-item catalog is a uniform card grid — icon/name + one-line verb-first descriptor. Related-products appear as 3-up cards at page bottom.
- **Repeating CTA band** with a fixed line ("Unlock professional-class AI for your firm") closing every page.
- **About page** is described as leaning on **imagery/team photos** rather than copy — the only place photography appears.

### Inferred (unverified)
- Modern geometric/neo-grotesque sans, most likely Inter-class. Sentence-case headlines, tight tracking.
- Restrained near-monochrome palette with a single accent — typical of 2025-26 B2B infra sites. **Do not copy a palette we haven't measured.**
- Motion: likely light scroll-reveal on the UI panels. Unverified.

### Overall vibe
"Serious infrastructure for professionals." It reads closer to Linear/Vercel/Ramp than to proptech. The tell: they publish a CLI and an MCP server and put "Docs" in the primary nav. They are courting the buyer who respects engineering, and they've priced the *emotional* register at "your firm is sophisticated."

---

## 4. Proof & trust strategy

**This is their strongest layer and our weakest.**

| Asset | What they have | Credibility |
|---|---|---|
| **Customer logos** | Matthews, Time Equities, Greystone, MAG Capital Partners, B6 Real Estate Advisors, Blackbear Capital Partners | High — real, recognizable CRE names |
| **Investor logos** | JLL Spark, Citi, Capital One, StepStone, First American, Dwight Capital, NFX, Canaan, Cross River, Ludlow | High — used as a *second* trust row on `/enterprise` |
| **Customer stories** | **8 full case studies** at `/customer-stories/` — Talonvest Capital, Essex Capital Markets, JBA Equities, Legacy25 Capital, Greenleaf Management, MH Estates Capital Partners | High — named firms, named people, titles |
| **Traction** | "over 100 teams nationwide" taking "over $3 billion of transactions to market through the platform every month" | Medium — self-reported, but specific and falsifiable |
| **Funding** | "$110M+ raised" on /about (vs ~$200M total incl. debt reported elsewhere) | Verifiable |
| **Security** | SOC 2 Type II, pentest Q2 2025, AES-256, no model training on customer data, USA data residency, Trust Center in docs | High — dated and specific |

### The case-study template (worth copying wholesale as a structure)
From Talonvest Capital:
1. **About** — one sentence + category + *products used*
2. **Challenge**
3. **Solution**
4. **Results**
5. **"What we hear from the market"** — an FAQ that answers *objections*, not questions
6. **Impact summary** — three numbered takeaways
7. **More customer stories**

Headline formula: `{Customer} {verb}s {outcome} with {mechanism} on Lev`
> "Talonvest Capital scales lender outreach with ranked matches and one-click launches on Lev"

Quote with full attribution:
> "Lev gives our team the opportunity to ensure no lender is left uncovered. Through their comprehensive lender database, we can expand our relationships for each transaction with lenders most likely to say yes."
> — Kim Bishop, Executive Director — Capital Markets, Talonvest Capital

**Note the honesty tell:** the "results" they cite are *capability* metrics (7,000+ lenders matched, 60,000+ contacts) not *outcome* metrics (deals closed, hours saved, revenue). They are careful not to claim ROI they can't prove. That's a defensible move we should copy — and it means their proof is thinner than it looks. Their "95% extraction accuracy" and "60% due-diligence reduction" numbers appear only in **third-party aggregator copy**, not on lev.com itself.

### Security copy voice
Section heading: **"Like Fort Knox."** Body: *"We never own, lease, train with, export, or do jumping jacks with your data."* — one deliberate joke inside an otherwise dry compliance section. Effective; do not copy the line.

---

## 5. CTA & funnel

**Self-serve first, sales-led for enterprise. Both doors open on every page.**

- **Primary CTA:** "Start for free" — free signup with credits, explicitly "no sales call required" (stated on their comparison page).
- **Secondary CTA:** "Book a demo" → `/schedule`.
- **Enterprise CTA:** "Talk to sales".
- **Gated:** essentially nothing. Docs are public. Pricing is public. Product pages are public. The *product* is the gate — you need an account to do work.
- **Promo lever:** time-boxed credit grant in the top banner ("3,000 credits and unlimited Lev Agent through August").

### Pricing (public, `/pricing`) — annual billing, 20% off monthly

| Tier | Annual-billed | Monthly-billed | Credits/mo | $/credit |
|---|---|---|---|---|
| **Lev Core** | $80/mo | $100/mo | 2,500 | $0.032 |
| **Lev Select** | $200/mo | $250/mo | 8,500 | $0.024 |
| **Lev Pro** | $400/mo | $500/mo | ~25,000 *(derived from $0.016/credit; page render was ambiguous)* | $0.016 |
| **Enterprise** | Custom | — | Volume pricing + annual rollover | — |

All tiers include: "All platform features", **"Unlimited Lev Agent"**, "Shared credit pool", "Full data privacy", "Monthly credit rollover".

**Credits are translated into work units, not tokens** — this is the smartest thing on the page:

| Row | Core | Select | Pro |
|---|---|---|---|
| AI lender searches | Up to 1 | Up to 4 | Up to 12 |
| Offering Memos | About 5 | About 17 | About 50 |
| Marketing Status Reports | Up to 3 | Up to 13 | Up to 38 |
| Contact enrichments | Up to 312 | Up to 1,062 | Up to 3,125 |

Note "**About** 5 offering memos" — hedged language that keeps a usage meter honest without over-promising.

**Major strategic signal:** CRE Daily (Nov 2025) reports Lev pricing "starting at $12,000 annually." Today's entry tier is **$960/year**. Lev has moved *hard* down-market in the last ~8 months — from a $12k enterprise minimum to a self-serve $80/mo with a free tier. They are buying logo count and PLG motion. Expect them to keep pushing down.

### Comparison-page play
They run `/compare/stacksource-alternative` — headline **"The financing workflow, without the marketplace."** Tone is neutral-educational, not attack-ad. They note StackSource "was acquired by Max Benjamin Partners in April 2024 after a funding crunch," frame marketplaces as "fragile" vs their "durable" software, and use a 5-row comparison table (Model / Lender discovery / Deal packaging / Beyond financing / Getting started). The rhetorical move — *"the lesson most former marketplace users take away"* — puts the argument in the customer's mouth rather than theirs.

### Content engine
**170 blog posts.** Mix: geo-targeted lender guides (TX/CA/FL/NY), CRE term glossaries (DSCR, debt yield, capital stack, estoppel), templates/checklists ("The Complete Commercial Loan Package: Checklist and Template"), and original data under the brand **"Lev Insights"** (e.g., "Western Region Retail Permanent Loans ($1M–$10M): Fixed Rates Typically 6.37%").

Plus a full public docs site (`/docs`) with four sections — **Start / Learn / Build / Grow** — including a "video-led onboarding syllabus" of fifteen sequential flows, and copy that explicitly names **"AI agents" as a primary audience** of the docs.

**Total indexed surface: ~215 pages** (1 home + 10 core + 35 products + 8 stories + 170 blog + 1 compare), plus docs.

---

## 6. Head-to-head vs us

### Where Lev is stronger

1. **Surface area.** ~215 marketing pages vs our single-page site. Every one of their 35 products is an SEO landing page and a sales-call artifact.
2. **Named proof.** 8 case studies with named firms and titled executives, plus 6 recognizable client logos. We have zero public named customers.
3. **Proprietary data moat.** 7,000+ lenders, 60,000+ contacts, CompStak integration, "Recent Market Terms". We have no proprietary dataset — we're an orchestration layer over the client's own tools. In CRE specifically, data is the moat.
4. **Price of entry.** $80/mo self-serve with a free tier vs our $499 entry + setup fee. A curious broker can try Lev tonight for free.
5. **Trust apparatus.** SOC 2 Type II, dated pentest, Trust Center, public docs.
6. **Governance product.** Lev Cortex is a *shipped, marketed* version of what our control plane and safety-sensitivity work does internally — they've made governance a sellable surface. Ours is admin-only and invisible to prospects.
7. **They are live.** `ambitt.agency` did not resolve during this research (DNS `ENOTFOUND`) — consistent with the known apex issue in memory. Our competitor has a docs site; our apex is down.

### Where we're genuinely differentiated

1. **We do the work; they give you tools to do the work.** Lev's own disqualification criterion — *"should avoid if you prefer outsourced financing services or lack bandwidth to manage the self-serve platform"* — is our entire value proposition. Lev abandoned done-for-you because human brokers don't scale. Agents change that math.
2. **No dashboard.** Lev's product *is* a dashboard (12 apps). Our client never logs in — output arrives by email and SMS. For a 55-year-old broker who lives in Outlook and a phone, that is a categorically different buying decision.
3. **Works in the client's own tools.** Lev asks you to migrate onto Lev CRM / Lev Vault / Lev Inbox — a rip-and-replace. We connect Composio to the HubSpot/Gmail/QuickBooks they already have. "Zero migration" is a strong counter to a 12-app suite.
4. **Named agents with a persona.** Lev's agents are functional nouns ("Term Sheet Extractor Agent"). Ours are Nadia, Francis, Reed, Wren, Otto — with an email address, a voice, and memory. That's a hiring decision, not a subscription. Lev cannot easily copy this without contradicting their "software you run" positioning.
5. **Our use-case artifacts are arguably better than theirs.** Our `job-sections.tsx` renders a real email with a ranked table, a CSV preview, an SMS thread, and KPI tiles — i.e. we show the *deliverable*, they show the *interface*. Showing the deliverable is more persuasive for a done-for-you pitch. This is a real asset; we should extend it, not rebuild it.
6. **Horizontal reach.** Lev cannot sell to a logistics company or an accounting firm. We can.

### Where we look weaker than we are
- **Supervised-mode is no longer a differentiator.** Lev markets approval gates just as hard ("Writes stay gated", "Approval before send"). If our site leans on "supervised, not autonomous" as the headline distinction, we're matching them, not beating them. Reframe to *who does the work*.
- **No proof of any kind.** Our `Proof` and `Trust` sections exist as components; without named customers or dated security claims they read as placeholders next to Lev's.
- **Price looks high with no comparison anchor.** $499–$3,499/mo + setup vs $80–$400/mo is a 6–12× delta. It's justified — we're priced against a *salary*, they're priced against *software* — but our site has to make that frame explicit or the number just looks expensive.
- **Five example agents vs 35 product pages** makes us look narrower than we are.

### What to do about it on our site
1. **Get the apex resolving.** Everything else is moot; this also unblocks the A2P/10DLC registration that needs public `/privacy` and `/terms` (per memory).
2. **Build the per-agent page system.** One page per agent role, using Lev's 3-step template but with *our* artifact — the finished email, the text thread, the attachment. 8–12 pages beats 1.
3. **Add a "buying criteria" page** for the category ("How to evaluate an AI agent for your business") with criteria we win on: works in your existing tools, no migration, delivers finished work, named accountable agent, human approval on external sends.
4. **Make the salary anchor explicit** next to pricing — the comparison is a $60k coordinator, not a $400/mo SaaS seat.
5. **Ship one named case study.** Even Kyle's own AmbittMedia/Francis dogfood, told honestly, beats zero.
6. **Surface the governance work we already built** (control plane, seatbelts, spike detection, pause authority) as a *trust page*. We built a Cortex; we just never marketed it.

---

## 7. Steal / Avoid list

### ✅ Steal — safe, structural, non-infringing

| Pattern | How we adapt it |
|---|---|
| **Layered product taxonomy** | Ours isn't Apps/Agents/Data/Platform. Try **Roles** (what you hire) / **Deliverables** (what lands in your inbox) / **Tools we plug into** / **How we keep it safe**. Same *idea*, different axes. |
| **One page per job, verb-first one-liner** | 8–12 agent-role pages. Formula: input → transformation → **named artifact**. |
| **Three-step section template** | For us: *We connect to your tools → Agent does the work → The finished thing arrives.* With our real email/SMS mockups per step. |
| **Specific fake data** | Already doing this well ("$4.2M, 7.4% cap", "$2.37M loan amount"). Keep it. Never use "Property A". |
| **Named micro-capabilities under each step** | e.g. "Approval before send", "Works in your Gmail", "Logged to your CRM". |
| **Three-statement outcome summary** | Passive declaratives closing each page: "The shortlist is ranked. The follow-up is sent. Nothing slips." |
| **Case-study skeleton** | About → Challenge → Solution → Results → *Objections we hear* → 3 takeaways → more stories. The "objections" section is the best part. |
| **Capability metrics, not ROI claims** | Claim what we can count. Don't invent "60% time saved". |
| **"Buying criteria" educational page** | Highest-leverage single page we could add. |
| **Neutral-tone comparison page** | Format is fine and legally sound (nominative fair use). See caution below on *whether* to aim it at Lev. |
| **Public docs in the primary nav** | Signals the product is real. |
| **Dated, specific security claims** | "Pentest Q2 2025" beats "enterprise-grade security". |
| **Time-boxed promo strip** | Only once we have something worth promoting. |
| **Original-data content brand** | Their "Lev Insights". Ours could be periodic anonymized fleet data — what agents actually do, hours returned. Nobody else has that dataset. |
| **Related-item cards at page bottom** | Cheap internal-link mesh once we have >8 pages. |

### 🚫 Avoid — legal risk, or reads as derivative

| Don't | Why |
|---|---|
| **"…become superhuman"** or any close variant | Their H1. Distinctive phrasing → copyright/trade-dress exposure and an obvious tell. |
| **"Unlock professional-class AI for your firm"** | Their signature CTA band. Off-limits verbatim or near-verbatim. |
| **"source-backed"** as our recurring modifier | It's *their* verbal signature across 35 pages. Say "cites the file it came from" instead. |
| **The `Lev X` naming system → `Ambitt X`** | A parallel suite (Cortex/Vault/Index/Pulse/Match) would read as a straight clone. Our agents already have human names — that's our system. Keep it. |
| **Mirroring their agent lineup 1:1** | Individually the names are generic descriptors and safe, but shipping the same 11 in the same order is derivative. Pick from *our* clients' actual jobs. |
| **"Like Fort Knox" / "do jumping jacks with your data"** | Distinctive creative copy. Write our own joke or none. |
| **Their case-study copy, quotes, customer names, or logos** | Obvious. Never reuse a competitor's testimonial or client list. |
| **Screenshots of their product UI** | Copyrighted. Even in a comparison page, use text descriptions. |
| **Cloning the visual system** | Especially since we haven't even measured it. We have a defined palette (teal `#00b3b3`, Lexend, duotone icons per `client-portal/DESIGN.md`) — a competitor-shaped redesign would break our own system for no gain. |
| **Credit-metering pricing** | The mechanic isn't protected, but it's wrong for us: metering contradicts "you hired someone." A hire has a salary, not a token budget. |
| **Copying their down-market race to $80/mo** | Their unit economics are software. Ours are labor replacement. Racing them to the bottom destroys our frame. |
| **Naming Lev on a comparison page (for now)** | Legal-safe, strategically premature — see Q1. A comparison page against a funded incumbent gives them free awareness among our prospects while we have no proof to counter with. |

---

## 8. Sources

- [lev.com homepage](https://www.lev.com/) · [/products](https://www.lev.com/products) · [/platform](https://www.lev.com/platform) · [/pricing](https://www.lev.com/pricing) · [/enterprise](https://www.lev.com/enterprise) · [/about](https://www.lev.com/about) · [/docs](https://www.lev.com/docs)
- [/products/lev-agent](https://www.lev.com/products/lev-agent) · [/products/lender-outreach-agent](https://www.lev.com/products/lender-outreach-agent) · [/products/lev-cortex](https://www.lev.com/products/lev-cortex)
- [/commercial-real-estate-ai](https://www.lev.com/commercial-real-estate-ai) · [/commercial-real-estate-software](https://www.lev.com/commercial-real-estate-software) · [/compare/stacksource-alternative](https://www.lev.com/compare/stacksource-alternative)
- [/customer-stories/talonvest-capital](https://www.lev.com/customer-stories/talonvest-capital) · [/blog](https://www.lev.com/blog) · [sitemap.xml](https://www.lev.com/sitemap.xml)
- [CRE Daily — Lev 2026 Review (updated 2025-11-24)](https://www.credaily.com/reviews/lev-review/) — the "should avoid if" finding
- [Thesis Driven — Deep Dive: Lev and AI in Commercial Real Estate](https://www.thesisdriven.com/letters/deep-dive-lev/)
- [Commercial Observer — podcast with Yaakov Zar, 2026-06-24](https://commercialobserver.com/2026/06/podcast-how-cre-is-implementing-agentic-workflows-with-lev-ceo-yaakov-zar/)
- [AlleyWatch — Lev raises $70M Series B, 2022](https://www.alleywatch.com/2022/05/lev-commercial-real-estate-financing-platform-digital-lending-marketplace-yaakov-zar/)
- [Yaakov Zar LinkedIn — shutting down the brokerage](https://www.linkedin.com/posts/yjzar_we-made-the-hardest-decision-of-my-career-activity-7399501877241094144-bSsa)
- [Tracxn — Lev company profile / funding](https://tracxn.com/d/companies/lev/__Av7VQy6g6VbNGBrtZdRWkVpuWN6sUVuQiU7JHZxGBV0)

**Our files reviewed:** `/Users/kylekufuor/Projects/Ambitt Agents/website/app/page.tsx`, `.../app/components/home/job-sections.tsx`, `.../app/components/home/roster.tsx`, `.../website/package.json`

---

## 9. Questions for Kyle (ranked)

**Q1 — Front door.** Do we make CRE the front door of the site, or stay horizontal?
- (a) **CRE-first** — homepage speaks to brokers/sponsors, other verticals live on sub-pages. Beats Lev on done-for-you, loses horizontal SEO.
- (b) **Horizontal with a CRE proof lane** — keep Nadia/Francis/Reed/Wren/Otto as-is, add a dedicated `/cre` landing page + case study.
- (c) **Fully horizontal** — treat CRE as one of five verticals, no special billing.

**Q2 — Price frame.** Lev sells at $80–$400/mo self-serve with a free tier; we're $499–$3,499/mo plus a setup fee. How do we respond?
- (a) **Hold and reframe** — publish the salary anchor ("a $60k coordinator, not a $400 seat") and never compete on monthly price.
- (b) **Add a low entry rung** — a single-agent, single-job tier under $200/mo to capture the curious-broker traffic Lev is buying.
- (c) **Go quote-only** — pull public pricing entirely, force the sales conversation, lean fully into bespoke.

**Q3 — Site surface area.** Lev has ~215 indexed pages; we have one. Where does the next chunk of effort go?
- (a) **Build the page system** — 8–12 agent-role pages + a buying-criteria page, using our email/SMS artifacts.
- (b) **Proof first** — one page, but ship a named case study and the trust/security page before adding surface.
- (c) **Neither — outbound** — the site is sufficient; put effort into direct CRE outreach and let the site be a brochure.

**Q4 — First proof asset.** We have zero named public customers. What ships first?
- (a) **Named client case study** — get one live client to go on record, Lev's template (Challenge/Solution/Results/Objections).
- (b) **Founder dogfood story** — AmbittMedia + Francis, told honestly as "we run our own company on this."
- (c) **Anonymized fleet data** — "what our agents actually did last month" as recurring original-data content nobody else can publish.
