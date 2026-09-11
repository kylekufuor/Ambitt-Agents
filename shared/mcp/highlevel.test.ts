import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { parseHighLevelCredential, highLevelHeaders, credentialFingerprint, bindHighLevelLocation, HighLevelLimiter, createHighLevelFetch, isHighLevelReadTool } from "./highlevel.js";
import { signToolConnection, verifyToolConnection } from "../tool-connection-auth.js";
import { decrypt } from "../encryption.js";
import { MCP_SERVERS } from "./registry.js";
import { MCPClientManager } from "./client.js";
import { createHighLevelRouter, probeHighLevel, type HighLevelStore } from "../../oracle/lib/highlevel-connection.js";
import prisma from "../db.js";
import { executeToolCalls } from "../runtime/tool-bridge.js";

async function main() {
  // Synthetic keys; no network outside localhost and no database calls.
  process.env.CHAT_TOKEN_SECRET = "test-only-tool-connection-secret";
  process.env.APP_ENCRYPTION_KEY = "ab".repeat(32);
  let passed = 0;
  const check = (label: string, fn: () => void) => { fn(); passed++; console.log(`PASS ${label}`); };
  const credential = { pit: "pit-synthetic-token-123456", locationId: "location-one" };
  const serialized = JSON.stringify(credential);
  check("credential validation and normalization", () => {
    assert.deepEqual(parseHighLevelCredential({ ...credential, pit: ` ${credential.pit} ` }), credential);
    for (const bad of [null, {}, "broken", { ...credential, pit: "pit-test\r\nHeader: x" }, { ...credential, locationId: "a/b" }]) assert.throws(() => parseHighLevelCredential(bad));
  });
  check("official headers and collision-resistant cache keys", () => {
    assert.deepEqual(highLevelHeaders(serialized), { Authorization: `Bearer ${credential.pit}`, locationId: credential.locationId });
    assert.notEqual(credentialFingerprint("sameprefix-ONE-1234"), credentialFingerprint("sameprefix-TWO-1234"));
    assert(!credentialFingerprint(serialized).includes("pit-"));
  });
  check("cross-location arguments refused, including nested inputs", () => {
    assert.throws(() => bindHighLevelLocation({ input: { location_id: "location-two" } }, credential.locationId));
    assert.deepEqual(bindHighLevelLocation({ contactId: "contact-one" }, credential.locationId), { contactId: "contact-one" });
    assert(isHighLevelReadTool("contacts_get-contact"));
    assert(!isHighLevelReadTool("conversations_send-a-new-message"));
    assert(!isHighLevelReadTool("execute_operation"));
  });
  check("request auth binds tenant, agent, exact body and expiration", () => {
    const body = { action: "connect", credential };
    const token = signToolConnection("client-one", "agent-one", body, 1000);
    assert.equal(verifyToolConnection(token, "agent-one", body, 1001), "client-one");
    assert.throws(() => verifyToolConnection(token, "agent-two", body, 1001));
    assert.throws(() => verifyToolConnection(token, "agent-one", { action: "disconnect" }, 1001));
    assert.throws(() => verifyToolConnection(token, "agent-one", body, 61_000));
    assert.throws(() => verifyToolConnection(`${token}x`, "agent-one", body, 1001));
  });
  const delays: number[] = [];
  const limiter = new HighLevelLimiter(() => 0, async (ms) => { delays.push(ms); });
  await Promise.all([limiter.take(), limiter.take(), limiter.take()]);
  check("parallel calls reserve separate throttle slots", () => assert.deepEqual(delays, [110, 220]));
  let attempts = 0;
  const retryFetch = createHighLevelFetch("rate-test", async () => { attempts++; return new Response("", { status: attempts < 4 ? 429 : 200, headers: { "retry-after": "0" } }); }, async () => undefined);
  await retryFetch("http://localhost", { method: "POST", body: JSON.stringify({ method: "tools/call", params: { name: "contacts_create-contact" } }) });
  check("three retries after rejected rate-limit responses", () => assert.equal(attempts, 4));
  attempts = 0;
  const writeFetch = createHighLevelFetch("write-test", async () => { attempts++; return new Response("upstream secret", { status: 500 }); }, async () => undefined);
  await assert.rejects(writeFetch("http://localhost", { method: "POST", body: JSON.stringify({ method: "tools/call", params: { name: "contacts_create-contact" } }) }), /couldn't complete/);
  check("ambiguous failed writes are not replayed", () => assert.equal(attempts, 1));

  const originalFind = prisma.agent.findUnique;
  const originalLog = prisma.dryRunLog.create;
  const write = [{ type: "tool_use" as const, id: "dry-test", caller: { type: "direct" as const }, name: "highlevel__contacts_create-contact", input: { name: "Synthetic" } }];
  try {
    prisma.agent.findUnique = (async () => ({ dryRun: true })) as unknown as typeof prisma.agent.findUnique;
    prisma.dryRunLog.create = (async () => { throw new Error("Synthetic storage failure"); }) as unknown as typeof prisma.dryRunLog.create;
    const failedCapture = await executeToolCalls("synthetic-agent", write);
    check("dry-run storage failure never falls through to a real write", () => {
      assert.equal(failedCapture[0].is_error, true);
      assert.match(String(failedCapture[0].content), /No GoHighLevel action was taken/);
    });
    prisma.agent.findUnique = (async () => { throw new Error("Synthetic database failure"); }) as unknown as typeof prisma.agent.findUnique;
    const unknownMode = await executeToolCalls("synthetic-agent", write);
    check("unknown run mode fails closed", () => assert.match(String(unknownMode[0].content), /No GoHighLevel action was taken/));
  } finally {
    prisma.agent.findUnique = originalFind;
    prisma.dryRunLog.create = originalLog;
  }

  let saved: { apiKey: string; status: string; expiresAt: Date | null } | null = null;
  let toolCalls = 0;
  const db: HighLevelStore = {
    ownsAgent: async (clientId, agentId) => clientId === "client-one" && agentId === "agent-one",
    enabled: async () => !!saved,
    read: async () => saved,
    save: async (_clientId, _agentId, apiKey) => { saved = { apiKey, status: "active", expiresAt: null }; },
    revoke: async () => { saved = null; },
  };
  const app = express();
  app.use(express.json());
  const headersSeen: string[] = [];
  app.all("/mcp", (req, res) => {
    if (req.method !== "POST") { res.sendStatus(405); return; }
    headersSeen.push(String(req.headers.authorization));
    if (req.headers.authorization !== `Bearer ${credential.pit}` || req.headers.locationid !== credential.locationId) { res.sendStatus(403); return; }
    const { id, method, params } = req.body;
    if (id === undefined) { res.sendStatus(202); return; }
    let result: unknown = {};
    if (method === "initialize") result = { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake-highlevel", version: "1" } };
    if (method === "tools/list") result = { tools: [{ name: "locations_get-location", inputSchema: { type: "object", properties: { locationId: { type: "string" } } } }] };
    if (method === "tools/call") { toolCalls++; result = { content: [{ type: "text", text: JSON.stringify({ location: { id: req.headers.locationid } }) }] }; }
    res.json({ jsonrpc: "2.0", id, result });
  });
  app.use(createHighLevelRouter({ store: db, probe: probeHighLevel }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const original = MCP_SERVERS.highlevel;
  MCP_SERVERS.highlevel = { ...original, url: `${base}/mcp` };
  const post = async (body: unknown, token = signToolConnection("client-one", "agent-one", body)) => fetch(`${base}/agents/agent-one/tools/highlevel`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Tool-Connection-Auth": token }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await post({ action: "connect", credential }, "")).status, 401);
    assert.equal((await post({ action: "status" }, signToolConnection("other-client", "agent-one", { action: "status" }))).status, 403);
    check("unauthenticated and wrong-owner requests blocked before storage", () => assert.equal(saved, null));
    const result = await post({ action: "connect", credential });
    assert.equal(result.status, 200);
    const text = await result.text();
    check("real MCP handshake, location probe, encrypted save and masked response", () => {
      assert(!text.includes(credential.pit));
      assert(headersSeen.length >= 3);
      assert.equal(toolCalls, 1);
      assert(saved);
      assert(!saved.apiKey.includes(credential.pit));
      assert.equal(decrypt(saved.apiKey), serialized);
    });
    assert.equal((await post({ action: "test" })).status, 200);
    const before = saved;
    assert.equal((await post({ action: "connect", credential: { ...credential, locationId: "location-two" } })).status, 422);
    check("failed replacement leaves working credentials intact", () => assert.equal(saved, before));
    const manager = new MCPClientManager();
    await manager.connect({ server: MCP_SERVERS.highlevel, credential: serialized });
    const callsBefore = toolCalls;
    const denied = await manager.callTool("highlevel", serialized, "locations_get-location", { locationId: "location-two" });
    assert(denied.isError);
    assert.equal(toolCalls, callsBefore);
    await manager.disconnectAll();
    assert.equal((await post({ action: "disconnect" })).status, 200);
    const status = await (await post({ action: "status" })).json() as { connected: boolean };
    check("cross-location calls blocked and disconnected credential unavailable", () => { assert.equal(saved, null); assert.equal(status.connected, false); });
  } finally {
    MCP_SERVERS.highlevel = original;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  console.log(`${passed} checks passed`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
