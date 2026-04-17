# Ambitt Agents — Build Phases
Last updated: 2026-04-17

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
- [ ] Chat page (chat.ambitt.agency) — lightweight web UI, token-based auth, unified conversation history
- [ ] Oracle HTTP POST endpoint for chat (mirrors inbound-email flow, triggered by chat instead of Resend webhook)
- [ ] `channel` field on ConversationMessage ("email" | "chat")
- [ ] Tool connection flow — agent detects missing tool mid-run, sends Composio OAuth Connect Link to client
- [ ] Email digest pipeline — honor `Agent.emailFrequency` (`daily_digest` / `weekly_digest`). Today `immediate` is the only functional value; portal disables the other options until this is built. Needs: ScheduledEmail "digest" type, aggregator cron, combined template.

## Phase 3 — Advanced capabilities

- [ ] Browser automation — Browserbase + Stagehand (`shared/platform-tools/browser.ts`)
- [ ] 1Password SDK integration — per-client vaults, credential fetch at runtime
- [ ] Secret injection layer — credentials fill form fields via Playwright, never pass through Claude
- [ ] Custom email domain support — Resend multi-domain, subdomain approach, DNS verification flow
- [ ] Autonomy modes — supervised (approve/reject entire action) and autonomous (mirror + execute)
- [ ] Proactive insights — system prompt instruction for scheduled runs, optional section in agent emails

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
