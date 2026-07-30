# Portal as lightweight CRM — design rationale

**Mockup:** `docs/mockups/portal-crm/index.html` (open in a browser; desktop frames plus three
scrollable 390px frames).
**Design source of truth:** `client-portal/DESIGN.md`. Every token, icon, weight and hue below is
lifted from it. Nothing invented.
**Data:** Casey Litsey / Arthur, off-market multifamily in Kansas City, Prairie Village, Wichita,
Topeka, Raytown, Independence, Olathe, Gladstone. Fifteen owners, scenario tags OFF-MARKET /
LISTING / REFI, day-3 and day-7 follow-up stages.

---

## The one-line position

Kyle's instinct is right about the *objects* and wrong about the *noun*. All three beachhead
verticals do work lead-shaped records, and familiarity is a real adoption asset. But a CRM is a
system of record that **the human maintains**, and the moment the portal looks like one we have
promised CRUD, imports, custom fields, dedupe, and a sync to the CRM they already pay for. All three
verticals already have one: brokers on Buildout or HubSpot, tax pros on a practice manager, home
services on ServiceTitan or Jobber. Being the second, worse CRM is a losing frame.

So: same objects, same familiar shape, one word changed. It's a **worklist** — a report from
somebody who works for you, where the only verb you own is *decide*. That reframe answers four of
the five questions on its own.

---

## Q1 · What replaces the $27

**Not another metric. The handoff.**

> **Arthur drafted six emails and stopped.**
> He wrote them Sunday night, from the nine owners he sourced last week. Nothing has gone anywhere.

A number in the hero slot, any number, is wallpaper by week three because it asks nothing of the
reader. The handoff sentence does three jobs in one line: proves work happened (six emails exist),
proves supervision (they stopped), and points at the only action on the page that moves money.
"Stopped" is the accent word, in `--brand-ink`, because stopping *is* the product.

The slot resolves in priority order, so it is never empty and never lies:

1. Something's waiting on you → the handoff sentence.
2. Nothing waiting, something new → "Arthur sourced nine owners and answered three replies since
   Friday."
3. Nothing at all → "Arthur's next run is Monday at 8:00 am" plus the last finished thing.

Work-delivered value lives lower, as a **five-cell ledger of verbs**: 9 owners sourced · 12 emails
written and sent · 4 follow ups nudged · 3 replies answered · 1 moved to warm. Counts of things
Arthur *did*, in DM Mono, teal numerals per DESIGN.md ("numbers get accent colour, labels stay
slate"). No dollars, and no hours-saved either: an unprovable time-value estimate is the same trap
as `$27` wearing a different hat.

Also gone: the "Good to see you, Casey" greeting (a headline that says nothing costs the most
valuable line on the page) and the row of five equal nav tiles (nav is the sidebar's job).

## Q2 · Queue, table or board

**A "today" queue, with the pipeline as the same list grouped by stage. Not a board.**

- **Board** reads native to brokers and home services, alien to tax pros, and it dies at 390px: five
  stage columns become a horizontal scroller where you can never see two stages at once, plus
  drag-to-advance with a thumb on a moving surface. A board's actual value is spotting throughput
  bottlenecks across hundreds of cards. Casey has fifteen. Five columns of two cards is empty
  theatre.
- **Table** is familiar to all three (everyone has lived in a spreadsheet) but it survives mobile
  only by degrading into cards, at which point it isn't a table. It is also the pattern that most
  strongly implies *you* do the data entry, which fights Q3 directly.
- **Queue** wins because the metaphor isn't CRM, it's **inbox**. Nobody in any of the three verticals
  needs training on an inbox. And it is natively one column, so 390px is the *same* layout, not a
  degraded one. Look at frame 4: the desktop and the phone are the same component.

Stage doesn't disappear. Every row carries a stage pill, and the pipeline view groups by stage with
sticky-ish headers and counts, ordered by who is waiting on whom: Replied → Follow-up due → On hold
→ Drafted → Sent → Warm → Passed. That is the board rotated ninety degrees, and rotating ninety
degrees is exactly what makes it phone-native.

## Q3 · Making it unmistakable the agent did this

Six moves, cheapest first:

1. **Actor-first sentences.** Every row and log entry starts with the doer: "Arthur re-checked all
   15 properties", "Arthur nudged Alvina Ptacek", "Ray Pfannenstiel wrote back". Never "Lead
   updated." Passive voice is what makes a CRM feel like furniture.
2. **A next-run time.** The byline strip reads *Arthur · Working · last run 41 minutes ago · next run
   Monday, 8:00 am*. A CRM has no next run. This is the single cheapest, strongest proof the labour
   wasn't yours, and it costs one row of chrome.
3. **No Add button, anywhere.** Where a CRM puts "+ New record" we put a card that says *"There's no
   Add button here, on purpose"* and a secondary action framed as delegation: **Hand Arthur a
   property**. Clients will want to hand him a name; the framing is a request, not a form.
4. **His reasoning, in his words, in a second typographic register.** Field data is set in the UI
   voice. Arthur's judgment is indented prose behind a teal rule, like a pull-quote: *"The LP's
   registered agent changed in March, which usually means a family is sorting something out."* CRMs
   show fields. A colleague shows judgment. This is the part no CRM has and the part that can't be
   faked by a schema.
5. **Forward-looking status.** Not "last contacted 24 Jul" but *"Next: day 7 nudge, tomorrow 8:10
   am."* The system volunteers what it's about to do. That's a person's report, not a record's
   metadata.
6. **Consequences of your decision are shown back to you.** Decided items don't vanish; they drop
   into the log with their outcome, so an OK on Monday reads as a reply on Wednesday.

## Q4 · Where approvals live

**The root route is the approval queue.** Not a tab off it, not a bell icon. For a single-agent
client, `/` opens on what's waiting, because that's the portal's only irreplaceable job. Email can
carry the notification; email cannot carry six decisions comfortably.

Design specifics that matter more than the placement:

- **Batch is the unit, because batching is how Arthur actually works.** One card: "Monday outreach
  batch, 6 owners, drafted Sunday 8:04 pm", his note about *why those six*, and the fact he held one
  out. One card, one decision, one thumb.
- **"Read the six drafts" is the filled button; "Approve all six" is the secondary.** Both are one
  tap. The visual weight sits on the one that keeps her supervising, because one click that sends six
  emails in Casey's name is precisely how you earn the "I didn't know it sent that" phone call, and
  that call costs more than the friction saves.
- **Per-draft review is an expansion, not a page.** Six approvals must not cost six navigations.
  Frame 2 shows all six in one scroll: one open with the full letter, one edited, one skipped, three
  collapsed to a line. Six pips at the top so you always know what's left.
- **Editing is training.** "You rewrote the opening line. I've kept your version, and I'll write the
  next batch that way." That single sentence is the difference between an approval queue and a chore.
- **The empty state is a good state.** "Nothing waiting on you. Arthur's next batch lands Monday
  morning." Never "No items."

## Q5 · Does a CRM fit this design system

**A CRM's *job* fits. A CRM's *table* does not.**

A dense twelve-column grid needs cell borders (banned as the #1 AI tell), ~12px type (below the
system's comfortable floor), and zebra striping (a gray-outline cousin). Build that and we break
three rules on day one and ship something that looks like every other AI-built CRM.

But we don't need density, because density is a requirement of *volume* and *bulk manual editing*,
and neither is our client's job. The compromise I'd defend: **rows, not cells.** One owner is one row
you read like a sentence. Where numbers genuinely want alignment (units, vintage, hold period, loan
maturity) they sit in a DM Mono strip with tabular figures inside the row. Tabular where tabular
helps, prose everywhere else. That's how the information density survives the restraint.

The restraint also does real work here: fifteen rows of readable prose is scannable in a way fifteen
rows of twelve columns never is, and the elevation ramp plus the hairline group rules give structure
without a single card outline.

**Colour semantics I'd lock now** (bottom of the mockup), because a lead surface is where a palette
usually goes to die:

| Meaning | Token | Where |
|---|---|---|
| Needs Casey | `--amber` | drafts waiting, a reply she must answer, a rule Arthur needs |
| Arthur will act, unattended | `--blue` | "Day 7 today" |
| Waiting on the world | muted | "Sent Tue" |
| Something good | `--emerald` | "Call after the 15th" |
| Scenario (OFF-MARKET / LISTING / REFI) | **no hue**, DM Mono on the wash | it's a category, not a state |
| Us | teal | mark, accent stripe, the rule beside Arthur's words, ledger numerals, one headline word, primary button |

Teal never enters a status pill. Colour is never the only signal: the card that's waiting also says
"3 days waiting" in words.

---

## Implementation notes for whoever builds it

- New surface: `/` becomes the desk (approvals + ledger + log). `/agents/[id]/leads` becomes
  `/pipeline` with stage grouping. New route for batch review.
- The existing `Lead` model already carries `status`, `source`, `notes`, `details`, `lastContactedAt`
  and a JSON `details` bag, which is where scenario, units, vintage and hold period already live in
  Casey's real records. The `details` chips on the current leads page are raw key-value dumps
  (`crexi_check: No exact match found...`); the worklist row renders them as prose plus a mono facts
  strip instead.
- Arthur's judgment line needs a real field. Today his reasoning is buried in `notes` mixed with
  process narration. Suggest a dedicated `rationale` (one or two sentences, written for the client)
  distinct from `notes`, and a `nextAction` + `nextActionAt` pair so "Next: day 7 nudge, tomorrow
  8:10 am" is data, not prose.
- Approvals already exist as `Recommendation` and the `request_approval` autonomy path. Batch
  grouping is the missing concept: drafts need a `batchId` so six drafts are one card.
- `Activity` should be renamed. It's an email send log, useful for support, useless as proof of
  value: today it shows three zeroes and seventeen identical "Re: Arthur — Litsey Real Estate" rows.
  Proposed as **Threads** (conversations, with the reply visible) and demoted below Pipeline.
- Next 16 / Turbopack: the `{expr}` + adjacent-text space gotcha applies to every one of these
  sentences. Use `{" "}`.

---

## Rating

### "Make the portal a lightweight CRM" — **7 / 10**

Right instinct, wrong noun. The 7 is for a genuinely good product judgement: the portal needed a
reason to exist between emails, lead-shaped records are the right common denominator across CRE, tax
and home services, and familiarity beats novelty for a client who logs in monthly. The three points
off are for the word "CRM" itself, which sets an expectation (I maintain records here) that inverts
the product's whole claim (someone else does the work), and which drags in a feature backlog we
can't win and shouldn't fund. Ship the worklist and the CRM instinct is fully satisfied; call it a
CRM and we've promised a HubSpot competitor.

### The strongest reason my own design might be wrong

**The queue assumes a returning client, and Casey isn't one.**

Everything above optimises for someone who opens the portal every couple of days. A broker will
ignore it for eleven days and then open it with three stale batches and forty log entries. A queue
has no memory of what you already saw and no way to say "these eighteen are moot now." A board or a
table at least lets you triage spatially and skip. If the real usage pattern is one visit a month,
then the pipeline should be the primary surface and my desk is the wrong bet, and the fix isn't
cosmetic: it's a "what changed since you were last here" model the whole page hangs off, which I've
only gestured at with the "Since you last looked" header.

Second-order, and worth Kyle's attention on its own: **batch approve is an approval-fatigue
machine.** I've weighted the UI toward reading, but the button still exists, and the first time six
emails go out in Casey's name because she tapped it on a phone in a parking lot, the supervised
promise takes the damage. Options are a first-batch-must-be-read rule, or a hold window where an
approved batch can still be pulled back before 8:10 am. The mockup hints at the second ("you can
stop the batch any time before it goes") without designing it.
