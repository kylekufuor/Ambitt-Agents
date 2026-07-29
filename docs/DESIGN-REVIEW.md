# Design review

**Status: shipped.** Everything below is on `main` and deployed. Last updated 2026-07-29.

Each pair is **before** (what was live) then **after** (what's live now). Mobile shots first, since that's probably how you're reading this.

---

## What changed, in one paragraph

Three passes, in this order. **Type**: one typeface everywhere (DM Sans, self-hosted), headings dropped from weight 700/800 to **500** with 110% line-height. **Neutrals**: the Databricks colour system for everything that isn't the accent, so nothing is pure black or pure white any more. **Surfaces**: all 12 agent emails, the pre-sale funnel documents, and the prospect intake form rebuilt onto that one system. The teal stayed. The weight change is the single biggest lever of the three: nothing was gained by shouting.

---

## Pass 1 — Type

Bricolage Grotesque at weight 800 and -0.03em became DM Sans at 500 and 110%, sized up 60 to 68px to buy back the presence weight was faking.

**Before**

![Website hero, before type pass](type-review/before/website-hero--mobile.png)

**After**

![Website hero, after type pass](type-review/after/website-hero--mobile.png)

<details>
<summary>Desktop</summary>

**Before**

![Website hero desktop, before type pass](type-review/before/website-hero--desktop.png)

**After**

![Website hero desktop, after type pass](type-review/after/website-hero--desktop.png)

</details>

Two places the rule was deliberately broken, because 500 was wrong there:

- **Portal settings labels went up to 600.** At 500 they dissolved into body text.
- **Dashboard KPI numerals went to 600 with tabular figures.** Numbers have no ascenders or descenders to give them shape at 500.

---

## Pass 2 — Neutrals

You explored the full Databricks palette (oat ground, ink navy, lava red, recoloured logo) and reversed inside the hour: *"You're right. Teal was friendly."* That call is now the standing position, and it holds up for a reason worth keeping written down. **Red reads as *error* in UI convention.** A lava CTA looks destructive and collides with genuine error states. So we took their structure and kept our accent.

**Adopted:** oat ground `#F9F7F4`, ink navy `#1B3139` for primary text, muted `#5A6F77`, hairline `#DCE0E2`. Plus their shadow ramp (tinted with ink navy, not black, which is why their cards feel expensive rather than cut out), card treatment, button shape, and spacing rhythm. Governing rule: **nothing pure black, nothing pure white.**

**Kept, unchanged:** teal `#00b3b3` for the mark, `#00807e` for fills under white labels, `#00706f` for text and hover. The logo untouched.

### Marketing site

**Before**

![Website hero, before neutrals](palette-review/shots/web-hero-m-before.png)

**After**

![Website hero, after neutrals](palette-review/shots/web-hero-m-after.png)

<details>
<summary>Desktop, and further down the page</summary>

**Before**

![Website hero desktop, before neutrals](palette-review/shots/web-hero-d-before.png)

**After**

![Website hero desktop, after neutrals](palette-review/shots/web-hero-d-after.png)

**Home, further down the page, before**

![Website home, before neutrals](palette-review/shots/web-home-m-before.png)

**Home, further down the page, after**

![Website home, after neutrals](palette-review/shots/web-home-m-after.png)

</details>

### Client portal login

The first screen a paying client sees.

**Before**

![Portal login, before](palette-review/shots/portal-login-m-before.png)

**After**

![Portal login, after](palette-review/shots/portal-login-m-after.png)

### Operator dashboard login

**Before**

![Dashboard login, before](palette-review/shots/dash-login-m-before.png)

**After**

![Dashboard login, after](palette-review/shots/dash-login-m-after.png)

---

## Pass 3 — The surfaces

### Agent emails

The 12 templates were running four competing design systems, and the welcome email was the worst of them, which is also a client's first impression.

**Welcome, before**

![Welcome email, before](palette-review/shots/email-welcome-before.png)

**Welcome, after**

![Welcome email, after](palette-review/shots/email-welcome-after.png)

<details>
<summary>Agent response, the one clients see most</summary>

**Before**

![Agent response email, before](palette-review/shots/email-agent-response-before.png)

**After**

![Agent response email, after](palette-review/shots/email-agent-response-after.png)

</details>

Two real bugs fell out of this pass, not just styling:

- The welcome signature was printing a **3,454-character internal brief** where a one-line role should have been.
- A date-only milestone was **rendering a day early** in some timezones.

### Pre-sale funnel documents

The proposal and the quote: the two documents that carry a price.

**Proposal, before**

![Proposal document, before](palette-review/shots/funnel-proposal-doc-before.png)

**Proposal, after**

![Proposal document, after](palette-review/shots/funnel-proposal-doc-after.png)

<details>
<summary>Quote document</summary>

**Before**

![Quote document, before](palette-review/shots/funnel-quote-doc-before.png)

**After**

![Quote document, after](palette-review/shots/funnel-quote-doc-after.png)

</details>

Headline from this one: a webfont was **declared but never loaded**, so no prospect had ever seen the typeface we thought we were sending. The teal button was also failing accessibility at 2.59:1, now fixed by the two-step teal scale.

### Prospect intake form

Step 0 of the funnel. It was loading Inter from Google's CDN on every page view, which leaked the prospect's IP and blocked render on a third-party request. Now self-hosted.

**Welcome step, before**

![Intake welcome, before](email-review/intake-before/shots/1-welcome--mobile.png)

**Welcome step, after**

![Intake welcome, after](email-review/intake-after/shots/1-welcome--mobile.png)

<details>
<summary>Review step, the last thing they see before sending</summary>

**Before**

![Intake review, before](email-review/intake-before/shots/8-review--mobile.png)

**After**

![Intake review, after](email-review/intake-after/shots/8-review--mobile.png)

</details>

---

## Decisions worth not relitigating

**Teal stays.** Their structure, our accent. Reasoning in Pass 2.

**Email keeps a system font stack, on purpose.** Gmail and Outlook silently ignore webfonts, so an email declaring DM Sans falls back to something arbitrary and looks *worse* than a clean system stack. The agent templates inherit only the proportions: weight 500 headings, 110% leading, one accent word. This is not a bug to fix later.

**No em dashes in client-facing mail.** Enforced at send time now, not left to the model, and the test suite scans rendered text nodes rather than raw HTML lines.

**The hero accent is one line, not one word.** The Databricks rule is one accent word per headline. Our hero colours the whole second line because it is a call and response: the client's question in ink, the agent's answer in teal. The colour is carrying meaning rather than decorating. The stricter variant is built if you ever want it:

![Hero accent variant](type-review/after/website-hero-ACCENTVARIANT--desktop.png)

---

## Shipped

| Change | Commit |
|---|---|
| Agent emails, all 12 rebuilt on one system | `1bc4200` |
| Milestone date rendered a day early | `8e08700` |
| Portal teal, two-step scale | `53ac107` |
| Pre-sale funnel, one system, two AA failures removed | `19f3fbf` |
| DM Sans everywhere, headings at 500 | `8fd6fd7` |
| Intake form onto the funnel system, three real bugs | `c0be49d` |
| Databricks neutrals everywhere, teal untouched | `f62faad` |
| Portal: stop putting words on a decorative text token | `9db000b` |
| Em-dash guard scans text nodes, not raw lines | `6f48730` |
| Canonical URL moved to www | `42a2809` |

`ambitt.agency` now redirects to `www.ambitt.agency` with a valid certificate, so the bare domain reaches the site.

---

## Full comparisons, for a laptop

HTML pages with every shot side by side, more than fits here:

- **All 12 agent emails** — `docs/email-review/compare.html`
- **The pre-sale funnel** (proposal, quote, three teaser emails, portal status pages) — `docs/email-review/funnel.html`
- **The intake form**, all 10 steps — `docs/email-review/intake.html`
- **Neutrals across every surface**, including the token set and the logo — `docs/palette-review/compare.html`
- **The type pass** — `docs/type-review/compare.html`
