import prisma from "../shared/db.js";
import { createCustomer } from "../shared/stripe.js";
import { encrypt } from "../shared/encryption.js";
import { scaffoldAgent } from "./scaffold.js";
import logger from "../shared/logger.js";
import { readFileSync } from "fs";

// ---------------------------------------------------------------------------
// Agent Import — bulk onboard a client with multiple existing agents
// ---------------------------------------------------------------------------

// Manifest format (JSON — can also be generated from YAML)
interface ImportManifest {
  client: {
    email: string;
    businessName: string;
    industry: string;
    businessGoal: string;
    brandVoice: string;
    preferredChannel: "email" | "whatsapp" | "both";
    whatsappNumber?: string;
    northStarMetric?: string;
    agentGoal?: string;
  };
  agents: ImportAgent[];
  credentials?: ImportCredential[];
}

interface ImportAgent {
  // Identity — preserved from source system
  name: string;
  personality: string;
  purpose: string;

  // Ambitt mapping
  agentType: string; // analytics, content, marketing, sales, engagement, support, research, design, ops, custom
  email?: string; // defaults to <name>@ambitt.agency
  tools: string[];
  schedule: string; // cron format

  // Optional overrides
  autonomyLevel?: "advisory" | "autonomous";
  monthlyRetainerCents?: number;
  setupFeeCents?: number;
  budgetMonthlyCents?: number;

  // Memory to seed — key/value pairs from source system
  memory?: Record<string, unknown>;
}

interface ImportCredential {
  toolName: string;
  apiKey?: string;
  oauthToken?: string;
  refreshToken?: string;
}

interface ImportResult {
  clientId: string;
  agents: Array<{
    name: string;
    agentId: string;
    agentType: string;
    email: string;
    status: "scaffolded" | "failed";
    error?: string;
  }>;
  credentials: number;
}

export async function importFromManifest(manifest: ImportManifest): Promise<ImportResult> {
  const { client, agents, credentials } = manifest;

  logger.info("Starting import", {
    businessName: client.businessName,
    agentCount: agents.length,
  });

  // --- Step 1: Create or find client ---
  let existingClient = await prisma.client.findUnique({
    where: { email: client.email },
  });

  let clientId: string;
  let stripeCustomerId: string;

  if (existingClient) {
    clientId = existingClient.id;
    stripeCustomerId = existingClient.stripeCustomerId;
    logger.info("Client already exists, adding agents to existing client", { clientId });
  } else {
    stripeCustomerId = await createCustomer(client.email, client.businessName);
    const newClient = await prisma.client.create({
      data: {
        email: client.email,
        businessName: client.businessName,
        industry: client.industry,
        businessGoal: client.businessGoal,
        brandVoice: client.brandVoice,
        preferredChannel: client.preferredChannel,
        whatsappNumber: client.whatsappNumber,
        northStarMetric: client.northStarMetric,
        agentGoal: client.agentGoal,
        stripeCustomerId,
        billingEmail: client.email,
      },
    });
    clientId = newClient.id;
    logger.info("Client created", { clientId, businessName: client.businessName });
  }

  // --- Step 2: Scaffold each agent ---
  const agentResults: ImportResult["agents"] = [];

  for (const agent of agents) {
    const agentEmail = agent.email ?? `${agent.name.toLowerCase().replace(/\s+/g, "")}@ambitt.agency`;

    // Check if agent email already exists
    const existingAgent = await prisma.agent.findUnique({
      where: { email: agentEmail },
    });

    if (existingAgent) {
      logger.warn("Agent email already exists, skipping", { email: agentEmail });
      agentResults.push({
        name: agent.name,
        agentId: existingAgent.id,
        agentType: agent.agentType,
        email: agentEmail,
        status: "failed",
        error: "Agent email already exists",
      });
      continue;
    }

    try {
      const memoryObject = agent.memory ?? {};
      const encryptedMemory = encrypt(JSON.stringify(memoryObject));

      const agentId = await scaffoldAgent({
        clientId,
        name: agent.name,
        email: agentEmail,
        personality: agent.personality,
        purpose: agent.purpose,
        agentType: agent.agentType,
        tools: agent.tools,
        schedule: agent.schedule,
        autonomyLevel: agent.autonomyLevel,
        monthlyRetainerCents: agent.monthlyRetainerCents ?? 0,
        setupFeeCents: agent.setupFeeCents ?? 0,
      });

      // Seed memory if provided (overwrite the empty default from scaffold)
      if (Object.keys(memoryObject).length > 0) {
        await prisma.agent.update({
          where: { id: agentId },
          data: { clientMemoryObject: encryptedMemory },
        });
      }

      // Set budget if specified
      if (agent.budgetMonthlyCents) {
        await prisma.agent.update({
          where: { id: agentId },
          data: { budgetMonthlyCents: agent.budgetMonthlyCents },
        });
      }

      agentResults.push({
        name: agent.name,
        agentId,
        agentType: agent.agentType,
        email: agentEmail,
        status: "scaffolded",
      });

      logger.info("Agent scaffolded", { name: agent.name, agentId, agentType: agent.agentType });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agentResults.push({
        name: agent.name,
        agentId: "",
        agentType: agent.agentType,
        email: agentEmail,
        status: "failed",
        error: message,
      });
      logger.error("Agent scaffold failed during import", { name: agent.name, error: message });
    }
  }

  // --- Step 3: Store credentials ---
  let credentialCount = 0;
  if (credentials && credentials.length > 0) {
    for (const cred of credentials) {
      try {
        await prisma.credential.upsert({
          where: { clientId_toolName: { clientId, toolName: cred.toolName } },
          create: {
            clientId,
            toolName: cred.toolName,
            apiKey: cred.apiKey ? encrypt(cred.apiKey) : null,
            oauthToken: cred.oauthToken ? encrypt(cred.oauthToken) : null,
            refreshToken: cred.refreshToken ? encrypt(cred.refreshToken) : null,
          },
          update: {
            apiKey: cred.apiKey ? encrypt(cred.apiKey) : undefined,
            oauthToken: cred.oauthToken ? encrypt(cred.oauthToken) : undefined,
            refreshToken: cred.refreshToken ? encrypt(cred.refreshToken) : undefined,
          },
        });
        credentialCount++;
      } catch (error) {
        logger.error("Credential store failed during import", { toolName: cred.toolName, error });
      }
    }
  }

  // --- Step 4: Log the import ---
  await prisma.oracleAction.create({
    data: {
      actionType: "scaffold_agent",
      description: `Bulk import: ${agentResults.filter((a) => a.status === "scaffolded").length}/${agents.length} agents for ${client.businessName}`,
      clientId,
      status: "completed",
      result: JSON.stringify({ agentResults, credentialCount }),
    },
  });

  const result: ImportResult = {
    clientId,
    agents: agentResults,
    credentials: credentialCount,
  };

  logger.info("Import complete", {
    clientId,
    scaffolded: agentResults.filter((a) => a.status === "scaffolded").length,
    failed: agentResults.filter((a) => a.status === "failed").length,
    credentials: credentialCount,
  });

  return result;
}

// --- CLI entry point ---
export async function importFromFile(filePath: string): Promise<ImportResult> {
  const raw = readFileSync(filePath, "utf-8");
  const manifest: ImportManifest = JSON.parse(raw);
  return importFromManifest(manifest);
}

export default { importFromManifest, importFromFile };
