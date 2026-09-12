import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { signWorkspaceRequest } from "../../shared/workspace/auth.js";
import { recorderSource } from "../../shared/workspace/recorder.js";
import { decrypt } from "../../shared/encryption.js";
import prisma from "../../shared/db.js";
import puppeteer from "puppeteer";
const results: string[] = [];
async function api(
  path: string,
  body?: unknown,
  other = false,
  method?: string,
) {
  const c = other ? "workspace-other-client" : "workspace-qa-client",
    a = c + "-agent";
  const data = body ? JSON.stringify(body) : "";
  const verb = method ?? (body ? "POST" : "GET");
  const p = "/workspace/" + path;
  const r = await fetch("http://localhost:4311" + p, {
    method: verb,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + signWorkspaceRequest(c, a, verb, p, data),
    },
    body: data || undefined,
  });
  return { status: r.status, data: await r.json() };
}
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
async function main() {
  const publicResponse = await fetch("http://localhost:4311/workspace/state");
  assert.equal(publicResponse.status, 401);
  results.push("Anonymous Oracle workspace rejected");
  let r = await api("tools", {
    name: "Private network",
    url: "http://127.0.0.1",
  });
  assert.equal(r.status, 400);
  results.push("Private network URL rejected");
  r = await api("tools", {
    name: "Example website",
    url: "https://example.com",
  });
  assert.equal(r.status, 200);
  const toolId = r.data.tool.id;
  r = await api("state", undefined, true);
  assert(!r.data.tools.some((t: { id: string }) => t.id === toolId));
  results.push("Tools isolated by tenant");
  r = await api("files", {
    filename: "sample.csv",
    content: Buffer.from("name,amount\nRoof A,2500\n").toString("base64"),
  });
  assert.equal(r.status, 200);
  const fileId = r.data.id;
  assert.equal((await api("files/" + fileId, undefined, true)).status, 404);
  assert((await api("files/" + fileId)).data.content.includes("Roof A"));
  results.push("File import, read and cross-tenant denial");
  r = await api("catalog");
  assert.equal(r.status, 200);
  assert(r.data.apps.length > 20);
  results.push(`Real Composio catalogue loaded (${r.data.apps.length} apps)`);
  r = await api("sessions", { toolId, tabId: "qa-browser-tab" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.id;
  results.push("Real private browser created");
  assert.equal(
    (
      await api(
        "sessions/" + id + "/watch",
        {
          tabId: "qa-browser-tab",
          on: true,
          consent: true,
          origin: "https://example.com",
        },
        true,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await api("sessions/" + id + "/watch", {
        tabId: "wrong-tab",
        on: true,
        consent: true,
        origin: "https://example.com",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api("sessions/" + id + "/watch", {
        tabId: "qa-browser-tab",
        on: true,
      })
    ).status,
    400,
  );
  results.push("Watching requires tenant, tab and site consent");
  const dbSession = await prisma.workspaceSession.findUniqueOrThrow({
    where: { id },
  });
  const browser = await puppeteer.connect({
    browserWSEndpoint: decrypt(dbSession.connectionEncrypted!),
    defaultViewport: null,
  });
  try {
    const page = (await browser.pages())[0];
    await page.setContent(
      '<h1>Estimates</h1><p>Northgale roofing demonstration: estimate jobs above $2,000.</p><button id="qualify">Qualify estimate</button><input value="NEVER_CAPTURE_THIS_INPUT"/><div contenteditable="true">NEVER_CAPTURE_EDITABLE</div>',
    );
    r = await api("sessions/" + id + "/watch", {
      tabId: "qa-browser-tab",
      on: true,
      consent: true,
      origin: "https://example.com",
    });
    assert.equal(r.status, 200);
    let seq = r.data.heartbeatSeq;
    await sleep(3100);
    r = await api("sessions/" + id + "/heartbeat", {
      tabId: "qa-browser-tab",
      seq: ++seq,
      visible: true,
      elapsedMs: 3100,
    });
    assert.equal(r.status, 200);
    assert(r.data.watching);
    const first = r.data.watchedMs;
    await page.click("#qualify");
    await sleep(3100);
    r = await api("sessions/" + id + "/heartbeat", {
      tabId: "qa-browser-tab",
      seq: ++seq,
      visible: true,
      elapsedMs: 3100,
    });
    assert(r.data.watchedMs > first);
    const repeated = await api("sessions/" + id + "/heartbeat", {
      tabId: "qa-browser-tab",
      seq,
      visible: true,
      elapsedMs: 3100,
    });
    assert.equal(repeated.data.watchedMs, r.data.watchedMs);
    results.push(
      "Visible watch time recorded; replayed heartbeat not double-counted",
    );
    const notes = await api("records/" + id);
    const json = JSON.stringify(notes.data);
    assert(json.includes("Qualify estimate"));
    assert(!json.includes("NEVER_CAPTURE_THIS_INPUT"));
    assert(!json.includes("NEVER_CAPTURE_EDITABLE"));
    results.push("Real clicks recorded; input and editable values excluded");
    await sleep(500);
    r = await api("sessions/" + id + "/heartbeat", {
      tabId: "qa-browser-tab",
      seq: ++seq,
      visible: false,
      elapsedMs: 500,
    });
    assert.equal(r.data.watching, false);
    const stopped = r.data.watchedMs;
    await sleep(1000);
    r = await api("sessions/" + id + "/heartbeat", {
      tabId: "qa-browser-tab",
      seq: ++seq,
      visible: false,
      elapsedMs: 1000,
    });
    assert.equal(r.data.watchedMs, stopped);
    results.push("Hidden tab pauses recording and meter");
    await page.setContent(
      '<h1>Log in</h1><input type="password" value="SECRET_PASSWORD"/>',
    );
    const privateResult = (await page.evaluate(
      recorderSource("https://example.com"),
    )) as { private: boolean; text: string };
    assert(privateResult.private);
    assert.equal(privateResult.text, "");
    results.push("Password pages excluded from learning");
    r = await api("turns", {
      requestId: "qa-learning-one-" + Date.now(),
      kind: "learn",
      sessionId: id,
      message:
        "For roofing estimates, replace my current handover threshold with $2,600: hand anything below $2,600 to me. What did you notice in my demonstration? Restate this as an instruction for me to review.",
    });
    assert.equal(r.status, 202);
    const turnId = r.data.id;
    results.push("Learning job persisted before execution");
    for (let i = 0; i < 80; i++) {
      await sleep(2000);
      const state = await api("state");
      const t = state.data.turns.find((t: { id: string }) => t.id === turnId);
      if (t.status !== "pending") {
        assert.equal(t.status, "completed", t.response);
        assert(t.response.length > 0);
        assert(
          state.data.rules.some(
            (rule: { status: string }) => rule.status === "proposed",
          ),
        );
        results.push("Real Claude response and proposed instruction created");
        break;
      }
      if (i === 79) throw new Error("Learning response timed out");
    }
    const state = await api("state");
    const proposal = state.data.rules.find(
      (r: { status: string }) => r.status === "proposed",
    );
    assert.equal(
      (await api("rules/" + proposal.id, { action: "approve" }, true)).status,
      404,
    );
    r = await api("rules/" + proposal.id, { action: "approve" });
    assert.equal(r.status, 200);
    assert.equal(
      (await api("rules/" + proposal.id, { action: "approve" })).status,
      409,
    );
    results.push(
      "Confirmed instruction activates once; cross-tenant approval rejected",
    );
  } finally {
    await browser.disconnect();
    await api("sessions/" + id + "/close", {});
  }
  const final = await prisma.workspaceSession.findUniqueOrThrow({
    where: { id },
  });
  assert.equal(final.status, "closed");
  assert.equal(final.connectionEncrypted, null);
  results.push("Browser released and connection credentials removed");
  writeFileSync(
    ".codex/reviews/workspace/integration-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(results.join("\n"));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("QA failed:", e.message);
  writeFileSync(
    ".codex/reviews/workspace/integration-results.json",
    JSON.stringify({ passed: results, error: e.message }, null, 2),
  );
  process.exit(1);
});
