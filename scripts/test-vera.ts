// scripts/test-vera.ts
//
// Smoke test for Vera (the request_review platform tool).
//
// Loads the canonical example.json, feeds it to Vera as the "clean" case
// (should APPROVE), then mutates a copy with deliberate defects (pricing,
// AI tells, operator-name leak, name mismatch) and feeds THAT to Vera as
// the "dirty" case (should REJECT with specific issues).
//
// Doesn't require any DB seed — Vera tolerates missing Agent rows by
// skipping usage logging.
//
// Run: tsx scripts/test-vera.ts
// Requires: ANTHROPIC_API_KEY in env.

// The shell sometimes has an empty ANTHROPIC_API_KEY exported (Claude Code
// runtime sets it), which takes precedence over .env under dotenv's default
// behavior. Force-override so .env wins.
import { config as loadEnv } from "dotenv";
loadEnv({ override: true });
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requestReview } from "../shared/platform-tools/review.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const examplePath = join(__dirname, "..", "oracle", "templates", "proposal-email", "example.json");
  const clean = JSON.parse(readFileSync(examplePath, "utf-8"));

  console.log("=".repeat(72));
  console.log("Case 1: CLEAN proposal (expecting APPROVE)");
  console.log("=".repeat(72));

  const cleanResult = await requestReview({
    artifactType: "proposal_email",
    data: clean,
    context: "Prospect: Kyle Kufuor (Ambitt Media). Agent: Kwame, lead-gen role. Preferred greeting name: Kyle.",
    attempt: 1,
    callerAgentId: "test-script",
  });

  console.log("\nStatus:", cleanResult.status);
  console.log("\nMessage to Atlas:\n");
  console.log(cleanResult.message);
  if (cleanResult.critique) {
    console.log("\nStructured critique:");
    console.log(JSON.stringify(cleanResult.critique, null, 2));
  }

  console.log("\n");
  console.log("=".repeat(72));
  console.log("Case 2: DIRTY proposal (expecting REJECT with multiple issues)");
  console.log("=".repeat(72));

  // Mutate a copy with deliberate defects to exercise Vera's checks.
  const dirty = JSON.parse(JSON.stringify(clean));
  // 1. Pricing leak (forbidden content)
  dirty.cta.subtext = "Starting at $1,500 setup plus $499/month retainer. Approve to lock in your pricing.";
  // 2. Operator-name leak (forbidden content) + AI tells in voice
  dirty.greeting.body =
    "Kyle from Ambitt here. I've leveraged your comprehensive answers to delve into a robust, seamless solution. In today's fast-paced world, it's worth noting that we can do anything you can imagine.";
  // 3. Name mismatch: greeting.name set to agent name, not prospect
  dirty.greeting.name = "Kwame";
  // 4. Sample signature signed as the agent (not the client)
  if (dirty.sample) {
    dirty.sample.card.signature = "— Kwame, your lead-gen agent";
  }
  // 5. Generic-filler whatWeBuild paragraph (specificity failure)
  dirty.whatWeBuild.paragraphs = [
    "Your business deserves the best. Your customers expect more. We help you streamline operations and unlock value across every touchpoint of your journey.",
  ];

  const dirtyResult = await requestReview({
    artifactType: "proposal_email",
    data: dirty,
    context: "Prospect: Kyle Kufuor (Ambitt Media). Agent: Kwame, lead-gen role. Preferred greeting name: Kyle.",
    attempt: 1,
    callerAgentId: "test-script",
  });

  console.log("\nStatus:", dirtyResult.status);
  console.log("\nMessage to Atlas:\n");
  console.log(dirtyResult.message);
  if (dirtyResult.critique) {
    console.log("\nStructured critique:");
    console.log(JSON.stringify(dirtyResult.critique, null, 2));
  }

  // Exit code reflects whether both cases behaved correctly. Clean must approve,
  // dirty must reject — otherwise we want to know.
  const cleanOk = cleanResult.status === "approved";
  const dirtyOk = dirtyResult.status === "rejected";
  console.log("\n");
  console.log("=".repeat(72));
  console.log(`Result: clean=${cleanOk ? "✅" : "❌"} dirty=${dirtyOk ? "✅" : "❌"}`);
  console.log("=".repeat(72));
  if (!cleanOk || !dirtyOk) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[test-vera] error:", err);
  process.exitCode = 1;
});
