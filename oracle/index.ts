import "dotenv/config";
import express, { Request, Response } from "express";
import multer from "multer";
import { scaffoldAgent, approveAgent, rejectAgent } from "./scaffold.js";
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

// Inbound-email authorization. An agent only accepts mail from its owning
// client. Platform agents (acceptFromProspects=true, e.g. Atlas) also accept
// mail from any active Prospect — by design, since prospects are not yet
// clients. Anything else is silently dropped.
async function checkInboundAuth(
  agentId: string,
  fromHeader: string
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

  if (senderEmail === agent.client.email.toLowerCase()) {
    return { ok: true, senderType: "client" };
  }

  // Platform-operator path — only honored for platform agents (acceptFromProspects=true).
  // Lets Kyle email Atlas (or any future platform agent) directly to drive
  // operator-mode tasks like spawn_prospect. KYLE_EMAIL env var is the source
  // of truth — when there are more operators, replace with a real allowlist.
  const operatorEmail = process.env.KYLE_EMAIL?.toLowerCase().trim();
  if (operatorEmail && senderEmail === operatorEmail && agent.acceptFromProspects) {
    return { ok: true, senderType: "platform_operator" };
  }

  if (agent.acceptFromProspects) {
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
  try {
    await approveAgent(param(req, "id"));
    res.json({ status: "approved" });
  } catch (error) {
    logger.error("Agent approval failed", { error, agentId: param(req, "id") });
    res.status(500).json({ error: "Approval failed" });
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
    const { tone, emailFrequency, digestHour, digestDayOfWeek, autonomyLevel } = req.body ?? {};
    const updates: { tone?: string; emailFrequency?: string; digestHour?: number; digestDayOfWeek?: number; autonomyLevel?: string } = {};

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

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid config fields provided" });
      return;
    }

    const agent = await prisma.agent.update({
      where: { id },
      data: updates,
      select: { id: true, tone: true, emailFrequency: true, digestHour: true, digestDayOfWeek: true, autonomyLevel: true },
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
      await approveAgent(agentId);
      logger.info("Agent approved via WhatsApp", { agentId });
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

    // Extract agentId from recipient: reply-{agentId}@ambitt.agency
    const replyAddress = toAddresses.find((addr: string) => addr.startsWith("reply-"));
    if (!replyAddress) {
      logger.warn("Inbound email not addressed to an agent", { to: toAddresses });
      res.json({ status: "ignored", reason: "No reply-{agentId} address found" });
      return;
    }

    const agentId = replyAddress.replace(/^reply-/, "").split("@")[0];

    // Fetch full email content from Resend API
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      res.status(500).json({ error: "RESEND_API_KEY not configured" });
      return;
    }

    const emailRes = await fetch(`https://api.resend.com/emails/${emailId}`, {
      headers: { Authorization: `Bearer ${resendKey}` },
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      logger.error("Failed to fetch inbound email from Resend", { emailId, status: emailRes.status, body: errBody });
      res.status(502).json({ error: "Failed to fetch email content from Resend" });
      return;
    }

    const emailData = await emailRes.json();
    const from = emailData.from ?? event.data?.from ?? "";
    const subject = (emailData.subject ?? event.data?.subject ?? "").toUpperCase().trim();

    // Sender authorization. Only the agent's owner client (or, for platform
    // agents like Atlas, an active Prospect) can drive an agent run. Anyone
    // else is silently dropped — 200 so Resend doesn't retry, but no work.
    const auth = await checkInboundAuth(agentId, from);
    if (!auth.ok) {
      logger.warn("Inbound email rejected — unauthorized sender", { agentId, from, reason: auth.reason });
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

    let messageContent = emailData.text || emailData.html || "";

    // Parse attachments if present
    if (Array.isArray(emailData.attachments) && emailData.attachments.length > 0) {
      // Fetch attachment content from the raw signed URL
      const attachmentsWithContent = [];
      for (const att of emailData.attachments) {
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
      res.status(400).json({ error: "Empty message" });
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

    // Platform-operator path — when Kyle (KYLE_EMAIL) emails a platform agent
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

    // Dispatch — immediate send OR queue for digest, based on agent.emailFrequency
    const { dispatchAgentResponse } = await import("./lib/dispatchAgentResponse.js");
    const dispatch = await dispatchAgentResponse({
      agentId,
      runtimeOutput: result,
      isReply: true,
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
        });
      } catch (err) {
        logger.warn("Atlas thank-you email failed (continuing)", { prospectId: prospect.id, error: err });
      }

      // Pass 1 — Atlas reads the intake and emits ProposalEmailData JSON.
      const pass1 = await processInboundMessage({
        agentId: atlas.id,
        userMessage: buildAtlasProposalPrompt(prospect),
        channel: "chat",
        threadId,
        senderEmail: prospect.email,
        billable: false,
      });

      // Parse → validate. One retry on validation failure (re-uses thread so
      // Atlas sees its previous output + the validation error).
      const tryRender = (raw: string): { html: string; data: unknown } => {
        const parsed = parseAtlasJsonOutput(raw);
        if (parsed === null) {
          throw new ProposalEmailValidationError([
            { path: [], code: "custom", message: "No JSON block found in response" } as any,
          ]);
        }
        return { html: renderProposalEmail(parsed), data: parsed };
      };

      let rendered: { html: string; data: unknown };
      let toolsUsed = pass1.toolsUsed.length;
      let loopCount = pass1.loopCount;

      try {
        rendered = tryRender(pass1.response);
      } catch (err) {
        if (!(err instanceof ProposalEmailValidationError)) throw err;
        logger.warn("Atlas first-pass JSON invalid — retrying once", {
          prospectId: prospect.id,
          issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
        const correction = `Your previous response didn't pass schema validation. Issues:\n${err.issues
          .map((i, n) => `${n + 1}. ${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n")}\n\nRe-emit the COMPLETE ProposalEmailData JSON with these fixed. Output ONLY the JSON object, no commentary, no code fences.`;
        const pass2 = await processInboundMessage({
          agentId: atlas.id,
          userMessage: correction,
          channel: "chat",
          threadId,
          senderEmail: prospect.email,
          billable: false,
        });
        rendered = tryRender(pass2.response);
        toolsUsed += pass2.toolsUsed.length;
        loopCount += pass2.loopCount;
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
      // history) and KYLE_EMAIL is the recipient.
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

    const atlas = await prisma.agent.findUnique({
      where: { email: "atlas@ambitt.agency" },
      select: { id: true, clientId: true, name: true, status: true },
    });
    if (!atlas || atlas.status !== "active") {
      res.status(500).json({ error: "Atlas is not seeded or not active" });
      return;
    }

    const threadId = `prospect-${prospect.id}-prd`;
    const { processInboundMessage } = await import("../shared/runtime/index.js");
    const { renderPRD, parseAtlasPRDOutput, PRDValidationError } = await import("./templates/prd/render.js");

    const pass1 = await processInboundMessage({
      agentId: atlas.id,
      userMessage: buildAtlasPRDPrompt(prospect, regenNotes),
      channel: "chat",
      threadId,
      senderEmail: prospect.email,
      billable: false,
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
      const pass2 = await processInboundMessage({
        agentId: atlas.id,
        userMessage: correction,
        channel: "chat",
        threadId,
        senderEmail: prospect.email,
        billable: false,
      });
      result = tryValidate(pass2.response);
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
    const { processInboundMessage } = await import("../shared/runtime/index.js");
    const { renderQuote, parseAtlasQuoteOutput, QuoteValidationError } = await import("./templates/quote/render.js");

    const pass1 = await processInboundMessage({
      agentId: atlas.id,
      userMessage: buildAtlasQuotePrompt(prospect),
      channel: "chat",
      threadId,
      senderEmail: prospect.email,
      billable: false,
    });

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

    let result: { data: unknown; html: string };
    try {
      result = tryValidate(pass1.response);
    } catch (err) {
      if (!(err instanceof QuoteValidationError)) throw err;
      logger.warn("Atlas first-pass Quote JSON invalid — retrying once", {
        prospectId: prospect.id,
        issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
      const correction = `Your previous quote didn't pass schema validation. Issues:\n${err.issues
        .map((i, n) => `${n + 1}. ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n")}\n\nRe-emit the COMPLETE QuoteData JSON with these fixed. Output ONLY the JSON object, no commentary, no code fences.`;
      const pass2 = await processInboundMessage({
        agentId: atlas.id,
        userMessage: correction,
        channel: "chat",
        threadId,
        senderEmail: prospect.email,
        billable: false,
      });
      result = tryValidate(pass2.response);
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

    // Best-effort tools-handoff email to the new client.
    try {
      const atlas = await prisma.agent.findUnique({
        where: { email: "atlas@ambitt.agency" },
        select: { id: true, name: true },
      });
      if (atlas) {
        const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";
        const toolsUrl = `${portalBase}/agents/${agent.id}/tools`;
        const { sendEmail } = await import("../shared/email.js");
        await sendEmail({
          agentId: atlas.id,
          agentName: atlas.name,
          to: client.email,
          subject: `Welcome — let's get ${agent.name} ready`,
          html: renderToolsHandoffEmail({
            firstName: (client.contactName ?? "").split(/\s+/)[0] || "there",
            agentName: agent.name,
            agentRole: prd.identity.agentRole,
            toolsUrl,
            portalBase,
            toolsList: prd.tools.map((t) => ({ name: t.name, source: t.source })),
          }),
          replyToAgentId: atlas.id,
        });
        logger.info("Convert: tools-handoff email sent", { to: client.email });
      }
    } catch (err) {
      logger.warn("Convert: tools-handoff email failed (continuing)", { prospectId: prospect.id, error: err });
    }

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

function buildAtlasQuotePrompt(prospect: {
  id: string;
  email: string;
  token: string;
  contactName: string | null;
  businessName: string | null;
  prdData: unknown;
}): string {
  const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";
  const approveUrl = `${portalBase}/quotes/${prospect.token}/approve`;
  const denyUrl = `${portalBase}/quotes/${prospect.token}/deny`;
  const prdJson = JSON.stringify(prospect.prdData, null, 2);

  return `The PRD for this prospect has been approved. Now draft the quote — the client-facing artifact they'll Approve or Deny on a hosted page.

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
    setupCents: number;                         // integer cents — match PRD's suggestedSetupCents
    monthlyCents: number;                       // integer cents — match PRD's suggestedMonthlyCents
    tierLabel: string;                          // "Growth tier" / "Starter tier"
    summary: string;                            // 1-3 sentences explaining what they're paying for, can reference market findings naturally
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
- Pricing numbers MUST match the PRD's pricing block exactly. Don't second-guess Kyle's reviewed pricing.
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
- growth: ~$999/mo. Medium volume (5-30 daily actions), 1 custom tool acceptable, 2-4 integrations.
- scale: ~$2499/mo. Higher volume, 2+ custom tools, complex flows, multi-tool orchestration.
- enterprise: $2499+/mo. Custom retainer, bespoke deep integration.

Setup fee scales with custom-tool work: ~$0 if all Composio, ~$1500 per custom_platform_tool, ~$1000 per custom_browse flow.

# REQUIRED: market research BEFORE pricing
Before you finalize the pricing block, run **web_search** to ground your numbers. Don't guess. At minimum:

1. **Competing agencies / platforms** — search for what other people charge for an agent doing this job. Examples: "${get("agentRole") || "lead generation"} agency pricing 2026", "AI ${get("agentRole") || "outreach"} tool pricing", or the specific category (e.g., "cold email SDR-as-a-service pricing", "AI customer support agent pricing 2026"). Pull 2-3 real data points.
2. **Replacement role cost** — what would the prospect pay a human to do this job? Search "${get("agentRole") || "the role"} contractor rate", "junior ${get("agentRole") || "SDR"} salary US small business", or whatever's appropriate. One data point is enough here.
3. **Category benchmarks** — search for what similar SaaS products charge in this space ("${(get("industry") || "this category").toLowerCase()} automation tools pricing", or any direct competitor you know of). Pull 1-2 more data points.

Take the **3-8 best data points** from those searches and put them in \`pricing.marketResearch.findings\`. Synthesize the overall picture in \`pricing.marketResearch.summary\` (2-4 sentences). Set \`pricing.marketResearch.replacementCost\` to the loaded monthly cost of the human alternative (null only if there genuinely isn't a human equivalent — rare).

THEN propose pricing that fits the research: typically below the replacement cost (so we're cheaper than hiring), in line with or slightly under comparable SaaS, and reflecting the buildPlan effort in the setup fee. The pricing.reasoning sentence must connect the suggested numbers to specific findings from the research.

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
// When KYLE_EMAIL emails a platform agent (auth.senderType="platform_operator"),
// we wrap the raw email body with explicit instructions so the agent knows
// it's in ops mode rather than client/prospect mode. Keeps the agent's
// permanent system prompt clean — the operator path is rare and contextual.

function buildOperatorModeMessage(emailBody: string, fromHeader: string): string {
  return `An authorized platform operator (${fromHeader}) just sent you this message. You're in OPERATOR MODE — this is not a prospect or client interaction. Treat it as an ops instruction.

The most common operator instruction is "send the onboarding link to <person>" — sometimes with a few sentences of context about the prospect (where the operator met them, what their business is, why they're a fit). When that's the ask:

1. Extract the prospect's name + email from the operator's message.
2. Compose a 2–4 sentence personalized intro paragraph drawing on whatever context the operator gave. Reference something concrete (where they met, what the prospect does, what hooked the operator's interest). Plain prose — no subject line, no greeting like "Hi Maya,", no "Click here" — those are added automatically. Just the body.
3. Call the spawn_prospect tool with { name, email, custom_message: <your personalized paragraph> }.
4. After the tool returns, reply to the operator with a short confirmation: 1–2 sentences naming the prospect + a quoted snippet of the personalized line you wrote + the spawn result (new or resumed). End the turn.

If the operator's message isn't a spawn request, respond naturally — but stay in ops voice. You're talking to the platform operator, not a client.

Operator's message follows:
---
${emailBody.trim()}
---`;
}

// ---------------------------------------------------------------------------
// Ops notifications
// ---------------------------------------------------------------------------
// Email-to-Kyle helper for system events that used to go via WhatsApp.
// Sender is always Atlas (most ops events relate to a prospect Atlas is
// running for); recipient is KYLE_EMAIL. Swap to whatsapp.ts when Twilio is
// wired in prod.

async function notifyOps(input: {
  atlasId: string;
  atlasName: string;
  subject: string;
  html: string;
}): Promise<void> {
  const to = process.env.KYLE_EMAIL;
  if (!to) {
    logger.warn("notifyOps: KYLE_EMAIL not set, skipping ops notification", { subject: input.subject });
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

# Their answers
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
      select: { id: true, clientId: true, tools: true },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const clientId = agent.clientId;

    const [connectedAccounts, composioApps, vaultItems, audits] = await Promise.all([
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
      const app = composioAppByName.get(key);
      tools.push({
        id: `composio:${conn.id}`,
        name: app?.name ?? conn.appName,
        logoUrl: null, // listApps() return shape doesn't include logo today
        category: (app?.categories ?? [])[0] ?? null,
        authMethods: ["oauth"],
        status: "connected",
        oauth: { connectionId: conn.id, connectedAt: null },
        credentials: null,
      });
      usedComposioKeys.add(key);
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
          logoUrl: null,
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

    res.json({ tools, personalInfo });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Tools endpoint failed", { error: message });
    res.status(500).json({ error: "Tools list failed" });
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
    const { clientId, appName, redirectUrl } = req.body;
    if (!clientId || !appName) {
      res.status(400).json({ error: "Missing clientId or appName" });
      return;
    }

    const { initiateOAuthConnection } = await import("../shared/mcp/composio.js");
    const result = await initiateOAuthConnection(clientId, appName, redirectUrl);
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
