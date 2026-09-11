# Claude Code continuation, 11 September 2026

## Recovered stopping point

Source session: `bc9c4a70-3937-4ea5-92ce-13af1c548fc3` in the local Claude Code project history. Kyle's final instruction at 17:37 Chicago time: “okay let's implement these and add it to the landing page for the Agent's capabilities”. “These” referred to connecting clients' GoHighLevel accounts and having their agents answer inbound phone calls. Claude reached its limit just after dispatching the connector build and phone specification; no connector branch or implementation survived.

Earlier directions still apply:

- The portal v4 redesign is mockups only until Kyle reviews every page. Include official tool logos, light mode and a browser focus mode. The mockups remain in `.claude/worktrees/agent-a3441e2749bf92cc5/docs/mockups/portal-workspace-v4/` in the original checkout.
- The pricing pivot has a saved draft at `docs/specs/usage-pricing.md` in the original checkout. Kyle set Free at $0, Pro at $79, and tool limits at 3 / 6 / unlimited for Free / Pro / Max. He requested positive paid-tier economics at full usage, Individuals / Business tabs, Custom build, and watching in Free with a hard cap. Treat other defaults and the draft's open questions as proposals, not settled product policy.
- Website work was saved at `origin/main` commit `a365433`. The original local `main` is at `afe965e`; do not overwrite it or discard its unrelated local changes.
- Work is reviewed and deployed one change at a time. The recovered first increment is the GoHighLevel connector. Phone answering, pricing implementation and marketing claims are still pending.

## First increment implemented locally

Branch: `codex/resume-ghl`, based on `a365433`. No push, migration, production credential changes, customer messages or deployment.

The existing Tools page gains a GoHighLevel form with token and Location ID, test, verified save, masked saved state and account-wide disconnect confirmation. The token is encrypted using the existing Credential row; no schema change is required. The runtime routes this particular integration through direct MCP; other integrations retain Composio preference. The cache now hashes the entire credential instead of using its prefix/suffix. Runtime location arguments cannot override the configured location. Revoked/expired credentials are not loaded.

Portal requests use the existing `CHAT_TOKEN_SECRET` with a separate signing purpose, a 60-second expiry, and signatures bound to the agent, client and exact request body. Existing generic credential/test endpoints cannot bypass this flow for HighLevel. Tests and replacement probes read the location before accepting a token; tools/list alone is insufficient. Vendor errors are not echoed with submitted secrets.

The connector inherits the runtime's existing prompt-based supervised approvals. This increment does not introduce an independently enforced outbound-message allowance or approval ledger for GHL. Its prompt explicitly requires the same recipient, consent, send-cap and approval rules and prohibits bypassing another channel's blocked send. GoHighLevel dry-run writes fail closed if run-mode lookup or preview persistence fails.

The per-process limiter spaces requests at 110 ms and caps at 200,000 per UTC day. Upstream rate limits govern other replicas and integrations. Rejected 429 requests have up to three retries; ambiguous writes are not automatically replayed after a network failure or 5xx.

## Verification

- `node_modules/.bin/tsx shared/mcp/highlevel.test.ts`: 13 checks, including an actual local HTTP MCP handshake, location read, encrypted save, invalid replacement, revoked state, cross-tenant requests, retries and dry-run failures. All credentials and records are synthetic; the store is in memory.
- Root `tsc --noEmit -p tsconfig.json` and portal `next typegen` followed by `tsc --noEmit -p tsconfig.json`.
- Browser check of the actual component with mocked API responses at 1200px and 390px: test without saving, failed save retaining inputs, successful save clearing the token, disconnect confirmation/cancellation, no horizontal overflow or page errors.
- Review screenshots are under `.codex/reviews/highlevel/` in the original checkout. The temporary preview page is removed from the deliverable.

Live acceptance remains pending. Connect a test GoHighLevel sub-account through the portal, with View Locations plus only the required CRM scopes. Verify the location shown, test the connection, ask the agent to read a known contact and pipeline, then run a supervised write only after approving its plan. Confirm results in the same sub-account and verify that disconnect prevents further access. This requires deploying the reviewed increment and supplying the token through the form; never put it in chat or logs.

## Remaining continuation

1. Review and live-verify this connector.
2. Finish the phone-answering specification, then implement the inbound pilot. The research proposed ElevenLabs or Retell, per-client local numbers, a disclosure at call start, transcript capture, owner fallback and follow-through through existing tools. Vendor, exact packaging and operational details need to be settled in the specification. The existing Atlas voice interface is not a complete inbound phone feature.
3. Reconcile and implement the pricing draft in verified increments. Do not market credits, phone minutes or watching as available before the corresponding implementation is usable.
4. Add the verified capabilities to the current landing page, preserving the newer website design.

Official connector reference checked on 11 September: [HighLevel token setup](https://help.gohighlevel.com/support/solutions/articles/155000005741). Its example uses `https://services.leadconnectorhq.com/mcp/`, `Authorization: Bearer <token>` and `locationId`. The newer [OAuth endpoints](https://marketplace.gohighlevel.com/docs/other/mcp/index.html) are a separate connection path.
