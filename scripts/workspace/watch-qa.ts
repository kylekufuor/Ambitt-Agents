import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import prisma from "../../shared/db.js";
import { signWorkspaceRequest } from "../../shared/workspace/auth.js";
import { decrypt } from "../../shared/encryption.js";
import puppeteer from "puppeteer";
const client = "workspace-qa-client",
  agent = client + "-agent",
  tabId = "qa-watch-fence";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function api(path: string, body?: unknown) {
  const p = "/workspace/" + path,
    b = body ? JSON.stringify(body) : "",
    method = body ? "POST" : "GET";
  const r = await fetch("http://127.0.0.1:4311" + p, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer " + signWorkspaceRequest(client, agent, method, p, b),
    },
    body: b || undefined,
  });
  const data = await r.json();
  assert(r.ok, data.error);
  return data;
}
async function main() {
  assert(
    new URL(process.env.DATABASE_URL!).searchParams
      .get("schema")
      ?.startsWith("workspace_qa_"),
  );
  const tool = await prisma.workspaceTool.findFirstOrThrow({
    where: { agentId: agent, kind: "web", archivedAt: null },
  });
  const session = await api("sessions", { toolId: tool.id, tabId });
  const row = await prisma.workspaceSession.findUniqueOrThrow({
    where: { id: session.id },
  });
  const browser = await puppeteer.connect({
    browserWSEndpoint: decrypt(row.connectionEncrypted!),
    defaultViewport: null,
  });
  try {
    const page = (await browser.pages())[0];
    await page.setContent(
      '<h1>Public estimates</h1><p>Visible text <span data-private>PRIVATE_CHILD</span></p><p contenteditable="plaintext-only">PRIVATE_EDITABLE</p><button id="public">Review <span data-private>PRIVATE_LABEL</span></button><div data-private><button id="private">PRIVATE_CLICK</button></div><form><button id="form" type="button">PRIVATE_FORM</button></form>',
    );
    let watch = await api(`sessions/${session.id}/watch`, {
      tabId,
      on: true,
      consent: true,
      origin: "https://example.com",
    });
    let seq = watch.heartbeatSeq;
    // A pre-switch heartbeat arriving late must not stop or drain the recorder.
    const stale = await api(`sessions/${session.id}/heartbeat`, {
      tabId,
      seq,
      visible: false,
      elapsedMs: 3000,
    });
    assert(stale.watching);
    for (const id of ["public", "private", "form"]) await page.click("#" + id);
    await pause(500);
    watch = await api(`sessions/${session.id}/heartbeat`, {
      tabId,
      seq: ++seq,
      visible: true,
      elapsedMs: 3100,
    });
    assert(watch.watching && watch.watchedMs > 0, JSON.stringify({watching:watch.watching,watchedMs:watch.watchedMs,seq:watch.heartbeatSeq}));
    const repeated = await api(`sessions/${session.id}/heartbeat`, {
      tabId,
      seq,
      visible: false,
      elapsedMs: 3000,
    });
    assert(repeated.watching);
    assert.equal(repeated.watchedMs, watch.watchedMs);
    const resumed = await api("sessions", { toolId: tool.id, tabId });
    assert.equal(resumed.heartbeatSeq, seq);
    await pause(500);
    const next = await api(`sessions/${session.id}/heartbeat`, {
      tabId,
      seq: ++seq,
      visible: true,
      elapsedMs: 3100,
    });
    assert(next.watching && next.watchedMs > watch.watchedMs);
    await api(`sessions/${session.id}/watch`, { tabId, on: false });
    const stop = await api("state");
    assert.equal(stop.session.watching, false);
    const notes = JSON.stringify(await api(`records/${session.id}`));
    assert(notes.includes("Review"));
    assert(!notes.includes("PRIVATE_"));
    writeFileSync(
      ".codex/reviews/workspace/watch-results.txt",
      "PASS: late pre-consent heartbeat fenced; replay ignored; reconnect sequence preserved; watching and time advance; private content and click labels excluded; stop confirmed.\n",
    );
    console.log("Watch sequencing, reconnect, time and privacy checks passed.");
  } finally {
    await browser.disconnect();
    await api(`sessions/${session.id}/close`, {});
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
