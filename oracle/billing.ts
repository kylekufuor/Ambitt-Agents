import { constructWebhookEvent } from "../shared/stripe.js";
import prisma from "../shared/db.js";
import logger from "../shared/logger.js";
import type Stripe from "stripe";

export async function handleStripeWebhook(
  rawBody: string,
  signature: string
): Promise<void> {
  const event = constructWebhookEvent(rawBody, signature);

  // Deduplicate — skip if already processed
  const existing = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (existing?.processed) {
    logger.info("Stripe event already processed", { eventId: event.id });
    return;
  }

  // Store event
  await prisma.stripeEvent.upsert({
    where: { id: event.id },
    create: {
      id: event.id,
      type: event.type,
      data: JSON.stringify(event.data),
    },
    update: {},
  });

  switch (event.type) {
    case "customer.subscription.created":
      await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
      break;

    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    default:
      logger.debug("Unhandled Stripe event", { type: event.type });
  }

  // Mark as processed
  await prisma.stripeEvent.update({
    where: { id: event.id },
    data: { processed: true, processedAt: new Date() },
  });
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
  const agentId = subscription.metadata?.agentId;
  if (!agentId) {
    logger.warn("Subscription created without agentId metadata", { subId: subscription.id });
    return;
  }

  await prisma.agent.update({
    where: { id: agentId },
    data: { stripeSubscriptionId: subscription.id },
  });

  logger.info("Subscription linked to agent", { agentId, subscriptionId: subscription.id });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const agent = await prisma.agent.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    include: { client: true },
  });

  if (!agent) return;

  const isPaused = subscription.pause_collection !== null;
  const isCancelled = subscription.status === "canceled";
  const isActive = subscription.status === "active" && !isPaused;

  if (isCancelled) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { status: "killed" },
    });
    await prisma.client.update({
      where: { id: agent.clientId },
      data: { billingStatus: "cancelled", cancelledAt: new Date() },
    });
    logger.info("Agent killed — subscription cancelled", { agentId: agent.id });
  } else if (isPaused) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { status: "paused" },
    });
    await prisma.client.update({
      where: { id: agent.clientId },
      data: { billingStatus: "paused", pausedAt: new Date() },
    });
    logger.info("Agent paused — subscription paused", { agentId: agent.id });
  } else if (isActive && agent.status === "paused") {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { status: "active" },
    });
    await prisma.client.update({
      where: { id: agent.clientId },
      data: { billingStatus: "active", pausedAt: null },
    });
    logger.info("Agent resumed — subscription resumed", { agentId: agent.id });
  }
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription): Promise<void> {
  const agent = await prisma.agent.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!agent) return;

  await prisma.agent.update({
    where: { id: agent.id },
    data: { status: "killed" },
  });

  await prisma.client.update({
    where: { id: agent.clientId },
    data: { billingStatus: "cancelled", cancelledAt: new Date() },
  });

  await prisma.oracleAction.create({
    data: {
      actionType: "kill_agent",
      description: `Agent ${agent.name} killed — subscription ${subscription.id} cancelled`,
      agentId: agent.id,
      clientId: agent.clientId,
      status: "completed",
    },
  });

  logger.info("Agent killed — subscription deleted", { agentId: agent.id });
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const sub = (invoice as unknown as Record<string, unknown>).subscription;
  const subscriptionId = typeof sub === "string" ? sub : (sub as { id?: string })?.id;

  if (!subscriptionId) return;

  const agent = await prisma.agent.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    include: { client: true },
  });

  if (!agent) return;

  // Don't kill immediately — Stripe retries. Just log and alert.
  await prisma.oracleAction.create({
    data: {
      actionType: "alert_kyle",
      description: `Payment failed for ${agent.client.businessName} (agent ${agent.name}). Stripe will retry.`,
      agentId: agent.id,
      clientId: agent.clientId,
      status: "completed",
    },
  });

  logger.warn("Payment failed", { agentId: agent.id, clientName: agent.client.businessName });
}

export default { handleStripeWebhook };
