# Homepage content + section spec — ambitt.agency

Owner: Parker (PM) · 2026-07-23
Feeds: Dahlia (design) → Quinn (review) → Kyle (approval)
Status: Draft for design. Copy in this doc is build-ready; Dahlia composes layout, Quinn verifies against the acceptance criteria, Kyle signs off (esp. open questions + final legal read).

Source material (read before touching this):
- `docs/research/website-messaging-antislop.md`
- `docs/research/website-competitor-teardown.md`
- `docs/research/website-legal-safe-framing.md`
- `client-portal/DESIGN.md` (anti-slop design source of truth — inherit, don't fork)

Replaces the current `website/app/page.tsx`, which violates most of what the briefs say to avoid (dark glassmorphism, emoji icons, "Agentic Runtime", 1·2·3 step cards, "Placeholder" testimonials, "Powered by Claude" in footer, emerald accent instead of brand teal).

---

## Problem

The live homepage is generic AI-startup slop and doesn't answer the only question a visitor has in the first 5 seconds: *what can one of these agents actually do for me?* It leads with tech ("Agentic Runtime," "850+ integrations") instead of a job, shows fake placeholder testimonials, and carries copy that's both AI-slop and legally exposed (banned words, third-party-tool framing that could invite a trademark / tortious-interference claim).

## Goals

1. A visitor groks "what an agent does for me" in ~5 seconds — outcome-led, not a feature grid.
2. The product model *is* the differentiator: you ask in plain English, the finished work arrives by email/text, you never touch a dashboard. Dramatize it, don't bury it.
3. Every claim is legally safe (no named third-party platforms we operate; customer-possessive framing) and passes the anti-slop bar (reads human-written, no glaze words, no slop layout tells).
4. Trust comes from specificity — named agents, named jobs, real dated artifacts — not borrowed logos or unsourced stats.

## Non-goals

- Not a redesign of the whole site (contact/privacy/terms pages stay; only homepage + nav + footer change here).
- Not a pricing-strategy change. Plans section pulls numbers from the pricing SOT; do not invent or restate tiers (see Build note in §8).
- Not the design system itself — Dahlia inherits `client-portal/DESIGN.md` tokens. This doc specifies content, section intent, artifacts, and pass/fail criteria.

---

## Global constraints (apply to every section — Quinn checks all)

**Design (inherit `client-portal/DESIGN.md`; use the `frontend-design` skill for the build):**
- Type: **Lexend**, semibold headings. Not Inter. Not Geist-as-body. A single characterful display face for the H1 only is allowed if Dahlia wants contrast.
- Accent: brand **teal `#00a4bd`** (`#0091a8` hover). Not the current emerald `#34d399`. No purple/blue gradients anywhere.
- Palette: cool slate — text `#33475b`, bg `#f5f8fa`, white surfaces. Light theme (the current dark-mode orb page is retired).
- Surfaces separate by **elevation + whitespace + a faint tonal wash**, never a flat gray 1px border.
- Icons: **custom duotone** set. Never Lucide/Heroicons/Feather. **Never emoji** as icons or in headings.
- No glassmorphism, no `backdrop-blur` cards, no colored glow/box-shadow, no gradient-border cards, no badge-pill directly above the H1, no three-equal-cards row, no `01·02·03` numbered step cards, no stat-banner row (`10x / 99.9% / 24/7`).
- Motion: at most **one** tasteful hero moment (the thread resolving). Nothing else. No load-in fade cascade, no scroll-mouse bounce cue.

**CTAs — two, decided by Kyle (2026-07-23), consistent sitewide:**
- **Primary = "Book a call"** — book a call/demo with us (the human-reviewed path; today's honest conversion while onboarding still routes through a Kyle-reviewed quote).
- **Secondary = "Start now"** — self-serve onboarding to hire an agent (the Atlas onboard funnel).
- Wherever a CTA appears (nav, hero, plans, closing band), render the primary button + the secondary beside it (button or clear link). Primary carries teal fill; secondary is the lighter/ghost treatment. Referenced below as {{PRIMARY_CTA}} = "Book a call" and {{SECONDARY_CTA}} = "Start now".

**Voice (buyer language, Slack-DM test):**
- Contractions. Specific task nouns (invoices, leads, the Monday numbers). "take it off your plate," "so you don't have to," "before you're back at your desk," "the work's already done."
- We/our-team voice. Never name an operator/agent-runner as a person doing client work.
- Vary punctuation; don't run em-dash-heavy prose (reads as LLM to this audience).

**Banned words — zero occurrences anywhere on the page** (grep list in Appendix A). Two groups:
- *Legal triggers:* bypass, circumvent, "no login," "no seat," "get around," "against their terms," "beat the paywall," "powered by," official, endorsed, partner.
- *Glaze/slop:* agentic, autonomous, orchestration, leverage, streamline, empower, supercharge, seamless, world-class, enterprise-grade, unlock, elevate, robust, delve.

**Legal framing — hard rules (Appendix B has the full do/don't):**
- **Never name CoStar / LoopNet / CREXi or any browser-operated third-party site.** Genericize to "the listing and market-data platforms your brokers already subscribe to" / "the tools your team already uses."
- Tools we formally integrate via Composio (Gmail, Slack, Google Calendar, Google Sheets, HubSpot, Salesforce, Notion, QuickBooks, Stripe) **may** be named — **word-mark text only, no logos, no "official/partner."**
- Everything customer-possessive and literally true: **"Your agent. Your logins. Your tools."** The agent works in the client's own account under their direction.

> **Conflict surfaced for Kyle (do not silently resolve):** the task brief's suggested hero energy — "no dashboard, **no login**" — collides with the legal brief's hard ban on the exact phrase "no login" (CFAA/circumvention trigger). Our meaning ("you never log into *our* product") is different from the banned meaning ("the agent reaches a third party without logging in"), but the string is ambiguous and Quinn/counsel will flag it. **This spec resolves it by keeping the energy and dropping the string:** we use "no dashboard," "no busywork," "you never touch a dashboard," "nothing new to check." If Kyle/counsel decide the exact phrase is fine in a clearly-our-product context, it can be reinstated in one place only. Flagged, not decided.

---

## The cast (named example agents — defined once, reused across §3 and §4)

Grounded in what we actually run today (a CRE sourcing agent, an EA, self-serve tool connections via Composio, email/SMS delivery). Names are examples; Kyle picks the final featured set (Open Question 1).

| Agent | Role (one-line JD) | Tools it works in (word-marks only) | Delivers |
|---|---|---|---|
| **Nadia** | Market research & sourcing (commercial real estate) | The listing and market-data platforms your brokers already subscribe to; Google Sheets; Gmail | A ranked shortlist email every morning + a CSV |
| **Francis** | Executive assistant | Gmail, Google Calendar, Google Docs | A triaged "here's your day" reply, on request or first thing |
| **Reed** | Sales follow-up & lead nurture | Your CRM (HubSpot / Salesforce), Gmail | Every new lead followed up within the hour, logged in your CRM |
| **Wren** | Ops & reporting | Your analytics + spreadsheets, Slack | One "last week's numbers" email every Monday + a PDF |
| **Otto** | Accounts receivable | Your accounting software (QuickBooks), Gmail | Unpaid invoices chased and logged, so you don't have to |

Legal note on Nadia: **never** name the CRE platforms. Always the category noun. This is the highest-risk copy on the page — Quinn greps for it explicitly.

---

# Section-by-section spec

Order: Nav → Hero → Your-tools strip → Job sections (×4) → Meet the agents → How it works → Proof → Trust & safety → Plans → FAQ → Mission CTA → Founder close → Footer.

---

## 0. Nav

**Purpose:** get out of the way; one clear CTA.

**Content:**
- Left: wordmark "Ambitt" (teal "A", slate "mbitt").
- Center (desktop): What it does · Agents · How it works · Pricing · FAQ
- Right: **{{SECONDARY_CTA}}** ("Start now", light/ghost) + **{{PRIMARY_CTA}}** ("Book a call", teal fill), side by side. On mobile, collapse the secondary into the menu and keep the primary button visible.

**Artifact/visual:** solid or lightly-elevated bar on the slate bg. Not a floating frosted-glass pill (current build uses `backdrop-blur-xl` — remove).

**Acceptance criteria:**
- [ ] No `backdrop-blur` / glass treatment on the nav.
- [ ] Both CTAs present with correct hierarchy (primary teal fill "Book a call", secondary ghost "Start now"); anchor/route targets exist for every nav link and both CTAs.
- [ ] Wordmark uses teal `#00a4bd`, not emerald.

---

## 1. Hero — the delivery itself

**Purpose:** name one concrete task + one concrete outcome, and *show the delivery surface* (an email/text thread, not a dashboard). A visitor must understand the whole model — ask in plain English, finished work lands in your inbox — in one screen.

**Headline (H1):**
> "Chase down my unpaid invoices."
> Handled before your coffee's cold.

**Subhead:**
> Hire a named AI agent that works inside the tools you already use and emails you the finished work — not a to-do list. You ask in plain English. It does the job. You never touch a dashboard.

**CTAs:** {{PRIMARY_CTA}} ("Book a call", teal fill) + {{SECONDARY_CTA}} ("Start now", ghost) side by side.
**Tertiary (quiet text link, optional):** "See what a day with one looks like ↓" (anchors to §3).

**Body microcopy under the CTA (replaces the current italic quote):**
> No dashboard. No busywork. The work just shows up.

**Visual / artifact (the hero — this is the star, build it real):**
A single **text-message thread** resolving on load (the one permitted motion):
- Client bubble: *"Chase down everyone who hasn't paid last month's invoice."*
- Agent bubble (from **Otto**): *"On it."* → a beat later → *"Done. Sent friendly reminders to 12 clients ($18,400 outstanding), logged each in your books, and flagged 2 that need a call. Summary + list attached. ✓"* with a small attachment chip (`unpaid-invoices.csv`).
- The thread is styled as a real phone/email conversation, not a product screenshot. Teal accent on the agent's name and the "✓". No dashboard chrome anywhere.

**Acceptance criteria:**
- [ ] H1 names **one task** ("unpaid invoices") and **one outcome** ("handled before your coffee's cold").
- [ ] Two CTAs present with clear hierarchy: primary "Book a call" (teal), secondary "Start now" (ghost). The optional "see a day" scroll link must not compete visually with either.
- [ ] Hero visual is a **conversation/delivery surface** (text or email), not a dashboard/app screenshot.
- [ ] Copy contains **no** banned string, including the literal "no login"/"no logins" (uses "no dashboard"/"no busywork"/"never touch a dashboard" instead).
- [ ] Dollar/count figures in the artifact are illustrative and internally consistent; no unsourced "10x/99.9%" claims.
- [ ] Reads human: passes the "would someone say this in a DM" test; no glaze words.

---

## 2. "Your tools" strip + objection-killer

**Purpose:** land the core differentiator immediately below the fold — the agent works *in the software you already pay for* — and kill the #1 buyer objection (rip-and-replace) in one line. (Gumloop/Artisan pattern, legally trimmed.)

**Eyebrow/label:** Works where you already work
**Headline:**
> Your agent. Your logins. Your tools.

**Body:**
> No new software to buy. No migration. Your agent signs in with your own accounts, under your direction, and does the work right inside the tools your team already uses every day.

**Objection-killer line (visually distinct):**
> Nothing to install. Nothing to move. Nothing new to learn.

**Visual / artifact:** a **word-mark row** of real, integrated tools — set as clean text/typographic tokens, not a logo grid: Gmail · Google Calendar · Google Sheets · Slack · HubSpot · Salesforce · Notion · QuickBooks · Stripe, plus a trailing "+ hundreds more." Duotone bracket/connector motif is fine; **no vendor logos** (legal), **no "partner/official" labels.**

**Acceptance criteria:**
- [ ] Tools shown as **word-marks (text) only** — zero third-party logos.
- [ ] Only tools we formally integrate appear; **no CRE listing platform** named here or anywhere.
- [ ] Copy is customer-possessive ("your accounts / your logins / your tools") and contains no "official/partner/powered by."
- [ ] "No new software / no migration" objection-killer present and legible without scrolling within the section.

---

## 3. What your agent does — first-person job sections (the core "what it does" mechanism)

**Purpose:** the highest-converting device on the page. Four full-width blocks, **one complete job each, written in the agent's own voice**, each paired with a **screenshot of the real deliverable** (the actual email/text/report it sends). Apps are named *inside the sentence describing the job*, never as a silent grid.

**Section intro (small):**
> Eyebrow: A day with your agent
> Headline: It doesn't hand you tasks. It hands you the finished thing.

**Layout rule (anti-slop):** alternating full-width rows (copy left / artifact right, then flip), separated by whitespace + elevation of the artifact card. **Not** a grid of equal cards. Each artifact is the hero of its row.

### 3a — Nadia (market research & sourcing / CRE)
**First-person copy:**
> "I track new listings the moment they hit the platforms your brokers already subscribe to, cross-check them against your buy-box, and send you a ranked shortlist every morning — with the comps and my reasoning, in one email. You skim it over coffee and tell me which ones to dig into."

**Artifact:** a real **morning email** from `nadia@ambitt.agency`, subject "Your shortlist — 6 new listings worth a look (Tue)", with a ranked table (address genericized/illustrative, price, cap rate, why-it-ranks) and an attached `shortlist.csv` chip.
**Legal:** the source is described only as "the listing and market-data platforms your brokers already subscribe to." No CoStar/LoopNet/CREXi anywhere in copy or artifact.

### 3b — Francis (executive assistant)
**First-person copy:**
> "Before you're online, I've been through your inbox. I clear the noise, draft replies to the ones only you can answer, and tell you what actually needs you today. Text me 'what's on my plate?' and you'll have it in a minute — pulled from your Gmail and Google Calendar."

**Artifact:** a **text thread** — client: *"what's on my plate today?"* → Francis: a tight triaged reply (3 things that need you, 2 drafts waiting for a yes, calendar conflict flagged), ending in a clean "✓".

### 3c — Reed (sales follow-up / lead nurture)
**First-person copy:**
> "Every new lead gets a real follow-up within the hour — not next week when someone remembers. I write it in your voice, send it from your Gmail, and log the whole thing in your CRM so nothing slips. You just see the replies come back warm."

**Artifact:** a **"✓ Done" email** from `reed@ambitt.agency`: "Followed up with 8 new leads (avg 22 min). 3 already replied — moved them to 'Interested' in HubSpot. Drafts for the other 5 are waiting for your ok." Small CRM-record chip.

### 3d — Wren (ops & reporting)
**First-person copy:**
> "Every Monday, last week's numbers are in your inbox before your first meeting — pulled from your tools, written up in plain English, with the two things that changed and why they matter. One email. No dashboard to open, no report to build."

**Artifact:** a **weekly digest email** from `wren@ambitt.agency` with a small stats block (revenue, signups, churn — each with a delta and accent color), a one-paragraph "what changed" note, and an attached `weekly-report.pdf` chip.

**Acceptance criteria (all four blocks):**
- [ ] Each block is **one job**, first-person, agent's voice; outcome-led (what lands in the inbox), not a feature list.
- [ ] Each block names **≥1 real integrated app as a word-mark** *inside the job sentence* (Gmail, Google Calendar, HubSpot, etc.).
- [ ] Each block ships with a **real deliverable artifact** (email/text/report mock), not an icon or illustration.
- [ ] **Nadia block:** the CRE data source is a category noun only. Grep for "CoStar", "LoopNet", "CREXi" → **zero matches** in copy and in any artifact text.
- [ ] Layout is alternating full-width rows, **not** an equal-card grid; artifacts separate by elevation, not gray borders.
- [ ] No banned/glaze words in any block.

---

## 4. Meet the agents — role-card gallery

**Purpose:** a scannable "who could I hire" map. Reuses the §3 cast plus Otto, each a coworker with a name, a one-line job, and the tools they touch. (Gumloop role cards + Artisan "hire" framing, minus the mascot theatrics.)

**Eyebrow:** Meet a few of the team
**Headline:** Every agent has a name, a job, and answers to you.
**Subhead:** These are examples. Yours is built for your business, learns your voice, and works the way you'd want a great new hire to.

**Cards (name · one-line JD · tools · what shows up):**
- **Nadia — Market research & sourcing.** Tracks new listings on the platforms your brokers already use; sends a ranked shortlist every morning.
- **Francis — Executive assistant.** Clears your inbox, guards your calendar, drafts what only you can answer. Gmail, Google Calendar, Google Docs.
- **Reed — Sales follow-up.** Follows up with every lead within the hour and logs it in your CRM. HubSpot / Salesforce, Gmail.
- **Wren — Ops & reporting.** Turns your tools into one plain-English Monday email. Analytics, Slack.
- **Otto — Accounts receivable.** Chases unpaid invoices and keeps your books current. QuickBooks, Gmail.

**Visual / artifact:** cards distinguished by a **custom duotone role icon** (per agent) + a small avatar treatment (initial monogram in teal is fine; **no stock headshots**, no emoji). Elevation separation.

**Acceptance criteria:**
- [ ] 4–6 cards; each has name + one-line job + named tools (word-marks) + what the client receives.
- [ ] Nadia's card uses the category noun for CRE platforms; no named third-party listing site.
- [ ] Icons are custom duotone; no emoji, no Lucide/Heroicons, no stock headshots.
- [ ] Framing is additive ("built for your business," "answers to you") — **no** "replace your people" / "instead of hiring" language (First-Truth; Artisan anti-pattern).

---

## 5. How it works — 3 honest steps (non-generic layout)

**Purpose:** make the process feel real and controllable in three honest beats — without the `01·02·03` equal-card slop.

**Layout rule:** an **editorial staircase** — three left-aligned beats stacked vertically, connected by a thin teal spine, each beat pairing a short line of prose with a small supporting artifact on the opposite side. Asymmetric, not three columns.

**Eyebrow:** How it works
**Headline:** Three steps. Then it just works.

**Steps:**
1. **Tell us the job.** A short call or a written brief — the plain-English version of "here's what I keep having to do." We set up a named agent for exactly that.
2. **It works in your tools, with your logins.** Under your direction. You approve anything big before it happens, and you can pause it any time with a single reply.
3. **The finished work arrives by email or text.** On a schedule you set, or the minute you ask. You review the result — not a dashboard.

**Reassurance line (below the steps):**
> You're always in control. Big actions wait for your ok. One reply pauses everything.

**Acceptance criteria:**
- [ ] **No** `01/02/03` numbered equal cards and **no** three-identical-column layout; uses the staircase/asymmetric treatment.
- [ ] Step 2 uses customer-possessive framing ("in your tools, with your logins," "under your direction"); contains no "bypass/circumvent/no login."
- [ ] Control/pause/approve reassurance is present (backs the real control-plane; a genuine trust differentiator).
- [ ] No glaze words.

---

## 6. Proof — real, dated, named

**Purpose:** trust through specificity, not borrowed logos. One or two **genuine, dated** results — named agent + named job + the real artifact — or an honest first-party (our own dogfooding) example. Kills the current "Placeholder" testimonials.

**Eyebrow:** Proof, not promises
**Headline:** Here's one that's actually running.

**Content (fill with a real, permissioned result before launch):**
> Since {{MONTH YYYY}}, {{Agent name}} has {{concrete job}} for {{client — with written permission, or "our own team"}}. Last {{period}}: {{grounded outcome — e.g., "chased 41 overdue invoices, recovered $19,300, and took about six minutes of anyone's time"}}. Here's the email it sent.

**Visual / artifact:** the **actual email/report** from that run, dated. If no client result is permissioned at launch, use a first-party example labeled honestly (e.g., "Francis runs our own inbox" — we're the AI-workforce company, dogfooding is on-brand and true).

**Acceptance criteria:**
- [ ] Zero fake/"Placeholder" testimonials; zero stock headshots.
- [ ] Any external client named **only with written permission** (11x cautionary tale); otherwise labeled as our own use.
- [ ] Every number is grounded and dated — **no** unsourced 10x / 99.9% / 24-7 stat banner.
- [ ] The proof shows a **real artifact** (the sent email/report), not just a quote.

---

## 7. Trust & safety strip

**Purpose:** surface the First-Truth principle + real control-plane story most competitors bury. Short, confident, not a wall of badges.

**Eyebrow:** Built to be trusted
**Headline:** An agent earns its place by making the business better — or it doesn't ship.

**Three short lines (custom duotone icons, not a card grid):**
- **You approve the big stuff.** Anything with real consequences waits for your ok.
- **It works in your accounts, never around them.** Your logins, your permissions, your data.
- **Your data stays yours.** Encrypted at rest, isolated to your business, never shared between clients.

**Acceptance criteria:**
- [ ] First-Truth ("makes the business better") stated in the client's language, not as internal jargon.
- [ ] "works in your accounts, never around them" — customer-possessive; contains no "bypass/circumvent."
- [ ] Data line is truthful to the product (AES-256 at rest, per-client isolation) without over-claiming "fully compliant/certified."
- [ ] Not rendered as three-equal-cards; no security-badge logo wall.

---

## 8. Plans (lightweight)

**Purpose:** answer "what's this cost" without turning the homepage into a pricing debate, and route to the CTA.

**Eyebrow:** Simple to start
**Headline:** Hire one agent. Add more when it's earning its keep.
**Body:** Plans start at {{STARTER_PRICE}}/mo for a single agent connected to your tools, with room to grow into a small team of them. No contracts — pause or cancel any time with a reply.
**CTAs:** {{PRIMARY_CTA}} ("Book a call") + {{SECONDARY_CTA}} ("Start now").

**Build note (not an open question — for CTO/Kyle at build time):** numbers must be pulled from the pricing SOT (`shared/pricing-constants.ts` / portal mirror), **not** invented here. The current live site shows $499/$1,499/$3,499, but memory records the $1,499/$3,499 raise as *staged, not shipped* — confirm the live figures before this renders, and keep website, portal, and SOT identical.

**Acceptance criteria:**
- [ ] Any price shown matches `shared/pricing-constants.ts` exactly (no drift from portal/SOT).
- [ ] "No contracts / cancel any time" is true and present.
- [ ] Both CTAs present ("Book a call" primary + "Start now" secondary).

---

## 9. FAQ

**Purpose:** clear the real objections a buyer has; every answer legally safe and human.

**Headline:** The questions everyone asks.

1. **What does an agent actually do all day?**
   It works inside the tools you already use — your inbox, your CRM, your spreadsheets — and does the recurring work you'd otherwise do by hand or hire for: research, follow-ups, reports, chasing things down. It runs on a schedule or whenever you ask, and emails or texts you the finished result.
2. **Do I have to log into anything?**
   No. There's no dashboard to check. You talk to your agent by email or text, and the work comes to you. If you can reply to an email, you can work with an agent.
3. **Which of my tools can it work in?**
   The ones you already use — Gmail, Google Calendar and Sheets, Slack, your CRM (HubSpot or Salesforce), QuickBooks, and hundreds more. For specialized work like commercial real estate, it works in the listing and market-data platforms your brokers already subscribe to.
4. **Whose account does it use?**
   Yours. Your agent. Your logins. Your tools. It signs in with your own credentials, under your direction, and does the work the way a member of your team would — nothing it couldn't already do with your permission.
5. **What if it gets something wrong?**
   You approve anything with real consequences before it happens, it shows its work, and one reply pauses it instantly. It's a teammate you can direct, not a black box.
6. **How is my data handled?**
   Credentials are encrypted at rest, and every agent is isolated to your business — your data, memory, and history are never shared with anyone else.
7. **Can I cancel any time?**
   Yes. No contracts, no lock-in. Pause or cancel with a reply and your agent stops.

**Acceptance criteria:**
- [ ] Q2 sells "no dashboard" using our-product framing; **no** literal "no login" string.
- [ ] Q3 names integrated tools as word-marks and genericizes CRE ("listing and market-data platforms your brokers already subscribe to") — no named third-party site.
- [ ] Q4 is customer-possessive and avoids over-claiming ("nothing it couldn't already do with your permission," not "fully authorized/compliant").
- [ ] No banned/glaze words in any answer.

---

## 10. Mission CTA band

**Purpose:** one confident, mission-led close + the single conversion action.

**Headline:** Give one job to an agent that's built to do it well.
**Subhead:** Tell us the thing you keep having to do. We'll build you a named agent that takes it off your plate — and only keeps its seat if it's genuinely making your business better.
**CTAs:** {{PRIMARY_CTA}} ("Book a call", teal) + {{SECONDARY_CTA}} ("Start now", ghost).

**Acceptance criteria:**
- [ ] Both CTAs present with the same labels and hierarchy used everywhere else on the page.
- [ ] Mission-led, additive framing (First-Truth); no replace-humans language.
- [ ] No glaze words; not a gradient-glow band.

---

## 11. Founder-voice close

**Purpose:** founder evidence — the strongest trust lever for an unknown brand (research §4). A short, signed, human note about *why we built this*.

**Copy:**
> We started Ambitt with one rule: an agent only earns its place if it makes your business genuinely better. Not busier. Not more "automated." Better — measured in work that's actually done and hours you get back. Every agent we build has a name, learns your business, and answers to you. If one isn't pulling its weight, you tell it, or you let it go. That's the whole deal.
> — {{FOUNDER_NAME}}, founder

**Visual:** signature-style treatment; optional real founder photo (gated on Open Question 2).

**Acceptance criteria:**
- [ ] Reads as a real person wrote it (contractions, a point of view), not marketing copy.
- [ ] Founder shown per Kyle's decision (OQ2); if name/photo withheld, falls back to "— the Ambitt team" without breaking the section.
- [ ] No glaze words.

---

## 12. Footer

**Purpose:** navigation + the legally-required trademark disclaimer.

**Content:**
- Wordmark + one-liner: "Named AI agents that do the work in the tools you already use, and deliver it to your inbox."
- Columns: Product (What it does · Agents · How it works · Pricing) · Company (Contact · Privacy · Terms · Support).
- Copyright: "© {year} Kufgroup LLC (d/b/a Ambitt Agents)."
- **Remove** "Powered by Claude" (banned "powered by").
- **Trademark disclaimer (placeholder — counsel to finalize copy):**
  > *"Product and company names are trademarks of their respective owners. Ambitt Agents is not affiliated with, endorsed by, or sponsored by any third-party platform our agents operate on your behalf."*

**Acceptance criteria:**
- [ ] Trademark disclaimer present, marked "counsel to finalize" in the spec/PR description.
- [ ] "Powered by Claude" removed; no banned words in footer.
- [ ] Privacy/Terms/Contact links resolve (existing pages).

---

## Appendix A — banned-words grep list (Quinn: zero matches, case-insensitive, across all rendered copy + artifact text)

```
bypass, circumvent, no login, no logins, no seat, get around, against their terms,
beat the paywall, powered by, official, endorsed, partner,
agentic, autonomous, orchestration, leverage, streamline, empower, supercharge,
seamless, world-class, enterprise-grade, unlock, elevate, robust, delve
```
Plus a hard block on third-party CRE platform names: `CoStar, LoopNet, CREXi` → zero matches anywhere (copy, alt text, artifact mockups).

## Appendix B — legal do/don't quick card (from `website-legal-safe-framing.md`)

| DO | DON'T |
|---|---|
| "the tools/platforms you already use"; "your CRM"; "listing and market-data platforms your brokers subscribe to" | Name CoStar/LoopNet/CREXi (or any vendor) by name or logo |
| "your agent signs in with your credentials, under your direction" | "bypass / circumvent / get around"; "no login needed"; "beat the paywall" |
| Real integrations named as **word-marks only** | Vendor logo grid; "official / endorsed / partner / powered by" |
| Customer-possessive ("your accounts / your logins / your work") | Comparative knocks on a named vendor; over-claiming "fully authorized/compliant" |

---

## Global "definition of done" (Quinn — one pass over the finished mock/build)

- [ ] Appendix A grep = zero matches; Appendix B rules hold everywhere.
- [ ] Font is Lexend; accent is teal `#00a4bd`; light theme. No emoji, no glassmorphism, no purple gradient, no gray-border cards, no `01/02/03` cards, no stat banner, no fake testimonials, no logo wall.
- [ ] Hero visual is a delivery surface (thread/email), not a dashboard.
- [ ] Every §3 job block names a real integrated app in-sentence and ships a real artifact.
- [ ] Two CTAs repeated consistently: primary "Book a call" (teal) + secondary "Start now" (ghost); both wired to their targets (call/demo booking; self-serve onboard funnel).
- [ ] Trademark disclaimer in footer; "counsel to finalize" flagged in the PR.
- [ ] Every section passes the Slack-DM / human-voice test.

---

> **Decided (2026-07-23):** Primary CTA = "Book a call", Secondary CTA = "Start now" (self-serve onboarding). Baked into every CTA section above. (Was Open Question 3 — now resolved.)

## Open questions for Kyle (2 — each with a recommended default)

1. **Which example agents do we feature?** This spec uses Nadia (CRE sourcing), Francis (EA), Reed (sales follow-up), Wren (ops/reporting), Otto (AR). **Recommended default:** ship these five — they map to real capability and give breadth across verticals. Swap any name/role freely; the only hard constraint is Nadia's CRE data source stays a category noun.
2. **Do we show a real founder (name + photo) in the §11 close?** Research says a real, accountable founder face is a top trust lever for an unknown brand. It doesn't conflict with the "never name an operator to clients" rule — that's about not attributing agent work to a person, not about the CEO signing a founder note. **Recommended default:** yes — short signed note, first name + role, photo optional. Fallback "— the Ambitt team" if Kyle prefers to stay we-voice.
