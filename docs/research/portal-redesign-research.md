# Client portal redesign — navigation + design research

**Date:** 2026-07-29 · **Author:** Rex (research) · **For:** portal redesign (Databricks × HubSpot × Lev blend)
**Scope:** live research only. Every load-bearing claim links out. Weak evidence is labelled **[THIN]**.

---

## 0. Verdict (read this if you read nothing else)

1. **Keep the persistent left sidebar, always expanded on desktop. Do not copy HubSpot's collapse-by-default.** NN/g's 179-participant study found people used hidden navigation in **27%** of cases vs **48–50%** for visible/combo, were **≥39% slower** on desktop, and content discoverability dropped **>20%** ([NN/g, 2016](https://www.nngroup.com/articles/hamburger-menus/)). HubSpot shipped the collapsed pattern in 2025 and the community response is exactly what that study predicts — "users now constantly need 2 clicks where previously only one click was necessary" ([HubSpot Community, Refreshed Navigation Menu and Sidebar](https://community.hubspot.com/t5/HubSpot-Ideas/Refreshed-Navigation-Menu-and-Sidebar/idi-p/963264); [OPT out of "NEW navigation bar"](https://community.hubspot.com/t5/HubSpot-Ideas/OPT-out-of-NEW-navigation-bar/idi-p/976234)).
2. **Every destination gets a real URL. Kill the `#anchor` sub-nav.** Two of our six agent sub-items (`#communication`, `#settings`) are hash anchors, so they can't hold an active state, can't be linked, and don't participate in back. Baymard: **59% of sites** violate at least one of four back-button expectations, and the fix is history entries for anything the user perceives as a new view ([Baymard](https://baymard.com/blog/back-button-expectations)).
3. **Detail views: drawer for peeking, full route for working — and the drawer must own a URL.** Next.js 16 (our installed version, per the doc header `version: 16.2.12`) ships intercepting + parallel routes precisely to make a modal "shareable through a URL", "preserve context when the page is refreshed", and "close on backwards navigation" ([Next.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes)).
4. **Steal Databricks' restraint and neutrals, HubSpot's record-page structure and bookmarking, Lev's trust triad.** Reject Databricks' 20px card radius and 60px display type (marketing scale, not product), HubSpot's density and collapsed nav, and Lev's credit-metering language.
5. **The portal's job is proof-of-work, not a control panel.** Practitioners are blunt: "The worst ones? Just more dashboards to check" ([r/AI_Agents](https://reddit.com/r/AI_Agents/comments/1j5jwmk/)).

---

## Method + access constraints (flagging this up front)

- **X/Twitter could not be read.** `x.com` returns HTTP 402 to the fetcher; the Nitter forks are dead or behind anti-bot (`xcancel.com` served a bot-check page, `nitter.privacydev.net` refused the connection). **No claim in this doc is sourced to X.** Where the brief asked for design-Twitter opinion, I substituted Hacker News threads and the two open-source "AI design tells" catalogues that circulated on X and HN in 2026.
- **reddit.com is blocked to this fetcher** (both direct fetch and domain-filtered search). Reddit content here comes from the **PullPush archive API** (`api.pullpush.io`), which returns the real comment bodies, scores and permalinks. Permalinks are given where the API returned them; two quotes lacked permalinks and are marked **[THIN]**.
- Vendor brand pages (`brand.databricks.com`, `brandguides.brandfolder.com`) truncate under fetch; their values below come from search-indexed snippets of those pages plus a second corroborating source. Exact-value claims carry a confidence note.

---

# PART 1 — What people actually say

## 1.1 Premium vs cheap: the 2026 tells are specific, and half of them are in our current stack

The most rigorous artefact I found is a scan of **1,590 Show HN submissions** against **16 deterministic CSS/DOM checks** (Playwright + computed styles, no LLM judging, self-reported 5–10% false-positive rate): **22% of sites hit 4+ AI-design patterns, 32% hit 2–3, 46% hit 0–1** ([adriankrebs.ch, Apr 2026](https://www.adriankrebs.ch/blog/design-slop/); [HN discussion, 333 pts / 235 comments](https://news.ycombinator.com/item?id=47864393)). The checks: Inter for hero text; Space Grotesk / Instrument Serif / Geist; serif-italic accent words; "VibeCode Purple"; permanent dark mode; low body contrast; gradients; colored glows; centered hero with a badge above the headline; **colored card borders (top/left)**; icon-topped feature cards; numbered steps; stat banners; emoji nav; uppercase section labels; shadcn/ui; glassmorphism. The author's line that travelled: *"colored left borders are almost as reliable a sign of AI-generated design as em-dashes for text."*

A companion catalogue ([signs-of-ai-design, Jul 2026](https://github.com/febbhav/signs-of-ai-design)) adds tells that matter for a *portal*, not a landing page: **"rounded-2xl everything"**, **"the untouched shadcn card"**, **"cards inside cards"**, **"the ghost card"**, **"single family, single weight, flat hierarchy"**, **"monotonous spacing"**, **"the same fade-in on everything"**, and **"the Lucide five"** (the same five stroke icons everywhere).

Two of those hit us directly: `rounded-2xl` is what Databricks' *marketing* radius (20px cards) would push us toward if copied literally, and "cards inside cards" is the standing risk on an agent overview page. Our DESIGN.md already bans the flat-gray card border, purple gradients, glassmorphism and Lucide — that ban is **independently corroborated** by both catalogues.

The counter-view is worth holding: on HN, **tptacek** argued *"AI-generated look-feel and web design is basically fine"* and that the real signal is substance; **cmrdporcupine** said *"The biggest signal is not the code itself but whether the thing is actively and continually developed"*. So craft-signalling is necessary but not sufficient — the portal has to show *work delivered*, which is also where our own audit landed.

**Distinctiveness has a ceiling in B2B.** A founder asked HN why his serif/engraving-styled logistics OS got called "cheap and ugly" ([Ask HN, Dec 2025](https://news.ycombinator.com/item?id=46179202)). The answers were about *procurement*, not taste: buyers need it to "look crisp and professional" when they show their superiors, and unfamiliar aesthetics make procurement teams hesitate. Practical read for us: **weird = risky at the point of sale; craft = safe premium.** Our brief ("Databricks-grade restraint with real depth") is the right side of that line.

Client-side, on what a portal is even for: an accountant describing their practice-management stack said the client portal is *"not a portal so much as a bookmark"* ([r/Accounting](https://reddit.com/r/Accounting/comments/1ebneuq/practice_management_software_for_small_firms/)) — i.e. a portal that's just a link farm reads as cheap regardless of its pixels. A freelancer who simplified theirs reported clients *"got bogged down; they just wanted a good overview and ways to connect if there was a problem"* (r/freelance via PullPush archive, May 2024) **[THIN — the archive returned no permalink for this one]**. And on approvals specifically, an agency owner's stated value was that the portal *"logs the exact time and person who approved something, so there's no confusion later"* ([r/agency](https://reddit.com/r/agency/comments/1k9iiz9/how_are_you_all_managing_client_approvals/)).

## 1.2 Navigation: what practitioners actually fight about

**Sidebar vs top nav is basically settled for our shape of product, and the dividing line is a number.** Repeatedly, independently, practitioners give the same threshold — top nav survives to about **5 items, one level deep**:

- *"Sidebars are better for more options and complex hierarchy, while navigation bars at the top work best for less complex hierarchy, up to 5 options, with no sub-options or max 1 level down"* ([r/UXDesign, Feb 2025](https://reddit.com/r/UXDesign/comments/1ijvs1v/)).
- *"Sidebars are best for complex apps with multiple sections... Top tab bars work well for simpler apps with fewer sections"* (same thread).
- *"Sidebar > Navbar for anything complex"*; *"For desktop or large screen web apps, I'd lean toward a sidebar, especially if the navigation is central to the user flow"* ([r/UXDesign, May 2025](https://reddit.com/r/UXDesign/comments/1knkc7a/sidebar_or_navbar/)).
- A Product Hunt poll on the same question ran **55% sidebar / 45% top**, with the nuance that top nav works when the item count is *fixed and small* ([Product Hunt discussion](https://www.producthunt.com/p/general/sidebar-v-s-top-navigation-2)) — **[THIN: informal poll, ~4 years old, n undisclosed]**.
- The pattern write-up that matches every mature product I looked at: *"Most mature products combine them: a top bar for global context (search, account, notifications) and a sidebar for primary navigation"*, and *"Reserve the top bar for things that are true everywhere in the app"* ([SaaSUI, navigation patterns](https://www.saasui.design/blog/saas-navigation-ux-patterns)).

**Hidden navigation is the one thing with hard numbers against it.** NN/g, 179 participants, 6 sites, desktop + mobile: hidden nav used **27%** of the time vs **48%** visible / **50%** combo; **≥39% slower** on desktop, 15% slower on mobile vs combo; **>20% drop** in discoverability; tasks rated **21% harder** ([NN/g, 2016](https://www.nngroup.com/articles/hamburger-menus/)). It's a 2016 study on marketing sites, so I'd discount it for a power-user tool used 8h/day — but our portal is used *occasionally, by a non-technical client*, which is the exact population the study covers. **High confidence for us specifically.**

The live counter-example is HubSpot, whose 2025 sidebar is **collapsed by default and expands on hover** ([HubSpot KB](https://knowledge.hubspot.com/help-and-resources/a-guide-to-hubspots-navigation)). Community complaints, verbatim-in-substance: two clicks where one used to do (CRM → Tasks), the hover panel "blocks a lot of their view", and it *auto-expands on hover* causing accidental opens during trainings and webinars ([HubSpot Ideas thread](https://community.hubspot.com/t5/HubSpot-Ideas/Refreshed-Navigation-Menu-and-Sidebar/idi-p/963264), [opt-out request](https://community.hubspot.com/t5/HubSpot-Ideas/OPT-out-of-NEW-navigation-bar/idi-p/976234)) — **[MEDIUM: community.hubspot.com returns 403 to the fetcher; these are search-indexed snippets of those threads, not a direct read. Two independent partner blogs corroborate the grumbling: "Why are you doing this to me HubSpot?!"](https://www.airtrafficcontrol.io/en/blog/hubspot-new-navigation)**

**Breadcrumbs: everyone half-understands them, including designers.** The single most useful correction, from r/UXDesign: *"It's rarely true that the breadcrumbs shows the actual history... In most case it's shows the primary taxonomy"* ([thread](https://reddit.com/r/UXDesign/comments/fg1lao/)). NN/g agrees and adds the constraints that decide whether we ship them at all: breadcrumbs *"aren't necessary (or useful) for sites with flat hierarchies that are only 1 or 2 levels deep"*; they must **never** replicate browser-back; place them below global nav; the current page is the last crumb and **is not a link**; on mobile, truncate to the immediate parent rather than wrapping to two lines ([NN/g breadcrumbs](https://www.nngroup.com/articles/breadcrumbs/)).

The consistency complaint is the one that reads as cheap: *"Breadcrumbs on one page, gone on the next"* was cited as a marker of low-quality delivery ([r/UXDesign](https://reddit.com/r/UXDesign/comments/1fdl5kk/local_vs_offshore_devs/)).

**Praised by name in 2026.** A dashboard round-up dated **27 July 2026** names what each does well — useful because it's specific rather than "clean and modern" ([AdminLTE](https://adminlte.io/blog/saas-dashboard-design-examples/)):

| Product | What's praised |
|---|---|
| Linear | *"quiet chrome & keyboard-first density"*, *"information density that never feels crowded because everything non-essential is simply absent"* |
| Stripe | *"tables as the primary interface — impeccable column alignment, inline sparklines, and drill-downs that never lose your place"* |
| Vercel | *"hierarchy comes entirely from spacing and type weight"*; *"status colors (green/amber/red) carry all the semantic weight precisely because nothing else competes with them"* |
| Attio | *"'Ask Attio' sits inside the record view"*; *"AI output is a designed component, not a bolted-on chat bubble"* |
| Retool | *"forms beside the data they edit"*; every screen answers *"what am I looking at, and what can I do to it?"* |
| Supabase | *"a disciplined sidebar"*, *"one page template, many tools"*, *"Consistent page scaffolding (header, tabs, table)"* |
| Mercury | *"editorial typography, disciplined color"* |
| Plausible | *"one page, one chart, a handful of ranked lists, zero configuration burden"* |

Command palettes are now table stakes in that commentary — *"in 2026 they've become a standard expectation in any SaaS product with more than 10 features"*, with the rationale *"navigation makes you remember where things live, while a command palette lets you just say what you want"*, and the guardrail that they *"complement visible navigation, not replace it"* ([SaaSUI 2026 trends](https://www.saasui.design/blog/7-saas-ui-design-trends-2026); [SaaSUI nav patterns](https://www.saasui.design/blog/saas-navigation-ux-patterns)). **[MEDIUM: these are practitioner blogs with screenshots, not studies. Directionally consistent with what Linear/Figma/Slack actually ship, but treat "standard expectation" as opinion.]** Our portal has ~6 destinations per agent — **below the threshold where a palette earns its keep.**

## 1.3 AI-agent product UX: where these products lose trust

The strongest empirical statement I found is from a 2026 business-context study of human–agent interaction: **agent transparency has the strongest impact on user preference**, with users needing to follow the agent's reasoning, task status, next steps and data sources ([arXiv 2606.18716](https://arxiv.org/pdf/2606.18716)). The visibility literature is blunt that our current answer — a chronological email log — isn't enough: activity logs are records of inputs/outputs, but *"post hoc logs are insufficient: users need to identify risks in real time and intervene"*, and many agents ship *"lengthy and sequential chat logs or video replays, or even no history at all"* ([arXiv 2401.13138, Visibility into AI Agents](https://arxiv.org/pdf/2401.13138)). The failure mode that kills trust outright is **the agent misreporting its own behaviour** — if it conceals or vaguely describes an error, users can't calibrate and trust collapses ([same](https://arxiv.org/pdf/2401.13138)).

The practitioner-side pattern set for 2026 ([Fuselab, May 2026](https://fuselabcreative.com/ui-design-for-ai-agents/)) is concrete and maps onto surfaces we already half-have:

- **Plan-and-execute**: show intended steps *before* execution; *"The user approves the full plan, modifies individual steps, or removes steps before execution begins."*
- **Separate the conversation thread from the activity panel** — user goals in one, autonomous work in the other.
- **Tool-use disclosure**: surface which external systems were called and what came back.
- **Multi-step tracking**: timeline of completed / active / blocked / upcoming.
- **Error messages need three parts**: what happened, why, what to try next. *"Generic retry buttons are insufficient for agent interfaces."*
- **Progressive delegation**: start supervised, widen autonomy on approval history (their example: auto-execute after 40 consecutive approvals).

LangChain's [Agent Inbox](https://github.com/langchain-ai/agent-inbox) is the reference implementation of the approvals surface — a Gmail-like inbox where a human can **accept / ignore / respond / edit** each interrupt. That four-verb schema is a better model for our Recommendations queue than our current approve/dismiss pair, because "edit" and "respond" are the two things clients actually want to do to a drafted email.

**And the loudest practitioner warning is against building a dashboard at all.** From r/AI_Agents: *"The worst ones? Just more dashboards to check"* ([thread](https://reddit.com/r/AI_Agents/comments/1j5jwmk/)) and, on non-technical operators, *"[they] don't want dashboards. They want 'Call this number and get it done.'"* ([thread](https://reddit.com/r/AI_Agents/comments/1kfbfns/)). Sales-side, the trust failure is reported as: reps stopped trusting the pipeline number on the dashboard once the AI SDR under-delivered ([revbuilders](https://www.revbuilders.ai/real-talk/ai-sdr-agents-governance-qa-and-trust-logging)) — **[THIN: vendor blog, no methodology]**.

This is directly aligned with our own product thesis ("clients never log into anything") and with the portal audit's finding that proof-of-value = work-delivered counts. **The portal earns its existence by being the audit trail and the approval surface, not by being a metrics wall.**

## 1.4 The "back and forth" problem — summary → detail → back

This is the best-evidenced section in the whole brief.

**The failure has a name and a measurement.** Pogo-sticking is *"the pattern of navigating back and forth between a routing page (usually, a list...) to a page deeper in the site's hierarchy"* ([NN/g](https://www.nngroup.com/articles/saving-scroll-position/)). Rules from that article: *"Saving scroll position is helpful when users come back to the page during the same session, and the page content has not changed"*; preserve it for roughly **30–60 minutes** after the last action, then reset; when intent is ambiguous, *"choose the lowest-friction default"*; and users expect to land back on **the same page of a paginated list**, not page 1.

**Back-button expectations are violated by most sites, and the fix is one API.** Baymard: **59% of e-commerce sites get at least one of four expectations wrong**; overlays/lightboxes are wrong on **37%** of sites, filtering/sorting on **27%**; users expect back to close an overlay, to step back through filters, and to return to *their position* in a list. Recommended fix, verbatim: *"Use `history.pushState()` to make sure your site invokes 'Back' button behavior that aligns with the user's expectations."* ([Baymard](https://baymard.com/blog/back-button-expectations))

**Breadcrumbs do not solve this.** They show taxonomy, not history ([NN/g](https://www.nngroup.com/articles/breadcrumbs/)) — so in a 2-level portal they're near-useless as a "get back" mechanism, and NN/g explicitly says they're unnecessary at 1–2 levels deep. **Persistent nav + a correct back + a "back to X" link on the detail page is the working combination; breadcrumbs are optional decoration at our depth.**

**Drawer vs modal vs full page.** The r/UXDesign thread "[Am I wrong for loving side panels?](https://reddit.com/r/UXDesign/comments/1adq08w/)" is the most useful practitioner thread I found on exactly Kyle's problem. Sentiment strongly favours side panels over centred modals for record detail (*"Floating modals 👎"*), with three real objections raised in-thread:
- **magicpenisland** flagged the exact risks: *sharing links to details*, *back-button behaviour*, and cramming too much into a panel that deserves a page.
- **maizeq** objected that panels have unclear visual linkage to the row that opened them, waste screen space, and adapt badly to mobile.
- The OP's resolution is the one I'd copy: **pair the side panel with a standalone detail page — an 80/20 split**, panel for the quick look, route for the real work. (OP cited Pipedrive and Rapyd as precedents.)

Decision rules that match: modal for *"a short, self-contained task the user can finish without leaving their current context"*; drawer when the user needs the underlying list visible; inline for small frequent edits; **full page when the task has many fields or several steps**, because pages avoid *"scroll traps, fragile focus handling, and lost work when accidentally dismissed"* ([SaaSUI modal patterns](https://www.saasui.design/blog/saas-modal-dialog-ux-patterns)).

**Mobile back is where this usually breaks.** NN/g on overlay dismissal: users treat back/swipe as **undo**, full-page overlays get mistaken for pages, and stacked overlays get dismissed wholesale. Recommendations, verbatim in substance: avoid overlays when a page or accordion works; prefer **partial** over full-page overlays; **never stack** overlays; always include a visible Close; and **support the built-in Back button/gesture to dismiss** ([NN/g](https://www.nngroup.com/articles/accidental-overlay-dismissal/)). The platform primitive for this, `CloseWatcher`, unifies Esc and the Android back button — but MDN is explicit it *"is not Baseline because it does not work in some of the most widely-used browsers"* ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CloseWatcher)), so we implement it as a history entry, not as `CloseWatcher`.

**And our framework already solves it.** Next.js intercepting + parallel routes exist to make modals: *"shareable through a URL"*, *"Preserving context when the page is refreshed, instead of closing the modal"*, *"Closing the modal on backwards navigation rather than going to the previous route"*, *"Reopening the modal on forwards navigation"* ([Next.js docs, version 16.2.12 — our installed version](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes)). A hard navigation to the same URL renders the full page instead of the overlay, which is exactly the 80/20 panel-plus-page pattern the r/UXDesign thread landed on, for free.

---

# PART 2 — Teardown of the three references

## 2.1 Databricks

**Navigation — marketing site.** Five top-level items, all mega-menus: **"Why Databricks", "Product", "Solutions", "Resources", "About"**, sticky, with **"Get a Demo"** and **"Login"** on the right; no utility bar above the main nav ([databricks.com](https://www.databricks.com/), fetched 2026-07-29).

**Navigation — product (the part worth stealing).** A persistent left sidebar with universal items pinned at the top — **Workspace, Recents, Catalog, Jobs & Pipelines, Compute, Discover, Marketplace** — then domain groups below: **SQL** (SQL Editor, Queries, Dashboards, Genie Agents, Alerts, Query History, SQL Warehouses), **Data Engineering**, **AI/ML** (Playground, Agents, AI Gateway, Experiments, Features, Models, Serving endpoints). Entitlement-gated items show a **lock icon** rather than disappearing. A persistent top bar carries the workspace switcher, global search, settings and help ([Databricks docs](https://docs.databricks.com/aws/en/workspace/navigate-workspace)).

Four details worth copying:
- **"Recents"** is a first-class sidebar destination, not a dropdown.
- **Getting back** is handled by a *context switcher* — "Recent workspace tabs" — plus a **folder-path breadcrumb** in the workspace browser ([2023 workspace browser preview](https://databricks.com/blog/2023/04/05/preview-new-workspace-browser.html)).
- **Locked-but-visible** items teach the product's shape instead of hiding it.
- The rationale, from their own 2023 write-up (published **2 May 2023**): users needed *"excessive clicks to move between tasks"* and *"many customers were unaware of available capabilities"*; the fix was replacing the top-left product switcher with **one nav bar showing all product areas, expandable/collapsible**, plus a simplified home and search moved to the top ([Databricks blog](https://www.databricks.com/blog/find-what-you-seek-new-navigation-ui)). Note: **no metrics published** — it's a rationale, not evidence.

**The single most relevant Databricks decision for us:** they did not try to make the full workspace usable by non-technical people. They built **Genie One**, *"the simplified Databricks UI for business users, a single entry point for interacting with data and AI without navigating technical concepts like compute, queries, models, or notebooks"* — search bar, a **"For you"** section, **Domains**, **Scheduled tasks**, **Documents**, listing pages, and an "Edit draft" escape hatch into the full workspace ([Databricks docs](https://docs.databricks.com/aws/en/genie-one/)). **That is our client portal's job description, written by someone else.**

**Type.** **DM Sans** is the primary family for all Databricks materials; **DM Mono** is the mono ([brand.databricks.com/typography](https://brand.databricks.com/typography) — *value read from the search-indexed snippet; the page truncates under direct fetch*). Measured off the live marketing site by an automated scrape ([shadcn.io/design/databricks](https://www.shadcn.io/design/databricks)):

| Role | Value |
|---|---|
| Hero H1 | 60px / weight **500** |
| H2 | 48px / weight **500**, letter-spacing **-0.48px** (= -0.01em) |
| Body | 14–16px / weight 400 |
| Eyebrows + labels | **DM Mono**, 12–16px / weight 500 |
| Giant stat numerals | **DM Mono**, 88px / weight 400 |
| Weight range used | **400–500 only** |

**[MEDIUM confidence: third-party automated scrape of the marketing site, not a first-party spec, and marketing ≠ product UI.]** Two things it confirms independently of us: **weight 500 is the display weight** (our DESIGN.md rule), and **negative tracking only appears at 48px+** (also our rule — our largest portal heading is 30px, so no tracking).

**Colour.** Brand: **Lava 600 `#FF3621`**, **Navy 900 `#1B3139`**, **Oat Medium `#DBD7CE`**, **Oat Light `#F4F0E7`** ([Databricks extended brand guidelines — colors](https://brandguides.brandfolder.com/databricks-extended-brand-guidelines/colors), snippet), with **Spring Wood `#F9F7F4`** as the off-white ([DesignYourWay teardown](https://www.designyourway.net/blog/databricks-logo/)). The stated discipline: *"Navy, Oat and White are great for large background colors, while Lava creates bright and vibrant pops of color."* Measured off the live site: red appears **only on the primary CTA pill** (`#eb1600`), ink `#1b3139`, ink-soft `#5a6f77`, hairlines `#c4ccd6` / `#dce0e2`, cream `#eeede9` ([shadcn.io](https://www.shadcn.io/design/databricks)).

> **Finding for us:** our tokens `--text #1b3139`, `--text-3 #5a6f77`, `--border #dce0e2` and `--bg #f9f7f4` match Databricks' measured/brand values **exactly**. The lift in `client-portal/DESIGN.md` is accurate, not approximate. The accent-discipline rule ("roughly one word per headline plus the primary CTA") is also what their live site does.

**Density.** Radius on the live marketing site: **20px cards, 16px stat tiles, 6px buttons, 2px small elements** ([shadcn.io](https://www.shadcn.io/design/databricks)) — this **conflicts with our DESIGN.md** (4px buttons, 6/8/10px surfaces). See §2.5.

**What Databricks does best that the other two don't:** *restraint under data load* — one accent, one accent placement, hierarchy from weight-500 type and spacing, and a deliberate second product (Genie One) for the non-expert rather than a simplified mode of the expert product.

## 2.2 HubSpot

**Navigation.** As of the **April 2025** rollout, the top menus were replaced by a left sidebar ([partner write-up](https://www.airtrafficcontrol.io/en/blog/hubspot-new-navigation); [HubSpot KB](https://knowledge.hubspot.com/help-and-resources/a-guide-to-hubspots-navigation) — *KB doesn't date it; the April 2025 date is secondary-source* **[MEDIUM]**).

- **Primary categories (verbatim):** Global Home, Bookmarks, CRM, Marketing, Content, Sales, Revenue, Service, Data management, Automations, Reporting, Breeze, Development, Partners.
- **Depth: exactly two levels** — primary category → secondary items (CRM → records, lists, inbox, orders, playbooks, products, tasks, templates, snippets).
- **Collapsed by default**, expands on hover; a "Keep navigation open" control pins it.
- **Bookmarks: up to ten** secondary items, drag-to-reorder — plus personalised ordering driven by usage frequency and pins ([Sidekick Strategies](https://www.sidekickstrategies.com/hubspot-updates/personalized-navigation-hubspot-customize-left-menu)).
- **Workspaces** (prospecting, help desk) sit as a distinct concept from tools.
- **Top bar carries ~10 global affordances**: sprocket/home, global search, Quick Create (+), calling, marketplace, help, settings, notifications, Breeze assistant, account menu.
- Menu items are **permission- and subscription-filtered** — HubSpot hides what you can't use (the opposite of Databricks' visible-but-locked).

**Type.** Marketing site, measured: **"HubSpot Serif"** display + **"HubSpot Sans"** body/UI; display **80 / 48 / 40 / 24px**, body **18 / 16 / 14 / 12px**, weights **300** (body and large display) and **500** (CTAs, nav, card headings); radius **16px containers / 8px buttons**; button padding **16px 40px**; canvas `#f8f5ee`, ink `#1f1f1f`, orange `#ff4800` (hover `#c93700`, pressed `#9f2800`), hairline `#cfcccb`, semantic **success `#00823a` / warning `#eeb117` / error `#d9002b`** ([shadcn.io/design/hubspot](https://www.shadcn.io/design/hubspot)) **[MEDIUM: same scrape caveat]**. Older HubSpot values still widely cited — orange `#FF7A59`, slate `#33475B`, Lexend Deca — are **legacy**; our portal's 2026-07-10 palette was built on them and is now chasing a brand HubSpot has moved off.

**Product UI refresh.** HubSpot's own design team, **3 September 2025**: *"cleaner, simpler interfaces that feel more intuitive, highlight what matters"*; status badges get *"distinct colors with higher contrast for clarity"*; *"The neutral palette has splashes of color and creates space for customization and a future dark mode"*; principles are *"simple without being simplistic"*, consistency-builds-trust, and accessibility as foundational (targeting **WCAG 2.2 AA**), rolled out in phases with an opt-in ([product.hubspot.com](https://product.hubspot.com/blog/designing-for-your-next-decade-growth)). The visible change is a **dark magenta nav bar** replacing blue ([Vantage Point](https://vantagepoint.io/blog/hs/hubspot-refreshes-brand-identity-what-it-means-for-your-marketing)). No metrics published.

**Density / data-heavy screens.** HubSpot's answer is the **record page**: a fixed three-column scaffold with the object's properties rail, a central activity timeline, and an associations rail — the same template for contacts, companies, deals and tickets. **[THIN: `knowledge.hubspot.com/records/view-and-edit-records` 404s and I did not find a first-party layout spec I could fetch; this description is from the KB nav guide's object list plus general familiarity. Verify before designing against it.]**

**What HubSpot does best that the other two don't:** **personalisation of navigation under breadth** — Bookmarks (10 max), pinning, usage-driven ordering, role-based menus, and a genuinely separated top bar for global actions. Also the best *permission-aware* nav: what you can't buy, you don't see.

## 2.3 Lev (lev.com)

**Navigation.** Eight top-level items — **Products, Platform, Stories, Enterprise, Pricing, Blog, About, Docs** — with **"Book a demo"** and **"Start for free"** as the CTA pair. Product pages carry a **real breadcrumb: `Products > Lev Agent`**. The footer is a four-column site map: Products (All products, Commercial real estate software, Commercial real estate AI, Apps, **Lev Agents**, Data, Platform, Lev Agent, Lender Search, Lev Match, Lev Memo, Lev API), Enterprise (Enterprise, Security, Pricing, Trust resources), Resources (guides, docs: Getting started / Learn / Build / Grow, legal), Social ([lev.com](https://www.lev.com), [/platform](https://www.lev.com/platform), [/products/lev-agent](https://www.lev.com/products/lev-agent), fetched 2026-07-29).

**The agent page is the most directly relevant artefact in this entire brief.** Hero: *"Your commercial real estate AI agent that reads deal context, answers questions, and moves work forward, so one person can work like an entire capital markets desk."* Then a four-step spine — **Ask in context → Prepare the action → Approve before execution → Source-backed answers** — and an explicit trust triad:

- **Visible tool calls** — *"Users can see what the agent is preparing before it changes anything"*
- **Reviewable actions** — *"Outbound communication and workflow changes wait for approval"*
- **Audit trail** — *"Agent runs keep sources, tool calls, and decisions traceable"*
- Summary line: *"Every agent action stays source-backed and reviewable. The team gets speed without giving up judgment, permissions, or traceability."*

Tone across the site is confident and ownership-framed — *"Own your stack"*, *"Like Fort Knox. We never own, lease, train with, export...your data"* ([/platform](https://www.lev.com/platform)).

**Pricing / density.** Four tiers — **Lev Core $80/mo, Lev Select $200/mo, Lev Pro $400/mo, Enterprise** (annual billing) — differentiated purely by **credits**: 2,500/mo at $0.032, 8,500/mo at $0.024, custom at $0.016, with a comparison table translating credits into work units ("AI lender searches: up to 1 / 4 / 12", "Offering Memos: about 5 / 17 / 50", "Contact enrichments: up to 312 / 1,062 / 3,125") and the line *"Credits are used only when Lev performs paid work for you"* ([/pricing](https://www.lev.com/pricing)).

**Type and colour: NOT VERIFIED.** I could not obtain computed styles. `lev.com` renders as a Next.js app whose stylesheet URLs are stripped by the markdown converter; the two HTML-passthrough proxies I tried returned HTTP 522, and I have no shell/Playwright in this session. **Do not let anyone quote a Lev hex or font size from this document — there isn't one.** What is observable from the rendered content: sans-serif throughout, generous whitespace, a persistent promotional banner, terminal/code screenshots as hero imagery, integration logo grids, and numbered `01 / 02 / 03` section markers — the last of which is on both AI-slop tell lists (§1.1), so **do not copy Lev's numbered section markers.**

**What Lev does best that the other two don't:** **naming the oversight contract in the client's language.** Three nouns — visible tool calls, reviewable actions, audit trail — plus a breadcrumb on every product page. Databricks and HubSpot both bury the equivalent in docs.

## 2.4 What the blend actually means

| Layer | Take from | Concretely |
|---|---|---|
| Shell | **Databricks** | Persistent expanded left sidebar; universal destinations pinned top; a slim persistent top bar for search + account; a **Recents** concept |
| Nav personalisation | **HubSpot** | Two levels max; bookmarks/pins if breadth ever demands it; permission-aware items |
| Nav *disclosure* | **Databricks** | Visible-but-locked beats hidden — teach the product's shape |
| Type | **Databricks** | DM Sans, weight 400/500, negative tracking only ≥48px, DM Mono for eyebrows/IDs |
| Colour | **Databricks** neutrals + **our** teal | Oat ground, navy ink, one accent, one placement; **HubSpot's** higher-contrast status badges |
| Data screens | **HubSpot** | One record scaffold reused everywhere (header / tabs / timeline / rails) |
| Agent trust copy + IA | **Lev** | Visible tool calls · reviewable actions · audit trail, as three named portal surfaces |
| Voice | **Lev** | Plain, confident, ownership-framed; no metering language |

## 2.5 Where the three genuinely conflict

1. **Restraint vs breadth.** Databricks earns calm by pinning ~7 universals and pushing the rest into domains; HubSpot has 14 primary categories and needs bookmarks, pinning and personalisation to stay usable. **We have one client, one-to-three agents, ~6 surfaces each.** HubSpot's machinery is a solution to a problem we do not have — adopting it would be cargo cult.
2. **Hidden vs visible nav.** HubSpot collapses by default and takes measurable user pain for it (§1.2); Databricks keeps the rail open with locked items visible. **Irreconcilable — pick Databricks.**
3. **Radius and scale.** Databricks marketing: 20px cards, 6px buttons, 60px H1. Our portal: 6–10px surfaces, 4px buttons, 30px max heading. HubSpot: 16px containers, 8px buttons, 80px H1. Marketing scales do not transfer to product UI, and `rounded-2xl` everywhere is a named AI-slop tell (§1.1). **Keep our product radii; take Databricks' *type weight* discipline, not its *type size*.**
4. **Accent colour.** Databricks' Lava red is the accent *and* would be our error colour — DESIGN.md already rejected adopting it for exactly this reason; HubSpot's orange has the same collision at lower intensity. **Teal stays; take the *discipline* (one accent, one placement) not the hue.**
5. **Permission handling.** HubSpot hides what you can't use; Databricks shows it locked. For us this is a **sales** decision, not a design one: locked-but-visible tools double as an upgrade path. Lean Databricks, but this is the weakest of the five.
6. **Body weight.** HubSpot sets body at **300**; Databricks at **400**; our DESIGN.md at 400. HubSpot's 300 at 16px on a warm ground will fail our contrast floor. **Reject.**

---

# PART 3 — Rules for the Ambitt portal (build from these)

## 3.0 What our code does today (verified, `client-portal/src/components/`)

Read `sidebar.tsx` and `portal-shell.tsx` on 2026-07-29:

- Sidebar is **240px (`w-60`), sticky, always expanded ≥`lg`**, hidden below with a hamburger drawer. **This is already the right call** (§1.2).
- Nav is `Home` + **"Your agents"**, and an agent expands *only when active* into **Overview / Communication / Tools / Activity / Leads / Configure**.
- **Two of those six are hash anchors** — `#communication` and `#settings` — so they carry no active state, aren't linkable, don't survive refresh, and don't register with back. `Configure` also isn't a page; it's a scroll position inside Overview.
- **There is no desktop top bar.** `AccountMenu` renders only in the mobile header; desktop account/sign-out live in the sidebar footer. There is **no global search** anywhere.
- The mobile drawer closes on Esc and on route change (`useEffect(() => setOpen(false), [pathname])`) but **does not push a history entry**, so **Android back exits the page instead of closing the drawer** — the exact NN/g failure and a Baymard back-button violation (§1.4). It also lacks `role="dialog"` / `aria-modal` / focus trap.
- Agent status in nav is a **colour dot only** (`dot-emerald` / `dot-blue` / `dot-red`), with `pending_approval` and `building` both rendering `dot-blue`. DESIGN.md's own rule is that colour is never the only signal.
- Content width is set **per page**, not by the shell (the footer alone pins `max-w-[1000px]`), which is how density drifts.

## 3.1 Navigation rules

1. **Sidebar, 240–260px, always expanded on desktop. Never collapse-by-default, never hover-to-expand.** ([NN/g 39%/27%/20% numbers](https://www.nngroup.com/articles/hamburger-menus/); [HubSpot's counter-example](https://community.hubspot.com/t5/HubSpot-Ideas/OPT-out-of-NEW-navigation-bar/idi-p/976234)). A user-initiated collapse toggle is fine; a default-collapsed state is not.
2. **Maximum two levels in the sidebar.** Level 1 = Home + each agent + Account. Level 2 = that agent's surfaces. Nothing nests deeper. (HubSpot's own ceiling; also the r/UXDesign consensus for anything beyond ~5 top items.)
3. **Show every agent's sub-nav shape, not just the active one.** Databricks pins all domains so users learn what exists ([rationale](https://www.databricks.com/blog/find-what-you-seek-new-navigation-ui)). Minimum: keep sub-items mounted for the active agent *and* show non-active agents' surface count or a hover preview. Where a surface is empty (no leads yet), **show it with an empty state, don't hide it** — hiding is how clients conclude we don't do that.
4. **Add a slim persistent top bar on desktop** carrying only globals: current context label, account menu, help/contact. *"Reserve the top bar for things that are true everywhere in the app"* ([SaaSUI](https://www.saasui.design/blog/saas-navigation-ux-patterns)). It also gives the mobile header a desktop parent instead of being an orphan.
5. **No command palette in v1.** It's a 2026 expectation for products with >10 features ([SaaSUI](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)) and we have ~6 per agent. Revisit when an account has 3+ agents.
6. **Breadcrumbs only where depth ≥3.** At our 2 levels NN/g says they're unnecessary, and a breadcrumb that appears on some pages and not others reads as sloppy ([r/UXDesign](https://reddit.com/r/UXDesign/comments/1fdl5kk/local_vs_offshore_devs/)). **Instead: every detail page gets one explicit "← Back to {list}" link in the page header**, always in the same position, always naming its destination.
7. **Every destination is a route.** Kill `#communication` and `#settings`; make them `/agents/[id]/communication` and `/agents/[id]/configure`. This is the single highest-leverage nav fix we can ship.
8. **Active state is teal + weight, never colour alone.** Current implementation (`--brand-tint` bg + `--brand-ink` + `font-medium`) is correct; extend the same treatment to sub-items so "where am I" is answerable at both levels ([SaaSUI: *"An active state on the sidebar plus breadcrumbs answers 'where am I' at every depth"*](https://www.saasui.design/blog/saas-navigation-ux-patterns)).
9. **Status in nav needs a shape or a word, not just a dot** — and `building` must not share `dot-blue` with `pending_approval`.

## 3.2 The back-and-forth rules (list → detail → back)

10. **Drawer for the peek, route for the work — and both are the same URL.** Implement with Next 16 **parallel + intercepting routes**: soft nav from the list opens the drawer at `/agents/[id]/activity/[eventId]`; a paste of that URL or a refresh renders the **full page** ([Next.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes)). This is verbatim the panel-plus-page 80/20 the r/UXDesign thread converged on ([thread](https://reddit.com/r/UXDesign/comments/1adq08w/)).
11. **Back must close the drawer, not leave the page.** Non-negotiable — 37% of sites get overlays wrong ([Baymard](https://baymard.com/blog/back-button-expectations)). Intercepting routes give this for free; the mobile nav drawer needs the same treatment via a history entry (**not** `CloseWatcher` — [not Baseline](https://developer.mozilla.org/en-US/docs/Web/API/CloseWatcher)).
12. **Returning to a list restores scroll position and filter state within the session**; reset after ~30–60 minutes of inactivity ([NN/g](https://www.nngroup.com/articles/saving-scroll-position/)). Filters and tab selection belong in the URL query string so a client can send us a link to what they're looking at.
13. **Full page — never a drawer — for: Configure, Tools/credentials, any multi-step approval with an editable draft.** Many fields, several steps, and destructive-dismissal risk ([SaaSUI](https://www.saasui.design/blog/saas-modal-dialog-ux-patterns)).
14. **Never stack overlays. Always a visible Close. Partial over full-page overlays.** ([NN/g](https://www.nngroup.com/articles/accidental-overlay-dismissal/)) On mobile, the drawer becomes a full route push, not a sheet over a sheet.
15. **Centred modals only for destructive confirmation** (pause agent, revoke a tool, cancel). Everything else is a drawer or a page. Practitioner sentiment on floating modals for detail is openly negative ([r/UXDesign](https://reddit.com/r/UXDesign/comments/1adq08w/)).

## 3.3 Agent-trust rules (the part that's actually our product)

16. **Name the oversight contract on the portal, in Lev's three nouns**: *what it's preparing* (visible tool calls), *what's waiting on you* (reviewable actions), *what it already did* (audit trail) ([lev.com/products/lev-agent](https://www.lev.com/products/lev-agent)). These are three portal surfaces, not marketing copy.
17. **Approvals get four verbs, not two: Accept / Edit / Respond / Ignore** — LangChain's [Agent Inbox](https://github.com/langchain-ai/agent-inbox) schema. Our current approve/dismiss forces a client who wants one sentence changed into a "dismiss".
18. **Show the plan before execution, not just the log after.** *"The user approves the full plan, modifies individual steps, or removes steps before execution begins"* ([Fuselab, May 2026](https://fuselabcreative.com/ui-design-for-ai-agents/)); post-hoc logs alone are documented as insufficient ([arXiv 2401.13138](https://arxiv.org/pdf/2401.13138)).
19. **Errors carry three parts: what happened, why, what to try next.** *"Generic retry buttons are insufficient for agent interfaces"* ([Fuselab](https://fuselabcreative.com/ui-design-for-ai-agents/)). This upgrades DESIGN.md's "edge states get the same craft" from an aesthetic rule to a trust requirement — and it's the same failure mode as an agent misreporting itself, which collapses trust outright ([arXiv 2401.13138](https://arxiv.org/pdf/2401.13138)).
20. **Every claim on the portal links to its evidence.** Lev's *"Responses point back to the records and documents behind the answer"* is the standard. A count of emails sent must click through to the emails.
21. **Do not build a metrics wall.** *"The worst ones? Just more dashboards to check"* ([r/AI_Agents](https://reddit.com/r/AI_Agents/comments/1j5jwmk/)). Home answers three questions only: what did it do, what needs me, what's next.

## 3.4 Visual rules (deltas to `client-portal/DESIGN.md` — everything else stands)

22. **Keep the existing tokens.** They verify against Databricks' published/measured values (§2.1). No change to `--text`, `--text-3`, `--border`, `--bg`, or the teal three-step.
23. **Keep our radii (4px buttons / 6–10px surfaces). Explicitly reject Databricks' 20px card radius** — that's a marketing-site value and `rounded-2xl everything` is a named AI-slop tell ([signs-of-ai-design](https://github.com/febbhav/signs-of-ai-design)).
24. **Adopt DM Mono for eyebrows, IDs, timestamps and stat numerals.** Databricks uses DM Mono for exactly these ([shadcn.io](https://www.shadcn.io/design/databricks)) and we already ship DM Mono for agent addresses and cron strings. It buys hierarchy without a second family or a heavier weight.
25. **Raise status-badge contrast**, following HubSpot's stated 2025 change (*"distinct colors with higher contrast for clarity"*, target **WCAG 2.2 AA**) ([product.hubspot.com](https://product.hubspot.com/blog/designing-for-your-next-decade-growth)). Our four status colours already clear 4.5:1; the badges need the same audit on tinted backgrounds.
26. **One page scaffold, reused.** Supabase's praised property — *"one page template, many tools"*, *"Consistent page scaffolding (header, tabs, table)"* ([AdminLTE, Jul 2026](https://adminlte.io/blog/saas-dashboard-design-examples/)). Every agent surface: page header (title + status + one primary action + back-link when nested) → optional tabs → content. Set the content max-width **in the shell**, not per page.
27. **Hierarchy from spacing and weight, never from a lighter gray** — Vercel's praised property, and already DESIGN.md's rule about `--text-4`.
28. **Ban the six imported tells** on top of DESIGN.md's existing list: colored left/top border strips, numbered `01/02/03` section markers (Lev has these — don't copy them), icon-topped feature-card grids, uppercase kicker labels above every section, animated stat counters, and the same fade-in on everything ([adriankrebs](https://www.adriankrebs.ch/blog/design-slop/), [signs-of-ai-design](https://github.com/febbhav/signs-of-ai-design)).

## 3.5 Steal / reject, one line each

| Reference | Steal | Reject |
|---|---|---|
| **Databricks** | Expanded pinned sidebar · Recents as a destination · visible-but-locked items · a deliberately simplified surface for non-experts (Genie One) · DM Sans 400/500 · one accent, one placement · ink-tinted neutrals | 20px card radius · 60px display type · lava red as accent · mega-menus |
| **HubSpot** | Two-level ceiling · global top bar · bookmarks/pinning *if* breadth arrives · permission-aware menus · higher-contrast status badges · one record scaffold | Collapse-by-default + hover-expand · 14 primary categories · 300-weight body · hiding unavailable features |
| **Lev** | The trust triad as three real surfaces · breadcrumb on product pages · plain confident ownership voice · translating usage into work units | Credit/metering language · numbered `01/02/03` markers · terminal-screenshot hero (wrong audience) |

---

## Confidence

**Three highest-confidence recommendations**

1. **Never collapse the sidebar by default.** Backed by a 179-participant study with four converging metrics ([NN/g](https://www.nngroup.com/articles/hamburger-menus/)) *and* a live natural experiment with documented user backlash ([HubSpot Community](https://community.hubspot.com/t5/HubSpot-Ideas/Refreshed-Navigation-Menu-and-Sidebar/idi-p/963264)). Our users are occasional non-technical clients — the population the study covers.
2. **Every destination gets a URL; back must behave.** Baymard's 59%/37%/27% benchmark ([link](https://baymard.com/blog/back-button-expectations)), NN/g on overlay dismissal ([link](https://www.nngroup.com/articles/accidental-overlay-dismissal/)) and the framework primitive that solves it in our exact installed version ([Next.js 16.2.12](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes)) all point one way. Our two hash-anchor nav items are a live bug, not a preference.
3. **The portal's centre of gravity is oversight, not metrics** — plan-before-execution, four-verb approvals, source-linked claims, three-part errors. Converging evidence from an empirical study ([arXiv 2606.18716](https://arxiv.org/pdf/2606.18716)), the visibility literature ([arXiv 2401.13138](https://arxiv.org/pdf/2401.13138)), the closest competitor's own product page ([Lev](https://www.lev.com/products/lev-agent)), the reference OSS implementation ([Agent Inbox](https://github.com/langchain-ai/agent-inbox)), and unprompted practitioner hostility to dashboards ([r/AI_Agents](https://reddit.com/r/AI_Agents/comments/1j5jwmk/)).

**Least sure: the drawer-plus-route detail pattern (§3.2, rules 10–15).**
The mechanism is solid and free in our framework, but the evidence that a drawer is *better than a plain page* for our content is thin: one r/UXDesign thread where nearly every comment sits at score 1, an opinion blog, and no study. The in-thread objections are real — unclear linkage back to the originating row, wasted width, and a mobile story that has to be rebuilt anyway. Our activity/leads rows may simply not be dense enough to need a peek layer. **Suggested resolution: build the routes first (they're required regardless), ship detail as full pages, and only add the intercepting-route drawer if clients demonstrably bounce back and forth.** Also genuinely unresolved: whether unavailable tools should be visible-but-locked (Databricks) or hidden (HubSpot) — that's Kyle's call on sales strategy, not a design finding.

**Known gaps in this research**
- **No X/Twitter evidence at all** (platform unreachable — see Method). If design-Twitter sentiment is load-bearing for the decision, someone with an account should sanity-check §1.1.
- **Lev's exact type and colour values are unverified.** Structure, IA, copy and pricing are verified from the live site; visual tokens are not.
- **Databricks' and HubSpot's numeric type/colour values come from third-party automated scrapes of their *marketing* sites**, corroborated by first-party brand pages that truncate under fetch. Directionally reliable, not spec-grade — and marketing values should not be transplanted into product UI without judgement.
- **HubSpot's record-page three-column layout is asserted from familiarity, not a fetched spec** (the KB URL 404s). Verify before designing against it.
- HubSpot community complaint quotes are search-indexed snippets; `community.hubspot.com` returns 403 to this fetcher.
