import prisma from "../shared/db.js";
import { encrypt } from "../shared/encryption.js";
import { sendKyleWhatsApp } from "../shared/whatsapp.js";
import { sendEmail } from "../shared/email.js";
import { recalcClientRetainers, getTierConfig, getInteractionLimit, type PricingTier } from "../shared/pricing.js";
import { buildWelcomeEmail, inferCapabilities } from "./templates/welcome-email.js";
import { buildOnboardingEmail } from "./templates/onboarding-email.js";
import logger from "../shared/logger.js";

// Full brief — when clientId is already known
interface AgentBrief {
  clientId: string;
  name: string;
  email: string;
  personality: string;
  purpose: string;
  agentType: string;
  tools: string[];
  schedule: string;
  autonomyLevel?: string;
  monthlyRetainerCents: number;
  setupFeeCents: number;
}

// Dashboard brief — when creating from the UI (clientEmail instead of clientId)
interface DashboardBrief {
  clientName?: string;
  clientEmail: string;
  businessName: string;
  businessDescription: string;
  agent: {
    name: string;
    agentType: string;
    tools: string[];
    purpose: string;
  };
  businessWebsite?: string;
  credentials?: Array<{
    toolName: string;
    apiKey?: string;
    oauthToken?: string;
  }>;
}

function isDashboardBrief(brief: AgentBrief | DashboardBrief): brief is DashboardBrief {
  return "clientEmail" in brief;
}

export async function scaffoldAgent(input: AgentBrief | DashboardBrief): Promise<string> {
  let clientId: string;
  let agentName: string;
  let agentEmail: string;
  let agentType: string;
  let tools: string[];
  let purpose: string;
  let personality: string;
  let schedule: string;
  let autonomyLevel: string;
  let monthlyRetainerCents: number;
  let setupFeeCents: number;

  if (isDashboardBrief(input)) {
    // Find or create client from email
    let client = await prisma.client.findUnique({
      where: { email: input.clientEmail },
    });

    if (!client) {
      // Create a new client with a placeholder Stripe customer ID
      client = await prisma.client.create({
        data: {
          email: input.clientEmail,
          contactName: input.clientName ?? null,
          businessName: input.businessName,
          industry: "General",
          businessGoal: input.businessDescription,
          website: input.businessWebsite ?? null,
          brandVoice: "Professional and direct",
          preferredChannel: "email",
          stripeCustomerId: `pending_${Date.now()}`,
          billingEmail: input.clientEmail,
        },
      });
      logger.info("New client created from dashboard", { clientId: client.id, email: input.clientEmail });
    }

    clientId = client.id;
    agentName = input.agent.name;
    const domain = process.env.EMAIL_DOMAIN ?? "ambitt.agency";
    agentEmail = `${agentName.toLowerCase()}@${domain}`;
    agentType = input.agent.agentType;
    tools = input.agent.tools;
    purpose = input.agent.purpose;
    personality = "Professional, proactive, and results-driven";
    schedule = "0 8 * * 1"; // Default: Monday 8am
    autonomyLevel = "advisory";

    // Set pricing from tier
    const tier = (input as any).pricingTier as PricingTier ?? "starter";
    const tierConfig = getTierConfig(tier);
    monthlyRetainerCents = tierConfig.monthlyCents;
    setupFeeCents = tierConfig.setupFeeCentsMin;

    // Store credentials if provided (for direct MCP fallback)
    if (input.credentials && input.credentials.length > 0) {
      for (const cred of input.credentials) {
        if (!cred.apiKey && !cred.oauthToken) continue;
        await prisma.credential.upsert({
          where: { clientId_toolName: { clientId, toolName: cred.toolName } },
          create: {
            clientId,
            toolName: cred.toolName,
            apiKey: cred.apiKey ? encrypt(cred.apiKey) : null,
            oauthToken: cred.oauthToken ? encrypt(cred.oauthToken) : null,
          },
          update: {
            apiKey: cred.apiKey ? encrypt(cred.apiKey) : undefined,
            oauthToken: cred.oauthToken ? encrypt(cred.oauthToken) : undefined,
          },
        });
      }
    }
  } else {
    clientId = input.clientId;
    agentName = input.name;
    agentEmail = input.email;
    agentType = input.agentType;
    tools = input.tools;
    purpose = input.purpose;
    personality = input.personality;
    schedule = input.schedule;
    autonomyLevel = input.autonomyLevel ?? "advisory";
    monthlyRetainerCents = input.monthlyRetainerCents;
    setupFeeCents = input.setupFeeCents;
  }

  const emptyMemory = encrypt(JSON.stringify({}));

  // Determine tier for interaction limits
  const agentTier = isDashboardBrief(input)
    ? ((input as any).pricingTier as PricingTier ?? "starter")
    : "starter";
  const interactionLimit = getInteractionLimit(agentTier);
  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);
  nextReset.setDate(1);
  nextReset.setHours(0, 0, 0, 0);

  const agent = await prisma.agent.create({
    data: {
      clientId,
      name: agentName,
      email: agentEmail,
      personality,
      purpose,
      agentType,
      tools,
      schedule,
      autonomyLevel,
      monthlyRetainerCents,
      setupFeeCents,
      pricingTier: agentTier,
      interactionCount: 0,
      interactionLimit,
      interactionResetAt: nextReset,
      clientMemoryObject: emptyMemory,
      status: "pending_approval",
    },
  });

  // Log Oracle action
  await prisma.oracleAction.create({
    data: {
      actionType: "scaffold_agent",
      description: `Scaffolded agent "${agentName}" (${agentType}) for client ${clientId}`,
      agentId: agent.id,
      clientId,
      status: "completed",
    },
  });

  // Send Kyle WhatsApp approval request
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { businessName: true },
    });

    await sendKyleWhatsApp(
      `Agent "${agentName}" ready for ${client?.businessName ?? "unknown"}.\n` +
        `Type: ${agentType}\n` +
        `Tools: ${tools.length > 0 ? tools.join(", ") : "none yet"}\n` +
        `Schedule: ${schedule}\n\n` +
        `Reply APPROVE ${agent.id} or REJECT ${agent.id}`
    );

    await prisma.oracleAction.create({
      data: {
        actionType: "approval_request",
        description: `Sent WhatsApp approval request to Kyle for agent "${agentName}"`,
        agentId: agent.id,
        clientId,
        status: "completed",
      },
    });
  } catch (error) {
    logger.error("Failed to send WhatsApp approval", { agentId: agent.id, error });
    await prisma.oracleAction.create({
      data: {
        actionType: "approval_request",
        description: `Failed to send WhatsApp approval for agent "${agentName}"`,
        agentId: agent.id,
        clientId,
        status: "failed",
        result: String(error),
      },
    });
  }

  const pricing = await recalcClientRetainers(clientId);
  logger.info("Agent scaffolded", { agentId: agent.id, name: agentName, type: agentType, pricing });
  return agent.id;
}

export async function approveAgent(agentId: string): Promise<void> {
  await prisma.agent.update({
    where: { id: agentId },
    data: {
      status: "active",
      approvedAt: new Date(),
    },
  });

  await prisma.oracleAction.create({
    data: {
      actionType: "scaffold_agent",
      description: `Agent ${agentId} approved and activated`,
      agentId,
      status: "completed",
    },
  });

  // Register agent with scheduler if it has a cron schedule
  try {
    const agentForSchedule = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { schedule: true },
    });
    if (agentForSchedule?.schedule) {
      const { registerAgent } = await import("./scheduler.js");
      registerAgent(agentId, agentForSchedule.schedule);
    }
  } catch (error) {
    logger.warn("Failed to register agent schedule", { agentId, error });
  }

  // Load full agent + client for welcome email + site scan
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      client: { select: { id: true, email: true, contactName: true, businessName: true, website: true } },
    },
  });

  if (!agent) return;

  // Recalc pricing — agent count changed
  await recalcClientRetainers(agent.clientId);

  // Auto-scan client website and store in agent memory
  try {
    const clientWebsite = agent.client.website;
    if (clientWebsite) {
      const { scanSite, formatScanResults } = await import("../shared/platform-tools/site-scanner.js");
      const scanResult = await scanSite(clientWebsite);
      const scanSummary = formatScanResults(scanResult);

      // Store scan results in agent memory
      const memory = {
        businessWebsite: clientWebsite,
        siteScan: {
          scannedAt: new Date().toISOString(),
          techStack: scanResult.techStack.map((t) => t.name),
          securityGrade: scanResult.securityHeaders.grade,
          sslValid: scanResult.ssl.valid,
          sslExpiry: scanResult.ssl.expiresAt,
          title: scanResult.metadata.title,
          description: scanResult.metadata.description,
        },
        scanSummary,
      };

      await prisma.agent.update({
        where: { id: agentId },
        data: {
          clientMemoryObject: encrypt(JSON.stringify(memory)),
          lastMemoryUpdateAt: new Date(),
        },
      });

      logger.info("Client website scanned on activation", { agentId, website: clientWebsite });
    }
  } catch (error) {
    logger.warn("Site scan on activation failed — non-blocking", { agentId, error });
  }

  // Send welcome email to client
  try {
    const clientFirstName = agent.client.contactName?.split(" ")[0] ?? agent.client.businessName.split(" ")[0];
    const capabilities = inferCapabilities(agent.agentType, agent.tools);
    const toolNames = agent.tools.map((t) => t.charAt(0).toUpperCase() + t.slice(1));

    // Check if agent already has documents in memory
    let hasDocuments = false;
    try {
      const { decrypt } = await import("../shared/encryption.js");
      const memory = JSON.parse(decrypt(agent.clientMemoryObject));
      hasDocuments = Array.isArray(memory.documents) && memory.documents.length > 0;
    } catch { /* no docs */ }

    const { subject, html } = buildWelcomeEmail({
      agentName: agent.name,
      agentPurpose: agent.purpose,
      clientFirstName,
      clientBusinessName: agent.client.businessName,
      tools: toolNames,
      capabilities,
      hasDocuments,
    });

    await sendEmail({
      agentId,
      agentName: agent.name,
      to: agent.client.email,
      subject,
      html,
      replyToAgentId: agentId,
    });

    logger.info("Welcome email sent", { agentId, to: agent.client.email });

    // Schedule onboarding email — 1 hour later
    setTimeout(async () => {
      try {
        const { subject: onboardSubject, html: onboardHtml } = buildOnboardingEmail({
          agentName: agent.name,
          clientFirstName,
          clientBusinessName: agent.client.businessName,
          agentType: agent.agentType,
        });

        await sendEmail({
          agentId,
          agentName: agent.name,
          to: agent.client.email,
          subject: onboardSubject,
          html: onboardHtml,
          replyToAgentId: agentId,
        });

        logger.info("Onboarding email sent", { agentId, to: agent.client.email });
      } catch (err) {
        logger.error("Failed to send onboarding email", { agentId, error: err });
      }
    }, 60 * 60 * 1000); // 1 hour

  } catch (error) {
    logger.error("Failed to send welcome email", { agentId, error });
  }

  logger.info("Agent approved", { agentId });
}

export async function rejectAgent(agentId: string): Promise<void> {
  // Unregister from scheduler
  try {
    const { unregisterAgent } = await import("./scheduler.js");
    unregisterAgent(agentId);
  } catch { /* scheduler may not be initialized */ }

  await prisma.agent.update({
    where: { id: agentId },
    data: { status: "killed" },
  });

  await prisma.oracleAction.create({
    data: {
      actionType: "kill_agent",
      description: `Agent ${agentId} rejected by Kyle`,
      agentId,
      status: "completed",
    },
  });

  // Recalc pricing — agent count changed
  const rejectedAgent = await prisma.agent.findUnique({ where: { id: agentId }, select: { clientId: true } });
  if (rejectedAgent) await recalcClientRetainers(rejectedAgent.clientId);

  logger.info("Agent rejected", { agentId });
}

export default { scaffoldAgent, approveAgent, rejectAgent };
