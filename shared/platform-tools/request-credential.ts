import prisma from "../db.js";
import logger from "../logger.js";
import { findItemByTitle, createCredentialItem, type CredentialFieldDef } from "../secrets/onepassword.js";

// ---------------------------------------------------------------------------
// request_credential — agent-initiated 1Password item provisioning
// ---------------------------------------------------------------------------
// The agent calls this when it needs a credential the client hasn't yet
// provided (e.g. LinkedIn password, SSN for a job application form). The
// handler:
//
//   1. Looks up the client's pinned 1Password vault.
//   2. Idempotency check: if an item with `itemTitle` already exists, reuse
//      it (don't create a duplicate). The client may have already added it
//      partially, or this might be a retry from a prior failed run.
//   3. Otherwise, creates an empty item with the requested field shape via
//      the 1Password SDK. The fields are placeholders (empty strings); the
//      client fills them in via 1Password's branded UI.
//   4. Sends an action-required email to the client with the item's URL
//      as the CTA. Clicking the URL opens the item in 1Password app /
//      browser extension / web UI — whatever the client uses.
//   5. Returns `{ status: "pending", isPause: true }` so the engine stops
//      the tool-use loop. The agent's next run (triggered by the client
//      replying or by the next cron tick) will use the resolveSecret()
//      helper to fetch the value via op:// reference — at that point the
//      value lives only inside the secret-injection layer (Phase C),
//      never in Claude's context.
//
// Why this matters: the agent self-services credential collection. No
// "please send me your password over email." No Kyle in the loop. The
// client provisions the value in the tool they already trust.
// ---------------------------------------------------------------------------

export interface RequestCredentialInput {
  agentId: string;
  clientId: string;
  itemTitle: string;       // e.g. "LinkedIn", "Indeed", "SSN"
  fields: CredentialFieldDef[]; // shape of fields the agent needs filled
  reason: string;          // agent-authored "why I need this" — surfaced in the email
  // Sender for the action-required email. Injected by the runtime to keep
  // this module free of oracle/ imports (matches request-tool-connection
  // and request-approval patterns).
  sendActionRequiredEmail: (args: {
    agentId: string;
    to: string;
    itemTitle: string;
    fieldTitles: string[];
    reason: string;
    openUrl: string;
    approveActionId: string;
  }) => Promise<void>;
}

export interface RequestCredentialResult {
  status: "emailed" | "already_exists" | "error";
  message: string;       // text returned to Claude as the tool result
  itemId?: string;
  openUrl?: string;
  isPause: boolean;      // engine signal to break the tool-use loop
}

export async function requestCredential(
  input: RequestCredentialInput
): Promise<RequestCredentialResult> {
  const { agentId, clientId, itemTitle, fields, reason, sendActionRequiredEmail } = input;

  if (!itemTitle || itemTitle.trim().length === 0) {
    return { status: "error", message: "request_credential requires itemTitle.", isPause: false };
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    return { status: "error", message: "request_credential requires at least one field.", isPause: false };
  }
  if (!reason || reason.trim().length === 0) {
    return { status: "error", message: "request_credential requires a reason (surfaced in the email).", isPause: false };
  }

  const dbClient = await prisma.client.findUnique({
    where: { id: clientId },
    select: { email: true, onepasswordVaultId: true },
  });
  if (!dbClient?.email) {
    return { status: "error", message: "No client email on file.", isPause: false };
  }
  if (!dbClient.onepasswordVaultId) {
    return {
      status: "error",
      message:
        "I'd request your credentials via 1Password, but no vault is provisioned for you yet. Tell the operator (Kyle) to set up your 1Password vault.",
      isPause: false,
    };
  }

  // --- Idempotency: reuse existing item if one already exists
  let openUrl: string;
  let itemId: string;
  let alreadyExisted: boolean;

  try {
    const existing = await findItemByTitle(clientId, itemTitle);
    if (existing) {
      itemId = existing.id;
      openUrl = `https://${process.env.ONEPASSWORD_ACCOUNT_DOMAIN}/vaults/${existing.vaultId}/allitems/${existing.id}`;
      alreadyExisted = true;
      logger.info("Credential item already exists, reusing", { clientId, itemTitle, itemId });
    } else {
      const created = await createCredentialItem(clientId, itemTitle, fields);
      itemId = created.itemId;
      openUrl = created.openUrl;
      alreadyExisted = false;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("createCredentialItem failed", { clientId, itemTitle, err: message });
    return {
      status: "error",
      message: `I tried to set up a 1Password item for ${itemTitle} but failed: ${message.slice(0, 200)}`,
      isPause: false,
    };
  }

  // Stamp a recommendation row so the existing APPROVE/DISMISS reply
  // infrastructure (oracle/index.ts inbound-email webhook) can be used by
  // the client to acknowledge / decline. Not strictly required for the
  // resolve-on-next-run model, but gives us an audit row + action id.
  const recommendation = await prisma.recommendation.create({
    data: {
      agentId,
      clientId,
      title: `Provide ${itemTitle} via 1Password`,
      description: `I need: ${fields.map((f) => f.title).join(", ")}. ${reason}`,
      actionItems: fields.map((f) => `Provide ${f.title}`),
      reasoning: reason,
      expectedMetric: "credential_provided",
      baselineValue: 0,
      expectedDirection: "neutral",
      emailType: "credential-request",
      status: "pending",
    },
    select: { id: true },
  });
  await prisma.recommendation.update({
    where: { id: recommendation.id },
    data: { approveActionId: recommendation.id },
  });

  try {
    await sendActionRequiredEmail({
      agentId,
      to: dbClient.email,
      itemTitle,
      fieldTitles: fields.map((f) => f.title),
      reason,
      openUrl,
      approveActionId: recommendation.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to send credential-request email", { clientId, itemTitle, err: message });
    return {
      status: "error",
      message: `I set up the 1Password item for ${itemTitle} but couldn't email you the link (${message.slice(0, 160)}). I'll retry on the next run.`,
      itemId,
      openUrl,
      isPause: false,
    };
  }

  logger.info("Credential request sent", {
    agentId, clientId, itemTitle, itemId, alreadyExisted,
    recommendationId: recommendation.id,
  });

  return {
    status: alreadyExisted ? "already_exists" : "emailed",
    message: alreadyExisted
      ? `I've already asked you for ${itemTitle} in 1Password. I'll keep waiting for you to fill it in. Continuing without it for now.`
      : `I've created a 1Password item titled "${itemTitle}" and emailed you the link to fill in: ${fields.map((f) => f.title).join(", ")}. Once you've added the values, I'll use them on my next run. Continuing with what I can do without them.`,
    itemId,
    openUrl,
    isPause: true,
  };
}
