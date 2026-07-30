# Portal v2 — iteration brief

Date: 2026-07-30
Input: four independent reviews of `docs/mockups/portal-v2/index.html` + `DESIGN-V2.md`
Status: direction approved, one more pass required before build

## Scores

| Pass | Score | One line |
|---|---|---|
| Craft and originality | **7.5 / 10** | Genuinely designed. Not a default, not slop. |
| Accessibility (WCAG 2.1 AA) | **6.5 / 10** | Best contrast we have measured. Keyboard is broken. |
| Spec conformance | **6 / 10** | Hard constraints all honoured; re-specified the IA on its own authority. |
| Robustness on real data | **4 / 10** | One-state design. Six defects fire on Casey's live rows with no adversarial input. |

The spread is the finding. This looks better than anything we have shipped and it
models a client who does not exist: one agent, one status, fifteen tidy rows,
every field populated, every date present.

## Verified before listing (three claims did not survive)

- **"Paused agents render green in the portal."** False for shipping code.
  `client-portal/src/app/page.tsx:633` maps `paused` to a muted dot labelled
  "Paused", and `sidebar.tsx:14` agrees. The live portal is honest. The *mockup*
  has no non-green path, so a rebuild from it would delete a state we already
  have. Mockup defect, not an incident.
- **"Sidebar bug."** Was the Next.js dev-tools indicator. Not a defect.
- **Contrast.** Independently measured, not asserted: 118 of 119 text pairs pass
  AA. The one failure is punctuation. This is the strongest accessibility result
  we have had and the reviewer declined to manufacture a finding against it.

## Fixed 2026-07-30

Ruling on the open IA question: **hold the spec, cut the tabs.** Decided on two
facts, not taste. The live portal has no `/settings`, `/communication` or
`/knowledge` route — `sidebar.tsx:83,87` emits `#communication` and `#settings`
anchors on `/agents/[id]` — so the mockup's route tier would have stranded every
deep link already sitting in a client's inbox. And its "Overview" tab pointed at
the same destination as the rail's agent row, which falsified the mockup's own
claim of one control per destination.

| Fix | Verified by |
|---|---|
| Tab tier removed; in-page section index replaces it, all three anchors resolve | 0 route links, 3 indexes, `#settings`/`#communication`/`#knowledge` all resolve |
| Those two frames are now the agent page at depth 1, breadcrumb `Home / Arthur` | crumbs re-derived from route |
| Letter voice: both drafts now first person as Casey | 0 hits for "I work with Casey" |
| Mobile draft shows the sign-off and sender before Accept; Ignore set apart | sign-off renders on all 3 mobile drafts |
| Keyboard: 3 toggles are buttons, 9 disclosure rows have role + tabindex | 0 orphan `span[role=switch]` |
| `--border-strong` 1.56:1 → **3.69 / 3.50 / 3.21** on surface / ground / wash | computed, alpha resolved |
| Teal off the five ledger numerals; 26px comes onto the scale at 24px | 0 teal numerals |
| Sign out now exists on desktop | present in all 12 shells |
| **Agent status word and colour move together** | 11 emerald, 1 blue, 1 muted — previously 13 emerald |
| New frame: agent stopped, drawn as Arthur's real state | frame 10 |

The stopped frame draws the operator-hold case deliberately: no Resume control,
because a client cannot lift our pause, the API returns 403, and a button that
always fails is worse than an honest sentence. The client-pause variant is the
same layout with a Resume control.

Still zero console errors, zero em dashes, no horizontal scroll at 1440 / 900 / 390.

## Must fix before build

### 1. The letter voice — FIXED AND DEPLOYED
Drafted outreach opened "I work with Casey Litsey" and signed "Casey Litsey".
Casey works with himself. This was live in Arthur, not just the mockup.
Ruling: **outreach is from the client, first person, signed as them.**
Shipped in `0718946` (`buildOutreachVoiceSection` in the prompt assembler).
Mockup copy at `index.html:1122` and `:2550` still needs the same correction.

### 2. States that do not exist and must
The mockup draws one. Casey needs, in order of how likely he is to hit them:

- **Agent paused** (Arthur is paused *right now*, operator hold since 11 July,
  dryRun on, `nextScheduledRun: null`). Must distinguish client-paused from
  operator/system-paused — a client cannot lift the latter, and the portal
  enforces that at `api/agents/[id]/resume/route.ts:25`. There is no visual
  language for it.
- ~~`/agents/[id]/tools`~~ — **drawn 2026-07-30**, frame 9. Grounded in Arthur's
  real tool state rather than an invention: CoStar signed in, Crexi and The
  Analyst Pro waiting on a sign-in, Gmail and Drive requested and unanswered.
  Ordered by what is waiting on the client rather than by category; every
  waiting row states what it *costs* to leave it; and the card that asks a
  broker for his CoStar password answers where that password goes, on the page.
- **Desk with nothing waiting** — the home page, one drawn state, and it is the
  state where two things need attention.
- **Agent mid-setup, zero tools connected.**
- **A send that fails after Accept.** Nothing in 17 frames handles it.

### 3. Keyboard access
Three `role="switch"` spans and nine disclosure rows have no `tabindex` and no
role. The entire Communication surface and the approvals queue are mouse-only.

### 4. `--border-strong` at 1.56:1
Token-level. It is the boundary of every input, secondary button and toggle-off,
against a 3:1 requirement. Every future surface inherits it.

### 5. Real data breaks the record page
`Lead.details` values are sentences, not scalars; `.deflist dd` is right-aligned
12.5px mono and renders a 122-char note as seven ragged lines. Casey's live
`details.status` says "Off-Market" four rows above a pill saying "CONTACTED".
Two fields named status disagreeing on one screen.

### 6. Six invented stage groups against seven schema statuses
`Lead.status` is a free-form String. The mockup's groups overlap it on exactly
one value. **Zero of Casey's three live leads have a group to sit in.**

## Should fix

- Type scale claims seven steps, renders sixteen. 13.5px appears 205 times and
  is not a token. The appendix prints a specimen of a scale the frames ignore.
- Teal budget is "one word per headline plus the primary action" (≈3 marks).
  The desk renders ~24. Start by taking teal off the five ledger numerals.
- Ledger counts do not click through, and the mockup's own caption says they do.
- No sign out anywhere on desktop.
- `/help` and `/account` live only in the strip, which the doc says is not
  navigation. That is a second nav surface.
- Undo exists on one of four decision verbs. **Edit was never drawn at all** —
  no editor, no field, nothing, and the four-verb model rests on it.
- Mobile Accept sits under a truncated letter with no visible sender and no
  sign-off, and Ignore is a full-width button directly beneath it.

## Deliberately not changing

- **36px controls.** Kyle's density rule. Under the 44px touch target, above the
  WCAG 2.2 24px floor. A known, chosen trade.
- **No dollar figure.** Held everywhere. Correct.
- **"Two states never share a colour."** Unachievable as written — amber carries
  four, emerald six. Every pill carries its word, so this is fine in practice.
  Amend the doc to describe valence, not state.

## Open for Kyle

1. The mockup built `/agents/[id]/settings|communication|knowledge` as routes
   behind a tab strip. The IA spec bans exactly that twice. Ratify the mockup's
   IA, or hold the spec and cut the tabs?
2. Does Threads survive? It ships in the rail with a count of 3 and its only
   frame is an empty state at 390px.
3. When a client correction contradicts the agent, who wins?
