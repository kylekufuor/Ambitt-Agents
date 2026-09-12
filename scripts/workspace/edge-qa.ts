import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import prisma from "../../shared/db.js";
import { signWorkspaceRequest } from "../../shared/workspace/auth.js";
import { checkOfficeArchive } from "../../shared/workspace/zip-limit.js";
import { parseTable } from "../../client-portal/src/lib/parse-table.js";
import { proposeRule } from "../../shared/workspace/playbook.js";
import {
  loadAgentContext,
  assembleSystemPrompt,
} from "../../shared/runtime/prompt-assembler.js";
const c = "workspace-qa-client",
  a = c + "-agent";
async function api(path: string, body?: unknown, method?: string) {
  const p = "/workspace/" + path,
    b = body ? JSON.stringify(body) : "",
    m = method ?? (body ? "POST" : "GET");
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
  const results: string[] = [];
  assert.deepEqual(parseTable('name,note\n"Roof, A","line one\nline two"\n'), [
    ["name", "note"],
    ["Roof, A", "line one\nline two"],
  ]);
  results.push("Quoted CSV cells and embedded newlines preserved");
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Estimates").addRows([
    ["Site", "Amount"],
    ["Northgale", 2600],
  ]);
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  await checkOfficeArchive(bytes);
  let r = await api("files", {
    filename: "estimates.xlsx",
    content: bytes.toString("base64"),
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.id;
  r = await api("files/" + id);
  assert(r.data.content.includes("Northgale"));
  r = await api("files/" + id + "/download");
  assert(Buffer.from(r.data.base64, "base64").equals(bytes));
  results.push(
    "Real Excel import, full text extraction and byte-identical download",
  );
  const corrupt = Buffer.from(bytes);
  const central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  corrupt.writeUInt32LE(100000000, central + 24);
  await assert.rejects(() => checkOfficeArchive(corrupt));
  results.push("Oversized Office archive rejected before parsing");
  const prior = await prisma.playbookRule.create({
    data: {
      clientId: c,
      agentId: a,
      group: "never",
      text: "Do not contact sample test addresses.",
      status: "active",
      sourceKind: "portal",
    },
  });
  const proposal = await proposeRule(
    c,
    a,
    {
      group: "never",
      text: "Do not contact sample test addresses or placeholder phone numbers.",
      reason: "Explicit QA instruction revision",
      replacesRuleId: prior.id,
    },
    { kind: "chat" },
  );
  let ctx = await loadAgentContext(a);
  let prompt = assembleSystemPrompt(ctx);
  assert(prompt.includes(prior.text));
  assert(!prompt.includes(proposal.text));
  r = await api("rules/" + proposal.id, { action: "approve" });
  assert.equal(r.status, 200);
  assert.equal(
    (await prisma.playbookRule.findUniqueOrThrow({ where: { id: prior.id } }))
      .status,
    "retired",
  );
  ctx = await loadAgentContext(a);
  prompt = assembleSystemPrompt(ctx);
  assert(prompt.includes(proposal.text));
  results.push(
    "Proposals stay out of runtime; confirmation atomically replaces old instruction",
  );
  const session = await prisma.workspaceSession.findFirst({
    where: { clientId: c, status: "closed" },
    select: { toolId: true, id: true, watchedMs: true },
  });
  assert(session);
  const before = await prisma.workspaceObservation.count({
    where: { sessionId: session.id },
  });
  r = await api("tools/" + session.toolId, {}, "DELETE");
  assert.equal(r.status, 200);
  assert.equal(
    await prisma.workspaceObservation.count({
      where: { sessionId: session.id },
    }),
    before,
  );
  r = await api("state");
  assert(!r.data.tools.some((t: { id: string }) => t.id === session.toolId));
  results.push("Removing a web tool preserves its watch-time audit");
  await prisma.workspaceTool.update({
    where: { id: session.toolId },
    data: { archivedAt: null },
  });
  const first = await prisma.workspaceTurn.create({
    data: {
      clientId: c,
      agentId: a,
      requestId: "qa-lease-" + Date.now(),
      kind: "learn",
      message: "Test unique execution lease",
    },
  });
  await assert.rejects(() =>
    prisma.workspaceTurn.create({
      data: {
        clientId: c,
        agentId: a,
        requestId: "qa-lease-other-" + Date.now(),
        kind: "learn",
        message: "Second lease",
      },
    }),
  );
  await prisma.workspaceTurn.update({
    where: { id: first.id },
    data: { status: "completed", response: "QA lease test finished" },
  });
  results.push("Database prevents simultaneous executing chat requests");
  console.log(results.join("\n"));
  writeFileSync(
    ".codex/reviews/workspace/edge-results.json",
    JSON.stringify(results, null, 2),
  );
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("QA failed:", e.message);
  process.exit(1);
});
