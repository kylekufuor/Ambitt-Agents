// scripts/seed-atlas.ts
//
// Seeds Ambitt's internal Client row + the Atlas onboarding agent.
// Idempotent — safe to re-run.
//
// Atlas is Ambitt's first employee. It runs the onboarding flow for new
// prospects (and existing clients who want to add another agent). It accepts
// emails from any active Prospect — that's what acceptFromProspects=true means.
//
// Run: tsx scripts/seed-atlas.ts

import { PrismaClient } from "@prisma/client";
import { encrypt } from "../shared/encryption.js";

const prisma = new PrismaClient();

const AMBITT_CLIENT_EMAIL = "hello@ambitt.agency";
const ATLAS_EMAIL = "atlas@ambitt.agency";

async function main() {
  // 1) Ambitt Client (the platform's internal owner — owns Atlas and any future
  //    platform-level agents). Stripe customer ID is a sentinel since this
  //    client doesn't actually pay itself.
  let ambitt = await prisma.client.findUnique({ where: { email: AMBITT_CLIENT_EMAIL } });
  if (!ambitt) {
    ambitt = await prisma.client.create({
      data: {
        email: AMBITT_CLIENT_EMAIL,
        contactName: "Kyle Kufuor",
        preferredName: "Kyle",
        businessName: "Ambitt Agents",
        industry: "AI agent platform",
        businessGoal: "Build and operate a workforce of AI agents that deliver measurable value for clients.",
        website: "https://ambitt.agency",
        brandVoice:
          "Warm but not chatty. Direct but not cold. Confident without bragging. Sounds like a senior peer who happens to be an AI — not a chatbot, not a sales rep.",
        preferredChannel: "email",
        stripeCustomerId: "platform_ambitt",
        billingEmail: "kylekufuor@gmail.com",
        billingStatus: "active",
      },
    });
    console.log("[seed-atlas] Created Ambitt Client:", ambitt.id);
  } else {
    console.log("[seed-atlas] Ambitt Client already exists:", ambitt.id);
  }

  // 2) Atlas Agent. Web-triggered (schedule="" — no cron). status=active so it
  //    can take traffic immediately. acceptFromProspects=true so the inbound
  //    webhook accepts mail from any active Prospect (not just Ambitt-as-client).
  let atlas = await prisma.agent.findUnique({ where: { email: ATLAS_EMAIL } });
  if (!atlas) {
    atlas = await prisma.agent.create({
      data: {
        clientId: ambitt.id,
        name: "Atlas",
        email: ATLAS_EMAIL,
        personality:
          "Warm but not chatty. Direct but not cold. Listens more than talks. Asks one question at a time — never overloads. Honest about what an AI agent can and can't do. If a request is unrealistic, says so kindly and offers a realistic alternative. Sounds like a senior peer, not a sales rep.",
        purpose:
          "Onboard new clients to Ambitt. Run discovery conversations, generate a sales-style presentation of the agent we'd build for them, and draft a quote for Kyle to review. Also serves as the front door for existing clients who want to add another agent. NEVER prices autonomously — every quote is drafted and notified to Kyle for approval before sending. NEVER sends the presentation or quote without an explicit prospect action.",
        agentType: "platform.onboarding",
        acceptFromProspects: true,
        tools: [],
        schedule: "",
        autonomyLevel: "supervised",
        timezone: "America/New_York",
        deliveryFormat: "email_summary",
        tone: "conversational",
        emailFrequency: "immediate",
        primaryModel: "claude-sonnet-4-6",
        analyticsModel: "gemini",
        creativeModel: "gpt-4o",
        status: "active",
        approvedAt: new Date(),
        monthlyRetainerCents: 0,
        setupFeeCents: 0,
        pricingTier: "scale",
        interactionLimit: -1,
        budgetMonthlyCents: 100000,
        clientMemoryObject: encrypt(
          JSON.stringify({
            role: "ambitt_onboarding_agent_v1",
            note: "Platform agent. Owner is Ambitt itself. Accepts prospects + existing clients only.",
          })
        ),
      },
    });
    console.log("[seed-atlas] Created Atlas:", atlas.id);
  } else {
    console.log("[seed-atlas] Atlas already exists:", atlas.id);
  }

  console.log("\nAtlas is alive:");
  console.log("  agentId:", atlas.id);
  console.log("  email:", atlas.email);
  console.log("  status:", atlas.status);
  console.log("  acceptFromProspects:", atlas.acceptFromProspects);
  console.log("  ownerClientId:", atlas.clientId);
}

main()
  .catch((err) => {
    console.error("[seed-atlas] error:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
