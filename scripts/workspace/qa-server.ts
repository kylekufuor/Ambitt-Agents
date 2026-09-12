import express from "express";
import { workspaceRouter } from "../../oracle/workspace/router.js";
import { sweepWorkspace } from "../../shared/workspace/browser.js";
import prisma from "../../shared/db.js";
import { encrypt } from "../../shared/encryption.js";
async function main() {
  const dbUrl = new URL(process.env.DATABASE_URL!);
  if (!dbUrl.searchParams.get("schema")?.startsWith("workspace_qa_"))
    throw new Error("QA schema required");
  for (const [id, email, name] of [
    [
      "workspace-qa-client",
      "workspace-qa@example.invalid",
      "Northgale Roofing",
    ],
    ["workspace-other-client", "other-qa@example.invalid", "Other workspace"],
  ]) {
    await prisma.client.upsert({
      where: { id },
      update: {},
      create: {
        id,
        email,
        billingEmail: email,
        businessName: name,
        industry: "Roofing",
        businessGoal: "Prepare accurate estimates",
        brandVoice: "Friendly and professional",
        preferredChannel: "email",
        stripeCustomerId: "qa-" + id,
      },
    });
    await prisma.agent.upsert({
      where: { id: id + "-agent" },
      update: {},
      create: {
        id: id + "-agent",
        clientId: id,
        name: "Wade",
        email: "qa-" + id + "@example.invalid",
        personality: "A careful and helpful colleague",
        purpose:
          "Help prepare and qualify roofing estimates. Learn the client’s workflow before taking action.",
        agentType: "operations",
        tools: [],
        schedule: "manual",
        status: "building",
        dryRun: true,
        monthlyRetainerCents: 0,
        setupFeeCents: 0,
        clientMemoryObject: encrypt("{}"),
      },
    });
  }
  const app = express();
  app.use(
    "/workspace",
    express.text({ type: "application/json", limit: "7mb" }),
    workspaceRouter,
  );
  app.get("/health", (_req, res) => res.json({ ok: true, qa: true }));
  app.listen(4311, "127.0.0.1", () =>
    console.log("Isolated workspace QA API on 4311"),
  );
  setInterval(() => void sweepWorkspace().catch(() => {}), 30000).unref();
}
void main();
