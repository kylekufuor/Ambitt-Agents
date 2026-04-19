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

// ---------------------------------------------------------------------------
// Standard endpoints
// ---------------------------------------------------------------------------

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "oracle", timestamp: new Date().toISOString() });
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

app.patch("/agents/:id/config", async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const { tone, emailFrequency, digestHour, digestDayOfWeek } = req.body ?? {};
    const updates: { tone?: string; emailFrequency?: string; digestHour?: number; digestDayOfWeek?: number } = {};

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

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid config fields provided" });
      return;
    }

    const agent = await prisma.agent.update({
      where: { id },
      data: updates,
      select: { id: true, tone: true, emailFrequency: true, digestHour: true, digestDayOfWeek: true },
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

          // Confirm back to client
          const agent = await prisma.agent.findUnique({
            where: { id: agentId },
            select: { name: true, client: { select: { email: true } } },
          });

          if (agent) {
            const { sendEmail: sendConfirm } = await import("../shared/email.js");
            const actionLabel = action === "approved" ? "approved" : action === "dismissed" ? "dismissed" : "queued for retry";
            await sendConfirm({
              agentId,
              agentName: agent.name,
              to: agent.client?.email ?? from,
              subject: `${agent.name} — Action ${actionLabel}`,
              html: `<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
                <p>Got it. I've <strong>${actionLabel}</strong> the recommendation: "${recommendation.title}".</p>
                ${action === "approved" ? "<p>I'll proceed with this action and follow up with results.</p>" : ""}
                ${action === "retry" ? "<p>I'll retry this action now.</p>" : ""}
                <p style="color: #9ca3af; font-size: 13px;">— ${agent.name}, your AI agent at Ambitt</p>
              </div>`,
              replyToAgentId: agentId,
            });
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
