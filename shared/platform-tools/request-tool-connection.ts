import prisma from "../db.js";
import logger from "../logger.js";
import { initiateOAuthConnection } from "../mcp/composio.js";

// ---------------------------------------------------------------------------
// request_tool_connection — mid-run OAuth request flow
// ---------------------------------------------------------------------------
// Called by an agent when Claude realizes it needs a tool that isn't
// connected for this client. Generates a Composio OAuth link, emails the
// client a permission request, and logs a ToolConnectionRequest row so we
// don't re-email if the agent asks for the same app again in the next 24h.
//
// Returns a plain-text summary that goes back to Claude. The runtime engine
// will usually want Claude to continue without the requested tool for now
// (the client will click, we'll mark the row connected, and the tool shows
// up on the next run).
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h — don't re-email same app

export interface RequestToolConnectionInput {
  agentId: string;
  clientId: string;
  appName: string;
  reason: string;
  // Sender for the permission email. Injected by the runtime so this module
  // stays free of the oracle/ import (which would create a cycle).
  sendPermissionEmail: (args: {
    agentId: string;
    to: string;
    summary: string;
    reason: string;
    appName: string;
    ctaUrl: string;
    approveActionId: string;
  }) => Promise<void>;
}

export interface RequestToolConnectionResult {
  status: "emailed" | "already_pending" | "already_connected" | "unavailable" | "error";
  message: string; // text returned to Claude
  requestId?: string;
}

export async function requestToolConnection(
  input: RequestToolConnectionInput
): Promise<RequestToolConnectionResult> {
  const { agentId, clientId, appName, reason, sendPermissionEmail } = input;
  const normalizedApp = appName.trim().toLowerCase();

  // --- De-dup: is there already an open request for this app in the last 24h?
  const existing = await prisma.toolConnectionRequest.findFirst({
    where: {
      clientId,
      appName: normalizedApp,
      status: { in: ["pending", "emailed"] },
      createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    logger.info("Tool connection already pending", {
      agentId, clientId, appName: normalizedApp, requestId: existing.id,
    });
    return {
      status: "already_pending",
      message: `I've already asked the client to connect ${appName} — waiting for them to click the link in my earlier email. Continue without this tool for now; I'll retry on the next run once it's connected.`,
      requestId: existing.id,
    };
  }

  // --- Ask Composio for the OAuth URL
  let redirectUrl: string;
  let connectionId: string;
  let alreadyConnected = false;
  try {
    const conn = await initiateOAuthConnection(clientId, normalizedApp);
    redirectUrl = conn.redirectUrl;
    connectionId = conn.connectionId;
    alreadyConnected = conn.alreadyConnected === true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("initiateOAuthConnection failed", { agentId, clientId, appName: normalizedApp, err: message });
    // Most common failure: no auth config exists for this app in Composio.
    // Tell Claude so it can suggest an alternative rather than retrying.
    return {
      status: "unavailable",
      message: `${appName} isn't available via one-click OAuth right now (${message.slice(0, 160)}). Tell the client you'll follow up with the team to get this connected, and continue with any other tools you have.`,
    };
  }

  if (alreadyConnected) {
    // Edge case: Composio says already connected but the agent didn't see the
    // tool. Usually a cache or agent.tools[] drift — surface it so the next
    // run picks up the tool list correctly.
    logger.info("App already connected per Composio", { agentId, clientId, appName: normalizedApp });
    return {
      status: "already_connected",
      message: `${appName} is already connected for this client — the tool should be available to me. Retrying the task now (if you still can't see ${appName} tools, this may resolve on the next scheduled run).`,
    };
  }

  // --- Write the request row BEFORE sending the email so the callback has
  // something to reconcile against if the client clicks immediately.
  const request = await prisma.toolConnectionRequest.create({
    data: {
      clientId,
      agentId,
      appName: normalizedApp,
      reason,
      composioConnectionId: connectionId || null,
      redirectUrl: redirectUrl || null,
      status: "pending",
    },
    select: { id: true },
  });

  // --- Send the permission email
  const clientRow = await prisma.client.findUnique({
    where: { id: clientId },
    select: { email: true },
  });
  if (!clientRow?.email) {
    // Shouldn't happen for a valid clientId, but don't crash the tool loop.
    logger.error("Client has no email; cannot send permission request", { clientId });
    return {
      status: "error",
      message: `I tried to email the client a connection link for ${appName} but couldn't find their contact email. Skipping for now.`,
      requestId: request.id,
    };
  }

  try {
    await sendPermissionEmail({
      agentId,
      to: clientRow.email,
      summary: `I need access to your ${appName} account to ${reason}. Click below to authorize — takes ~30 seconds.`,
      reason,
      appName,
      ctaUrl: redirectUrl,
      approveActionId: request.id,
    });

    await prisma.toolConnectionRequest.update({
      where: { id: request.id },
      data: { status: "emailed", emailSentAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to send permission email", { agentId, clientId, appName: normalizedApp, err: message });
    // Leave the row at status="pending" — a future run can retry, and the
    // dedup window still protects against a spam loop.
    return {
      status: "error",
      message: `I generated an auth link for ${appName} but couldn't email it to the client (${message.slice(0, 160)}). I'll retry on the next run.`,
      requestId: request.id,
    };
  }

  logger.info("Tool connection requested", { agentId, clientId, appName: normalizedApp, requestId: request.id });

  return {
    status: "emailed",
    message: `I've emailed the client a one-click link to connect ${appName}. Continue with what you can do without it; I'll use ${appName} on the next run once they authorize.`,
    requestId: request.id,
  };
}
