import prisma from "../db.js";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// request_approval — supervised-mode approval gate
// ---------------------------------------------------------------------------
// Called by Claude when it wants to execute a side-effectful action (send an
// email, update a CRM record, post content, etc.) and the agent is in
// supervised mode. The handler:
//
//   1. Creates a Recommendation row carrying the plan + a unique actionId.
//   2. Fires an action-required email to the client with Approve / Ask /
//      Dismiss buttons (mailto subject lines that the inbound-email webhook
//      already parses as APPROVE/DISMISS/RETRY → Recommendation.status).
//   3. Returns { status: "pending", isPause: true } so the engine breaks
//      out of the tool-use loop and ends the run. The client's next reply
//      re-enters the runtime with full conversation history; Claude sees
//      its prior proposal and the approval (or modification) and proceeds.
//
// Autonomous-mode runs never call this tool — the system prompt instructs
// Claude that autonomous mode executes directly. The check is prompt-level;
// we don't gate the tool here because legitimate supervised→autonomous
// transitions during a long-running thread could break.
// ---------------------------------------------------------------------------

export interface RequestApprovalInput {
  agentId: string;
  clientId: string;
  summary: string;       // one-line headline of the plan
  planItems: string[];   // bullet list of concrete steps Claude will take on approve
  reasoning?: string;    // optional short why
  // Sender for the action-required email. Injected by the runtime to keep
  // this module free of oracle/ imports (matches request-tool-connection's
  // pattern).
  sendActionRequiredEmail: (args: {
    agentId: string;
    to: string;
    summary: string;
    planItems: string[];
    reasoning: string;
    approveActionId: string;
  }) => Promise<void>;
}

export interface RequestApprovalResult {
  status: "pending" | "error";
  message: string; // what Claude sees as the tool result
  recommendationId?: string;
  isPause: boolean; // engine signal to break the tool-use loop
}

export async function requestApproval(
  input: RequestApprovalInput
): Promise<RequestApprovalResult> {
  const { agentId, clientId, summary, planItems, reasoning, sendActionRequiredEmail } = input;

  if (!summary || summary.trim().length === 0) {
    return {
      status: "error",
      message: "request_approval requires a non-empty summary.",
      isPause: false,
    };
  }
  if (!Array.isArray(planItems) || planItems.length === 0) {
    return {
      status: "error",
      message: "request_approval requires at least one plan_item.",
      isPause: false,
    };
  }

  const clientRow = await prisma.client.findUnique({
    where: { id: clientId },
    select: { email: true },
  });
  if (!clientRow?.email) {
    logger.error("Client has no email for approval email", { clientId });
    return {
      status: "error",
      message: "I tried to send the plan for approval but couldn't find the client's email. Skipping.",
      isPause: false,
    };
  }

  // Create the Recommendation row first so the approveActionId exists when
  // the email lands. Recommendation schema has required metric fields; we
  // fill them with neutral values — supervised-mode approvals aren't
  // metric-tracked, they're action gates.
  const recommendation = await prisma.recommendation.create({
    data: {
      agentId,
      clientId,
      title: summary.slice(0, 200),
      description: planItems.map((p) => `• ${p}`).join("\n"),
      actionItems: planItems,
      reasoning: reasoning ?? "",
      expectedMetric: "approval",
      baselineValue: 0,
      expectedDirection: "neutral",
      emailType: "action-required",
      status: "pending",
      // approveActionId gets auto-set by cuid via the id default; we use the
      // row id as the actionId to keep it unique + look-up-able.
    },
    select: { id: true },
  });

  // Write approveActionId = id (derived, unique).
  const actionId = recommendation.id;
  await prisma.recommendation.update({
    where: { id: recommendation.id },
    data: { approveActionId: actionId },
  });

  try {
    await sendActionRequiredEmail({
      agentId,
      to: clientRow.email,
      summary,
      planItems,
      reasoning: reasoning ?? "",
      approveActionId: actionId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to send action-required email", { agentId, clientId, err: message });
    return {
      status: "error",
      message: `I built the plan but couldn't email it to the client (${message.slice(0, 160)}). I'll retry on the next run.`,
      recommendationId: recommendation.id,
      isPause: false,
    };
  }

  logger.info("Approval requested", {
    agentId,
    clientId,
    recommendationId: recommendation.id,
    actionId,
    planItemCount: planItems.length,
  });

  return {
    status: "pending",
    message: `I've sent the plan to the client and paused. They'll reply with APPROVE (to proceed), DISMISS (to cancel), or a natural-language modification. Do NOT call any more tools — end your turn here with a brief acknowledgement to the client.`,
    recommendationId: recommendation.id,
    isPause: true,
  };
}
