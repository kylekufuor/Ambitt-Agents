import Stripe from "stripe";
import logger from "./logger.js";
import prisma from "./db.js";

function getClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

export async function createCustomer(
  email: string,
  businessName: string
): Promise<string> {
  const stripe = getClient();
  const customer = await stripe.customers.create({
    email,
    name: businessName,
    metadata: { platform: "ambitt-agents" },
  });
  logger.info("Stripe customer created", { customerId: customer.id, email });
  return customer.id;
}

export async function createSubscription(
  customerId: string,
  priceId: string,
  agentId: string
): Promise<Stripe.Subscription> {
  const stripe = getClient();
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    metadata: { agentId },
  });

  await prisma.agent.update({
    where: { id: agentId },
    data: { stripeSubscriptionId: subscription.id },
  });

  logger.info("Subscription created", {
    subscriptionId: subscription.id,
    customerId,
    agentId,
  });
  return subscription;
}

export async function cancelSubscription(
  subscriptionId: string
): Promise<void> {
  const stripe = getClient();
  await stripe.subscriptions.cancel(subscriptionId);
  logger.info("Subscription cancelled", { subscriptionId });
}

export async function pauseSubscription(
  subscriptionId: string
): Promise<void> {
  const stripe = getClient();
  await stripe.subscriptions.update(subscriptionId, {
    pause_collection: { behavior: "void" },
  });
  logger.info("Subscription paused", { subscriptionId });
}

export async function resumeSubscription(
  subscriptionId: string
): Promise<void> {
  const stripe = getClient();
  await stripe.subscriptions.update(subscriptionId, {
    pause_collection: null as unknown as Stripe.SubscriptionUpdateParams.PauseCollection,
  });
  logger.info("Subscription resumed", { subscriptionId });
}

export function constructWebhookEvent(
  body: string,
  signature: string
): Stripe.Event {
  const stripe = getClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return stripe.webhooks.constructEvent(body, signature, secret);
}

export default {
  createCustomer,
  createSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  constructWebhookEvent,
};
