# Design teardown — databricks.com (for ambitt.agency marketing site + admin dashboard)

Researched 2026-07-28 by Rex. Trigger: Kyle — "marketing site font and dashboard inspo should be
for these sites: https://www.databricks.com/ — I really like the databricks site."

**Evidence note.** databricks.com inlines all CSS in `<style>` blocks (no external stylesheet link —
W3C validator confirms 126 errors all sourced to the page URL itself), and their brand portal
(`brand.databricks.com`, `brandguides.brandfolder.com`) is auth-gated (401/403). I extracted the real
declarations by pulling the raw `<head>` text and element `class` attributes through Microlink's data
rules. Everything marked **[verified]** is a literal string from their shipped CSS/markup. Anything
inferred is labelled.

---

## 1. Typography (the part Kyle called out)

### Typefaces — verified
| Role | Face | Evidence |
|---|---|---|
| Everything (display + body + UI) | **DM Sans** | `font-family:DM Sans,sans-serif;` on the root element **[verified]** |
| Code / mono | **DM Mono** | `font-family:DM Mono,monospace;` **[verified]** |

Self-hosted, not CDN: `https://www.databricks.com/en-website-assets/static/sans_400.woff2`
(23 kB, preloaded as `<link as="font">`) **[verified]**. The file is renamed to a generic
`sans_400` alias — the weight in the filename tells us 400 is the preload-critical weight.

**The single biggest finding: Databricks has no display/body font pairing.** One family, top to
bottom, 76px hero down to 12px legal. All of the "premium" comes from *how* it's set, not from a
second typeface.

DM Sans is a low-contrast geometric sans (Colophon Foundry, OFL, free on Google Fonts) — a
Poppins-adjacent geometric with shortened descenders that holds up at display sizes. It is **not**
Inter, so it doesn't trip our anti-slop rule, but it is a very widely used Google font.

### Weights — verified
- `font-medium` (**500**) on both h1 and h2 **[verified]** — headlines are *not* bold.
- Root body 400.
- This is the trait that makes the site read "quiet money" instead of "startup shouting."

### Type scale — verified + one inference
h1 class attribute, verbatim **[verified]**:
```
mb-2 font-medium lg:!leading-[110%] [&>span]:text-orange-600 [&>span]:inline
[&_br]:hidden md:[&_br]:inline text-6 lg:text-[60px] xxl:text-[76px]
```
h2 class attribute, verbatim **[verified]**: `text-white lg:tracking-t-1 font-medium null`

| Token | Value | Confidence |
|---|---|---|
| h1 mobile | `text-6` = **48px** | inferred — their Tailwind scale unit is 8px (see below) |
| h1 lg | **60px** | verified (`lg:text-[60px]`) |
| h1 xxl | **76px** | verified (`xxl:text-[76px]`) |
| h1 line-height | **110%** | verified (`lg:!leading-[110%]`, `!` = forced override) |
| Body line-height | **1.5** | verified (root `line-height:1.5`) |
| Form/input | **16px** | verified |
| Secondary UI | **14px** | verified |
| Small/legal | **12px** | verified |
| Nav CTA | `md:text-1.75 lg:text-2` = **14px → 16px** | inferred (same 8px unit) |

**The 8px-unit inference:** their custom Tailwind scale uses `text-1.75`, `text-2`, `text-6`. If the
unit were rem, a header button would be 28px — implausible. At 8px/unit it resolves to 14px button /
16px button / 48px mobile h1, which is internally consistent and matches the verified 60px→76px
desktop steps. Treat the 48px as ±4px, the 60/76 as exact.

### Letter-spacing — the craft detail
`lg:tracking-t-1` **[verified]** — a *named* negative-tracking token, applied **only at the `lg`
breakpoint and above**. They do not track-tighten small text. Optical correction at display sizes
only, default tracking at reading sizes. That's a deliberate typographic decision, not a global
`letter-spacing: -0.02em` sledgehammer.

### How headlines are composed — the three moves worth stealing
1. **Colored span inside the headline.** `[&>span]:text-orange-600` **[verified]** — exactly one
   `<span>` per h1, set in the lava red. The rest stays navy. One word carries the brand.
2. **Hand-set line breaks, desktop only.** `[&_br]:hidden md:[&_br]:inline` **[verified]** — the
   copywriter places `<br>` manually; it's suppressed on mobile and honoured from `md` up. This is
   what makes their hero wrap look composed rather than ragged. No `text-wrap: balance` guesswork.
3. **Sentence case, long, verb-first, declarative.** Verified h1/h2 strings:
   - "The database your AI agents deserve"
   - "Build and run apps, agents and AI on your data"
   - "Intelligent. Simple. Private."
   - "How innovators win with data and AI"
   - "Unlock the potential of your data — and your teams"
   - "Reduce costs, lower risk and unlock growth with AI on your data"

   Note: no Title Case, no "&" (always "and"), no Oxford comma, em-dash used for the turn in a
   sentence. Headlines carry the argument; decoration carries nothing.

---

## 2. Color — verified hexes from shipped CSS

| Role | Hex | Source |
|---|---|---|
| Ink / navy ("Gable Green") | **#1B3139** | live CSS `#1b3139` + `rgb(27 49 57)` **[verified]** |
| Muted text | **#5A6F77** | live CSS **[verified]** |
| Hairline / divider | **#DCE0E2**, **#E0E0E0** | live CSS **[verified]** |
| Muted blue-gray border | **#618794** | live CSS **[verified]** |
| Brand red ("lava") | **#FF3621** | live CSS + two brand refs **[verified]** |
| Red, lighter (hover/tint) | **#FF5F46** | live CSS **[verified]** |
| Red, darker | **#EB1600** | live CSS **[verified]** |
| Link blue | **#016BC1** | live CSS `rgb(1 107 193)` **[verified]** |
| Page off-white ("oat") | **#F9F7F4** | brand refs (BrandColorCode, designyourway) — *not* re-confirmed in the inline CSS |
| Logo red as rendered | #F83018 (Microlink palette extraction of the live render) | secondary |

Tailwind palette is custom-named: `text-orange-600`, `hover:bg-navy-800` **[verified]** — so
red and navy are the only two branded ramps.

**Color economy:** the page is ~97% navy ink on off-white/white. Red appears in: the logo, exactly
one word per hero headline, the primary CTA, and hover states. Blue is reserved for inline text
links only. There is no third decorative color, no gradient anywhere in the critical CSS.

---

## 3. Layout & rhythm

- **Stack:** Tailwind (verified via `--tw-bg-opacity`, `--tw-shadow`, `--tw-ring-offset-shadow`
  custom properties) with a custom 8px-unit scale, served from `/en-website-assets/`.
- **Section separation:** color blocks + elevation, not rules. Dark navy bands (`text-white` h2s
  exist **[verified]**) alternate with oat/white sections. Hairlines (#DCE0E2) exist but are used for
  table/list rows and nav underlines, not to outline cards.
- **The shadow token — the best single thing on the site [verified verbatim]:**
  ```css
  --tw-shadow:
    0px 72px 104px rgba(27,49,57,.07),
    0px 32px 40px  rgba(27,49,57,.05),
    0px 16px 24px  rgba(27,49,57,.04),
    0px 9px 13px   rgba(27,49,57,.035),
    0px 4px 8px    rgba(27,49,57,.02+),
    0px 2px 3px    rgba(27,49,57,.02);
  ```
  Six stops, all tinted with the **ink navy (27,49,57)** rather than black, opacities descending
  from .07 to .02. That's how a flat card reads as a physical object. It is a direct, superior
  version of what our `--sh-2` / `--sh-3` already attempt with two stops.
- **Homepage section order [verified]:** hero (h1 + subhead + 2 CTAs "Explore the product" / "See
  demo" + product screenshot) → event banner → tabbed platform section (7 tabs: Platform, Database,
  AI, Business Intelligence, Governance, Data Warehousing, Data Engineering) → 4 product tiles
  (Lakebase, Genie, Agent Bricks, Lakehouse) → customer stories carousel → awards + stats →
  "In the spotlight" 4 resource tiles → closing CTA ("Start your data + AI journey" / "Browse demos"
  / "Try it free") → 6-column footer.
- **No generic three-card row.** The repeated units are a 7-tab switcher, a 4-tile grid, and a
  carousel — never three identical feature cards.
- **Proof is numeric and sourced [verified]:** "Over 60% of the Fortune 500 uses Databricks",
  "Over 20,000 customers across the globe", "5x Leader in Gartner Magic Quadrant Reports".
- **Solutions pages** (e.g. /solutions/industries/financial-services) use a sticky sub-nav of 6
  anchors — Use Cases, Customers, Featured Products, Partners, Resources, FAQ — then a long
  use-case list grouped by segment, each with a bolded capability line + one-sentence description +
  a "See how / Watch / Read" link. Depth over decoration.
- **Imagery:** product screenshots (real UI) + abstract conceptual illustration per tab + customer
  logo wall + award badges. **Zero stock photography, zero people photos** on the homepage.

---

## 4. Motion / interaction

Deliberately thin. Verified: `transition duration-200 ease-in-out` on CTAs with a
`hover:bg-navy-800` color change; Swiper-based carousels for customer stories
(`.card-slider .swiper{overflow:visible;padding:0 30px}` — overflow visible so the next card peeks).
No scroll-reveal cascade, no parallax, no counters in the critical CSS. The energy comes from type
size and color economy, not movement.

---

## 5. What makes it enterprise-credible rather than templated

1. **One typeface, one headline weight (500).** Restraint at 76px is the whole trick. Bold + tight
   tracking is what makes a site look like a template; medium weight at large size looks expensive.
2. **Ink is navy #1B3139, never black; page is oat #F9F7F4, never pure white.** Nothing on the page
   is `#000`/`#fff` except reversed type. Removes the "default browser" feel instantly.
3. **Accent is rationed to roughly one word per screen.** `[&>span]:text-orange-600` is a one-word
   budget, enforced in the component.
4. **Six-stop ink-tinted shadows instead of borders.** Surfaces separate by depth.
5. **Manual `<br>` control + display-only negative tracking.** Somebody set the type by hand at each
   breakpoint. That's the difference between "designed" and "generated".
6. **Copy carries the claim.** Long, specific, sentence-case headlines with real numbers underneath.

---

## 6. Dashboard-relevant patterns

Databricks' product UI is a separate system from the marketing site — worth knowing before we copy
the wrong one.

- **Du Bois design system** — `@databricks/design-system` v1.12.22 on npm, "a shared language for
  building products at Databricks". Verified from `dist/antd-vars.js`: `'ant-prefix': 'du-bois'` —
  **it is a themed Ant Design fork.** That tells us their product UI inherits antd's dense,
  table-first, enterprise conventions rather than marketing-site airiness. Package ships
  `~patterns/Wizard/` (HorizontalWizardContent, VerticalWizardContent, WizardFooter) and
  `~patterns/DocumentationSidebar/` as first-class patterns.
- **Their product style guide** (joyx.design/styleguide) specifies:
  - **Spacing:** "Spacing on the site is based on a 4px grid. Use multiples of 8 to define margin of
    blocks, multiples of 4 for element paddings." **[verified quote]**
  - **Casing:** Title Case for "titles, buttons, labels, tabs, table columns, and headings";
    sentence case for "tooltips, introductions, and checkboxes" **[verified]**.
  - **Component set:** Alerts, Badges, Breadcrumbs, Buttons, Context Menus, Dialogs, Forms,
    **State Indicators**, Tables, Tabs, Tooltips.
- **Worth borrowing for our admin dashboard:**
  - **State Indicators as a first-class named component**, not ad-hoc pills. Maps directly onto our
    agent lifecycle (`pending_approval` / `building` / `active` / `paused` / `killed`) plus the spike
    ⚠ badge and the FLEET-CONTROL panel states.
  - **Wizard pattern** (horizontal for short flows, vertical for long, persistent footer) — maps onto
    Atlas's onboard → proposal → PRD → quote → convert funnel.
  - **DocumentationSidebar** — inline help beside a dense object page; maps onto agent detail /
    dry-run review where an operator needs the "what does this mean" without leaving.
  - **Breadcrumbs + Tabs** for deep object navigation (agent → runs → dry-run → email delivery).
  - **4px base / 8px block rhythm** and 12–14px data type. Our portal already sets
    `font-variant-numeric: tabular-nums` globally in `website/app/globals.css`, which is the right
    instinct for tables — extend it to the dashboard.
- **Skip:** their Title Case rule. It conflicts with our shipped sentence-case eyebrow/label
  convention and reads dated. Also skip adopting antd itself — it would fight our custom duotone icon
  set and the elevation-not-borders rule in `client-portal/DESIGN.md`.

---

## 7. Translation to Ambitt

Our current system (`/Users/kylekufuor/Projects/Ambitt Agents/website/app/globals.css`):
Bricolage Grotesque display + Lexend body, `--ink #33475b`, `--ink-max #12222f`, `--bg #f5f8fa`,
`--brand #00b3b3`, h1–h3 at `font-weight: 700`, `letter-spacing: -0.02em`, `line-height: 1.05`,
hero `clamp(38px, 5vw, 60px)` at weight **800** with `-0.03em`, `.wrap` max-width **1140px**,
`.sec` padding **96px**, radius **14px**, two-stop shadows tinted `rgba(16,42,67,…)`.

### Adopt (high confidence, low risk)

| Move | Concrete change |
|---|---|
| **Six-stop ink-tinted shadow** | Add `--sh-4` using our ink `rgba(16,42,67,…)` at Databricks' 6-stop ramp (.07/.05/.04/.035/.04/.02 at 72/32/16/9/4/2px). Use it on `.phone`, `.mail`, `.price-focal`. Our `--sh-3` is a 2-stop approximation of the same idea. |
| **Drop headline weight** | `h1,h2,h3` 700 → **600**; `h1.hero-h1` 800 → **600/650**. This single change buys most of the Databricks feel. |
| **Loosen display leading** | `line-height: 1.05` → **1.1** on h1/h2 (they use exactly 110%). |
| **Tracking only at display sizes** | Move `letter-spacing: -0.02em` off the global `h1,h2,h3` rule and apply it only above ~40px (media-query or a `.disp-lg` class). Small headings get default tracking. |
| **One-word accent span** | We currently color the entire second hero line teal (`h1.hero-h1 .a`). Change to a single word/short phrase in `--brand-ink`, rest in `--ink-max`. |
| **Manual line breaks, desktop-only** | Add `h1 br { display: none } @media (min-width: 768px) { h1 br { display: inline } }` so we can hand-set the hero wrap. |
| **Numeric proof** | Their stat block is three hard numbers. Our `.proof-stat` exists — fill it with real, sourced figures, not adjectives. |
| **Sub-nav on long pages** | Their solutions-page sticky anchor nav (6 items) is the right pattern for our future per-role agent pages. |

### Skip / conflicts

- **Oat #F9F7F4 background.** Adopting Databricks' warm off-white would break our cool-slate system
  and desynchronise the marketing site from the portal (`--bg #f5f8fa`), which we just standardised
  in the HubSpot pass. Their warm-neutral + red pairing is a *warm* system; ours is *cool* + teal.
  Pick one; don't blend.
- **Their hairline #DCE0E2 as a card outline.** Directly violates rule #1 in
  `client-portal/DESIGN.md`. Their cards are elevation-based anyway; the hairlines are for rows.
- **Title Case in UI.** Conflicts with our shipped sentence-case convention.
- **Ant Design / Du Bois wholesale.** Conflicts with our custom duotone icons and elevation rules.
  Borrow the *patterns* (state indicators, wizard, breadcrumbs, density), not the library.
- **Going single-family.** Real conflict, needs Kyle's call — see Q1. Databricks' cohesion comes
  from one family used with discipline. Our Bricolage/Lexend pair is a legitimate different answer
  (more character, more human), but it is the opposite bet.
- **DM Sans itself.** Free and good, but common enough that adopting it moves us *toward* the
  statistical average rather than away from it. If Kyle wants that silhouette without the ubiquity,
  the closest lower-frequency equivalents are **Hanken Grotesk**, **Figtree**, **Be Vietnam Pro**, or
  paid **Söhne / Aeonik / Untitled Sans**.

---

## Sources

- [databricks.com homepage](https://www.databricks.com/) — inline CSS + h1/h2 class attributes + font preload (primary evidence, extracted via Microlink data rules)
- [databricks.com/product/data-intelligence-platform](https://www.databricks.com/product/data-intelligence-platform) — product-page headlines, imagery
- [databricks.com/solutions/industries/financial-services](https://www.databricks.com/solutions/industries/financial-services) — solutions-page structure, sub-nav, CTA labels
- [@databricks/design-system on npm](https://www.npmjs.com/package/@databricks/design-system) — Du Bois v1.12.22
- [Du Bois `antd-vars.js` via jsDelivr](https://cdn.jsdelivr.net/npm/@databricks/design-system@1.12.22/dist/antd-vars.js) — `'ant-prefix': 'du-bois'`, proving the antd base
- [Databricks product style guide (joyx.design)](http://joyx.design/styleguide/) — 4px grid, Title Case rules, component inventory
- [BrandColorCode — Databricks](https://www.brandcolorcode.com/databricks) and [designyourway — Databricks logo](https://www.designyourway.net/blog/databricks-logo/) — #FF3621 / #1B3139 / #F9F7F4 (secondary confirmation)
- [Databricks brand portal](https://brand.databricks.com/typography) and [extended brand guidelines](https://brandguides.brandfolder.com/databricks-extended-brand-guidelines/typography) — auth-gated (401/403), could not verify
- Our system: `/Users/kylekufuor/Projects/Ambitt Agents/website/app/globals.css`, `/Users/kylekufuor/Projects/Ambitt Agents/client-portal/DESIGN.md`
