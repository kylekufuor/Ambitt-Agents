// scripts/seed-vera.ts
//
// Seeds the Vera Agent row.
//
// Vera is Ambitt's internal QA reviewer — the design-verify gate Atlas (and
// any future content-producing agent) calls via the `request_review` platform
// tool before shipping client-facing artifacts. Vera doesn't run via the
// runtime engine; she lives inside the tool implementation (one Haiku call,
// returns approve/reject + issues). The Agent row exists for:
//
//   - Cost attribution — Haiku tokens logged to ApiUsage(agentId=vera.id).
//   - Future telemetry — "Vera ran X times today / rejected Y%".
//   - Symmetry with Atlas — sister agent, same owner, same brand-voice rules.
//
// Vera never receives email (acceptFromProspects=false), never runs on a
// schedule (schedule=""), and never appears in the dashboard as a "runnable"
// agent. She's a stored prompt + a Haiku invocation, wrapped in an Agent row
// for accounting.
//
// Idempotent — safe to re-run.
//
// Run: tsx scripts/seed-vera.ts

import { PrismaClient } from "@prisma/client";
import { encrypt } from "../shared/encryption.js";

const prisma = new PrismaClient();

const AMBITT_CLIENT_EMAIL = "hello@ambitt.agency";
const VERA_EMAIL = "vera@ambitt.agency";

async function main() {
  // 1) Find Ambitt Client (Vera's owner). Seeded by seed-atlas.ts — Vera
  //    refuses to seed without it because she has no reasonable other home.
  const ambitt = await prisma.client.findUnique({ where: { email: AMBITT_CLIENT_EMAIL } });
  if (!ambitt) {
    console.error("[seed-vera] Ambitt Client (hello@ambitt.agency) not found. Run scripts/seed-atlas.ts first.");
    process.exitCode = 1;
    return;
  }
  console.log("[seed-vera] Ambitt Client:", ambitt.id);

  // 2) Vera Agent. Web/tool-triggered only (schedule="" — no cron, never
  //    auto-runs). status=active so the request_review tool finds her and
  //    logs usage. acceptFromProspects=false — Vera is never a client-facing
  //    endpoint; the inbound webhook should never see her email.
  let vera = await prisma.agent.findUnique({ where: { email: VERA_EMAIL } });
  if (!vera) {
    vera = await prisma.agent.create({
      data: {
        clientId: ambitt.id,
        name: "Vera",
        email: VERA_EMAIL,
        personality:
          "Plain-spoken quality reviewer. Reads structured agent output, flags concrete defects, suggests soft improvements. Never rewrites. Never hedges — a defect either ships or doesn't. Tone is the same one Atlas uses: warm but not chatty, direct but not cold, no AI tells (no 'leverage', 'robust', 'seamless', no tricolons, no em-dash filler, no empty intensifiers). When she says approve, she means it. When she says reject, every issue is one a human could fix in 60 seconds.",
        purpose:
          "Review structured content produced by other Ambitt agents (Atlas, future digest/welcome/quote agents) BEFORE it reaches the client. Catches forbidden content (pricing in proposals, overclaims, operator-name leaks), brand-voice violations (AI tells, robotic phrasing), specificity failures (generic filler that could apply to any prospect), and intra-payload consistency bugs (name mismatches, role contradictions). Returns approve / reject with field-level issues. v1 scope = ProposalEmailData JSON; future scope = welcome emails, digests, alerts, quote emails.",
        agentType: "platform.qa",
        acceptFromProspects: false,
        tools: [],
        schedule: "",
        autonomyLevel: "supervised",
        timezone: "America/New_York",
        deliveryFormat: "email_summary",
        tone: "conversational",
        emailFrequency: "immediate",
        primaryModel: "claude-haiku-4-5-20251001",
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
            role: "ambitt_qa_reviewer_v1",
            note: "Platform agent. Called via the request_review platform tool by other agents. Never receives email, never runs on a schedule.",
          })
        ),
      },
    });
    console.log("[seed-vera] Created Vera:", vera.id);
  } else {
    console.log("[seed-vera] Vera already exists:", vera.id);
  }

  console.log("\nVera is on duty:");
  console.log("  agentId:", vera.id);
  console.log("  email:", vera.email);
  console.log("  status:", vera.status);
  console.log("  model:", vera.primaryModel);
  console.log("  ownerClientId:", vera.clientId);
}

main()
  .catch((err) => {
    console.error("[seed-vera] error:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
