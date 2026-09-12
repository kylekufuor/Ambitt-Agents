# Portal workspace release

The portal Home is now a working browser and agent workspace. `/overview`
retains the former work summary and its existing demo walkthrough.

## Delivered

- Web tools in the sidebar and browser tabs; searchable Composio catalogue and
  OAuth consent; saved profiles isolated per client and tool.
- Authenticated portal chat, task execution through the existing runtime, and
  learning conversations grounded in consented browser observations.
- Structured recordings of visible text and clicked controls. These are learning
  notes, not video recordings. Password/login pages, input values, editable
  content, form content and private-marked elements are excluded.
- Explicit per-origin consent, persistent green watch indicator, stop control,
  hidden-tab stop, short capture leases, and monotonic visible-time accounting.
  Replayed heartbeats cannot double count.
- Playbook proposals remain inert until confirmation. Edits replace the previous
  rule atomically. Email and task conversations can use `propose_playbook_rule`;
  the same confirmed rules are loaded into the runtime.
- Excel/CSV/PDF/Word/text/JSON import and document/sheet viewing; original downloads;
  generated task attachments saved in Files. Office archive expansion is bounded.
- Schedule and pause controls, watch logs in Activity and Billing, dark/light
  appearances, mobile navigation and browser focus mode.

## Operational boundaries

The live browser in this release uses Browserbase. It is not the planned Mac-mini
Remote Hands viewer. Sites that reject cloud browsers (including some CoStar
flows) still require the separately provisioned desktop path. Adding a website
is a compatibility test, not a guarantee that its login or workflow will work.
No customer desktop service or personal Chrome profile was installed or changed.

A browser session lasts up to 30 minutes and closes after three minutes without
portal heartbeats. A client and the runtime cannot use the same browser profile
at once. Closing a session saves its profile for later agent runs. Removing a
web tool archives it, preserving the watch audit.

Watching is a usage record, not a newly enabled Stripe charge. Existing pricing,
subscriptions, quotas, and customer billing are unchanged. The future credit
billing plan is not implemented by this release.

Observation content is encrypted and expires after seven days. The sweeper
clears it, retaining timestamps and durations. Confirmed instructions and
conversation transcripts remain. Only one unanswered automatic question is
issued at a time; tasks and learned proposals use durable request IDs.

## Deployment

1. Apply `scripts/workspace/migration.sql` against the existing database. It is
   additive, transactional and repeatable; it does not drop or rewrite existing
   tables. Keep the two partial unique indexes (one browser and one pending turn)
   even when using Prisma schema tooling later.
2. Run `scripts/workspace/backfill-tools.ts` to expose existing configured web
   tools. It does not create browsers or move credentials.
3. Deploy Oracle and Client Portal from the same commit. The portal's existing
   `CHAT_TOKEN_SECRET` must equal Oracle's. Oracle needs its existing Browserbase,
   Composio, Anthropic and encryption configuration. No service credentials reach the client.
4. Confirm anonymous access to `/workspace/state` returns 401, portal pages require
   login, and the signed workspace state request succeeds.

Do not roll the database backwards when reverting application code. The old app
ignores these additive tables.

## Verification

The QA server requires a separate `workspace_qa_*` PostgreSQL schema and never
starts Oracle's scheduler or inbound/email routes. Test fixtures use reserved
example addresses. Browser, Composio and Claude tests call the actual providers;
OAuth QA stops before login and removes its pending connection. Task QA runs the
agent with `dryRun: true` and requests only CSV generation.

Evidence is kept locally under `.codex/reviews/workspace/`: integration, unit,
edge-case and task results plus desktop/mobile, dark/light screenshots. Never
commit the QA environment file or private browser access URLs.
