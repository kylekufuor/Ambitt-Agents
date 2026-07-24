# Website Messaging + Anti-AI-Slop Research

Assignment: use-case-first messaging, landing structure, anti-AI-slop rules, and trust patterns for the ambitt.agency marketing site. Live research as of July 2026. Practitioner reports are separated from vendor marketing throughout.

---

## VERDICT (adopt these)

1. **Lead with the job, not the tech.** Buyers do not search for "autonomous agents." They describe a chore they hate and want gone. The hero must name a specific task + the outcome, in their words, in the first 5 seconds. ([roastmylandingpage](https://blog.roastmylandingpage.com/before-and-after-landing-page/), [theproductperson](https://theproductperson.substack.com/p/the-product-person-38-landing-page))
2. **"Here's the task → here's what lands in your inbox" blocks** beat a feature grid. Show the before/after and the artifact (the actual email/report the agent sends).
3. **The "no dashboard" angle is a real, felt pain — sell it.** Dashboard/tool fatigue is documented and widespread; "it just shows up in your inbox" is a differentiator, not a limitation. ([Sigma data fatigue](https://www.sigmacomputing.com/blog/data-fatigue), [IT Business Today](https://itbusinesstoday.com/hr-tech/digital-fatigue-and-ai-overload-the-hidden-cost-of-intelligent-workplaces/))
4. **Kill every AI-slop tell** below. A practitioner scored 1,590 Show HN pages against 16 tells; 22% were heavy slop, 32% mild — the exact averaged look buyers now subconsciously discount. ([Adrian Krebs](https://www.adriankrebs.ch/blog/design-slop/))
5. **Trust = named agents doing named tasks with real artifacts + a real founder face.** With no logos, specificity is the credibility. Fake "Trusted by" logos and stock testimonials backfire, hard, especially with the technical/Reddit crowd. ([geeksforgrowth](https://geeksforgrowth.com/startup-build-trust-early/), fake-signal backfire below)

---

## 1. Voice of customer — how buyers actually describe the job

The search layer surfaces aggregator/blog paraphrase more readily than raw threads, so each phrasing below is tagged: **[verbatim]** = quoted from a named post, **[practitioner-characterization]** = a practitioner writer's description of the language buyers use, **[vendor]** = marketing copy (use as anti-pattern / contrast, not as our voice).

The pattern is consistent: **plain-language chores + "so I don't have to" + "while I sleep."** Nobody asks for "agentic workflows."

1. "Read my mind and tell me what to do next." — **[verbatim, Teamblind]** ([source](https://www.teamblind.com/post/im-an-engineer-what-do-you-want-automated-laqgwuwg))
2. "Summarize [the] content [from] the long messages." — **[verbatim, Teamblind]** ([source](https://www.teamblind.com/post/im-an-engineer-what-do-you-want-automated-laqgwuwg))
3. "Soul-sucking, repetitive stuff — invoicing clients, scheduling social media posts, answering the same questions, sending emails." — **[practitioner-characterization]** (recurring across automation writers)
4. "Email follow-ups, status updates, calendar wrangling, drafting similar docs repeatedly, logging things, copying things, formatting things." — **[practitioner-characterization]** (the "list of things you wish someone else could do")
5. "10 things AI can take off your plate this week (no setup needed)." — **[practitioner-characterization]** — "take it off my plate" is the dominant verb phrase.
6. "Schedule meetings while you're busy and send the follow-up emails you keep forgetting." — **[practitioner-characterization]** — note the emotional hook: *forgetting*, guilt.
7. "Send personalized follow-ups, nurture cold leads... while you're busy doing other things." — **[practitioner-characterization]**
8. "You set up the task before you leave, and by the time you're back with coffee, the work is done — reports compiled, leads researched, emails drafted." — **[vendor, ruh.ai]** ([source](https://www.ruh.ai/blogs/ai-agents-work-while-you-sleep)) — the "coffee's-done" image is a strong, human frame worth borrowing.
9. "Monitors inbound leads 24/7... researches prospects, drafts outreach, and books meetings — all while your team sleeps." — **[vendor, MindStudio]** ([source](https://www.mindstudio.ai/blog/ai-agent-runs-while-you-sleep-scheduled-automations-claude))
10. "No dashboard to remember to open." — **[vendor]** (competing "AI employee" sites already lean on this; it maps exactly to our model).
11. "Shows up as a colleague in the apps you already use." — **[vendor]** — the "already use your tools" frame is table stakes now; we do it literally.
12. "Instead of buying software licenses per seat, companies hire AI employees that deliver outcomes." — **[practitioner, JTBD]** ([source](https://medium.com/@mikeboysen/ai-strategy-a-practical-framework-using-jobs-to-be-done-jtbd-5e86f3fa7528)) — outcomes, not features, is the frame.

**Language that makes buyers instantly "get it":** concrete task nouns (invoices, leads, follow-ups, the weekly report), the phrases "take it off my plate," "so I don't have to," "while I sleep / while you're busy," and a named deliverable ("you get a report every Monday"). **Language that makes them glaze over:** "agentic," "autonomous," "orchestration," "leverage," "streamline," "empower," "supercharge," "world-class," "enterprise-grade" — the last five are flagged as *instant AI/SaaS tells* in the slop analysis. ([Krebs](https://www.adriankrebs.ch/blog/design-slop/))

---

## 2. Use-case-first landing structure (what lands in 5 seconds + converts)

Buyers "assess what you do and whether you're right for them" in the first few seconds; unclear or everyone-focused heros bounce them. ([theproductperson](https://theproductperson.substack.com/p/the-product-person-38-landing-page), [marketcurve](https://marketcurve.substack.com/p/use-these-5-q-and-as-to-put-on-your))

**Section order that converts for outcome-led B2B:**

1. **Hero = one job + one outcome, named.** Terse, confident headline (not "Build the future"). Subhead states exactly what it does and for whom in one line. One CTA. Feature-first copy underperforms; outcome-led with a mechanism support wins in B2B. ([unicornplatform](https://unicornplatform.com/blog/b2b-landing-page-examples/))
2. **Before → After.** Literally use the words. "Before: you spend Friday afternoon chasing 40 unpaid invoices. After: they're chased, logged, and the summary's in your inbox." Emotional/evocative beats a functional feature list. ([roastmylandingpage](https://blog.roastmylandingpage.com/before-and-after-landing-page/))
3. **"A day in the life of your agent" / task→artifact blocks.** Each block: a real task on the left, the real thing it emails you on the right (a rendered email, a CSV, a report). This is our version of Linear's "show the real product, no icons/illustrations" move. ([First Round / Saarinen](https://review.firstround.com/podcast/inside-linear-why-craft-and-focus-still-win-in-product-building/))
4. **Named example agents.** Give 3–4 agents names + a one-line JD + the exact tools they touch + what shows up in your inbox. This is the use-case gallery.
5. **How it works (3 honest steps, not "1-2-3" slop cards):** hire → it connects to your tools → work arrives by email/text. Keep it prose-plus-artifact, not three identical icon cards.
6. **Proof / objections / FAQ.** Trust-first pages resolve: clear promise → how it works → proof artifacts → objections → one CTA. ([geeksforgrowth](https://geeksforgrowth.com/startup-build-trust-early/))
7. **Founder voice close + single CTA.**

**Structural rule:** one primary segment, one conversion objective, first-screen clarity. Multi-audience heros convert worse and produce lower lead quality. ([Salespanel/unicornplatform](https://unicornplatform.com/blog/b2b-landing-page-examples/))

---

## 3. Anti-AI-slop catalog (critical — nobody can tell AI built it)

Primary evidence: Adrian Krebs scored **1,590 Show HN landing pages** against 16 AI design patterns — **22% heavy slop (4+ tells), 32% mild, 46% clean**; the post hit #1 on HN (333 pts, 235 comments). His conclusion: a single tell isn't damning, but **cumulative tells = "uninspired," and generic is worse than ugly because it's forgettable.** ([Krebs](https://www.adriankrebs.ch/blog/design-slop/), corroborated by [Developers Digest 16 patterns](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it), [925studios](https://www.925studios.co/blog/ai-slop-design-tells), [Superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic))

### The tells (DON'T)

**Typography**
- Inter as the default body/hero font — the single highest-signal tell ("highest-probability answer to 'pick a font'"). ([alanwest/DEV](https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p))
- The over-used AI combo: **Space Grotesk + Instrument Serif + Geist** together. **Note: our brand font is Geist — see codebase-fit caveat below.**
- Serif *italic* on one accent word inside an otherwise-Inter hero.
- ALL-CAPS section labels / all-caps headings everywhere.

**Color**
- Indigo→purple / blue→purple gradient hero (origin: Tailwind's `bg-indigo-500` default; Adam Wathan has publicly apologized that "every AI-generated interface on earth is purple"). ([prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website))
- Permanent dark mode with medium-grey body text failing WCAG AA contrast.
- Large colored glows / colored box-shadows.

**Layout**
- Centered-everything hero with a generic sans.
- A **badge/pill positioned directly above the H1** ("✨ Now with AI").
- **Three equal-width rounded cards in a row**, each: thin-line icon on top, four-word title, one sentence of filler.
- **Colored left/top border on cards** — "almost as reliable a sign of AI design as em-dashes are for AI text." ([Krebs](https://www.adriankrebs.ch/blog/design-slop/))
- Numbered "1 · 2 · 3" step sequences.
- Stat-banner row (10x / 99.9% / 24/7).
- Sidebar/nav with emoji icons; emoji as section headers.
- Uniform 16px border-radius on everything; glassmorphism / frosted cards; shadcn/ui defaults untouched.

**Icons**
- Default Lucide / Heroicons line icons that could belong to any product.

**Copy**
- "Streamline / empower / supercharge / unlock / seamless / world-class / enterprise-grade / robust / leverage / delve into." Weightless headlines: "Build faster. Ship smarter." "Build the future."
- Em-dash-heavy prose reads as LLM output to this audience — vary punctuation.

### What reads as human-crafted / premium (DO)

- **Pick a distinctive, licensed face** — practitioners cite Söhne, Haas Grotesk (Neue Haas), Untitled Sans, Migra, GT-family, Inktrap — or a genuinely characterful display face for the hero. Anything but default Inter. ([Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it))
- **One opinionated palette, not a gradient.** Warm earth tones, high-contrast black + one bright accent, or a cream-and-ink combo. Our teal is already off the purple default — commit to it.
- **Show the real product / real artifacts, no illustration.** Linear's premium feel comes from real UI screenshots on a considered background, "no icons, no illustrations, just the product," plus a terse confident headline. Craft and specificity over templated polish. ([Saarinen / First Round](https://review.firstround.com/podcast/inside-linear-why-craft-and-focus-still-win-in-product-building/), [YC](https://www.ycombinator.com/library/Mk-brand-design-tips-from-linear-founder-karri-saarinen))
- **One strong layout primitive, repeated** — not five card styles. Asymmetry, generous but intentional (not "predictable") spacing, left-aligned editorial blocks over centered-everything.
- **Cards separated by elevation/whitespace, not gray 1px borders** (a top AI tell) — this already matches our portal DESIGN.md.
- **Custom / duotone iconography**, not stock Lucide.
- **Write like a person:** contractions, specific nouns, an actual point of view. Passes the "would a human say this in a DM" test.

---

## 4. Trust for a new/unknown brand (no logos yet)

Trust is "created by consistent delivery and transparent communication," not polished language; you don't need a perfect identity system to be trusted. A trust-first page carries: clear promise → how it works → **proof artifacts** → objections/FAQ → one CTA. Proof comes in three forms: **product evidence** (screenshots, demo clips, interactive sandbox), **process evidence** (onboarding steps, timelines, what happens when), and **founder evidence** (relevant experience, credible constraints). ([geeksforgrowth](https://geeksforgrowth.com/startup-build-trust-early/))

### What actually builds credibility (real)
- **Named agents doing named tasks** with the exact tools listed and the exact artifact shown. Specificity *is* the proof when you have no logos.
- **Concrete outcome numbers you can stand behind** ("chased 40 invoices, recovered $12k, took 6 minutes of your time") — grounded, not "10x."
- **Short demo clips / an actual sent email** — product evidence outperforms claims.
- **Founder voice + face.** The company is new but the founder isn't; a real name, face, and "why we built this" reads as accountable. Reddit rewards genuine, community-aware presence and punishes pitch-first accounts. ([vccorner](https://www.thevccorner.com/p/reddit-playbook-startup-founders))
- **Transparent constraints** — saying what the agent *won't* do reads as honest and raises trust.

### What feels fake (avoid)
- **Fake/borrowed "Trusted by" logo walls** and stock testimonials with headshots — bought/fake validation signals have eroded trust and "make things worse," and Reddit/technical audiences actively call out inauthenticity.
- Round, unsourced hero stats ("99.9%", "10,000+ users") with no story behind them.
- Over-polished, everyone-focused copy that reads as templated — for this audience, too-clean = suspicious.

---

## 5. Fit to our codebase / stack

- **Brand system already exists:** teal `#00b3b3` (`#099` hover), neutral palette, Geist (per `reference_ambittmedia_brand_palette` memory); the client portal codifies most anti-slop rules already in `client-portal/DESIGN.md` — Lexend, cool-slate, **custom duotone icons (never Lucide/Heroicons), cards separated by elevation not gray borders, no purple gradients, no glassmorphism.** The marketing site should inherit these, not reinvent.
- **Geist caveat:** Geist now appears on practitioner slop-combo lists. It's not fatal alone, but do NOT ship Geist-body + Inter + purple; pair Geist with our teal, a characterful hero face, and real product artifacts so no *cluster* of tells forms. Consider a distinctive display face for the hero H1 only.
- **The teal already dodges the #1 color tell** (purple). Lean into it as the single opinionated accent; avoid gradients entirely.
- **Our model is the differentiator to dramatize:** results arrive by email/WhatsApp, client never logs into a dashboard. That is literally the "no dashboard to remember to open" pain competitors only claim — show a real agent-response email as the hero artifact.
- **Website is a separate Railway service** (per recent commits) — keep its design tokens synced with the portal's DESIGN.md rather than forking a new theme.
- **Use the `frontend-design` skill** for any actual UI build (standing team rule), and treat `client-portal/DESIGN.md` as the source of truth before writing site UI.

---

## Sources (practitioner vs vendor labeled)

**Practitioner / primary data**
- Adrian Krebs — Scoring 1,590 Show HN pages for AI design patterns (HN #1): https://www.adriankrebs.ch/blog/design-slop/
- Developers Digest — 16 patterns that out a vibe-coded app: https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it
- 925studios — AI slop fonts/gradients tells: https://www.925studios.co/blog/ai-slop-design-tells
- Superdesign — why AI design looks generic: https://superdesign.dev/blog/why-ai-design-looks-generic
- alanwest / DEV — blame Tailwind's indigo-500: https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p
- prg.sh — the same purple gradient website: https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
- Karri Saarinen / Linear (founder voice) — First Round: https://review.firstround.com/podcast/inside-linear-why-craft-and-focus-still-win-in-product-building/ ; YC: https://www.ycombinator.com/library/Mk-brand-design-tips-from-linear-founder-karri-saarinen
- roastmylandingpage — before/after landing pages: https://blog.roastmylandingpage.com/before-and-after-landing-page/
- theproductperson — 5-second hero clarity: https://theproductperson.substack.com/p/the-product-person-38-landing-page
- marketcurve — high-intent Q&A on landing pages: https://marketcurve.substack.com/p/use-these-5-q-and-as-to-put-on-your
- geeksforgrowth — building trust without a brand: https://geeksforgrowth.com/startup-build-trust-early/
- The VC Corner — Reddit playbook for founders: https://www.thevccorner.com/p/reddit-playbook-startup-founders
- Teamblind — "what do you want automated" thread (verbatim VOC): https://www.teamblind.com/post/im-an-engineer-what-do-you-want-automated-laqgwuwg
- JTBD for AI (Mike Boysen): https://medium.com/@mikeboysen/ai-strategy-a-practical-framework-using-jobs-to-be-done-jtbd-5e86f3fa7528
- Sigma — data/dashboard fatigue: https://www.sigmacomputing.com/blog/data-fatigue
- IT Business Today — digital/AI overload: https://itbusinesstoday.com/hr-tech/digital-fatigue-and-ai-overload-the-hidden-cost-of-intelligent-workplaces/

**Vendor marketing (used as contrast / competitor positioning — not as our voice)**
- ruh.ai — agents that work while you sleep: https://www.ruh.ai/blogs/ai-agents-work-while-you-sleep
- MindStudio — scheduled overnight agents: https://www.mindstudio.ai/blog/ai-agent-runs-while-you-sleep-scheduled-automations-claude
- hireworkforce.ai / cellcog.ai / agent-ctrl.com / teammates.ai — "hire an AI employee" positioning ("no dashboard," "shows up as a colleague in apps you already use," "3x reply rates")
