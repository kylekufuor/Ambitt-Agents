// scripts/marco.ts
//
// CLI wrapper around Marco. Hands him a test plan (string or file path),
// runs the runtime engine against him, prints his report. Build-time only.
//
// Usage:
//   tsx scripts/marco.ts "test plan here"
//   tsx scripts/marco.ts path/to/plan.md
//   tsx scripts/marco.ts -                 (read from stdin)
//
// Optional flags:
//   --thread <id>     Resume an existing test thread. Defaults to a new one.
//
// Marco runs unbillable (billable:false) — these aren't client interactions.

import { config as loadEnv } from "dotenv";
loadEnv({ override: true });

import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const MARCO_EMAIL = "marco@ambitt.agency";

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function loadPlan(arg: string): Promise<string> {
  if (arg === "-") return readStdin();
  // If the arg is a path that exists, read the file. Otherwise treat as inline text.
  if (existsSync(arg)) return readFileSync(arg, "utf-8");
  return arg;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: tsx scripts/marco.ts \"<test plan>\" | <path/to/plan.md> | -");
    console.error("Optional: --thread <id> to resume an existing test thread");
    process.exitCode = 2;
    return;
  }

  let threadFlag: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--thread") {
      threadFlag = args[i + 1];
      i++;
    } else {
      positional.push(args[i]);
    }
  }

  if (positional.length === 0) {
    console.error("Missing test plan argument.");
    process.exitCode = 2;
    return;
  }

  const plan = await loadPlan(positional.join(" "));
  if (!plan.trim()) {
    console.error("Test plan is empty.");
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();
  const marco = await prisma.agent.findUnique({
    where: { email: MARCO_EMAIL },
    select: { id: true, status: true },
  });
  if (!marco) {
    console.error(`Marco not seeded (no agent at ${MARCO_EMAIL}). Run: tsx scripts/seed-marco.ts`);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  if (marco.status !== "active") {
    console.error(`Marco is not active (status: ${marco.status}).`);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const threadId = threadFlag ?? `marco-cli-${Date.now()}`;
  console.log(`Marco running (threadId: ${threadId})…\n`);

  const { processInboundMessage } = await import("../shared/runtime/index.js");
  const start = Date.now();
  try {
    const result = await processInboundMessage({
      agentId: marco.id,
      userMessage: plan,
      channel: "chat",
      threadId,
      senderEmail: "kylekufuor@gmail.com",
      billable: false,
    });

    const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
    console.log("─".repeat(72));
    console.log(result.response);
    console.log("─".repeat(72));
    console.log(`\nDone in ${elapsedSec}s · ${result.loopCount} loop(s) · ${result.toolsUsed.length} tool call(s)`);
    if (result.toolsUsed.length > 0) {
      const summary: Record<string, number> = {};
      for (const t of result.toolsUsed) {
        const key = `${t.serverId}/${t.toolName}${t.success ? "" : " (failed)"}`;
        summary[key] = (summary[key] ?? 0) + 1;
      }
      console.log("\nTool calls:");
      for (const [k, n] of Object.entries(summary)) console.log(`  ${k}: ${n}`);
    }
    console.log(`\nResume this thread: --thread ${threadId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[marco] error:", err);
  process.exitCode = 1;
});
