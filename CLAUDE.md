# CLAUDE.md — Ambitt Agents
Version: 1.0
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

## The system has four layers

### Layer 1 — Oracle (meta-agent)
- Always-on Railway service
- Scaffolds new agents from briefs
- Monitors fleet health every 15 minutes
- Sends Kyle WhatsApp approval before any agent goes live
- Retries failed agents 3 times before alerting Kyle via WhatsApp and dashboard
- Runs weekly self-improvement cycle
- Routes tasks to correct AI model based on task type

### Layer 2 — Agent fleet
- Each agent is a separate Railway service
- Fully isolated per client — credentials, memory, conversation history never shared
- One agent per client relationship
- Each agent has: unique name, personality, dedicated email (e.g. nova@ambitt.agency)
- All client-facing conversations handled by Claude only
- Agents run on cron schedules or webhook triggers

### Layer 3 — Shared tool layer (/shared)
- claude.js — Anthropic SDK wrapper
- gemini.js — Google Gemini SDK wrapper (data analysis and summarization)
- openai.js — OpenAI SDK wrapper (creative content and copywriting)
- email.js — Resend integration, personalized email and reply-to webhook parsing
- whatsapp.js — Twilio WhatsApp Business API
- db.js — Prisma client singleton
- stripe.js — subscription lifecycle tied to agent lifecycle
- memory.js — permanent client memory objects + 3-month rolling conversation history

### Layer 4 — Data layer
- Postgres on Railway via Prisma ORM
- Every client, agent, task, output, recommendation, and outcome logged
- Agent memory objects persist permanently
- Powers dashboard.ambitt.agency (Kyle's internal ops dashboard)
- Powers clients.ambitt.agency (client billing portal)

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

## Agent architecture

Every agent folder structure:

agents/[name]/
├── index.js          — main entry point, cron or webhook handler
├── config.json       — identity, schedule, tools, client ID, model routing
├── tasks/            — individual task modules
└── prompts/          — system prompts (First Truth Principle always first)

Every agent config.json:
{
  "agentId": "uuid",
  "clientId": "uuid",
  "name": "Vibe",
  "email": "vibe@ambitt.agency",
  "personality": "energetic, data-driven, direct",
  "purpose": "TikTok growth and content strategy",
  "tools": ["tiktok", "gmail"],
  "schedule": "0 8 * * 1",
  "primaryModel": "claude-sonnet-4-6",
  "analyticsModel": "gemini",
  "creativeModel": "gpt-4o",
  "autonomyLevel": "advisory",
  "status": "active",
  "historyTier": "standard",
  "stripeSubscriptionId": "sub_xxx"
}

---

## Communication rules

- Every message personalized — references client business name, specific context, recent history
- Action buttons dynamic per task and context — never generic
- Plain text replies read intelligently and responded to naturally
- Agent signs every message with name and role
- Subject lines include key metrics: "McQuizzy · Today: 66 visitors, 1 signup, activation broken"
- Urgency color coding: green = healthy, amber = watch this, red = fix today
- Claude handles all client-facing conversations regardless of which model ran the task

---

## Email reply handling

- Agent sends email from noreply@ambitt.agency
- Reply-To header points to reply-[agentId]@ambitt.agency
- Client replies naturally in their email client
- Reply hits Railway webhook at /webhooks/email-reply/[agentId]
- Resend Inbound handles forwarding the reply payload
- Agent reads reply, understands intent via Claude, responds within 15 minutes
- Full conversation maintained in ConversationMessage table

---

## Standard email anatomy

Every agent email follows this structure — no exceptions:

1. Subject line — key metrics visible before opening
2. Agent identity header — name, role, client business name
3. The brief — 3-4 sentences, plain English, trusted advisor tone, no jargon, one clear action
4. Action buttons — primary action, snooze, ask agent a question
5. Scroll divider — "scroll for full details"
6. The numbers — clean metrics relevant to agent type
7. Visualization — static PNG chart (Quickchart.io, server-side generated)
8. Bottleneck or highlight — color coded by urgency
9. Go deeper — attachment + dashboard link (optional)
10. First truth check — always last, always present, always honest

---

## Client onboarding flow

1. Client fills onboarding form at ambitt.agency/start
2. Oracle scaffolds agent, logs to DB
3. Oracle sends Kyle WhatsApp approval request
4. Kyle approves via WhatsApp reply
5. Stripe subscription created
6. Agent sends intro email to client from dedicated email address
7. Client submits credentials via OneTimeSecret link
8. Credentials stored encrypted in DB
9. 7-day onboarding: agent trains on client context, brand voice, SOPs
10. Day 7: agent goes live, first task runs automatically

---

## Oracle approval flow

1. Oracle scaffolds agent — sends Kyle WhatsApp: "Agent [Name] ready for [Client]. Tools: [list]. Reply APPROVE or REJECT."
2. Kyle replies APPROVE — Oracle activates agent, creates Stripe subscription, sends agent intro email
3. Kyle replies REJECT — Oracle logs rejection, waits for revised brief
4. No response in 24 hours — Oracle sends reminder

---

## Self-improvement loop

1. Every client action (approve, reject, edit, ignore) logged as performance signal
2. Signals aggregated weekly per agent type — anonymized, never client-specific data
3. Oracle generates improved prompts for underperforming agent types
4. Improvements deployed automatically
5. Kyle notified via dashboard and WhatsApp
6. Kyle can reject any improvement from dashboard

---

## Metric tracking and defensibility

Every recommendation must be tracked with:
- Baseline metric value before recommendation
- Expected outcome direction and magnitude
- Implementation status: implemented / ignored / in-progress / rejected
- Verification method: automated check or client confirmation
- Measured outcome at 7, 30, and 90 days
- Confidence level: low / medium / high

Stats are only claimed publicly when:
- Implementation was verified (autonomous) or confirmed (advisory)
- Sample size is stated
- Time period is stated
- Mode (autonomous vs advisory) is disclosed

We measure outcomes, not activity. We are transparent about conditions. This is how we build trust.

---

## Kyle's dashboard (dashboard.ambitt.agency)

- Fleet health status per agent (green/yellow/red)
- Total active clients and agents
- Daily API cost by model and by agent
- Monthly recurring revenue
- Full output log — every message sent to every client
- Approve, pause, kill any agent
- Review and reject Oracle improvement suggestions
- Outcome stats per agent type with sample size

---

## Client billing portal (clients.ambitt.agency)

- Magic link login (no password)
- View active agents
- Next billing date
- Pause, resume, or cancel subscription
- Update payment method
- Billing history
- Billing management only — agents stay in email and WhatsApp

---

## Support

V1 (first 10 clients): Kyle handles all support at support@ambitt.agency and WhatsApp directly.
V1.5 (10-50 clients): Build Support agent for common questions, escalations to Kyle.
V2 (50+ clients): Help center at ambitt.agency/help.

---

## Folder structure

ambitt-agents/
├── CLAUDE.md
├── PRD.md
├── SCHEMA.md
├── .env.example
├── oracle/
│   ├── index.js
│   ├── scaffold.js
│   ├── monitor.js
│   ├── improve.js
│   └── router.js
├── agents/
│   ├── scout/
│   ├── lens/
│   ├── vibe/
│   ├── pulse/
│   └── priya/
├── shared/
│   ├── claude.js
│   ├── gemini.js
│   ├── openai.js
│   ├── email.js
│   ├── whatsapp.js
│   ├── db.js
│   ├── stripe.js
│   └── memory.js
├── db/
│   └── schema.prisma
├── dashboard/
├── client-portal/
└── railway.toml

---

## Environment variables

ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
DATABASE_URL=
RESEND_API_KEY=
EMAIL_DOMAIN=ambitt.agency
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
KYLE_WHATSAPP_NUMBER=
NODE_ENV=
RAILWAY_ENVIRONMENT=
APP_ENCRYPTION_KEY=

---

## Build rules for Claude Code

1. Read CLAUDE.md before every session — no exceptions
2. Read SCHEMA.md before touching the database — no exceptions
3. Build one thing at a time — complete it, test it, move on
4. Every agent task must log output to DB before sending to client
5. Never hardcode client data — everything from DB
6. Every external API call must have error handling and retry logic (3 retries)
7. Client credentials encrypted at rest — never logged in plaintext
8. Oracle is the only service that writes to agent configs
9. Every new agent must follow the exact folder structure above
10. Every architectural decision must not block future Kubernetes migration
11. TypeScript strict mode — no implicit any
12. No blocking operations on main thread
13. Build step by step — after every milestone and phase, summarize: what was built, impact to the overall product, why it matters, and what's next

---

## Code review and quality gates

Every code artifact must pass the code critic before being finalized.

Code critic checklist:
- Single responsibility principle per function
- Error handling on all external API calls
- No hardcoded credentials or client data
- Prisma parameterized queries only — no raw SQL injection risk
- Encryption on all sensitive fields before DB write
- Structured logging — no console.log in production
- TypeScript strict mode — all types explicit
- No blocking operations on main thread
- Retry logic on all external API calls
- Every agent task logs to DB before sending output

Review flow:
1. Claude Code writes function or module
2. Run through critic checklist
3. Critic flags issues — Claude Code fixes
4. Critic passes — code is finalized
5. Never ship code that fails critic review

If no code critic skill exists in /mnt/skills — create one before building.

---

## Build order

Phase 1 — Foundation (week 1-2)
1. Postgres schema + Prisma setup on Railway
2. Shared tool layer — all /shared modules
3. Oracle v1 — scaffolds agents, sends WhatsApp approval
4. Scout — first internal agent for AmbittMedia

Phase 2 — Internal agents (week 3-4)
5. Lens — analytics for AmbittMedia
6. Vibe — TikTok growth
7. Pulse — reputation agent

Phase 3 — Client agents and billing (week 5-6)
8. Priya — PostHog analytics
9. Onboarding form at ambitt.agency/start
10. Stripe billing integration
11. Oracle full approval flow

Phase 4 — Dashboards and launch (week 7-8)
12. Kyle's internal dashboard
13. clients.ambitt.agency billing portal
14. Agent landing pages
15. First three paying clients

---

## Vision

Stage 1 — Kyle runs agents for AmbittMedia. Proves the model.
Stage 2 — First paying clients. Oracle scaffolds. Kyle approves.
Stage 3 — Self-serve onboarding. Stripe automates. Kyle monitors.
Stage 4 — Kubernetes. Oracle manages containers. Ambitt Agents is a platform.

Every decision today must not block the Kubernetes migration tomorrow.
