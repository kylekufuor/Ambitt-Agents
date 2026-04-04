import prisma from "../shared/db.js";
import { createCustomer } from "../shared/stripe.js";
import { sendEmail } from "../shared/email.js";
import { encrypt } from "../shared/encryption.js";
import { scaffoldAgent } from "./scaffold.js";
import logger from "../shared/logger.js";

interface OnboardingRequest {
  // Client info
  email: string;
  businessName: string;
  industry: string;
  businessGoal: string;
  brandVoice: string;
  preferredChannel: "email" | "whatsapp" | "both";
  whatsappNumber?: string;
  northStarMetric?: string;
  agentGoal?: string;

  // Agent config
  agentType: string;
  agentName: string;
  agentPurpose: string;
  tools: string[];
  schedule: string;
  monthlyRetainerCents: number;
  setupFeeCents: number;
}

interface OnboardingResult {
  clientId: string;
  agentId: string;
  stripeCustomerId: string;
  credentialLink: string;
}

export async function onboardClient(request: OnboardingRequest): Promise<OnboardingResult> {
  // Step 1: Create Stripe customer
  const stripeCustomerId = await createCustomer(request.email, request.businessName);

  // Step 2: Create client in DB
  const client = await prisma.client.create({
    data: {
      email: request.email,
      businessName: request.businessName,
      industry: request.industry,
      businessGoal: request.businessGoal,
      brandVoice: request.brandVoice,
      preferredChannel: request.preferredChannel,
      whatsappNumber: request.whatsappNumber,
      northStarMetric: request.northStarMetric,
      agentGoal: request.agentGoal,
      stripeCustomerId,
      billingEmail: request.email,
    },
  });

  // Step 3: Scaffold agent (sends Kyle WhatsApp for approval)
  const agentEmail = `${request.agentName.toLowerCase()}@ambitt.agency`;
  const agentId = await scaffoldAgent({
    clientId: client.id,
    name: request.agentName,
    email: agentEmail,
    personality: getDefaultPersonality(request.agentType),
    purpose: request.agentPurpose,
    agentType: request.agentType,
    tools: request.tools,
    schedule: request.schedule,
    monthlyRetainerCents: request.monthlyRetainerCents,
    setupFeeCents: request.setupFeeCents,
  });

  // Step 4: Generate credential intake link
  // TODO: Integrate with OneTimeSecret API for secure credential sharing
  const credentialLink = `https://ambitt.agency/credentials/${client.id}`;

  // Step 5: Send welcome email
  await sendEmail({
    agentId,
    agentName: request.agentName,
    to: request.email,
    subject: `Welcome to Ambitt — ${request.agentName} is getting ready for ${request.businessName}`,
    html: buildWelcomeEmail(request.businessName, request.agentName, credentialLink),
  });

  // Step 6: Log onboarding action
  await prisma.oracleAction.create({
    data: {
      actionType: "scaffold_agent",
      description: `Onboarded ${request.businessName}. Client: ${client.id}, Agent: ${agentId} (${request.agentType})`,
      agentId,
      clientId: client.id,
      status: "completed",
    },
  });

  logger.info("Client onboarded", {
    clientId: client.id,
    agentId,
    businessName: request.businessName,
    agentType: request.agentType,
  });

  return {
    clientId: client.id,
    agentId,
    stripeCustomerId,
    credentialLink,
  };
}

export async function storeCredentials(
  clientId: string,
  toolName: string,
  credentials: { apiKey?: string; oauthToken?: string; refreshToken?: string }
): Promise<void> {
  await prisma.credential.upsert({
    where: { clientId_toolName: { clientId, toolName } },
    create: {
      clientId,
      toolName,
      apiKey: credentials.apiKey ? encrypt(credentials.apiKey) : null,
      oauthToken: credentials.oauthToken ? encrypt(credentials.oauthToken) : null,
      refreshToken: credentials.refreshToken ? encrypt(credentials.refreshToken) : null,
    },
    update: {
      apiKey: credentials.apiKey ? encrypt(credentials.apiKey) : undefined,
      oauthToken: credentials.oauthToken ? encrypt(credentials.oauthToken) : undefined,
      refreshToken: credentials.refreshToken ? encrypt(credentials.refreshToken) : undefined,
      lastUsedAt: new Date(),
    },
  });

  logger.info("Credentials stored", { clientId, toolName });
}

function getDefaultPersonality(agentType: string): string {
  const personalities: Record<string, string> = {
    scout: "sharp, analytical, no-nonsense — finds leads and qualifies them fast",
    lens: "data-driven, precise, insightful — turns numbers into decisions",
    vibe: "energetic, data-driven, direct — knows what's trending before it peaks",
    pulse: "vigilant, empathetic, protective — guards the brand's reputation like it's their own",
    priya: "meticulous, strategic, calm — finds the signal in the noise",
  };
  return personalities[agentType] ?? "professional, helpful, and thorough";
}

function buildWelcomeEmail(businessName: string, agentName: string, credentialLink: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a1a1a; margin-bottom: 8px;">Welcome to Ambitt, ${businessName}</h2>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Your agent <strong>${agentName}</strong> is being set up right now. Here's what happens next:
      </p>

      <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <h3 style="color: #1a1a1a; margin-top: 0;">Your 7-day onboarding</h3>
        <ol style="color: #555; line-height: 2;">
          <li><strong>Today</strong> — ${agentName} is reviewing your business profile</li>
          <li><strong>Day 1-2</strong> — Connect your tools so ${agentName} can access your data</li>
          <li><strong>Day 3-5</strong> — ${agentName} learns your brand voice and business context</li>
          <li><strong>Day 6</strong> — You'll receive a test brief for review</li>
          <li><strong>Day 7</strong> — ${agentName} goes live with your first automated task</li>
        </ol>
      </div>

      <div style="margin: 24px 0;">
        <h3 style="color: #1a1a1a;">Next step: Connect your tools</h3>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Use the secure link below to share your tool credentials. This link expires after one use.
        </p>
        <a href="${credentialLink}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 8px;">
          Connect Your Tools →
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />

      <p style="color: #888; font-size: 14px;">
        Questions? Reply to this email or reach us at support@ambitt.agency.<br/>
        — ${agentName}, your Ambitt agent
      </p>
    </div>
  `;
}

export default { onboardClient, storeCredentials };
