import assert from "node:assert/strict";
import { signWorkspaceRequest } from "../../shared/workspace/auth.js";
import {
  getConnectedAccounts,
  disconnectConnection,
} from "../../shared/mcp/composio.js";
async function main() {
  const body = JSON.stringify({ slug: "gmail" }),
    path = "/workspace/connect",
    client = "workspace-qa-client";
  const r = await fetch("http://localhost:4311" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer " +
        signWorkspaceRequest(client, client + "-agent", "POST", path, body),
    },
    body,
  });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  const url = new URL(data.redirectUrl);
  assert.equal(url.protocol, "https:");
  assert(url.hostname.endsWith("composio.dev"));
  console.log(
    "Gmail OAuth link created through the portal API with the correct provider; no account login or email sent.",
  );
  const connections = await getConnectedAccounts(client);
  for (const c of connections) {
    if (c.appName === "gmail" && c.status !== "ACTIVE")
      await disconnectConnection(c.id);
  }
  console.log("Pending test connection removed.");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
