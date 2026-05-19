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
): Promise<{ ok: true; senderType: "client" | "prospect"; prospectId?: string } | { ok: false; reason: string }> {
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

    const threadId = `thread-${agentId}-${agent.clientId}`;

    // Run the full agent runtime: parse → Claude + tools → response
    const { processInboundMessage } = await import("../shared/runtime/index.js");
    const result = await processInboundMessage({
      agentId,
      userMessage: messageContent,
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
      // Best-effort WhatsApp ping to Kyle. Atlas's portal approve route already
      // flipped status → quote_pending; this is the human-loop notification so
      // Kyle knows to draft the quote.
      try {
        const { sendKyleWhatsApp } = await import("../shared/whatsapp.js");
        const portalBase = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";
        const proposalUrl = `${portalBase}/proposals/${prospect.token}`;
        const businessLine = prospect.businessName ? ` (${prospect.businessName})` : "";
        const contactLine = prospect.contactName ? ` from ${prospect.contactName}` : "";
        await sendKyleWhatsApp(
          `🎯 Scope approved${contactLine}${businessLine}. Draft a quote and send.\n\nProposal: ${proposalUrl}`
        );
      } catch (err) {
        logger.warn("Scope-approved WhatsApp ping failed", { prospectId: prospect.id, error: err });
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
- Budget bucket: ${get("budget") || "(not provided)"}

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
    "subtext": "Pricing and timeline come after you approve scope — we'll handle those next.",
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

# Hard rules

- **Output ONLY the JSON object.** No prose before or after. No code fences. No "here you go". Just the raw object, starting with \`{\` and ending with \`}\`.
- **Use the CTA URLs from the section above verbatim.** Do not invent URLs.
- **Footer domain = "ambitt.agency", location = "Dallas, TX".**
- **greeting.name = the prospect's preferred first name** ("${get("preferredName") || firstName}").
- **Name the agent throughout.** If the prospect gave a name (\`${get("agentName") || "(none)"}\`) and role (\`${get("agentRole") || "(none)"}\`), use them in: \`hero.title\` (e.g. "Meet Bob,<br>your lead-gen agent."), \`whatWeBuild.headline\` (a job-title that builds on their chosen role), \`flow.steps[].description\` (refer to the agent BY NAME — "Bob hunts…", "Bob drafts…"), \`digest.cardTitle\` (e.g., "Bob's Daily Report"), and \`sample.card.signature\` if the sample artifact is sent from your client's brand (NOT from the agent itself — sign as the client's business, never as the agent). If the prospect did NOT provide a name, propose one in your response that fits their brand voice; if they did NOT provide a role, infer one from their pitch.
- **hero.status = { text: "Pending your review", tone: "warn" }.**
- **Do NOT include pricing, retainer, setup fee, or timeline.** That's the cta.subtext's reassurance only.
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
