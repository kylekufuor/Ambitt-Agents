import "dotenv/config";
import express, { Request, Response } from "express";
import { scaffoldAgent, approveAgent, rejectAgent } from "./scaffold.js";
import { checkFleetHealth, retryFailedAgent } from "./monitor.js";
import { runImprovementCycle } from "./improve.js";
// import { routeTask } from "./router.js"; // TODO: re-enable when scheduled tasks are built
import { handleStripeWebhook } from "./billing.js";
import { onboardClient } from "./onboard.js";
import prisma from "../shared/db.js";
import logger from "../shared/logger.js";

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

app.use(express.json());

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
    res.json({ status: "paused" });
  } catch (error) {
    logger.error("Agent pause failed", { error, agentId: param(req, "id") });
    res.status(500).json({ error: "Pause failed" });
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
    res.json({ status: "killed" });
  } catch (error) {
    logger.error("Agent kill failed", { error, agentId: param(req, "id") });
    res.status(500).json({ error: "Kill failed" });
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

    // Build and send response email
    const { buildAgentResponseEmail } = await import("./templates/agent-response.js");
    const { sendEmail } = await import("../shared/email.js");

    const responseHtml = buildAgentResponseEmail({
      agentName: agent.name,
      agentRole: agent.purpose,
      clientBusinessName: agent.client.businessName,
      responseBody: result.response,
      toolsUsed: result.toolsUsed,
    });

    await sendEmail({
      agentId,
      agentName: agent.name,
      to: agent.client.email,
      subject: `Re: ${agent.name} — ${agent.client.businessName}`,
      html: responseHtml,
      replyToAgentId: agentId,
      attachments: result.attachments.length > 0 ? result.attachments : undefined,
    });

    logger.info("Agent email reply sent", {
      agentId,
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

// OAuth callback — Composio redirects here after client authorizes
app.get("/composio/callback", async (req: Request, res: Response) => {
  // Composio handles the token exchange; this just confirms to the user
  res.send(`
    <html>
      <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff;">
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
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
