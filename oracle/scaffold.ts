import prisma from "../shared/db.js";
import { encrypt } from "../shared/encryption.js";
import { sendKyleWhatsApp } from "../shared/whatsapp.js";
import { sendEmail } from "../shared/email.js";
import { recalcClientRetainers, getTierConfig, getInteractionLimit, type PricingTier } from "../shared/pricing.js";
import { buildWelcomeEmail, inferCapabilities } from "./templates/welcome-email.js";
import { buildOnboardingEmail } from "./templates/onboarding-email.js";
import logger from "../shared/logger.js";
import type { EmailAttachment } from "../shared/email.js";

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
  preferredName?: string; // what the agent calls the client in emails (e.g. "Kyle")
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
  // SOPs uploaded at creation time — become the agent's operating manual
  sops?: Array<{
    filename: string;
    contentType: string;
    content: string; // base64
  }>;
  // Phase 1 operating config
  schedule?: string;           // cron expression or "manual"
  autonomyLevel?: string;      // "advisory" | "copilot" | "autonomous"
  timezone?: string;           // IANA (e.g. "America/New_York")
  deliveryFormat?: string;     // "email_summary" | "email_with_attachments" | "email_plus_sheet"
}

const VALID_AUTONOMY = new Set(["advisory", "copilot", "autonomous"]);
const VALID_DELIVERY = new Set(["email_summary", "email_with_attachments", "email_plus_sheet"]);

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
  let timezone: string;
  let deliveryFormat: string;
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
          preferredName: input.preferredName ?? null,
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

    // Operating config — validate and fall back to sane defaults
    const requestedSchedule = (input.schedule ?? "").trim();
    if (requestedSchedule === "manual") {
      schedule = "manual";
    } else if (requestedSchedule && (await import("node-cron")).default.validate(requestedSchedule)) {
      schedule = requestedSchedule;
    } else {
      schedule = "0 8 * * 1"; // Weekly Monday 8am default
    }

    autonomyLevel = VALID_AUTONOMY.has(input.autonomyLevel ?? "") ? input.autonomyLevel! : "advisory";
    deliveryFormat = VALID_DELIVERY.has(input.deliveryFormat ?? "") ? input.deliveryFormat! : "email_summary";

    // Timezone — trust what came in (browser-detected), fall back to US East
    timezone = (input.timezone && input.timezone.trim()) || "America/New_York";

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
    timezone = "America/New_York";
    deliveryFormat = "email_summary";
    monthlyRetainerCents = input.monthlyRetainerCents;
    setupFeeCents = input.setupFeeCents;
  }

  // Pre-populate memory with uploaded SOPs (dashboard-only)
  const initialMemory: Record<string, unknown> = {};
  if (isDashboardBrief(input) && input.sops && input.sops.length > 0) {
    try {
      const { parseInboundAttachments } = await import("../shared/attachments/parse-inbound.js");
      const parsed = await parseInboundAttachments(input.sops);
      initialMemory.sops = parsed.map((p) => ({
        filename: p.filename,
        text: p.text,
        uploadedAt: new Date().toISOString(),
      }));
      logger.info("SOPs parsed at scaffold", {
        count: parsed.length,
        filenames: parsed.map((p) => p.filename),
      });
    } catch (error) {
      logger.error("Failed to parse SOPs at scaffold — continuing without them", { error });
    }
  }
  const encryptedMemory = encrypt(JSON.stringify(initialMemory));

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
      timezone,
      deliveryFormat,
      monthlyRetainerCents,
      setupFeeCents,
      pricingTier: agentTier,
      interactionCount: 0,
      interactionLimit,
      interactionResetAt: nextReset,
      clientMemoryObject: encryptedMemory,
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
      client: { select: { id: true, email: true, contactName: true, preferredName: true, businessName: true, website: true } },
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
      const { decrypt } = await import("../shared/encryption.js");
      const scanResult = await scanSite(clientWebsite);
      const scanSummary = formatScanResults(scanResult);

      // Merge scan results into existing memory — don't clobber SOPs uploaded at scaffold
      let memory: Record<string, unknown> = {};
      try {
        memory = JSON.parse(decrypt(agent.clientMemoryObject));
      } catch { /* empty or corrupt — start fresh */ }

      memory.businessWebsite = clientWebsite;
      memory.siteScan = {
        scannedAt: new Date().toISOString(),
        techStack: scanResult.techStack.map((t) => t.name),
        securityGrade: scanResult.securityHeaders.grade,
        sslValid: scanResult.ssl.valid,
        sslExpiry: scanResult.ssl.expiresAt,
        title: scanResult.metadata.title,
        description: scanResult.metadata.description,
      };
      memory.scanSummary = scanSummary;

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

  // Generate the activation brief — first real output, delivered with the
  // welcome email. Fail-open: a failed brief falls back to a plain welcome.
  let brief: { briefText: string; attachments: EmailAttachment[] } | null = null;
  try {
    brief = await generateWelcomeBrief(agentId);
    logger.info("Welcome brief generated", {
      agentId,
      attachmentCount: brief.attachments.length,
      briefChars: brief.briefText.length,
    });
  } catch (error) {
    logger.warn("Welcome brief failed — sending plain welcome", { agentId, error });
  }

  // Send welcome email to client
  try {
    const clientFirstName = agent.client.contactName?.split(" ")[0] ?? agent.client.businessName.split(" ")[0];
    const preferredName = agent.client.preferredName ?? clientFirstName;
    const capabilities = inferCapabilities(agent.agentType, agent.tools);
    const toolNames = agent.tools.map((t) => t.charAt(0).toUpperCase() + t.slice(1));

    // Check if agent already has documents or SOPs in memory
    let hasDocuments = false;
    try {
      const { decrypt } = await import("../shared/encryption.js");
      const memory = JSON.parse(decrypt(agent.clientMemoryObject));
      const docsPresent = Array.isArray(memory.documents) && memory.documents.length > 0;
      const sopsPresent = Array.isArray(memory.sops) && memory.sops.length > 0;
      hasDocuments = docsPresent || sopsPresent;
    } catch { /* no docs */ }

    const briefHasPdf = !!brief?.attachments.some((a) => a.filename.endsWith(".pdf"));

    const { subject, html } = buildWelcomeEmail({
      agentName: agent.name,
      agentId,
      agentPurpose: agent.purpose,
      clientFirstName,
      clientBusinessName: agent.client.businessName,
      tools: toolNames,
      capabilities,
      hasDocuments,
      briefText: brief?.briefText,
      briefHasPdf,
    });

    await sendEmail({
      agentId,
      agentName: agent.name,
      to: agent.client.email,
      subject,
      html,
      replyToAgentId: agentId,
      attachments: brief?.attachments,
    });

    logger.info("Welcome email sent", { agentId, to: agent.client.email });

    // Schedule "how to work with me" email — 5 minutes after welcome.
    // AI-personalized body generated just-in-time; fails open (skip if error).
    setTimeout(async () => {
      try {
        const { generateHowToWorkBody } = await import("./onboarding-content.js");
        const { body, ok } = await generateHowToWorkBody(agentId);
        if (!ok) {
          logger.warn("Skipping how-to-work email — content generator returned empty", { agentId });
          return;
        }

        const { subject: onboardSubject, html: onboardHtml } = buildOnboardingEmail({
          agentName: agent.name,
          agentId,
          preferredName,
          clientBusinessName: agent.client.businessName,
          body,
        });

        await sendEmail({
          agentId,
          agentName: agent.name,
          to: agent.client.email,
          subject: onboardSubject,
          html: onboardHtml,
          replyToAgentId: agentId,
        });

        logger.info("How-to-work email sent", { agentId, to: agent.client.email });
      } catch (err) {
        logger.error("Failed to send how-to-work email", { agentId, error: err });
      }
    }, 5 * 60 * 1000); // 5 minutes

  } catch (error) {
    logger.error("Failed to send welcome email", { agentId, error });
  }

  // Enqueue the T+3 / T+7 / T+14 checkpoint emails into ScheduledEmail.
  // They fire via the hourly cron in oracle/scheduler.ts during business hours.
  try {
    await enqueueOnboardingCheckpoints(agentId, agent.clientId);
    logger.info("Onboarding checkpoints enqueued", { agentId });
  } catch (err) {
    logger.error("Failed to enqueue onboarding checkpoints — non-blocking", { agentId, error: err });
  }

  logger.info("Agent approved", { agentId });
}

// ---------------------------------------------------------------------------
// Scheduled-checkpoint enqueue / cancel helpers
// ---------------------------------------------------------------------------

const CHECKPOINT_DELAYS_DAYS: Record<string, number> = {
  checkin_3day: 3,
  highlight_7day: 7,
  feedback_14day: 14,
};

export async function enqueueOnboardingCheckpoints(agentId: string, clientId: string): Promise<void> {
  const now = new Date();
  for (const [kind, days] of Object.entries(CHECKPOINT_DELAYS_DAYS)) {
    const scheduledAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    await prisma.scheduledEmail.create({
      data: { agentId, clientId, kind, scheduledAt, status: "pending" },
    });
  }
}

/** Cancel all pending checkpoints for an agent. Fires on reject / kill / pause. */
export async function cancelOnboardingCheckpoints(agentId: string): Promise<number> {
  const result = await prisma.scheduledEmail.updateMany({
    where: { agentId, status: "pending" },
    data: { status: "cancelled" },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Activation brief — first real output delivered with the welcome email.
// The agent researches the client's business + competitors using built-in
// tools (web_search, analyze_website_*, generate_pdf) and produces:
//   - 3 headline findings in plain text (for the welcome email body)
//   - a full PDF brief as an email attachment
// Fail-open: if this errors out, we send the welcome email without a brief.
// ---------------------------------------------------------------------------
export async function generateWelcomeBrief(agentId: string): Promise<{
  briefText: string;
  attachments: EmailAttachment[];
}> {
  const { runAgent } = await import("../shared/runtime/index.js");

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { client: true },
  });
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const website = agent.client.website ?? "";
  const bizSlug = agent.client.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const pdfFilename = `${bizSlug || "welcome"}-brief.pdf`;

  const seedPrompt = [
    `This is your first task for ${agent.client.businessName}. Make it count.`,
    "",
    "Research (use web_search, analyze_website_technology, analyze_website_performance):",
    website
      ? `- Read their site at ${website}. Learn their positioning, offering, pricing, recent content.`
      : `- Find their website by searching. Read it. Learn their positioning, offering, pricing.`,
    "- Search the web for 3-5 competitors. Visit their sites briefly.",
    "- Search for recent reviews, press, customer sentiment.",
    "",
    "Deliver exactly two things:",
    "",
    `1. A PDF with the full brief. Call generate_pdf with filename "${pdfFilename}" and title "Strategic Brief — ${agent.client.businessName}". Include: 4-6 specific observations about their business, 3-5 named competitors with concrete differences, 3 actionable recommendations. Cite what you actually read. No filler.`,
    "",
    "2. Your reply text for the welcome email. Write exactly this shape, 3 short paragraphs:",
    "   - Paragraph 1: one sentence saying what stood out most.",
    "   - Paragraph 2: your 3 most important findings as bullet points, one line each, starting with \"- \".",
    "   - Paragraph 3: one sentence pointing to the attached PDF.",
    "",
    "Rules: do NOT guess. If something can't be researched, skip it. No generic advice. Be specific to THIS business.",
  ].join("\n");

  const result = await runAgent({
    agentId,
    userMessage: seedPrompt,
    channel: "email",
    threadId: `welcome-brief-${agentId}`,
    billable: false, // onboarding — on us
  });

  return {
    briefText: result.response,
    attachments: result.attachments,
  };
}

export async function rejectAgent(agentId: string): Promise<void> {
  // Unregister from scheduler
  try {
    const { unregisterAgent } = await import("./scheduler.js");
    unregisterAgent(agentId);
  } catch { /* scheduler may not be initialized */ }

  // Cancel pending onboarding checkpoints — rejected agent doesn't get drip
  try {
    const cancelled = await cancelOnboardingCheckpoints(agentId);
    if (cancelled > 0) logger.info("Cancelled pending checkpoints on reject", { agentId, count: cancelled });
  } catch (err) {
    logger.warn("Failed to cancel pending checkpoints on reject", { agentId, error: err });
  }

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

export default {
  scaffoldAgent,
  approveAgent,
  rejectAgent,
  generateWelcomeBrief,
  enqueueOnboardingCheckpoints,
  cancelOnboardingCheckpoints,
};
