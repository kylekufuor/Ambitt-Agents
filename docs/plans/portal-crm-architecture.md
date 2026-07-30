# Portal as a lightweight CRM — architecture assessment

Author: Sloane (Tech Lead)
Date: 2026-07-29
Status: assessment + phase plan. No implementation.
Proposal under review: make `clients.ambitt.agency` a lightweight CRM, because all three
beachhead verticals (CRE brokers, tax professionals, home-service businesses) deal with leads.

Grounded in: `prisma/schema.prisma`, `shared/runtime/engine.ts`, `client-portal/src/app/**`,
`client-portal/DESIGN.md`, `CLAUDE.md`, `SCHEMA.md`, and the memory notes on Railway
`rootDirectory` mirrors, Supabase RLS, and client-interaction scope.

---

## Bottom line first

There is already a working `Lead` model, one agent-side write tool, and a read-only portal
board. The narrow version of Kyle's idea — "the board my agent actually keeps, and it can
work it" — is roughly one week of work and lands squarely on the existing architecture.
The words "lightweight CRM" are the risk, not the code. CRM is a category with a gravity
well, and the expensive part is not the schema, it is the ownership promise you make to the
client the moment they can edit a row.

---

## 1. How far are we already?

### What exists

**`Lead`** — `prisma/schema.prisma:1045-1078`. Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | unguessable, fine for URLs |
| `agentId` / `clientId` | FK, cascade | **scoped to the agent**, client is denormalized |
| `name` | String | overloaded by design: "a person, company, or property/address" |
| `company` | String? | free text, not an entity |
| `email` / `phone` | String? | no validation, no normalization |
| `status` | String, default `"new"` | free-form at the DB level |
| `source` | String? | e.g. "CoStar export", "web research" |
| `valueUsd` | Int? | whole dollars |
| `notes` | Text? | single overwritable blob |
| `details` | Json? | the vertical escape hatch |
| `lastContactedAt` | DateTime? | single scalar |
| `createdAt` / `updatedAt` | | |

Indexes: `agentId`, `clientId`, `(agentId, status)`, `(agentId, createdAt)`. Relations exist
on both `Agent.leads` and `Client.leads`.

**Writers — exactly one.** The `log_lead` built-in tool: definition at
`shared/runtime/engine.ts:246-291`, handler at `shared/runtime/engine.ts:742-805`. It is in
`BUILTIN_TOOLS` (line 101) and `BUILTIN_CLAUDE_TOOLS` is appended unconditionally for every
agent (`allClaudeTools` at line 1187 — no per-agent filter). So every agent on the platform
can write leads today, whether or not that makes sense for it.

**Readers — two, both read-only.** `client-portal/src/app/agents/[id]/leads/page.tsx`
(server-rendered card list, status chips, generic key/value rendering of `details` at lines
221-232) and `client-portal/src/app/api/agents/[id]/leads/export/route.ts` (CSV, guarded by
`verifyAgentOwnership`). Sidebar exposes a per-agent "Leads" sub-item
(`client-portal/src/components/sidebar.tsx`) and the portal home has a Leads tile
(`client-portal/src/app/page.tsx:274-277`).

### Answer: agent-write-only, client-read-only

There is **no** POST/PATCH/DELETE route under `/api/agents/[id]/leads` — only `/export`. The
portal has exactly one server action in `client-portal/src/app/actions.ts` (`signOut`). A
client cannot change a single field. The board is a display of what the agent did.

### The gap that matters most, and it is not a schema gap

**The agent cannot read its own board.** There is no `list_leads` or `get_lead` in
`BUILTIN_TOOLS`. `log_lead` is write-only from the model's side. Consequences today:

- The agent cannot answer "which leads have gone cold" or "who did I already email".
- `Agent.followUpDays` (`prisma/schema.prisma:111`) is injected into the system prompt as an
  instruction, but nothing in the codebase computes a due follow-up from `Lead` rows. The
  agent is told to follow up on day 3 and 7 with no way to know which leads are on day 3.
- Re-contact protection depends entirely on `clientMemoryObject` and the 90-day conversation
  window happening to contain the lead.

This is the single highest value-per-hour fix in the whole document and it needs zero schema
change.

### What is missing for a credible CRM

**Stages.** `status` is an unconstrained string. The vocabulary is duplicated in two places
that can silently drift: `VALID_STATUS` in `shared/runtime/engine.ts:758` and the `STATUS`
map in `leads/page.tsx:10-21` (plus `STATUS_ORDER` at line 21 and `STRIPE` at line 172-180).
No stage ordering column, no `stageChangedAt`, so no "days in stage", no aging, no stalled-lead
detection. No per-client stage vocabulary — a tax practice's stages are not a CRE broker's.

**Activity history per lead.** None. `EmailSend` has `to` and `@@index([to])`
(`prisma/schema.prisma:510-561`), so you can *join by address*, but nothing links an
`EmailSend` to a `Lead`, and mail-merge sends (`send_mail_merge`, engine.ts:395) and `browse`
actions have no lead linkage at all. `notes` is one overwritable string, not a log. A CRM
without a per-record timeline is a spreadsheet.

**Owner / contact entities.** None. `name` is the headline for a person *or* a company *or* a
property. `company` is free text. So "three properties owned by the same LLC" cannot roll up,
and "two contacts at one firm" cannot exist.

**Dedupe keys.** No unique constraint anywhere on `Lead`. The upsert is
`findFirst({ agentId, name: { equals, mode: "insensitive" }, ...(email ? { email } : {}) })`
(engine.ts:764-771). Three real failure modes:
1. "Riverside Apartments" vs "Riverside Apts" are two leads.
2. The key is `agentId`, not `clientId` — two agents for one client each keep a private copy
   of the same lead.
3. `findFirst` → `create` is not atomic and there is no unique index to catch a race, so two
   concurrent runs can duplicate. Low probability today, guaranteed at volume.

**Notes.** Present but single-valued and overwrite-only.

**Next-action dates.** None. No `nextActionAt`, no owner/assignee, no task entity.

**Also missing:** soft delete, merge, priority/ordering, per-client custom fields, currency,
attachments, and pagination on both read paths (`findMany` with no `take` in the page and the
export route — fine at 3 leads, a latency and memory problem at 5,000).

**One more sharp edge in the writer.** Every field in the `log_lead` update object uses
`undefined` for "not provided" (engine.ts:773-789). Prisma treats `undefined` as "leave
alone", which is the right default, but it means the agent can never *clear* a field. Setting
a lead back to no-value or wiping a stale phone number is impossible through the only writer
we have.

---

## 2. Generic vs vertical: can one schema serve all three?

The three shapes Kyle named:

- **CRE**: a property + an owner. `{ address, units, capRate, NOI, ownerEntity, lastSale }`
- **Tax**: a filing entity + a deadline. `{ entityType, EIN, filingYear, deadline, extensionFiled }`
- **Home services**: a job + an address + a quote. `{ jobType, serviceAddress, quotedAmount, scheduledFor }`

The overlap is real and it is exactly the current core: a headline, a contact, a stage, a
value, a source, a next step, a history. The divergence is the payload. So the question is
only how the payload is typed.

### Option A — polymorphic JSON payload (what we have)

Keep `details Json?`, render as key/value chips.

- **Query**: bad. `details->>'deadline' < now()` cannot be indexed through Prisma 5. Prisma
  supports `JsonFilter` for equality/path reads but expression and GIN indexes need raw SQL,
  and this repo has **no migrations directory** — it is `prisma db push` only
  (`package.json: "db:push": "prisma db push"`). So any real index on JSON content means
  introducing a migration workflow we do not currently run.
- **Migration**: free forever. Also unsafe forever.
- **UI**: this is where it actually hurts. The portal cannot do better than the generic chip
  loop it does now (`leads/page.tsx:221-232`) because it does not know what a key means. A
  cap rate cannot be right-aligned as a percentage, a filing deadline cannot turn amber at
  T-14. That is the difference between "a table" and "a CRM".
- **Rot**: with no validation on write, the model will emit `capRate`, `cap_rate`, and
  `Cap Rate` across runs, and every one renders as a separate chip. This is the shapeless bag
  Kyle is worried about, and we are already on this path.

### Option B — per-vertical tables (`CreLead`, `TaxLead`, `JobLead`)

- **Query**: best per-vertical. Fully typed, fully indexable, no casts.
- **Migration**: worst. Every new vertical is a schema change replicated across three mirrored
  `schema.prisma` files (see §6), a new Prisma client, a new portal page, a new tool
  definition, a new RLS enable step. Cross-vertical rollups (fleet metrics, "leads won this
  month across all clients") become UNIONs.
- **UI**: 3× the pages, and each one drifts from `DESIGN.md` independently.
- **Verdict**: this bets that the vertical list stops at three. It will not. Reject.

### Option C — core entity + typed 1:1 extension tables

`Lead` stays canonical; `LeadCre` / `LeadTax` / `LeadJob` hang off it 1:1.

- **Query**: good. Typed columns, indexable, joins are cheap and Prisma-native.
- **Migration**: linear in verticals, but each one is small and additive.
- **UI**: one shell + a per-kind detail block.
- **Cost**: a join on every read, a nullable relation to narrow in TypeScript, and a
  `prisma db push` + 3-file mirror + RLS enable per vertical.

### Recommendation — C-lite: core entity, discriminated payload, promote-on-demand

Pick this. One `Lead` table. Add a `kind` discriminator. Keep the payload in JSON, but make it
**typed at the application boundary**, and promote a JSON key to a real column the moment it
needs to do work.

The mechanism that prevents the shapeless bag is a single dependency-free registry module:

```
shared/lead-schemas.ts        // canonical
client-portal/src/lib/lead-schemas.ts   // mirrored copy, per Railway rootDirectory
```

owning `kind -> { label, zod, stages[], displayFields[] }`, imported by **both** the
`log_lead` handler (validate on write, reject unknown keys with a useful tool error the model
can correct against) and the portal renderer (labels, ordering, formatters). Validation on
write is the whole trick. Without it, every other option degrades to Option A.

**Promote-to-column rule** — a payload key becomes a real column when any of:
(a) the portal must filter or sort on it, (b) it drives an automation (a filing deadline
firing a reminder), or (c) it appears in more than one vertical. By that rule, three things
qualify on day one and belong in the core, not the payload: `stage`, `nextActionAt`,
`stageChangedAt`.

**Why not B or C:** at three verticals the DB cost of C-lite is constant and the code cost is
linear in a Zod schema plus a renderer — both small, both reviewable, both deletable. B and C
make the *database* linear in verticals, and every increment has to cross three mirrored
schema files and an RLS step. When a vertical's payload outgrows JSON (it will happen to CRE
first, because comps and cap rates want real numeric filtering), promote that one vertical to
a C-style extension table. C-lite does not block that; it is the same core row.

---

## 3. Who owns the truth?

The client already has a CRM. This is the decision that matters most, and it is more a
product-policy call than a technical one.

### Option 1 — read-only mirror / activity ledger (what we have today)

"This is the record of what your agent did." Our rows are agent-authored facts. Their CRM
stays authoritative.

- Sync problem: **does not exist by construction.** There is no second writer.
- Consistent with the positioning wedge in memory: "supervised, delivers work you approve",
  never a system of record.
- Cost: near zero, already shipped.
- Weakness: a client will eventually want to correct a wrong stage or add a note, and "you
  can't" is a bad answer. That is Phase 3 below, and it is a one-way door.

### Option 2 — our portal as source of truth

- Requires, at minimum: client edit UI, conflict rules, an audit trail, import, a credible
  export, backup guarantees, and an exit path.
- Creates a support obligation (their pipeline is now our uptime problem) and a lock-in they
  will resent.
- Puts us in a feature race with HubSpot's free tier with zero engineers on it.
- Verdict at this stage: **no.**

### Option 3 — bidirectional sync via Composio

Blunt: this is the trap, and it is worse than it looks, for reasons specific to this repo.

- `shared/mcp/composio.ts` has **no trigger or webhook support**. Exports are
  `initiateOAuthConnection`, `initiateApiKeyConnection`, `getConnectedAccounts`,
  `isAppConnected`, `disconnect*`, `resolveGmail*`, `getTools`, `executeTool`, `listApps`,
  `getAuthScheme`, `getMCPEndpoint/Headers`. There is no inbound change-event path at all. So
  "sync" today means a polling cron per client, per object type, inside vendor rate limits.
- Stage mapping is not a string map. HubSpot `dealstage` values are per-portal pipeline GUIDs;
  Salesforce `StageName` is per record type. Our `status` is a free string. Mapping is
  per-client configuration we would have to build a UI for.
- Conflict resolution is per-field, and the losing side is *the client's real CRM*. We would
  own the blame for corrupting it.
- Cost: weeks. Risk: unbounded. Upside at 1-5 clients: near zero.

### Recommendation — Option 1, plus agent-driven one-way push

Keep the ledger. When a client wants leads in their system, the agent already has Composio
HubSpot / Salesforce / Google Sheets tools and can create the contact or deal as a normal
tool call. That is not sync; that is the agent doing work in their system, which is precisely
the product. The portal already offers exactly this in copy today
(`leads/page.tsx:146-149`: "Want these flowing into a Google Sheet automatically? Just reply
to {agent} and ask.").

The only sync affordance worth building now is traceability so the push is idempotent and
auditable, and so Option 3 stays open later without a rewrite:

```
externalSystem  String?    // "hubspot" | "salesforce" | "googlesheets"
externalId      String?    // id in that system
externalPushedAt DateTime?
@@unique([externalSystem, externalId])   // guards double-push
```

**Policy gap for Kyle (flagging, not deciding):** do we tell clients "this is your pipeline"
or "this is the record of what your agent did"? Everything in §4 and §5 branches off that
sentence, and it is a positioning decision, not an engineering one.

---

## 4. Multi-tenancy and access

### Current posture

RLS is ON for all public tables with **zero policies**, intentionally
(`reference_supabase_rls.md`). All access is Prisma over the direct Postgres `DATABASE_URL`,
which bypasses RLS; the Supabase JS SDK is auth-only. Portal authorization is
`Supabase session -> user.email -> compare to agent.client.email`, via
`client-portal/src/lib/agent-auth.ts::verifyAgentOwnership` for API routes, and the same
check inline in the leads page (`leads/page.tsx:43-48`).

### Does it hold with richer lead reads and writes?

**Structurally, yes.** The trust boundary is the Next.js server process, not the database.
Richer data does not change that as long as every new route goes through
`verifyAgentOwnership` and every query is scoped server-side. Do not add RLS policies for
this. What must change is discipline, in five specific places:

1. **The standing RLS rule applies to every new table.** `prisma db push` creates tables
   *without* RLS, and they are then world-readable and world-writable through the project's
   anon key. This has already bitten us: `Lead` was one of the seven exposed tables found on
   2026-07-28. So any phase that adds `LeadActivity` / `LeadContact` must end with a tracked
   `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` migration and an advisor check. This is the
   single most likely way a lead-CRM build leaks client data.

2. **Never trust a client-supplied scope id.** The dangerous shape is
   `PATCH /api/leads/[leadId]` taking `agentId` from the body. The correct order is
   `leadId -> lead.agentId -> verifyAgentOwnership(agentId)`, then mutate by `leadId`. There
   is no such route today; there will be at Phase 3.

3. **The client-level "all leads" view is a real decision, not a UI choice.** A CRM wants
   leads owned by the *business*. Today they are owned by the *agent* (`@@index([agentId])`,
   every query filters by `agentId`). If we add an account-level board it must query by
   `clientId`, and we must decide whether agent A sees agent B's leads. My recommendation:
   move the canonical scope to `clientId` and keep `sourcedByAgentId` for attribution. That
   also fixes the two-agents-two-copies dedupe bug in §1, because the upsert key becomes
   `(clientId, normalizedName)`.

4. **Pagination.** Both read paths do an unbounded `findMany`. Add `take` plus a cursor before
   any client accumulates thousands of rows, or the export route will OOM a portal container.

5. **Do not reach for Supabase Realtime on `Lead`.** That path *does* go through the anon key
   and would require real RLS policies plus a JWT carrying `clientId` — a whole new trust
   boundary for a live-updating list nobody asked for. Poll, or `revalidate`.

Cross-tenant leakage risk today is low. The one thing to watch is query reuse: dashboard
(operator) queries are deliberately unscoped by client. Never lift one into the portal.

---

## 5. Effort

### The narrowest version that delivers real value: "the working board"

**Phase 0 — the agent can see its own board.** ~half a day. No schema change.
Add `list_leads` (filters: stage, stale-since, limit; returns id + headline + stage +
lastContactedAt + nextActionAt) and accept an optional `lead_id` on `log_lead` for exact-match
updates. Files: `shared/runtime/engine.ts` (`BUILTIN_TOOLS`, `BUILTIN_CLAUDE_TOOLS`, handler),
one line in `shared/runtime/prompt-assembler.ts` so the agent knows the board exists.
This alone turns a write-only log into something the agent can work, and makes
`Agent.followUpDays` mean something for the first time.

**Phase 1 — stages that mean something, and aging.** ~1.5-2 days. Schema change (3 mirrors,
no new table). Add `kind`, `stage` (normalized, replacing free-form `status` reads),
`stageChangedAt`, `nextActionAt`. New dependency-free module `shared/lead-stages.ts` +
assertion test in the `oracle/lib/inbound-classify.test.ts` house style, becoming the single
source for the vocabulary that is currently duplicated in engine.ts:758 and leads/page.tsx:10.
Portal groups by stage and shows "4 days in Contacted", "follow up Thursday".
Requires the frontend-design skill and `client-portal/DESIGN.md`.

**Phase 2 — activity history per lead.** ~2-3 days. New `LeadActivity` table
(`leadId`, `kind: email_sent | reply | note | stage_change | agent_action`, `body`, `at`,
`emailSendId?`) written by the `log_lead` handler on every stage change, plus a hook where
`EmailSend` rows are created to link a send whose recipient matches a lead's email. Portal
renders a per-lead timeline. **New table, so the RLS enable step applies.**

Phases 0-2 total roughly one week and are independently shippable and verifiable in that
order. That is where I would stop and re-decide.

### Beyond the narrow version

**Phase 3 — the client can edit.** ~2 days plus design review. `PATCH /api/agents/[id]/leads/[leadId]`,
inline stage and next-action edit, notes appended as `LeadActivity`. **This is the one-way
door in §3** — it changes the ownership semantics, so it needs Kyle's policy answer first,
and it needs a last-writer marker on the row (`updatedBy: "agent" | "client"`) so the agent
does not silently overwrite a client correction on the next run.

**Phase 4 — typed verticals.** ~2-3 days for all three. `shared/lead-schemas.ts` registry +
mirrored portal copy, Zod validation on write, per-kind renderer, per-kind stage vocabulary.

**Phase 5 — contacts and owners as entities.** ~3-4 days. `LeadContact` (many per lead) and
an owner/organization entity. Only build when a real client has one owner across many
properties.

**Full CRM** — assignees, per-client custom fields, saved views, bulk actions, dedupe/merge
UI, CSV import, two-way sync, audit log, granular permissions, mobile: multiple weeks, an
ongoing maintenance line item, and a different company. Not a phase; a pivot.

### Kubernetes constraints

Nothing here is Railway-specific: Postgres, Prisma, Next server routes. Two ways it could
block the migration if built carelessly:

1. **No lead-derived files on the container filesystem.** Exports must stay streamed in the
   response (the current export route does this correctly) and any future CSV import must go
   to object storage, never local disk.
2. **No per-instance in-memory scheduling.** A follow-up reminder cron running in every
   replica double-sends. Follow-ups must be DB-claimed rows following the existing
   `ScheduledEmail` pattern with an atomic status transition (`updateMany` where
   `status: "pending"` → `"processing"`, act only on the claimed rows). Note
   `oracle/scheduler.ts` already assumes a single instance today; a lead-reminder cron added
   there inherits that debt, so make the claim atomic even if it looks redundant at one
   replica.

---

## 6. The three mirrored `prisma/schema.prisma` copies

Every schema change is a three-file change. Current state:

| File | Lines | Models |
|---|---|---|
| `prisma/schema.prisma` | 1187 | 28 — canonical |
| `dashboard/prisma/schema.prisma` | 1142 | 27 — missing `InboundEmailLog` |
| `client-portal/prisma/schema.prisma` | 1081 | 26 — missing `SmsSend`, `InboundEmailLog` |

They have **already drifted**. It is tolerable only because the missing models are unused in
those services. Do not treat that as license.

Procedure for every schema step in this plan:

1. Edit `prisma/schema.prisma` (canonical).
2. `npm run db:push` from the repo root.
3. Copy the changed model block verbatim into `client-portal/prisma/schema.prisma` **and**
   `dashboard/prisma/schema.prisma`.
4. If a **new table** was added: enable RLS on it as a tracked Supabase migration, then verify
   zero public tables without RLS (§4, item 1).
5. Update `SCHEMA.md` (it is reference, the Prisma file is authoritative — but it is 2+ months
   stale on `Lead`, which does not appear in it at all).

Why step 3 is not optional: `client-portal/railway.json` runs
`npx prisma generate && npm run start`, and the build step generates from the in-service
schema. A stale mirror produces a Prisma client without the new field and fails typecheck at
build, on Railway, after you thought you shipped.

**Worth 20 minutes:** `scripts/check-schema-mirrors.ts` — an assertion script in the house
style that asserts every model present in a service schema is byte-identical to the canonical
block, and prints the drift. Cheap, and it converts a class of Railway build failures into a
local one-liner.

---

## Rating: 6.5 / 10

Split, because the proposal contains two different projects:

- **The narrow version (Phases 0-2) rates 8/10.** It reuses a model that already ships, needs
  one new table, adds no new trust boundary, keeps the ownership story honest, and directly
  serves proof-of-value in the portal (memory: portal proof-of-value is work-delivered counts).
  Phase 0 in particular is half a day for a capability the agent visibly lacks today.
- **"Lightweight CRM" as a positioning goal rates 4/10.** Build cost is low; *maintainability*
  cost is where it bites. Every client will ask for the next CRM feature, and each one is
  individually reasonable — custom fields, then import, then assignees, then sync. You are
  competing with a free HubSpot seat on a category you do not want to own, and the moment a
  client's pipeline lives with us, their bad day is our on-call.

Build the board. Do not call it a CRM.

---

## The one architectural decision I would most regret getting wrong

**The scope key and ownership semantics of a lead: agent-scoped mirror of agent work, versus
client-scoped system of record.**

Everything else in this document is a migration. Stages, JSON versus tables, activity
timelines, contacts — all reversible with a `db push` and a mirror copy. That one is a promise
to the client, and it determines whether you ever owe them two-way sync, CSV import, an audit
trail, and an export they can walk away with.

It also has a quiet technical tail: it is the dedupe key. Agent-scoped means
`(agentId, name)` and two agents for one client keep duplicate leads. Client-scoped means
`(clientId, normalizedName)` and you need a name-normalization rule you can live with
forever, because it is now a unique index.

Decide the sentence before writing Phase 1.
