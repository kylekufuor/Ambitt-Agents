# Ambitt Client Portal, Design System v2

> **SUPERSEDED 2026-07-30.** This describes portal **v2**, a dashboard with a
> light rail and eight destinations. Kyle rejected the direction; what shipped
> is **v3**, a lightweight CRM with a dark rail, a hot/warm/cold leads board and
> an account section. Kept for the reasoning and the measured findings, which
> are still good — the layout decisions are not.
>
> Build against: `client-portal/DESIGN.md` (tokens and rules, current) and
> `docs/mockups/portal-crm-v3/index.html` (the approved reference).

**Status:** proposed replacement for `client-portal/DESIGN.md`. Read this before styling any
portal surface.
**Mockup:** `docs/mockups/portal-v2/index.html` (open it; every rule below is rendered there).
**Built from:** `docs/research/portal-redesign-research.md`, `docs/specs/portal-ia-navigation.md`,
`docs/specs/portal-crm-decision.md`.
**Direction:** premium, crafted product UI. Databricks' structure and type discipline, HubSpot's
one reusable record scaffold, Lev's oversight language. Our teal, our neutrals, unchanged.

---

## 0. What changed from DESIGN.md, and why

Colour did not change. Type, spacing, layout and navigation did. The old doc was a *styling*
system with no *structural* system, which is why every page invented its own width, its own back
link, and its own idea of where a heading sits.

| # | Change | Was | Now | Why |
|---|---|---|---|---|
| 1 | **A layout contract exists at all** | Every `page.tsx` rendered `PortalShell` itself | The shell is rendered once by `app/(portal)/layout.tsx` and never unmounts | Navigating currently destroys the navigation. This is the single worst thing about the portal and everything else here depends on it being fixed |
| 2 | **Body size** | 15px | **16px** | Kyle's standing density rule (16 base / 24 h1 / 36 inputs / 8 to 16 gaps). 15px was a compromise nobody chose |
| 3 | **Largest heading** | 30px | **24px** | Same rule. 30px was marketing scale leaking into product UI. Nothing in the portal is a hero |
| 4 | **Type scale is tokenised and closed** | Ad hoc sizes per page | Seven `--fs-*` steps, no eighth | Sizes were being invented per screen, which is how density drifts. Named `--fs-*`, never `--text-*`, because `--text-N` are colours and the collision was going to cause a real bug |
| 5 | **Eyebrows, timestamps, IDs and stat numerals move to DM Mono** | DM Sans 600 caps | **DM Mono 500 caps** | Databricks sets exactly these in DM Mono. It buys a level of hierarchy without a second family and without creeping weight upward. We already ship the file |
| 6 | **The coloured left border strip is banned** | `.accent-stripe` shipped and was used on agent cards | Deleted. Urgency reads as elevation plus a duotone key chip plus a pill that states the wait in words | Both 2026 AI-design catalogues name coloured left borders specifically; one calls them "almost as reliable a sign of AI-generated design as em-dashes for text". It was the last named tell we still shipped |
| 7 | **Elevation ramp gets names** | `--sh-1/2/3` | `--e0` to `--e4`, same six-stop ink tint | Three unnamed shadows meant people invented a fourth inline. Five named levels with a stated job each |
| 8 | **Controls have one height** | 11 to 12px padding, height implied | **36px**, 28px for in-row controls | Kyle's density rule, and it makes a button and an input line up without anybody measuring |
| 9 | **Content width is set by the shell** | Set per page, footer alone pinned 1000px | `--content: 1040px`, in the layout | Per-page widths are why two screens never felt like one product |
| 10 | **`--text-4` may not carry a letterform at all** | "decorative only", but placeholders were allowed | Separators, rules, dots, disabled fills. Placeholders move to `--text-3` | The old rule had an exception that leaked. An absolute rule is greppable; a rule with an exception is not |
| 11 | **Navigation rules are part of the design system** | Not covered | Section 3 below | A breadcrumb that appears on one page and not the next reads as cheap, and that is a design failure, not an engineering one |
| 12 | **Avatar discs that carry initials use `--brand-solid`** | "avatar disc" listed under `--brand` | `--brand` for a mark with no letterform, `--brand-solid` the moment initials sit on it | `--brand` is 2.59:1. White initials on it were failing, quietly |
| 13 | **Approvals have four verbs** | Approve / dismiss | **Accept / Edit / Respond / Ignore** | Two verbs force a client who wants one sentence changed into a dismiss, and we lose the email and the reason |
| 14 | **Zero is not a metric** | Not covered | No surface renders a `0`. A zero count is replaced by a sentence naming what happens next | Activity's `0 / 0 / 0` for a new client is the canonical violation |

Unchanged and still binding: the whole palette, the teal three-step, teal is never a status,
duotone icons only, no gradients, no glassmorphism, nothing pure black or white, edge states get
the same craft as the happy path.

---

## 1. The shell

The portal is one shell with a swappable content column. That is the product, not an
implementation detail.

```
┌───────────────┬──────────────────────────────────────────────┐
│ brand lockup  │  breadcrumb            Get help   [CL] Casey │  strip, 52px
├───────────────┼──────────────────────────────────────────────┤
│ Your desk  2  │                                              │
│ Approvals     │   Page title                    [action]     │
│ ───────────   │   ─────────────────────────────────────────  │
│ YOUR AGENTS   │   content, max 1040, centred                 │
│ ● Arthur      │                                              │
│   working…    │                                              │
│   │ Results   │                                              │
│   │ Threads   │                                              │
│   │ Tools   • │                                              │
│   │ Ask       │                                              │
│ ───────────   │                                              │
│ Plan, billing │                                              │
└───────────────┴──────────────────────────────────────────────┘
   rail, 248px                content column
```

**Rendered by the layout, never unmounts:** the rail and everything in it (counts, status words,
the needs-setup dot), the strip, the breadcrumb, the account chip, the help link, and the content
column's max width.

**Rendered by the page:** the title, its one primary action, the content, and the content's
skeleton. Nothing else. If it is identical on two routes, it belongs in the layout.

**Metrics.** Rail `248px` fixed, never resizes. Strip `52px`. Content `max-width: 1040px`, page
padding `24px`, bottom padding `48px`. Mobile header `52px`, breadcrumb row `38px`, drawer
`296px`.

**The strip is not navigation.** It carries three things that are true on every screen: where you
are (breadcrumb), who you are (account), and how to reach a person (help). No destinations live
there. The rail is the only navigation in the product.

**Why the breadcrumb sits in the strip and not in the page body.** It is derived from the route,
so it is layout data, not page data, and it can therefore render before the page does. Putting it
in the strip means it appears in the same pixel position on every route, never shifts when a title
is long, and stays on screen through a slow navigation. That last one is the whole argument: a
shell that survives a navigation is itself a navigational fact.

---

## 2. Loading, empty, error

These are not decoration. They are where a client decides whether the product is real.

- **Only the content column skeletonises.** The rail, strip and breadcrumb are already correct.
  The skeleton is the shape of the page that is coming, not three gray blocks.
- **A destination that can only ever be empty is not in the rail.** Rail visibility is derived
  from data per agent: Results appears once the agent has logged a record, Threads once a reply
  exists. Direct navigation to a hidden route still renders the crafted empty state, never a 404,
  so every link we have ever emailed keeps working.
- **No surface renders `0`.** If a count is zero, replace the number with a sentence that names
  the next real action or the next scheduled event, with a live link or a time. "No items" fails.
  "Nobody has written back yet. Fourteen letters have gone out since Friday and the first replies
  usually land on day three" passes.
- **Errors and 404s carry three parts: what happened, why, what to do next.** They render inside
  the shell, keep the breadcrumb, and offer one link home plus the support address. A generic
  retry button is not enough for an agent product: when something goes wrong the client is
  deciding whether to trust the thing that did it, and a vague error reads exactly like an agent
  covering for itself.
- **A dead end is a navigation bug**, not an error state.

---

## 3. Navigation rules

These are the ones that are easy to break by accident. All of them are QA-testable.

1. **The shell is rendered by the layout.** No `page.tsx` renders it. It must not unmount on any
   client-side navigation. `grep -rn "PortalShell" src/app --include=page.tsx` returns nothing.
2. **The rail is always expanded on desktop.** Never collapsed by default, never hover to expand.
   A user-initiated collapse is fine; a default one is not. (NN/g, 179 participants: hidden nav
   used 27% of the time against 48% visible, 39% slower, discoverability down over 20%.)
3. **Two levels, and no more.** Account level, then agent level. Anything deeper belongs to a
   page and is reached by a section index on that page.
4. **Every destination is a route.** No `#anchor` in navigation, ever. If it cannot hold an
   active state, be linked, and survive a refresh, it is not a destination.
5. **Breadcrumbs only, and the word "Back" never appears in the portal.** Browser back handles
   history; the breadcrumb handles hierarchy. Naming them differently is what stops clients
   confusing them. `grep -rn "Back to" src` returns nothing.
6. **The breadcrumb is derived from the route only**, never from `document.referrer` or a `from=`
   param, and it renders identically for a client who clicked through and one who arrived from an
   email with an empty history stack. Depth 0 shows the account context instead of a trail. The
   last crumb is text, not a link, and carries `aria-current="page"`.
7. **Active state is tint plus ink plus weight plus a 2px marker**, at both levels. Sub-items get
   the same treatment as top-level items, so "where am I" is answerable at every depth.
8. **Status in the rail needs a word, not only a colour**, and two different states never share a
   colour. The agent row's second line is the status in plain words, visible at rest on every
   screen: "Working. Next run Mon 8:00 am".
9. **List state lives in the URL.** Typing uses `replace` (debounced 300ms); committing a filter,
   sort or page uses `push`, so back removes one filter at a time and support can say "open this
   link".
10. **Actions do not navigate.** Approve, save a correction, connect a tool, pause an agent: all
    stay on the screen and revalidate in place. The one exception is advancing inside the
    approvals queue, which uses `replace`, so back from item two lands on the list and never on
    the item you just decided.
11. **Back is never undo**, and back never shows a decision you already made as still pending.
    Undo is a control on the destination screen with a stated window.
12. **Never stack overlays, always give a visible close, and push a history entry** so the
    Android back button closes the mobile drawer instead of leaving the page. Not `CloseWatcher`:
    it is not Baseline.
13. **Mobile is the same routes and the same URLs.** No separate mobile information architecture.
    The rail becomes a drawer, the breadcrumb stays on every screen at every width, and the
    hamburger carries a dot when something is waiting.

**Not building, deliberately:** a top nav alongside the rail, a command palette (it earns its
keep past ten features and we have six per agent), a notification bell, route transition
animations, tabs that duplicate rail items, or anything nested deeper than three levels.

---

## 4. Type

**DM Sans everywhere, DM Mono for eyebrows, timestamps, IDs, facts and stat numerals.** Two files,
one family plus its mono companion, self-hosted woff2 from `public/fonts` via `next/font/local`.
Never a CDN link and never `next/font/google`: a silent fallback to a system face is the one
failure nobody files a bug for, and the product just quietly looks cheap.

### The scale. Seven steps. There is no eighth.

| Token | Size | Weight | Leading | Family | Use |
|---|---|---|---|---|---|
| `--fs-display` | **24px** | 500 | 1.2 | Sans | Page title. One per page, every depth |
| `--fs-h2` | **20px** | 500 | 1.25 | Sans | Section and card title |
| `--fs-h3` | **16px** | 600 | 1.35 | Sans | Row title, form-group heading |
| `--fs-body` | **16px** | 400 | 1.55 | Sans | Body |
| `--fs-sm` | **14px** | 400 | 1.5 | Sans | Secondary line, meta, help text |
| `--fs-xs` | **12.5px** | 400/500 | 1.45 | Mono | Facts strip, timestamps, IDs, counts |
| `--fs-micro` | **11px** | 500 | 1.4 | Mono | Eyebrow. Uppercase, `letter-spacing: .09em` |

Rules that go with it:

- **Weight 500 at 20px and above. Weight 600 below 20px.** Medium at size reads as money; bold
  reads as template. Below 20px there is no size left to spend, so weight is the only structural
  tool left. That is the one place weight may go up, and it is deliberate.
- **No negative tracking anywhere.** It is an optical correction above roughly 40px and a tic
  below it. The largest thing in this product is 24px.
- **Positive tracking on uppercase micro labels only** (`.eyebrow`, `.09em`). Opposite
  adjustment, correct at that size.
- **Numerals at display size take 500 in DM Mono with tabular figures.** Figures have no
  ascender or descender silhouette, so they need the mono's even colour to read with equal
  presence, and tabular alignment is free.
- **If hierarchy stops reading, fix it with size, space or colour. Never weight.** That creep is
  how a system drifts back to bold-everything, one heading at a time.
- **Measure caps at 62 to 66ch** for prose, 56ch for empty-state copy.
- Two typographic registers, deliberately: UI voice for field data, and the agent's own words as
  indented prose behind a 2px teal rule (`.said`). A CRM shows fields. A colleague shows judgment.

---

## 5. Colour

**Unchanged from DESIGN.md.** Databricks' measured neutrals already equal ours (`#1b3139`,
`#5a6f77`, `#dce0e2`, `#f9f7f4`), so "copy Databricks" was a structure and type job, not a
repaint. Every contrast measurement in the old doc still stands.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#f9f7f4` | Page ground |
| `--surface` | `#fffdfb` | Raised plane. Not `#fff` |
| `--surface-2` | `#f1ede7` | Recessed wash, inset panel, group header |
| `--text` | `#1b3139` | Headings and body |
| `--text-2` | `#47606a` | Secondary |
| `--text-3` | `#5a6f77` | Tertiary. The AA floor, and the floor for anything with a letterform |
| `--text-4` | `#78949f` | **Separators, rules, dots, disabled fills. Never a letterform** |
| `--border` | `#dce0e2` | Hairline for rows and rails, never a card outline |
| `--border-strong` | `#6f8892` | Control boundaries. 3.69:1 on surface, 3.50 ground, 3.21 wash. Was `#c6cfd2` at **1.56:1** against a 3:1 requirement (WCAG 1.4.11), which silently failed every input, secondary button and toggle-off in the system. |

Teal stays two-step: `--brand #00b3b3` for marks, rules and tints only; `--brand-solid #00807e`
for fills under a white label and for state indicators; `--brand-ink #00706f` for teal as text.
**Any disc that carries initials uses `--brand-solid`,** because the moment a letterform sits on
it, 2.59:1 is not enough.

Status stays green / amber / red / blue / muted, each at least 33 dE from the brand teal, each
also carrying its word. Teal never appears in a status pill. Scenario tags (OFF MARKET, LISTING,
REFI) get **no hue at all**: they are a category, not a state, so they are mono on the wash.

Accent is rationed to roughly one word per headline plus the primary action. On the desk that
word is "stopped", because stopping is the product.

---

## 6. Spacing, controls, layout

**4px base. Six steps in product UI.** `--s1 4 · --s2 8 · --s3 12 · --s4 16 · --s5 24 · --s6 32 ·
--s7 48`. Nothing between the steps, nothing above 48 inside a page.

| Thing | Value |
|---|---|
| Padding inside a card | 24 |
| Gap between sibling cards | 12 to 16 |
| Gap between sections | 32 |
| Page padding | 24, bottom 48 |
| Row padding in a list | 16 |
| Every input, select and button | **36px high** |
| In-row control | 28px high |
| Button padding | 0 16px, gap 8 |
| Button radius | 4px |
| Surface radius | 6 / 8 / 10px |
| Icon sizes | 15 / 18 / 22px only |
| Record side rail | 300px, gap 24 |

**Rejected: Databricks' 20px card radius and HubSpot's 16px containers.** Those are marketing-site
values, and rounded-everything is a named AI tell. Our radii stay.

---

## 7. Elevation

Same six-stop ink-tinted ramp as before, now with five named levels and a stated job for each, so
nobody invents a sixth inline.

| Level | Job |
|---|---|
| `--e0` | Flush. A hairline, no shadow. Rails, rows, group headers |
| `--e1` | Barely lifted. Toggle knobs, chips |
| `--e2` | **The card.** Everything that is an object on the page |
| `--e3` | Lifted. Hovered card, popover, sticky bar, and the card that is waiting on the client |
| `--e4` | Over the app. Drawer, sheet, the one destructive dialog |

Tinted with the ink navy `rgba(27,49,57,…)`, never black. A black shadow on a warm ground turns
the card gray at the edge and reads as a sticker; an ink-tinted one reads as an object sitting on
paper.

**Surfaces separate in this order: whitespace, then a 3 to 5% tonal shift, then elevation.** A
hairline only if all three fail, and never a flat neutral outline around a card. That is still the
number one tell.

---

## 8. Components that carry meaning

**Page scaffold, reused on every surface.** Breadcrumb (in the strip) then page head (title, one
optional sub-line, one primary action on the right) then content, then an optional 300px facts
rail. Anyone building the next surface copies this and changes the middle.

**The waiting card.** Elevation `--e3` so it sits a step above the page, a 32px duotone key chip
(teal for a decision, amber for a question), an eyebrow with the time it was drafted, the title,
the agent's reasoning in his own register, and one primary action. A pill states the wait in
words. **No coloured left border.**

**The record row.** One owner is one row you read like a sentence: name and entity, property and
address, then a DM Mono facts strip, then a forward-looking status line ("Next: day 7 nudge,
tomorrow at 8:10 am"). Rows separate by hairline inside one card. No cell borders, no zebra
stripes, no twelve-column grid: density is a requirement of bulk manual editing, and the client
does not do bulk manual editing here.

**The four verbs.** Accept is the only filled button. Edit and Respond are secondary. Ignore is
ghost and set apart. The legend appears once above the list, never repeated per row. Every
decision writes back a sentence that says exactly what happens and when, plus an undo with a
stated window. There is no "accept all" on the batch page: one tap that sends six emails in the
client's name is how you earn the phone call that starts "I did not know it sent that".

**The oversight triad.** Every record carries three blocks in this order: *what the agent is
preparing*, *what is waiting on you*, *what the agent already did*, the last with its sources
named. This is the product's claim, made into surfaces rather than marketing copy.

**The route switcher. Removed 2026-07-30.** It was underline tabs over four sibling routes, and it was wrong on three counts: the IA spec bans a tab tier inside `/agents/[id]` twice (§7.3, §7.12); the live portal has no such routes, only `#communication` and `#settings` anchors, so every deep link already sent to a client would have landed on a page that scrolls nowhere; and its "Overview" tab pointed at the same destination as the rail's agent row, which is the two-controls-one-destination problem this system exists to remove. Replaced by an in-page section index: hash links on the same page, set with `replace` so back does not walk through anchors, breadcrumb stays `Home / Arthur`.
They exist only where their destinations are not in the rail, so there is exactly one control per
destination.

**No Add button, and say so.** Where a CRM puts "+ New record", we put a sentence explaining that
the agent is the only author and a secondary action framed as delegation ("Hand Arthur a
property").

---

## 9. The tells we reject

The original seven stand: flat gray card outlines, purple gradients, generic stroke icons
(Lucide, Heroicons, Feather), centred hero plus three identical cards, glassmorphism, neglected
edge states, generic SaaS copy. Six more, imported from the 2026 catalogues:

8. **Coloured left or top border strips** on cards. Named as the single most reliable tell.
9. **Numbered `01 / 02 / 03` section markers.**
10. **Icon-topped feature-card grids.**
11. **An uppercase kicker above every single section.** Eyebrows are for sections that need a
    date, a count or a category, not for decoration.
12. **Animated stat counters.**
13. **The same fade-in on everything.** Motion is one or two considered moments per screen. No
    route transition animation at all: it adds perceived latency to exactly the back-and-forth
    this redesign exists to make feel fast. The only ambient motion in the product is the loading
    shimmer, and it respects `prefers-reduced-motion`.

---

## 10. Copy

"We" and "our team", never an operator's name. The agent has a name and uses it, because the
agent is the thing the client hired. Contractions. No "leverage", "robust", "seamless", "delve".
**No em dash in any client-visible string.** No dollar figure anywhere in the portal except the
billing page, where the price you pay is legitimately money. Value is expressed as work delivered,
in verbs, countable from real rows, and every count clicks through to the rows behind it.

Actor-first sentences everywhere: "Arthur re-checked all 15 properties", never "15 properties
updated". Passive voice is what makes a product feel like furniture.

Next 16 and Turbopack: JSX wraps strip the space between `{expr}` and adjacent text. Use `{" "}`.

---

## 11. Before you call a portal surface done

```bash
cd client-portal && npx tsc --noEmit && npx next build
grep -rn "Back to" src                                   # zero hits
grep -rn "PortalShell" src/app --include=page.tsx        # zero hits
grep -rn '#communication\|#settings' src/components      # zero hits in nav
```

Then, in a browser, at 1440 and at 390:

- Click three rail items in a row and watch the left 248px. A single frame without the rail is a
  fail.
- Throttle to slow 3G and navigate. Only the content column may skeletonise, and the breadcrumb
  must already be right.
- Open a record from a filtered, scrolled list, press browser back, and land on the same filter,
  the same sort and the same scroll position.
- Decide an approval, press back, and confirm the desk does not still say one waiting.
- Confirm no element carrying a word computes to `#78949f`.
- Confirm no rendered `0` anywhere, and no em dash in any string.
- Confirm every icon is ours.
