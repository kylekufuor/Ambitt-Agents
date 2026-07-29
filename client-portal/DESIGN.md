# Ambitt Client Portal — Design System (anti-AI-slop source of truth)

Read this before styling ANY portal surface. Every screen must hold the same
decisions so nothing drifts back to the "statistical average" that reads as
AI-built. Direction: **premium, crafted product UI — HubSpot-grade structure
with real depth and life, unmistakably human-designed.**

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
- **Type:** Lexend (display + body), semibold headings, `-0.011em` display
  tracking. No serif.
- **Palette:** cool slate — `--text #33475b`, `--bg #f5f8fa`, surfaces white /
  `--surface-2 #eaf0f6`. Accent **teal** — see the two-step rule below.
  Section accent colors: teal, indigo `#4f46e5`, emerald `#00887a`,
  amber `#b45309`, violet `#7c3aed`, rose `#e11d48` — used on icon chips + data.
- **Radius:** 6/8/10px. **Depth:** layered shadows (`.card`), hover-lift
  (`.card-hover` → translateY(-2px) + deeper shadow). Motion is minimal and
  purposeful (no load-in fade cascade).

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

## Depth & life (the premium bar)
- Cards read via elevation + a faint tonal wash, not a gray outline.
- Icons are **duotone with a gradient base + highlight** — they have dimension,
  not flat single-stroke.
- Interactions reward: cards lift, buttons have a confident press, active nav is
  clearly teal. One or two considered moments per screen, never everywhere.
- Numbers/metrics get accent color; labels stay slate. Hierarchy is obvious.

## Every page, every state
Cover: signed-out (login, account-not-found), no agents, agent building
(pending_approval), active, paused, killed; empty tools, connected tools; empty
leads/activity vs populated; loading; error. Each state must look intentional.
