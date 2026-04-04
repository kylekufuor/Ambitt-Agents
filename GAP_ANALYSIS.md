# Ambitt Agents — Gap Analysis: Current State vs v2 Architecture

## Legend
- **EXISTS** — built and functional
- **PARTIAL** — started but incomplete or needs modification
- **MISSING** — not built yet

---

## 1. MCP-FIRST ARCHITECTURE

| Component | Status | Details |
|-----------|--------|---------|
| MCP concept in architecture | **MISSING** | Current tool system uses custom API connectors (`shared/tools/runner.ts`). No MCP protocol integration. Tools are called via `ToolExecutor.execute()` with decrypted credentials — not MCP. |
| MCP servers for launch tools | **MISSING** | Salesforce, HubSpot, Stripe, Snowflake, PostgreSQL, Power BI, Asana, Slack, Notion, Zendesk, Intercom, QuickBooks, Xero, Shopify, Klaviyo — none connected via MCP. |
| Tool catalog | **PARTIAL** | `shared/tools/catalog.ts` has 10 tools defined (web-search, posthog, GA, google-reviews, tiktok, linkedin, yelp, email, whatsapp, mock-search). None of the v2 launch tools (Salesforce, HubSpot, Snowflake, etc.) are in the catalog. |
| Tool credential storage | **EXISTS** | `Credential` table in Prisma — encrypted at rest with AES-256-GCM via `shared/encryption.ts`. |
| Oracle MCP connection management | **MISSING** | Oracle doesn't manage MCP connections. No health monitoring of tool connections. |
| 3-tool-per-agent limit | **MISSING** | No enforcement. The schema stores `tools: String[]` on Agent but no validation. |

**Gap:** The entire tool layer needs to shift from custom executors to MCP protocol. This is the single biggest architectural change.

---

## 2. THE SIX LAUNCH AGENTS

| Agent | Status | Details |
|-------|--------|---------|
| Revenue Agent (Salesforce + HubSpot + Stripe) | **MISSING** | No revenue/CRM agent exists. |
| Analytics Agent (Snowflake + PostgreSQL + Power BI) | **MISSING** | Lens/Priya exist for PostHog analytics but not the v2 analytics agent with enterprise tools. |
| Operations Agent (Asana + Slack + Notion) | **MISSING** | No project management agent. |
| Support Agent (Zendesk + Intercom + Slack) | **MISSING** | Cleo in McQuizzy handles support but it's not built as an Ambitt agent type. |
| Finance Agent (QuickBooks + Stripe + Xero) | **MISSING** | No finance agent. |
| Commerce Agent (Shopify + Klaviyo + Stripe) | **MISSING** | No e-commerce agent. |

**What exists instead:** 5 internal agents (Scout, Lens, Vibe, Pulse, Priya) built for AmbittMedia. Plus 10 McQuizzy agents imported. These are v1 agent types (analytics, content, marketing, sales, engagement, support, research, design, ops) — different from the v2 domain-named agents.

**Gap:** All six launch agents need to be built. The existing agents served as prototypes. v2 agents are domain specialists with MCP tool connections, not task-runners with custom API calls.

---

## 3. AGENT SYSTEM PROMPT ARCHITECTURE

| Component | Status | Details |
|-----------|--------|---------|
| First Truth Principle as first instruction | **EXISTS** | Every agent prompt starts with it. See `agents/scout/prompts/system.ts:1`. |
| Domain identity | **PARTIAL** | Current prompts have "Who You Are" and "What You Do" sections. v2 needs explicit domain ownership boundaries ("what this agent owns, what it does NOT own"). |
| Tool expertise context | **MISSING** | Current prompts reference tools generically. v2 needs deep tool knowledge — best practices, common use cases, what good looks like in each tool. |
| Client context injection | **PARTIAL** | Agent reads from `clientMemoryObject` and client record. But not structured as a system prompt section with business name, industry, key contacts, preferences. |
| Communication standards | **MISSING** | No standard email format defined in prompts. v2 needs the three-line summary + buttons + attachment format enforced. |
| Escalation rules | **MISSING** | No escalation path defined in prompts. |
| Permission boundaries | **MISSING** | No read/write permission model in prompts. |

**Gap:** System prompts need significant restructuring. The framework exists but the v2 prompt architecture adds 4 new required sections.

---

## 4. EMAIL-FIRST INTERFACE

| Component | Status | Details |
|-----------|--------|---------|
| Resend integration | **EXISTS** | `shared/email.ts` — send emails with retry logic, conversation logging. |
| Inbound email parsing | **PARTIAL** | `oracle/index.ts` has `/webhooks/email-reply/:agentId` for client replies. The lead agent adds `/webhooks/lead-inbound`. But no generic "client emails agent, agent acts" loop. |
| Three-line summary format | **MISSING** | Agents don't generate structured summaries. They send full reports. |
| Interactive button row | **MISSING** | No button generation in emails. No mailto: mechanic for one-tap agent commands. |
| Reusable email template | **PARTIAL** | `oracle/templates/prospect-email.ts` and `kyle-confirmation.ts` exist for the lead agent. But no shared parameterized template that all agents use. |
| PDF attachment generation | **MISSING** | No PDF generation anywhere in the codebase. |
| Subject line standards | **MISSING** | No enforced subject line format. |
| Branding footer | **MISSING** | No consistent footer with Ambitt logo, agent domain, tools connected. |

**Gap:** The email interface is the product's core UX and it's mostly missing. The send/receive plumbing exists but the structured response format, buttons, templates, and attachments are all new.

---

## 5. MULTI-STAKEHOLDER EMAIL ROUTING

| Component | Status | Details |
|-----------|--------|---------|
| Permission levels (admin/analyst/viewer) | **MISSING** | No permission model. Only one email per client. |
| Sender verification | **PARTIAL** | Lead inbound checks if sender is Kyle. Email reply webhook doesn't verify sender against client record. |
| Natural language permission management | **MISSING** | No "Add sarah@company.com as analyst" capability. |

**Gap:** Entirely new feature. Needs a `ClientContact` table and sender verification on every inbound email.

---

## 6. SCHEDULED DIGESTS

| Component | Status | Details |
|-----------|--------|---------|
| Cron infrastructure | **PARTIAL** | Oracle has `/cron/fleet-health` and `/cron/improvement` endpoints. Agents have `schedule` field (cron string) but no scheduler runs them. Relies on Railway cron or external trigger. |
| Client-configurable schedules | **MISSING** | Clients can't email "Send me X every Monday at 8am". |
| Schedule storage | **MISSING** | No digest schedule table. Agent `schedule` field exists but isn't for client-defined digests. |

**Gap:** Schedule infrastructure exists at Oracle level but client-facing scheduled digests are new.

---

## 7. AGENT ACTIVITY FEED

| Component | Status | Details |
|-----------|--------|---------|
| Action logging to DB | **EXISTS** | `Task` table logs every agent task with status, output, timestamps. `OracleAction` logs Oracle operations. `ApiUsage` logs every API call. `ConversationMessage` logs email threads. |
| Client-facing activity page | **MISSING** | The dashboard exists but it's Kyle-only (admin). No client-facing read-only feed. |
| Signed token URL access | **MISSING** | No tokenized URL system. Client portal uses Supabase magic link auth. |
| Filter by date/action type | **PARTIAL** | Oracle page has activity log with type filters. But that's admin, not client-facing. |

**Gap:** The logging infrastructure is strong. The client-facing presentation layer is missing.

---

## 8. LIVE BAR DEMO AGENT

| Component | Status | Details |
|-----------|--------|---------|
| Lead capture pipeline | **EXISTS** | `oracle/lead-agent.ts` — Claude parse + generate + send. |
| API trigger (`POST /lead`) | **EXISTS** | Wired in `oracle/index.ts` with bearer auth. |
| Email trigger (inbound) | **EXISTS** | `/webhooks/lead-inbound` in `oracle/index.ts`. |
| Prospect email template | **EXISTS** | `oracle/templates/prospect-email.ts`. |
| Kyle confirmation template | **EXISTS** | `oracle/templates/kyle-confirmation.ts`. |
| iPhone Shortcut docs | **EXISTS** | `docs/iphone-shortcut.md`. |
| Resume with email flow | **EXISTS** | `POST /lead/email` endpoint. |
| CLI command | **EXISTS** | `./oracle/cli.sh lead "..."`. |
| One-pager PDF attachment | **MISSING** | No PDF generation. Lead agent doesn't attach anything yet. |
| Agent recommendation mapping | **MISSING** | v2 wants the demo agent to map prospect's tools to the closest launch agent (e.g., Salesforce → Revenue Agent). Current version doesn't do this. |
| Domain-specific one-pager selection | **MISSING** | v2 wants different one-pagers per business type. Not built. |

**Gap:** Core pipeline works. Needs PDF generation, agent recommendation mapping, and domain-specific one-pagers.

---

## 9. PRICING

| Component | Status | Details |
|-----------|--------|---------|
| Volume pricing engine | **EXISTS** | `shared/pricing.ts` — tier-based per-agent pricing with auto-recalc. |
| v2 SMB pricing ($497/$697/$997) | **MISSING** | Current pricing is per-agent volume discount ($49-99). v2 has named tiers with interaction limits. Different model. |
| Enterprise pricing | **MISSING** | No enterprise track. |
| Interaction counting | **MISSING** | No concept of "interactions per month" or interaction limits. |
| Setup fee logic | **PARTIAL** | `shared/pricing.ts` has setup fees ($199/agent or $499 batch). v2 wants $500-1,500 based on complexity. |
| Annual billing | **MISSING** | No annual discount logic. |

**Gap:** Pricing model is fundamentally different in v2. Needs a rewrite of `shared/pricing.ts`.

---

## 10. WEBSITE — ambitt.agency

| Component | Status | Details |
|-----------|--------|---------|
| Any website code | **MISSING** | No website in the repo. No landing page. No marketing site. |

**Gap:** Entire website needs to be built from scratch.

---

## 11. ONE-PAGERS

| Component | Status | Details |
|-----------|--------|---------|
| SMB one-pager | **MISSING** | No PDF generation capability. |
| Enterprise capability deck | **MISSING** | Same. |
| HTML-to-PDF pipeline | **MISSING** | No puppeteer, jspdf, or any PDF library in dependencies. |
| Dynamic field injection | **MISSING** | No template system for PDFs. |

**Gap:** Entirely new capability. Need to add PDF generation (likely puppeteer or a hosted API like html-css-to-pdf).

---

## 12. ORACLE & INFRASTRUCTURE

| Component | Status | Details |
|-----------|--------|---------|
| Oracle Express server | **EXISTS** | `oracle/index.ts` — health, fleet, scaffold, approve, reject, pause, kill, run, improve, import, lead, cron endpoints. |
| Agent scaffolding | **EXISTS** | `oracle/scaffold.ts` — creates agent, sends WhatsApp approval. |
| Fleet monitoring | **EXISTS** | `oracle/monitor.ts` — stale agents, budget enforcement, auto-pause. |
| Self-improvement | **EXISTS** | `oracle/improve.ts` — weekly signal analysis, prompt suggestions. |
| Model routing | **EXISTS** | `oracle/router.ts` — Claude/Gemini/OpenAI routing by task type. |
| Budget enforcement | **EXISTS** | Per-agent monthly budget with 80% warning, 100% auto-pause. |
| Suppression table | **EXISTS** | `Suppression` model — prevents repeat findings. |
| Agent import | **EXISTS** | `oracle/import.ts` + CLI command + McQuizzy manifest. |
| Dashboard | **EXISTS** | Next.js 16, shadcn/ui, sidebar layout, 7 pages, all functional. |
| Client portal | **EXISTS** | Separate Next.js app with Supabase magic link auth + Stripe billing. |
| WhatsApp integration | **EXISTS** | `shared/whatsapp.ts` — Twilio. |
| Stripe billing | **EXISTS** | `shared/stripe.ts` — customer creation, subscription lifecycle. |

**Gap:** Infrastructure is solid. Main gaps are MCP connection management and the shift from task-runner agents to email-first MCP-native agents.

---

## BUILD PRIORITY (matching v2 doc)

| # | Item | Effort | Status |
|---|------|--------|--------|
| 1 | Bar demo agent | Small | **DONE** — needs PDF + agent mapping |
| 2 | Reusable Resend email template | Medium | **MISSING** |
| 3 | Revenue Agent + MCP connections | Large | **MISSING** — biggest build |
| 4 | Agent activity feed (client-facing) | Medium | **MISSING** |
| 5 | Analytics Agent | Large | **MISSING** |
| 6 | Operations Agent | Large | **MISSING** |
| 7 | Remaining 3 launch agents | Large | **MISSING** |
| 8 | Website rebuild | Large | **MISSING** |
| 9 | Two one-pagers with PDF gen | Medium | **MISSING** |
| 10 | Multi-stakeholder routing | Medium | **MISSING** |
| 11 | Scheduled digests | Medium | **MISSING** |
| 12 | v2 pricing rewrite | Small | **MISSING** |

---

## WHAT'S STRONG

- Oracle orchestration layer is production-ready
- Prisma schema is comprehensive (12 tables + Suppression)
- Dashboard is fully functional with real data
- Lead agent pipeline works end-to-end
- Budget enforcement, fleet monitoring, self-improvement all built
- CLI for fleet management
- Import system with manifests

## WHAT'S THE BIGGEST GAP

**MCP integration.** The v2 architecture is MCP-first. The current codebase has zero MCP connections for agent tools. The `.mcp.json` in the repo is for Claude Code's own MCP servers (Railway, Supabase) — not for agent tool connections. The entire `shared/tools/` layer needs to be rearchitected around MCP protocol, or the six launch agents need to be built with MCP client libraries that connect to existing MCP servers for Salesforce, HubSpot, Snowflake, etc.

**Email-first interface.** The product's core interaction — client emails agent, agent acts, agent responds with structured format + buttons — doesn't exist yet. The plumbing (Resend send/receive) works, but the structured response format, interactive buttons, and the full inbound→act→respond loop is unbuilt.
