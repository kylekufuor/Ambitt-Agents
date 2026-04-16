# SCHEMA.md — Ambitt Agents Database
Version: 1.0
Database: Postgres on Railway
ORM: Prisma
Last updated: March 2026

---

## Core tables

### clients

model Client {
  id                    String    @id @default(cuid())
  email                 String    @unique
  businessName          String
  industry              String
  businessGoal          String
  brandVoice            String    @db.Text
  preferredChannel      String    // "email" | "whatsapp" | "both"
  whatsappNumber        String?

  // Onboarding
  onboardingCompletedAt DateTime?
  northStarMetric       String?   // client's stated priority metric
  agentGoal             String?   @db.Text // what success looks like in 90 days
  createdAt             DateTime  @default(now())

  // Billing
  stripeCustomerId      String    @unique
  billingEmail          String
  billingStatus         String    @default("active") // "active" | "paused" | "cancelled"
  pausedAt              DateTime?
  cancelledAt           DateTime?

  // Relationships
  agents                Agent[]
  tasks                 Task[]
  recommendations       Recommendation[]
  outcomes              Outcome[]
  credentials           Credential[]
  conversationMessages  ConversationMessage[]

  @@index([stripeCustomerId])
  @@index([billingStatus])
}

---

### agents

model Agent {
  id                    String    @id @default(cuid())
  clientId              String
  client                Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)

  // Identity
  name                  String
  email                 String    @unique
  personality           String    @db.Text
  purpose               String    @db.Text
  agentType             String    // capability type — see Agent Types below

  // Configuration
  tools                 String[]
  schedule              String    // cron format
  autonomyLevel         String    @default("advisory") // "advisory" | "autonomous"
  clientNorthStar       String?   // client's configured north star metric for this agent

  // Model routing
  primaryModel          String    @default("claude-sonnet-4-6")
  analyticsModel        String    @default("gemini")
  creativeModel         String    @default("gpt-4o")

  // Status
  status                String    @default("pending_approval")
  // "pending_approval" | "active" | "paused" | "killed"
  approvedAt            DateTime?
  lastRunAt             DateTime?
  nextScheduledRun      DateTime?

  // Billing
  stripeSubscriptionId  String?
  setupFeeInvoiceId     String?
  monthlyRetainerCents  Int
  setupFeeCents         Int
  historyTier           String    @default("standard") // "standard" | "extended"

  // Memory
  clientMemoryObject    String    @db.Text // JSON — permanent, never expires
  lastMemoryUpdateAt    DateTime?

  // Performance
  totalTasksCompleted   Int       @default(0)
  totalRecommendations  Int       @default(0)
  approvalRate          Float     @default(0)
  implementationRate    Float     @default(0)

  // Relationships
  tasks                 Task[]
  recommendations       Recommendation[]
  outcomes              Outcome[]
  conversationMessages  ConversationMessage[]
  performanceSignals    PerformanceSignal[]
  apiUsage              ApiUsage[]

  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([clientId])
  @@index([clientId, agentType])
  @@index([status])
  @@index([agentType])
}

Note: Multiple agents of the same type per client are allowed. A client can hire two "content" agents with different names and focus areas.

### Agent Types

| Type | Capability | Example agents |
|------|-----------|---------------|
| `analytics` | Metrics, dashboards, funnel analysis, PostHog/GA | Priya, Lens |
| `content` | Content strategy, writing, blog posts, question banks | Quinn, Marley, Vibe |
| `marketing` | Growth campaigns, channels, SEO, social | Rebecca, Scout |
| `sales` | Outreach, pipeline, B2B, lead qualification | Dexter |
| `engagement` | User retention, onboarding, student success | Sage, Pulse |
| `support` | Customer support, tickets, FAQs | Cleo |
| `research` | Market research, competitive analysis, career guidance | Cindy |
| `design` | UI audits, brand consistency, accessibility | Nova |
| `ops` | DevOps, reliability, platform health, monitoring | Rex |
| `reputation` | Reviews, social proof, brand monitoring | Pulse |
| `custom` | Catch-all for agent types that don't fit above | — |

Types are capability tags, not unique slots. The agent's name, personality, and purpose are the custom layer on top of the type.

---

### tasks

model Task {
  id                    String    @id @default(cuid())
  agentId               String
  agent                 Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  clientId              String
  client                Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)

  taskType              String
  // "analysis" | "lead_qualification" | "script_generation" | "review_monitoring"
  // "trend_detection" | "outreach" | "reporting" | "reply_handling"
  description           String    @db.Text

  // Execution
  status                String    @default("pending")
  // "pending" | "executing" | "completed" | "failed"
  executedAt            DateTime?
  completedAt           DateTime?
  errorMessage          String?   @db.Text
  retryCount            Int       @default(0)

  // Output — logged to DB before sending to client
  rawOutput             String    @db.Text
  emailSentAt           DateTime?
  whatsappSentAt        DateTime?

  // Relationships
  recommendations       Recommendation[]

  createdAt             DateTime  @default(now())

  @@index([agentId])
  @@index([clientId])
  @@index([status])
  @@index([taskType])
}

---

### recommendations

model Recommendation {
  id                    String    @id @default(cuid())
  agentId               String
  agent                 Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  clientId              String
  client                Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)
  taskId                String
  task                  Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)

  // What was recommended
  title                 String
  description           String    @db.Text
  actionItems           String[]

  // Expected outcome — for defensible metrics
  expectedMetric        String
  // "conversion_rate" | "follower_growth" | "review_sentiment" | "review_volume"
  // "qualified_leads" | "booking_rate" | "activation_rate" | "mrr" | "churn_rate"
  baselineValue         Float
  expectedDirection     String    // "up" | "down"
  expectedChangePct     Float?

  // Implementation
  implementationMode    String    @default("advisory") // "advisory" | "autonomous"
  autonomouslyExecuted  Boolean   @default(false)
  autonomousActionLog   String?   @db.Text // what the agent did if autonomous

  // Client action
  clientAction          String    @default("pending")
  // "pending" | "implemented" | "ignored" | "in_progress" | "rejected"
  clientActionAt        DateTime?
  clientNotes           String?   @db.Text

  // Verification
  verificationScheduled DateTime? // 48 hours after implementation
  verifiedAt            DateTime?
  verificationMethod    String?   // "automated_check" | "client_confirmation" | "metric_check"
  verificationResult    Boolean?  // did the metric actually move?
  verificationNotes     String?   @db.Text

  // Relationships
  outcomes              Outcome[]

  sentAt                DateTime  @default(now())

  @@index([agentId])
  @@index([clientId])
  @@index([clientAction])
  @@index([expectedMetric])
  @@index([implementationMode])
}

---

### outcomes

model Outcome {
  id                    String    @id @default(cuid())
  agentId               String
  agent                 Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  clientId              String
  client                Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)
  recommendationId      String
  recommendation        Recommendation @relation(fields: [recommendationId], references: [id], onDelete: Cascade)

  // Metric
  metric                String
  baselineValue         Float
  measuredValue         Float
  changeAmount          Float     // measuredValue - baselineValue
  changePercent         Float     // (changeAmount / baselineValue) * 100

  // Measurement
  measuredAt            DateTime
  measurementWindow     String    // "7_day" | "30_day" | "90_day"
  measurementMethod     String    // "posthog" | "tiktok_api" | "google_reviews" | "manual"
  toolUsed              String?
  rawData               String?   @db.Text // JSON of source data

  // Confidence
  confidenceLevel       String    @default("medium") // "low" | "medium" | "high"
  implementationVerified Boolean  @default(false)
  notes                 String?   @db.Text

  createdAt             DateTime  @default(now())

  @@index([recommendationId])
  @@index([metric])
  @@index([measurementWindow])
  @@index([agentId])
  @@index([clientId])
}

---

### conversationMessages

model ConversationMessage {
  id                    String    @id @default(cuid())
  agentId               String
  agent                 Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  clientId              String
  client                Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)

  role                  String    // "agent" | "client"
  content               String    @db.Text
  channel               String    // "email" | "whatsapp"

  // Threading
  threadId              String
  inReplyTo             String?

  // Rolling 3-month window
  archivedAt            DateTime? // set when > 90 days old

  createdAt             DateTime  @default(now())

  @@index([agentId])
  @@index([clientId])
  @@index([threadId])
  @@index([archivedAt])
}

---

### performanceSignals

model PerformanceSignal {
  id                    String    @id @default(cuid())
  agentId               String
  agent                 Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)

  signalType            String
  // "approved" | "rejected" | "edited" | "ignored" | "praised" | "questioned"
  outputSummary         String    @db.Text // anonymized summary of agent output
  clientAction          String    @db.Text // what client did

  // Fleet-wide learning — anonymized
  agentType             String    // for aggregation across all agents of this type
  anonymized            Boolean   @default(true) // no client PII ever

  createdAt             DateTime  @default(now())

  @@index([agentId])
  @@index([agentType])
  @@index([signalType])
}

---

### credentials

model Credential {
  id                    String    @id @default(cuid())
  clientId              String
  client                Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)

  toolName              String    // "posthog" | "gmail" | "tiktok" | "stripe" | "quickbooks" etc
  oauthToken            String?   @db.Text // encrypted at application level
  apiKey                String?   @db.Text // encrypted at application level
  refreshToken          String?   @db.Text // encrypted at application level
  expiresAt             DateTime?

  connectedAt           DateTime  @default(now())
  lastUsedAt            DateTime?
  status                String    @default("active") // "active" | "expired" | "revoked"

  @@unique([clientId, toolName])
  @@index([clientId])
  @@index([status])
}

---

### apiUsage

**Note:** `prisma/schema.prisma` is the authoritative schema — this doc is reference. Run `npm run db:push` after any schema change.

model ApiUsage {
  id                    String    @id @default(cuid())
  agentId               String
  agent                 Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)

  model                 String    // e.g. "claude-opus-4-7" | "claude-sonnet-4-6" | "claude-haiku-4-5-20251001" | "gemini" | "gpt-4o"
  inputTokens           Int       // uncached input tokens only
  outputTokens          Int
  totalTokens           Int
  cacheCreationTokens   Int       @default(0)  // billed at 1.25× base input rate
  cacheReadTokens       Int       @default(0)  // billed at 0.10× base input rate
  toolErrorCount        Int       @default(0)  // failed tool calls during this run (error-rate metric)
  isPrimaryRun          Boolean   @default(true) // false on Haiku row when Sonnet also wrote (triage routing) — prevents run-count doubling
  costInCents           Int                   // authoritative — computed at write time

  taskType              String
  taskId                String?

  createdAt             DateTime  @default(now())

  @@index([agentId])
  @@index([model])
  @@index([createdAt])
}

Triage routing writes two rows per run (Haiku + Sonnet). Run-count queries should filter `isPrimaryRun: true` to count logical runs. Cost / token queries should sum all rows.

---

### scheduledEmail

Onboarding-checkpoint queue. Rows are enqueued in `approveAgent` for T+3 / T+7 / T+14. The hourly `processDueCheckpoints` cron picks up due rows, generates AI body via `oracle/onboarding-content.ts`, sends via `sendEmail`, marks `sent` / `failed`. Cancelled on agent pause / reject / kill.

model ScheduledEmail {
  id                    String    @id @default(cuid())
  agentId               String
  agent                 Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  clientId              String
  client                Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)

  kind                  String    // "checkin_3day" | "highlight_7day" | "feedback_14day"
  scheduledAt           DateTime
  status                String    @default("pending") // pending | sent | cancelled | failed
  sentAt                DateTime?
  errorMessage          String?   @db.Text

  createdAt             DateTime  @default(now())

  @@index([status, scheduledAt])
  @@index([agentId])
  @@index([clientId])
}

---

### overageEvent

One row per interaction past the tier's `interactionLimit`. Grouped by `billingCycleMonth` ("YYYY-MM") for end-of-month Stripe invoicing (invoicing cron NOT yet wired).

model OverageEvent {
  id                    String    @id @default(cuid())
  clientId              String
  client                Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)
  agentId               String
  agent                 Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)

  unitCostCents         Int       // snapshot of tier's overageRateCents at time of event
  billingCycleMonth     String    // "YYYY-MM"
  invoicedAt            DateTime? // set when rolled up into a Stripe invoice
  createdAt             DateTime  @default(now())

  @@index([clientId, billingCycleMonth])
  @@index([agentId])
  @@index([invoicedAt])
}

---

### Fields added to existing models (see `prisma/schema.prisma` for full current state)

**Client** — added:
- `preferredName: String?` — what the agent calls the client in emails (e.g. "Kyle" even if contactName is "Kyle Kufuor")
- `overageEnabled: Boolean @default(false)` — DEAD COLUMN. Overage is always on now; nothing reads this. Safe to drop in a future migration.
- `overageRateCents: Int @default(10)` — DEAD COLUMN. Overage rate comes from the tier config (`getOverageRate(tier)`), not the client. Safe to drop.

**Agent** — added:
- `overageCount: Int @default(0)` — extra interactions past the limit, current cycle. Reset alongside `interactionCount` on monthly cycle rollover.

---

### stripeEvents

model StripeEvent {
  id                    String    @id // Stripe event ID
  type                  String    // "customer.subscription.updated" etc
  data                  String    @db.Text // full event JSON
  processed             Boolean   @default(false)
  processedAt           DateTime?

  createdAt             DateTime  @default(now())

  @@index([type])
  @@index([processed])
}

---

### suppressions

model Suppression {
  id                    String    @id @default(cuid())
  agentId               String
  agent                 Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  clientId              String
  client                Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)

  // What was suppressed
  findingKey            String    // e.g. "activation_broken", "low_traffic", "signup_drop"
  findingDescription    String    @db.Text
  metricName            String    // the metric this finding relates to
  metricValueAtSend     Float     // the value when the finding was last sent

  // When to unsuppress
  cooldownDays          Int       @default(7)   // minimum days before resending
  changeThresholdPct    Float     @default(10)  // resend if metric changes by this %

  // Tracking
  lastSentAt            DateTime
  suppressUntil         DateTime  // computed: lastSentAt + cooldownDays
  sendCount             Int       @default(1)   // how many times this finding has been sent

  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@unique([agentId, clientId, findingKey])
  @@index([agentId])
  @@index([clientId])
  @@index([suppressUntil])
}

Usage: Before sending any finding, agent checks:
1. Is there a suppression for this findingKey + agent + client?
2. If yes, is suppressUntil still in the future?
3. If still suppressed, has the metric changed by more than changeThresholdPct from metricValueAtSend?
4. If metric changed enough → unsuppress and send. Otherwise → skip.
5. After sending, upsert the suppression with new lastSentAt, suppressUntil, metricValueAtSend, and increment sendCount.

---

### oracleActions

model OracleAction {
  id                    String    @id @default(cuid())
  actionType            String
  // "scaffold_agent" | "kill_agent" | "fleet_health_check" | "improvement_cycle"
  // "approval_request" | "retry_agent" | "alert_kyle"
  description           String    @db.Text
  agentId               String?
  clientId              String?
  status                String    @default("completed") // "completed" | "failed" | "pending"
  result                String?   @db.Text

  createdAt             DateTime  @default(now())

  @@index([actionType])
  @@index([agentId])
  @@index([createdAt])
}

---

## Relationships summary

- Client has many Agents (one per agent type)
- Agent has many Tasks
- Task has many Recommendations
- Recommendation has many Outcomes (7-day, 30-day, 90-day)
- Agent tracks PerformanceSignals for self-improvement
- Client stores Credentials for tool access
- Agent logs ApiUsage for cost tracking
- Agent maintains ConversationMessages (rolling 3-month)
- Agent tracks Suppressions to avoid repeat findings
- Oracle logs all actions in OracleActions

---

## Key aggregations for dashboard

Total MRR:
SELECT SUM(monthlyRetainerCents) / 100 as mrr
FROM Agent
WHERE status = 'active'

Daily API cost by model:
SELECT model, SUM(costInCents) / 100 as costDollars
FROM ApiUsage
WHERE createdAt > NOW() - INTERVAL '1 day'
GROUP BY model

Agent implementation rate:
SELECT agentId,
  SUM(CASE WHEN clientAction = 'implemented' THEN 1 ELSE 0 END)::float /
  COUNT(*)::float as implementationRate
FROM Recommendation
GROUP BY agentId

Defensible outcome stats by agent type:
SELECT
  a.agentType,
  AVG(o.changePercent) as avgImprovement,
  COUNT(*) as sampleSize,
  MIN(r.implementationMode) as mode
FROM Outcome o
JOIN Recommendation r ON o.recommendationId = r.id
JOIN Agent a ON r.agentId = a.id
WHERE o.implementationVerified = true
AND o.measurementWindow = '30_day'
GROUP BY a.agentType

---

## Encryption

Fields encrypted at application level before storing:
- Credential.oauthToken
- Credential.apiKey
- Credential.refreshToken
- Agent.clientMemoryObject

Use node:crypto (AES-256-GCM) with APP_ENCRYPTION_KEY env variable.
Decrypt on retrieval. Never log decrypted values.

---

## Data retention

- Conversation history: rolling 90 days (older messages: archivedAt set, kept for 1 year then deleted)
- API usage logs: 90 days
- Performance signals: permanent (feeds self-improvement)
- Outcomes: permanent (defensible stats)
- Recommendations: permanent (audit trail)
- Credentials: until revoked or expired
- Stripe events: 30 days after processing
- Oracle actions: 6 months

---

## Defensive design principles

1. Every recommendation tracked with baseline, expected, and measured values
2. Implementation status always explicit — never assumed
3. Verification method always logged
4. Confidence level on every outcome
5. Sample size always stored with stats
6. Anonymized signals only for fleet-wide learning — no client PII crosses agent boundaries
7. Credentials never logged in plaintext — encrypted before write, decrypted on read
8. Every agent task logs output to DB before sending to client — no lost outputs
9. Schema designed to support Kubernetes migration — no Railway-specific dependencies in data model
