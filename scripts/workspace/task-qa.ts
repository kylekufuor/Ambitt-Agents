import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import prisma from "../../shared/db.js";
import { signWorkspaceRequest } from "../../shared/workspace/auth.js";
const c = "workspace-qa-client",
  a = c + "-agent";
async function api(path: string, body?: unknown) {
  const p = "/workspace/" + path,
    b = body ? JSON.stringify(body) : "",
    m = body ? "POST" : "GET";
  const r = await fetch("http://localhost:4311" + p, {
    method: m,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + signWorkspaceRequest(c, a, m, p, b),
    },
    body: b || undefined,
  });
  return { status: r.status, data: await r.json() };
}
async function main() {
  assert(
    new URL(process.env.DATABASE_URL!).searchParams
      .get("schema")
      ?.startsWith("workspace_qa_"),
  );
  await prisma.agent.update({
    where: { id: a },
    data: { status: "active", dryRun: true },
  });
  const before = await prisma.workspaceTool.count({
    where: { agentId: a, kind: "file" },
  });
  const message =
    "Create a CSV file called qa-estimates.csv with exactly these columns: site,amount. Include two fictional rows: Demo Roof A,2600 and Demo Roof B,3400. Use generate_csv only. Do not browse, send email, send messages, or use any other tools. Return the file in this chat.";
  const id = "qa-task-" + Date.now();
  let r = await api("turns", { requestId: id, kind: "work", message });
  assert.equal(r.status, 202);
  const turn = r.data.id;
  const repeated = await api("turns", { requestId: id, kind: "work", message });
  assert.equal(repeated.data.id, turn);
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    r = await api("state");
    const t = r.data.turns.find((t: { id: string }) => t.id === turn);
    if (t.status !== "pending") {
      assert.equal(t.status, "completed", t.response);
      assert(
        (await prisma.workspaceTool.count({
          where: { agentId: a, kind: "file" },
        })) > before,
      );
      assert(t.response.includes("Saved to Files"));
      writeFileSync(
        ".codex/reviews/workspace/task-results.json",
        JSON.stringify(
          {
            duplicateRequestId: turn,
            reply: t.response,
            fileSaved: true,
            dryRun: true,
          },
          null,
          2,
        ),
      );
      console.log(
        "Real agent task generated a CSV; output saved to Files; duplicate request did not rerun.",
      );
      break;
    }
    if (i === 99) throw new Error("Task timed out");
  }
  await prisma.agent.update({ where: { id: a }, data: { status: "building" } });
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("QA failed:", e.message);
  process.exit(1);
});
