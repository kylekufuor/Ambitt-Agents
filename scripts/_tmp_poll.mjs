import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const id = "cmrdv3oq30001ge3q0ocs89ln";
for (let i = 0; i < 40; i++) {
  const t = await p.localTask.findUnique({ where: { id } });
  if (["succeeded","failed","denied","cancelled"].includes(t.status)) {
    console.log("status:", t.status);
    if (t.startedAt && t.endedAt) console.log("duration:", ((t.endedAt - t.startedAt)/1000).toFixed(1) + "s");
    console.log("error:", t.error ?? "-");
    console.log("RESULT:", t.result || "(none)");
    console.log("--- TRANSCRIPT ---");
    for (const [j, h] of (t.transcript || []).entries()) console.log(`${j+1}. ${h.action}${h.note ? "  [" + h.note + "]" : ""}`);
    await p.$disconnect(); process.exit(0);
  }
  await new Promise(r => setTimeout(r, 3000));
}
console.log("still waiting after 2min; current:", (await p.localTask.findUnique({where:{id}})).status);
await p.$disconnect();
