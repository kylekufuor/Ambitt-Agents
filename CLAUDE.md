# CLAUDE.md — Ambitt Agents
Version: 2.0
Owner: Kyle — AmbittMedia / Kufgroup LLC
Domain: ambitt.agency

---

## First truth principle

Every agent exists to make the client's business genuinely better. Not to generate output. Not to look busy. To create real, measurable value. Before every communication, every task, every action — the agent asks one question: does this make the business better? If the answer is no, it doesn't happen.

Every agent belongs fully to the client it serves. It learns their voice, earns their trust, and operates as a true member of their team. Value is not a feature. It is the only reason we exist.

This principle is passed from Oracle to every agent it scaffolds. It lives as the first instruction in every agent's system prompt. No exceptions.

---

## What this project is

Ambitt Agents is an AI workforce platform. Clients hire agents the same way they hire a remote contractor. Agents have names, personalities, dedicated email addresses, and persistent memory. They deliver value through email and WhatsApp — not dashboards. Clients never log into anything. They just receive work.

We are not building software. We are building a workforce.

---

## Architecture — tools-first, no hardcoded agents

All agents are created dynamically through Oracle (dashboard → scaffold → approve). There are zero hardcoded agent folders or pipelines. Every capability an agent needs comes from tool connections via Composio or built-in platform tools.

### Layer 1 — Oracle (Express.js on Railway)
- Always-on service: agent lifecycle, fleet health, scheduling, webhooks
- Scaffolds agents from dashboard, sends Kyle WhatsApp approval
- Internal cron scheduler (node-cron) — agents run on their schedule automatically
- Inbound email webhook: Resend → `/webhooks/email-inbound` → runtime engine
- Composio endpoints: OAuth connect, API key connect, app catalog
- Fleet monitoring with budget enforcement (80% warning, 100% auto-pause)
- Stripe webhook handling (subscription lifecycle)
- Self-improvement cycle
- Email router: `sendAgentEmail(trigger, props)` dispatches to correct template

### Layer 2 — Agent Runtime Engine (/shared/runtime)
- Universal agentic loop: load context → load tools → Claude + tools → execute → loop (max 10)
- Composio as primary tool path (850+ apps), direct MCP as fallback
- Built-in platform tools (no client credentials needed):
  - `web_search` — Tavily API for real-time business research
  - `generate_csv` — CSV file attachments
  - `generate_pdf` — PDF report attachments (Puppeteer)
  - `analyze_website_performance` — Google PageSpeed Insights
  - `analyze_website_technology` — tech stack, SSL, security headers
- Prompt assembler: First Truth Principle → identity → client context → tool expertise → communication standards → conversation history
- Tool bridge: MCP schemas → Claude format, Composio or direct MCP execution
- Interaction limit enforcement per pricing tier
- Inbound email attachment parsing (PDF, DOCX, text → context for agent)

### Layer 3 — Shared tool layer (/shared)
- claude.ts — Anthropic SDK wrapper with retry + usage logging
- gemini.ts — Google Gemini SDK wrapper (data analysis)
- openai.ts — OpenAI SDK wrapper (creative content)
- email.ts — Resend send + conversation logging, reply-to per agent
- whatsapp.ts — Twilio WhatsApp Business API
- db.ts — Prisma client singleton
- stripe.ts — subscription lifecycle tied to agent lifecycle
- memory.ts — permanent client memory objects
- encryption.ts — AES-256-GCM for credentials at rest
- pricing.ts — tier-based pricing (starter/growth/scale/enterprise)
- logger.ts — Winston structured logging

### Layer 4 — Data layer
- Postgres on Supabase via Prisma ORM
- Every client, agent, task, output, recommendation, and outcome logged
- Agent memory objects persist permanently
- Powers dashboard.ambitt.agency (Kyle's ops dashboard)
- Powers clients.ambitt.agency (client billing portal)

---

## Tool connections — Composio is primary

Everything an agent does beyond platform built-ins goes through Composio tool connections. Email sending, calendar booking, CRM access, data tools — all Composio.

- Composio handles OAuth flows, credential storage, and 850+ app integrations
- Agent bridge (`shared/mcp/agent-bridge.ts`) routes: check Composio first → execute via Composio → fallback to direct MCP
- MCP registry (`shared/mcp/registry.ts`) has 30+ server definitions as fallback
- MCP client manager handles HTTP + stdio transports with connection caching

Built-in tools are platform-level only — things that need no client credentials:
- Web search, PDF/CSV generation, site analysis

If you want an agent to send email → connect Resend via Composio.
If you want an agent to book meetings → connect Calendly via Composio.
If you want an agent to query a CRM → connect Salesforce via Composio.

---

## Email template system

10 templates in `oracle/templates/`, all TypeScript functions returning raw HTML with inline styles.

| Template | File | Trigger | Header |
|----------|------|---------|--------|
| Welcome | welcome-email.ts | Agent activation | Dark |
| Onboarding | onboarding-email.ts | 1hr after welcome | Dark |
| Agent Response | agent-response.ts | Runtime output | Dark |
| Alert | alert-email.ts | Metric spike/anomaly | Red |
| Digest | digest-email.ts | Weekly/periodic summary | Dark |
| Action Required | action-required-email.ts | Needs client approval | Amber |
| Progress | progress-email.ts | Onboarding/project progress | Dark |
| Error | error-email.ts | Tool/system error | Red |
| Permission | permission-email.ts | New tool access request | Amber |
| Milestone | milestone-email.ts | Achievement/target hit | Green |

Design system in `_shared.ts`: header variants, badge colors, stats grid, CTA buttons, recommendation blocks.

Email router (`oracle/lib/emailRouter.ts`): `sendAgentEmail(trigger, props)` selects template, sends via Resend, logs recommendations to DB.

Templates are dumb renderers — all content is AI-generated and passed in as props. Templates never generate content.

---

## Email inbound flow

1. Agent sends email from `noreply@ambitt.agency` with Reply-To `reply-{agentId}@ambitt.agency`
2. Client replies naturally in their email client
3. Resend receives at `ambitt.agency` (MX → `inbound.resend.com`)
4. Resend fires `email.received` webhook to `/webhooks/email-inbound`
5. Oracle extracts agentId from recipient address, fetches full email + attachments via Resend API
6. Attachments parsed (PDF, DOCX, text) and appended to message as context
7. Runtime engine runs: Claude + tools → generates response
8. Response sent back via agent-response template

---

## Agent scheduling

Agents have a `schedule` field (cron string, e.g. `"0 8 * * 1"` for Monday 8am).

- On Oracle startup: loads all active agents, registers cron jobs via node-cron
- On agent approval: `registerAgent(id, schedule)` — job starts
- On pause/kill/reject: `unregisterAgent(id)` — job stops
- On schedule trigger: runtime engine runs autonomously, uses connected tools, emails results to client
- No external cron dependency — all managed internally by Oracle

---

## Multi-model routing rules

Task type | Model | Reason
All client-facing conversations | claude-sonnet-4-6 | Relationship quality
Orchestration and agent building | claude-sonnet-4-6 | Best reasoning and code
Data analysis and summarization | Gemini | Speed and cost on large datasets
Creative content and copywriting | GPT-4o | Strong creative output
Fallback if any model fails | Claude | Always available

RULE: Gemini and OpenAI never communicate directly with clients. Claude owns every client relationship.

---

## Client onboarding flow

1. Kyle creates agent via dashboard (dashboard.ambitt.agency)
2. Connects tools via Composio (OAuth or API key)
3. Oracle scaffolds agent, sends Kyle WhatsApp approval
4. Kyle approves → agent activates, welcome email sent, site scanned
5. Onboarding email sent 1hr later (context-gathering questions)
6. Client replies with answers + attachments → agent parses and stores in memory
7. Agent goes live on its cron schedule

---

## Recommendation tracking

Every recommendation logged to `Recommendation` table with:
- `approveActionId` — unique ID referenced in email CTAs
- `emailType` — which template triggered it
- `status` — pending / approved / dismissed / executed / verified
- `reasoning` — AI-generated explanation
- `resolvedAt` — when client acted on it

Recommendations in emails include approve/dismiss CTAs via mailto links.

---

## Folder structure

ambitt-agents/
├── CLAUDE.md
├── PRD.md
├── SCHEMA.md
├── oracle/
│   ├── index.ts          — Express server, all endpoints
│   ├── scaffold.ts       — agent creation + approval + welcome email
│   ├── scheduler.ts      — node-cron agent scheduler
│   ├── monitor.ts        — fleet health + budget enforcement
│   ├── improve.ts        — self-improvement cycle
│   ├── router.ts         — multi-model task routing
│   ├── billing.ts        — Stripe webhook handler
│   ├── onboard.ts        — client onboarding
│   ├── import.ts         — bulk agent import from manifests
│   ├── cli.sh            — CLI for fleet management
│   ├── lib/
│   │   ├── emailRouter.ts       — sendAgentEmail() dispatch
│   │   └── logRecommendations.ts — DB logging after send
│   └── templates/
│       ├── _shared.ts           — design system primitives
│       ├── welcome-email.ts
│       ├── onboarding-email.ts
│       ├── agent-response.ts    — with optional stats/tables/recommendations
│       ├── alert-email.ts
│       ├── digest-email.ts
│       ├── action-required-email.ts
│       ├── progress-email.ts
│       ├── error-email.ts
│       ├── permission-email.ts
│       └── milestone-email.ts
├── shared/
│   ├── claude.ts
│   ├── gemini.ts
│   ├── openai.ts
│   ├── email.ts
│   ├── whatsapp.ts
│   ├── db.ts
│   ├── stripe.ts
│   ├── memory.ts
│   ├── encryption.ts
│   ├── pricing.ts
│   ├── logger.ts
│   ├── runtime/
│   │   ├── engine.ts            — agentic loop (the brain)
│   │   ├── prompt-assembler.ts  — dynamic system prompt builder
│   │   ├── tool-bridge.ts       — MCP/Composio → Claude format
│   │   └── index.ts
│   ├── mcp/
│   │   ├── composio.ts          — Composio SDK integration
│   │   ├── agent-bridge.ts      — routes tools: Composio → MCP fallback
│   │   ├── client.ts            — MCP client manager
│   │   ├── registry.ts          — 30+ MCP server definitions
│   │   └── types.ts
│   ├── platform-tools/
│   │   ├── web-search.ts        — Tavily API
│   │   ├── site-scanner.ts      — tech stack, SSL, security headers
│   │   ├── pagespeed.ts         — Google PageSpeed Insights
│   │   └── index.ts
│   └── attachments/
│       ├── csv.ts               — CSV generation
│       ├── pdf.ts               — PDF generation (Puppeteer)
│       ├── parse-inbound.ts     — inbound attachment parsing (PDF, DOCX, text)
│       └── index.ts
├── agents/                       — empty (all agents created via Oracle)
├── dashboard/                    — Next.js admin dashboard
├── client-portal/                — Next.js client billing portal
├── prisma/
│   └── schema.prisma
├── scripts/
└── imports/

---

## Environment variables

ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
DATABASE_URL=
DIRECT_URL=
RESEND_API_KEY=
EMAIL_DOMAIN=ambitt.agency
COMPOSIO_API_KEY=
TAVILY_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
KYLE_WHATSAPP_NUMBER=
KYLE_EMAIL=
NODE_ENV=
RAILWAY_ENVIRONMENT=
APP_ENCRYPTION_KEY=
ORACLE_URL=

---

## Build rules for Claude Code

1. Read CLAUDE.md before every session — no exceptions
2. Read SCHEMA.md before touching the database — no exceptions
3. No hardcoded agents — everything through Oracle/dashboard
4. Everything the agent does goes through tool connections (Composio) or built-in platform tools
5. Built-in tools are platform-level only — no client credentials needed
6. Every agent task must log output to DB before sending to client
7. Never hardcode client data — everything from DB
8. Every external API call must have error handling and retry logic (3 retries)
9. Client credentials encrypted at rest — never logged in plaintext
10. TypeScript strict mode — no implicit any
11. No blocking operations on main thread
12. Templates are dumb renderers — never generate content, only format props
13. All emails go through the email router — never call templates directly
14. Every architectural decision must not block future Kubernetes migration

---

## Vision

Stage 1 — Kyle runs agents for himself. Proves the model.
Stage 2 — First paying clients. Oracle scaffolds. Kyle approves.
Stage 3 — Self-serve onboarding. Stripe automates. Kyle monitors.
Stage 4 — Kubernetes. Oracle manages containers. Ambitt Agents is a platform.

Every decision today must not block the Kubernetes migration tomorrow.
