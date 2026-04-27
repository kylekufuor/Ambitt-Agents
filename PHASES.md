# Ambitt Agents — Build Phases
Last updated: 2026-04-27 (browser cluster Phase A complete — public-web browse tool live)

Full scope decisions documented in `.claude/projects/-Users-kylekufuor-Projects-Ambitt-Agents/memory/project_client_interaction_scope.md`

---

## Phase 1 — Foundation (must have before any client) — COMPLETE

- [x] Revised pricing model in code — `shared/pricing.ts` is source of truth. Tiers: Starter $499 (1K, 1 agent), Growth $999 (3K, 2 agents), Scale $2,499 (10K, 3 agents). Tool limit removed. Overage always on at tier-specific rates ($0.60 / $0.40 / $0.30). Second-agent 20% discount. `OverageEvent` table rolls up for end-of-month billing.
- [x] Onboarding flow — full sequence built. T+0 welcome email with AI-authored strategic brief (PDF attached) + T+5min "how to work with me" (AI-personalized) + T+3 check-in + T+7 capability highlight + T+14 feedback + 2nd-agent pitch. All AI-generated via `oracle/onboarding-content.ts`. Non-billable (`runAgent({ billable: false })`). Cancelled on pause/reject/kill. Hourly cron in `oracle/scheduler.ts` respects agent timezone + 9-5 M-F business hours. `preferredName` field used for greetings.
- [x] Email footer with persistent navigation links in all 10 templates (`_shared.ts::navFooterLinks`, `footerBlock(agentName, agentId, { systemEmail })`)
- [x] Interaction counter — tracked per agent (`Agent.interactionCount`/`interactionLimit`/`overageCount`). Runtime enforcement live (`shared/runtime/engine.ts`), monthly reset via `interactionResetAt`. No UI surface yet — admin-dashboard and client-portal surfacing both land in Phase 2 ("Client portal expansion"); data exists, UI home is part of that build.
- [x] Operator dashboard panels — `dashboard/src/lib/health.ts` — agent error rate panel on `/agents/[id]`, client engagement + churn signal on `/clients/[id]`, churn-risk badges on `/clients` list. Costs page covers per-client API cost / revenue / margin / MRR from earlier work.
- [x] Prompt caching — `cache_control: ephemeral` on system prompt + tool definitions. Per-run cache metrics logged (`cacheCreationTokens` / `cacheReadTokens`). Cost model in `dashboard/src/lib/costs.ts::recalcCostCents` factors 1.25× write / 0.10× read rates.
- [x] Haiku triage routing — escalation pattern: Haiku 4.5 drives tool-selection loops; on end_turn with tools used, escalates to Sonnet for synthesis. Kill switch: `DISABLE_TRIAGE_ROUTING=1`. Per-model usage logged as separate `ApiUsage` rows, with `isPrimaryRun` flag so run-count metrics don't double.

## Phase 2 — Client interaction

- [x] Client portal expansion — agent detail page at `/agents/[id]` (pause/resume, schedule editor, interaction counter with progress bar, doc upload moved here), billing view on home (MRR + cycle usage aggregated across agents + overage cost from `OverageEvent`), "Voice & email" section (tone editor wires into `prompt-assembler`, `emailFrequency` stored+editable; digest options UI-disabled until pipeline built). Ownership enforced via portal proxy routes + Supabase session.
- [x] "Request new tool" form in client portal — `ToolRequest` table, submit form on agent detail page, WhatsApp ping to Kyle on submit, previous-requests list with status.
- [x] Chat page (chat.ambitt.agency) — lightweight web UI, token-based auth, unified conversation history
- [x] Oracle HTTP POST endpoint for chat (mirrors inbound-email flow, triggered by chat instead of Resend webhook)
- [x] `channel` field on ConversationMessage ("email" | "chat")
- [~] Tool connection flow — agent requests a missing tool mid-run via the `request_tool_connection` platform tool, which sends the client a Composio OAuth Connect Link.
  - [x] `ToolConnectionRequest` table (dedupes 24h window on `(clientId, appName)`)
  - [x] `shared/platform-tools/request-tool-connection.ts` handler (5 outcome states: emailed / already_pending / already_connected / unavailable / error; verified via `scripts/test-request-tool-connection.ts` against real Composio + real DB)
  - [x] `permission-email.ts` honors `ctaUrl` (previously dead prop; now drives the "Grant Access" button to the OAuth URL)
  - [x] Engine wiring — new built-in tool exposed to every agent via `BUILTIN_CLAUDE_TOOLS` in `shared/runtime/engine.ts`; `AgentContext` carries `clientId` + `clientName` so the permission-email payload satisfies `BaseEmailProps`
  - [x] Composio callback reconciliation — `/composio/callback` looks up `ToolConnectionRequest` by `composioConnectionId`, verifies with Composio (`getConnectedAccounts`) that the connection is ACTIVE, then flips `status="connected"` + `connectedAt`. Forged callbacks can't flip rows without a real active connection at Composio.
  - [x] Deploy Oracle — live as of 2026-04-19 (`df192477`); callback endpoint smoke-tested in prod (no-param + unknown-id both 200, correct log lines fire)
  - [x] `already_connected` branch verified in prod against real Composio (supabase/posthog)
  - [~] Happy-path E2E click-through — **deferred 2026-04-19**. Only unknown is which query param name Composio uses on its callback redirect; `/composio/callback` accepts four common names as a guess. If wrong, Oracle logs immediately flag it (one-line fix). Worst case first paying client's row sits at `status="emailed"` until the log surfaces. Probe is `scripts/test-tool-connection-live.ts`.
- [x] Email digest pipeline — `daily_digest` / `weekly_digest` live. Per-run output routes through `oracle/lib/dispatchAgentResponse.ts`: immediate sends email now, non-immediate queues a `ScheduledEmail(kind="digest_pending")` with a JSON payload of the run. Hourly `processDueDigests` cron (in `oracle/lib/digestCron.ts`) rolls up pending rows into one `digest-email.ts` send per agent at `digestHour` (and `digestDayOfWeek` for weekly) in agent timezone, with a Sonnet-synthesized 1-2 sentence summary. Portal config editor exposes frequency + hour + day pickers. Attachments dropped in digest mode (metadata kept for counts).

## Phase 3 — Advanced capabilities

- [~] Browser cluster — sliced into Phase A (public-web browser tool), Phase B (1Password plumbing), Phase C (secret injection bridge). Tool shape decision: one big `browse(goal, starting_url?)` tool calling Stagehand's `agent()` internally (not three granular tools) — Stagehand already does multi-model routing + fewer tokens per task.
  - [~] **Phase A — public-web browser tool**
    - [x] Step 1: scaffold — `@browserbasehq/stagehand@3.2.1` installed, `BrowserSession` model live on prod DB (audit row per run; schema mirrored across root/client-portal/dashboard), type-check clean (`c28cd10`).
    - [x] Step 2: `shared/platform-tools/browser.ts` — `runBrowserTask({agentId, clientId, goal, startingUrl?})`, 5-min Promise.race timeout, Stagehand `agent.execute()` with `anthropic/claude-sonnet-4-5-20250929` (4-6 hits AI_NoObjectGeneratedError), `startingUrl` folded into instruction (avoiding Stagehand's brittle gateway-routed `act()`). Logs `BrowserSession`. Registered in `BUILTIN_CLAUDE_TOOLS` + engine executor branch. System-prompt `BROWSER_RULES` section: when to browse vs web_search, side-effect approval rule for supervised mode.
    - [x] Step 3: local probe verified end-to-end against real Browserbase + real DB. example.com goal → success in 13s, 3 actions, "Example Domain" extracted, BrowserSession row populated correctly. `scripts/test-browser-probe.ts` is the probe.
  - [ ] **Phase B** — 1Password SDK, per-client vaults, server-side credential resolver (no consumer path yet).
  - [ ] **Phase C** — secret injection bridge: browser tool detects `{{secret:op://vault/item/field}}`, resolves via 1Password SDK, injects via Playwright `.fill()` — value never passes through Claude.
- [ ] Custom email domain support — Resend multi-domain, subdomain approach, DNS verification flow
- [x] Autonomy modes — `autonomyLevel` narrowed to `"supervised" | "autonomous"` (legacy advisory/copilot map to supervised). Supervised gate built end-to-end: `request_approval` platform tool (`shared/platform-tools/request-approval.ts`) creates a `Recommendation` row + fires `action-required` email; engine pauses on `isPause` signal and embeds the plan into conversation history so resume sees it. APPROVE/RETRY/DISMISS subject replies in `oracle/index.ts` resume the agent run. Autonomy section in `prompt-assembler.ts` instructs Claude when to call the tool. Portal `ConfigEditor` exposes the toggle; Oracle `/agents/:id/config` validates the field. Atlas + Zay migrated `advisory → supervised` in prod (commits `1cc40ea`, `c2c9481`).
- [x] Proactive insights — system prompt teaches Claude to surface actionable/relevant/non-obvious observations at the end of any response as a trailing `## Proactive insights` bullet list. `dispatchAgentResponse.ts::extractProactiveInsights` parses the trailing section out of response text and passes it to `agent-response.ts` as `proactiveInsights: string[]`, which renders a highlighted amber block above the reply-prompt. 1-3 bullets max, empty sections suppressed entirely. In supervised mode, action-implying insights flow through `request_approval` like any other side-effectful work.

## Phase 4 — Voice + multi-agent

- [ ] Retell AI integration — WebSocket endpoint on Oracle bridging to `runAgent()`
- [ ] Voice model routing — voice calls must use Sonnet (sub-1s latency requirement)
- [ ] Phone number provisioning per agent
- [ ] Multi-agent pricing — 20% discount on second agent
- [ ] Voice channel added to email footer and client portal

---

## Key decisions (locked)

- **No tool limit.** Unlimited tools across all tiers. Gated by interaction volume.
- **Pricing (source of truth — see `shared/pricing.ts`):** Starter $499/mo (1K interactions, 1 agent), Growth $999/mo (3K, 2 agents), Scale $2,499/mo (10K, 3 agents). Setup $1,000–2,500. Annual = 10 months billed (2 free).
- **Overage (always on, flat per tier):** Starter $0.60/interaction, Growth $0.40, Scale $0.30. Matches ~20% premium over included per-interaction rate.
- **Second agent:** 20% discount off tier price (applies to 2nd+ agent on Growth and Scale).
- **Interaction limit:** agent keeps running and charges overage per extra interaction (no hard stop).
- **Tool connections:** platform tools (zero friction) → OAuth via Composio Connect Link (30 sec) → white-glove call (rare).
- **Chat + email = one conversation.** Unified history, `channel` field differentiates.
- **Agent always mirrors back** what it understood before acting (both modes).
- **Approve/reject is entire action**, never partial. Client modifies via natural language reply.
- **Proactive insights** only when actionable and relevant. No noise.
- **Email footer** on every email with all navigation links.
- **Custom email domain** is Growth/Scale feature (subdomain approach).
- **Observability built in-house** — no third-party analytics tools.
- **Browser automation:** Browserbase + Stagehand. Credentials never touch the LLM.
- **Voice:** Retell AI with custom LLM (Claude as the brain).
- **Credential management:** 1Password SDK for non-OAuth credentials.
