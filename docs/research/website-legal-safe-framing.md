# Legally-safe framing: "our agents operate the tools you already use"

Research brief — Rex (Research Analyst), 2026-07-23.
Requested by Kyle (CEO) via CTO/main session.

> **Not legal advice.** I'm not a lawyer. This is a research synthesis of live vendor
> pages, law-firm commentary, and case law to de-risk marketing copy. Have outside
> counsel (trademark + tech-transactions) sanity-check the final website copy before it
> ships. Items I'm genuinely unsure about are marked **[UNCERTAIN]**.

---

## TL;DR verdict

**The safest rule: don't name the vendor at all.** Use category nouns
("listing platforms," "your CRM," "market-data tools") and customer-possessive framing
("your agent, your logins, your tools"). Nominative fair use *can* let you say
"works with [Tool]" — but it's a **defense you raise after you're sued**, not a shield
that stops the suit. For a CoStar-class counterparty that is famously litigious, the
cost/benefit of naming them is terrible. Naming = optional upside, real downside.
Category framing = zero trademark exposure and the copy still lands.

This matches what the mainstream automation tools actually do on their marketing
surfaces: **category words + "the tools you already use,"** and they only name specific
apps for *real* integrations, as word-marks (never logos), never with "official/partner/
endorsed," and often with a trademark notice.

---

## 1. Nominative fair use vs. trademark risk — where the safe line is

### The three-factor test (New Kids on the Block v. News America; Ninth Circuit)
A commercial user gets a nominative-fair-use defense only if **all three** hold:

1. The product/service **can't be readily identified without** the mark;
2. Only **as much of the mark as is reasonably necessary** is used (i.e., the *word*
   "CoStar," never the logo, never the trade dress);
3. The user does **nothing that suggests sponsorship or endorsement** by the mark holder.
   ([Ninth Circuit jury instruction 15-26](https://www.ce9.uscourts.gov/jury-instructions/civil/chapter-15/15-26-defenses-nominative-fair-use/),
   [ABA Landslide](https://www.americanbar.org/groups/intellectual_property_law/resources/landslide/archive/nominative-trademark-use-affirmative-or-negative-defense-infringement/))

"Works with / compatible with [Brand]" is the *textbook* protected nominative use —
**as long as it's truthful, minimal, and doesn't imply endorsement.**
([INTA fact sheet](https://www.inta.org/fact-sheets/fair-use-of-trademarks-intended-for-a-non-legal-audience/),
[Jimerson Birr](https://www.jimersonfirm.com/blog/2025/10/whats-fair-use-in-trademark-law-and-how-does-it-apply-to-my-business/),
[Harrigan IP](https://harriganip.com/blog/nominative-fair-use-trademark-law/))

### Why the defense is not the same as safety
- It's a **fact-intensive defense** that **circuits apply differently** (9th, 3rd, 2nd all
  diverge), so outcomes are unpredictable and you still pay to litigate.
  ([Lexology / 2d Cir.](https://www.lexology.com/library/detail.aspx?g=4b277db5-3d1a-4a12-bf91-e831d7c30883),
  [IPKat](https://ipkitten.blogspot.com/2016/05/the-nominative-fair-use-defense-in.html))
- The **third factor (implied endorsement)** is exactly where a "your agent operates
  [Tool]" site is most exposed: a reader could infer the tool blessed our access.
- **False endorsement / unfair competition** under **Lanham Act §43(a)** is a separate
  hook even if straight infringement fails — any implication of partnership, approval, or
  official status crosses the line.
  ([Trademark Engine](https://www.trademarkengine.com/blog/false-endorsement-unfair-competition/),
  [Sierra IP](https://sierraiplaw.com/lanham-act-unfair-competition/))

**Safe line:** naming a tool factually ("works with QuickBooks") is defensible;
the moment copy implies affiliation/endorsement/official status, or pairs the name with a
logo, you lose the defense and invite a §43(a) claim. For our CRE use case the cleaner
move is to not name it at all.

### CoStar-specific: this counterparty is uniquely litigious
CoStar has run a **multi-year IP + antitrust war against CREXi** (2020→2025): federal
findings that CREXi copied/cropped tens of thousands of CoStar photos from LoopNet, plus a
Ninth Circuit antitrust reversal — an expensive, aggressive, still-running fight.
([9th Cir. opinion, Justia](https://law.justia.com/cases/federal/appellate-courts/ca9/23-55662/23-55662-2025-06-23.html),
[CoStar legal page](https://www.costargroup.com/press-room/legal),
[CoStar press, June 2025](https://www.costargroup.com/press-room/2025/federal-court-finds-rival-crexi-copied-and-cropped-thousands-costars-copyrighted))
Naming CoStar/LoopNet — even truthfully — puts us on the radar of a company that
**sues over its data and marks as a matter of policy.** Strong reason to stay generic.

---

## 2. How real automation tools describe operating third-party sites

Dominant safe pattern across the category = **category/possessive language on the hero,
named apps only for genuine integrations (word-mark, no logo, no affiliation claim).**

| Tool | How they describe it | Naming behavior |
|---|---|---|
| **Lindy** | "I connect with **all your favorite apps**," "your stack," "read your Slack, cross-reference your calendar, draft in Gmail" | Names apps it truly integrates; leans on category/possessive framing ([lindy.ai](https://www.lindy.ai)) |
| **Bardeen** | "**runs in your browser**," "acts on **whatever page you're looking at**," plain-English "find contacts on LinkedIn… add to HubSpot" | Names apps for real integrations; core pitch is browser/session-based, customer-operated ([Bardeen](https://www.bardeen.ai/integrations/browser-agent)) |
| **Browse AI** | "**Works on almost any website**," "scrape and monitor data from **almost any website**" | Deliberately generic ("any website") rather than vendor-specific ([browse.ai](https://www.browse.ai/)) |
| **Zapier** | Partners must **write out "Zapier" in copy, may NOT use standalone logos**, and may not imply affiliation unless approved | Explicit trademark guardrails ([Zapier trademark notice](https://zapier.com/legal/trademark-notice), [partner branding](https://docs.zapier.com/integrations/publish/branding-guidelines)) |
| **PhantomBuster** | Frames access as "**the same session cookies a browser uses**," "**your** legitimate account," "doesn't store passwords"; adds "not legal advice, you're responsible for ToS compliance" disclaimers | Customer-operated + explicit disclaimer posture ([PhantomBuster blog](https://phantombuster.com/blog/social-selling/is-linkedin-scraping-legal-is-phantombuster-legal/)) |
| **Generic SaaS** | "plug into **the tools teams already use**," "work faster inside **what they already use**" | Pure category framing ([Userpilot](https://userpilot.com/blog/saas-automation-tools/)) |

**Takeaways for us:**
- The hero copy is almost always **category + possessive**, not vendor names.
- Where names appear, it's for a **real integration**, as the **word** only, with **no logo**
  and **no "official/partner"** language. Zapier literally forbids partners from using its
  logo and from implying affiliation.
- PhantomBuster's "your own account / your own session / we don't store passwords" framing
  is the closest analog to our CRE case and is worth borrowing — it puts the customer, not
  us, in the driver's seat.

---

## 3. The specific claims to avoid (and the words that trigger them)

### a) Trademark infringement / false endorsement (Lanham Act)
- **Trigger words:** "official," "certified," "partner," "endorsed by," "in partnership
  with," "powered by [Tool]," "[Tool]-approved," or a **vendor logo** on our site.
- **Avoid it by:** not naming the vendor; if named, word-only + a notice
  ("X is a trademark of its owner; we are not affiliated with or endorsed by them").
  ([Wilson Legal](https://www.wilsonlegalgroup.com/blogs/trademark-law/use-of-third-party-trademarks-in-advertising),
  [PatentPC](https://patentpc.com/blog/the-legal-implications-of-using-competitors-trademarks-in-ads))

### b) Tortious interference / inducing breach of the vendor's ToS
Elements a plaintiff must prove: **(1)** a valid contract (the vendor's ToS with our
customer), **(2)** our **knowledge** of it, **(3)** **intentional inducement** to breach,
**(4)** actual breach, **(5)** damages.
([FindLaw](https://www.findlaw.com/smallbusiness/liability-and-insurance/tortious-interference.html),
[Norton Rose Fulbright](https://www.nortonrosefulbright.com/en/knowledge/publications/cb78db86/pleading-the-element-of-inducement-for-tortious-interference-with-contract-claims))
Ordinary advertising is *not* interference; **inducement through improper means is.**
This theory is live in scraping fights — **X v. Bright Data** and **Reddit v. Anthropic**
both plead tortious interference (Bright Data "induced users to breach their agreements").
([FBM](https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/),
[Zwillgen](https://www.zwillgen.com/alternative-data/how-artificial-intelligence-shaping-web-scraping-litigation/))
- **Trigger words:** "get around [Tool]'s limits," "even though they don't allow it,"
  "against their terms," "no seat/license needed," "avoid paying for extra seats,"
  anything showing we *know* the ToS and are pitching a way to break it.
- **Avoid it by:** framing the agent as working **inside the customer's own licensed
  account, under the customer's direction** — the customer is already authorized; we
  supply labor, not access we don't have.

### c) "Circumventing access controls" (CFAA / anti-circumvention framing)
- **Trigger words:** "bypass login," "circumvent," "beat the paywall," "get past blocks,"
  "no API so we scrape it anyway." Even when public-data scraping survives CFAA, **ToS
  breach-of-contract claims still stick** (Meta v. Bright Data).
  ([Skadden](https://www.skadden.com/insights/publications/2024/05/district-court-adopts-broad-view),
  [Seidman Law](https://seidmanlawgroup.com/web-scraping-vs-terms-of-use/))
- **Avoid it by:** never describing what we do as bypassing, circumventing, or defeating
  anything. The agent *logs in normally, like the customer would.*

### d) Defamation / trade libel
- **Trigger words:** disparaging the tool ("[Tool] is overpriced/clunky/slow — our agent
  does it better"). Comparative knocks invite trade-libel **and** tortious-interference.
- **Avoid it by:** never comparing to or criticizing a named vendor.

### e) **[UNCERTAIN] — "customer is authorized, so we're fine" is not airtight**
Baker McKenzie (June 2026) warns that **a user's permission to their agent does not
automatically inherit the platform's authorization** — agentic access can still be treated
as unauthorized/unfair where it exceeds platform restrictions or masks identity.
([Baker McKenzie](https://www.bakermckenzie.com/en/insight/publications/2026/06/united-states-legal-accountability-for-ai-agents))
So "your agent, your account" **reduces** interference/CFAA risk but doesn't eliminate it.
Don't over-promise "fully authorized/compliant" in copy — counsel should decide how far to
lean on the authorization theory, and we should keep robots-respecting, no-identity-masking
posture in the product itself.

---

## 4. Paste-ready safe copy (pick/mix; counsel to bless final)

**Option A — customer-framed / credentials (recommended lead):**
> **Your agent. Your logins. Your tools.**
> Our agents work inside the software your team already pays for and uses every day —
> signing in with your own credentials, under your direction, and doing the work you'd
> otherwise do by hand.

**Option B — CRE use case, no vendor named:**
> Sourcing commercial real estate? Your agent works directly in the **listing and
> market-data platforms your brokers already subscribe to** — pulling comps, tracking new
> listings, and organizing results — the way a junior analyst on your team would.

**Option C — generic "we work your stack":**
> We don't replace your stack — we work it. Your agent operates the web apps, dashboards,
> and portals your business already relies on, using **your own accounts**.

**Option D — short taglines / hero:**
> "Works with the tools you already use."
> "Your tools, your accounts — your agent does the clicking."

**Option E — capability line without a vendor:**
> From your CRM to your industry's research and listing platforms, your agent signs in and
> gets the work done inside the tools your team already trusts.

### Do / Don't table

| DO (safe) | DON'T (risky) |
|---|---|
| "the tools / platforms / software **you already use**" | Name **CoStar / LoopNet / CREXi** (or any vendor) by name or logo |
| Category nouns: "**your CRM**," "**listing platforms**," "**market-data tools**," "**research platforms**" | "**official partner**," "**endorsed by**," "**affiliated with**," "**powered by [Tool]**," "**[Tool]-certified**" |
| "**your agent signs in with your credentials, under your direction**" | "**bypass / circumvent / get around**," "**beat the paywall**," "**no login needed**" |
| "works **inside the tools your team already pays for**" | "**scrape [Tool]**," "**even though they block it**," "**against their terms**," "**no seat needed**" |
| Customer-possessive framing ("your accounts / your logins / your work") | Comparative knocks ("**cheaper / better than [Tool]**") |
| If ever naming a real integration: **word-mark only**, no logo, + trademark notice | Vendor **logo grid** implying integration/partnership |
| "the way a member of your team would do it" | "**automated access**" / "**bot**" framing that emphasizes non-human access to a specific named site |

---

## 5. What we'd do in our codebase / on the site

- **Website (ambitt.agency + client-portal marketing surfaces):** lead with Option A;
  use Option B for the CRE vertical. Keep every CRE reference to **categories**
  ("listing and market-data platforms"), never CoStar/LoopNet. This also lines up with our
  house voice rule (speak as "we," human, no AI-slop) and the brand palette.
- **No logo wall.** If we ever show integration logos, only for tools we have a real,
  permitted integration with (e.g., Composio-connected OAuth apps like Gmail/Slack) — and
  never a CRE-listings logo.
- **Product posture backs the copy:** because Arthur drives the client's **own real Chrome
  session with the client's own logins** (per the Arthur Remote Hands design), the "your
  agent, your logins, your account" framing is *literally true*, which is the strongest
  possible position — the copy describes reality, not spin.
- **Add a footer disclaimer** (counsel to finalize), e.g.: *"Product and company names are
  trademarks of their respective owners. Ambitt Agents is not affiliated with, endorsed by,
  or sponsored by any third-party platform our agents operate on your behalf."* Keep it even
  if we never name anyone — it's cheap insurance.
- **Flag for counsel:** (1) how hard we can lean on the "customer is authorized" theory
  given the Baker McKenzie caveat; (2) whether any footer trademark notice is even desirable
  if we name nobody; (3) sign-off on final hero copy.

---

## Sources
- Nominative fair use test / compatibility claims: [Ninth Circuit 15-26](https://www.ce9.uscourts.gov/jury-instructions/civil/chapter-15/15-26-defenses-nominative-fair-use/), [ABA Landslide](https://www.americanbar.org/groups/intellectual_property_law/resources/landslide/archive/nominative-trademark-use-affirmative-or-negative-defense-infringement/), [INTA](https://www.inta.org/fact-sheets/fair-use-of-trademarks-intended-for-a-non-legal-audience/), [Jimerson Birr](https://www.jimersonfirm.com/blog/2025/10/whats-fair-use-in-trademark-law-and-how-does-it-apply-to-my-business/), [Harrigan IP](https://harriganip.com/blog/nominative-fair-use-trademark-law/), [Lexology](https://www.lexology.com/library/detail.aspx?g=4b277db5-3d1a-4a12-bf91-e831d7c30883)
- False endorsement / §43(a): [Trademark Engine](https://www.trademarkengine.com/blog/false-endorsement-unfair-competition/), [Sierra IP](https://sierraiplaw.com/lanham-act-unfair-competition/), [Wilson Legal](https://www.wilsonlegalgroup.com/blogs/trademark-law/use-of-third-party-trademarks-in-advertising), [PatentPC](https://patentpc.com/blog/the-legal-implications-of-using-competitors-trademarks-in-ads)
- Tortious interference elements/inducement: [FindLaw](https://www.findlaw.com/smallbusiness/liability-and-insurance/tortious-interference.html), [Norton Rose Fulbright](https://www.nortonrosefulbright.com/en/knowledge/publications/cb78db86/pleading-the-element-of-inducement-for-tortious-interference-with-contract-claims)
- Scraping / ToS / CFAA + tortious-interference in litigation: [Skadden (Bright Data)](https://www.skadden.com/insights/publications/2024/05/district-court-adopts-broad-view), [FBM](https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/), [Zwillgen](https://www.zwillgen.com/alternative-data/how-artificial-intelligence-shaping-web-scraping-litigation/), [Seidman Law](https://seidmanlawgroup.com/web-scraping-vs-terms-of-use/)
- Agent-authorization caveat: [Baker McKenzie, June 2026](https://www.bakermckenzie.com/en/insight/publications/2026/06/united-states-legal-accountability-for-ai-agents)
- CoStar litigiousness: [9th Cir. CoStar v. CREXi (Justia)](https://law.justia.com/cases/federal/appellate-courts/ca9/23-55662/23-55662-2025-06-23.html), [CoStar legal page](https://www.costargroup.com/press-room/legal), [CoStar press June 2025](https://www.costargroup.com/press-room/2025/federal-court-finds-rival-crexi-copied-and-cropped-thousands-costars-copyrighted)
- Vendor marketing patterns: [Lindy](https://www.lindy.ai), [Bardeen](https://www.bardeen.ai/integrations/browser-agent), [Browse AI](https://www.browse.ai/), [Zapier trademark notice](https://zapier.com/legal/trademark-notice) + [partner branding](https://docs.zapier.com/integrations/publish/branding-guidelines), [PhantomBuster](https://phantombuster.com/blog/social-selling/is-linkedin-scraping-legal-is-phantombuster-legal/), [Userpilot](https://userpilot.com/blog/saas-automation-tools/)
