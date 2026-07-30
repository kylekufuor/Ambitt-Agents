# Ambitt Client Portal — Design System (anti-AI-slop source of truth)

Read this before styling ANY portal surface. Every screen must hold the same
decisions so nothing drifts back to the "statistical average" that reads as
AI-built. Direction: **premium, crafted product UI — Databricks-grade
restraint with real depth and life, unmistakably human-designed.**

**Updated 2026-07-28.** The structural system is now Databricks': their warm
oat ground, their desaturated-navy ink, their hairline, their six-stop
ink-tinted elevation, their button geometry and state behaviour. **The accent
stays ours — teal `#00b3b3`, unchanged, and the logo is untouched.** The short
version of why: their neutrals are the part that reads as expensive, and our
teal is the part that reads as us. Taking their red as well would have cost us
the friendly read (red is the error colour in every UI convention) for nothing.

## The AI-slop tells we REJECT (never ship these)
1. **A flat gray 1px border around every card.** The #1 tell. Separate surfaces
   with, in order: whitespace → a 3–5% background-lightness shift → soft
   elevation (shadow). A hairline border only if all three fail, and never a
   flat neutral `#ececec`-style line.
2. **Purple→blue gradients / rainbow gradients.** Our accent is teal
   (`--brand #00b3b3`, see "Teal is two-step" below). Gradients only as subtle
   tonal depth on icon chips or a single hero accent — never decorative
   page-wide.
3. **Generic stroke icons** (Lucide / Heroicons / Feather). We use our own
   **custom duotone icon set** (`components/icons.tsx`) with layered depth.
4. Centered hero + a row of three identical feature cards. Compose with
   intention, asymmetry, and hierarchy instead.
5. Glassmorphism, heavy `backdrop-blur`, floating glow/social-proof badges,
   a bouncing scroll-mouse cue. None of these.
6. **Neglected edge states.** Empty / error / loading / no-data states get the
   SAME craft and human voice as the happy path — never "No data available."
7. Generic copy that could belong to any SaaS. Voice is specific + human
   (see [[feedback_voice_we_not_kyle]]): "we"/"our team", contractions, no
   "leverage/robust/seamless."

## Tokens (locked — in `app/globals.css`)
- **Type:** **DM Sans** (display + body), one family. See "Type is one family,
  weight 500" below — it replaced Lexend on 2026-07-28 and the rules changed
  with it. No serif, no second face.
- **Palette:** warm oat ground, Databricks neutrals. **Nothing pure black,
  nothing pure white.**

| Token | Value | Role | Worst measured pair |
|---|---|---|---|
| `--bg` | `#f9f7f4` | page ground (Databricks oat) | — |
| `--surface` | `#fffdfb` | raised plane. **Not `#fff`** | — |
| `--surface-2` | `#f1ede7` | recessed wash / inset panel | — |
| `--text` | `#1b3139` | headings + body (Gable Green) | 11.66:1 |
| `--text-2` | `#47606a` | secondary | 5.72:1 |
| `--text-3` | `#5a6f77` | tertiary — **the AA floor** | 4.53:1 |
| `--text-4` | `#78949f` | **decorative only** — placeholders, disabled | 3.01:1 |
| `--border` | `#dce0e2` | hairline — **rows and rails, never a card outline** | — |
| `--border-strong` | `#6f8892` | control boundaries — inputs, secondary buttons, toggle-off | 3.69:1 surface / 3.50 bg / 3.21 wash |

  **There is no fourth AA text step and you cannot invent one.** `--text-3` is
  Databricks' own muted `#5A6F77` and it is the lightest value that still
  clears 4.5:1 on `--surface-2`. Anything lighter fails. If you need another
  level of hierarchy, use size, weight or spacing — not a lighter gray.

  **`--text-4` may never carry a word.** It is 3.0:1 — legal for separators
  (`·`, `/`), placeholders, disabled fills, icon buttons and status dots,
  because those are either exempt or only owe 3:1. It is not legal for help
  text, timestamps, labels, empty-state copy or a stat value. Thirty usages
  had drifted onto it; they are now `--text-3`. If you find yourself reaching
  for `--text-4` to make something recede, the answer is smaller or further
  away, not fainter.

- **Status colours** — `--emerald #16713a`, `--amber #a34a07`, `--red #be123c`,
  `--blue #1d4ed8`. Each measured on every plane *and* on its own 10% tint
  (worst 4.82:1), and each sits **≥33 dE from the brand teal** so a status can
  never be mistaken for the accent. See "Teal is identity, never status".
- **Radius:** 4px buttons, 6/8/10px surfaces. **Depth:** the six-stop
  ink-tinted shadow ramp `--sh-1/2/3` (see below), hover-lift on `.card-hover`.
  Motion is minimal and purposeful (no load-in fade cascade).

### Elevation is a six-stop ink-tinted ramp
Databricks' single best detail, and it's cheap to copy:

```css
0 2px 3px   rgba(27,49,57,.02)
0 4px 8px   rgba(27,49,57,.025)
0 9px 13px  rgba(27,49,57,.03)
0 16px 24px rgba(27,49,57,.04)
0 32px 40px rgba(27,49,57,.05)
0 72px 104px rgba(27,49,57,.07)
```

Six descending stops, **tinted with the ink navy `27,49,57` — never black.**
A black shadow on a warm ground turns the card gray at the edge and reads as a
sticker; an ink-tinted one reads as an object sitting on paper. Two-stop
shadows were the old approximation; don't go back to them.

### No gradients, with one named exception
Databricks ships none in its critical CSS and neither do we. The icon chips are
flat tints. Accent is rationed to roughly one word per headline plus the primary
CTA. If a surface needs interest, it gets it from type, spacing and elevation.

**The exception (v3, 2026-07-30):** `.v3-main` carries a single vertical wash,
`#f3efe9 → --bg` over the first 260px. It is not decoration — it stops the
content plane reading as one flat sheet where it meets the dark rail. One
gradient, one surface, stated here so it does not become a licence for more.

## Type is one family — read this before setting any text

> **Weights updated 2026-07-30 (v3.1).** This section used to say "weight 500".
> Shipping weights are now **body 450, headings 580**, with Tailwind's
> `font-medium` at 560 and `font-semibold` at 640. DM Sans is variable
> (100–1000), so those are real interpolated weights, not synthetic bold. The
> lift was needed once the rail went dark: it raised the perceived contrast of
> everything beside it and left the old weights looking thin.

**DM Sans, everywhere, 76px down to 10px.** No display/body pairing — the
cohesion comes from one family used with discipline, not from a second face.
`DM Mono` where a mono face is genuinely needed (agent addresses, cron strings,
the login code). Same family in the marketing site and the operator dashboard,
so a client moving website → email → portal never sees the letterforms change.

**Self-hosted woff2, always.** `next/font/local`, files in `public/fonts/`,
licence text beside them. Never a CDN `<link>`, never `next/font/google`. A
silent fallback to a system face is exactly the failure this system exists to
prevent, and it fails invisibly — nobody files a bug, the product just quietly
looks cheap. The file is the variable cut carrying both axes (opsz 9–40,
wght 100–1000), so `font-optical-sizing: auto` gives each size the cut it was
drawn for. One 62 kB file is smaller than the three static weights it replaced.

| Rule | Value | Why |
|---|---|---|
| **Display headings (≥20px)** | **500** | The single biggest lever on how expensive this looks. Medium weight at size reads as money; bold reads as template. Was 600. |
| **Small headings / UI labels (<20px)** | **600** (`.font-display-sm`) | Below 20px there is no size left to spend, so weight is the only thing left to build structure with. Optical compensation — the ONE place weight may go up. |
| **Body** | 400 | |
| **Numerals at display size** | 600 | Figures have no ascender/descender silhouette, so they need a touch more weight than letterforms to read with equal presence. |
| **Heading leading** | 1.1–1.2 | 110% is the display value. Product titles sit a hair looser. |
| **Body leading** | 1.5–1.6 | |
| **Negative letter-spacing** | **only above ~40px** | It is an optical correction at display size and a tic everywhere else. **The portal's largest heading is 30px, so the portal has NO negative tracking at all.** The old `-0.011em` on `.font-display` is gone. |
| **Positive tracking** | uppercase micro-labels only | `.eyebrow` at 11px. Opposite adjustment, correct at that size. |

**If hierarchy stops reading, fix it with size, spacing and colour — never by
creeping the weight back up.** That creep is how this drifts back to bold-
everything, one heading at a time.

**Nothing pure black, nothing pure white.** Ink is `--text #1b3139`, canvas is
`--bg #f9f7f4`, and the raised plane is `--surface #fffdfb`. `#fff` survives
only as reversed type and as a label on a saturated fill.

## Teal is two-step — read this before using any teal

**`#00b3b3` is the canonical brand teal. It is the logo colour and it is the
only correct brand value.** Not `#00a4bd`, not `#0091a8` — both were drift and
were corrected on 2026-07-28. The logo is the one artefact we can't quietly
change, and a client moving from an email to the portal reads a near-miss teal
as a mistake, not as a choice.

**But `#00b3b3` is only 2.59:1 on white.** It cannot carry text and cannot sit
under a white label. So one hue, three roles — never compromise on a single
middle value that's mediocre at both jobs:

| Token | Value | Use it for | Contrast |
|---|---|---|---|
| `--brand` | `#00b3b3` | **Marks only.** Logo, avatar disc, accent stripes, decorative fills/rules, the source of both tints. **Never text, never under a white label.** | 2.59:1 — decorative only |
| `--brand-solid` | `#00807e` | Fills that carry a **white label** (`.btn-primary`, the client's chat bubble, a done timeline marker) and **state indicators** that must read (focus border, active tab underline, selected border, `.bar-fill`) | 4.78:1 w/ white |
| `--brand-solid-hover` | `#00706f` | Hover for the above | 5.92:1 w/ white |
| `--brand-ink` | `#00706f` | **Teal as text.** Links, `.eyebrow`, pill/chip labels, tab counts, active nav, stat numbers, the " Agents" wordmark | 5.92:1 on white, 5.48:1 on `--brand-tint` |
| `--brand-tint` / `--brand-tint-strong` | `rgba(0,179,179,.08/.14)` | Wash backgrounds behind `--brand-ink`; focus halos | pairs AA with ink |

Deciding which one: **does this thing carry a letterform, or does a letterform
sit on it?** If yes to either → `--brand-ink` or `--brand-solid`. If it's a
mark, a rule, or a decorative fill → `--brand`. If a token would need to do
both, split it; don't average it.

There is no `--brand-hover`. It was misnamed — it was being used as a static
text colour in ~40 places while also being a button hover, which is exactly how
this drifted. Text is `--brand-ink`; hover is `--brand-solid-hover`.

This mirrors `oracle/templates/_shared.ts` (`teal` / `tealDeep` / `tealText`)
one-for-one, deliberately: email and portal are one system, so the same hue
does the same job in both.

## Teal is identity, never status — read this before adding a status colour

Teal is the brand. It is **not** "success", "info", or "on". The moment the
accent also means a state, both meanings get weaker: the client stops reading
teal as us, and starts reading it as the system talking.

This was actually broken and is now fixed. `--emerald` was `#00bda5` and the
email `good` token was `#00706a` — both sat **3 dE** from the brand teal, which
is *the same colour* perceptually. An "active" pill and a brand chip were
indistinguishable. Success is now a true green `#16713a`, 33 dE away.

**The rule:** every status colour must sit **≥20 dE** from `--brand-ink`
(measure it, don't judge it), and the brand accent never appears in a status
pill. Status pills use green / amber / red / blue / muted only.

| Meaning | Token | Never |
|---|---|---|
| identity, navigation, primary action | teal | a status pill |
| success / active / done | `--emerald #16713a` | teal-green |
| needs attention / pending | `--amber #a34a07` | — |
| error / danger / halted | `--red #be123c` | the brand accent |
| informational | `--blue #1d4ed8` | teal |

**Danger stays visually distinct from the accent by hue, not by weight.** A
destructive button is `--red` filled; a primary action is teal filled. They are
96 dE apart, so no one clicks the wrong one. (This is also why we did not adopt
Databricks' lava red as the brand: an accent that *is* the error colour makes
every primary CTA look destructive, and there's no way to design around it.)

Colour is never the only signal — every status also carries its text label and,
where it matters, an icon.

## Three planes — read this before adding a surface (v3)

The portal is not a sheet of paper. Everything sits on one of three planes, and
the tokens for them live in the DEPTH block of `globals.css`:

| Plane | Token | What lives there |
|---|---|---|
| recessed | `--well` | the board columns, quoted replies, segmented-control grooves, the payment-method row |
| page | `--bg` + the `.v3-main` wash | the ground content sits on |
| lifted | `--lit` + `--lift-1/2/3` | cards, panels, tables, the active nav item |

`--lit` is the piece doing most of the work: a 1px white inset along the top
edge of a raised surface. A shadow alone reads as a rectangle with something
dark under it; a shadow **plus** a lit edge reads as a surface catching light.

### The rail is dark, and it is the only dark surface
`#15272e` — our own ink (`--text` `#1b3139`) two steps deeper. Not a new hue.
The problem it solves was never a missing colour: the four light surfaces sit
within ~6% lightness of each other, so a page made only of them has no anchor
and reads as one wash however many accents you add.

It also earns the logo teal back. `#00b3b3` is 2.59:1 on oat and cannot carry
text there, which is why it had been demoted to fills. On the rail it is bright
and legible, and the active nav mark is the one place the real brand teal
appears as an icon.

Everything on that ground was measured, not eyeballed: nav rest 7.34:1, active
11.32:1, section labels 4.88:1 (they were 4.32:1 at the alpha first chosen —
under AA — which is why they are 0.55 and not 0.50). Status dots were re-picked
too; `--emerald` and `--blue` are near-invisible on ink.

## Depth & life (the premium bar)
- Cards read via elevation + a faint tonal wash, not a gray outline.
- Icons are **duotone with a gradient base + highlight** — they have dimension,
  not flat single-stroke.
- Interactions reward: cards lift, buttons have a confident press, active nav is
  clearly teal. One or two considered moments per screen, never everywhere.
- Numbers/metrics get accent color; labels stay slate. Hierarchy is obvious.

## Third-party logos go through us, never straight from the browser (v3)
Any app, tool or site we name renders its real mark via `<ToolLogo>`, which
always points at `/api/logo`. Never an `<img>` aimed at a third party: an icon
loaded directly tells that service which tools each client uses, on every page
view. A client's CoStar and Crexi subscriptions are their business. The
endpoint is not an open proxy — `?u=` accepts https from a three-host
allowlist, `?d=` interpolates a validated hostname into a fixed upstream.

## Every page, every state
Cover: signed-out (login, account-not-found), no agents, agent building
(pending_approval), active, paused, killed; empty tools, connected tools; empty
leads/activity vs populated; loading; error. Each state must look intentional.
