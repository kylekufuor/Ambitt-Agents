import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import prisma from "../../shared/db.js";
import { signWorkspaceRequest } from "../../shared/workspace/auth.js";
import { decrypt } from "../../shared/encryption.js";
import puppeteer from "puppeteer";
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
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
async function main() {
  assert(
    new URL(process.env.DATABASE_URL!).searchParams
      .get("schema")
      ?.startsWith("workspace_qa_"),
  );
  await prisma.workspaceTurn.deleteMany({ where: { agentId: a } });
  await prisma.playbookRule.deleteMany({ where: { agentId: a } });
  await prisma.workspaceTool.deleteMany({
    where: { agentId: a, kind: "file" },
  });
  await prisma.agent.update({
    where: { id: a },
    data: { status: "active", dryRun: true },
  });
  const tool = await prisma.workspaceTool.findFirstOrThrow({
    where: { agentId: a, kind: "web", archivedAt: null },
  });
  await prisma.workspaceTool.update({
    where: { id: tool.id },
    data: { name: "Northgale · demo" },
  });
  const session = await api("sessions", {
    toolId: tool.id,
    tabId: "qa-demo-browser",
  });
  writeFileSync(
    ".codex/reviews/workspace/demo-session.json",
    JSON.stringify({ id: session.id, toolId: tool.id }),
  );
  const db = await prisma.workspaceSession.findUniqueOrThrow({
    where: { id: session.id },
  });
  const browser = await puppeteer.connect({
    browserWSEndpoint: decrypt(db.connectionEncrypted!),
    defaultViewport: null,
  });
  const page = (await browser.pages())[0];
  await page.setContent(
    `<!doctype html><html><head><title>Northgale Estimates · Fictional demo</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f8fa;color:#273746;font:15px Arial,sans-serif}header{height:67px;border-bottom:1px solid #e1e7ed;display:flex;align-items:center;padding:0 38px;gap:22px;background:#fff}header b{font-size:19px}header span{font-size:12px;color:#758490}header em{margin-left:auto;border-radius:5px;background:#e9eef3;padding:7px 10px;font-size:11px;font-style:normal}main{padding:38px}aside{font-size:12px;color:#758490;margin-bottom:10px}h1{font-size:29px;font-weight:500;margin:0 0 10px}p{color:#758490;font-size:14px;line-height:1.6}.stats{display:flex;gap:16px;margin:26px 0}.stats div{flex:1;background:white;border:1px solid #e1e7ed;border-radius:8px;padding:20px}.stats strong{display:block;font-size:28px;font-weight:500;margin:10px 0 0}.stats span{font-size:12px;color:#758490}.bar{display:flex;gap:10px;align-items:center;margin:30px 0 18px}.bar button{border:1px solid #d6dee6;background:white;border-radius:6px;padding:10px 15px;font-size:12px;color:#526679}.bar button:first-child{background:#263d53;color:white;border-color:#263d53}.bar label{margin-left:auto;color:#758490;font-size:12px}table{width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;text-align:left;font-size:13px}th{font-weight:500;background:#eef2f6;color:#647789;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:15px 18px}td{border-bottom:1px solid #edf0f4;padding:21px 18px}td b{font-weight:500}td small{display:block;color:#8191a0;margin-top:5px}.status{padding:5px 8px;background:#fff5e4;color:#8b6726;border-radius:5px;font-size:11px}.ready{background:#eaf4ec;color:#497b50}.foot{display:flex;justify-content:space-between;padding-top:18px;font-size:11px;color:#8895a1}</style></head><body><header><b>Northgale</b><span>Projects</span><span>Estimates</span><span>Customers</span><em>DEMO DATA</em></header><main><aside>WORKSPACE / ESTIMATES</aside><h1>Good work starts with a clear estimate.</h1><p>Your next jobs, ready for a closer look.</p><div class="stats"><div><span>Open estimates</span><strong>4</strong></div><div><span>Ready to follow up</span><strong>2</strong></div><div><span>Waiting for review</span><strong>2</strong></div></div><div class="bar"><button>All estimates</button><button>Needs review</button><button>Ready to follow up</button><label>Updated just now</label></div><table><thead><tr><th>Project</th><th>Work</th><th>Estimate</th><th>Status</th></tr></thead><tbody><tr><td><b>Demo property 01</b><small>Residential · North Texas</small></td><td>Roof replacement</td><td>$8,450</td><td><span class="status ready">Ready to follow up</span></td></tr><tr><td><b>Demo property 02</b><small>Residential · North Texas</small></td><td>Storm damage repair</td><td>$3,200</td><td><span class="status ready">Ready to follow up</span></td></tr><tr><td><b>Demo property 03</b><small>Residential · North Texas</small></td><td>Flashing repair</td><td>$1,650</td><td><span class="status">Needs review</span></td></tr><tr><td><b>Demo property 04</b><small>Residential · North Texas</small></td><td>Gutter replacement</td><td>$2,100</td><td><span class="status">Needs review</span></td></tr></tbody></table><div class="foot"><span>4 illustrative projects · fictional business</span><span>No real customer data</span></div></main></body></html>`,
  );
  await browser.disconnect();
  // Explicitly synthetic conversation for a labelled marketing screenshot.
  await prisma.workspaceTurn.create({
    data: {
      clientId: c,
      agentId: a,
      kind: "learn",
      requestId: "marketing-demo-turn",
      status: "completed",
      message:
        "I review anything under $2,600 myself. For the larger jobs, help me prepare a friendly follow-up.",
      response:
        "I can help with that. I’ve drafted the handover rule below for you to review.\n\nFor the larger jobs, what should a good first follow-up ask the customer?",
      completedAt: new Date(),
    },
  });
  await prisma.playbookRule.create({
    data: {
      clientId: c,
      agentId: a,
      group: "stop",
      status: "proposed",
      text: "Hand estimates below $2,600 to me for review.",
      sourceKind: "chat",
      sourceAt: new Date(),
      proposedReason: "You asked to review smaller estimates yourself.",
    },
  });
  console.log(
    "Prepared a fictional, labelled demonstration inside a real browser session.",
  );
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
