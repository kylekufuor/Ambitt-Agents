import test from "node:test";
import assert from "node:assert/strict";
import { signWorkspaceRequest, verifyWorkspaceRequest } from "./auth.js";
import { publicAddress, safeLocation, watchDelta } from "./safety.js";
process.env.CHAT_TOKEN_SECRET = "workspace-unit-test-only";
test("workspace signatures bind body, method, path and tenant", () => {
  const token = signWorkspaceRequest(
    "client-a",
    "agent-a",
    "POST",
    "/workspace/turns",
    '{"message":"hello"}',
  );
  assert.deepEqual(
    verifyWorkspaceRequest(
      token,
      "POST",
      "/workspace/turns",
      '{"message":"hello"}',
    ),
    { clientId: "client-a", agentId: "agent-a" },
  );
  assert.throws(() =>
    verifyWorkspaceRequest(
      token,
      "GET",
      "/workspace/turns",
      '{"message":"hello"}',
    ),
  );
  assert.throws(() =>
    verifyWorkspaceRequest(
      token,
      "POST",
      "/workspace/tools",
      '{"message":"hello"}',
    ),
  );
  assert.throws(() =>
    verifyWorkspaceRequest(
      token,
      "POST",
      "/workspace/turns",
      '{"message":"send"}',
    ),
  );
  assert.throws(() =>
    verifyWorkspaceRequest(
      token + "x",
      "POST",
      "/workspace/turns",
      '{"message":"hello"}',
    ),
  );
});
test("private addresses and mapped IPv6 are blocked", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "172.16.1.2",
    "192.168.0.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
    "fe80::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  for (const ip of ["93.184.215.14", "8.8.8.8", "2606:4700::1111"])
    assert.equal(publicAddress(ip), true, ip);
});
test("watching cannot accrue during a missing lease or beyond observed time", () => {
  const before = new Date(1000);
  assert.equal(watchDelta(before, new Date(4100), 3100, true), 3100);
  assert.equal(watchDelta(before, new Date(4100), 500, true), 500);
  assert.equal(watchDelta(before, new Date(9100), 8000, true), 0);
  assert.equal(watchDelta(before, new Date(4100), 3100, false), 0);
  assert.equal(watchDelta(before, new Date(4100), Number.NaN, true), 0);
  assert.equal(watchDelta(null, new Date(4100), 3100, true), 0);
});
test("persisted URLs strip OAuth codes, fragments, and credentials", () => {
  assert.equal(
    safeLocation("https://name:secret@example.com/path?code=secret#token"),
    "https://example.com/path",
  );
});
