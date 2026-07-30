# Client portal — information architecture and navigation model

> **SUPERSEDED 2026-07-30.** This describes portal **v2**, a dashboard with a
> light rail and eight destinations. Kyle rejected the direction; what shipped
> is **v3**, a lightweight CRM with a dark rail, a hot/warm/cold leads board and
> an account section. Kept for the reasoning and the measured findings, which
> are still good — the layout decisions are not.
>
> Build against: `client-portal/DESIGN.md` (tokens and rules, current) and
> `docs/mockups/portal-crm-v3/index.html` (the approved reference).

**Status:** build-ready spec, pending Kyle's answers to §10 (3 questions, each with a default).
**Author:** Parker (PM) · **Date:** 2026-07-29
**Scope:** IA and navigation only. Not visual design — every screen still obeys
`client-portal/DESIGN.md`, and any UI work invokes the frontend-design skill first.

**Standing on:** Kyle's ruling on `docs/specs/portal-crm-decision.md` — we build **both** the
narrow results ledger / approval desk **and** client-editable records. The agent authors the
record; the client can correct it (wrong email, dead lead). The client is not the primary
author: no CSV import, no stage builder, no bulk manual entry. Value is shown as work
delivered, never as a dollar figure. That is settled. This spec builds the IA on top of it.

Also read: `docs/mockups/portal-crm/RATIONALE.md` (designer's approval-desk concept) and
`docs/plans/portal-crm-architecture.md` (Sloane's assessment). Where they disagree with each
other I say so and pick.

---

## 1. Rating of today's navigation: 4 / 10

The parts that are good are genuinely good: the sidebar component itself is well built, the
mobile drawer closes on route change and traps Escape correctly, and the skeletons are
crafted rather than gray blocks. The four points are for those. The six missing points are
below, worst first.

### The single worst navigational failure

**The portal has no persistent layout, so navigating destroys the navigation.**

`PortalShell` is rendered by each `page.tsx`, not by a route layout. The only layout in the
app is `client-portal/src/app/layout.tsx`, which sets fonts and nothing else. So every
client-side navigation unmounts the entire shell — sidebar included — and while the next
page's server component resolves, that route's `loading.tsx` renders `PortalSkeleton`, which
draws a **different chrome shape**: a centred `max-w-[1200px]` top bar where the 240px
sidebar was (`client-portal/src/components/skeleton.tsx:43-58`). The client clicks a sidebar
link, the sidebar disappears, a header they have never seen flashes in, then the sidebar
comes back.

It happens on every navigation on every authenticated screen. It is why the portal feels
like a set of pages rather than a product, and it is the single thing to fix before anything
else in this spec. The comment in `skeleton.tsx` ("so the skeleton doesn't shift when the
real page — which renders its own header — swaps in") is honest and now stale: it was
written when pages had their own top bars, before the shell became a rail.

### Runners-up, in order

2. **Tools has no shell at all.** `agents/[id]/tools/page.tsx:100` opens a bare `<main>` — no
   `PortalShell`, so no sidebar on desktop and no top bar, hamburger or account menu on
   mobile. Its `loading.tsx` *does* render `PortalSkeleton`, so it promises chrome that never
   arrives. This is the destination of the home page's primary CTA ("Connect tools →",
   `page.tsx:269-274`), which means **the first click most new clients ever make lands on the
   one page with no navigation.**
3. **Every 404 is a dead end.** There is no `not-found.tsx` and no `error.tsx` anywhere in
   `client-portal/src/app`. `notFound()` fires on cross-client access from four routes and
   renders Next's built-in page: no shell, no breadcrumb, no link home.
4. **Three back idioms that disagree.** `/agents/[id]` says "← Back to overview" pointing at
   `/`; `/activity` and `/leads` say "← Back to {agent}"; `/tools` renders a breadcrumb. A
   client learns one and it is wrong on the next screen.
5. **Two nav systems for the same five destinations.** The home page's five tiles
   (`page.tsx:284-324`) are the same set as the sidebar's five sub-items
   (`sidebar.tsx:82-87`), rendered differently, with different labels and different order.
6. **Nav that lies.** Two of the sidebar's six sub-items are `#` anchors that scroll rather
   than navigate and can never show as active; Activity's header is three stat cards that
   read 0 / 0 / 0 for a new client; a deep link clicked while signed out drops the intended
   path entirely (`middleware.ts:79-83` redirects to `/login` with no `next`, even though
   `api/auth/callback/route.ts:9` already reads one).

---

## 2. The target route map

Three levels, and only three: **account → agent → record.** Nothing nests deeper.

| # | Route | Level | vs. today | The one job | The one next action |
|---|---|---|---|---|---|
| 1 | `/` | account | **Rebuilt.** Nav tiles deleted, plan card moved | Deal with what is waiting, then see what happened since last time | Resolve the top waiting item |
| 2 | `/approvals` | account | **New** | See everything waiting on me, and confirm what I already decided | Open the oldest pending item |
| 3 | `/approvals/[approvalId]` | account | **New** | Read one batch and decide it | Approve, change, or decline — then the next one |
| 4 | `/billing` | account | **New** (split out of `/`) | Understand and change what I pay | Open the Stripe portal, or write to us |
| 5 | `/agents/[id]` | agent | **Repurposed** from settings dump to the agent's file | See how this agent is set up and change it | Change one setting, or connect a tool |
| 6 | `/agents/[id]/results` | agent | **Renamed** from `/leads` | See what this agent produced | Open a record, or export the filtered set |
| 7 | `/agents/[id]/results/[recordId]` | record | **New** | Read the agent's judgment on one record, and correct it if it is wrong | Apply a correction, or send it back to the agent |
| 8 | `/agents/[id]/threads` | agent | **Renamed + demoted** from `/activity` | Check whether a specific message went out and what came back | Open a thread |
| 9 | `/agents/[id]/threads/[threadId]` | record | **New** (ships with #8 or not at all) | Read one exchange end to end | Reply, or go back to the list |
| 10 | `/agents/[id]/tools` | agent | **Kept**, now inside the shell | Give the agent the access it is missing | Connect the next unconnected tool |
| 11 | `/agents/[id]/chat` | agent | **New** (session-authed sibling of `/chat/[agentId]`) | Ask the agent something right now | Send a message |
| 12 | `/login` | public | Kept, `?next=` added | Get in | Enter the code |
| 13 | `/chat/[agentId]?t=` | token | Kept as an **entry point only** | Land a client from an email into their conversation | Server-redirect to #11 when a session exists |

**Out of scope, listed so nobody deletes them:** `/onboard`, `/onboard/[token]`,
`/proposals/[token]`, `/quotes/[token]`. These are the prospect funnel (Atlas), token-gated,
pre-account, and share no chrome with the portal. They stay exactly as they are.

### Merged, renamed, deleted — explicitly

| Action | Detail |
|---|---|
| **Rename + 308** | `/agents/[id]/leads` → `/agents/[id]/results`. Label from `Agent.resultsLabel` (nullable, defaults to "Results"). Never "Leads", never "CRM". |
| **Rename + 308** | `/agents/[id]/activity` → `/agents/[id]/threads`. Demoted below Results in the rail. |
| **Delete** | The five-tile nav grid on `/` (`page.tsx:280-327`). The rail is the navigation; a second copy of it is not a hero. |
| **Delete** | Activity's three stat cards (`activity/page.tsx:68-72`). See rule E2 in §6. |
| **Delete** | The two anchor items in the rail, `#communication` and `#settings` (`sidebar.tsx:83, 87`). They are sections of a page, not destinations. The anchors survive for email deep links; they are not nav. |
| **Delete** | The "Overview" sub-item (`sidebar.tsx:82`). The agent's name in the rail *is* that link. |
| **Move** | The "Monthly plan" card (`page.tsx:381-408`) from `/` to `/billing`. The no-dollar-figure rule is about *value*; the price you pay is legitimately money and belongs on a money page. |
| **Merge** | `/chat` (the "open your email" landing) survives only as the bare `chat.ambitt.agency` root fallback. It is not portal navigation and gets no rail item. |
| **Keep, unchanged** | `/login`, and every route under `/api`. |

### Why each new route earns its place

- **`/approvals`** — an approval today exists only as a `Recommendation` row resolvable by a
  mailto (`shared/platform-tools/request-approval.ts:89-123`). The portal cannot show one and
  cannot resolve one. So a supervised agent that has stopped and is waiting looks, in the
  portal, exactly like an agent that is working. That is the product-integrity bug I ranked
  #2 in the decision doc, and it is a navigation problem: there is no destination for the
  portal's most important state. `/approvals` also holds the **decided archive**, because
  "did I approve that?" is a real question whose answer currently lives nowhere.
- **`/approvals/[approvalId]`** — the target of the email CTA, and the only way six decisions
  cost one navigation instead of six. The designer is right that per-draft review is an
  expansion inside this page, not six pages.
- **`/agents/[id]/results/[recordId]`** — required by Kyle's ruling. Correction needs
  somewhere to live, with room for the agent's reasoning, provenance ("you changed this"),
  and undo. It cannot be an inline card in a list and it must not be a modal (see §9).
- **`/billing`** — splitting money out is what lets `/` be about work without a dollar figure
  fighting it for the fold.
- **`/agents/[id]/chat`** — today a signed-in client cannot reach chat except via a tile that
  mints a bearer token into a URL with no expiry. A session-authed route inside the shell
  removes the need to hand out a token to your own logged-in user.

---

## 3. The one-agent problem

Every real client today has exactly one agent, and `/` and `/agents/[id]` overlap badly. The
honest diagnosis is not "two pages for one agent" — it is that **the portal has two index
pages and no work page.** `/` is a router (greeting + tiles + roster). `/agents/[id]` is a
settings dump mislabelled "Overview." Neither answers "what happened, and what needs me."

### Three options, and the one I would build

**(a) Flatten for one agent.** Hide the agent level; `/results` instead of
`/agents/[id]/results`; re-introduce the level on the second agent. **Reject.** URLs would
change the day a client adds an agent, and every deep link we have ever emailed them dies.
Email is our primary channel. A dead link in an agent's own email is the worst failure
available to us. It also means two IAs to build, two to QA, and a migration nobody will
remember to write.

**(b) `/` redirects to the single agent.** **Reject, hard.** A redirecting root is a
back-button trap: back from the agent page hits `/`, which redirects forward again, and the
client cannot leave. It also makes "Home" in the rail reload the page you are already on.

**(c) Split by job, not by scope. Build this.**

- **`/` is account-level and is a different job, not a smaller version of the agent page.** It
  answers "what needs me / what happened." With one agent it renders that agent's desk inline,
  with no agent chooser and no roster. With five agents it renders the same desk with an agent
  name on every row, and a roster below.
- **`/agents/[id]` always exists**, at the same URL, from one agent to five, and is strictly
  "this agent's file": who it is, what it is doing right now, when it next runs, and how it is
  configured. Rename it in the rail from "Overview" to nothing — the agent's name *is* the
  link — and give the page a real status header so it stops being a settings dump.
- **Work surfaces stay agent-scoped** (`/agents/[id]/results`) because the data is agent-scoped
  and Sloane is right that the scope key is the one decision not to get wrong.

**What happens when they add a second agent: nothing changes.** No URL moves, no link breaks.
`/` grows an agent column on its rows and a roster section; the rail grows a second agent with
its own sub-items. That is the entire delta, and it is the reason to accept one extra level of
path depth today.

**The boundary to hold:** `/` may **count and list across agents** (approvals waiting, work
delivered). It may never become a **merged record book** with a cross-agent dedupe key. The
first is a read-only view over agent-scoped rows. The second is the specific step that makes
us the client's system of record, and it is the one Sloane flagged as unrecoverable. Anyone
who later proposes `/results` at account level is proposing that step, whatever they call it.

---

## 4. Navigation model

### 4.1 Global vs contextual

| Always reachable (global) | Scoped to one agent (contextual) |
|---|---|
| Desk `/` | Results |
| Approvals `/approvals` | Threads |
| Plan & billing `/billing` | Tools |
| Account menu (name, email, sign out) | Chat |
| The agent list itself | The agent's own page |

Three global destinations. Four contextual ones. Contextual items exist only under an agent
and are never promoted to the top level.

### 4.2 Sidebar, top nav, or both — one rail, and here is the defence

**Decision: a single left rail on desktop, a drawer behind a hamburger on mobile. No top
navigation. Ever.**

```
[Ambitt Agents]                      → /
──────────────────────────────
Desk                          (2)    → /            ← the only waiting-count badge
Approvals                            → /approvals   ← appears once one has ever been requested
──────────────────────────────
YOUR AGENTS
● Arthur                             → /agents/<id>
     Results                         → /agents/<id>/results
     Threads                         → /agents/<id>/threads
     Tools                     •     → /agents/<id>/tools   ← dot when something needs setup
     Chat                            → /agents/<id>/chat
──────────────────────────────
Plan & billing                       → /billing
[CL] Casey Litsey · casey@…   Sign out
```

**Defence for a client with one agent.** Eight rail items total, of which four are that one
agent's pages, nested under its name with a status dot. A top nav would put the same eight
items in a horizontal row with no way to express that four of them belong to Arthur. The
nesting *is* the information: it tells a client that Results belongs to Arthur, which is the
whole ownership story we sell. And the rail's status dot means the answer to "is my agent
working" is visible at rest on every screen, without a page dedicated to it.

**Defence for a client with five agents.** A top nav needs an agent-switcher dropdown: hidden
state, one extra click per switch, and the other four agents' statuses invisible until you
open it. The rail shows all five with their dots, permanently. Switching agents is one click
from anywhere. The fleet being visible at rest is proof-of-supervision that costs us no
screen real estate.

**Why not both.** Both is what we half-have now, and it is exactly why the five home tiles
duplicate the five rail sub-items. Two nav systems means two places to add a destination, two
to keep in sync, and two chances to disagree — and they already do disagree, on labels and on
order.

**What replaces a top nav:** a **page header row inside the content column**, carrying the page
title, the breadcrumb above it, and the page's single primary action on the right. That is
page-level control, not navigation, and the distinction should stay visible in the code:
anything in the rail changes which page you are on; nothing else does.

### 4.3 Breadcrumbs, back links, or neither

**Breadcrumbs at depth ≥ 1. No "← Back to X" link anywhere in the portal. Delete all three of
today's.**

The reasoning, in one sentence: **a breadcrumb is a parent trail; a back link pretends to be a
history trail and lies whenever the client arrived from an email.** `/agents/[id]`'s current
"← Back to overview" is the clearest case — it points at `/`, which is not where most people
came from, and calls itself "back."

Rules:

- **N1.** Depth-0 screens (`/`, `/approvals`, `/billing`) render no breadcrumb. They have no
  parent. They render a page title.
- **N2.** Every screen at depth ≥ 1 renders the full parent trail:
  `Home / Arthur / Results / Ray Pfannenstiel`. Every crumb except the last is a link. The
  last is text.
- **N3.** The word "Back" never appears in the portal. Browser back handles history; the
  breadcrumb handles hierarchy. Naming them differently is what stops clients confusing them.
- **N4.** The breadcrumb is derived from the route, never from `document.referrer` or a
  `from=` param. It must render identically for a client who clicked through and a client who
  landed from an email.
- **N5.** On < 640px the trail stays complete and becomes horizontally scrollable, with the
  last crumb allowed to truncate with an ellipsis. No collapsing menus, no hidden crumbs, no
  new component.

### 4.4 Deep-linking and shareability

**A record gets its own URL. Yes.** `/agents/<agentId>/results/<recordId>`. `Lead.id` is a
cuid, so it is unguessable, and ownership is still verified server-side on every request —
the URL is not the auth. This is what lets an agent write "here's the one I'd push on" in an
email and have the link land somewhere useful.

**A batch awaiting approval gets its own URL. Yes.** `/approvals/<approvalId>`, and it is the
target of the action-required email CTA. Without it, six approvals in one email means six
mailto round-trips.

**List state lives in the URL.** `/agents/<id>/results?stage=qualified&q=riverside&sort=recent&cursor=…`.
Non-negotiable, and not a nice-to-have: URL state is what makes browser back land on the exact
filtered list you left, what makes a filtered export honest, and what lets support say "open
this link." It is the cheapest correct-back mechanism available.

- Typing in search updates the URL with **`replace`** (debounced 300ms) so back does not walk
  backwards through a half-typed query.
- Committing a filter, a sort, or a page uses **`push`** so back removes one filter at a time.

**What is not shareable, deliberately:** nothing in the portal is public. Every route except
the prospect funnel is session-gated. **The one live hazard is `/chat/[agentId]?t=<token>`** —
a forwarded email hands over a client's agent. The IA fix is #11: a session-authed
`/agents/[id]/chat` for signed-in clients, with `?t=` reduced to an entry point that
server-redirects into it when a session exists. A server redirect replaces rather than pushes,
so back from chat exits to wherever the client came from rather than looping. (Token expiry
itself is the 2026-07-28 audit's item, not this spec's.)

### 4.5 Mobile

**Same route map, same hierarchy, same URLs. No separate mobile IA.** Emailed deep links land
on phones more than desktops; a divergent mobile structure means a link that works in one
place and not the other.

What collapses:

- The rail becomes the existing drawer behind a hamburger in a sticky top bar. Keep the
  component; it already closes on route change and handles Escape.
- The **hamburger carries a dot when something is waiting on the client.** That is the mobile
  answer to "is anything waiting," and it means the waiting count is never more than one tap
  away from any screen.
- The page's primary action becomes a **sticky bottom bar** on the two screens where the
  action is the point: `/approvals/[id]` (Approve / Change / Decline) and
  `/results/[recordId]` (Save correction). Never a floating action button.

What does not collapse:

- The breadcrumb. With the drawer closed it is the only always-visible way up, so it stays
  on every screen at every width.
- The record list. It is one column grouped by stage at every width — the same component on
  desktop and phone. **No horizontally-scrolling kanban board.** The designer's argument is
  correct and I am adopting it over my own decision doc's "pipeline board": a board dies at
  390px, five columns of two cards is empty theatre at 15 records, and it is alien to a tax
  practice. Stage grouping keeps the CRM grammar; the board does not survive the phone.

### 4.6 Empty and loading states as navigational facts

These are requirements, not decoration. The portal today shows a client three zeroes and
calls it Activity.

- **E1. A destination that can only ever be empty must not exist as a destination.** Rail
  visibility is derived from data, per agent: Results appears once the agent has produced one
  record, Threads once a reply exists, Approvals once one has ever been requested. Direct
  navigation to a hidden route still renders the crafted empty state, never a 404, so old
  email links keep working.
- **E2. Zero is not a metric.** No stat tile may render `0`. If a count is zero, the tile is
  replaced by a sentence naming what happens next: "Arthur's first outreach goes out Monday
  morning." Activity's `0 / 0 / 0` is the canonical violation and the reason this rule exists.
- **E3. Every empty state names the next real action or the next scheduled event, with a live
  link or a time.** "No items" fails. "Nothing waiting on you. Arthur's next batch lands
  Monday at 8:00 am" passes.
- **E4. The loading skeleton has the same chrome as the loaded page.** The rail is identical
  across routes, so it must persist through the navigation, not flash. Only the content column
  skeletonises. A shell that survives a navigation is itself a navigational fact: it tells the
  client the app did not reload.
- **E5. Errors keep the navigation.** `not-found.tsx` and `error.tsx` live inside the portal
  route group, render inside the shell, keep the breadcrumb, and offer one link home plus the
  support address. A dead end is a navigation bug, not an error state.
- **E6. A pending state is a destination, not a badge.** If an agent is waiting on the client,
  the desk says so in a sentence with a link to the decision. "Active" is not an acceptable
  label for an agent that has stopped and is waiting.

---

## 5. Jobs, and where a route has none

Per route: the one job, the one next action. Anything that fails this test is cut in §2.

| Route | Client's job here | The one next action | Verdict |
|---|---|---|---|
| `/` | "Is anything waiting on me, and what has happened?" | Resolve the top waiting item | Keep, rebuilt |
| `/approvals` | "Show me everything waiting, and what I already decided" | Open the oldest pending item | New |
| `/approvals/[id]` | "Read this batch and decide it" | Approve / change / decline, then the next | New |
| `/billing` | "What am I paying and can I change it?" | Open the billing portal | New |
| `/agents/[id]` | "How is this agent set up, and is it working?" | Change one setting, or connect a tool | Repurposed |
| `/agents/[id]/results` | "What has this agent produced?" | Open a record, or export the filtered set | Renamed |
| `/agents/[id]/results/[id]` | "Is this one right, and if not, fix it" | Save a correction, or hand it back to the agent | New |
| `/agents/[id]/tools` | "Give it the access it is missing" | Connect the next unconnected tool | Keep |
| `/agents/[id]/chat` | "Ask it something now" | Send a message | New |
| `/agents/[id]/threads` | "Did that message go out, and what came back?" | Open a thread | **Conditional — see below** |

**Threads is the one route whose job is in doubt, and I am putting a bar on it rather than a
verdict.** As it exists today it is an email send log: three zeroes and seventeen identical
"Re: Arthur — Litsey Real Estate" rows, and its only next action is "read a subject line."
That is a support tool wearing a client surface.

**The bar: Threads ships only if it joins the inbound reply, so a row is a conversation with
an outcome, not a send with a status.** If we are not funding the reply join this cycle, delete
`/activity` now and fold delivery status into two places where it already has a job: a
delivery line on the record (`/results/[recordId]`) and a bounce notice on the desk. That is
open question #3.

---

## 6. Navigation behaviour spec — QA-testable

This section is the acceptance surface for "back and forth navigation." A QA engineer should
be able to run every row without asking a question.

### 6.1 Hard rules

| ID | Rule |
|---|---|
| **B1** | The shell (rail, mobile top bar, footer) is rendered by a route-group layout, not by any page. It must not unmount on any client-side navigation within the portal. |
| **B2** | Browser back is the only back. No control in the portal is labelled "Back." |
| **B3** | Actions never navigate. Approve, save a correction, connect a tool, pause an agent: all stay on the screen, revalidate in place, and show the result. One exception, B4. |
| **B4** | In the approval queue only, deciding an item advances to the next pending item with **`replace`**, not `push`. Back from item 2 goes to `/approvals`, never to the item you just decided. |
| **B5** | **Back is never undo.** Undo is a 60-second control on the destination screen. Going back after an action must never present the action as un-done. |
| **B6** | **Back must never show a decision you already made as still pending.** Every mutating action calls `revalidatePath` for the desk, `/approvals`, and the affected list; those segments carry a router-cache staleTime of 0. |
| **B7** | List state (filter, search, sort, cursor) lives in the URL. Typing uses `replace`; committed changes use `push`. |
| **B8** | A deep link hit while signed out redirects to `/login?next=<encoded path>`; after the code is entered the client lands on `<path>`, and the login navigation uses `replace` so back never re-enters the login flow. |
| **B9** | Server-side redirects (`/chat/[agentId]?t=` → `/agents/[id]/chat`) replace rather than push. Back from the destination exits the site, and never loops. |
| **B10** | Every screen at depth ≥ 1 renders a complete parent breadcrumb, derived from the route only, and is fully usable with an empty history stack. |

### 6.2 Where back goes, from every screen

| From | Arrived by | Browser back lands on | Breadcrumb / rail leads to |
|---|---|---|---|
| `/` | rail, brand lockup, or sign-in | previous history entry; from a fresh sign-in, `/login` is not in history (B8 uses `replace`), so back exits the site | no breadcrumb (depth 0) |
| `/approvals` | rail | `/` | no breadcrumb |
| `/approvals/[id]` | list | `/approvals`, with the item now in the decided section if decided (B6) | `Home / Approvals / <batch title>` |
| `/approvals/[id]` | email CTA, signed in | exits the site (no history) | same breadcrumb — the only way up, and it must be there |
| `/approvals/[id]` | email CTA, signed out, then OTP | exits the site. `/login` is **not** in history because the post-OTP navigation replaces (B8), so back can never re-enter the login flow | same breadcrumb |
| `/approvals/[id]` after deciding, more pending | in-queue advance (B4) | `/approvals` | `Home / Approvals / <next batch title>` |
| `/approvals/[id]` after deciding the last one | in-queue advance | wherever the client was before entering the queue | resolves to `/approvals`, showing the "nothing waiting" state plus the just-decided item with undo |
| `/billing` | rail | previous entry | no breadcrumb |
| `/agents/[id]` | rail agent name, or desk row | previous entry | `Home / Arthur` |
| `/agents/[id]#communication` | email deep link | exits the site | `Home / Arthur`; the hash is set by the in-page section index with `replace`, so back does not walk through anchors |
| `/agents/[id]/results` | rail | `/agents/[id]` if that is where they were; otherwise the previous entry — **we do not force it** | `Home / Arthur / Results` |
| `/agents/[id]/results?stage=qualified` | filter click (`push`) | `/agents/[id]/results` with the filter removed, one filter per back press | same |
| `/agents/[id]/results?q=river` | typing (`replace`) | the state before typing began, in one press | same |
| `/agents/[id]/results/[recordId]` | list row | the filtered, sorted, scrolled list exactly as left (B7 + scroll restoration) | `Home / Arthur / Results / <record name>` |
| `/agents/[id]/results/[recordId]` | agent email link | exits the site | same breadcrumb, and the page is fully usable — the correction control does not depend on having come from the list |
| `/agents/[id]/results/[recordId]` after saving a correction | no navigation (B3) | the list, showing the corrected value (B6) | same |
| `/agents/[id]/tools` | rail, or the desk's setup CTA | previous entry | `Home / Arthur / Tools` |
| `/agents/[id]/tools` after an OAuth round-trip | Composio callback | must land back on `/agents/[id]/tools` with the tool showing connected; **back must not re-trigger the OAuth redirect** | same |
| `/agents/[id]/chat` | rail | previous entry | `Home / Arthur / Chat` |
| `/chat/[agentId]?t=` | agent email, session present | exits the site (B9 replace) | lands on `/agents/[id]/chat` |
| `/chat/[agentId]?t=` | agent email, no session | stays on the token-authed full-bleed chat; its "Portal" link is a relative `/`, not a hard-coded production URL | n/a |
| not-found (bad or unowned agent id) | any | previous entry | renders in the shell with `Home` breadcrumb and one link home |
| error boundary | any | previous entry | same, plus a retry that re-renders the segment without a full reload |
| `/login` | signed out | previous entry | n/a |

**Two behaviours that are easy to get wrong and must be tested explicitly:**

1. `/agents/[id]/results` → open record → back → **the list must be filtered, sorted and
   scrolled exactly as left.** This is the single most-used back path in the redesigned portal
   and the one Kyle's brief is really about.
2. Approve on `/approvals/[id]` → back → **the desk must not still say "1 waiting."** That is
   B6, and it is the class of bug that makes an app feel broken even when every screen is
   correct on first load.

---

## 7. What I would not build, and why

1. **An account-level `/results` merging every agent's records.** The desk may count across
   agents; the ledger stays agent-scoped. This is the step that makes us the system of record,
   and it is the one that is very hard to walk back once clients organise around it.
2. **A top nav alongside the rail.** Two nav systems is the disease we are curing, not a
   feature.
3. **Tabs inside `/agents/[id]`.** Tabs plus rail sub-items is the same disease at a smaller
   scale: two controls for the same four destinations.
4. **A modal for record detail.** A modal has no URL, so it cannot be emailed, bookmarked, or
   backed out of — which breaks precisely the thing Kyle asked to be top notch.
5. **Infinite scroll on the record list.** It breaks back-restoration and makes "page 3"
   unlinkable. Cursor pagination with the cursor in the URL instead.
6. **A notification bell with a dropdown feed.** The desk *is* the notification surface. A bell
   is a second inbox, and second inboxes go stale.
7. **A global command palette or cross-agent search.** At 15 to 240 records, the list's own
   search is enough, and a palette is a power-user affordance for a client who logs in monthly.
8. **Saved views, custom filters, per-client stage vocabularies.** Ruled out by Kyle's
   decision; also every one of them forces downstream features to branch on client config.
9. **Drag-and-drop stage changes.** A drag is a bulk-authoring gesture, and it does not exist
   on a phone.
10. **A separate mobile IA, a mobile app, or push notifications.** Same routes, same URLs,
    everywhere.
11. **`/` redirecting to the single agent.** Back-button trap. See §3(b).
12. **Deeper nesting than three levels** — no `/agents/[id]/settings/communication`. One agent
    page with sections, anchored for email deep links only.
13. **Route-level animated transitions.** They add perceived latency to exactly the back-and-forth
    Kyle wants to feel fast.

---

## 8. Phasing — one verified step at a time

Each increment is independently shippable, independently verifiable, and sized for one
engineer-agent.

| # | Increment | Why this order |
|---|---|---|
| **IA-0** | **Persistent shell.** Move `PortalShell` into `app/(portal)/layout.tsx`; skeletons render inside it and only skeletonise the content column; add `not-found.tsx` + `error.tsx` in the group; wrap Tools in the shell; add `?next=` to `middleware.ts` and read it in `login/page.tsx`. **No new screens.** | Every other increment inherits the shell. Fixing the worst failure first also makes the rest testable. |
| **IA-1** | **Rail + breadcrumb.** Rail item set per §4.2, data-derived visibility (E1), breadcrumbs per §4.3, all three back links deleted, home tiles deleted, Activity stat cards deleted, renames + 308 redirects. | Structure before content. Ships a coherent portal with today's screens. |
| **IA-2** | **The desk.** Waiting slot with priority resolution, work-delivered ledger in verbs, since-last-visit framing, `/billing` split out. | Now `/` has a job that is not "be a menu." |
| **IA-3** | **Records.** `/results/[recordId]`, URL list state, cursor pagination, the correction affordance and its provenance display. | The first client write path. Needs §10 Q2 answered. |
| **IA-4** | **Approvals + chat.** `/approvals`, `/approvals/[id]`, `/agents/[id]/chat`, `?t=` becomes an entry redirect. | Highest value, highest risk, and it benefits from everything above being settled. |

---

## 9. Acceptance criteria

IA-0 and IA-1 are specified here because they are next. IA-2 to IA-4 get their own criteria
when scoped.

**Prereq — paste-ready data.** `scripts/seed-leads.ts` from the decision doc's Phase 1 is
still the prerequisite and ships with IA-3. IA-0 and IA-1 are verifiable against any existing
client account.

```bash
cd "/Users/kylekufuor/Projects/Ambitt Agents/client-portal"
npx tsc --noEmit && npx next build     # both clean, no new warnings
```

**User story (IA-0 + IA-1).** *Casey signs in on his laptop, moves between Arthur's pages,
gets curious about a lead his agent emailed him about, and goes back to where he was. Then he
does the same thing on his phone in a car park.*

| # | Steps | Expected |
|---|---|---|
| 1 | Sign in at `https://portal.ambitt.agency/login` as the owning client (OTP; the operator email 404s on every per-client surface). | Lands on `/`. Rail visible with Desk, the agent, and Plan & billing. |
| 2 | Click Results, then Tools, then the agent name, watching the left 240px. | **The rail never disappears, never re-mounts, never changes width.** Record with a screen capture at 60fps or a Playwright trace; a single frame without the rail is a fail. |
| 3 | Throttle to Slow 3G, click Results. | Only the content column shows a skeleton. No centred top bar appears at any point. |
| 4 | Navigate to `/agents/<AGENT_ID>/tools`. | Renders inside the shell. On a 390px viewport the top bar, hamburger and account menu are present. |
| 5 | `curl -sI "https://portal.ambitt.agency/agents/<SOMEONE_ELSES_AGENT_ID>"` while signed in | 404. In the browser, the 404 renders inside the shell with a working breadcrumb and one link home. |
| 6 | Sign out. Open `https://portal.ambitt.agency/agents/<AGENT_ID>/results` directly. | Redirects to `/login?next=%2Fagents%2F<AGENT_ID>%2Fresults`. After entering the code, lands on the results page, not `/`. Browser back exits the site; it does not re-enter login. |
| 7 | `grep -rn "Back to" client-portal/src` | **Zero hits.** |
| 8 | `grep -rn "PortalShell" client-portal/src/app --include=page.tsx` | **Zero hits.** The shell is rendered by the layout only. |
| 9 | `grep -rn '#communication\|#settings' client-portal/src/components/sidebar.tsx` | **Zero hits.** No anchor items in the rail. |
| 10 | Open `/agents/<AGENT_ID>/activity` and `/agents/<AGENT_ID>/leads` | Both 308-redirect to `/threads` and `/results`. No dead link anywhere in `sidebar.tsx` or on `/`. |
| 11 | Home page | No five-tile nav grid. No dollar figure. Work delivered is expressed in verbs and counts. |
| 12 | Threads (or Activity, if it survives this increment) with a brand-new agent | No `0` renders anywhere on the page. The empty state names the next scheduled run with a real time. |
| 13 | Agent that has never produced a record | Results does not appear in the rail. Direct navigation to `/results` renders the crafted empty state, not a 404 and not a broken list. |
| 14 | 390px viewport, on every screen at depth ≥ 1 | Breadcrumb visible, horizontally scrollable, last crumb truncates. Hamburger present. Hamburger carries a dot when something is waiting. |
| 15 | Design pass (`client-portal/DESIGN.md`) | No flat gray card outlines. Duotone icons only, never Lucide or Heroicons. Status pills green / amber / red / blue / muted, never teal. Nothing on `--text-4` carries a word. |
| 16 | Copy pass | Every string uses "we" / "our team". No operator name. No "leverage / robust / seamless / delve". No em-dash in any client-visible string. |
| 17 | `npx tsc --noEmit` and `npx next build` in `client-portal/` | Both clean. No literal `{" "}` rendering in any new string (known Next 16 gotcha). |

**IA-3 preview criterion, recorded now so it is not forgotten:** open a record from a filtered,
scrolled list, press browser back, and land on the same filter, the same sort, and the same
scroll position. Then correct a field, press back, and see the corrected value in the list.

---

## 10. Open questions for Kyle

Only #1 blocks IA-2. #2 blocks IA-3. #3 can wait.

1. **Does the desk show approvals across all of a client's agents, or does the client pick an
   agent first?**
   *My default: **across all agents**, with the agent's name on every row. It is the first
   cross-agent surface we would ship, so it deserves an explicit yes. The line I would hold is
   that `/` may count and list across agents but never becomes a merged record book — the
   ledger stays agent-scoped. Asking because that boundary is easy to erode later by someone
   who was not in this conversation.*

2. **When the agent's next run disagrees with a client correction, who wins?**
   *Your ruling gives the client an edit; the runtime's `log_lead` upsert will overwrite it on
   the next run unless we say otherwise. My default: **the client's correction wins on that
   field until the client changes it back**, and the agent raises the disagreement as a note
   on the record ("you have this as a dead lead; I found a new listing under the same owner")
   rather than silently rewriting it. The record page then shows provenance: who last set this
   field and when. Anything else means a client corrects an email address and watches it
   revert.*

3. **Does Threads survive this cycle?**
   *My default: **no.** Delete `/activity` in IA-1, and ship `/threads` later only when it
   joins the inbound reply so a row is a conversation with an outcome. In the meantime,
   delivery status lands in the two places it has a job: a line on the record and a bounce
   notice on the desk. Keeping a route whose only next action is "read a subject line" costs
   us a rail slot and teaches clients the portal has filler in it.*
