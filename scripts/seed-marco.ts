// scripts/seed-marco.ts
//
// Seeds Marco — Ambitt's internal QA tester agent. Build-time companion
// (not a paying-client deliverable). Marco reads test plans, executes the
// stories against live endpoints + UIs, and reports PASS/FAIL/SKIP with
// concise notes. No editorializing, no suggested fixes — verification only.
//
// Why an Agent row (not just a script): Marco has personality, tools, and
// memory that compound over time as we feed him more test patterns. Same
// pattern as Atlas + Vera — platform agents owned by the Ambitt internal
// client.
//
// Invocation v1: CLI script (scripts/marco.ts). No email/WhatsApp wiring.
// If we keep him long-term we'll add inbound auth flags + a real surface.
//
// Idempotent — safe to re-run.
//
// Run: tsx scripts/seed-marco.ts

import { PrismaClient } from "@prisma/client";
import { encrypt } from "../shared/encryption.js";

const prisma = new PrismaClient();

const AMBITT_CLIENT_EMAIL = "hello@ambitt.agency";
const MARCO_EMAIL = "marco@ambitt.agency";

async function main() {
  const ambitt = await prisma.client.findUnique({ where: { email: AMBITT_CLIENT_EMAIL } });
  if (!ambitt) {
    console.error("[seed-marco] Ambitt Client not found. Run scripts/seed-atlas.ts first.");
    process.exitCode = 1;
    return;
  }
  console.log("[seed-marco] Ambitt Client:", ambitt.id);

  let marco = await prisma.agent.findUnique({ where: { email: MARCO_EMAIL } });
  if (!marco) {
    marco = await prisma.agent.create({
      data: {
        clientId: ambitt.id,
        name: "Marco",
        email: MARCO_EMAIL,
        personality:
          "Methodical QA tester. Reads test plans, executes the steps as written, reports results. Reports PASS / FAIL / SKIP per story with a one-line note. Never editorializes (no 'this could be better'). Never suggests fixes (that's the dev's job). Never invents extra tests the plan didn't ask for. When a step fails, paste the actual response (truncated if huge) — not a paraphrase. Plain words, short sentences, one finding per line. If you're not sure whether something passed, mark it SKIP with a clear reason — don't guess.",
        purpose:
          "Run the test plans Kyle (or another agent) gives you against live Ambitt endpoints + UIs. Use http_request for API checks, browse for UI flows. Report PASS / FAIL / SKIP per story. v1 scope: build-time verification while we ship features. Future: scheduled regression sweeps.",
        agentType: "platform.qa-tester",
        acceptFromProspects: false,
        tools: [],
        schedule: "",
        autonomyLevel: "autonomous", // testing is read-mostly; no approval gates needed
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
            role: "ambitt_qa_tester_v1",
            note: "Platform agent. Invoked via scripts/marco.ts CLI for build-time test runs. No email/WhatsApp.",
          })
        ),
      },
    });
    console.log("[seed-marco] Created Marco:", marco.id);
  } else {
    console.log("[seed-marco] Marco already exists:", marco.id);
  }

  console.log("\nMarco is on duty:");
  console.log("  agentId:", marco.id);
  console.log("  email:", marco.email);
  console.log("  status:", marco.status);
  console.log("  model:", marco.primaryModel);
  console.log("  ownerClientId:", marco.clientId);
}

main()
  .catch((err) => {
    console.error("[seed-marco] error:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
