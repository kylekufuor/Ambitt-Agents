# PRD.md — Ambitt Agents
Version: 1.0
Owner: Kyle — AmbittMedia / Kufgroup LLC
Domain: ambitt.agency
Last updated: March 2026

---

## 1. First truth principle

Every agent exists to make the client's business genuinely better. Not to generate output. Not to look busy. To create real, measurable value. Before every communication, every task, every action — the agent asks one question: does this make the business better? If the answer is no, it doesn't happen.

Every agent belongs fully to the client it serves. It learns their voice, earns their trust, and operates as a true member of their team. Value is not a feature. It is the only reason we exist.

This principle is passed from Oracle to every agent it scaffolds. It lives as the first instruction in every agent's system prompt. No exceptions.

---

## 2. What we are building

Ambitt Agents is an AI workforce platform. Not software. A workforce. Clients hire agents like remote contractors. Agents have names, personalities, dedicated emails, and persistent memory. They work in your inbox. They never ask you to log in anywhere.

### Business model
- One-time setup fee: $500 per agent
- Monthly retainer: $300-$500 per agent depending on type
- Tool license costs distributed across clients
- Extended conversation history: paid upgrade
- Gross margin at scale: ~96%

### Revenue targets
- Stage 1: $5-10K MRR (first 10 clients)
- Stage 2: $20-50K MRR (10-50 clients)
- Stage 3: $100K+ MRR (self-serve platform)

---

## 3. Core architecture

Four layers: Oracle, Agent fleet, Shared tool layer, Data layer.
See CLAUDE.md for full architecture detail.

Multi-model routing:
- Claude: all client conversations, orchestration, building
- Gemini: data analysis and summarization
- GPT-4o: creative content and copywriting
- Fallback: Claude always

Rule: Gemini and OpenAI never touch clients directly.

---

## 4. Oracle requirements

### What Oracle does
- Receives new agent briefs
- Scaffolds agent folder structure, config, prompts, and tool connections
- Logs new agent to database
- Sends Kyle WhatsApp approval request
- On approval: activates agent, triggers Stripe subscription, sends agent intro email
- Monitors fleet health every 15 minutes
- Retries failed agents 3 times before alerting Kyle
- Runs weekly self-improvement cycle
- Routes tasks to correct AI model

### Monitoring rules
- Agent hasn't run in scheduled window: flag yellow
- Agent failed 1-2 times: retry silently, log warning
- Agent failed 3 times: flag red, WhatsApp Kyle immediately
- Client hasn't responded in 7 days: flag for Kyle review
- API cost spikes 3x normal: alert Kyle

---

## 5. Agent requirements

### Every agent must have
- Unique name and personality
- Dedicated email address at ambitt.agency
- Isolated Railway service
- config.json with identity, schedule, tools, model routing
- First Truth Principle as first instruction in system prompt
- Permanent client memory object
- 3-month rolling conversation history (extended = paid tier)
- Configurable autonomy level: advisory or autonomous

### Autonomy configuration
During onboarding, client configures agent mode:
- Advisory: agent reports and recommends, client implements
- Autonomous: agent implements directly and verifies the fix took effect

Autonomous agents verify implementation by checking the system directly after making a change. Advisory agents follow up 48 hours after client marks something implemented by checking if the metric moved.

### Communication rules
- Every message personalized to client's business, context, and history
- Action buttons dynamic and specific to each task — never generic
- Plain text replies understood and responded to intelligently
- Agent signs every message with name and role
- Subject lines include key metrics
- Urgency color coding: green / amber / red

---

## 6. Standard email anatomy

Every agent type follows this structure:

1. Subject line — key metrics before opening
   Example: "McQuizzy · Today: 66 visitors, 1 signup, activation broken"

2. Agent identity header — name, role, client business

3. The brief — 3-4 sentences, plain English, trusted advisor tone
   This is the most important section. Claude writes this. No jargon.
   One clear action. The non-technical owner reads this and knows exactly what to do.

4. Action buttons — primary action, snooze, ask agent a question

5. Scroll divider — "scroll for full details"
   Clear signal that everything below is optional detail

6. The numbers — clean metrics for this agent type

7. Visualization — static PNG chart (Quickchart.io, server-side)

8. Bottleneck or highlight — color coded by urgency

9. Go deeper — attachment + dashboard link (optional)

10. First truth check — always last, always present
    Connects the data back to why the business exists.
    Example: "No one completed a quiz today. No one got closer to the job they're working toward."

---

## 7. Email reply handling

- Agent sends from noreply@ambitt.agency
- Reply-To header points to reply-[agentId]@ambitt.agency
- Client replies naturally — plain text or buttons
- Reply hits Railway webhook at /webhooks/email-reply/[agentId]
- Resend Inbound parses and forwards reply payload
- Claude reads reply, understands intent, responds within 15 minutes
- Conversation logged in ConversationMessage table

---

## 8. MCP tool connections — launch constraint

At launch: agents only connect to tools with official MCP servers.

Confirmed MCP tools at launch:
- PostHog (mcp.posthog.com/mcp) — analytics
- Gmail (gmail.mcp.claude.com/mcp) — email
- Stripe (mcp.stripe.com) — billing
- Notion (mcp.notion.com/mcp) — docs
- Apollo (mcp.apollo.io/mcp) — outreach
- Calendly (mcp.calendly.com) — booking
- QuickBooks (intuit MCP) — bookkeeping
- Attio (mcp.attio.com/mcp) — CRM
- Slack (mcp.slack.com/mcp) — comms

V2 — build custom MCP wrappers:
- TikTok (official API available, 1-2 days to wrap)
- LinkedIn
- Discord
- Buffer

Credential management:
- V1: clients submit via OneTimeSecret link
- V2: OAuth portal at ambitt.agency/connect
- All credentials encrypted at rest in Postgres

---

## 9. Agent roster — launch set

### Internal agents (AmbittMedia — Kyle's own business)

Scout — lead capture agent
- Purpose: qualifies inbound leads, books discovery calls
- Tools: Gmail MCP, Calendly MCP, Attio MCP
- Behavior: conversational qualification, books when context is sufficient
- Schedule: monitors continuously, responds within 15 minutes
- North star metric: qualified leads that convert to paying clients

Lens — analytics agent
- Purpose: weekly AmbittMedia performance report
- Tools: PostHog MCP, Gmail MCP
- Schedule: Friday 7am
- Model routing: Gemini for analysis, Claude for brief
- North star metric: Kyle's awareness of AmbittMedia growth levers

### Client-facing agents (launch set)

Priya — PostHog analytics agent
- Purpose: daily or weekly site analytics brief in plain English
- Tools: PostHog MCP, Gmail MCP
- Target verticals: SaaS, course platforms, e-commerce
- Proof of concept: already running on McQuizzy
- Email: priya@ambitt.agency
- North star metric: client activation rate improvement

Vibe — TikTok growth agent
- Purpose: performance monitoring, trend detection, script writing, posting optimization
- Tools: TikTok API custom MCP wrapper
- Target verticals: creators, salons, restaurants, coaches, e-commerce, sellers
- Model routing: OpenAI for scripts, Gemini for trend analysis, Claude for all client communication
- Email: vibe@ambitt.agency
- Modes: Creator mode (growth focus) and Seller mode (conversion focus)
- North star metric: defined per client during onboarding (views, followers, sales, bookings)

Vibe script writing capability:
- Finds viral videos in client's niche
- Breaks down viral DNA: hook type, first 3 seconds, pacing, emotional trigger, CTA, sound
- Rebuilds the formula using client's business, voice, and products
- Delivers ready-to-film script with: hook, body, CTA
- Includes breakdown of why each element works
- Tracks which scripts were filmed and how they performed
- Builds formula library per niche — gets smarter with every client

Pulse — reputation and reviews agent
- Purpose: monitors Google reviews, sends weekly digest, flags negatives, drafts response templates
- Tools: Gmail MCP (review monitoring via API)
- Target verticals: salons, restaurants, med spas, service businesses
- Email: pulse@ambitt.agency
- North star metrics: configurable per client during onboarding
  Options: increase positive review volume, decrease negative reviews,
  increase response rate, drive new bookings from reviews

Scout (client-facing) — lead capture agent
- Purpose: qualifies inbound leads and books discovery calls for client
- Tools: Gmail MCP, Calendly MCP
- Target verticals: service businesses, consultants, coaches
- Email: scout@ambitt.agency
- North star metric: qualified leads that convert to paying clients

---

## 10. Defensible metrics framework

### The rule
We measure outcomes, not activity. Every stat must be defensible.

### What gets tracked per recommendation
- Baseline metric value before recommendation
- Expected outcome direction (up or down) and magnitude
- Implementation status: implemented / ignored / in-progress / rejected
- Implementation mode: autonomous (verified by system) or advisory (confirmed by client)
- Verification: automated check 48 hours after implementation, or system-level confirmation
- Measured outcome at 7, 30, and 90 days
- Confidence level: low / medium / high
- Sample size

### Verification rules
Advisory mode: client marks recommendation implemented. Agent checks metric 48 hours later. If metric didn't move, agent flags discrepancy in dashboard. Kyle decides response pattern based on what he observes in the wild.

Autonomous mode: agent implements the fix itself and verifies the change took effect by checking the system directly. This is irrefutable.

### How stats are claimed publicly
Only state: "Among clients who implemented [recommendation type] in [mode], average [metric] improvement was [X]% across [N] clients over [time period]."

Never claim causation without verified implementation and measured outcome. Transparency is our risk reduction.

### North star metrics by vertical
- SaaS / course platforms: activation rate, retention, MRR growth
- TikTok creators: defined per client (views, followers, sales, bookings)
- Salons: defined per client (review volume, booking rate, review sentiment)
- Restaurants: defined per client (review rating, reservation volume)
- Service businesses: qualified lead conversion rate, revenue from Scout leads
- E-commerce: conversion rate, average order value, retention

---

## 11. Client onboarding flow

1. Client clicks CTA on agent landing page
2. Redirected to ambitt.agency/start — onboarding form
3. Form captures: business name, industry, agent goal, brand voice, tools used, key contacts, success definition, north star metric priority
4. Form submission triggers Oracle webhook
5. Oracle scaffolds agent, logs to DB
6. Oracle sends Kyle WhatsApp approval
7. Kyle approves
8. Stripe subscription created
9. Agent sends intro email to client
10. Client receives OneTimeSecret link for credentials
11. Credentials stored encrypted in DB
12. 7-day onboarding: agent trains on client context
13. Day 7: agent goes live, first task runs

### Onboarding form questions
1. Your full name and business name
2. What industry are you in?
3. Which agent are you hiring? (pre-filled from landing page)
4. What is the main problem you want this agent to solve?
5. What does success look like in 90 days?
6. How do you prefer to receive updates — email or WhatsApp?
7. What tools do you currently use?
8. Describe your brand voice in 3 words
9. Who should the agent communicate with at your business?
10. For Pulse clients: which outcome do you prioritize? (more positive reviews / fewer negative / faster responses / more bookings)
11. For Vibe clients: what is your TikTok goal? (brand building / product sales / monetization / audience growth)
12. Anything else the agent should know about your business?

---

## 12. Billing — Stripe

- Subscription created automatically on agent go-live
- Subscription cancelled automatically when agent is killed
- Setup fee charged as one-time invoice on form submission
- Monthly retainer billed on agent go-live anniversary
- API usage tracked daily per agent in DB
- Extended history tier: +$50/month
- Failed payments: agent paused after 3 days, killed after 14 days with client notification

---

## 13. Website and marketing

### Site structure
ambitt.agency — general landing page (brand, word of mouth)
ambitt.agency/agents — agent marketplace
ambitt.agency/agents/[name] — individual agent page (ad traffic)
ambitt.agency/for/[vertical] — vertical landing pages (niche ads)
ambitt.agency/start — onboarding form (all CTAs)
dashboard.ambitt.agency — Kyle's internal dashboard
clients.ambitt.agency — client billing portal
support@ambitt.agency — support inbox

### Individual agent page sections
1. Hero — agent name, one-line value prop, CTA to /start
2. What [agent] does — 3-4 specific jobs in plain English
3. Sample email — real example of what the client receives
4. How it works — onboard, connect, receive
5. Pricing — setup fee + monthly retainer
6. FAQ — top objections
7. CTA — "Hire [agent name]" linking to /start?agent=[name]

### Ad strategy by agent
- Vibe: TikTok ads targeting creators and business owners on TikTok
- Scout + Pulse: Meta ads targeting local service businesses
- Priya + Nova: Google ads targeting SaaS founders
- Pitch: LinkedIn ads targeting B2B service providers

### Viral loop — Vibe
Creator uses Vibe → grows account → makes TikTok about it → drives traffic to ambitt.agency/agents/vibe → new creators sign up → repeat. Every successful Vibe client is a free marketing asset.

---

## 14. Build order

Phase 1 — Foundation (week 1-2)
1. Postgres schema + Prisma on Railway
2. Shared tool layer — all /shared modules
3. Oracle v1 — scaffolds agents, WhatsApp approval
4. Scout — first internal AmbittMedia agent

Phase 2 — Internal agents (week 3-4)
5. Lens
6. Vibe (test on own TikTok positioning)
7. Pulse (test on salon clients)

Phase 3 — Client agents and billing (week 5-6)
8. Priya (proven on McQuizzy)
9. Onboarding form
10. Stripe billing
11. Oracle full approval flow

Phase 4 — Dashboards and launch (week 7-8)
12. Kyle's internal dashboard
13. clients.ambitt.agency portal
14. Agent landing pages
15. First three paying clients

---

## 15. Non-negotiables

1. First Truth Principle in every agent system prompt — no exceptions
2. Claude handles all client-facing conversations — Gemini and OpenAI never touch clients
3. Client credentials encrypted at rest — never logged in plaintext
4. Every agent task logs to DB before sending output to client
5. Oracle approval gate before any agent goes live
6. Every email follows brief-first anatomy — brief at top, details below scroll divider, First Truth Check always last
7. Agent identities permanent once assigned to a client
8. MCP-only tool connections at launch
9. Stripe subscription lifecycle tied directly to agent lifecycle
10. Every architectural decision must not block Kubernetes migration
11. Every metric is defensible — outcomes only, transparency always
12. Build clean. Build slow. Measure everything.
