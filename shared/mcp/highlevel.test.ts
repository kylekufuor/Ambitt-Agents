import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { parseHighLevelCredential, highLevelHeaders, credentialFingerprint, bindHighLevelLocation, highLevelLocationParameter, HighLevelLimiter, createHighLevelFetch, isHighLevelReadTool, isHighLevelMessagingTool, withoutHighLevelMessaging } from "./highlevel.js";
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
  check("location keys come from the schema: declared overwritten, undeclared stripped, nested overwritten", () => {
    const schema = { type: "object", properties: { path_locationId: { type: "string" }, query_altId: { type: "string" }, query_altType: { type: "string" }, filters: { type: "object" } } };
    assert.deepEqual(
      bindHighLevelLocation({ path_locationId: "location-two", locationId: "location-two", query_altId: "location-two", query_altType: "location", filters: { location_id: "location-two", tag: "vip" } }, credential.locationId, schema),
      { path_locationId: "location-one", query_altId: "location-one", query_altType: "location", filters: { location_id: "location-one", tag: "vip" } },
    );
    assert.deepEqual(bindHighLevelLocation({ query_altId: "x" }, credential.locationId, schema), { query_altId: "location-one", path_locationId: "location-one" });
    assert.deepEqual(bindHighLevelLocation({ locationId: "location-two", contactId: "contact-one" }, credential.locationId), { contactId: "contact-one" });
    assert.equal(highLevelLocationParameter(schema), "path_locationId");
    assert.equal(highLevelLocationParameter({ type: "object", properties: { contactId: {} } }), undefined);
    assert.equal(highLevelLocationParameter(undefined), undefined);
  });
  check("messaging tools are recognised by name; reads and CRM writes are not", () => {
    assert(isHighLevelReadTool("contacts_get-contact"));
    assert(!isHighLevelReadTool("conversations_send-a-new-message"));
    assert(!isHighLevelReadTool("execute_operation"));
    for (const name of ["conversations_send-a-new-message", "emails_send-template", "sms_create-broadcast", "contacts_add-to-workflow"]) assert(isHighLevelMessagingTool(name), name);
    for (const name of ["conversations_get-messages", "conversations_search-conversation", "contacts_create-contact", "opportunities_update-opportunity", "locations_get-location"]) assert(!isHighLevelMessagingTool(name), name);
    assert.deepEqual(withoutHighLevelMessaging([{ name: "conversations_send-a-new-message" }, { name: "conversations_get-messages" }]).map((tool) => tool.name), ["conversations_get-messages"]);
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
  check("portal clock 2 s ahead of Oracle is accepted; 6 s ahead is not", () => {
    const body = { action: "status" };
    assert.equal(verifyToolConnection(signToolConnection("client-one", "agent-one", body, 2000), "agent-one", body, 0), "client-one");
    assert.throws(() => verifyToolConnection(signToolConnection("client-one", "agent-one", body, 6000), "agent-one", body, 0));
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
  attempts = 0;
  const controller = new AbortController();
  let sleeps = 0;
  const abortedFetch = createHighLevelFetch("abort-test", async () => { attempts++; return new Response("", { status: 429, headers: { "retry-after": "0" } }); }, async () => { sleeps++; controller.abort(); });
  await assert.rejects(abortedFetch("http://localhost", { method: "POST", signal: controller.signal, body: JSON.stringify({ method: "tools/list" }) }), /cancelled/);
  check("an abort during the retry wait stops further requests", () => { assert.equal(attempts, 1); assert.equal(sleeps, 1); });
  attempts = 0;
  sleeps = 0;
  let clock = 0;
  const budgetFetch = createHighLevelFetch("budget-test", async () => { attempts++; clock += 15_000; return new Response("", { status: 429, headers: { "retry-after": "10" } }); }, async () => { sleeps++; }, () => clock);
  await assert.rejects(budgetFetch("http://localhost", { method: "POST", body: JSON.stringify({ method: "tools/list" }) }), /busy/);
  check("retries stop once the 20 s budget would be exceeded", () => { assert.equal(attempts, 1); assert.equal(sleeps, 0); });

  const originalFind = prisma.agent.findUnique;
  const originalLog = prisma.dryRunLog.create;
  const write = [{ type: "tool_use" as const, id: "dry-test", caller: { type: "direct" as const }, name: "highlevel__contacts_create-contact", input: { name: "Synthetic" } }];
  const send = [{ type: "tool_use" as const, id: "send-test", caller: { type: "direct" as const }, name: "highlevel__conversations_send-a-new-message", input: { body_contactId: "contact-one", body_message: "hi" } }];
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
    const refused = await executeToolCalls("synthetic-agent", send);
    check("a messaging tool named by the model is refused before any lookup", () => {
      assert.equal(refused[0].is_error, true);
      assert.match(String(refused[0].content), /messaging is not enabled yet/);
    });
  } finally {
    prisma.agent.findUnique = originalFind;
    prisma.dryRunLog.create = originalLog;
  }

  let saved: { apiKey: string; status: string; expiresAt: Date | null } | null = null;
  const callsSeen: Array<{ name: string; args: Record<string, unknown> }> = [];
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
  // Mirrors GoHighLevel's flattened parameter names, plus messaging tools that must never be offered.
  const publishedTools = [
    { name: "locations_get-location", inputSchema: { type: "object", properties: { path_locationId: { type: "string" } } } },
    { name: "payments_list-transactions", inputSchema: { type: "object", properties: { query_altId: { type: "string" }, query_altType: { type: "string" } } } },
    { name: "contacts_get-contact", inputSchema: { type: "object", properties: { path_contactId: { type: "string" } } } },
    { name: "conversations_get-messages", inputSchema: { type: "object", properties: { path_conversationId: { type: "string" } } } },
    { name: "conversations_send-a-new-message", inputSchema: { type: "object", properties: { body_contactId: { type: "string" }, body_message: { type: "string" } } } },
  ];
  app.all("/mcp", (req, res) => {
    if (req.method !== "POST") { res.sendStatus(405); return; }
    headersSeen.push(String(req.headers.authorization));
    if (req.headers.authorization !== `Bearer ${credential.pit}` || req.headers.locationid !== credential.locationId) { res.sendStatus(403); return; }
    const { id, method, params } = req.body;
    if (id === undefined) { res.sendStatus(202); return; }
    let result: unknown = {};
    if (method === "initialize") result = { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake-highlevel", version: "1" } };
    if (method === "tools/list") result = { tools: publishedTools };
    if (method === "tools/call") {
      callsSeen.push({ name: params.name, args: params.arguments ?? {} });
      // Echo the location the call was bound to, so a binding failure fails the probe.
      const payload = params.name === "locations_get-location" ? { location: { id: params.arguments?.path_locationId ?? "unbound", name: "Synthetic" } } : { ok: true };
      result = { content: [{ type: "text", text: JSON.stringify(payload) }] };
    }
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
      assert.equal(callsSeen.length, 1);
      assert(saved);
      assert(!saved.apiKey.includes(credential.pit));
      assert.equal(decrypt(saved.apiKey), serialized);
    });
    check("probe discovers the location parameter from the schema and counts only offered tools", () => {
      assert.deepEqual(callsSeen[0], { name: "locations_get-location", args: { path_locationId: credential.locationId } });
      assert.equal((JSON.parse(text) as { toolCount: number }).toolCount, publishedTools.length - 1);
    });
    assert.equal((await post({ action: "test" })).status, 200);
    const before = saved;
    assert.equal((await post({ action: "connect", credential: { ...credential, locationId: "location-two" } })).status, 422);
    check("failed replacement leaves working credentials intact", () => assert.equal(saved, before));
    const manager = new MCPClientManager();
    await manager.connect({ server: MCP_SERVERS.highlevel, credential: serialized });
    const crossLocation = await manager.callTool("highlevel", serialized, "locations_get-location", { locationId: "location-two", path_locationId: "location-two" });
    const altId = await manager.callTool("highlevel", serialized, "payments_list-transactions", { query_altId: "location-two", query_altType: "location" });
    await manager.disconnectAll();
    check("runtime calls are rebound to the configured location, including query_altId", () => {
      assert(crossLocation.success && altId.success);
      assert.deepEqual(callsSeen.at(-2), { name: "locations_get-location", args: { path_locationId: credential.locationId } });
      assert.deepEqual(callsSeen.at(-1), { name: "payments_list-transactions", args: { query_altId: credential.locationId, query_altType: "location" } });
    });
    assert.equal((await post({ action: "disconnect" })).status, 200);
    const status = await (await post({ action: "status" })).json() as { connected: boolean };
    check("disconnected credential unavailable", () => { assert.equal(saved, null); assert.equal(status.connected, false); });
  } finally {
    MCP_SERVERS.highlevel = original;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  console.log(`${passed} checks passed`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
