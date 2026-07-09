import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const id = "cmrdwg4b30001thhl4u0kc1i2";
let lastStatus = "";
for (let i = 0; i < 75; i++) {
  const t = await p.localTask.findUnique({ where: { id } });
  if (t.status !== lastStatus) { console.log(`[${i*4}s] -> ${t.status}`); lastStatus = t.status; }
  if (["succeeded","failed","denied","cancelled"].includes(t.status)) {
    console.log("FINAL:", t.status);
    if (t.startedAt && t.endedAt) console.log("duration:", ((t.endedAt - t.startedAt)/1000).toFixed(1) + "s");
    console.log("ERROR:", t.error ?? "-");
    console.log("RESULT:", t.result || "(none)");
    console.log("TRANSCRIPT:");
    for (const [j,h] of (t.transcript||[]).entries()) console.log(`  ${j+1}. ${h.action}${h.note?"  ["+h.note+"]":""}`);
    break;
  }
  await new Promise(r => setTimeout(r, 4000));
}
await p.$disconnect();
