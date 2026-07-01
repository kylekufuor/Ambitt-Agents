import "dotenv/config";
import express, { Request, Response } from "express";
import multer from "multer";
import { scaffoldAgent, approveAgent, rejectAgent, ApprovalGuardError } from "./scaffold.js";
import { checkFleetHealth, retryFailedAgent } from "./monitor.js";
import { runImprovementCycle } from "./improve.js";
// import { routeTask } from "./router.js"; // TODO: re-enable when scheduled tasks are built
import { handleStripeWebhook } from "./billing.js";
import { onboardClient } from "./onboard.js";
import prisma from "../shared/db.js";
import logger from "../shared/logger.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB max

const app = express();

// CORS — allow dashboard to call Oracle APIs
app.use((req: Request, res: Response, next: () => void) => {
  const origin = req.headers.origin;
  // Allow Railway dashboard domains and localhost
  if (origin && (
    origin.includes("railway.app") ||
    origin.includes("ambitt.agency") ||
    origin.includes("localhost")
  )) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// Stripe webhook needs raw body — must come before express.json()
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
  try {
    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    await handleStripeWebhook(req.body.toString(), signature);
    res.json({ received: true });
  } catch (error) {
    logger.error("Stripe webhook failed", { error });
    res.status(400).json({ error: "Webhook processing failed" });
  }
});

// ---------------------------------------------------------------------------
// Resend email-events webhook
// ---------------------------------------------------------------------------
//
// Resend pushes lifecycle events for every email we send (sent → delivered →
// bounced/complained/...). We close the silent-failure loop by updating each
// EmailSend audit row (matched by data.email_id ↔ EmailSend.resendMessageId)
// with the new status + timestamp + bounce reason.
//
// Verified via Svix signing — Resend uses Svix under the hood. Secret lives
// in RESEND_WEBHOOK_SECRET (set in Railway after adding the webhook URL in
// the Resend dashboard at https://resend.com/webhooks).
//
// MUST live above express.json() because Svix verification requires the raw
// body bytes byte-for-byte — JSON-parse and re-stringify won't reproduce the
// exact signed payload.
app.post(
  "/webhooks/email-events",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    try {
      const secret = process.env.RESEND_WEBHOOK_SECRET;
      if (!secret) {
        // Don't 500 — just log and 200 so Resend doesn't flood retries while
        // we're still configuring. Production should always have this set.
        logger.warn("email-events webhook: RESEND_WEBHOOK_SECRET not set, ignoring");
        res.json({ received: true, ignored: "secret_not_configured" });
        return;
      }

      const headers = {
        "svix-id": req.headers["svix-id"] as string,
        "svix-timestamp": req.headers["svix-timestamp"] as string,
        "svix-signature": req.headers["svix-signature"] as string,
      };

      if (!headers["svix-id"] || !headers["svix-timestamp"] || !headers["svix-signature"]) {
        res.status(400).json({ error: "Missing svix-* headers" });
        return;
      }

      const rawBody = req.body.toString();
      const { Webhook } = await import("svix");
      const wh = new Webhook(secret);
      let event: { type: string; data: Record<string, unknown> };
      try {
        event = wh.verify(rawBody, headers) as { type: string; data: Record<string, unknown> };
      } catch (verifyErr) {
        logger.warn("email-events webhook: signature verification failed", {
          err: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
        });
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      const emailId = typeof event.data.email_id === "string" ? event.data.email_id : null;
      if (!emailId) {
        // Resend always sends email_id; if we ever see one without, log and
        // ack so they don't retry. Not an error from Resend's perspective.
        logger.warn("email-events webhook: payload had no data.email_id", { type: event.type });
        res.json({ received: true, ignored: "no_email_id" });
        return;
      }

      // Map Resend event types → EmailSend.status + the timestamp column we
      // stamp. Engagement events (opened/clicked) are accepted but don't
      // change status — they could be wired into a separate engagement
      // table later if useful.
      const now = new Date();
      const update: Record<string, unknown> = {};
      switch (event.type) {
        case "email.sent":
          update.status = "sent";
          update.sentAt = now;
          break;
        case "email.delivered":
          update.status = "delivered";
          update.deliveredAt = now;
          break;
        case "email.bounced":
          update.status = "bounced";
          update.bouncedAt = now;
          update.bounceReason =
            typeof event.data.bounce === "object" && event.data.bounce !== null
              ? JSON.stringify(event.data.bounce)
              : typeof event.data.bounce === "string"
                ? event.data.bounce
                : "Resend reported bounce (no reason in payload)";
          break;
        case "email.complained":
          update.status = "complained";
          update.complainedAt = now;
          break;
        case "email.delivery_delayed":
          update.status = "delivery_delayed";
          update.delayedAt = now;
          break;
        case "email.opened":
        case "email.clicked":
          // Engagement events — ignore for status tracking. ACK 200 so Resend
          // doesn't retry.
          logger.info("email-events: engagement event (ignored)", { type: event.type, emailId });
          res.json({ received: true, ignored: "engagement_event" });
          return;
        default:
          logger.info("email-events: unhandled event type (ignored)", { type: event.type, emailId });
          res.json({ received: true, ignored: "unhandled_type" });
          return;
      }

      // Fetch first so we have the linkage (agentId/prospectId/clientId/
      // emailType/to/subject) — needed for the bounce alert below. Update by
      // unique resendMessageId. If no row matches (e.g. event for an email
      // sent before this audit log was wired), log and ack — don't create a
      // row just from the webhook (we'd be missing agentId etc).
      const existing = await prisma.emailSend.findUnique({
        where: { resendMessageId: emailId },
      });

      if (!existing) {
        logger.info("email-events: no matching EmailSend row (likely pre-audit-log)", {
          type: event.type,
          emailId,
        });
        res.json({ received: true, matched: false });
        return;
      }

      await prisma.emailSend.update({
        where: { id: existing.id },
        data: update,
      });

      logger.info("EmailSend status updated from webhook", {
        type: event.type,
        emailId,
        newStatus: update.status,
        emailSendId: existing.id,
      });

      // Bounce / complaint alert — fire-and-forget. These are revenue events
      // in a sales funnel: a proposal/quote that bounces means the prospect
      // never saw it. WhatsApp + ops email so Kyle finds out within seconds,
      // not when the prospect "complains" 3 days later (or never).
      if (event.type === "email.bounced" || event.type === "email.complained") {
        // Don't await — webhook should return 200 fast; alerts run after.
        notifyEmailDeliveryFailure({
          eventType: event.type,
          emailSend: existing,
          bounceReason: typeof update.bounceReason === "string" ? update.bounceReason : null,
        }).catch((err) => {
          logger.warn("Email delivery-failure alert failed (continuing)", {
            err: err instanceof Error ? err.message : String(err),
            emailSendId: existing.id,
          });
        });
      }

      res.json({ received: true });
    } catch (error) {
      logger.error("email-events webhook failed", {
        err: error instanceof Error ? error.message : String(error),
      });
      // 500 so Resend retries — likely a transient DB issue.
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

// Raise body limit — scaffold endpoint accepts base64-encoded SOP uploads
app.use(express.json({ limit: "30mb" }));

function param(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
}

// Extracts the bare email from a "Name <email@x.com>" header, or returns the
// trimmed lowercase address if no angle brackets. Returns null if the header
// can't be parsed.
function parseEmailFromHeader(fromHeader: string): string | null {
  if (!fromHeader) return null;
  const angle = fromHeader.match(/<([^>]+)>/);
  const candidate = angle ? angle[1] : fromHeader;
  const trimmed = candidate.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

// Build the platform-operator allowlist from env. For now this is a single
// value (OPERATOR_EMAIL) — the one address that can cold-email Atlas to
// drive ops-mode actions. Returning a Set keeps the shape ready for a
// comma-separated multi-operator value later without touching callers.
function getOperatorAllowlist(): Set<string> {
  const raw = (process.env.OPERATOR_EMAIL ?? "").toLowerCase().trim();
  return new Set(raw.length > 0 ? [raw] : []);
}

// Inbound-email authorization. Different rules by routing path:
//
//   "direct"  — sender emailed agent's primary address ({slug}@ambitt.agency)
//                cold. Only OWNING CLIENT + PLATFORM OPERATORS are allowed.
//                Prospects emailing cold get silently dropped — they're
//                expected to use their dedicated /onboard/[token] flow, not
//                initiate conversations with Atlas out of the blue.
//
//   "reply"   — sender replied to a thread the agent started (Reply-To was
//                reply-{agentId}@ambitt.agency). OWNING CLIENT + OPERATORS +
//                ACTIVE PROSPECTS are allowed. The reply gives the agent the
//                conversation history it needs to respond meaningfully.
//
// Anything else: 200-ignored.
async function checkInboundAuth(
  agentId: string,
  fromHeader: string,
  routingPath: "reply" | "direct"
): Promise<
  | { ok: true; senderType: "client" | "prospect" | "platform_operator"; prospectId?: string }
  | { ok: false; reason: string }
> {
  const senderEmail = parseEmailFromHeader(fromHeader);
  if (!senderEmail) return { ok: false, reason: "Cannot parse sender" };

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { acceptFromProspects: true, client: { select: { email: true } } },
  });
  if (!agent) return { ok: false, reason: "Agent not found" };

  // Platform operators — allowed on every platform agent regardless of path.
  // Checked first because operator emails are the common case for Atlas
  // and the allowlist lookup is cheap.
  const operators = getOperatorAllowlist();
  if (operators.has(senderEmail) && agent.acceptFromProspects) {
    return { ok: true, senderType: "platform_operator" };
  }

  // Owning client — allowed on every agent regardless of path.
  if (senderEmail === agent.client.email.toLowerCase()) {
    return { ok: true, senderType: "client" };
  }

  // Prospect — ONLY on the reply path. A prospect cold-emailing the agent's
  // primary address is rejected (they should be using their /onboard/[token]
  // flow). When they reply to a teaser email Atlas sent them, the Reply-To is
  // reply-{atlasId}@ambitt.agency → routingPath is "reply" → accepted.
  if (routingPath === "reply" && agent.acceptFromProspects) {
    const prospect = await prisma.prospect.findUnique({
      where: { email: senderEmail },
      select: { id: true, status: true },
    });
    if (prospect && prospect.status !== "ghosted" && prospect.status !== "archived") {
      return { ok: true, senderType: "prospect", prospectId: prospect.id };
    }
  }

  return { ok: false, reason: "Sender not authorized for this agent" };
}

// ---------------------------------------------------------------------------
// Standard endpoints
// ---------------------------------------------------------------------------

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "oracle", timestamp: new Date().toISOString() });
});

// On-demand integration health check — smoke-tests every vendor API + flags SDK
// version drift. Runs weekly on a cron too (see scheduler.ts); this lets an
// operator pull it any time. Returns 200 with results even when unhealthy.
app.get("/health/integrations", async (_req: Request, res: Response) => {
  try {
    const { runIntegrationHealthcheck, formatHealthReport } = await import(
      "../shared/health/integration-healthcheck.js"
    );
    const results = await runIntegrationHealthcheck();
    const { hasProblems, message } = formatHealthReport(results);
    res.json({ hasProblems, summary: message, results });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Composio app catalog — public-ish (no auth), backed by in-memory cache so
// the onboarding form can pull it cheaply on every page load. Composio
// catalog rarely changes; 12-hour TTL is safe.
let composioCatalogCache: { items: Array<{ name: string; key: string; categories: string[] }>; fetchedAt: number } | null = null;
const COMPOSIO_CATALOG_TTL_MS = 12 * 60 * 60 * 1000;

app.get("/composio/catalog", async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (!composioCatalogCache || now - composioCatalogCache.fetchedAt > COMPOSIO_CATALOG_TTL_MS) {
      const { listApps } = await import("../shared/mcp/composio.js");
      const apps = await listApps();
      composioCatalogCache = {
        items: apps.map((a) => ({ name: a.name, key: a.key, categories: a.categories ?? [] })),
        fetchedAt: now,
      };
      logger.info("Composio catalog refreshed", { count: composioCatalogCache.items.length });
    }
    res.json({ items: composioCatalogCache.items, fetchedAt: composioCatalogCache.fetchedAt });
  } catch (err) {
    logger.error("Composio catalog fetch failed", { error: err });
    res.status(500).json({ items: [], error: err instanceof Error ? err.message : "fetch failed" });
  }
});

// Fleet status
app.get("/fleet", async (_req: Request, res: Response) => {
  try {
    const status = await checkFleetHealth();
    res.json(status);
  } catch (error) {
    logger.error("Fleet health check failed", { error });
    res.status(500).json({ error: "Fleet health check failed" });
  }
});

// Scaffold a new agent
app.post("/agents/scaffold", async (req: Request, res: Response) => {
  try {
    const agentId = await scaffoldAgent(req.body);
    res.json({ agentId, status: "pending_approval" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Agent scaffold failed", { error: message, stack: error instanceof Error ? error.stack : undefined });
    res.status(500).json({ error: `Scaffold failed: ${message}` });
  }
});

// Approve agent (called from dashboard or WhatsApp webhook)
app.post("/agents/:id/approve", async (req: Request, res: Response) => {
  const agentId = param(req, "id");
  try {
    const force = (req.body && typeof req.body === "object" && req.body.force === true) || false;
    await approveAgent(agentId, { force });
    res.json({ status: "approved", forced: force });
  } catch (error) {
    if (error instanceof ApprovalGuardError) {
      // Approval guard refused — operator-friendly 409 with the reason.
      // Dashboard can show this inline + offer a "Force approve anyway" button.
      logger.info("Approval guarded — no tools connected", { agentId });
      res.status(409).json({
        error: error.message,
        reason: error.reason,
        canForce: true,
      });
      return;
    }
    logger.error("Agent approval failed", { error, agentId });
    res.status(500).json({ error: "Approval failed" });
  }
});

// Operator-initiated "let's get your tools connected" email to the client.
// Wraps the dormant renderToolsHandoffEmail template (intentionally not
// auto-fired at Convert — see commit fad7fd4 for the "no premature emails"
// rule). The operator clicks this button on the agent page when they're
// ready to invite the client to OAuth their tools.
app.post("/agents/:id/send-tools-invite", async (req: Request, res: Response) => {
  void req;
  const agentId = param(req, "id");
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        client: { select: { email: true, contactName: true } },
      },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const atlas = await prisma.agent.findUnique({
      where: { email: "atlas@ambitt.agency" },
      select: { id: true, name: true, status: true },
    });
    if (!atlas || atlas.status !== "active") {
      res.status(500).json({ error: "Atlas is not seeded or not active" });
      return;
    }

    const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";
    const toolsUrl = `${portalBase}/agents/${agent.id}/tools`;

    // Try to surface the actual tool list from the originating Prospect.prdData
    // if we can find it. Fall back to a generic empty list — the template
    // handles either gracefully.
    let toolsList: Array<{ name: string; source: string }> = [];
    try {
      const prospect = await prisma.prospect.findFirst({
        where: { convertedClientId: agent.clientId },
        select: { prdData: true },
      });
      const prd = prospect?.prdData as { tools?: Array<{ name: string; source: string }> } | null;
      if (prd?.tools && Array.isArray(prd.tools)) {
        toolsList = prd.tools.map((t) => ({ name: t.name, source: t.source }));
      }
    } catch (err) {
      logger.warn("Tools-invite: PRD lookup failed (using empty list)", {
        agentId,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    const firstName = (agent.client.contactName ?? "").split(/\s+/)[0] || "there";

    const { sendEmail } = await import("../shared/email.js");
    await sendEmail({
      agentId: atlas.id,
      agentName: atlas.name,
      to: agent.client.email,
      subject: `Let's get ${agent.name} ready to start`,
      html: renderToolsHandoffEmail({
        firstName,
        agentName: agent.name,
        agentRole: agent.purpose.split(".")[0].slice(0, 80) || "your AI teammate",
        toolsUrl,
        portalBase,
        toolsList,
      }),
      replyToAgentId: atlas.id,
      emailType: "tools_invite",
    });

    await prisma.oracleAction.create({
      data: {
        actionType: "send_tools_invite",
        description: `Tools-invite email sent for agent ${agent.name} to ${agent.client.email}`,
        agentId,
        clientId: agent.clientId,
        status: "completed",
      },
    });

    logger.info("Tools-invite sent", { agentId, to: agent.client.email });
    res.json({ status: "sent", to: agent.client.email });
  } catch (error) {
    logger.error("Tools-invite send failed", {
      agentId,
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Tools-invite send failed" });
  }
});

// Reject agent
app.post("/agents/:id/reject", async (req: Request, res: Response) => {
  try {
    await rejectAgent(param(req, "id"));
    res.json({ status: "rejected" });
  } catch (error) {
    logger.error("Agent rejection failed", { error, agentId: param(req, "id") });
    res.status(500).json({ error: "Rejection failed" });
  }
});

// Pause agent
app.post("/agents/:id/pause", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { unregisterAgent } = await import("./scheduler.js");
    unregisterAgent(id);
    await prisma.agent.update({
      where: { id },
      data: { status: "paused" },
    });
    // Cancel pending onboarding checkpoints — pause means "stop the flow."
    try {
      const { cancelOnboardingCheckpoints } = await import("./scaffold.js");
      await cancelOnboardingCheckpoints(id);
    } catch (err) {
      logger.warn("Failed to cancel checkpoints on pause", { agentId: id, error: err });
    }
    res.json({ status: "paused" });
  } catch (error) {
    logger.error("Agent pause failed", { error, agentId: param(req, "id") });
    res.status(500).json({ error: "Pause failed" });
  }
});

// Resume a paused agent — reactivates status + re-registers schedule
app.post("/agents/:id/resume", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const agent = await prisma.agent.findUnique({
      where: { id },
      select: { status: true, schedule: true },
    });

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    if (agent.status !== "paused") {
      res.status(400).json({ error: `Cannot resume — agent status is '${agent.status}'` });
      return;
    }

    await prisma.agent.update({
      where: { id },
      data: { status: "active" },
    });

    if (agent.schedule && agent.schedule !== "manual") {
      const { registerAgent } = await import("./scheduler.js");
      registerAgent(id, agent.schedule);
    }

    logger.info("Agent resumed", { agentId: id });
    res.json({ status: "active" });
  } catch (error) {
    logger.error("Agent resume failed", { error, agentId: param(req, "id") });
    res.status(500).json({ error: "Resume failed" });
  }
});

// ---------------------------------------------------------------------------
// Dry-run an agent against a scenario
// ---------------------------------------------------------------------------
//
// Operator-facing test path. Body: { scenario: string, label?: string }.
//   - scenario: the message the agent will receive (free-text simulating
//     an inbound email, a Casey reply, a manual trigger from the dashboard).
//   - label: optional grouping label for the resulting DryRunLog rows
//     (e.g. "Casey CRE sourcing — scenario 1"). Stored on each captured row.
//
// REFUSES if agent.dryRun is false. Operator must opt the agent in to
// dry-run mode first (Settings page / SQL). This is intentional: we don't
// want a dashboard accident silently flipping a live agent.
//
// Returns the captured side-effects (DryRunLog rows tagged with this run's
// scenario label) so the dashboard can render them inline.
app.post("/agents/:id/dry-run", async (req: Request, res: Response) => {
  try {
    const agentId = param(req, "id");
    const { scenario, label } = (req.body ?? {}) as { scenario?: string; label?: string };

    if (typeof scenario !== "string" || scenario.trim().length === 0) {
      res.status(400).json({ error: "scenario (string) is required" });
      return;
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, status: true, dryRun: true, clientId: true },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    if (!agent.dryRun) {
      res.status(409).json({
        error: "Agent is not in dry-run mode. Flip Agent.dryRun=true first (Settings → Dry-run, or SQL).",
        agentDryRun: false,
      });
      return;
    }

    // Tag the captures with a scenario label so we can isolate this run's
    // results from prior captures on the same agent.
    const scenarioLabel = (label && label.trim()) || `dryrun:${new Date().toISOString()}`;

    // Wrap the dryRunLog.create call inside our intercepts to attach the
    // scenario label. The cleanest path is a transaction-style around-call
    // override; for v1 we just record the current high-water-mark of
    // captures and return everything written after.
    const before = await prisma.dryRunLog.findFirst({
      where: { agentId },
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true },
    });
    const afterCursor = before?.capturedAt ?? new Date(0);

    const startedAt = new Date();
    const threadId = `dryrun-${agentId}-${Date.now()}`;
    const { processInboundMessage } = await import("../shared/runtime/index.js");

    let runError: string | null = null;
    let runResponse = "";
    let toolsUsed = 0;
    let loopCount = 0;
    try {
      const run = await processInboundMessage({
        agentId,
        userMessage: scenario,
        channel: "chat",
        threadId,
        senderEmail: "operator@dryrun.ambitt.agency",
        billable: false,
      });
      runResponse = run.response;
      toolsUsed = run.toolsUsed.length;
      loopCount = run.loopCount;
    } catch (err) {
      runError = err instanceof Error ? err.message : String(err);
      logger.warn("Dry-run scenario errored mid-loop", {
        agentId,
        scenarioLabel,
        err: runError,
      });
    }

    // Fetch captures created during this run + label them retroactively.
    const captures = await prisma.dryRunLog.findMany({
      where: {
        agentId,
        capturedAt: { gt: afterCursor },
      },
      orderBy: { capturedAt: "asc" },
    });
    if (captures.length > 0) {
      await prisma.dryRunLog.updateMany({
        where: { id: { in: captures.map((c) => c.id) } },
        data: { scenario: scenarioLabel },
      });
    }

    const elapsedMs = Date.now() - startedAt.getTime();
    logger.info("Dry-run completed", {
      agentId,
      scenarioLabel,
      toolsUsed,
      loopCount,
      captureCount: captures.length,
      elapsedMs,
      error: runError,
    });

    res.json({
      status: "completed",
      scenarioLabel,
      response: runResponse,
      error: runError,
      toolsUsed,
      loopCount,
      elapsedMs,
      captures: captures.map((c) => ({
        id: c.id,
        kind: c.kind,
        payload: c.payload,
        scenario: scenarioLabel,
        capturedAt: c.capturedAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Dry-run handler failed", {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Dry-run failed" });
  }
});

// ===========================================================================
// MCP server for Atlas-on-Fable sub-agents (Vera, Story-writer, Builder)
// ===========================================================================
//
// Mounted at /mcp/builder. Atlas references this URL via the
// AMBITT_BUILDER_MCP_URL env var and seeds it as `mcp_servers[0]` on the
// coordinator agent definition. Stateless (no session IDs), so a single
// transport handles every sub-agent's tool call.

app.all("/mcp/builder", async (req: Request, res: Response) => {
  const { handleBuilderMcpRequest } = await import("./mcp-server/builder.js");
  await handleBuilderMcpRequest(req, res);
});

// ===========================================================================
// Builds (Atlas-on-Fable orchestration)
// ===========================================================================
//
// A Build is one Managed-Agents-driven orchestration that turns a quote-
// accepted Prospect into a candidate Agent. Atlas (coordinator) delegates to
// Vera (QA), Story-writer (scenarios), Builder (prompt + tool selection), and
// Tester sub-agents (run scenarios as dry-runs against the candidate). The
// hybrid UX: this populates DryRunLog rows that the existing dry-run page
// renders; "Skip Fable, go manual" hits the legacy Convert+Scaffold path.

// Start a build for a prospect whose quote has been accepted. Fire-and-
// forget: returns immediately with the queued Build row; orchestration runs
// in the background.
app.post("/builds", async (req: Request, res: Response) => {
  try {
    const { prospectId } = (req.body ?? {}) as { prospectId?: string };
    if (typeof prospectId !== "string" || !prospectId) {
      res.status(400).json({ error: "prospectId (string) is required" });
      return;
    }

    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      select: {
        id: true,
        status: true,
        prdData: true,
        prdApprovedAt: true,
        quoteDraft: true,
        quoteAcceptedAt: true,
      },
    });
    if (!prospect) {
      res.status(404).json({ error: "Prospect not found" });
      return;
    }
    if (!prospect.prdData || !prospect.prdApprovedAt) {
      res.status(409).json({ error: "Prospect PRD not approved; cannot start build" });
      return;
    }
    if (!prospect.quoteDraft || !prospect.quoteAcceptedAt) {
      res.status(409).json({ error: "Quote not accepted yet; cannot start build" });
      return;
    }

    // Refuse a duplicate active build for the same prospect.
    const existing = await prisma.build.findFirst({
      where: { prospectId, status: { in: ["queued", "running"] } },
      select: { id: true, status: true, createdAt: true },
    });
    if (existing) {
      res.status(409).json({
        error: "Build already in flight for this prospect",
        existingBuild: existing,
      });
      return;
    }

    const budgetCents = Number(process.env.FABLE_BUILD_BUDGET_CENTS ?? "20000");

    const build = await prisma.build.create({
      data: {
        prospectId,
        status: "queued",
        budgetCents,
      },
    });

    logger.info("Build queued", { buildId: build.id, prospectId });

    // Fire-and-forget kickoff, but only if a slot is open. The minute-cron
    // (drainBuildQueue) picks up queued rows as soon as a slot frees.
    void (async () => {
      try {
        const { kickoffBuild, canStartNewBuild } = await import("./builds/orchestrator.js");
        if (!(await canStartNewBuild())) {
          logger.info("Build held in queue (concurrency cap reached)", {
            buildId: build.id,
          });
          return;
        }
        await kickoffBuild(build.id);
      } catch (err) {
        logger.error("Build kickoff threw outside guard", {
          buildId: build.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    res.status(202).json({
      id: build.id,
      status: build.status,
      budgetCents: build.budgetCents,
      createdAt: build.createdAt.toISOString(),
    });
  } catch (error) {
    logger.error("Build start handler failed", {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Build start failed" });
  }
});

// Poll a build's status. Dashboard /agents/[id]/dry-run page hits this on
// auto-refresh; the page swaps from "building..." spinner to capture list as
// soon as status flips to completed.
app.get("/builds/:id", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const build = await prisma.build.findUnique({
      where: { id },
      include: {
        prospect: { select: { id: true, contactName: true, businessName: true } },
        agent: { select: { id: true, name: true, status: true } },
      },
    });
    if (!build) {
      res.status(404).json({ error: "Build not found" });
      return;
    }
    res.json({
      id: build.id,
      status: build.status,
      prospectId: build.prospectId,
      prospect: build.prospect,
      agentId: build.agentId,
      agent: build.agent,
      sessionId: build.sessionId,
      environmentId: build.environmentId,
      scenarios: build.scenarios,
      veraVerdicts: build.veraVerdicts,
      costCents: build.costCents,
      budgetCents: build.budgetCents,
      failureReason: build.failureReason,
      startedAt: build.startedAt?.toISOString() ?? null,
      completedAt: build.completedAt?.toISOString() ?? null,
      createdAt: build.createdAt.toISOString(),
    });
  } catch (error) {
    logger.error("Build get handler failed", {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Build fetch failed" });
  }
});

// List builds for a prospect (newest first). Powers the dashboard "build
// history" strip on the dry-run page.
app.get("/prospects/:id/builds", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");
    const builds = await prisma.build.findMany({
      where: { prospectId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        agentId: true,
        sessionId: true,
        costCents: true,
        failureReason: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });
    res.json({
      builds: builds.map((b) => ({
        ...b,
        startedAt: b.startedAt?.toISOString() ?? null,
        completedAt: b.completedAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Prospect builds list handler failed", {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Build list failed" });
  }
});

// ===========================================================================
// Improvements (Atlas-Improver weekly self-improvement cycles)
// ===========================================================================

// List improvements for an agent (newest first). Powers the dashboard
// /agents/[id]/improvements page.
app.get("/agents/:id/improvements", async (req: Request, res: Response) => {
  try {
    const agentId = param(req, "id");
    const improvements = await prisma.agentImprovement.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({
      improvements: improvements.map((i) => ({
        id: i.id,
        status: i.status,
        sessionId: i.sessionId,
        proposedPersonality: i.proposedPersonality,
        proposedPurpose: i.proposedPurpose,
        proposedNorthStar: i.proposedNorthStar,
        proposedToolSlugs: i.proposedToolSlugs,
        rationale: i.rationale,
        previousPersonality: i.previousPersonality,
        previousPurpose: i.previousPurpose,
        previousNorthStar: i.previousNorthStar,
        regressionResults: i.regressionResults,
        activitySummary: i.activitySummary,
        reviewedAt: i.reviewedAt?.toISOString() ?? null,
        reviewedNote: i.reviewedNote,
        failureReason: i.failureReason,
        costCents: i.costCents,
        budgetCents: i.budgetCents,
        startedAt: i.startedAt?.toISOString() ?? null,
        completedAt: i.completedAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Improvements list handler failed", { error });
    res.status(500).json({ error: "Improvements list failed" });
  }
});

// Approve a "ready" improvement — ships the proposal to the live Agent row.
// Snapshots prior values into previous* fields so we can revert.
app.post("/improvements/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { note } = (req.body ?? {}) as { note?: string };

    const improvement = await prisma.agentImprovement.findUnique({
      where: { id },
      include: {
        agent: {
          select: { id: true, personality: true, purpose: true, clientNorthStar: true, tools: true },
        },
      },
    });
    if (!improvement) {
      res.status(404).json({ error: "Improvement not found" });
      return;
    }
    if (improvement.status !== "ready") {
      res.status(409).json({ error: `Improvement is ${improvement.status}; cannot ship` });
      return;
    }

    const newPersonality = improvement.proposedPersonality ?? improvement.agent.personality;
    const newPurpose = improvement.proposedPurpose ?? improvement.agent.purpose;
    const newNorthStar = improvement.proposedNorthStar ?? improvement.agent.clientNorthStar;
    const newTools = Array.isArray(improvement.proposedToolSlugs)
      ? (improvement.proposedToolSlugs as string[])
      : improvement.agent.tools;

    await prisma.$transaction([
      prisma.agentImprovement.update({
        where: { id },
        data: {
          status: "shipped",
          reviewedAt: new Date(),
          reviewedNote: note ?? null,
          previousPersonality: improvement.agent.personality,
          previousPurpose: improvement.agent.purpose,
          previousNorthStar: improvement.agent.clientNorthStar,
        },
      }),
      prisma.agent.update({
        where: { id: improvement.agent.id },
        data: {
          personality: newPersonality,
          purpose: newPurpose,
          clientNorthStar: newNorthStar,
          tools: newTools,
        },
      }),
    ]);

    logger.info("Improvement shipped", { improvementId: id, agentId: improvement.agent.id });
    res.json({ ok: true, status: "shipped" });
  } catch (error) {
    logger.error("Improvement approve handler failed", { error });
    res.status(500).json({ error: "Improvement approve failed" });
  }
});

// Reject a "ready" improvement. Captures the reason for future learning.
app.post("/improvements/:id/reject", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { note } = (req.body ?? {}) as { note?: string };

    const improvement = await prisma.agentImprovement.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!improvement) {
      res.status(404).json({ error: "Improvement not found" });
      return;
    }
    if (improvement.status !== "ready") {
      res.status(409).json({ error: `Improvement is ${improvement.status}; cannot reject` });
      return;
    }

    await prisma.agentImprovement.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        reviewedNote: note ?? null,
      },
    });

    res.json({ ok: true, status: "rejected" });
  } catch (error) {
    logger.error("Improvement reject handler failed", { error });
    res.status(500).json({ error: "Improvement reject failed" });
  }
});

// Revert a "shipped" improvement back to the previous prompt. Operator
// escape hatch when an approved change turns out worse than the baseline.
app.post("/improvements/:id/revert", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const improvement = await prisma.agentImprovement.findUnique({
      where: { id },
      include: { agent: { select: { id: true } } },
    });
    if (!improvement) {
      res.status(404).json({ error: "Improvement not found" });
      return;
    }
    if (improvement.status !== "shipped") {
      res.status(409).json({ error: `Improvement is ${improvement.status}; nothing to revert` });
      return;
    }
    if (improvement.previousPersonality === null && improvement.previousPurpose === null) {
      res.status(409).json({ error: "No previous values stored; revert not possible" });
      return;
    }

    await prisma.$transaction([
      prisma.agent.update({
        where: { id: improvement.agent.id },
        data: {
          personality: improvement.previousPersonality ?? undefined,
          purpose: improvement.previousPurpose ?? undefined,
          clientNorthStar: improvement.previousNorthStar ?? undefined,
        },
      }),
      prisma.agentImprovement.update({
        where: { id },
        data: { status: "rejected", reviewedNote: "Reverted by operator after shipping" },
      }),
    ]);

    res.json({ ok: true, status: "reverted" });
  } catch (error) {
    logger.error("Improvement revert handler failed", { error });
    res.status(500).json({ error: "Improvement revert failed" });
  }
});

// Cancel a running build (operator action — e.g. spotted obvious wrong path
// mid-stream). Marks status=cancelled; Phase 2's stream consumer reads this
// to abort sub-agent calls + archive the session.
app.post("/builds/:id/cancel", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const build = await prisma.build.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!build) {
      res.status(404).json({ error: "Build not found" });
      return;
    }
    if (build.status !== "queued" && build.status !== "running") {
      res.status(409).json({ error: `Build is ${build.status}; cannot cancel` });
      return;
    }
    await prisma.build.update({
      where: { id },
      data: { status: "cancelled", completedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (error) {
    logger.error("Build cancel handler failed", {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Build cancel failed" });
  }
});

// Kill agent
app.post("/agents/:id/kill", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { unregisterAgent } = await import("./scheduler.js");
    unregisterAgent(id);
    await prisma.agent.update({
      where: { id },
      data: { status: "killed" },
    });
    try {
      const { cancelOnboardingCheckpoints } = await import("./scaffold.js");
      await cancelOnboardingCheckpoints(id);
    } catch (err) {
      logger.warn("Failed to cancel checkpoints on kill", { agentId: id, error: err });
    }
    res.json({ status: "killed" });
  } catch (error) {
    logger.error("Agent kill failed", { error, agentId: param(req, "id") });
    res.status(500).json({ error: "Kill failed" });
  }
});

// Update agent schedule
app.patch("/agents/:id/schedule", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { schedule } = req.body;

    if (!schedule || typeof schedule !== "string") {
      res.status(400).json({ error: "Missing 'schedule' (cron string or 'manual')" });
      return;
    }

    // Validate cron expression (unless "manual")
    if (schedule !== "manual") {
      const cron = await import("node-cron");
      if (!cron.validate(schedule)) {
        res.status(400).json({ error: `Invalid cron expression: ${schedule}` });
        return;
      }
    }

    await prisma.agent.update({
      where: { id },
      data: { schedule },
    });

    // Re-register with scheduler
    const { registerAgent, unregisterAgent } = await import("./scheduler.js");
    if (schedule === "manual") {
      unregisterAgent(id);
    } else {
      const agent = await prisma.agent.findUnique({ where: { id }, select: { status: true } });
      if (agent?.status === "active") {
        registerAgent(id, schedule);
      }
    }

    logger.info("Agent schedule updated", { agentId: id, schedule });
    res.json({ status: "updated", schedule });
  } catch (error) {
    logger.error("Schedule update failed", { error, agentId: param(req, "id") });
    res.status(500).json({ error: "Schedule update failed" });
  }
});

// Update client-configurable agent config (tone, emailFrequency).
// Strict allowlist — never trust body keys blindly. Adding a new client-safe
// field means updating the allowlist here AND the portal's config editor.
const AGENT_CONFIG_ALLOWED_TONES = new Set(["formal", "conversational", "brief"]);
const AGENT_CONFIG_ALLOWED_FREQUENCIES = new Set(["immediate", "daily_digest", "weekly_digest"]);
const AGENT_CONFIG_ALLOWED_AUTONOMY = new Set(["supervised", "autonomous"]);

app.patch("/agents/:id/config", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { tone, emailFrequency, digestHour, digestDayOfWeek, autonomyLevel, maxEmailsPerDay, followUpDays } = req.body ?? {};
    const updates: { tone?: string; emailFrequency?: string; digestHour?: number; digestDayOfWeek?: number; autonomyLevel?: string; maxEmailsPerDay?: number | null; followUpDays?: number[] } = {};

    if (tone !== undefined) {
      if (typeof tone !== "string" || !AGENT_CONFIG_ALLOWED_TONES.has(tone)) {
        res.status(400).json({ error: `Invalid tone. Allowed: ${[...AGENT_CONFIG_ALLOWED_TONES].join(", ")}` });
        return;
      }
      updates.tone = tone;
    }

    if (emailFrequency !== undefined) {
      if (typeof emailFrequency !== "string" || !AGENT_CONFIG_ALLOWED_FREQUENCIES.has(emailFrequency)) {
        res.status(400).json({ error: `Invalid emailFrequency. Allowed: ${[...AGENT_CONFIG_ALLOWED_FREQUENCIES].join(", ")}` });
        return;
      }
      updates.emailFrequency = emailFrequency;
    }

    if (digestHour !== undefined) {
      if (typeof digestHour !== "number" || !Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23) {
        res.status(400).json({ error: "digestHour must be an integer 0-23" });
        return;
      }
      updates.digestHour = digestHour;
    }

    if (digestDayOfWeek !== undefined) {
      if (typeof digestDayOfWeek !== "number" || !Number.isInteger(digestDayOfWeek) || digestDayOfWeek < 0 || digestDayOfWeek > 6) {
        res.status(400).json({ error: "digestDayOfWeek must be an integer 0-6 (Sun=0..Sat=6)" });
        return;
      }
      updates.digestDayOfWeek = digestDayOfWeek;
    }

    if (autonomyLevel !== undefined) {
      if (typeof autonomyLevel !== "string" || !AGENT_CONFIG_ALLOWED_AUTONOMY.has(autonomyLevel)) {
        res.status(400).json({ error: `Invalid autonomyLevel. Allowed: ${[...AGENT_CONFIG_ALLOWED_AUTONOMY].join(", ")}` });
        return;
      }
      updates.autonomyLevel = autonomyLevel;
    }

    if (maxEmailsPerDay !== undefined) {
      // null clears the cap ("no explicit limit"); otherwise must be a sane positive integer.
      if (maxEmailsPerDay === null) {
        updates.maxEmailsPerDay = null;
      } else if (typeof maxEmailsPerDay !== "number" || !Number.isInteger(maxEmailsPerDay) || maxEmailsPerDay < 1 || maxEmailsPerDay > 500) {
        res.status(400).json({ error: "maxEmailsPerDay must be null or an integer 1-500" });
        return;
      } else {
        updates.maxEmailsPerDay = maxEmailsPerDay;
      }
    }

    if (followUpDays !== undefined) {
      if (!Array.isArray(followUpDays) || followUpDays.length > 4 || !followUpDays.every((d) => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 90)) {
        res.status(400).json({ error: "followUpDays must be an array (max 4) of integers 1-90" });
        return;
      }
      // de-dupe + sort ascending so the cadence is always well-formed
      updates.followUpDays = [...new Set(followUpDays as number[])].sort((a, b) => a - b);
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid config fields provided" });
      return;
    }

    const agent = await prisma.agent.update({
      where: { id },
      data: updates,
      select: { id: true, tone: true, emailFrequency: true, digestHour: true, digestDayOfWeek: true, autonomyLevel: true, maxEmailsPerDay: true, followUpDays: true },
    });

    logger.info("Agent config updated", { agentId: id, updates });
    res.json({ status: "updated", agent });
  } catch (error) {
    logger.error("Agent config update failed", { error, agentId: param(req, "id") });
    res.status(500).json({ error: "Config update failed" });
  }
});

// Submit a tool-request row + ping Kyle on WhatsApp. White-glove fallback
// for anything not covered by Composio OAuth — Kyle resolves manually.
app.post("/agents/:id/tool-requests", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { toolName, reason } = req.body ?? {};

    if (typeof toolName !== "string" || toolName.trim().length === 0) {
      res.status(400).json({ error: "Missing 'toolName'" });
      return;
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      res.status(400).json({ error: "Missing 'reason'" });
      return;
    }

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        clientId: true,
        client: { select: { id: true, businessName: true, email: true, contactName: true } },
      },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const request = await prisma.toolRequest.create({
      data: {
        clientId: agent.clientId,
        agentId: agent.id,
        toolName: toolName.trim().slice(0, 200),
        reason: reason.trim().slice(0, 2000),
      },
      select: { id: true, toolName: true, reason: true, createdAt: true },
    });

    // Best-effort Kyle ping — failure doesn't block the request creation.
    try {
      const { sendKyleWhatsApp } = await import("../shared/whatsapp.js");
      await sendKyleWhatsApp(
        `🛠  Tool request\n` +
          `Client: ${agent.client.businessName} (${agent.client.contactName ?? agent.client.email})\n` +
          `Agent: ${agent.name}\n` +
          `Tool: ${request.toolName}\n` +
          `Why: ${request.reason}\n` +
          `Request id: ${request.id}`
      );
    } catch (notifyError) {
      logger.warn("Kyle WhatsApp notification failed for tool-request", {
        requestId: request.id,
        error: notifyError instanceof Error ? notifyError.message : String(notifyError),
      });
    }

    logger.info("Tool request submitted", {
      requestId: request.id,
      agentId: agent.id,
      clientId: agent.clientId,
      toolName: request.toolName,
    });
    res.json({ status: "submitted", request });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Tool request submission failed", { error: message, agentId: param(req, "id") });
    res.status(500).json({ error: "Tool request failed" });
  }
});

// Chat: send a message from chat.ambitt.agency. Token in query/body is the
// HMAC-signed { clientId, agentId } binding generated for this client by
// shared/chat-token.ts. The token carrier IS the auth — we never trust the
// agentId path param alone. Replies go back in the response; we also persist
// both sides as ConversationMessage rows with channel="chat" via the runtime.
app.post("/chat/:agentId/messages", async (req: Request, res: Response) => {
  try {
    const agentIdParam = param(req, "agentId");
    const token = (req.query.t as string) ?? (req.body?.token as string) ?? "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!token) {
      res.status(401).json({ error: "Missing chat token" });
      return;
    }
    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const { verifyChatToken } = await import("../shared/chat-token.js");
    let claims;
    try {
      claims = verifyChatToken(token);
    } catch (err) {
      logger.warn("Chat token verify failed", { agentId: agentIdParam, error: err instanceof Error ? err.message : String(err) });
      res.status(401).json({ error: "Invalid chat token" });
      return;
    }

    if (claims.agentId !== agentIdParam) {
      res.status(403).json({ error: "Token does not bind to this agent" });
      return;
    }

    const agent = await prisma.agent.findUnique({
      where: { id: claims.agentId },
      select: { id: true, status: true, name: true, clientId: true, client: { select: { email: true } } },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    if (agent.clientId !== claims.clientId) {
      res.status(403).json({ error: "Token does not bind to this agent's client" });
      return;
    }
    if (agent.status !== "active") {
      res.status(400).json({ error: `Agent is ${agent.status}` });
      return;
    }

    const threadId = `thread-${agent.id}-${agent.clientId}`;
    const { processInboundMessage } = await import("../shared/runtime/index.js");
    const result = await processInboundMessage({
      agentId: agent.id,
      userMessage: message,
      channel: "chat",
      threadId,
      senderEmail: agent.client.email,
    });

    logger.info("Chat message processed", { agentId: agent.id, clientId: agent.clientId, length: message.length });
    res.json({
      response: result.response,
      threadId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Chat message failed", { error: msg, agentId: param(req, "agentId") });
    res.status(500).json({ error: "Chat processing failed" });
  }
});

// Chat: load the full conversation history for this agent-client thread.
// Email + chat messages appear together (unified thread, channel differentiates).
app.get("/chat/:agentId/history", async (req: Request, res: Response) => {
  try {
    const agentIdParam = param(req, "agentId");
    const token = (req.query.t as string) ?? "";

    if (!token) {
      res.status(401).json({ error: "Missing chat token" });
      return;
    }

    const { verifyChatToken } = await import("../shared/chat-token.js");
    let claims;
    try {
      claims = verifyChatToken(token);
    } catch (err) {
      res.status(401).json({ error: "Invalid chat token" });
      return;
    }

    if (claims.agentId !== agentIdParam) {
      res.status(403).json({ error: "Token does not bind to this agent" });
      return;
    }

    const agent = await prisma.agent.findUnique({
      where: { id: claims.agentId },
      select: { id: true, name: true, clientId: true, status: true },
    });
    if (!agent || agent.clientId !== claims.clientId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const threadId = `thread-${agent.id}-${agent.clientId}`;
    const messages = await prisma.conversationMessage.findMany({
      where: { threadId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, role: true, content: true, channel: true, createdAt: true },
    });

    res.json({
      agentId: agent.id,
      agentName: agent.name,
      agentStatus: agent.status,
      threadId,
      messages,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Chat history failed", { error: msg, agentId: param(req, "agentId") });
    res.status(500).json({ error: "History load failed" });
  }
});

// WhatsApp webhook — Kyle's approval replies
app.post("/webhooks/whatsapp", async (req: Request, res: Response) => {
  try {
    const body = req.body.Body?.trim() ?? "";
    const from = req.body.From ?? "";

    const kyleNumber = process.env.KYLE_WHATSAPP_NUMBER;
    if (!from.includes(kyleNumber ?? "NONE")) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const parts = body.split(" ");
    const command = parts[0]?.toUpperCase();
    const agentId = parts[1];

    if (command === "APPROVE" && agentId) {
      // WhatsApp approval implies explicit operator intent — force-flag
      // skips the no-tools-connected guard. The operator just typed the
      // command on their phone; if they meant to wait, they wouldn't have.
      await approveAgent(agentId, { force: true });
      logger.info("Agent approved via WhatsApp (force)", { agentId });
    } else if (command === "REJECT" && agentId) {
      await rejectAgent(agentId);
      logger.info("Agent rejected via WhatsApp", { agentId });
    }

    res.json({ status: "processed" });
  } catch (error) {
    logger.error("WhatsApp webhook failed", { error });
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Email inbound webhook — Resend sends email.received event here
// Resend fires ONE webhook for all inbound emails. We extract the agentId
// from the recipient address (reply-{agentId}@ambitt.agency), then fetch
// the full email content + attachments via Resend API.
app.post("/webhooks/email-inbound", async (req: Request, res: Response) => {
  try {
    const event = req.body;

    // Resend webhook payload has type + data
    if (event.type !== "email.received") {
      res.json({ status: "ignored", reason: `Event type: ${event.type}` });
      return;
    }

    const emailId = event.data?.email_id;
    const toAddresses: string[] = event.data?.to ?? [];

    if (!emailId) {
      res.status(400).json({ error: "Missing email_id in webhook payload" });
      return;
    }

    // Resolve agentId from the recipient(s). Two paths:
    //   1) reply-{agentId}@ambitt.agency — used by Reply-To when clients hit
    //      reply on an agent's outbound email. The original routing scheme.
    //   2) {slug}@ambitt.agency where {slug} is the agent's primary email —
    //      lets people email the agent cold (e.g. Kyle emailing
    //      atlas@ambitt.agency to spawn a prospect, or a client emailing
    //      bob@ambitt.agency to start a conversation without having received
    //      an email first).
    let agentId: string | null = null;
    let routingPath: "reply" | "direct" = "direct";
    const replyAddress = toAddresses.find((addr: string) => addr.toLowerCase().startsWith("reply-"));
    if (replyAddress) {
      agentId = replyAddress.replace(/^reply-/i, "").split("@")[0];
      routingPath = "reply";
    } else {
      // Path 2 — look up by Agent.email. First match wins.
      for (const addr of toAddresses) {
        const normalized = addr.toLowerCase().trim();
        const agent = await prisma.agent.findUnique({
          where: { email: normalized },
          select: { id: true },
        });
        if (agent) {
          agentId = agent.id;
          break;
        }
      }
    }

    if (!agentId) {
      logger.warn("Inbound email not addressed to any known agent", { to: toAddresses });
      res.json({ status: "ignored", reason: "No matching agent for recipient" });
      return;
    }

    // Resend's email.received webhook ships the FULL inbound email content
    // in event.data — text, html, attachments, headers, the lot. The earlier
    // code path tried to fetch GET /emails/{id} from Resend's API, which only
    // returns OUTBOUND emails (re_… IDs). Inbound emails use UUID IDs and
    // aren't retrievable that way → 502 every time. Just read the payload.
    const emailData = (event.data ?? {}) as Record<string, unknown>;
    const from = (typeof emailData.from === "string" ? emailData.from : "") || "";
    const subject = ((typeof emailData.subject === "string" ? emailData.subject : "") || "").toUpperCase().trim();

    // Sender authorization. Only the agent's owner client (or, for platform
    // agents like Atlas, an active Prospect) can drive an agent run. Anyone
    // else is silently dropped — 200 so Resend doesn't retry, but no work.
    const auth = await checkInboundAuth(agentId, from, routingPath);
    if (!auth.ok) {
      logger.warn("Inbound email rejected — unauthorized sender", { agentId, from, reason: auth.reason });
      // Soft auto-response for cold rejections on platform agents (Atlas-style).
      // Tells the sender "you reached Atlas but can't email it cold — here's the
      // right way in." Skipped for client agents (no marco-mcquizzy@ leakage)
      // and for reply-path rejections (rare; sender clearly already has context).
      // Fire-and-forget so the 200 ignored response goes out immediately.
      if (routingPath === "direct") {
        void sendColdEmailAutoResponse(agentId, from, subject).catch((err) =>
          logger.warn("Cold-rejection auto-response failed", { agentId, from, err })
        );
      }
      res.json({ status: "ignored", reason: auth.reason });
      return;
    }

    // DOCS subject — route attachments to agent memory instead of runtime
    if (subject.includes("DOCS") && Array.isArray(emailData.attachments) && emailData.attachments.length > 0) {
      const { parseInboundAttachments } = await import("../shared/attachments/parse-inbound.js");
      const { encrypt, decrypt } = await import("../shared/encryption.js");

      const attachmentsWithContent = emailData.attachments
        .filter((att: any) => att.content)
        .map((att: any) => ({
          filename: att.filename ?? "attachment",
          contentType: att.content_type ?? "application/octet-stream",
          content: att.content,
        }));

      if (attachmentsWithContent.length > 0) {
        const parsed = await parseInboundAttachments(attachmentsWithContent);
        const agent = await prisma.agent.findUnique({
          where: { id: agentId },
          select: { clientMemoryObject: true, name: true, client: { select: { email: true, businessName: true } } },
        });

        if (agent) {
          let memory: Record<string, unknown> = {};
          try { memory = JSON.parse(decrypt(agent.clientMemoryObject)); } catch { /* fresh */ }

          const existingDocs = (memory.documents ?? []) as Array<{ filename: string; uploadedAt: string; summary: string }>;
          const newDocs = parsed.map((p) => ({
            filename: p.filename,
            uploadedAt: new Date().toISOString(),
            summary: p.text.slice(0, 500),
          }));

          memory.documents = [...existingDocs, ...newDocs];
          memory.documentContents = memory.documentContents ?? {};
          for (const p of parsed) {
            (memory.documentContents as Record<string, string>)[p.filename] = p.text;
          }

          await prisma.agent.update({
            where: { id: agentId },
            data: { clientMemoryObject: encrypt(JSON.stringify(memory)), lastMemoryUpdateAt: new Date() },
          });

          // Confirm back to client
          const { sendEmail } = await import("../shared/email.js");
          const filenames = parsed.map((p) => p.filename).join(", ");
          await sendEmail({
            agentId,
            agentName: agent.name,
            to: agent.client?.email ?? from,
            subject: `${agent.name} — Documents received`,
            html: `<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
              <p>I've received and studied the following documents:</p>
              <ul>${parsed.map((p) => `<li><strong>${p.filename}</strong> (${p.sizeBytes > 1024 ? Math.round(p.sizeBytes / 1024) + "KB" : p.sizeBytes + "B"})</li>`).join("")}</ul>
              <p>This information is now part of my knowledge about your business. I'll reference it in future work.</p>
              <p style="color: #9ca3af; font-size: 13px;">— ${agent.name}, your AI agent at Ambitt</p>
            </div>`,
            replyToAgentId: agentId,
          });

          logger.info("Documents stored via email DOCS subject", { agentId, count: parsed.length, filenames });
        }
      }

      res.json({ status: "documents_stored", agentId, count: attachmentsWithContent.length });
      return;
    }

    // APPROVE / DISMISS — handle recommendation actions
    const approveMatch = subject.match(/^APPROVE\s+(\S+)/);
    const dismissMatch = subject.match(/^DISMISS\s+(\S+)/);
    const retryMatch = subject.match(/^RETRY\s+(\S+)/);

    if (approveMatch || dismissMatch || retryMatch) {
      const actionId = (approveMatch?.[1] ?? dismissMatch?.[1] ?? retryMatch?.[1])!;
      const action = approveMatch ? "approved" : dismissMatch ? "dismissed" : "retry";

      try {
        const recommendation = await prisma.recommendation.findFirst({
          where: { approveActionId: actionId },
        });

        if (recommendation) {
          await prisma.recommendation.update({
            where: { id: recommendation.id },
            data: {
              status: action === "retry" ? "pending" : action,
              clientAction: action,
              clientActionAt: new Date(),
              resolvedAt: new Date(),
            },
          });

          // Supervised-mode re-entry: on APPROVE or RETRY, feed a synthetic
          // message into the agent runtime so Claude executes the plan it
          // previously proposed. The conversation history already carries the
          // plan items (engine.ts embeds them in finalResponse on pause).
          // DISMISS is a dead-end: just confirm and stop.
          if (action !== "dismissed") {
            const actionWord = action === "approved" ? "APPROVED" : "RETRY";
            const syntheticMessage =
              action === "approved"
                ? `${actionWord} — please proceed with the plan you presented.`
                : `${actionWord} — please try that plan again.`;
            const threadId = `thread-${agentId}-${recommendation.clientId}`;

            const { processInboundMessage } = await import("../shared/runtime/index.js");
            const result = await processInboundMessage({
              agentId,
              userMessage: syntheticMessage,
              channel: "email",
              threadId,
              senderEmail: from,
            });

            const { dispatchAgentResponse } = await import("./lib/dispatchAgentResponse.js");
            await dispatchAgentResponse({
              agentId,
              runtimeOutput: result,
              isReply: true,
            });

            logger.info("Supervised plan resumed", {
              agentId,
              actionId,
              action,
              toolsUsed: result.toolsUsed.length,
              loopCount: result.loopCount,
            });
          } else {
            // DISMISS — light confirmation only, no runtime re-entry
            const agent = await prisma.agent.findUnique({
              where: { id: agentId },
              select: { name: true, client: { select: { email: true } } },
            });
            if (agent) {
              const { sendEmail: sendConfirm } = await import("../shared/email.js");
              await sendConfirm({
                agentId,
                agentName: agent.name,
                to: agent.client?.email ?? from,
                subject: `${agent.name} — Action dismissed`,
                html: `<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
                  <p>Got it. I've <strong>dismissed</strong>: "${recommendation.title}". I won't proceed.</p>
                  <p style="color: #9ca3af; font-size: 13px;">— ${agent.name}, your AI agent at Ambitt</p>
                </div>`,
                replyToAgentId: agentId,
              });
            }
          }

          logger.info("Recommendation action processed", { agentId, actionId, action });
        } else {
          logger.warn("Recommendation not found for action", { actionId });
        }
      } catch (error) {
        logger.error("Failed to process recommendation action", { actionId, action, error });
      }

      res.json({ status: "action_processed", agentId, action });
      return;
    }

    // Try every reasonable field name for the body. Resend's docs say text/html
    // but in practice the payload may use other shapes — be permissive.
    const bodyCandidates = [
      emailData.text,
      emailData.html,
      emailData.body_plain,
      emailData.body_text,
      emailData.body_html,
      emailData.plain,
      emailData.body,
      emailData.message,
      emailData.stripped_text,
      emailData.stripped_html,
    ];
    let messageContent: string = "";
    for (const cand of bodyCandidates) {
      if (typeof cand === "string" && cand.trim().length > 0) {
        messageContent = cand;
        break;
      }
    }
    // If still no body, fall back to "subject only" so the agent can at least
    // respond to the topic. This handles GIF-only emails, subject-only emails,
    // and any payload-shape we haven't anticipated.
    const subjectPlain = (typeof emailData.subject === "string" ? emailData.subject : "").trim();
    if (!messageContent && subjectPlain.length > 0) {
      messageContent = `(No body — subject only: "${subjectPlain}")`;
    }

    // Parse attachments if present
    if (Array.isArray(emailData.attachments) && emailData.attachments.length > 0) {
      // Fetch attachment content from the raw signed URL
      const attachmentsWithContent = [];
      for (const att of emailData.attachments as Array<{ filename?: string; content_type?: string; content?: string }>) {
        try {
          // If Resend provides a download URL via the raw field, fetch it
          // Otherwise use the attachment data directly
          if (att.content) {
            attachmentsWithContent.push({
              filename: att.filename ?? "attachment",
              contentType: att.content_type ?? "application/octet-stream",
              content: att.content, // base64
            });
          }
        } catch (err) {
          logger.warn("Failed to process attachment", { filename: att.filename, error: err });
        }
      }

      if (attachmentsWithContent.length > 0) {
        const { parseInboundAttachments, formatAttachmentsAsContext } = await import("../shared/attachments/parse-inbound.js");
        const parsed = await parseInboundAttachments(attachmentsWithContent);
        if (parsed.length > 0) {
          messageContent += formatAttachmentsAsContext(parsed);
          logger.info("Parsed inbound attachments", {
            agentId,
            count: parsed.length,
            filenames: parsed.map((a) => a.filename),
          });
        }
      }
    }

    if (!messageContent) {
      // Diagnostic: dump the payload field names so we can see what Resend
      // actually sent and add the right field to bodyCandidates above.
      logger.warn("Inbound email body empty across all candidate fields", {
        agentId,
        from,
        payloadKeys: Object.keys(emailData),
        payloadShape: Object.fromEntries(
          Object.entries(emailData).map(([k, v]) => [k, typeof v === "string" ? `string(${v.length})` : Array.isArray(v) ? `array(${v.length})` : typeof v])
        ),
      });
      // Return 200 so Resend doesn't retry. Include diagnostic so the
      // Webhooks UI surfaces what was missing.
      res.json({
        status: "ignored",
        reason: "Empty message body",
        payloadKeys: Object.keys(emailData),
      });
      return;
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        client: { select: { email: true, businessName: true } },
      },
    });

    if (!agent || agent.status !== "active") {
      res.status(404).json({ error: "Agent not found or inactive" });
      return;
    }

    // Platform-operator path — when Kyle (OPERATOR_EMAIL) emails a platform agent
    // directly, prepend operator-mode instructions so the agent knows it's
    // not talking to a prospect/client and can use ops tools like
    // spawn_prospect. The agent's permanent system prompt stays the same;
    // this is a per-message prefix.
    let runtimeMessage = messageContent;
    let threadId = `thread-${agentId}-${agent.clientId}`;
    if (auth.senderType === "platform_operator") {
      // Separate thread for ops conversations so they don't pollute the
      // normal client thread history.
      threadId = `thread-${agentId}-ops-${from.toLowerCase()}`;
      runtimeMessage = buildOperatorModeMessage(messageContent, from);
    }

    // Run the full agent runtime: parse → Claude + tools → response
    const { processInboundMessage } = await import("../shared/runtime/index.js");
    const result = await processInboundMessage({
      agentId,
      userMessage: runtimeMessage,
      channel: "email",
      threadId,
      senderEmail: from,
    });

    // Dispatch — immediate send OR queue for digest, based on agent.emailFrequency.
    // Inbound-email replies should go back to the actual sender, not the
    // agent's owning-client inbox (which is wrong for operator-mode and
    // prospect-mode runs). Pass the parsed sender email through; if for any
    // reason it doesn't parse, dispatchAgentResponse falls back to client.email.
    const senderEmail = parseEmailFromHeader(from);
    const { dispatchAgentResponse } = await import("./lib/dispatchAgentResponse.js");
    const dispatch = await dispatchAgentResponse({
      agentId,
      runtimeOutput: result,
      isReply: true,
      recipientEmail: senderEmail ?? undefined,
    });

    logger.info("Agent email reply dispatched", {
      agentId,
      mode: dispatch.mode,
      to: agent.client.email,
      toolsUsed: result.toolsUsed.length,
      loopCount: result.loopCount,
    });

    res.json({
      status: "replied",
      agentId,
      toolsUsed: result.toolsUsed.length,
      loopCount: result.loopCount,
    });
  } catch (error) {
    logger.error("Email inbound webhook failed", { error });
    res.status(500).json({ error: "Inbound processing failed" });
  }
});

// Client onboarding
app.post("/onboard", async (req: Request, res: Response) => {
  try {
    const result = await onboardClient(req.body);
    res.json(result);
  } catch (error) {
    logger.error("Client onboarding failed", { error });
    res.status(500).json({ error: "Onboarding failed" });
  }
});

// ---------------------------------------------------------------------------
// Prospect find-or-create
// ---------------------------------------------------------------------------
//
// Backend for the public `clients.ambitt.agency/onboard` entry AND the
// dashboard "Add prospect" flow. Given a name + email, returns a personal
// onboard token URL — creating or reviving a Prospect row as needed.
//
// Resume rule (locked):
//   - Email matches active prospect (status NOT in archived/ghosted)
//     → return existing token, isResume: true. They land on their saved draft.
//   - Email matches dead prospect (archived/ghosted)
//     → REUSE the row but wipe it clean (new token, empty formData, status=discovery).
//     Old draft lost on purpose — they're starting fresh.
//   - No match → create new Prospect.
//
// Email lookup is case-insensitive (email is stored lowercased here).
//
// Kyle's accepted tradeoff: anyone who knows a prospect's email can resume
// their session. No magic-link auth on resume — that ships if/when this
// becomes a real attack surface.
//
// When `sendEmail: true`, Atlas emails the prospect a slim teaser containing
// their personal /onboard/[token] link. Used by the dashboard "Add prospect"
// flow when Kyle has a warm lead's email but they haven't filled the form
// yet. Public-form callers omit/false this — the user is already in the form.
app.post("/onboarding/prospects/find-or-create", async (req: Request, res: Response) => {
  try {
    const body = req.body as { name?: string; email?: string; sendEmail?: boolean };
    const shouldEmail = body.sendEmail === true;

    const { findOrCreateProspect, ProspectInputError } = await import("../shared/prospects.js");
    let result;
    try {
      result = await findOrCreateProspect({ name: body.name, email: body.email ?? "" });
    } catch (err) {
      if (err instanceof ProspectInputError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    if (shouldEmail) {
      await sendOnboardLinkTeaser(result.prospectId, result.token, result.contactName, body.email!.trim().toLowerCase()).catch(
        (e) => logger.warn("Onboard-link email failed", { prospectId: result.prospectId, e })
      );
    }

    res.json({
      prospectId: result.prospectId,
      token: result.token,
      isNew: result.isNew,
      isResume: result.isResume,
      status: result.status,
    });
  } catch (error) {
    logger.error("Prospect find-or-create failed", { error });
    res.status(500).json({ error: "find-or-create failed" });
  }
});

// Helper for the sendEmail path — best-effort, doesn't block the response.
async function sendOnboardLinkTeaser(
  prospectId: string,
  token: string,
  contactName: string | null,
  email: string
): Promise<void> {
  const atlas = await prisma.agent.findUnique({
    where: { email: "atlas@ambitt.agency" },
    select: { id: true, name: true },
  });
  if (!atlas) {
    logger.warn("sendOnboardLinkTeaser: Atlas not seeded, skipping", { prospectId });
    return;
  }
  const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";
  const onboardUrl = `${portalBase}/onboard/${token}`;
  const firstName = (contactName ?? "").trim().split(/\s+/)[0] || "there";
  const { sendEmail } = await import("../shared/email.js");
  await sendEmail({
    agentId: atlas.id,
    agentName: atlas.name,
    to: email,
    subject: "Your custom-agent onboarding link",
    html: `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #171717;">
  <div style="margin-bottom: 28px;">
    <img src="${portalBase}/brand/ambitt-agents-lockup.svg" alt="Ambitt Agents" width="220" height="27" style="display: block; max-width: 220px; height: auto;" />
  </div>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.6;">Hey ${escapeHtmlBasic(firstName)},</p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 24px; line-height: 1.6;">
    Here's your onboarding link. Takes about 5–10 minutes — we'll ask about your business, what you want your agent to do, and any tools or SOPs you have. Once you're done, we'll send back a tailored proposal within 30 minutes.
  </p>
  <div style="margin: 0 0 28px;">
    <a href="${onboardUrl}" style="display: inline-block; padding: 14px 30px; background: #00b3b3; color: #ffffff; text-decoration: none; border-radius: 9px; font-size: 15px; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0, 179, 179, 0.28);">Start onboarding →</a>
  </div>
  <p style="font-size: 13px; color: #737373; margin: 0 0 8px; line-height: 1.6;">
    Your progress saves automatically — you can pause and come back any time.
  </p>
  <p style="font-size: 13px; color: #a3a3a3; margin: 32px 0 0;">— Atlas, your onboarding agent at Ambitt Agents</p>
</div>`,
    replyToAgentId: atlas.id,
  });
  logger.info("Onboard-link teaser sent", { prospectId, to: email });
}


// ---------------------------------------------------------------------------
// Adaptive intake — POST /onboarding/prospects/:id/customize-questions
// ---------------------------------------------------------------------------
//
// Fired by the portal after the prospect submits slide 2 (agent goal). Reads
// the 3-slide static context, calls Haiku to generate 6-10 domain-specific
// questions, validates against Zod, persists to Prospect.formData.dynamic.
//
// Adaptive intake spec, 2026-05-31. Goal: same prospect journey (no email
// steps), much higher signal in the proposal. The portal kicks this in the
// background at slide-2 submit so by the time the prospect reaches slide 4
// the questions are usually already cached.
//
// Synchronous (~5-15s with Haiku). Returns the questions in the response so
// the portal can render them immediately without a second fetch. Idempotent:
// if formData.dynamic.questions already exists, returns the cached set.
app.post(
  "/onboarding/prospects/:id/customize-questions",
  async (req: Request, res: Response) => {
    try {
      const prospectId = param(req, "id");
      const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
      if (!prospect) {
        res.status(404).json({ error: "Prospect not found" });
        return;
      }
      if (prospect.status === "archived" || prospect.status === "ghosted") {
        res.status(403).json({ error: "Prospect onboarding is closed" });
        return;
      }

      // The portal sends the slide 0-2 values in the request body — they
      // haven't been persisted to formData yet because /submit is the only
      // existing save path and that's at the end of the flow. Merge whatever
      // arrived into a working copy + persist it now so the rest of this
      // handler can read from a single source. Fallback to existing
      // prospect.formData if the body is empty (cached fetch / resume case).
      const bodyValues =
        (req.body && typeof req.body === "object" && req.body.values && typeof req.body.values === "object")
          ? (req.body.values as Record<string, unknown>)
          : null;

      const existingFd = (prospect.formData ?? {}) as Record<string, unknown>;
      const fd: Record<string, unknown> = bodyValues
        ? { ...existingFd, ...bodyValues }
        : existingFd;

      // Idempotency — if we already generated for this prospect, return cached.
      // Prospect must re-submit slide 2 with a changed answer to trigger regen
      // (portal logic handles that — clears formData.dynamic before re-firing).
      const cached = (fd.dynamic ?? {}) as { questions?: unknown; generatedAt?: unknown };
      if (cached.questions && typeof cached.generatedAt === "string") {
        res.json({
          status: "cached",
          questions: cached.questions,
          generatedAt: cached.generatedAt,
        });
        return;
      }

      // Pull the 3-slide static context. Tolerant on field names — the portal
      // form keys may evolve; we read both common shapes.
      const agentGoal =
        (typeof fd.agentGoal === "string" && fd.agentGoal) ||
        (typeof fd.agentPitch === "string" && fd.agentPitch) ||
        "";
      if (!agentGoal) {
        res.status(409).json({
          error: "Need agent goal (slide 2) before generating dynamic questions",
        });
        return;
      }

      // Persist the lifted convenience fields + the merged formData so the
      // final /submit can rely on this state if the prospect closes/reopens.
      // Lift contactName/businessName/role/website out into top-level columns
      // (matches the /submit handler's shape).
      const lifted = {
        contactName: typeof bodyValues?.contactName === "string" && bodyValues.contactName.trim()
          ? bodyValues.contactName.trim()
          : prospect.contactName,
        businessName: typeof bodyValues?.businessName === "string" && bodyValues.businessName.trim()
          ? bodyValues.businessName.trim()
          : prospect.businessName,
        role: typeof bodyValues?.role === "string" && bodyValues.role.trim()
          ? bodyValues.role.trim()
          : prospect.role,
        website: typeof bodyValues?.website === "string" && bodyValues.website.trim()
          ? bodyValues.website.trim()
          : prospect.website,
      };

      if (bodyValues) {
        // Strip the lifted keys from formData (they live on the top-level
        // columns instead). `email` is also never updatable from the form.
        const { contactName: _cn, businessName: _bn, role: _r, website: _w, email: _e, ...formDataToStore } = fd;
        await prisma.prospect.update({
          where: { id: prospectId },
          data: {
            ...lifted,
            formData: formDataToStore as object,
            lastActivityAt: new Date(),
          },
        });
      }

      const role =
        (typeof fd.role === "string" && fd.role) ||
        lifted.role ||
        null;

      const { buildDynamicIntakePrompt, buildDynamicIntakeCorrection } = await import(
        "./templates/dynamic-intake/prompt.js"
      );
      const {
        parseDynamicIntakeOutput,
        validateDynamicIntake,
        DynamicIntakeValidationError,
      } = await import("./templates/dynamic-intake/schema.js");
      const { callClaude, TRIAGE_MODEL } = await import("../shared/claude.js");

      // Use the lifted values (which are post-merge) instead of stale `prospect.*`
      // — when bodyValues arrived, `prospect` was read before the update.
      const userMessage = buildDynamicIntakePrompt({
        contactName: lifted.contactName,
        email: prospect.email,
        businessName: lifted.businessName,
        website: lifted.website,
        role,
        agentGoal,
      });

      // Haiku — fast + cheap + structured output is its sweet spot. No system
      // prompt; the whole spec lives in the user message so Atlas's broader
      // identity doesn't bleed in.
      const MAX_RETRY_ATTEMPTS = 2;
      const callModel = async (msg: string) => {
        const r = await callClaude({
          systemPrompt: "",
          userMessage: msg,
          model: TRIAGE_MODEL,
          maxTokens: 4096,
          temperature: 0.4,
          cacheSystemPrompt: false,
        });
        return r.content;
      };

      const tryValidate = (raw: string) => {
        const parsed = parseDynamicIntakeOutput(raw);
        if (parsed === null) {
          throw new DynamicIntakeValidationError([
            { path: [], code: "custom", message: "No JSON block found in response" } as never,
          ]);
        }
        return validateDynamicIntake(parsed);
      };

      let result;
      let lastResponse = await callModel(userMessage);
      let attempt = 0;

      while (true) {
        try {
          result = tryValidate(lastResponse);
          break;
        } catch (err) {
          if (!(err instanceof DynamicIntakeValidationError)) throw err;
          attempt++;
          const issuesPreview = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
          if (attempt > MAX_RETRY_ATTEMPTS) {
            logger.error("Dynamic intake exhausted retries", {
              prospectId,
              attempts: attempt,
              finalIssues: issuesPreview,
              finalResponsePreview: lastResponse.slice(0, 500),
            });
            res.status(422).json({
              error: "Dynamic intake generation failed validation after retries",
              issues: issuesPreview,
            });
            return;
          }
          logger.warn(`Dynamic intake attempt ${attempt} invalid — retrying`, {
            prospectId,
            attempt,
            maxAttempts: MAX_RETRY_ATTEMPTS,
            issues: issuesPreview,
          });
          lastResponse = await callModel(buildDynamicIntakeCorrection(err.issues));
        }
      }

      // Persist under formData.dynamic. Answers come back later via the
      // existing form_submitted handler — the portal will POST the full
      // formData object including dynamic.answers.
      // Strip lifted keys from formData so they only live as top-level columns
      // (mirrors the /submit handler's shape).
      const generatedAt = new Date().toISOString();
      const { contactName: _cn2, businessName: _bn2, role: _r2, website: _w2, email: _e2, ...fdSansLifted } = fd;
      const nextFormData = {
        ...fdSansLifted,
        dynamic: {
          questions: result,
          generatedAt,
          answers: {} as Record<string, unknown>,
        },
      };

      await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          formData: nextFormData as object,
          lastActivityAt: new Date(),
        },
      });

      logger.info("Dynamic intake generated", {
        prospectId,
        questionCount: result.questions.length,
        domain: result.domainSummary,
        archetype: result.agentArchetype,
      });

      res.json({
        status: "generated",
        questions: result,
        generatedAt,
      });
    } catch (error) {
      logger.error("Dynamic intake endpoint failed", {
        err: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Dynamic intake generation failed" });
    }
  }
);

// ---------------------------------------------------------------------------
// Atlas (onboarding agent) — web → runtime bridge
// ---------------------------------------------------------------------------
//
// Called by the client portal when a prospect interacts with the onboarding
// flow (form submission, chat message, requested changes). The endpoint
// constructs an Atlas message from the event + the prospect's intake data,
// runs Atlas via the standard runtime engine, and (for form_submitted)
// emails the resulting presentation to the prospect.
//
// Event types:
//   - form_submitted: prospect finished the intake form; generate presentation
//   - chat_message: Phase 2 (SOP-aware chat)
//   - requested_changes: Phase 2 (regenerate after edits)
app.post("/onboarding/prospects/:id/event", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");
    const { type } = req.body as { type?: string };

    if (!type) {
      res.status(400).json({ error: "type is required" });
      return;
    }

    const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) {
      res.status(404).json({ error: "Prospect not found" });
      return;
    }
    if (prospect.status === "archived" || prospect.status === "ghosted") {
      res.status(403).json({ error: "Prospect onboarding is closed" });
      return;
    }

    const atlas = await prisma.agent.findUnique({
      where: { email: "atlas@ambitt.agency" },
      select: { id: true, clientId: true, name: true, status: true },
    });
    if (!atlas || atlas.status !== "active") {
      res.status(500).json({ error: "Atlas is not seeded or not active" });
      return;
    }

    if (type === "form_submitted") {
      const threadId = `prospect-${prospect.id}`;
      const { processInboundMessage } = await import("../shared/runtime/index.js");
      const { sendEmail } = await import("../shared/email.js");
      const { renderProposalEmail, parseAtlasJsonOutput, ProposalEmailValidationError } =
        await import("./templates/proposal-email/render.js");
      const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";

      // Immediate "thanks, working on it" email — fires synchronously before
      // Atlas runs (which takes 2–3 min). Lands in the prospect's inbox by
      // the time their browser confirmation finishes its scroll. Best-effort:
      // if the send fails, log it but don't abort — the proposal email is the
      // real deliverable and we don't want to lose the run over a courtesy.
      try {
        await sendEmail({
          agentId: atlas.id,
          agentName: atlas.name,
          to: prospect.email,
          subject: "Got your brief — proposal incoming",
          html: renderThanksEmail(prospect, portalBase),
          replyToAgentId: atlas.id,
          prospectId: prospect.id,
          emailType: "thanks_email",
        });
      } catch (err) {
        logger.warn("Atlas thank-you email failed (continuing)", { prospectId: prospect.id, error: err });
      }

      // Pass 1 — Atlas reads the intake and emits ProposalEmailData JSON.
      // Routes to Atlas-Funnel-on-Fable when FABLE_FUNNEL_ENABLED=true, else
      // through the legacy Sonnet runtime engine. Falls back automatically
      // if Fable errors.
      const { runFunnelTask } = await import("./funnel-fable/hybrid.js");
      const pass1Result = await runFunnelTask({
        kind: "proposal",
        legacyAgentId: atlas.id,
        prospectId: prospect.id,
        senderEmail: prospect.email,
        threadId,
        userMessage: buildAtlasProposalPrompt(prospect),
      });
      const pass1 = { response: pass1Result.responseText };
      logger.info("Proposal pass 1 routed", {
        prospectId: prospect.id,
        via: pass1Result.via,
        sessionId: pass1Result.sessionId,
      });

      // Parse → validate. Retry up to MAX_RETRY_ATTEMPTS times on validation
      // failure (re-uses thread so Atlas sees its previous output + the
      // validation error). Each correction re-includes the schema because the
      // original prompt is ~27K chars — Atlas tends to hallucinate field names
      // when relying on its memory of the schema during retry.
      const MAX_RETRY_ATTEMPTS = 2;

      const tryRender = (raw: string): { html: string; data: unknown } => {
        const parsed = parseAtlasJsonOutput(raw);
        if (parsed === null) {
          throw new ProposalEmailValidationError([
            { path: [], code: "custom", message: "No JSON block found in response" } as any,
          ]);
        }
        return { html: renderProposalEmail(parsed), data: parsed };
      };

      const buildCorrection = (issues: { path: PropertyKey[]; message: string }[]) => {
        const issueList = issues
          .map((i, n) => `${n + 1}. ${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
          .join("\n");
        return `Your previous response didn't pass schema validation. Issues:
${issueList}

REMINDER — the EXACT schema your output must match (this is authoritative; do NOT invent field names like "prospectName", "agentName", "monthlyPrice", "successMetrics", "implementationTimeline" — none of those exist):

\`\`\`ts
interface ProposalEmailData {
  subject: string;
  greeting: { name: string; body: string };
  hero: {
    label: string;
    title: string;
    status?: { text: string; tone: "info" | "warn" | "success" | "neutral" };
    specs: Array<{ label: string; value: string }>;  // 3-7 rows
  };
  introQuote?: { text: string };
  whatWeBuild: { headline: string; paragraphs: string[] };  // 1-3 paragraphs
  flow: {
    headline: string;
    steps: Array<{ number: number; title: string; description: string }>;  // 3-7 steps
  };
  sample?: {
    headline: string;
    introText: string;
    card: {
      headerRows?: Array<{ label: string; value: string; type?: "link" | "subject" | "text" }>;
      body: string;
      signature?: string;
    };
  };
  digest?: {
    headline: string;
    introText: string;
    cardTitle: string;
    cardMeta: string;
    columns: Array<{ key: string; label: string }>;  // 3-5
    rows: Array<Array<{ value: string; type?: "pill" }>>;
  };
  cta: {
    headline: string;
    subtext: string;
    primaryLabel: string;
    primaryUrl: string;
    secondaryLabel: string;
    secondaryUrl: string;
  };
  footer: { domain: string; location: string; note?: string };
}
\`\`\`

Re-emit the COMPLETE ProposalEmailData JSON matching this exact shape. Output ONLY the JSON object — starts with \`{\`, ends with \`}\`. No commentary, no code fences, no markdown.`;
      };

      let rendered: { html: string; data: unknown };
      // toolsUsed/loopCount only populated via the Sonnet runtime engine;
      // Fable funnel runs don't surface tool counts. We retain the locals
      // so existing logging downstream stays well-formed.
      let toolsUsed = 0;
      let loopCount = 0;
      let lastResponse = pass1.response;
      let attempt = 0;

      while (true) {
        try {
          rendered = tryRender(lastResponse);
          break;
        } catch (err) {
          if (!(err instanceof ProposalEmailValidationError)) throw err;
          attempt++;
          const issuesPreview = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
          if (attempt > MAX_RETRY_ATTEMPTS) {
            logger.error("Atlas exhausted retries — proposal generation aborted", {
              prospectId: prospect.id,
              attempts: attempt,
              finalIssues: issuesPreview,
              finalResponsePreview: lastResponse.slice(0, 500),
            });
            throw err;
          }
          logger.warn(`Atlas attempt ${attempt} JSON invalid — retrying`, {
            prospectId: prospect.id,
            attempt,
            maxAttempts: MAX_RETRY_ATTEMPTS,
            issues: issuesPreview,
          });
          const passNResult = await runFunnelTask({
            kind: "proposal",
            legacyAgentId: atlas.id,
            prospectId: prospect.id,
            senderEmail: prospect.email,
            threadId,
            userMessage: buildCorrection(err.issues),
          });
          lastResponse = passNResult.responseText;
          // Tool/loop counts only meaningful on Sonnet path; Fable doesn't
          // surface them. Skip accumulation when via=fable.
        }
      }

      await prisma.prospect.update({
        where: { id: prospect.id },
        data: {
          presentationData: rendered.data as object,
          presentationHtml: rendered.html,
          presentationGeneratedAt: new Date(),
          status: "presentation_sent",
          lastActivityAt: new Date(),
        },
      });

      // Slim teaser email — the FULL proposal lives at /proposals/[token].
      // This email just lights up the link. Pixel-perfect rendering happens
      // on the hosted page; email becomes a tiny envelope that can't get
      // mangled by Gmail/Outlook/etc.
      const subject = (rendered.data as { subject?: string }).subject ?? "Your custom agent proposal is ready";
      const heroTitle = (rendered.data as { hero?: { title?: string } }).hero?.title ?? "";
      const proposalUrl = `${portalBase}/proposals/${prospect.token}`;
      await sendEmail({
        agentId: atlas.id,
        agentName: atlas.name,
        to: prospect.email,
        subject,
        html: renderProposalTeaserEmail(prospect, proposalUrl, heroTitle, portalBase),
        replyToAgentId: atlas.id,
        prospectId: prospect.id,
        emailType: "proposal_teaser",
      });

      logger.info("Atlas: presentation sent", {
        prospectId: prospect.id,
        atlasId: atlas.id,
        toolsUsed,
        loopCount,
      });

      res.json({ status: "presentation_sent", prospectId: prospect.id });
      return;
    }

    if (type === "scope_approved") {
      // Atlas's portal approve route already flipped status → quote_pending;
      // this is the human-loop notification so Kyle knows to draft the quote.
      // WhatsApp isn't wired in prod yet — using email until it is. Atlas is
      // the sender (so the operator sees it threaded with their prospect
      // history) and OPERATOR_EMAIL is the recipient.
      try {
        await notifyOps({
          atlasId: atlas.id,
          atlasName: atlas.name,
          subject: `Scope approved — ${prospect.contactName ?? "prospect"} (${prospect.businessName ?? "—"})`,
          html: renderScopeApprovedNotice(prospect),
        });
      } catch (err) {
        logger.warn("Scope-approved ops notification failed", { prospectId: prospect.id, error: err });
      }
      res.json({ status: "scope_approved", prospectId: prospect.id });
      return;
    }

    res.status(501).json({ error: `Event type "${type}" not yet supported` });
  } catch (error) {
    logger.error("Onboarding event handler failed", { error });
    res.status(500).json({ error: "Onboarding event failed" });
  }
});

// ---------------------------------------------------------------------------
// PRD generation
// ---------------------------------------------------------------------------
// POST /onboarding/prospects/:id/generate-prd
//
// Atlas runs against the prospect's saved intake (formData + sopFiles) and
// emits an AgentPRDData JSON object (see oracle/templates/prd/types.ts). We
// Zod-validate, retry-once on schema failure, save to Prospect.prdData, and
// email Kyle that it's ready for review.
//
// Kicked off (fire-and-forget) by the proposal-approve route after scope
// approval. Also exposed as its own endpoint so Kyle can manually re-trigger
// from the dashboard (e.g. when regenerating with notes after editing).
//
// Vera is intentionally NOT in this loop for v1 — the PRD is internal-only,
// Kyle reviews it directly in the dashboard, so a Haiku gate adds latency
// without much value. If PRD quality drifts, add Vera with artifact-specific
// checks later.
app.post("/onboarding/prospects/:id/generate-prd", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");
    const body = (req.body ?? {}) as { regenNotes?: string };
    const regenNotes = typeof body.regenNotes === "string" ? body.regenNotes.trim() : "";

    const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) {
      res.status(404).json({ error: "Prospect not found" });
      return;
    }
    if (prospect.status === "archived" || prospect.status === "ghosted") {
      res.status(403).json({ error: "Prospect onboarding is closed" });
      return;
    }

    // ---- Loop guards ----------------------------------------------------
    // (a) Idempotency: if a PRD already exists and the caller is NOT
    //     explicitly asking for a regeneration (no regenNotes), short-circuit
    //     and return the existing one. Stops any background loop that
    //     mistakenly re-fires generate-prd for a prospect that's already done.
    //     Also a sane default — generate-prd is supposed to be a one-shot.
    if (prospect.prdData && !regenNotes) {
      logger.info("PRD already exists; returning early (no regenNotes provided)", {
        prospectId: prospect.id,
        generatedAt: prospect.prdGeneratedAt,
        attempts: prospect.prdGenerationAttempts,
      });
      res.json({
        status: "already_generated",
        prospectId: prospect.id,
        generatedAt: prospect.prdGeneratedAt,
        attempts: prospect.prdGenerationAttempts,
      });
      return;
    }

    // (b) Cooldown: hard rate-limit. If last attempt was within 60 seconds,
    //     reject with 429. Atlas runs take 1-3 min; nothing legitimate would
    //     fire two attempts that close together. Belt-and-suspenders against
    //     any future loop bug.
    if (prospect.prdLastAttemptAt) {
      const secsSinceLast = (Date.now() - prospect.prdLastAttemptAt.getTime()) / 1000;
      if (secsSinceLast < 60) {
        logger.warn("PRD generation rate-limited (within 60s cooldown)", {
          prospectId: prospect.id,
          secsSinceLast,
        });
        res.status(429).json({
          error: "PRD generation cooldown",
          reason: `Last attempt was ${Math.round(secsSinceLast)}s ago — must wait 60s.`,
        });
        return;
      }
    }

    // Stamp attempt counter + timestamp at the top so the retry cron can
    // see how far we've gotten even if Atlas throws mid-run.
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        prdGenerationAttempts: { increment: 1 },
        prdLastAttemptAt: new Date(),
      },
    });

    const atlas = await prisma.agent.findUnique({
      where: { email: "atlas@ambitt.agency" },
      select: { id: true, clientId: true, name: true, status: true },
    });
    if (!atlas || atlas.status !== "active") {
      res.status(500).json({ error: "Atlas is not seeded or not active" });
      return;
    }

    const threadId = `prospect-${prospect.id}-prd`;
    const { renderPRD, parseAtlasPRDOutput, PRDValidationError } = await import("./templates/prd/render.js");
    const { runFunnelTask } = await import("./funnel-fable/hybrid.js");

    const pass1Result = await runFunnelTask({
      kind: "prd",
      legacyAgentId: atlas.id,
      prospectId: prospect.id,
      senderEmail: prospect.email,
      threadId,
      userMessage: buildAtlasPRDPrompt(prospect, regenNotes),
    });
    const pass1 = { response: pass1Result.responseText };
    logger.info("PRD pass 1 routed", {
      prospectId: prospect.id,
      via: pass1Result.via,
      sessionId: pass1Result.sessionId,
    });

    const tryValidate = (raw: string): { data: unknown; html: string } => {
      const parsed = parseAtlasPRDOutput(raw);
      if (parsed === null) {
        throw new PRDValidationError([
          { path: [], code: "custom", message: "No JSON block found in response" } as any,
        ]);
      }
      const html = renderPRD(parsed); // throws PRDValidationError on Zod fail
      return { data: parsed, html };
    };

    let result: { data: unknown; html: string };
    try {
      result = tryValidate(pass1.response);
    } catch (err) {
      if (!(err instanceof PRDValidationError)) throw err;
      logger.warn("Atlas first-pass PRD JSON invalid — retrying once", {
        prospectId: prospect.id,
        issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
      const correction = `Your previous PRD didn't pass schema validation. Issues:\n${err.issues
        .map((i, n) => `${n + 1}. ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n")}\n\nRe-emit the COMPLETE AgentPRDData JSON with these fixed. Output ONLY the JSON object, no commentary, no code fences.`;
      const pass2Result = await runFunnelTask({
        kind: "prd",
        legacyAgentId: atlas.id,
        prospectId: prospect.id,
        senderEmail: prospect.email,
        threadId,
        userMessage: correction,
      });
      result = tryValidate(pass2Result.responseText);
    }

    await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        prdData: result.data as object,
        prdGeneratedAt: new Date(),
        // Re-generating clears any prior approval — regen always invalidates the lock.
        prdApprovedAt: null,
        lastActivityAt: new Date(),
      },
    });

    // Best-effort ops email so Kyle knows the PRD is ready (or refreshed) for review.
    try {
      const dashBase = process.env.DASHBOARD_URL ?? "https://dashboard.ambitt.agency";
      await notifyOps({
        atlasId: atlas.id,
        atlasName: atlas.name,
        subject: regenNotes
          ? `PRD regenerated — ${prospect.contactName ?? "prospect"} (${prospect.businessName ?? "—"})`
          : `PRD ready for review — ${prospect.contactName ?? "prospect"} (${prospect.businessName ?? "—"})`,
        html: renderPRDReadyNotice(prospect, dashBase, regenNotes),
      });
    } catch (err) {
      logger.warn("PRD-ready ops notification failed", { prospectId: prospect.id, error: err });
    }

    logger.info("PRD generated", { prospectId: prospect.id, regenerated: Boolean(regenNotes) });
    res.json({ status: "prd_generated", prospectId: prospect.id });
  } catch (error) {
    // Distinguish Atlas-output-doesn't-fit-the-schema (422 — operator can act)
    // from infra errors (500 — wake somebody up). PRDValidationError bubbles
    // up from tryValidate when both passes produce invalid JSON; we ship the
    // specific issues so the operator knows whether to fix the intake data,
    // tighten the prompt, or just retry.
    if (error instanceof Error && error.name === "PRDValidationError") {
      const issues = (error as Error & { issues?: Array<{ path: (string | number)[]; message: string }> }).issues ?? [];
      logger.warn("PRD generation: Atlas output failed validation after retry", {
        prospectId: req.params.id,
        issues: issues.map((i) => `${(i.path ?? []).join(".") || "(root)"}: ${i.message}`),
      });
      res.status(422).json({
        error: "Atlas couldn't produce a valid PRD",
        reason: "Both attempts failed schema validation. The intake data may be too sparse, or Atlas's output drifted from the contract.",
        issues: issues.map((i) => ({ path: (i.path ?? []).join(".") || "(root)", message: i.message })),
        action: "Check that the prospect's formData has the core fields (agentName / agentRole / agentPitch / industry). If it does, retry the endpoint — Sonnet is non-deterministic and a second attempt often succeeds.",
      });
      return;
    }
    logger.error("PRD generation failed", { error });
    res.status(500).json({ error: "PRD generation failed" });
  }
});

// GET /onboarding/prospects/:id/prd-html
// Returns the PRD rendered as a full HTML document. Dashboard embeds this in
// an iframe so the PRD's own dark theme + scoped CSS don't collide with the
// dashboard chrome. No auth — the prospect ID is unguessable, and this is
// internal-network-y in practice (dashboard → Oracle).
app.get("/onboarding/prospects/:id/prd-html", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { prdData: true, contactName: true },
    });
    if (!prospect) {
      res.status(404).type("text/html").send("<p>Prospect not found.</p>");
      return;
    }
    if (!prospect.prdData) {
      res.status(202).type("text/html").send(`<!doctype html><html><body style="font-family:system-ui;padding:40px;color:#a3a3a3;background:#0a0a0a;">
        <p>PRD not generated yet.</p>
        <p style="font-size:13px;color:#737373;margin-top:8px;">Atlas runs ~2 min after scope approval. Refresh in a moment.</p>
      </body></html>`);
      return;
    }
    const { renderPRD } = await import("./templates/prd/render.js");
    try {
      const html = renderPRD(prospect.prdData);
      res.type("text/html").send(html);
    } catch (err) {
      logger.warn("PRD render failed in prd-html endpoint", { prospectId, error: err });
      res.status(500).type("text/html").send(`<!doctype html><html><body style="font-family:system-ui;padding:40px;color:#fca5a5;background:#0a0a0a;">
        <p>PRD render failed. The stored data didn't match the schema — likely from a prompt change. Try regenerating.</p>
      </body></html>`);
    }
  } catch (error) {
    logger.error("prd-html endpoint failed", { error });
    res.status(500).type("text/html").send("<p>Internal error.</p>");
  }
});

// POST /onboarding/prospects/:id/prd-approve
// Sets prdApprovedAt = now. Idempotent — re-approval re-stamps.
// Side effect: auto-fires generate-quote so a draft is waiting for Kyle by
// the time he opens the dashboard quote page (~2 min after click).
app.post("/onboarding/prospects/:id/prd-approve", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { id: true, prdData: true, prdApprovedAt: true, quoteDraft: true },
    });
    if (!prospect) {
      res.status(404).json({ error: "Prospect not found" });
      return;
    }
    if (!prospect.prdData) {
      res.status(409).json({ error: "PRD not generated yet — nothing to approve" });
      return;
    }
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { prdApprovedAt: new Date(), lastActivityAt: new Date() },
    });
    logger.info("PRD approved", { prospectId: prospect.id });

    // Auto-fire quote draft if this is a fresh approval AND we don't already
    // have a quote draft from a prior approval (avoid re-drafting on idempotent
    // re-clicks).
    if (!prospect.prdApprovedAt && !prospect.quoteDraft) {
      const baseUrl = process.env.ORACLE_URL ?? `http://localhost:${PORT}`;
      fetch(`${baseUrl}/onboarding/prospects/${prospect.id}/generate-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch((err) => {
        logger.warn("Auto-fire generate-quote after PRD approval failed", { prospectId: prospect.id, err });
      });
    }

    res.json({ status: "prd_approved", prospectId: prospect.id });
  } catch (error) {
    logger.error("PRD approve failed", { error });
    res.status(500).json({ error: "PRD approve failed" });
  }
});

// ===========================================================================
// QUOTE — Atlas drafts → Kyle reviews/edits → sends → prospect approves/denies
// ===========================================================================
//
// Triggered automatically when Kyle approves the PRD (so a draft is waiting
// when he opens the dashboard a minute later). Atlas reads the approved PRD
// — that's the source of truth for scope + pricing recommendation — and
// emits QuoteData JSON.
//
// Kyle reviews + edits the draft in the dashboard (/prospects/:id/quote),
// then clicks Send → flips status to quote_sent, emails the prospect a slim
// teaser linking to /quotes/[token] on the portal where they Approve or Deny.
//
// Same JSON-contract pattern as proposal + PRD: structured shape, Zod
// validate, retry once on failure, store to Prospect.quoteDraft.

app.post("/onboarding/prospects/:id/generate-quote", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");
    // Optional operator instructions ("increase the price by 30%", "tighten
    // the scope items") — folded into the quote prompt as an override section.
    const operatorNotes =
      typeof (req.body as { notes?: unknown })?.notes === "string"
        ? ((req.body as { notes: string }).notes ?? "").slice(0, 2000)
        : undefined;

    const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) {
      res.status(404).json({ error: "Prospect not found" });
      return;
    }
    if (prospect.status === "archived" || prospect.status === "ghosted") {
      res.status(403).json({ error: "Prospect onboarding is closed" });
      return;
    }
    if (!prospect.prdData) {
      res.status(409).json({ error: "PRD must be generated before quote can be drafted" });
      return;
    }

    const atlas = await prisma.agent.findUnique({
      where: { email: "atlas@ambitt.agency" },
      select: { id: true, clientId: true, name: true, status: true },
    });
    if (!atlas || atlas.status !== "active") {
      res.status(500).json({ error: "Atlas is not seeded or not active" });
      return;
    }

    const threadId = `prospect-${prospect.id}-quote`;
    const { renderQuote, parseAtlasQuoteOutput, QuoteValidationError } = await import("./templates/quote/render.js");
    const { runFunnelTask } = await import("./funnel-fable/hybrid.js");

    const pass1Result = await runFunnelTask({
      kind: "quote",
      legacyAgentId: atlas.id,
      prospectId: prospect.id,
      senderEmail: prospect.email,
      threadId,
      userMessage: buildAtlasQuotePrompt(prospect, operatorNotes),
    });
    const pass1 = { response: pass1Result.responseText };
    logger.info("Quote pass 1 routed", {
      prospectId: prospect.id,
      via: pass1Result.via,
      sessionId: pass1Result.sessionId,
      hasOperatorNotes: Boolean(operatorNotes),
    });

    const QUOTE_MAX_RETRY_ATTEMPTS = 2;

    const tryValidate = (raw: string): { data: unknown; html: string } => {
      const parsed = parseAtlasQuoteOutput(raw);
      if (parsed === null) {
        throw new QuoteValidationError([
          { path: [], code: "custom", message: "No JSON block found in response" } as any,
        ]);
      }
      const html = renderQuote(parsed);
      return { data: parsed, html };
    };

    const buildQuoteCorrection = (issues: { path: PropertyKey[]; message: string }[]) => {
      const issueList = issues
        .map((i, n) => `${n + 1}. ${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
        .join("\n");
      return `Your previous quote didn't pass schema validation. Issues:
${issueList}

REMINDER — the EXACT schema your output must match (authoritative; do NOT invent field names):

\`\`\`ts
interface QuoteData {
  subject: string;
  greeting: { name: string; body: string };
  hero: { label: string; title: string; subtitle: string };
  pricing: {
    setupCents: number;      // integer cents, e.g. 50000 = $500
    monthlyCents: number;    // integer cents
    tierLabel: string;       // e.g. "Growth tier"
    summary: string;         // 1-3 sentences
  };
  scopeOfWork: {
    intro?: string;
    items: Array<{
      title: string;
      description: string;
      kind: "integration" | "custom_code" | "automation" | "prompt" | "testing" | "launch";
    }>;
  };
  monthlyIncludes: string[];   // 3-6 bullets
  notIncluded: string[];       // 2-5 bullets
  timeline: { buildWindow: string; description: string };
  terms: { validity: string; paymentTerms: string; cancellation: string };
  cta: {
    headline: string;
    subtext: string;
    approveLabel: string;
    approveUrl: string;
    denyLabel: string;
    denyUrl: string;
  };
  footer: { domain: string; location: string; note?: string };
}
\`\`\`

Re-emit the COMPLETE QuoteData JSON matching this exact shape. Output ONLY the JSON object — starts with \`{\`, ends with \`}\`. No commentary, no code fences, no markdown.`;
    };

    let result: { data: unknown; html: string };
    let lastResponse = pass1.response;
    let quoteAttempt = 0;

    while (true) {
      try {
        result = tryValidate(lastResponse);
        break;
      } catch (err) {
        if (!(err instanceof QuoteValidationError)) throw err;
        quoteAttempt++;
        const issuesPreview = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        if (quoteAttempt > QUOTE_MAX_RETRY_ATTEMPTS) {
          logger.error("Atlas exhausted quote retries — generation aborted", {
            prospectId: prospect.id,
            attempts: quoteAttempt,
            finalIssues: issuesPreview,
            finalResponsePreview: lastResponse.slice(0, 500),
          });
          throw err;
        }
        logger.warn(`Atlas quote attempt ${quoteAttempt} JSON invalid — retrying`, {
          prospectId: prospect.id,
          attempt: quoteAttempt,
          maxAttempts: QUOTE_MAX_RETRY_ATTEMPTS,
          issues: issuesPreview,
        });
        const passNResult = await runFunnelTask({
          kind: "quote",
          legacyAgentId: atlas.id,
          prospectId: prospect.id,
          senderEmail: prospect.email,
          threadId,
          userMessage: buildQuoteCorrection(err.issues),
        });
        lastResponse = passNResult.responseText;
      }
    }

    await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        quoteDraft: result.data as object,
        // Don't change status — quote_pending until Kyle explicitly Sends.
        // Don't set quoteSentAt — that's the Send action's job.
        lastActivityAt: new Date(),
      },
    });

    try {
      const dashBase = process.env.DASHBOARD_URL ?? "https://dashboard.ambitt.agency";
      await notifyOps({
        atlasId: atlas.id,
        atlasName: atlas.name,
        subject: `Quote draft ready — ${prospect.contactName ?? "prospect"} (${prospect.businessName ?? "—"})`,
        html: renderQuoteDraftReadyNotice(prospect, dashBase),
      });
    } catch (err) {
      logger.warn("Quote-draft-ready ops notification failed", { prospectId: prospect.id, error: err });
    }

    logger.info("Quote draft generated", { prospectId: prospect.id });
    res.json({ status: "quote_drafted", prospectId: prospect.id });
  } catch (error) {
    if (error instanceof Error && error.name === "QuoteValidationError") {
      const issues = (error as Error & { issues?: Array<{ path: (string | number)[]; message: string }> }).issues ?? [];
      logger.warn("Quote generation: Atlas output failed validation after retry", {
        prospectId: req.params.id,
        issues: issues.map((i) => `${(i.path ?? []).join(".") || "(root)"}: ${i.message}`),
      });
      res.status(422).json({
        error: "Atlas couldn't produce a valid quote",
        reason: "Both attempts failed schema validation.",
        issues: issues.map((i) => ({ path: (i.path ?? []).join(".") || "(root)", message: i.message })),
      });
      return;
    }
    logger.error("Quote generation failed", { error });
    res.status(500).json({ error: "Quote generation failed" });
  }
});

// GET /onboarding/prospects/:id/quote-html
// Renders stored quoteDraft as a full HTML doc. Used by:
//   - dashboard iframe preview
//   - portal /quotes/[token] hosted page (which proxies through to here)
app.get("/onboarding/prospects/:id/quote-html", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { quoteDraft: true },
    });
    if (!prospect) {
      res.status(404).type("text/html").send("<p>Prospect not found.</p>");
      return;
    }
    if (!prospect.quoteDraft) {
      res.status(202).type("text/html").send(`<!doctype html><html><body style="font-family:system-ui;padding:40px;color:#737373;">
        <p>Quote not drafted yet.</p>
        <p style="font-size:13px;color:#a3a3a3;margin-top:8px;">Atlas drafts ~2 min after PRD approval. Refresh in a moment.</p>
      </body></html>`);
      return;
    }
    const { renderQuote } = await import("./templates/quote/render.js");
    try {
      const html = renderQuote(prospect.quoteDraft);
      res.type("text/html").send(html);
    } catch (err) {
      logger.warn("Quote render failed in quote-html endpoint", { prospectId, error: err });
      res.status(500).type("text/html").send(`<!doctype html><html><body style="font-family:system-ui;padding:40px;color:#dc2626;">
        <p>Quote render failed. The stored data didn't match the schema — likely from a prompt change. Try regenerating the quote draft from the dashboard.</p>
      </body></html>`);
    }
  } catch (error) {
    logger.error("quote-html endpoint failed", { error });
    res.status(500).type("text/html").send("<p>Internal error.</p>");
  }
});

// POST /onboarding/prospects/:id/quote-save
// Saves edits to the quote draft. Body is the full QuoteData JSON. We
// validate before writing so Kyle can't save something that won't render.
app.post("/onboarding/prospects/:id/quote-save", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { id: true, status: true },
    });
    if (!prospect) {
      res.status(404).json({ error: "Prospect not found" });
      return;
    }
    const { renderQuote, QuoteValidationError } = await import("./templates/quote/render.js");
    try {
      renderQuote(req.body); // validates via Zod, throws if invalid
    } catch (err) {
      if (err instanceof QuoteValidationError) {
        res.status(422).json({
          error: "Quote data failed validation",
          issues: err.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })),
        });
        return;
      }
      throw err;
    }
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { quoteDraft: req.body, lastActivityAt: new Date() },
    });
    res.json({ status: "quote_saved", prospectId: prospect.id });
  } catch (error) {
    logger.error("Quote save failed", { error });
    res.status(500).json({ error: "Quote save failed" });
  }
});

// POST /onboarding/prospects/:id/quote-send
// Kyle reviewed + edited the draft, hits Send. Flips status to quote_sent,
// stamps quoteSentAt, fires the prospect-facing teaser email.
app.post("/onboarding/prospects/:id/quote-send", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");
    const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) {
      res.status(404).json({ error: "Prospect not found" });
      return;
    }
    if (!prospect.quoteDraft) {
      res.status(409).json({ error: "No quote draft to send" });
      return;
    }
    if (prospect.status === "archived" || prospect.status === "ghosted") {
      res.status(403).json({ error: "Prospect onboarding is closed" });
      return;
    }

    const atlas = await prisma.agent.findUnique({
      where: { email: "atlas@ambitt.agency" },
      select: { id: true, name: true, status: true },
    });
    if (!atlas || atlas.status !== "active") {
      res.status(500).json({ error: "Atlas is not seeded or not active" });
      return;
    }

    const quoteData = prospect.quoteDraft as Record<string, unknown>;
    const subject = typeof quoteData.subject === "string" ? quoteData.subject : "Your custom agent quote";
    const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";
    const quoteUrl = `${portalBase}/quotes/${prospect.token}`;

    const { sendEmail } = await import("../shared/email.js");
    await sendEmail({
      agentId: atlas.id,
      agentName: atlas.name,
      to: prospect.email,
      subject,
      html: renderQuoteTeaserEmail(prospect, quoteUrl, portalBase),
      replyToAgentId: atlas.id,
      prospectId: prospect.id,
      emailType: "quote_teaser",
    });

    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { status: "quote_sent", quoteSentAt: new Date(), lastActivityAt: new Date() },
    });

    logger.info("Quote sent", { prospectId: prospect.id });
    res.json({ status: "quote_sent", prospectId: prospect.id });
  } catch (error) {
    logger.error("Quote send failed", { error });
    res.status(500).json({ error: "Quote send failed" });
  }
});

// POST /onboarding/prospects/:id/quote-decided
// Fired by the portal's /quotes/[token]/approve and /deny routes (the portal
// already wrote the Prisma status flip; this is the operator-side
// notification + central log).
app.post("/onboarding/prospects/:id/quote-decided", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");
    const { decision, reason } = req.body as { decision?: "approved" | "denied"; reason?: string };
    if (decision !== "approved" && decision !== "denied") {
      res.status(400).json({ error: "decision must be 'approved' or 'denied'" });
      return;
    }
    const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) {
      res.status(404).json({ error: "Prospect not found" });
      return;
    }
    const atlas = await prisma.agent.findUnique({
      where: { email: "atlas@ambitt.agency" },
      select: { id: true, name: true },
    });
    if (atlas) {
      try {
        await notifyOps({
          atlasId: atlas.id,
          atlasName: atlas.name,
          subject:
            decision === "approved"
              ? `🎉 Quote APPROVED — ${prospect.contactName ?? "prospect"} (${prospect.businessName ?? "—"})`
              : `Quote denied — ${prospect.contactName ?? "prospect"} (${prospect.businessName ?? "—"})`,
          html: renderQuoteDecidedNotice(prospect, decision, reason),
        });
      } catch (err) {
        logger.warn("Quote-decided ops notification failed", { prospectId: prospect.id, error: err });
      }
    }
    logger.info("Quote decided", { prospectId: prospect.id, decision });

    // Auto-fire Atlas-on-Fable build on accept. Fire-and-forget; the operator
    // can still hit Convert+Scaffold (manual path) if Fable refuses, so we
    // swallow errors here rather than failing the funnel.
    if (decision === "approved" && prospect.prdData && prospect.prdApprovedAt && prospect.quoteDraft) {
      void (async () => {
        try {
          // Skip if a build is already in flight for this prospect (e.g. the
          // operator pre-clicked "Run Fable" before the portal callback).
          const existing = await prisma.build.findFirst({
            where: { prospectId: prospect.id, status: { in: ["queued", "running"] } },
            select: { id: true },
          });
          if (existing) {
            logger.info("Build auto-fire skipped: already in flight", {
              prospectId: prospect.id,
              existingBuildId: existing.id,
            });
            return;
          }
          const budgetCents = Number(process.env.FABLE_BUILD_BUDGET_CENTS ?? "20000");
          const build = await prisma.build.create({
            data: { prospectId: prospect.id, status: "queued", budgetCents },
          });
          logger.info("Build auto-fire on quote-accept", {
            buildId: build.id,
            prospectId: prospect.id,
          });
          const { kickoffBuild } = await import("./builds/orchestrator.js");
          await kickoffBuild(build.id);
        } catch (err) {
          logger.error("Build auto-fire failed (graceful, operator can use Convert+Scaffold)", {
            prospectId: prospect.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }

    res.json({ status: "ok" });
  } catch (error) {
    logger.error("quote-decided endpoint failed", { error });
    res.status(500).json({ error: "quote-decided failed" });
  }
});

// ===========================================================================
// CONVERT — Prospect → Client + scaffold Agent (Phase D)
// ===========================================================================
//
// Phase C (Stripe checkout) is deferred. This endpoint is the conversion
// logic that Phase C will eventually wrap in a Stripe webhook. Today it's
// triggered manually from the dashboard after quote acceptance.
//
// Atomic transaction:
//   1. Find-or-create Client (by email). Reuses an existing Client row if
//      one already shares the prospect's email — common when Kyle had
//      previously seeded the client manually.
//   2. Create Agent in pending_approval, seeded from Prospect.prdData
//      (system prompt, schedule, autonomy, memory) + Prospect.quoteDraft
//      (pricing — quote is the binding commitment, NOT the PRD draft).
//   3. Link Prospect.convertedClientId.
//   4. Best-effort: email the new client a tools-handoff email.
//
// Idempotent: re-calling on an already-converted prospect is a no-op
// (returns the existing ids).
//
// Agent email collisions resolved by appending a numeric suffix (e.g.
// marco@ → marco-2@ if Marco is taken).
app.post("/onboarding/prospects/:id/convert", async (req: Request, res: Response) => {
  try {
    const prospectId = param(req, "id");

    const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) {
      res.status(404).json({ error: "Prospect not found" });
      return;
    }
    if (prospect.status === "archived" || prospect.status === "ghosted") {
      res.status(403).json({ error: "Prospect onboarding is closed" });
      return;
    }
    if (prospect.status !== "accepted") {
      res.status(409).json({
        error: "Prospect must be at status 'accepted' before conversion",
        currentStatus: prospect.status,
      });
      return;
    }
    if (!prospect.prdData) {
      res.status(409).json({ error: "Cannot convert — PRD missing" });
      return;
    }
    if (!prospect.quoteDraft) {
      res.status(409).json({ error: "Cannot convert — quote missing" });
      return;
    }

    // Already converted — return existing ids (idempotent).
    if (prospect.convertedClientId) {
      const existingAgent = await prisma.agent.findFirst({
        where: { clientId: prospect.convertedClientId },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, name: true, status: true },
      });
      res.json({
        status: "already_converted",
        clientId: prospect.convertedClientId,
        agentId: existingAgent?.id ?? null,
        agent: existingAgent,
      });
      return;
    }

    const fd = (prospect.formData ?? {}) as Record<string, unknown>;
    const prd = prospect.prdData as unknown as PRDShape;
    const quote = prospect.quoteDraft as unknown as QuoteShape;

    // Find-or-create Client.
    const clientEmail = prospect.email.toLowerCase();
    let client = await prisma.client.findUnique({ where: { email: clientEmail } });
    if (!client) {
      const { encrypt } = await import("../shared/encryption.js");
      client = await prisma.client.create({
        data: {
          email: clientEmail,
          contactName: prospect.contactName ?? prd.identity.ownerContactName,
          preferredName: stringField(fd, "preferredName") || (prospect.contactName ?? "").split(/\s+/)[0] || null,
          businessName: prospect.businessName ?? prd.identity.ownerBusinessName,
          industry: prd.identity.ownerIndustry || stringField(fd, "industry") || "—",
          businessGoal: stringField(fd, "agentPitch") || prd.summary || prd.identity.agentRole,
          website: prospect.website ?? null,
          brandVoice: stringField(fd, "brandVoice") || "Friendly, conversational, plain language.",
          preferredChannel: (prd.channel ?? "email").toLowerCase(),
          // Stripe deferred (Phase C) — sentinel matches the platform-client pattern
          // (Ambitt internal uses "platform_ambitt"). When Phase C wires Stripe,
          // the real customer id replaces this on first checkout.
          stripeCustomerId: `pending_stripe_${prospect.id}`,
          billingEmail: clientEmail,
          billingStatus: "active",
        },
      });
      void encrypt; // encrypt is used below for clientMemoryObject, kept-imported here for clarity
      logger.info("Convert: created Client", { clientId: client.id, email: clientEmail });
    } else {
      logger.info("Convert: reusing existing Client", { clientId: client.id, email: clientEmail });
    }

    // Resolve Agent email — append -2, -3, etc. if the slug is taken.
    const baseSlug = (prd.identity.agentEmailSlug || "agent").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    let agentEmail = `${baseSlug}@ambitt.agency`;
    let suffix = 2;
    while (await prisma.agent.findUnique({ where: { email: agentEmail }, select: { id: true } })) {
      agentEmail = `${baseSlug}-${suffix}@ambitt.agency`;
      suffix++;
      if (suffix > 50) {
        res.status(500).json({ error: "Could not find an available agent email slug after 50 tries" });
        return;
      }
    }

    // Build the Agent row from PRD + Quote.
    const { encrypt } = await import("../shared/encryption.js");
    const cronExpression = prd.schedule.mode === "scheduled" && prd.schedule.cron ? prd.schedule.cron : "";
    const autonomyLevel = prd.autonomy === "autonomous" ? "autonomous" : "supervised";
    const purposeSummary = `${prd.identity.agentRole}. ${prd.summary}`.trim();

    const agent = await prisma.agent.create({
      data: {
        clientId: client.id,
        name: prd.identity.agentName,
        email: agentEmail,
        personality: prd.systemPrompt,
        purpose: purposeSummary,
        agentType: "client.custom",
        acceptFromProspects: false,
        tools: [],
        schedule: cronExpression,
        autonomyLevel,
        timezone: prd.schedule.timezone || "America/New_York",
        deliveryFormat: "email_summary",
        tone: "conversational",
        emailFrequency: "immediate",
        primaryModel: "claude-sonnet-4-6",
        analyticsModel: "gemini",
        creativeModel: "gpt-4o",
        status: "pending_approval", // existing scaffold-approval flow takes over here
        // Born in dry-run mode — operator dry-runs scenarios from the
        // dashboard, validates behavior, THEN approves (which flips dryRun
        // back to false). Safer default than "active straight out of the gate."
        dryRun: true,
        // Quote pricing wins over PRD pricing — quote is what the client accepted.
        monthlyRetainerCents: quote.pricing.monthlyCents,
        setupFeeCents: quote.pricing.setupCents,
        pricingTier: prd.pricing.suggestedTier,
        interactionLimit: -1, // until Phase C, no real limit
        budgetMonthlyCents: 100000, // $1000 internal budget cap as guardrail
        clientMemoryObject: encrypt(
          JSON.stringify({
            role: prd.identity.agentRole,
            ownerBusiness: prd.identity.ownerBusinessName,
            ownerIndustry: prd.identity.ownerIndustry,
            notes: prd.memoryNotes,
            hardLimits: prd.hardLimits,
            successMetrics: prd.successMetrics,
            convertedFromProspect: prospect.id,
          })
        ),
      },
    });
    logger.info("Convert: created Agent", { agentId: agent.id, email: agentEmail, clientId: client.id });

    // Link Prospect → Client.
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { convertedClientId: client.id, lastActivityAt: new Date() },
    });

    // NOTE: Convert is intentionally silent from the client's perspective.
    // No tools-handoff email fires here — that was premature in practice
    // (client gets "ready to work" framing before the agent is actually
    // functional). The operator decides when to invite the client to
    // connect tools (via portal link, Zoom co-setup, or manual outreach).
    // The first client-facing email is the approval-time welcome — gated
    // by approveAgent()'s no-tools-connected guard so it can only fire
    // when the agent is actually ready.

    // Ops notification to Kyle.
    try {
      const atlas = await prisma.agent.findUnique({
        where: { email: "atlas@ambitt.agency" },
        select: { id: true, name: true },
      });
      if (atlas) {
        const dashBase = process.env.DASHBOARD_URL ?? "https://dashboard.ambitt.agency";
        await notifyOps({
          atlasId: atlas.id,
          atlasName: atlas.name,
          subject: `Converted — ${prospect.contactName ?? "prospect"} → Client + ${agent.name}`,
          html: renderConvertedNotice(prospect, client, agent, dashBase),
        });
      }
    } catch (err) {
      logger.warn("Convert: ops notify failed", { prospectId: prospect.id, error: err });
    }

    res.json({
      status: "converted",
      clientId: client.id,
      agentId: agent.id,
      agentEmail,
    });
  } catch (error) {
    logger.error("Convert failed", { error });
    res.status(500).json({ error: "Convert failed" });
  }
});

// ---------------------------------------------------------------------------
// Convert helpers
// ---------------------------------------------------------------------------

// Minimal shapes we read off Prospect.prdData / Prospect.quoteDraft. Kept
// here (not imported from the templates) so changes to the template Zod
// schemas don't break this endpoint silently — these are the fields the
// scaffold actually depends on.
interface PRDShape {
  summary: string;
  identity: {
    agentName: string;
    agentEmailSlug: string;
    agentRole: string;
    ownerBusinessName: string;
    ownerContactName: string;
    ownerEmail: string;
    ownerIndustry: string;
  };
  systemPrompt: string;
  tools: Array<{ name: string; source: string }>;
  schedule: { mode: "scheduled" | "triggered"; cron?: string; timezone: string };
  channel: string;
  autonomy: string;
  hardLimits: string[];
  successMetrics: string[];
  memoryNotes: string;
  pricing: {
    suggestedTier: string;
    suggestedMonthlyCents: number;
    suggestedSetupCents: number;
  };
}
interface QuoteShape {
  pricing: {
    setupCents: number;
    monthlyCents: number;
    tierLabel: string;
  };
}

function stringField(obj: Record<string, unknown>, key: string): string {
  return typeof obj[key] === "string" ? (obj[key] as string) : "";
}

// INTENTIONALLY UNUSED. This template is the "let's get your tools connected"
// email — previously auto-fired at Convert+Scaffold, which sent it before the
// agent was actually ready to work (premature, per "no premature emails"
// principle, 2026-05-31). Kept here as a ready-to-go template for an
// operator-initiated "send tools-invite" trigger (e.g. a dashboard button on
// the agent detail page when the operator decides to invite the client to
// connect their tools). Do NOT re-wire this into any auto-fire path without
// explicit operator gating.
function renderToolsHandoffEmail(input: {
  firstName: string;
  agentName: string;
  agentRole: string;
  toolsUrl: string;
  portalBase: string;
  toolsList: Array<{ name: string; source: string }>;
}): string {
  const composioCount = input.toolsList.filter((t) => t.source === "composio").length;
  const customCount = input.toolsList.length - composioCount;
  const toolSummary =
    composioCount > 0
      ? `${composioCount} integration${composioCount === 1 ? "" : "s"} need${composioCount === 1 ? "s" : ""} your OAuth (Gmail-style click-through)${customCount > 0 ? "; the rest we'll wire up on our end" : ""}.`
      : "We'll wire all the tools on our end — nothing for you to connect.";
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #171717;">
  <div style="margin-bottom: 28px;">
    <img src="${input.portalBase}/brand/ambitt-agents-lockup.svg" alt="Ambitt Agents" width="220" height="27" style="display: block; max-width: 220px; height: auto;" />
  </div>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.6;">Hey ${input.firstName},</p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.6;">
    Great — we're getting started on <strong style="color: #171717;">${input.agentName}</strong> (${input.agentRole}).
  </p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 24px; line-height: 1.6;">
    ${toolSummary} The link below opens your agent's tools page. Click each integration to authorize — takes about 30 seconds each.
  </p>
  <div style="margin: 0 0 28px;">
    <a href="${input.toolsUrl}" style="display: inline-block; padding: 14px 30px; background: #00b3b3; color: #ffffff; text-decoration: none; border-radius: 9px; font-size: 15px; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0, 179, 179, 0.28);">Connect tools →</a>
  </div>
  <p style="font-size: 13px; color: #737373; margin: 0 0 8px; line-height: 1.6;">
    Once tools are connected, we'll finish the build internally and let you know when ${input.agentName} is ready to start running.
  </p>
  <p style="font-size: 13px; color: #a3a3a3; margin: 32px 0 0;">— Atlas, your onboarding agent at Ambitt Agents</p>
</div>`;
}

function renderConvertedNotice(
  prospect: { id: string; contactName: string | null; businessName: string | null; email: string },
  client: { id: string; email: string },
  agent: { id: string; name: string; email: string },
  dashBase: string
): string {
  const contact = prospect.contactName ?? "(no name)";
  const business = prospect.businessName ?? "—";
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px 24px; background: #ffffff; color: #171717;">
  <p style="font-size: 14px; color: #404040; margin: 0 0 14px; line-height: 1.6;"><strong style="color: #10b981;">Converted.</strong> Prospect is now a Client + Agent is scaffolded in pending_approval.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 13.5px;">
    <tr><td style="padding: 4px 0; color: #737373; width: 100px;">Contact</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(contact)} &lt;${escapeHtmlBasic(prospect.email)}&gt;</td></tr>
    <tr><td style="padding: 4px 0; color: #737373;">Business</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(business)}</td></tr>
    <tr><td style="padding: 4px 0; color: #737373;">Client</td><td style="padding: 4px 0; color: #171717; font-family: 'SF Mono', Menlo, monospace; font-size: 12px;">${client.id}</td></tr>
    <tr><td style="padding: 4px 0; color: #737373;">Agent</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(agent.name)} &lt;${escapeHtmlBasic(agent.email)}&gt;</td></tr>
  </table>
  <div style="margin: 0 0 12px;">
    <a href="${dashBase}/agents/${agent.id}" style="display: inline-block; padding: 10px 18px; background: #171717; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 600;">Open agent →</a>
  </div>
  <p style="font-size: 12.5px; color: #a3a3a3; margin: 18px 0 0;">Next: wire any custom tools internally, review the scaffold-approval queue, then approve to go live.</p>
</div>`;
}

function buildAtlasQuotePrompt(
  prospect: {
    id: string;
    email: string;
    token: string;
    contactName: string | null;
    businessName: string | null;
    prdData: unknown;
  },
  operatorNotes?: string
): string {
  const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";
  const approveUrl = `${portalBase}/quotes/${prospect.token}/approve`;
  const denyUrl = `${portalBase}/quotes/${prospect.token}/deny`;
  const prdJson = JSON.stringify(prospect.prdData, null, 2);

  const operatorSection = operatorNotes?.trim()
    ? `
# OPERATOR INSTRUCTIONS — these OVERRIDE any conflicting rule below
The operator reviewed the previous draft and wants changes:

"""
${operatorNotes.trim()}
"""

Apply these faithfully. If they direct a pricing change (e.g. "increase the price by 30%", "charge $1,500/mo"), the new numbers REPLACE the PRD's pricing block — percentage changes apply to the PRD's pricing as the base. Round to clean price points (ending in 99 or 50) and keep pricing.summary consistent with the new numbers. Never mention the operator, an instruction, a markup, or a price change in any client-facing copy — present the final numbers as if they were always the price.

CENTS MATH — get this exactly right: setupCents and monthlyCents are integer cents = dollars × 100. $3,250 setup → 325000. $1,299/mo → 129900. Before emitting, divide each cents value by 100 and confirm it equals the dollar figure you wrote in pricing.summary — if they don't match, fix the cents value.
`
    : "";

  return `The PRD for this prospect has been approved. Now draft the quote — the client-facing artifact they'll Approve or Deny on a hosted page.
${operatorSection}

Output a single JSON object matching the QuoteData TypeScript contract below. JSON only — no preamble, no code fences, no commentary.

# Prospect basics
- Email: ${prospect.email}
- Name: ${prospect.contactName ?? "(no name)"}
- Business: ${prospect.businessName ?? "—"}

# Approved PRD (the source of truth)
Use the PRD as the basis for everything. Don't invent new tools/scope — translate what's in the PRD into client-readable language.

\`\`\`json
${prdJson}
\`\`\`

# CTA URLs to use VERBATIM
- cta.approveUrl: ${approveUrl}
- cta.denyUrl: ${denyUrl}

# QuoteData TypeScript contract
\`\`\`ts
interface QuoteData {
  subject: string;                              // email subject line — e.g. "Your custom agent — quote inside"
  greeting: { name: string; body: string };     // name = prospect's first name; body = 1-2 sentence opener
  hero: {
    label: string;                              // "YOUR CUSTOM AGENT QUOTE" or similar
    title: string;                              // "Hawk for Cedar Ridge Commercial." Supports <br>.
    subtitle: string;                           // one-line summary: "role · mode · cadence"
  };
  pricing: {
    setupCents: number;                         // integer cents = dollars × 100 ($3,250 → 325000) — match PRD's suggestedSetupCents unless operator overrides
    monthlyCents: number;                       // integer cents = dollars × 100 ($1,299/mo → 129900) — match PRD's suggestedMonthlyCents unless operator overrides
    tierLabel: string;                          // "Growth tier" / "Starter tier"
    summary: string;                            // 1-3 sentences explaining what they're paying for; dollar amounts here MUST equal cents/100
  };
  scopeOfWork: {
    intro?: string;                             // optional sentence — "Here's everything that's included."
    items: Array<{
      title: string;                            // short — "Custom outreach scoring function" or "Gmail integration"
      description: string;                      // 1-2 sentences plain English
      kind: "integration" | "custom_code" | "automation" | "prompt" | "testing" | "launch";
    }>;                                         // 3-15 items
  };
  monthlyIncludes: string[];                    // 3-8 bullets — what's covered by the recurring retainer
  notIncluded: string[];                        // 2-6 bullets — what's NOT covered. Set clear expectations.
  timeline: {
    buildWindow: string;                        // e.g. "3-4 weeks" — derived from sum of PRD.buildPlan[].estimatedDays
    description: string;                        // 1-2 sentences: what happens after approval
  };
  terms: {
    validity: string;                           // "Quote valid for 30 days from send"
    paymentTerms: string;                       // "Setup fee due at signature; monthly retainer billed first of each month from launch"
    cancellation: string;                       // "Cancel anytime with 30 days notice; setup fee is non-refundable once build starts"
  };
  cta: {
    headline: string;                           // "Ready to build this?" — warm but clear
    subtext: string;                            // 1-2 sentence subhead
    approveLabel: string;                       // "Approve and start"
    approveUrl: string;                         // VERBATIM from above
    denyLabel: string;                          // "Not right now"
    denyUrl: string;                            // VERBATIM from above
  };
  footer: {
    domain: string;                             // "ambitt.agency"
    location: string;                           // "Dallas, TX"
    note?: string;                              // optional one-line
  };
}
\`\`\`

# Hard rules
- Output ONLY the JSON object. No preamble, no code fences.
- Pricing numbers MUST match the PRD's pricing block exactly — UNLESS the OPERATOR INSTRUCTIONS section above directs a pricing change, in which case the operator's numbers win.
- scopeOfWork.items: translate PRD.buildPlan + PRD.tools into client-readable scope items. The CLIENT is reading this — write descriptions a non-technical person can follow. e.g. PRD's "Wire Gmail OAuth" becomes "Gmail integration" with description "We'll connect your Gmail so the agent can send and log emails from your address." Don't include internal/operator-only items like "Internal QA dry runs" unless they're genuinely something the prospect should know about.
- timeline.buildWindow: pick a range based on the SUM of PRD.buildPlan[].estimatedDays. Add some buffer. Examples: <5 days total → "1-2 weeks"; 5-15 days → "2-4 weeks"; 15-30 days → "4-6 weeks"; 30+ days → "6-8 weeks". Stay within the platform-promised "2-8 weeks" window.
- monthlyIncludes: what they get for the recurring retainer — typically things like "Daily agent runs", "Email/Slack escalation", "Ongoing prompt refinement based on results", "Tool maintenance when APIs change", "Monthly performance review".
- notIncluded: set boundaries — typical: "Third-party API costs (e.g. Composio premium tiers) billed at cost", "Scope changes mid-build (priced separately)", "Custom tools beyond the listed scope", "Live training sessions beyond initial handoff".
- cta.approveUrl + cta.denyUrl must match the URLs above VERBATIM.
- Speak as "we" / "our team" — never name Kyle or any individual operator.
- Use the prospect's preferred name in greeting (from the PRD's identity block or the prospect's contactName).
- pricing.summary can reference market context naturally ("comparable to a junior contractor at $4-5k/mo loaded") but don't list specific competitor names — that's internal PRD context, the quote should feel value-led not comparison-shop-led.
- No marketing speak. Read like a contract from someone you trust, not a sales deck.`;
}

function renderQuoteDraftReadyNotice(
  prospect: { id: string; contactName: string | null; businessName: string | null; email: string },
  dashBase: string
): string {
  const quoteUrl = `${dashBase}/prospects/${prospect.id}/quote`;
  const contact = prospect.contactName ?? "(no name)";
  const business = prospect.businessName ?? "—";
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px 24px; background: #ffffff; color: #171717;">
  <p style="font-size: 14px; color: #404040; margin: 0 0 14px; line-height: 1.6;"><strong style="color: #00b3b3;">Quote draft ready.</strong> Review the numbers + scope, edit anything that needs polish, then hit Send.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 13.5px;">
    <tr><td style="padding: 4px 0; color: #737373; width: 100px;">Contact</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(contact)} &lt;${escapeHtmlBasic(prospect.email)}&gt;</td></tr>
    <tr><td style="padding: 4px 0; color: #737373;">Business</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(business)}</td></tr>
  </table>
  <div style="margin: 0 0 18px;">
    <a href="${quoteUrl}" style="display: inline-block; padding: 12px 22px; background: #00b3b3; color: #ffffff; text-decoration: none; border-radius: 9px; font-size: 14px; font-weight: 600;">Review quote →</a>
  </div>
</div>`;
}

function renderQuoteTeaserEmail(
  prospect: { contactName: string | null; businessName: string | null },
  quoteUrl: string,
  portalBase: string
): string {
  const firstName = (prospect.contactName ?? "").trim().split(/\s+/)[0] || "there";
  const businessLine = prospect.businessName ? ` for ${prospect.businessName}` : "";
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #171717;">
  <div style="margin-bottom: 28px;">
    <img src="${portalBase}/brand/ambitt-agents-lockup.svg" alt="Ambitt Agents" width="220" height="27" style="display: block; max-width: 220px; height: auto;" />
  </div>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.6;">Hey ${firstName},</p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 24px; line-height: 1.6;">
    Your custom agent quote${businessLine} is ready. It covers everything we're building, what's included monthly, the timeline, and terms.
  </p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 28px; line-height: 1.6;">
    Read it carefully. If it works for you, hit Approve and we'll get started. If not, hit "Not right now" and we'll close out cleanly.
  </p>
  <div style="margin: 0 0 32px;">
    <a href="${quoteUrl}" style="display: inline-block; padding: 14px 30px; background: #00b3b3; color: #ffffff; text-decoration: none; border-radius: 9px; font-size: 15px; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0, 179, 179, 0.28);">View your quote →</a>
  </div>
  <p style="font-size: 13px; color: #a3a3a3; margin: 32px 0 0;">— Atlas, your onboarding agent at Ambitt Agents</p>
</div>`;
}

function renderQuoteDecidedNotice(
  prospect: { id: string; contactName: string | null; businessName: string | null; email: string },
  decision: "approved" | "denied",
  reason: string | undefined
): string {
  const contact = prospect.contactName ?? "(no name)";
  const business = prospect.businessName ?? "—";
  const isApproved = decision === "approved";
  const headline = isApproved
    ? `<strong style="color: #10b981;">Quote APPROVED.</strong> Time to set up Stripe checkout (Phase C) and kick off the build.`
    : `<strong style="color: #f59e0b;">Quote denied.</strong> Follow up offline if you want to understand why or save the deal.`;
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px 24px; background: #ffffff; color: #171717;">
  <p style="font-size: 14px; color: #404040; margin: 0 0 14px; line-height: 1.6;">${headline}</p>
  <table style="width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 13.5px;">
    <tr><td style="padding: 4px 0; color: #737373; width: 100px;">Contact</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(contact)} &lt;${escapeHtmlBasic(prospect.email)}&gt;</td></tr>
    <tr><td style="padding: 4px 0; color: #737373;">Business</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(business)}</td></tr>
  </table>
  ${reason && !isApproved ? `<div style="background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.25); border-radius: 9px; padding: 12px 14px; margin-bottom: 18px; font-size: 13px; color: #92400e;"><div style="font-weight: 600; margin-bottom: 4px;">Reason they gave:</div>${escapeHtmlBasic(reason)}</div>` : ""}
</div>`;
}

function buildAtlasPRDPrompt(
  prospect: {
    id: string;
    email: string;
    token: string;
    contactName: string | null;
    businessName: string | null;
    role: string | null;
    website: string | null;
    formData: unknown;
  },
  regenNotes: string
): string {
  const fd = (prospect.formData ?? {}) as Record<string, unknown>;
  const get = (k: string) => (typeof fd[k] === "string" ? (fd[k] as string) : "");

  const sopFiles = Array.isArray(fd.sopFiles)
    ? (fd.sopFiles as Array<{ filename?: string; extractedText?: string }>)
    : [];
  const sopSections: string[] = [];
  if (get("sops").trim()) sopSections.push(`--- Pasted notes ---\n${get("sops").trim()}`);
  for (const f of sopFiles) {
    if (f.extractedText && f.extractedText.trim().length > 0) {
      sopSections.push(`--- File: ${f.filename ?? "upload"} ---\n${f.extractedText.trim()}`);
    }
  }
  const sopBlock = sopSections.length > 0 ? sopSections.join("\n\n") : "(They didn't paste or upload any SOPs.)";

  const toolList = (() => {
    const t = Array.isArray(fd.tools) ? (fd.tools as Array<{ source: string; slug?: string; name: string }>) : [];
    if (t.length === 0) return "(none selected)";
    return t.map((x) => `${x.name} [${x.source === "composio" ? `Composio:${x.slug ?? "?"}` : "custom"}]`).join(", ");
  })();

  const regenBlock = regenNotes
    ? `\n# Regeneration notes (apply these BEFORE re-emitting)\nKyle reviewed the previous PRD draft and asked for:\n${regenNotes}\n`
    : "";

  return `The scope of the agent we're going to build for this prospect has been approved. Now produce the internal PRD — the operator-facing spec we'll build from and price off. It is **internal only**; the prospect never sees it.

Output a single JSON object matching the AgentPRDData TypeScript contract below. JSON only — no preamble, no code fences, no commentary.

# Prospect basics
- Email: ${prospect.email}
- Name: ${prospect.contactName ?? "(not provided)"}
- Preferred name: ${get("preferredName") || prospect.contactName || "(not provided)"}
- Role: ${prospect.role ?? "(not provided)"}
- Business: ${prospect.businessName ?? "(not provided)"}
- Website: ${prospect.website ?? "(not provided)"}
- Industry / what their business does: ${get("industry") || "(not provided)"}

# The agent
- Their chosen agent name: ${get("agentName") || "(none — propose one fitting their brand)"}
- Their chosen agent role: ${get("agentRole") || "(none — infer from their pitch)"}
- One-sentence pitch (their words): ${get("agentPitch") || "(not provided)"}

# Intake answers
- Target audience: ${get("audienceTags") || "(none)"}${get("audienceDetail") ? ` (${get("audienceDetail")})` : ""}
- Today's handler: ${get("todayHandler") || "(not provided)"}${get("todayVsAgent") ? ` — ${get("todayVsAgent")}` : ""}
- Success outcomes: ${get("successOutcomes") || "(none selected)"}
- Success metrics (their numbers): ${get("successCriteria") || "(not provided)"}
- Run mode: ${get("cadence") || "(not provided)"}  — "On a schedule" means recurring cron; "When triggered" means inbound event.
- Volume: ${get("volume") || "(not provided)"}
- Communication channel: ${get("channel") || "(not provided)"}
- Autonomy preference: ${get("autonomy") || "(not provided)"}
- Tone tags: ${get("toneTags") || "(none)"}
- Brand voice samples: ${get("brandVoice") || "(not provided)"}
- Tools they listed: ${toolList}
- Never-do guardrails: ${get("neverDoTags") || "(none)"}
- Other rules: ${get("redLines") || "(not provided)"}

# Their SOPs
${sopBlock}
${regenBlock}
# AgentPRDData TypeScript contract
\`\`\`ts
interface AgentPRDData {
  summary: string;                              // one-line headline
  identity: {
    agentName: string;                          // e.g. "Hawk"
    agentEmailSlug: string;                     // lowercase + hyphens; becomes <slug>@ambitt.agency
    agentRole: string;                          // short role description
    ownerBusinessName: string;
    ownerContactName: string;
    ownerEmail: string;
    ownerIndustry: string;
  };
  systemPrompt: string;                         // 400-800 words. The actual prompt this agent will run with. Encode the client's playbook + brand voice + hard limits.
  tools: Array<{
    name: string;                               // human-readable, e.g. "Gmail"
    source: "composio" | "custom_browse" | "custom_platform_tool";
    slug?: string;                              // REQUIRED when source==="composio". Lowercase Composio app key.
    siteUrl?: string;                           // REQUIRED when source==="custom_browse".
    functionName?: string;                      // REQUIRED when source==="custom_platform_tool". snake_case TS function name.
    rationale: string;                          // 1-2 sentences: what this tool does for the agent.
    buildDays?: number;                         // honest day estimate. Only set for custom_* sources.
  }>;
  schedule: {
    mode: "scheduled" | "triggered";
    cron?: string;                              // standard 5-field cron. Only when mode==="scheduled".
    timezone: string;                           // IANA tz, e.g. "America/Chicago"
    triggerSpec?: string;                       // plain-English. Only when mode==="triggered".
  };
  channel: "email" | "slack" | "whatsapp";
  autonomy: "supervised" | "semi" | "autonomous";
  successMetrics: string[];                     // 1-5 concrete metrics
  hardLimits: string[];                         // each becomes a guardrail in the prompt
  memoryNotes: string;                          // 100-300 words. Compact paragraph of facts about the client / business / tone that should always be in working memory.
  pricing: {
    suggestedTier: "starter" | "growth" | "scale" | "enterprise";
    suggestedMonthlyCents: number;              // recurring retainer (integer cents)
    suggestedSetupCents: number;                // one-time setup (integer cents)
    reasoning: string;                          // 1-3 sentences explaining tier + numbers
    marketResearch: {
      summary: string;                          // 2-4 sentences: what the market for this agent looks like
      findings: Array<{                         // 3-8 concrete data points from your web_search results
        source: string;                         // "Reply.io Sales Engagement", "Junior SDR contractor (US)", "Lindy AI platform"
        priceRange: string;                     // "$99/mo per seat", "$1,500-2,500/mo", "$25-40/hr"
        note: string;                           // 1-2 sentences: how this compares to what we're proposing
      }>;
      replacementCost: string | null;           // "Junior SDR ~$3-5k/mo loaded cost (US small business)" — what the prospect would otherwise pay a human. null only if there's truly no human equivalent.
    };
  };
  risks: string[];                              // open questions / things Kyle should flag. Empty array is fine.
  buildPlan: Array<{
    number: number;                             // 1-based ordering
    title: string;
    description: string;
    owner: "ambitt" | "client";                 // "ambitt" = us; "client" = them (e.g. OAuth a tool)
    estimatedDays: number;
  }>;
}
\`\`\`

# Pricing tier reference (use as guidance, not gospel)
- starter: ~$499/mo. Low volume (<5 daily actions), no custom platform tools, 1-2 Composio tools.
- growth: ~$1499/mo. Medium volume (5-30 daily actions), 1 custom tool acceptable, 2-4 integrations.
- scale: ~$3499/mo. Higher volume, 2+ custom tools, complex flows, multi-tool orchestration.
- enterprise: $3499+/mo. Custom retainer, bespoke deep integration.

Setup fee scales with custom-tool work: ~$0 if all Composio, ~$1500 per custom_platform_tool, ~$1000 per custom_browse flow.

# REQUIRED: market research BEFORE pricing
Before you finalize the pricing block, run **web_search** to ground your numbers. Don't guess. At minimum:

1. **Competing agencies / platforms** — search for what other people charge for an agent doing this job. Examples: "${get("agentRole") || "lead generation"} agency pricing 2026", "AI ${get("agentRole") || "outreach"} tool pricing", or the specific category (e.g., "cold email SDR-as-a-service pricing", "AI customer support agent pricing 2026"). Pull 2-3 real data points.
2. **Replacement role cost** — what would the prospect pay a human to do this job? Search "${get("agentRole") || "the role"} contractor rate", "junior ${get("agentRole") || "SDR"} salary US small business", or whatever's appropriate. One data point is enough here.
3. **Category benchmarks** — search for what similar SaaS products charge in this space ("${(get("industry") || "this category").toLowerCase()} automation tools pricing", or any direct competitor you know of). Pull 1-2 more data points.

Take the **3-8 best data points** from those searches and put them in \`pricing.marketResearch.findings\`. Synthesize the overall picture in \`pricing.marketResearch.summary\` (2-4 sentences). Set \`pricing.marketResearch.replacementCost\` to the loaded monthly cost of the human alternative (null only if there genuinely isn't a human equivalent — rare).

THEN derive your BASELINE pricing from the research: typically below the replacement cost (so we're cheaper than hiring), in line with or slightly under comparable SaaS, and reflecting the buildPlan effort in the setup fee.

FINALLY apply the house pricing policy — this is standing policy, not optional:
- MONTHLY RETAINER — price by replacement-cost capture, per agent: the retainer
  should land at 20–30% of the loaded monthly cost of the human role this agent
  replaces (use pricing.marketResearch.replacementCost). Example: role loaded at
  $5,000/mo → quote $1,000–$1,500/mo. Pick where in the band based on scope
  complexity and how complete the replacement is (full role replacement → top
  of band; partial assist → bottom).
- Floor: never price below the published tier list price for the closest tier.
- SETUP FEE — derive from build effort as above, then mark up 30%.
- Round all numbers to clean price points (ending in 99 or 50 — e.g. $1,499/mo,
  $3,250 setup).
- Cents math: suggested*Cents fields are dollars × 100 ($1,499/mo → 149900;
  $3,250 → 325000). Double-check by dividing back by 100.
- Sanity ceiling: never breach the human replacement cost.
- NEVER mention capture targets, markups, or "policy" anywhere in the PRD or any
  client-facing copy. pricing.reasoning justifies the FINAL number on value and
  market findings, exactly as if it were the natural price.

The pricing.reasoning sentence must connect the suggested (final) numbers to specific findings from the research.

# Hard rules
- Output ONLY the JSON object. No prose before/after, no code fences.
- agentEmailSlug must be lowercase letters/numbers/hyphens only.
- systemPrompt must be a complete, deployable prompt (not a template) — write it as if it ships today. Include the agent's name + role + the client's specific situation + tone guidance + hard limits. Use first/second person as appropriate ("You are Hawk. You help Cedar Ridge...").
- Tools array: every tool the agent needs, including Composio ones the prospect already mentioned AND any platform tools/browse flows you're proposing. For custom_browse and custom_platform_tool, set buildDays honestly. For composio, you can omit buildDays.
- buildPlan: 4-10 concrete steps. Wiring Composio OAuth is a client step ("ambitt" owns code, "client" owns OAuth click-through). Writing custom tools is ambitt. Prompt tuning is ambitt.
- pricing.reasoning must reference at least one finding from pricing.marketResearch.findings explicitly. e.g., "Pricing at $999/mo undercuts Reply.io's $750/seat (their #2 tier) while still being well below the $4k/mo replacement cost of a junior SDR."
- pricing.marketResearch.findings: 3-8 real data points from your actual web_search calls. Source names should be real product/service/role names, not made up.
- risks: flag genuine concerns only — empty array if there are none. Don't manufacture risks.
- Speak as "we" / "our team" — never name Kyle or any individual operator.
- No marketing speak. Write like a senior engineer documenting an implementation, not a sales deck.`;
}

function renderPRDReadyNotice(
  prospect: { id: string; contactName: string | null; businessName: string | null; email: string },
  dashBase: string,
  regenNotes: string
): string {
  const prdUrl = `${dashBase}/prospects/${prospect.id}/prd`;
  const contact = prospect.contactName ?? "(no name)";
  const business = prospect.businessName ?? "—";
  const headline = regenNotes
    ? `<strong style="color: #00b3b3;">PRD regenerated.</strong> The previous approval was cleared — review and re-approve to lock.`
    : `<strong style="color: #00b3b3;">PRD ready for review.</strong> Approve to lock the spec the quote is drafted from.`;
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px 24px; background: #ffffff; color: #171717;">
  <p style="font-size: 14px; color: #404040; margin: 0 0 14px; line-height: 1.6;">${headline}</p>
  <table style="width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 13.5px;">
    <tr><td style="padding: 4px 0; color: #737373; width: 100px;">Contact</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(contact)} &lt;${escapeHtmlBasic(prospect.email)}&gt;</td></tr>
    <tr><td style="padding: 4px 0; color: #737373;">Business</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(business)}</td></tr>
  </table>
  ${regenNotes ? `<div style="background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.25); border-radius: 9px; padding: 12px 14px; margin-bottom: 18px; font-size: 13px; color: #92400e;"><div style="font-weight: 600; margin-bottom: 4px;">Regen notes you submitted:</div>${escapeHtmlBasic(regenNotes)}</div>` : ""}
  <div style="margin: 0 0 18px;">
    <a href="${prdUrl}" style="display: inline-block; padding: 12px 22px; background: #00b3b3; color: #ffffff; text-decoration: none; border-radius: 9px; font-size: 14px; font-weight: 600;">Open PRD →</a>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Operator-mode message prefix
// ---------------------------------------------------------------------------
// When OPERATOR_EMAIL emails a platform agent (auth.senderType="platform_operator"),
// we wrap the raw email body with explicit instructions so the agent knows
// it's in ops mode rather than client/prospect mode. Keeps the agent's
// permanent system prompt clean — the operator path is rare and contextual.

function buildOperatorModeMessage(emailBody: string, fromHeader: string): string {
  return `An authorized platform operator (${fromHeader}) just sent you this message. You're in OPERATOR MODE — this is NOT a prospect or client interaction.

## Who you are right now

To prospects and clients you're Atlas, the onboarding agent for Ambitt Agents. To this operator you're their **agentic assistant for running the Ambitt Agents business**. Same identity, different mode. The operator is technical and time-poor — give direct, scannable answers.

## What you can do in this mode

### Read the business state (use these freely; they're read-only)
- \`pipeline_summary\` — one-shot "where do I stand" answer; counts at each stage + what needs your action.
- \`list_prospects\` — filtered table (by status, search by name/business/email, limit).
- \`get_prospect\` — deep-dive on one prospect (funnel state, pricing, conversion).
- \`list_agents\` — fleet view (filter by status or client).
- \`get_agent\` — deep-dive on one agent (config, MTD cost, recent conversation turns).
- \`cost_summary\` — API spend by model + by agent (this_month / last_month / past_7_days).

### Spawn a prospect on the operator's behalf
\`spawn_prospect\` — when the operator says "send our onboarding link to <person>" (often with a few sentences of context about the prospect). Workflow:
1. Extract name + email from the operator's message.
2. Compose a 2–4 sentence personalized intro paragraph drawing on the operator's context (where they met, what the prospect does, what hooked the operator's interest). Plain prose — no subject line, no "Hi <name>", no "Click here". Just the body paragraph.
3. Call spawn_prospect with { name, email, custom_message: <your paragraph> }.
4. Confirm back to the operator in 1–2 lines naming the prospect + a quoted snippet of your personalized line.

### General research
- \`web_search\` for real-time facts.
- \`browse\` for read-only website navigation.
- Use these freely when the operator asks something that needs outside info.

## What you CANNOT do in this mode

- **No write actions** beyond spawn_prospect. You cannot approve agents, send emails to other clients, regenerate PRDs/quotes, modify agent prompts, or do anything that mutates state outside spawning prospects. If the operator asks for any of those, tell them the dashboard surface that handles it (e.g., "approve via dashboard /agents/<id>") rather than attempting it.
- **Do not invent fields.** If a query tool returns 0 results, say so — don't fabricate prospects/agents.

## Style for operator replies

- Short. Skip pleasantries. The operator will scan your email.
- Use plain markdown if it helps (bullets, bold). No headers wider than \`##\`.
- Numbers, names, status values are the substance — lead with those.
- When you've taken an action (e.g., spawn_prospect), include the prospect URL or relevant id so the operator can verify in the dashboard.
- End the turn after the answer. No follow-up questions unless you genuinely need clarification to act.

## The operator's message follows

---
${emailBody.trim()}
---`;
}

// ---------------------------------------------------------------------------
// Ops notifications
// ---------------------------------------------------------------------------
// Email-to-Kyle helper for system events that used to go via WhatsApp.
// Sender is always Atlas (most ops events relate to a prospect Atlas is
// running for); recipient is OPERATOR_EMAIL. Swap to whatsapp.ts when Twilio
// is wired in prod.

// Fired by /webhooks/email-events when an outbound email bounces or is
// reported as spam. In a sales funnel these are revenue events — silent
// failure (which is what "the prospect just never got it" looks like) means
// the deal evaporates without us knowing. Sends both WhatsApp (fast read on
// phone) + ops email (with full context: which prospect, which artifact, why).
async function notifyEmailDeliveryFailure(input: {
  eventType: "email.bounced" | "email.complained";
  emailSend: {
    id: string;
    to: string;
    subject: string;
    emailType: string | null;
    prospectId: string | null;
    clientId: string | null;
    agentId: string;
  };
  bounceReason: string | null;
}): Promise<void> {
  const verb = input.eventType === "email.bounced" ? "BOUNCED" : "SPAM REPORT";
  const friendlyKind =
    input.eventType === "email.bounced" ? "bounced" : "marked as spam";

  // Look up the prospect / client / agent for context. All optional —
  // emails to OPERATOR_EMAIL have no prospect/client linkage.
  const [prospect, client, agent] = await Promise.all([
    input.emailSend.prospectId
      ? prisma.prospect.findUnique({
          where: { id: input.emailSend.prospectId },
          select: { id: true, contactName: true, businessName: true, status: true },
        })
      : Promise.resolve(null),
    input.emailSend.clientId
      ? prisma.client.findUnique({
          where: { id: input.emailSend.clientId },
          select: { id: true, contactName: true, businessName: true },
        })
      : Promise.resolve(null),
    prisma.agent.findUnique({
      where: { id: input.emailSend.agentId },
      select: { id: true, name: true },
    }),
  ]);

  const who = prospect
    ? `${prospect.contactName ?? "prospect"} (${prospect.businessName ?? "—"})`
    : client
      ? `${client.contactName ?? "client"} (${client.businessName ?? "—"})`
      : input.emailSend.to;

  const dashBase = process.env.DASHBOARD_URL ?? "https://dashboard.ambitt.agency";
  const deepLink = prospect
    ? `${dashBase}/prospects/${prospect.id}/${input.emailSend.emailType === "quote_teaser" ? "quote" : "prd"}`
    : `${dashBase}/prospects`;

  // WhatsApp first — short, urgent.
  try {
    const { sendWhatsApp } = await import("../shared/whatsapp.js");
    const opNumber = process.env.KYLE_WHATSAPP_NUMBER;
    if (opNumber) {
      const reasonLine = input.bounceReason
        ? `\nReason: ${input.bounceReason.slice(0, 200)}`
        : "";
      await sendWhatsApp({
        to: opNumber,
        message: `🚨 ${verb}\n${friendlyKind} for ${who}\nTo: ${input.emailSend.to}\nArtifact: ${input.emailSend.emailType ?? "unknown"}${reasonLine}\n→ ${deepLink}`,
      });
    }
  } catch (err) {
    logger.warn("Bounce-alert WhatsApp failed (continuing)", {
      err: err instanceof Error ? err.message : String(err),
      emailSendId: input.emailSend.id,
    });
  }

  // Ops email — fuller context.
  if (!agent) return;
  const opsHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;line-height:1.5;color:#1a1a1a">
  <p style="font-size:14px;color:#999;margin:0 0 8px"><strong style="color:#c00">${verb}</strong></p>
  <h2 style="margin:0 0 16px;font-size:18px">Email ${friendlyKind} for ${who}</h2>
  <div style="background:#fff5f5;border-left:3px solid #c00;padding:12px 16px;border-radius:4px;font-size:13px">
    <p style="margin:0 0 4px"><strong>To:</strong> ${input.emailSend.to}</p>
    <p style="margin:0 0 4px"><strong>Subject:</strong> ${input.emailSend.subject}</p>
    <p style="margin:0 0 4px"><strong>Artifact:</strong> ${input.emailSend.emailType ?? "unknown"}</p>
    ${input.bounceReason ? `<p style="margin:0"><strong>Reason:</strong> ${input.bounceReason.slice(0, 400)}</p>` : ""}
  </div>
  <p style="margin:16px 0 0;font-size:14px">
    <a href="${deepLink}" style="color:#0066cc">Open in dashboard →</a>
  </p>
  <p style="font-size:12px;color:#999;margin:24px 0 0">
    Triggered by Resend webhook on EmailSend ${input.emailSend.id}. The audit row has the full lifecycle.
  </p>
</div>`.trim();

  await notifyOps({
    atlasId: agent.id,
    atlasName: agent.name,
    subject: `${verb}: ${input.emailSend.emailType ?? "email"} to ${who}`,
    html: opsHtml,
    prospectId: input.emailSend.prospectId ?? undefined,
    clientId: input.emailSend.clientId ?? undefined,
  });
}

async function notifyOps(input: {
  atlasId: string;
  atlasName: string;
  subject: string;
  html: string;
  prospectId?: string;
  clientId?: string;
}): Promise<void> {
  const to = process.env.OPERATOR_EMAIL;
  if (!to) {
    logger.warn("notifyOps: OPERATOR_EMAIL not set, skipping ops notification", { subject: input.subject });
    return;
  }
  const { sendEmail } = await import("../shared/email.js");
  await sendEmail({
    agentId: input.atlasId,
    agentName: input.atlasName,
    to,
    subject: input.subject,
    html: input.html,
    replyToAgentId: input.atlasId,
    prospectId: input.prospectId,
    clientId: input.clientId,
    emailType: "ops_notification",
  });
}

function renderScopeApprovedNotice(prospect: {
  id: string;
  token: string;
  contactName: string | null;
  businessName: string | null;
  email: string;
}): string {
  const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";
  const proposalUrl = `${portalBase}/proposals/${prospect.token}`;
  const contact = prospect.contactName ?? "(no name)";
  const business = prospect.businessName ?? "—";
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px 24px; background: #ffffff; color: #171717;">
  <p style="font-size: 14px; color: #404040; margin: 0 0 14px; line-height: 1.6;"><strong style="color: #00b3b3;">Scope approved.</strong> Time to draft a quote.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 13.5px;">
    <tr><td style="padding: 4px 0; color: #737373; width: 100px;">Contact</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(contact)} &lt;${escapeHtmlBasic(prospect.email)}&gt;</td></tr>
    <tr><td style="padding: 4px 0; color: #737373;">Business</td><td style="padding: 4px 0; color: #171717;">${escapeHtmlBasic(business)}</td></tr>
    <tr><td style="padding: 4px 0; color: #737373;">Prospect ID</td><td style="padding: 4px 0; color: #171717; font-family: 'SF Mono', Menlo, monospace; font-size: 12px;">${prospect.id}</td></tr>
  </table>
  <p style="font-size: 13.5px; color: #404040; margin: 0 0 18px; line-height: 1.6;">Proposal: <a href="${proposalUrl}" style="color: #00b3b3;">${proposalUrl}</a></p>
  <p style="font-size: 12.5px; color: #a3a3a3; margin: 18px 0 0;">Atlas will auto-generate a draft PRD for this prospect in the background. You'll get another email when it's ready to review.</p>
</div>`;
}

function escapeHtmlBasic(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Cold-rejection auto-response
// ---------------------------------------------------------------------------
// When someone cold-emails a platform agent (e.g. atlas@ambitt.agency) and
// gets auth-rejected, we send back a soft "here's the right way in" message
// instead of silently dropping. Skipped for known auto-responder addresses
// to avoid bounce loops; skipped for non-platform agents (no info leakage
// to random senders who happened to find a client agent's address).
//
// If the sender matches an active Prospect by email, we include THEIR
// personal /onboard/[token] link in the response — common case is a prospect
// who forgot they had a live link and tried emailing Atlas instead.

const AUTORESPONDER_PREFIXES = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "bounces",
  "bounce",
  "notifications",
];

function looksLikeAutoresponder(email: string): boolean {
  const localPart = email.split("@")[0]?.toLowerCase() ?? "";
  return AUTORESPONDER_PREFIXES.some((p) => localPart === p || localPart.startsWith(`${p}-`) || localPart.startsWith(`${p}+`));
}

async function sendColdEmailAutoResponse(
  agentId: string,
  fromHeader: string,
  originalSubject: string
): Promise<void> {
  const senderEmail = parseEmailFromHeader(fromHeader);
  if (!senderEmail) return;
  if (looksLikeAutoresponder(senderEmail)) {
    logger.info("Cold-rejection auto-response skipped — sender looks like an autoresponder", { senderEmail });
    return;
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, email: true, acceptFromProspects: true },
  });
  // Only platform agents get the soft response — client agents stay invisible.
  if (!agent || !agent.acceptFromProspects) return;

  // Personalize if the sender matches a known active prospect.
  const prospect = await prisma.prospect.findUnique({
    where: { email: senderEmail },
    select: { id: true, token: true, contactName: true, status: true },
  });
  const isActiveProspect =
    prospect !== null && prospect.status !== "archived" && prospect.status !== "ghosted";

  const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://portal.ambitt.agency";
  const firstName =
    (prospect?.contactName ?? "").trim().split(/\s+/)[0] || "there";
  const replySubject = originalSubject && originalSubject.length > 0 ? `Re: ${originalSubject}` : "About your message";

  const html = isActiveProspect
    ? renderProspectAutoResponse(firstName, `${portalBase}/onboard/${prospect.token}`, portalBase)
    : renderGenericAutoResponse(firstName, `${portalBase}/onboard`, portalBase);

  const { sendEmail } = await import("../shared/email.js");
  await sendEmail({
    agentId: agent.id,
    agentName: agent.name,
    to: senderEmail,
    subject: replySubject,
    html,
    replyToAgentId: agent.id,
  });
  logger.info("Cold-rejection auto-response sent", {
    agentId,
    to: senderEmail,
    personalized: isActiveProspect,
  });
}

function renderProspectAutoResponse(firstName: string, onboardUrl: string, portalBase: string): string {
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #171717;">
  <div style="margin-bottom: 28px;">
    <img src="${portalBase}/brand/ambitt-agents-lockup.svg" alt="Ambitt Agents" width="220" height="27" style="display: block; max-width: 220px; height: auto;" />
  </div>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.6;">Hey ${escapeHtmlBasic(firstName)},</p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.65;">
    Got your email — I'm Atlas, the onboarding agent for Ambitt Agents. I can't pick up cold messages here, but your onboarding link is below. It's already tied to you, so your progress is saved.
  </p>
  <div style="margin: 0 0 24px;">
    <a href="${onboardUrl}" style="display: inline-block; padding: 14px 28px; background: #00b3b3; color: #ffffff; text-decoration: none; border-radius: 9px; font-size: 15px; font-weight: 600;">Open your onboarding →</a>
  </div>
  <p style="font-size: 14px; color: #404040; margin: 0 0 16px; line-height: 1.65;">
    Anything outside the form, just reply to this email — that route works because I'll see the thread.
  </p>
  <p style="font-size: 13px; color: #a3a3a3; margin: 24px 0 0;">— Atlas, your onboarding agent at Ambitt Agents</p>
</div>`;
}

function renderGenericAutoResponse(firstName: string, onboardLandingUrl: string, portalBase: string): string {
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #171717;">
  <div style="margin-bottom: 28px;">
    <img src="${portalBase}/brand/ambitt-agents-lockup.svg" alt="Ambitt Agents" width="220" height="27" style="display: block; max-width: 220px; height: auto;" />
  </div>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.6;">Hey ${escapeHtmlBasic(firstName)},</p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.65;">
    Got your email — I'm Atlas, the onboarding agent for Ambitt Agents. I can't read cold inbound here. The fastest way to start is to fill out the short onboarding form — takes about 5–10 minutes, then I'll send a tailored proposal back within 30 minutes.
  </p>
  <div style="margin: 0 0 24px;">
    <a href="${onboardLandingUrl}" style="display: inline-block; padding: 14px 28px; background: #00b3b3; color: #ffffff; text-decoration: none; border-radius: 9px; font-size: 15px; font-weight: 600;">Start onboarding →</a>
  </div>
  <p style="font-size: 14px; color: #404040; margin: 0 0 16px; line-height: 1.65;">
    Not a fit for onboarding? Email <a href="mailto:team@ambitt.agency" style="color: #00b3b3; text-decoration: none;">team@ambitt.agency</a> and a human will get back to you.
  </p>
  <p style="font-size: 13px; color: #a3a3a3; margin: 24px 0 0;">— Atlas, your onboarding agent at Ambitt Agents</p>
</div>`;
}

function renderProposalTeaserEmail(
  prospect: { contactName: string | null; businessName: string | null },
  proposalUrl: string,
  heroTitle: string,
  portalBase: string
): string {
  const firstName = (prospect.contactName ?? "").trim().split(/\s+/)[0] || "there";
  // hero.title may contain <br> — strip for the email preview line.
  const previewTitle = heroTitle.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").trim();
  const businessLine = prospect.businessName ? ` for ${prospect.businessName}` : "";
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #171717;">
  <div style="margin-bottom: 28px;">
    <img src="${portalBase}/brand/ambitt-agents-lockup.svg" alt="Ambitt Agents" width="220" height="27" style="display: block; max-width: 220px; height: auto;" />
  </div>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.6;">Hey ${firstName},</p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 24px; line-height: 1.6;">
    Your custom agent proposal${businessLine} is ready. ${previewTitle ? `<strong style="color: #171717;">${previewTitle}</strong>` : ""}
  </p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 28px; line-height: 1.6;">
    Take a few minutes to read through it. If it feels right, you can approve right on the page. If anything's off, hit Make changes and update your answers.
  </p>
  <div style="margin: 0 0 32px;">
    <a href="${proposalUrl}" style="display: inline-block; padding: 14px 30px; background: #00b3b3; color: #ffffff; text-decoration: none; border-radius: 9px; font-size: 15px; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0, 179, 179, 0.28);">View your proposal →</a>
  </div>
  <p style="font-size: 13px; color: #737373; margin: 0 0 8px; line-height: 1.6;">
    Pricing and timeline come after you approve scope — we'll handle those next.
  </p>
  <p style="font-size: 13px; color: #a3a3a3; margin: 32px 0 0;">— Atlas, your onboarding agent at Ambitt Agents</p>
</div>`;
}

function renderThanksEmail(
  prospect: { contactName: string | null; email: string; businessName: string | null; formData: unknown },
  portalBase: string
): string {
  const fd = (prospect.formData ?? {}) as Record<string, unknown>;
  const preferred = typeof fd.preferredName === "string" ? fd.preferredName : "";
  const firstName = (prospect.contactName ?? "").trim().split(/\s+/)[0] || preferred || "there";
  const business = prospect.businessName ? ` for ${prospect.businessName}` : "";
  return `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #171717;">
  <div style="margin-bottom: 28px;">
    <img src="${portalBase}/brand/ambitt-agents-lockup.svg" alt="Ambitt Agents" width="220" height="27" style="display: block; max-width: 220px; height: auto;" />
  </div>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.6;">Hey ${firstName},</p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 16px; line-height: 1.6;">
    Got your brief${business} — thanks for laying it all out. I'm reading through your answers now.
  </p>
  <p style="font-size: 15px; color: #404040; margin: 0 0 24px; line-height: 1.6;">
    Your proposal will land in this inbox within <strong style="color: #171717;">30 minutes</strong>. When it does, you'll be able to approve the scope or ask for changes — pricing comes after.
  </p>
  <p style="font-size: 13px; color: #a3a3a3; margin: 32px 0 0;">— Atlas, your onboarding agent at Ambitt Agents</p>
</div>`;
}

function buildAtlasProposalPrompt(prospect: {
  id: string;
  email: string;
  token: string;
  contactName: string | null;
  businessName: string | null;
  role: string | null;
  website: string | null;
  formData: unknown;
}): string {
  const fd = (prospect.formData ?? {}) as Record<string, unknown>;
  const get = (k: string) => (typeof fd[k] === "string" ? (fd[k] as string) : "");
  const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";
  const firstName = (prospect.contactName ?? "").trim().split(/\s+/)[0] || (get("preferredName") || "there");
  const approveUrl = `${portalBase}/proposals/${prospect.token}/approve`;
  const changesUrl = `${portalBase}/onboard/${prospect.token}`;

  // SOPs come from two surfaces: pasted textarea (fd.sops) + uploaded files
  // (fd.sopFiles[].extractedText). Concatenate both with labels so Atlas can
  // attribute insights back to source documents if useful.
  const sopFiles = Array.isArray(fd.sopFiles) ? (fd.sopFiles as Array<{ filename?: string; extractedText?: string }>) : [];
  const sopSections: string[] = [];
  if (get("sops").trim()) sopSections.push(`--- Pasted notes ---\n${get("sops").trim()}`);
  for (const f of sopFiles) {
    if (f.extractedText && f.extractedText.trim().length > 0) {
      sopSections.push(`--- File: ${f.filename ?? "upload"} ---\n${f.extractedText.trim()}`);
    }
  }
  const sopBlock = sopSections.length > 0 ? sopSections.join("\n\n") : "(They didn't paste or upload any SOPs.)";

  // Adaptive intake — if the prospect went through the new dynamic-questions
  // flow, formData.dynamic carries Atlas's own domain-specific Q&A. This is
  // far higher-signal than the legacy static fields below (which are mostly
  // empty for new prospects) and should dominate the proposal drafting.
  const dynamic = (fd.dynamic ?? null) as
    | {
        questions?: {
          domainSummary?: string;
          agentArchetype?: string;
          questions?: Array<{
            id: string;
            label: string;
            type: string;
            rationale?: string;
            options?: string[];
            required?: boolean;
          }>;
        };
        answers?: Record<string, unknown>;
      }
    | null;
  const dynamicBlock = (() => {
    if (!dynamic?.questions?.questions || dynamic.questions.questions.length === 0) {
      return ""; // legacy prospect — no adaptive intake; skip the section entirely
    }
    const domain = dynamic.questions.domainSummary ?? "(not classified)";
    const archetype = dynamic.questions.agentArchetype ?? "(not classified)";
    const answers = dynamic.answers ?? {};
    const lines = dynamic.questions.questions.map((q) => {
      const a = answers[q.id];
      const renderedAnswer =
        a === undefined || a === null
          ? "(unanswered)"
          : Array.isArray(a)
            ? a.length > 0
              ? a.join(", ")
              : "(unanswered)"
            : typeof a === "string"
              ? a.trim() || "(unanswered)"
              : String(a);
      const rationale = q.rationale ? ` _(why we asked: ${q.rationale})_` : "";
      return `- **${q.label}**${rationale}\n  Answer: ${renderedAnswer}`;
    });
    return `\n# TAILORED INTAKE — domain-specific Q&A
(This is the high-signal section. We asked these questions specifically because of THIS prospect's domain. Weight these answers above the legacy static fields below when drafting the proposal.)

- Domain classification: ${domain}
- Agent archetype: ${archetype}

${lines.join("\n")}
`;
  })();

  return `A new prospect just completed the Ambitt Agents onboarding form. Read their answers carefully, then **emit a structured JSON object** matching the ProposalEmailData contract below. Our Handlebars template renders the JSON into the email — you never write HTML.

# Prospect basics
- Email: ${prospect.email}
- Name: ${prospect.contactName ?? "(not provided)"}
- Preferred name (use this in greeting): ${get("preferredName") || firstName}
- Role: ${prospect.role ?? "(not provided)"}
- Business: ${prospect.businessName ?? "(not provided)"}
- Website: ${prospect.website ?? "(not provided)"}

# The agent the prospect is asking us to build
- Their chosen name for the agent: ${get("agentName") || "(not provided — propose one)"}
- Their chosen role / job title for the agent: ${get("agentRole") || "(not provided — infer from their pitch)"}
${dynamicBlock}
# Their answers (legacy static fields — only populated for older prospects)
- What their business does: ${get("industry") || "(not provided)"}
- Target audience (multi-select chips): ${get("audienceTags") || "(none selected)"}
- Audience detail (optional, more specific): ${get("audienceDetail") || "(not provided)"}
- What the agent should do (their pitch): ${get("agentPitch") || "(not provided)"}
- Who handles this today: ${get("todayHandler") || "(not provided)"}
- Today details (optional): ${get("todayVsAgent") || "(not provided)"}
- Success outcomes (multi-select chips): ${get("successOutcomes") || "(none selected)"}
- Concrete success numbers (optional): ${get("successCriteria") || "(not provided)"}
- Run mode: ${get("cadence") || "(not provided)"} — either "On a schedule" (fires at set times — exact cron set later in the portal) or "When triggered" (reacts to inbound events: an email, a webhook, a form fill, etc.). Mention naturally in the proposal — e.g., "Bob runs every morning" for scheduled, "Bob kicks in the moment a ticket lands" for triggered.
- Volume: ${get("volume") || "(not provided)"}
- Communication channel: ${get("channel") || "(not provided)"}
- Autonomy preference: ${get("autonomy") || "(not provided)"}
- Tone tags (multi-select chips): ${get("toneTags") || "(none selected)"}
- Brand voice samples (optional paste): ${get("brandVoice") || "(not provided)"}
- Tools (structured list, Composio = OAuth path exists, custom = humans wire it up): ${(() => {
  const t = Array.isArray(fd.tools) ? (fd.tools as Array<{ source: string; slug?: string; name: string }>) : [];
  if (t.length === 0) return "(none selected)";
  return t.map((x) => `${x.name} [${x.source === "composio" ? `Composio:${x.slug ?? "?"}` : "custom"}]`).join(", ");
})()}
- Never-do guardrails (multi-select chips): ${get("neverDoTags") || "(none selected)"}
- Other rules (optional): ${get("redLines") || "(not provided)"}

# Their SOPs / docs (pasted notes + uploaded files concatenated)
${sopBlock}

# CTA URLs to use VERBATIM in your output
- cta.primaryUrl (Approve): ${approveUrl}
- cta.secondaryUrl (Make changes): ${changesUrl}
- DO NOT include cta.tertiaryLabel or cta.tertiaryUrl — omit those fields entirely.

# JSON SCHEMA — your output must match this shape exactly

\`\`\`ts
interface ProposalEmailData {
  subject: string;                       // e.g. "Your custom agent — proposal from Atlas"
  greeting: { name: string; body: string };
  hero: {
    label: string;                       // e.g. "YOUR CUSTOM AGENT" (uppercase, short)
    title: string;                       // supports <br> for line break, e.g. "Meet Kwame,<br>your new lead-gen agent."
    status?: { text: string; tone: "info" | "warn" | "success" | "neutral" };  // for review: tone="warn", text="Pending your review"
    specs: Array<{ label: string; value: string }>;   // 3–7 rows. Value supports <span class=\"accent\">…</span> for cyan emphasis on ONE phrase
  };
  introQuote?: { text: string };         // pull-quote, supports <em>…</em> for one italic-teal word
  whatWeBuild: {
    headline: string;                    // job-title style, e.g. "The Prospect Hunter"
    paragraphs: string[];                // 1–3 plain-text paragraphs
  };
  flow: {
    headline: string;                    // e.g. "The daily flow"
    steps: Array<{ number: number; title: string; description: string }>;  // 3–7 steps. title 1–2 words, description ≤ 280 chars
  };
  sample?: {                             // sample artifact card (email / ticket reply / etc.)
    headline: string;
    introText: string;
    card: {
      headerRows?: Array<{ label: string; value: string; type?: "link" | "subject" | "text" }>;  // e.g. From/To/Subject
      body: string;                      // HTML allowed: <p>, <strong>, <em>, <a>. Wrap each paragraph in <p>.
      signature?: string;                // HTML allowed
    };
  };
  digest?: {                             // recurring digest table preview
    headline: string;
    introText: string;
    cardTitle: string;                   // e.g. "Kwame's Daily Report"
    cardMeta: string;                    // supports <span class=\"accent\">…</span>
    columns: Array<{ key: string; label: string }>;   // 3–5
    rows: Array<Array<{ value: string; type?: "pill" }>>;   // each row matches columns; type:"pill" renders as a teal pill (status col)
  };
  cta: {
    headline: string;                    // e.g. "If this feels right, approve it."
    subtext: string;                     // 1 sentence, explains what happens next
    primaryLabel: string;                // "Approve"
    primaryUrl: string;                  // use the value above
    secondaryLabel: string;              // "Make changes"
    secondaryUrl: string;                // use the value above
    // tertiaryLabel / tertiaryUrl — DO NOT INCLUDE. Omit these fields.
  };
  footer: {
    domain: string;                      // "ambitt.agency"
    location: string;                    // "Dallas, TX"
    note?: string;
  };
}
\`\`\`

# One example (lead-gen agent, abridged) — DO NOT COPY VERBATIM, use as shape reference

\`\`\`json
{
  "subject": "Your custom agent — proposal from Atlas",
  "greeting": { "name": "Kyle", "body": "Based on your form, here's the agent we'd build for you. Have a read — if it feels right, hit Approve. If anything's off, hit Make changes and you can update your answers." },
  "hero": {
    "label": "YOUR CUSTOM AGENT",
    "title": "Meet Kwame,<br>your new lead-gen agent.",
    "status": { "text": "Pending your review", "tone": "warn" },
    "specs": [
      { "label": "Targets", "value": "Small businesses · No website yet" },
      { "label": "Cadence", "value": "Daily mornings · <span class=\\"accent\\">10 prospects/day</span>" },
      { "label": "Mode", "value": "Supervised — approval before sending" },
      { "label": "Stack", "value": "Google Maps · Gmail · Notion" }
    ]
  },
  "introQuote": { "text": "Every day, thousands of small businesses collect Google reviews — and still don't have a website. Kwame finds them, researches them, and sends a cold email that actually looks like it was written for <em>them</em>." },
  "whatWeBuild": {
    "headline": "The Prospect Hunter",
    "paragraphs": ["Kwame is a daily outbound agent. Find small businesses with Google reviews but no website, locate a contact email, send them a personalised cold email."]
  },
  "flow": {
    "headline": "The daily flow",
    "steps": [
      { "number": 1, "title": "Hunt", "description": "Searches Google Maps for businesses in target categories that have reviews but no linked website. Pulls 10 per day." },
      { "number": 2, "title": "Research", "description": "Finds a contact email and notes their category, location, review count, and rating so the email feels specific." },
      { "number": 3, "title": "Draft", "description": "Writes a short, personalised cold email in your voice, mentioning the business by name and referencing their reviews." },
      { "number": 4, "title": "Your approval", "description": "Because you've chosen supervised mode, you see all 10 drafts each morning before anything goes out." }
    ]
  },
  "cta": {
    "headline": "If this feels right, approve it.",
    "subtext": "Pricing comes after you approve scope — we'll send a quote within the same business day. Builds typically run 2–8 weeks from quote acceptance depending on scope.",
    "primaryLabel": "Approve",
    "primaryUrl": "<approve url goes here>",
    "secondaryLabel": "Make changes",
    "secondaryUrl": "<make-changes url goes here>"
  },
  "footer": {
    "domain": "ambitt.agency",
    "location": "Dallas, TX",
    "note": "You're getting this because you submitted a form on ambitt.agency."
  }
}
\`\`\`

# Quality gate — REQUIRED before you finalize

Before you emit your JSON as your final message, call the \`request_review\` tool with the COMPLETE ProposalEmailData object you're about to send. Vera (our internal QA reviewer) will check it for forbidden content (pricing, overclaims, operator names), brand-voice violations (AI tells, robotic phrasing), specificity (generic filler), and name/role consistency. She returns APPROVED or REJECTED with specific issues.

Workflow:
1. Draft your complete ProposalEmailData JSON internally.
2. Call \`request_review\` with: \`artifact_type: "proposal_email"\`, \`data: <your JSON>\`, \`attempt: 1\`, and a \`context\` string summarizing the grounding Vera can't infer from the JSON alone (the prospect's preferred name, the agent name you used, anything else relevant).
3. If Vera REJECTS, revise the JSON to address each issue she listed, then call \`request_review\` again with the corrected data and \`attempt: 2\`. Repeat up to attempt 3.
4. Once Vera APPROVES (or after attempt 3 if she still rejects), emit the FINAL JSON as your message — verbatim from your last \`request_review\` call. No commentary, no preamble, no code fences.

Do NOT skip the review. Do NOT emit JSON before calling \`request_review\`.

# Hard rules

- **Output ONLY the JSON object** as your FINAL message — after Vera approves. No prose before or after. No code fences. Just the raw object, starting with \`{\` and ending with \`}\`.
- **Use the CTA URLs from the section above verbatim.** Do not invent URLs.
- **Footer domain = "ambitt.agency", location = "Dallas, TX".**
- **greeting.name = the prospect's preferred first name** ("${get("preferredName") || firstName}").
- **Name the agent throughout.** If the prospect gave a name (\`${get("agentName") || "(none)"}\`) and role (\`${get("agentRole") || "(none)"}\`), use them in: \`hero.title\` (e.g. "Meet Bob,<br>your lead-gen agent."), \`whatWeBuild.headline\` (a job-title that builds on their chosen role), \`flow.steps[].description\` (refer to the agent BY NAME — "Bob hunts…", "Bob drafts…"), \`digest.cardTitle\` (e.g., "Bob's Daily Report"), and \`sample.card.signature\` if the sample artifact is sent from your client's brand (NOT from the agent itself — sign as the client's business, never as the agent). If the prospect did NOT provide a name, propose one in your response that fits their brand voice; if they did NOT provide a role, infer one from their pitch.
- **hero.status = { text: "Pending your review", tone: "warn" }.**
- **Do NOT include pricing, retainer, or setup fee anywhere in the proposal.** That's drafted separately as the quote after scope approval.
- **cta.subtext MUST mention the build-time window**: "Builds typically run 2–8 weeks from quote acceptance depending on scope." Phrase it naturally into the subtext (the example above shows one good way) — Atlas owns the exact wording but the 2–8 weeks fact must be there.
- **Do NOT promise capabilities the platform doesn't have.** If they asked for something genuinely impossible, soften it in whatWeBuild and propose a realistic version.
- **Speak as we / our team.** Never name an individual operator. The brand is Ambitt Agents.
- **Write like a human, not like AI.** Avoid: "leverage", "comprehensive", "robust", "seamless", "delve into", "in today's fast-paced world", "it's worth noting", "furthermore", "moreover", "indeed", "truly", "incredibly". Avoid tricolon reflex ("X, Y, and Z" everywhere) and em-dash overuse. Use contractions. Vary sentence length. Sometimes start with "And" or "But". If you'd say it that way in a Slack DM to a smart colleague, ship it. If it reads like a press release, rewrite shorter.
- **Sample output**: include if useful — pick the artifact type that matches their work (cold email for lead-gen, ticket reply for support, article draft for content, etc.). Omit \`sample\` field entirely if the agent doesn't produce a discrete artifact.
- **Digest**: include if the agent produces a recurring report. Omit \`digest\` field entirely otherwise.
- **Length limits**: hero title ≤ 60 chars across both lines, spec value ≤ 50 chars, flow step description ≤ 280 chars.`;
}

// Store client credentials
app.post("/credentials/:clientId", async (req: Request, res: Response) => {
  try {
    const { storeCredentials } = await import("./onboard.js");
    const clientId = param(req, "clientId");
    const { toolName, apiKey, oauthToken, refreshToken } = req.body;
    await storeCredentials(clientId, toolName, { apiKey, oauthToken, refreshToken });
    res.json({ status: "stored" });
  } catch (error) {
    logger.error("Credential storage failed", { error });
    res.status(500).json({ error: "Credential storage failed" });
  }
});

// Upload documents to agent memory
app.post("/agents/:id/documents", upload.array("files", 10), async (req: Request, res: Response) => {
  try {
    const agentId = param(req, "id");
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { clientMemoryObject: true, name: true },
    });

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    // Parse uploaded files
    const { parseInboundAttachments, formatAttachmentsAsContext } = await import("../shared/attachments/parse-inbound.js");
    const { encrypt, decrypt } = await import("../shared/encryption.js");

    const attachments = files.map((f) => ({
      filename: f.originalname,
      contentType: f.mimetype,
      content: f.buffer.toString("base64"),
    }));

    const parsed = await parseInboundAttachments(attachments);

    // Load existing memory
    let memory: Record<string, unknown> = {};
    try {
      memory = JSON.parse(decrypt(agent.clientMemoryObject));
    } catch { /* empty or corrupt memory — start fresh */ }

    // Add documents to memory
    const existingDocs = (memory.documents ?? []) as Array<{ filename: string; uploadedAt: string; summary: string }>;
    const newDocs = parsed.map((p) => ({
      filename: p.filename,
      uploadedAt: new Date().toISOString(),
      summary: p.text.slice(0, 500),
    }));

    memory.documents = [...existingDocs, ...newDocs];
    memory.documentContents = memory.documentContents ?? {};

    // Store full text keyed by filename
    for (const p of parsed) {
      (memory.documentContents as Record<string, string>)[p.filename] = p.text;
    }

    // Save back to DB
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        clientMemoryObject: encrypt(JSON.stringify(memory)),
        lastMemoryUpdateAt: new Date(),
      },
    });

    logger.info("Documents uploaded to agent memory", {
      agentId,
      count: parsed.length,
      filenames: parsed.map((p) => p.filename),
    });

    res.json({
      status: "uploaded",
      documents: newDocs.map((d) => ({ filename: d.filename, uploadedAt: d.uploadedAt })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Document upload failed", { error: message });
    res.status(500).json({ error: "Document upload failed" });
  }
});

// List documents in agent memory
app.get("/agents/:id/documents", async (req: Request, res: Response) => {
  try {
    const agentId = param(req, "id");
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { clientMemoryObject: true },
    });

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const { decrypt } = await import("../shared/encryption.js");
    let memory: Record<string, unknown> = {};
    try {
      memory = JSON.parse(decrypt(agent.clientMemoryObject));
    } catch { /* empty memory */ }

    const documents = (memory.documents ?? []) as Array<{ filename: string; uploadedAt: string }>;
    res.json(documents);
  } catch (error) {
    logger.error("Document list failed", { error });
    res.status(500).json({ error: "Failed to list documents" });
  }
});

// ---------------------------------------------------------------------------
// GET /agents/:id/example-emails — "Things you can ask {agent}" for the portal
// ---------------------------------------------------------------------------
// Cache-first: returns Agent.exampleEmails if already generated. Otherwise
// generates a few example emails grounded in the agent's purpose + tools,
// caches them on the agent, and returns them. Best-effort — a generation
// failure returns an empty list (200) so the portal just hides the section
// rather than erroring. Generation is the ONLY write, and only happens once
// per agent (cache-first), so this GET is cheap to hammer.
// ---------------------------------------------------------------------------
app.get("/agents/:id/example-emails", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const agent = await prisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        clientDescription: true,
        purpose: true,
        tools: true,
        customTools: true,
        exampleEmails: true,
        client: { select: { preferredName: true, contactName: true } },
      },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    // Cache hit — already generated.
    if (Array.isArray(agent.exampleEmails)) {
      res.json({ examples: agent.exampleEmails, cached: true });
      return;
    }

    const { generateExampleEmails } = await import("./example-emails.js");
    let examples;
    try {
      examples = await generateExampleEmails({
        name: agent.name,
        clientDescription: agent.clientDescription,
        purpose: agent.purpose,
        tools: agent.tools,
        customTools: agent.customTools,
        clientPreferredName: agent.client.preferredName ?? agent.client.contactName,
      });
    } catch (genErr) {
      logger.warn("Example-emails generation failed — returning empty", {
        agentId: agent.id,
        error: genErr instanceof Error ? genErr.message : String(genErr),
      });
      res.json({ examples: [], cached: false });
      return;
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: { exampleEmails: examples, exampleEmailsGeneratedAt: new Date() },
    });

    logger.info("Example emails generated", { agentId: agent.id, count: examples.length });
    res.json({ examples, cached: false });
  } catch (error) {
    logger.error("Example-emails endpoint failed", { error });
    res.status(500).json({ error: "Failed to load example emails" });
  }
});

// ---------------------------------------------------------------------------
// GET /agents/:id/tools — derived view for the portal Tools page
// ---------------------------------------------------------------------------
// Merges four signal sources into a unified list:
//   1. Composio connected accounts for the client (OAuth done)
//   2. Composio app catalog (logos, OAuth availability, names)
//   3. 1Password vault items for the client (credential storage)
//   4. CredentialAccess audit (last accessed per item)
//
// Output: two arrays — `tools` (anything matching a Composio app, may have
// OAuth and/or credentials) and `personalInfo` (1Password items that don't
// map to a Composio app — SSN, security answers, custom credentials).
//
// Generic platform endpoint — not job-applier specific; serves any agent.
// ---------------------------------------------------------------------------

interface ToolsListItem {
  id: string;                                   // stable client-side id
  name: string;
  logoUrl: string | null;
  category: string | null;
  authMethods: Array<"oauth" | "credentials">;  // what's possible
  status: "connected" | "needs_setup" | "partial";
  oauth: { connectionId: string; connectedAt: string | null } | null;
  credentials: {
    itemId: string;
    fields: Array<{ title: string; fieldType: string; filled: boolean }>;
    allFilled: boolean;
    lastAccessedAt: string | null;
  } | null;
  // Custom (non-Composio) tools the agent reaches via the browse tool with
  // client-stored credentials. `siteUrl` drives the favicon + the helper copy.
  // `vaultPending` is true when the client's secure vault isn't provisioned
  // yet — the row shows but the credential form is held until it is.
  source?: "composio" | "custom";
  siteUrl?: string | null;
  vaultPending?: boolean;
  // The connected account's address (e.g. which Gmail inbox) — shown so a
  // client with multiple accounts of the same app can tell them apart.
  accountEmail?: string | null;
  // App slug for "Add another account" (re-run the connect flow for this app).
  appSlug?: string | null;
}

interface PersonalInfoItem {
  itemId: string;
  title: string;
  fields: Array<{ title: string; fieldType: string; filled: boolean }>;
  allFilled: boolean;
  lastAccessedAt: string | null;
}

app.get("/agents/:id/tools", async (req: Request, res: Response) => {
  try {
    const agentId = param(req, "id");
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        clientId: true,
        tools: true,
        customTools: true,
        client: { select: { onepasswordVaultId: true } },
      },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const clientId = agent.clientId;
    const hasVault = !!agent.client?.onepasswordVaultId;

    const [connectedAccounts, composioApps, vaultItems, audits, dbCredTools, gmailAccounts] = await Promise.all([
      (async () => {
        try {
          const { getConnectedAccounts } = await import("../shared/mcp/composio.js");
          return await getConnectedAccounts(clientId);
        } catch (err) {
          logger.warn("Tools endpoint: Composio connected accounts fetch failed", { err: (err as Error).message });
          return [];
        }
      })(),
      (async () => {
        try {
          const { listApps } = await import("../shared/mcp/composio.js");
          return await listApps();
        } catch (err) {
          logger.warn("Tools endpoint: Composio app catalog fetch failed", { err: (err as Error).message });
          return [];
        }
      })(),
      (async () => {
        try {
          const { listVaultItems } = await import("../shared/secrets/onepassword.js");
          return await listVaultItems(clientId);
        } catch (err) {
          logger.warn("Tools endpoint: 1Password vault listing failed", { err: (err as Error).message });
          return [];
        }
      })(),
      prisma.credentialAccess.findMany({
        where: { clientId },
        orderBy: { accessedAt: "desc" },
        select: { itemTitle: true, accessedAt: true },
      }),
      (async () => {
        try {
          const { listCustomCredentialTools } = await import("../shared/secrets/db-credentials.js");
          return await listCustomCredentialTools(clientId);
        } catch (err) {
          logger.warn("Tools endpoint: DB custom-credential listing failed", { err: (err as Error).message });
          return new Set<string>();
        }
      })(),
      (async () => {
        try {
          const { getGmailAccounts } = await import("../shared/mcp/composio.js");
          return await getGmailAccounts(clientId);
        } catch (err) {
          logger.warn("Tools endpoint: Gmail account resolution failed", { err: (err as Error).message });
          return [] as Array<{ connectionId: string; email: string }>;
        }
      })(),
    ]);

    // last-accessed lookup, keyed by item title (case-insensitive)
    const lastAccessByTitle = new Map<string, string>();
    for (const a of audits) {
      const key = a.itemTitle.toLowerCase();
      if (!lastAccessByTitle.has(key)) {
        lastAccessByTitle.set(key, a.accessedAt.toISOString());
      }
    }

    // Composio app lookup by normalized name. Helps us match 1P item titles
    // (e.g. "LinkedIn", "Linked In", "LINKEDIN") to a known tool.
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
    const composioAppByName = new Map<string, typeof composioApps[number]>();
    for (const app of composioApps) {
      composioAppByName.set(normalize(app.name), app);
      if (app.key) composioAppByName.set(normalize(app.key), app);
    }

    // Build tools list. Start from Composio connections (OAuth done).
    const tools: ToolsListItem[] = [];
    const usedComposioKeys = new Set<string>();
    for (const conn of connectedAccounts) {
      const key = normalize(conn.appName);
      // Only surface live connections, and only ONE card per app — reconnecting
      // creates multiple connection rows (Casey had 3 Gmail + expired ones), and
      // we don't want the client to see "Gmail" listed several times.
      if (conn.status !== "ACTIVE") continue;
      // Gmail is handled per-ACCOUNT below (a client can connect more than one
      // inbox), so skip it in the by-app pass.
      if (key === "gmail") continue;
      if (usedComposioKeys.has(key)) continue;
      usedComposioKeys.add(key);
      const app = composioAppByName.get(key);
      tools.push({
        id: `composio:${conn.id}`,
        name: app?.name ?? conn.appName,
        logoUrl: app?.logo ?? `https://logos.composio.dev/api/${key}`,
        category: (app?.categories ?? [])[0] ?? null,
        authMethods: ["oauth"],
        status: "connected",
        oauth: { connectionId: conn.id, connectedAt: null },
        credentials: null,
        appSlug: conn.appName,
      });
    }

    // Gmail — one card per DISTINCT connected inbox (deduped by email). Lets a
    // client run e.g. a signup inbox + a dedicated prospect-outreach inbox and
    // tell the agent which to send from.
    if (gmailAccounts.length > 0) {
      usedComposioKeys.add("gmail");
      const gmailApp = composioAppByName.get("gmail");
      for (const acct of gmailAccounts) {
        tools.push({
          id: `composio:${acct.connectionId}`,
          name: "Gmail",
          logoUrl: gmailApp?.logo ?? "https://logos.composio.dev/api/gmail",
          category: "email",
          authMethods: ["oauth"],
          status: "connected",
          oauth: { connectionId: acct.connectionId, connectedAt: null },
          credentials: null,
          appSlug: "gmail",
          accountEmail: acct.email,
        });
      }
    }

    // Walk 1P items. If the title matches a Composio app, either merge into
    // the existing tool row (dual-mode) or create a credentials-only row.
    // Items without a Composio match become "personalInfo" rows.
    const personalInfo: PersonalInfoItem[] = [];
    for (const item of vaultItems) {
      const key = normalize(item.title);
      const app = composioAppByName.get(key);
      const lastAccessedAt = lastAccessByTitle.get(item.title.toLowerCase()) ?? null;
      const allFilled = item.fields.length > 0 && item.fields.every((f) => f.filled);

      if (!app) {
        personalInfo.push({
          itemId: item.id,
          title: item.title,
          fields: item.fields,
          allFilled,
          lastAccessedAt,
        });
        continue;
      }

      // 1P item maps to a Composio tool. Merge into existing OAuth row if
      // there is one (dual-mode), otherwise create a credentials-only row.
      const existing = tools.find((t) => normalize(t.name) === key);
      if (existing) {
        existing.authMethods = Array.from(new Set([...existing.authMethods, "credentials"])) as ToolsListItem["authMethods"];
        existing.credentials = {
          itemId: item.id,
          fields: item.fields,
          allFilled,
          lastAccessedAt,
        };
        existing.status = existing.oauth && allFilled ? "connected" : "partial";
      } else {
        tools.push({
          id: `op:${item.id}`,
          name: app.name,
          logoUrl: app.logo ?? `https://logos.composio.dev/api/${key}`,
          category: (app.categories ?? [])[0] ?? null,
          authMethods: ["credentials"],
          status: allFilled ? "connected" : "needs_setup",
          oauth: null,
          credentials: {
            itemId: item.id,
            fields: item.fields,
            allFilled,
            lastAccessedAt,
          },
        });
      }
    }

    // Declared-but-not-yet-connected tools. The agent's `tools` array holds
    // the Composio slugs it's configured to use (set at scaffold/build time).
    // Without this pass, a fresh client sees an EMPTY tools page — nothing is
    // connected yet, so there's nothing to click. Surface each declared tool
    // as a "needs_setup" OAuth row so the client has a Connect button.
    for (const slug of agent.tools) {
      const key = normalize(slug);
      if (usedComposioKeys.has(key)) continue; // already connected
      if (tools.some((t) => normalize(t.name) === key)) continue; // already listed
      const app = composioAppByName.get(key);
      tools.push({
        id: `declared:${slug}`,
        name: app?.name ?? slug,
        logoUrl: app?.logo ?? `https://logos.composio.dev/api/${key}`,
        category: (app?.categories ?? [])[0] ?? null,
        authMethods: ["oauth"],
        status: "needs_setup",
        oauth: null,
        credentials: null,
      });
      usedComposioKeys.add(key);
    }

    // Custom (non-Composio) tools — CoStar, Crexi, etc. The agent reaches these
    // via the browse tool using credentials the client enters here, stored in
    // 1Password. Each shows as a credential-entry row. We back each with a 1P
    // item (lazily created on first visit once the client's vault exists) so
    // the existing credential form + populate route just work. With no vault
    // yet, the row still shows but is flagged vaultPending.
    type CustomToolDef = {
      name: string;
      source?: string;
      siteUrl?: string;
      fields?: Array<{ title: string; fieldType: string }>;
    };
    const customTools = Array.isArray(agent.customTools)
      ? (agent.customTools as unknown as CustomToolDef[])
      : [];
    for (const ct of customTools) {
      if (!ct?.name) continue;
      const key = normalize(ct.name);
      if (tools.some((t) => normalize(t.name) === key)) continue; // already listed
      const host = (() => {
        try {
          return ct.siteUrl ? new URL(ct.siteUrl).hostname.replace(/^www\./, "") : null;
        } catch {
          return null;
        }
      })();
      const logoUrl = host ? `https://www.google.com/s2/favicons?sz=64&domain=${host}` : null;

      // DB-backed credentials (works for every client — no 1Password vault
      // needed). If we've stored values for this tool, it's connected and all
      // declared fields count as filled (we store them together).
      const hasDbCreds = dbCredTools.has(ct.name);
      const declaredFields = (ct.fields ?? []).map((f) => ({ ...f, filled: hasDbCreds }));
      const credentials: ToolsListItem["credentials"] = {
        itemId: `db:${key}`,
        fields: declaredFields,
        allFilled: hasDbCreds,
        lastAccessedAt: lastAccessByTitle.get(ct.name.toLowerCase()) ?? null,
      };

      tools.push({
        id: `custom:${key}`,
        name: ct.name,
        logoUrl,
        category: "Custom",
        authMethods: ["credentials"],
        status: hasDbCreds ? "connected" : "needs_setup",
        oauth: null,
        credentials,
        source: "custom",
        siteUrl: ct.siteUrl ?? null,
        vaultPending: false,
      });
    }

    res.json({ tools, personalInfo });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Tools endpoint failed", { error: message });
    res.status(500).json({ error: "Tools list failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /agents/:id/tools/custom-credentials — save DB-backed custom-tool creds
// ---------------------------------------------------------------------------
// For non-Composio tools (CoStar/Crexi/The Analyst Pro): the client types the
// username/password on the portal; we validate against the agent's declared
// custom-tool fields and store them encrypted on the Credential row (no
// 1Password vault needed). Arthur resolves them at browse time.
app.post("/agents/:id/tools/custom-credentials", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { toolName, fields } = req.body ?? {};
    if (!toolName || typeof toolName !== "string" || !fields || typeof fields !== "object") {
      res.status(400).json({ error: "toolName and fields are required" });
      return;
    }
    const agent = await prisma.agent.findUnique({ where: { id: String(id) }, select: { clientId: true, customTools: true } });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const declared = Array.isArray(agent.customTools) ? (agent.customTools as Array<{ name?: string; fields?: Array<{ title: string }> }>) : [];
    const match = declared.find((t) => t?.name && t.name.toLowerCase() === toolName.toLowerCase());
    if (!match?.name) {
      res.status(400).json({ error: `Unknown custom tool: ${toolName}` });
      return;
    }
    const allowed = new Set((match.fields ?? []).map((f) => String(f.title)));
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.has(k) && typeof v === "string" && v.trim()) clean[k] = v;
    }
    if (Object.keys(clean).length === 0) {
      res.status(400).json({ error: "No credential values provided" });
      return;
    }
    const { saveCustomCredentials } = await import("../shared/secrets/db-credentials.js");
    await saveCustomCredentials(agent.clientId, match.name, clean);
    res.json({ ok: true, connected: true });
  } catch (error) {
    logger.error("Save custom credentials failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to save credentials" });
  }
});

// ---------------------------------------------------------------------------
// POST /agents/:id/tools/disconnect — remove a tool connection (portal X button)
// ---------------------------------------------------------------------------
// custom: delete the stored credentials. composio/oauth: delete ALL of the
// client's connections for that app (clears duplicates too).
app.post("/agents/:id/tools/disconnect", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { toolId, appName } = req.body ?? {};
    const agent = await prisma.agent.findUnique({ where: { id: String(id) }, select: { clientId: true, customTools: true } });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const clientId = agent.clientId;

    if (typeof toolId === "string" && toolId.startsWith("custom:")) {
      const key = toolId.slice("custom:".length);
      const declared = Array.isArray(agent.customTools) ? (agent.customTools as Array<{ name?: string }>) : [];
      const match = declared.find((t) => t?.name && t.name.toLowerCase().replace(/[\s_-]/g, "") === key);
      const { deleteCustomCredentials } = await import("../shared/secrets/db-credentials.js");
      await deleteCustomCredentials(clientId, match?.name ?? key);
      res.json({ ok: true });
      return;
    }

    // A specific Composio connection (per-account disconnect, e.g. one of two
    // Gmail inboxes): toolId === "composio:<connectionId>".
    if (typeof toolId === "string" && toolId.startsWith("composio:")) {
      const connectionId = toolId.slice("composio:".length);
      const { disconnectConnection } = await import("../shared/mcp/composio.js");
      const ok = await disconnectConnection(connectionId);
      res.json({ ok });
      return;
    }

    // Whole app (all connections for that app) — need the app slug.
    const app = typeof appName === "string" && appName ? appName : "";
    if (!app) {
      res.status(400).json({ error: "appName required to disconnect an OAuth tool" });
      return;
    }
    const { disconnectApp } = await import("../shared/mcp/composio.js");
    const removed = await disconnectApp(clientId, app);
    res.json({ ok: true, removed });
  } catch (error) {
    logger.error("Disconnect tool failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to disconnect tool" });
  }
});

// ---------------------------------------------------------------------------
// POST /agents/:id/tools/credentials/:itemId — write credential values
// ---------------------------------------------------------------------------
// Accepts the portal's form submission, populates the matching 1Password
// item via the SDK, marks the open Recommendation row (if any) fulfilled.
// Auth is delegated to the portal proxy (Supabase session + agent
// ownership check happens upstream).
//
// Trust contract: values pass through Oracle process memory ONLY for the
// duration of the SDK call. Never persisted to our DB or logs. Per-field
// names are logged on success; values are not.
// ---------------------------------------------------------------------------
app.post("/agents/:id/tools/credentials/:itemId", async (req: Request, res: Response) => {
  try {
    const agentId = param(req, "id");
    const itemId = param(req, "itemId");
    const fieldValues = (req.body?.fieldValues ?? {}) as Record<string, string>;

    if (!fieldValues || typeof fieldValues !== "object" || Array.isArray(fieldValues)) {
      res.status(400).json({ error: "fieldValues object required" });
      return;
    }
    if (Object.keys(fieldValues).length === 0) {
      res.status(400).json({ error: "fieldValues is empty" });
      return;
    }
    for (const [k, v] of Object.entries(fieldValues)) {
      if (typeof v !== "string") {
        res.status(400).json({ error: `field "${k}" must be a string` });
        return;
      }
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, clientId: true },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const { populateItem } = await import("../shared/secrets/onepassword.js");
    const { updatedFields, itemTitle } = await populateItem(agent.clientId, itemId, fieldValues);

    // Best-effort: mark the matching pending Recommendation as approved so
    // the agent knows the credential is now available. Matched by item
    // title because that's what the agent provided when requesting.
    const matchingRec = await prisma.recommendation.findFirst({
      where: {
        clientId: agent.clientId,
        emailType: "credential-request",
        status: "pending",
        title: { contains: itemTitle },
      },
      orderBy: { sentAt: "desc" },
    });
    if (matchingRec) {
      await prisma.recommendation.update({
        where: { id: matchingRec.id },
        data: {
          status: "approved",
          clientAction: "approved",
          clientActionAt: new Date(),
          resolvedAt: new Date(),
        },
      });
    }

    logger.info("Credential values saved via portal", {
      agentId,
      clientId: agent.clientId,
      itemId,
      itemTitle,
      updatedFields, // field NAMES only, never values
      recommendationFulfilled: !!matchingRec,
    });

    res.json({
      status: "saved",
      updatedFields,
      itemTitle,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Credential save failed", { error: message, agentId: param(req, "id"), itemId: param(req, "itemId") });
    res.status(500).json({ error: "Credential save failed" });
  }
});

// Run agent manually — triggers the universal runtime engine
app.post("/agents/:id/run", async (req: Request, res: Response) => {
  try {
    const agentId = param(req, "id");
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { status: true, name: true },
    });

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    if (agent.status !== "active") {
      res.status(400).json({ error: `Agent "${agent.name}" is not active (status: ${agent.status})` });
      return;
    }

    const message = req.body.message;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing 'message' in request body" });
      return;
    }

    const { processInboundMessage } = await import("../shared/runtime/index.js");
    const threadId = `thread-${agentId}-manual-${Date.now()}`;

    // Run async — don't block the HTTP response
    processInboundMessage({
      agentId,
      userMessage: message,
      channel: "email",
      threadId,
    }).catch((err: unknown) => logger.error("Manual agent run failed", { agentId, error: err }));

    res.json({ status: "running", agentId, agentName: agent.name });
  } catch (error) {
    logger.error("Agent run failed", { error });
    res.status(500).json({ error: "Agent run failed" });
  }
});

// Test a credential against an MCP server
app.post("/tools/test", async (req: Request, res: Response) => {
  try {
    const { serverId, credential } = req.body;
    if (!serverId || !credential) {
      res.status(400).json({ error: "Missing serverId or credential" });
      return;
    }

    const { getServerDefinition } = await import("../shared/mcp/registry.js");
    const { mcpManager } = await import("../shared/mcp/client.js");

    const server = getServerDefinition(serverId);
    if (!server) {
      res.status(404).json({ error: `Unknown tool: ${serverId}` });
      return;
    }

    // Connect, list tools, disconnect
    await mcpManager.connect({ server, credential });
    const tools = await mcpManager.listTools(serverId, credential);
    await mcpManager.disconnectServer(serverId, credential);

    logger.info("Tool credential test passed", { serverId, toolCount: tools.length });
    res.json({ success: true, toolCount: tools.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Tool credential test failed", { error: message });
    res.status(400).json({ success: false, toolCount: 0, error: message });
  }
});

// ---------------------------------------------------------------------------
// Composio — OAuth tool connections
// ---------------------------------------------------------------------------

// Initiate OAuth connection for a client to a specific app
app.post("/composio/connect", async (req: Request, res: Response) => {
  try {
    const { clientId, appName, redirectUrl, force } = req.body;
    if (!clientId || !appName) {
      res.status(400).json({ error: "Missing clientId or appName" });
      return;
    }

    const { initiateOAuthConnection } = await import("../shared/mcp/composio.js");
    const result = await initiateOAuthConnection(clientId, appName, redirectUrl, !!force);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Composio connect failed", { error: message });
    res.status(500).json({ error: message });
  }
});

// Connect with API key directly (no popup needed)
app.post("/composio/connect-apikey", async (req: Request, res: Response) => {
  try {
    const { clientId, appName, apiKey: toolApiKey, extraFields } = req.body;
    if (!clientId || !appName || !toolApiKey) {
      res.status(400).json({ error: "Missing clientId, appName, or apiKey" });
      return;
    }

    const { initiateApiKeyConnection } = await import("../shared/mcp/composio.js");
    const result = await initiateApiKeyConnection(clientId, appName, toolApiKey, extraFields);
    res.json({ status: "connected", connectionId: result.connectionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("API key connect failed", { error: message });
    res.status(500).json({ error: message });
  }
});

// Get auth scheme for a tool
app.get("/composio/auth-scheme/:appName", async (req: Request, res: Response) => {
  try {
    const appName = param(req, "appName");
    const composioKey = process.env.COMPOSIO_API_KEY;
    if (!composioKey) throw new Error("COMPOSIO_API_KEY is not set");

    const intRes = await fetch(`https://backend.composio.dev/api/v1/integrations?appName=${appName}`, {
      headers: { "x-api-key": composioKey },
    });
    if (!intRes.ok) {
      res.json({ authScheme: "NONE" });
      return;
    }
    const intData = await intRes.json();
    const integrations = Array.isArray(intData) ? intData : (intData.items ?? []);
    const scheme = integrations[0]?.authScheme ?? "NONE";
    res.json({ authScheme: scheme });
  } catch {
    res.json({ authScheme: "NONE" });
  }
});

// OAuth callback — Composio redirects here after client authorizes.
// Reconciles any open ToolConnectionRequest row: looks up the row by the
// Composio connection id, verifies with Composio that the connection is now
// ACTIVE, flips status="connected" + connectedAt. The Composio verification
// step prevents forged callbacks from flipping rows — an attacker guessing
// this URL can't satisfy the ACTIVE check unless the OAuth really completed.
app.get("/composio/callback", async (req: Request, res: Response) => {
  const connectionId = String(
    req.query.connectedAccountId ??
    req.query.connection_id ??
    req.query.connectionId ??
    req.query.id ??
    ""
  ).trim();

  if (connectionId) {
    try {
      const row = await prisma.toolConnectionRequest.findFirst({
        where: { composioConnectionId: connectionId },
        orderBy: { createdAt: "desc" },
      });

      if (row && row.status !== "connected") {
        const { getConnectedAccounts } = await import("../shared/mcp/composio.js");
        const connections = await getConnectedAccounts(row.clientId);
        const isActive = connections.some((c) => c.id === connectionId && c.status === "ACTIVE");

        if (isActive) {
          await prisma.toolConnectionRequest.update({
            where: { id: row.id },
            data: { status: "connected", connectedAt: new Date() },
          });
          logger.info("ToolConnectionRequest marked connected", {
            requestId: row.id, clientId: row.clientId, appName: row.appName, connectionId,
          });
        } else {
          // Composio claims not-yet-active. Could be race with their webhook;
          // leave the row at "emailed" — a later callback retry or the 24h
          // dedup window expiring will let us pick this up again.
          logger.warn("Callback fired but connection not ACTIVE in Composio", {
            requestId: row.id, clientId: row.clientId, appName: row.appName, connectionId,
          });
        }
      } else if (!row) {
        // Unknown connectionId — test click, legacy connection from before
        // this flow existed, or a param-name mismatch. Log but don't fail UX.
        logger.info("Callback for unknown ToolConnectionRequest", { connectionId, query: req.query });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("ToolConnectionRequest reconciliation failed", { connectionId, error: message });
      // Fall through to success page — the row can be reconciled later.
    }
  } else {
    logger.info("Composio callback with no connection id", { query: req.query });
  }

  res.send(`
    <html>
      <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff;">
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">&#10003;</div>
          <h1 style="font-size: 20px; font-weight: 600;">Tool Connected</h1>
          <p style="color: #888; margin-top: 8px;">You can close this window and return to the dashboard.</p>
        </div>
      </body>
    </html>
  `);
});

// List connected accounts for a client (via Composio)
app.get("/composio/connections/:clientId", async (req: Request, res: Response) => {
  try {
    const clientId = param(req, "clientId");
    const { getConnectedAccounts } = await import("../shared/mcp/composio.js");
    const connections = await getConnectedAccounts(clientId);
    res.json(connections);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Composio connections list failed", { error: message });
    res.status(500).json({ error: message });
  }
});

// List all available apps in Composio catalog
app.get("/composio/apps", async (_req: Request, res: Response) => {
  try {
    const { listApps } = await import("../shared/mcp/composio.js");
    const apps = await listApps();
    res.json(apps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Composio apps list failed", { error: message });
    res.status(500).json({ error: message });
  }
});

// Tool catalog — returns MCP registry + Composio apps
app.get("/tools/catalog", async (_req: Request, res: Response) => {
  const { MCP_SERVERS } = await import("../shared/mcp/registry.js");
  res.json(Object.values(MCP_SERVERS));
});

// Tool status for a client
app.get("/tools/status/:clientId", async (req: Request, res: Response) => {
  try {
    const clientId = param(req, "clientId");
    const credentials = await prisma.credential.findMany({
      where: { clientId },
      select: { toolName: true, status: true, connectedAt: true, lastUsedAt: true },
    });
    res.json(credentials);
  } catch (error) {
    logger.error("Tool status failed", { error });
    res.status(500).json({ error: "Failed to get tool status" });
  }
});

// Trigger improvement cycle manually
app.post("/improve", async (_req: Request, res: Response) => {
  try {
    const suggestions = await runImprovementCycle();
    res.json({ suggestions });
  } catch (error) {
    logger.error("Improvement cycle failed", { error });
    res.status(500).json({ error: "Improvement cycle failed" });
  }
});

// Bulk import agents from manifest
app.post("/import", async (req: Request, res: Response) => {
  try {
    const { importFromManifest } = await import("./import.js");
    const result = await importFromManifest(req.body);
    res.json(result);
  } catch (error) {
    logger.error("Import failed", { error });
    res.status(500).json({ error: "Import failed" });
  }
});

// Cron endpoints (hit by Railway cron or external scheduler)

app.post("/cron/fleet-health", async (_req: Request, res: Response) => {
  try {
    const status = await checkFleetHealth();
    res.json(status);
  } catch (error) {
    logger.error("Cron fleet health failed", { error });
    res.status(500).json({ error: "Fleet health check failed" });
  }
});

app.post("/cron/improvement", async (_req: Request, res: Response) => {
  try {
    const suggestions = await runImprovementCycle();
    res.json({ suggestions });
  } catch (error) {
    logger.error("Cron improvement failed", { error });
    res.status(500).json({ error: "Improvement cycle failed" });
  }
});

// Start server
const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, async () => {
  logger.info(`Oracle running on port ${PORT}`);

  // Initialize agent scheduler — registers cron jobs for all active agents
  try {
    const { initScheduler } = await import("./scheduler.js");
    await initScheduler();
  } catch (error) {
    logger.error("Scheduler initialization failed", { error });
  }
});
