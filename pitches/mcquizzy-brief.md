# What Ambitt Agents Would Do for McQuizzy

> Paste this into Claude Code to understand what you'd be getting.
> This is a technical brief, not a sales pitch. Read it like an architecture doc.

---

## What you have now

You built agents that connect to tools and send emails. That's a solid start. But here's what's likely missing:

- **No memory.** Your agents don't remember what they told the client last week. Every run is stateless. Clients notice when an agent repeats itself or misses context.
- **No suppression.** If activation is broken on Monday and still broken on Friday, the agent sends the same finding every day. Clients tune out. Ambitt agents track every finding they've sent, suppress it until the metric changes by a meaningful threshold or a cooldown period passes, and increment a send count so you know what's being repeated.
- **No conversation.** Clients can't reply to the email and have the agent respond. It's one-way.
- **No cost control.** If an agent makes 500 API calls in a loop, nothing stops it. No budget, no auto-pause, no alert.
- **No orchestration.** If an agent fails, who retries it? If a new client signs up, who provisions the agent? You do, manually.

---

## What Ambitt Agents adds

### 1. Agents are team members, not scripts

Each agent has a name, personality, dedicated email address, and persistent memory. It remembers the client's business goal, brand voice, past conversations, and what worked. When it sends an email on Monday, it knows what it said on Friday.

### 2. Clients reply naturally

Client gets an email from `quiz@ambitt.agency`. They reply in Gmail like they would to any colleague. The reply hits a webhook, the agent reads it, understands intent, and responds — typically within the hour. Full threaded conversation maintained in the database.

We'd rather send a thoughtful reply in 45 minutes than a fast bad one in 5.

### 3. Oracle — the meta-agent

Oracle is an always-on service that:
- Scaffolds new agents from a brief (you describe what you need, it builds the agent)
- Monitors fleet health every 15 minutes
- Auto-pauses agents that exceed their budget
- Retries failed tasks 3 times before alerting you
- Runs a weekly self-improvement cycle — analyzes what clients engaged with vs. ignored, and **proposes** prompt improvements for your review. Nothing auto-deploys. You approve every change from the dashboard or WhatsApp.

You approve agents via WhatsApp reply. `APPROVE clx8k2j...` and it goes live.

### 4. Budget enforcement

Every agent has a monthly budget in cents. Every API call logs exact token counts and cost. At 80% budget, you get a warning. At 100%, the agent auto-pauses. No surprises. Cost accuracy is down to the cent — we recalculate from raw token counts, not rounded estimates.

### 5. Suppression — no repeat emails

Every finding an agent sends is tracked with:
- The metric name and value when it was sent
- A cooldown period (default 7 days)
- A change threshold (default 10%)

The agent won't resend "activation is broken" until either the cooldown expires **and** the metric has changed meaningfully, or you manually clear the suppression.

> **Example:** Agent sends "activation rate is 0%" on Monday. The finding is logged with metric: `activation_rate`, value: `0`, cooldown: `7d`, threshold: `10%`. On Tuesday, activation is still 0% — suppressed. On Thursday, activation hits 12% because you shipped the assessment onboarding — the agent sends a new finding: "activation jumped from 0% to 12% after onboarding change."

This is the difference between an agent that's useful and one that gets ignored.

### 6. Escalation protocol

When an agent encounters something it can't handle:
1. **Agent** flags the issue in the task output
2. **Oracle** detects the flag during fleet health check
3. **WhatsApp alert** sent to the operator with context
4. **Human** intervenes — responds via WhatsApp or dashboard

Every tier has a response expectation. Agent: immediate. Oracle: within 15 minutes (health check interval). Operator: within 4 hours during business hours.

### 7. What the client sees

Nothing. No dashboard. No login. No app to learn.

The client gets emails from their agent. They reply when they want. They get a billing portal with a magic link if they need to update payment. That's it.

The agent is a team member that shows up in their inbox. Not another SaaS tool they have to check.

---

## What this means for McQuizzy

You'd get a dedicated agent (let's call it **Quiz** — `quiz@ambitt.agency`) that:
- Knows your product, your users, your metrics
- Sends you a weekly brief: traffic, signups, activation funnel, what's broken
- Won't repeat the same finding unless the metric actually changes
- Replies when you have questions
- Escalates what it can't handle

### Pricing

- **Month 1:** Setup + learning period — $X (agent trains on your business, brand voice, SOPs)
- **Month 2+:** Flat monthly retainer — $Y/mo
- **Minimum commitment:** 3 months (the agent needs time to prove value through outcome tracking)
- After 3 months: cancel anytime with 30 days notice

The 3-month minimum exists because outcome tracking at 7, 30, and 90 days is how we prove the agent is working. If you cancel in month 1, neither of us knows if it was valuable.

---

## What's in v1 vs. v2

We're honest about what's built and battle-tested vs. what's coming.

### v1 (what you get at launch)
- Oracle orchestration + fleet monitoring
- Persistent agent memory
- 2-way email conversations
- Budget enforcement with auto-pause
- Finding suppression (no repeat emails)
- Operator dashboard with full visibility
- WhatsApp alerts and approvals
- Escalation protocol

### v2 (after 3 clients prove core value)
- Multi-model routing (Claude + Gemini + GPT-4o) — added when we have data showing which tasks benefit from which model
- Outcome tracking at 7/30/90 days — currently logging baselines, measurement automation coming
- Prompt versioning and rollback — so if a client says "the agent was better last week," we can diff exactly what changed
- Self-improvement auto-deploy (with approval gate)

---

## How it's built (for the technical reader)

- **Runtime:** Node.js on Railway, Postgres on Supabase
- **ORM:** Prisma with 12 tables (clients, agents, tasks, recommendations, outcomes, conversations, suppressions, API usage, credentials, performance signals, oracle actions, billing events)
- **Auth:** Supabase Auth (magic link for clients, admin-only for ops dashboard)
- **Email:** Resend with reply-to webhooks for 2-way conversation
- **WhatsApp:** Twilio Business API for operator alerts and approvals
- **Billing:** Stripe with subscription lifecycle tied to agent lifecycle
- **Dashboard:** Next.js 16 + shadcn/ui (operator-only, clients never see it)
- **CLI:** Oracle CLI for fleet management from terminal
- **Isolation:** Every agent is scoped to a single client. Memory, conversations, credentials, and suppressions are all keyed by clientId + agentId. No cross-tenant data leakage by design — enforced at the schema level with composite unique constraints and cascading deletes.

---

## Why you should trust this

I built McQuizzy. I ran 11 agents on it. I hit every problem described in this document:
- Agents that repeated the same finding daily until I tuned them out
- No memory across runs — agents that forgot what they recommended yesterday
- No cost control — one bad loop burned through API budget
- No escalation — agents that failed silently

Then I built the fixes. Ambitt Agents is the infrastructure I wish I had before I deployed those 11 agents.

I'm not pitching theory. I'm pitching the system I built to solve my own problems, now offered as a service.

---

## Next step

30-minute call. I ask about McQuizzy's metrics, goals, and what you wish you had time to look at every week. I brief the agent. Oracle scaffolds it. You approve. It starts learning.

First delivery within 7 days.

**Kyle Kufuor**
kyle@ambitt.agency
