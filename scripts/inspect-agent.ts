import "dotenv/config";
import prisma from "../shared/db.js";
import { decrypt } from "../shared/encryption.js";
import { loadAgentContext, assembleSystemPrompt } from "../shared/runtime/prompt-assembler.js";

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("usage: inspect-agent.ts <agentId>");

  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw new Error(`agent ${id} not found`);

  const mem = JSON.parse(decrypt(agent.clientMemoryObject)) as Record<string, unknown>;
  const sops = (mem.sops ?? []) as Array<{ filename: string; text: string; uploadedAt?: string }>;

  console.log("--- memory.sops ---");
  console.log("count:", sops.length);
  for (const s of sops) {
    console.log("filename:", s.filename);
    console.log("uploadedAt:", s.uploadedAt);
    console.log("text length:", s.text?.length ?? 0);
    console.log("first 400 chars:", JSON.stringify((s.text ?? "").slice(0, 400)));
    console.log();
  }

  console.log("--- assembled system prompt: Operating Manual section ---");
  const ctx = await loadAgentContext(id);
  const prompt = assembleSystemPrompt(ctx);
  const i = prompt.indexOf("## Your Operating Manual");
  if (i < 0) {
    console.error("OPERATING MANUAL SECTION NOT FOUND IN PROMPT");
    process.exit(1);
  }
  const j = prompt.indexOf("\n\n---\n\n", i + 1);
  console.log(prompt.slice(i, j > 0 ? j : i + 2000));
  console.log();
  console.log("--- prompt length ---", prompt.length);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
