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
   (`--brand #00a4bd`). Gradients only as subtle tonal depth on icon chips or a
   single hero accent — never decorative page-wide.
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
  `--surface-2 #eaf0f6`. Accent **teal** `--brand #00a4bd` / `--brand-hover
  #0091a8`. Section accent colors: teal, indigo `#4f46e5`, emerald `#00887a`,
  amber `#b45309`, violet `#7c3aed`, rose `#e11d48` — used on icon chips + data.
- **Radius:** 6/8/10px. **Depth:** layered shadows (`.card`), hover-lift
  (`.card-hover` → translateY(-2px) + deeper shadow). Motion is minimal and
  purposeful (no load-in fade cascade).

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
