// End-to-end test for SOP-at-scaffold flow.
// 1. POST /agents/scaffold with a base64 SOP
// 2. Read agent back from DB, decrypt memory, verify `sops` is present with full text
// 3. Build the system prompt via the real prompt-assembler, verify Operating Manual section
// 4. Clean up (delete test agent + client)
//
// Run with: ORACLE_URL=http://localhost:3333 tsx scripts/test-sop-upload.ts

import "dotenv/config";
import prisma from "../shared/db.js";
import { decrypt } from "../shared/encryption.js";
import { loadAgentContext, assembleSystemPrompt } from "../shared/runtime/prompt-assembler.js";

const ORACLE_URL = process.env.ORACLE_URL ?? "http://localhost:3333";

const SOP_TEXT = `# ZoomInfo Prospecting SOP — v1

## Step 1: Define the target segment
Open ZoomInfo. Filter by: industry = "B2B SaaS", employee count 50-500, revenue $5M-$50M,
location = United States. Save the view as "ICP-Q2-2026".

## Step 2: Pull contacts
For each account in the saved view, pull the following roles:
- VP Engineering
- Director of Platform
- Head of Infrastructure

## Step 3: Enrich and score
Cross-reference each contact with LinkedIn. Score 1-5 based on:
- Recent role change (< 6 months = +2)
- Public posts about hiring (+1)
- Company recently raised funding (+2)

## Step 4: Export
Export scored contacts as CSV with columns: name, title, company, email, score, notes.
Name the file "prospects-YYYY-MM-DD.csv".

MAGIC_MARKER: SOP-CONTENT-LANDED-IN-PROMPT
`;

async function main() {
  const testEmail = `sop-test-${Date.now()}@ambitt-test.local`;
  console.log(`\n→ Test client email: ${testEmail}`);

  const sopBase64 = Buffer.from(SOP_TEXT, "utf-8").toString("base64");

  // 1. Scaffold via Oracle endpoint
  console.log("\n1. POST /agents/scaffold with SOP...");
  const scaffoldRes = await fetch(`${ORACLE_URL}/agents/scaffold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientName: "Test Client",
      clientEmail: testEmail,
      businessName: "SOP Test Co",
      businessDescription: "Testing SOP upload flow",
      agent: {
        name: `SopBot-${Date.now()}`,
        agentType: "research",
        tools: [],
        purpose: "Testing SOP ingestion",
      },
      credentials: [],
      sops: [
        {
          filename: "zoominfo-prospecting-sop.txt",
          contentType: "text/plain",
          content: sopBase64,
        },
      ],
    }),
  });

  if (!scaffoldRes.ok) {
    const body = await scaffoldRes.text();
    throw new Error(`Scaffold failed: ${scaffoldRes.status} — ${body}`);
  }

  const { agentId } = (await scaffoldRes.json()) as { agentId: string };
  console.log(`   ✓ agent created: ${agentId}`);

  let pass = true;
  const fail = (msg: string) => {
    pass = false;
    console.error(`   ✗ ${msg}`);
  };
  const ok = (msg: string) => console.log(`   ✓ ${msg}`);

  try {
    // 2. Verify memory
    console.log("\n2. Verify clientMemoryObject contains sops...");
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new Error("Agent not in DB after scaffold");

    const memory = JSON.parse(decrypt(agent.clientMemoryObject)) as Record<string, unknown>;
    const sops = memory.sops as Array<{ filename: string; text: string }> | undefined;

    if (!Array.isArray(sops)) fail(`memory.sops is not an array — got ${typeof sops}`);
    else if (sops.length !== 1) fail(`expected 1 SOP, got ${sops.length}`);
    else {
      ok(`memory.sops has 1 entry: ${sops[0].filename}`);
      if (!sops[0].text.includes("MAGIC_MARKER")) fail("SOP text missing MAGIC_MARKER — parser dropped content");
      else ok("SOP full text present (MAGIC_MARKER found)");
      if (!sops[0].text.includes("ZoomInfo Prospecting SOP")) fail("SOP heading missing");
      else ok("SOP structure preserved");
    }

    // 3. Build the system prompt via the real assembler
    console.log("\n3. Build system prompt via prompt-assembler...");
    const ctx = await loadAgentContext(agentId);
    const prompt = assembleSystemPrompt(ctx);

    if (!prompt.includes("## Your Operating Manual")) fail("Operating Manual section missing from prompt");
    else ok("Operating Manual section present");

    if (!prompt.includes("MAGIC_MARKER: SOP-CONTENT-LANDED-IN-PROMPT")) fail("Full SOP text not injected into prompt");
    else ok("Full SOP text reached the system prompt");

    if (!prompt.includes("### zoominfo-prospecting-sop.txt")) fail("SOP filename header missing");
    else ok("SOP filename rendered as subsection header");

    // Also verify sops aren't double-rendered in the ambient memory
    const opManualIdx = prompt.indexOf("## Your Operating Manual");
    const clientSectionSlice = prompt.slice(0, opManualIdx);
    if (clientSectionSlice.includes("MAGIC_MARKER")) fail("SOP text leaked into Client memory section");
    else ok("SOPs not duplicated into Client memory section");

    // Print a preview so we can eyeball it
    console.log("\n--- PROMPT PREVIEW (Operating Manual section only) ---");
    const endIdx = prompt.indexOf("\n\n---\n\n", opManualIdx + 1);
    console.log(prompt.slice(opManualIdx, endIdx > 0 ? endIdx : opManualIdx + 1200));
    console.log("--- END PREVIEW ---\n");
  } finally {
    // 4. Cleanup
    console.log("4. Cleanup...");
    await prisma.oracleAction.deleteMany({ where: { agentId } }).catch(() => {});
    await prisma.agent.delete({ where: { id: agentId } }).catch(() => {});
    const client = await prisma.client.findUnique({ where: { email: testEmail } });
    if (client) {
      await prisma.oracleAction.deleteMany({ where: { clientId: client.id } }).catch(() => {});
      await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    }
    ok("test records deleted");
  }

  console.log(pass ? "\n✅ ALL CHECKS PASSED\n" : "\n❌ CHECKS FAILED\n");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("\n💥 Test script crashed:", err);
  process.exit(1);
});
