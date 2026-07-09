import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const id = "cmrdwqyab000113h3syv0su5z";
let last = "";
for (let i = 0; i < 90; i++) {
  const t = await p.localTask.findUnique({ where: { id } });
  if (t.status !== last) { console.log(`[${i*4}s] ${t.status}`); last = t.status; }
  if (["succeeded","failed","denied","cancelled"].includes(t.status)) {
    console.log("FINAL:", t.status, t.startedAt && t.endedAt ? `(${((t.endedAt-t.startedAt)/1000).toFixed(1)}s)` : "");
    console.log("ERROR:", t.error ?? "-");
    console.log("RESULT:", t.result || "(none)");
    console.log("TRANSCRIPT:");
    for (const [j,h] of (t.transcript||[]).entries()) console.log(`  ${j+1}. ${h.action}${h.note?"  ["+h.note+"]":""}`);
    break;
  }
  await new Promise(r => setTimeout(r, 4000));
}
await p.$disconnect();
