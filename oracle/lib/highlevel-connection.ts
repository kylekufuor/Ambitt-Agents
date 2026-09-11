import { Router } from "express";
import prisma from "../../shared/db.js";
import { encrypt, decrypt } from "../../shared/encryption.js";
import { verifyToolConnection } from "../../shared/tool-connection-auth.js";
import { MCPClientManager } from "../../shared/mcp/client.js";
import { MCP_SERVERS } from "../../shared/mcp/registry.js";
import { HIGHLEVEL_ID, parseHighLevelCredential } from "../../shared/mcp/highlevel.js";

interface StoredCredential { apiKey: string | null; status: string; expiresAt: Date | null }
export interface HighLevelStore {
  ownsAgent(clientId: string, agentId: string): Promise<boolean>;
  enabled(clientId: string, agentId: string): Promise<boolean>;
  read(clientId: string): Promise<StoredCredential | null>;
  save(clientId: string, agentId: string, encrypted: string): Promise<void>;
  revoke(clientId: string): Promise<void>;
}

const store: HighLevelStore = {
  async ownsAgent(clientId, agentId) {
    return !!await prisma.agent.findFirst({ where: { id: agentId, clientId, status: { not: "killed" } }, select: { id: true } });
  },
  async enabled(clientId, agentId) {
    return !!await prisma.agent.findFirst({ where: { id: agentId, clientId, tools: { has: HIGHLEVEL_ID } }, select: { id: true } });
  },
  read: (clientId) => prisma.credential.findUnique({ where: { clientId_toolName: { clientId, toolName: HIGHLEVEL_ID } } }),
  async save(clientId, agentId, apiKey) {
    await prisma.$transaction([
      prisma.credential.upsert({
        where: { clientId_toolName: { clientId, toolName: HIGHLEVEL_ID } },
        create: { clientId, toolName: HIGHLEVEL_ID, apiKey },
        update: { apiKey, status: "active", expiresAt: null, connectedAt: new Date() },
      }),
      prisma.agent.updateMany({ where: { id: agentId, clientId, NOT: { tools: { has: HIGHLEVEL_ID } } }, data: { tools: { push: HIGHLEVEL_ID } } }),
    ]);
  },
  async revoke(clientId) {
    await prisma.credential.updateMany({ where: { clientId, toolName: HIGHLEVEL_ID }, data: { apiKey: null, status: "revoked" } });
  },
};

// A separate manager for a one-shot probe: testing/replacing a token must not
// close an active runtime connection. Read the location to prove data access;
// tools/list alone can be served before a provider checks the selected tenant.
export async function probeHighLevel(credential: string): Promise<number> {
  const manager = new MCPClientManager();
  const { locationId } = parseHighLevelCredential(credential);
  try {
    await manager.connect({ server: MCP_SERVERS.highlevel, credential });
    const tools = await manager.listTools(HIGHLEVEL_ID, credential);
    if (!tools.some((tool) => tool.name === "locations_get-location")) throw new Error("Missing location access");
    const result = await manager.callTool(HIGHLEVEL_ID, credential, "locations_get-location", { locationId });
    if (!result.success) throw new Error("Location access failed");
    const matches = result.content.some((block) => {
      try {
        const text = (block as { text?: string }).text;
        const value = JSON.parse(text ?? "null") as { id?: string; location?: { id?: string } } | null;
        return value?.id === locationId || value?.location?.id === locationId;
      } catch { return false; }
    });
    if (!matches) throw new Error("Location not verified");
    return tools.length;
  } finally {
    await manager.disconnectAll();
  }
}

export function createHighLevelRouter(deps: { store: HighLevelStore; probe: typeof probeHighLevel } = { store, probe: probeHighLevel }): Router {
  const router = Router();
  router.post("/agents/:id/tools/highlevel", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const agentId = String(req.params.id);
    let clientId: string;
    try {
      clientId = verifyToolConnection(req.get("X-Tool-Connection-Auth") ?? "", agentId, req.body);
    } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      if (!await deps.store.ownsAgent(clientId, agentId)) { res.status(403).json({ error: "Forbidden" }); return; }
      const { action, credential: supplied } = req.body ?? {};
      if (!["status", "connect", "test", "disconnect"].includes(action)) { res.status(400).json({ error: "Unknown connection action." }); return; }
      if (action === "disconnect") {
        await deps.store.revoke(clientId);
        res.json({ connected: false, locationId: null, token: null });
        return;
      }
      const existing = await deps.store.read(clientId);
      const active = existing?.status === "active" && existing.apiKey && (!existing.expiresAt || existing.expiresAt > new Date());
      // A new token can repair a malformed/old stored credential.
      const saved = active && (action === "status" || (action === "test" && supplied === undefined))
        ? parseHighLevelCredential(decrypt(existing.apiKey!)) : null;
      if (action === "status") {
        const connected = !!saved && await deps.store.enabled(clientId, agentId);
        res.json({ connected, locationId: saved?.locationId ?? null, token: connected ? "••••••••" : null });
        return;
      }
      let credential;
      try { credential = parseHighLevelCredential(supplied ?? (action === "test" ? saved : null)); }
      catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
      const serialized = JSON.stringify(credential);
      let toolCount: number;
      try { toolCount = await deps.probe(serialized); }
      catch { res.status(422).json({ error: "We couldn't verify GoHighLevel access. Check the token and Location ID, and include View Locations in its permissions." }); return; }
      if (action === "connect") await deps.store.save(clientId, agentId, encrypt(serialized));
      res.json({ connected: action === "connect" || !!saved, verified: true, locationId: credential.locationId, token: "••••••••", toolCount });
    } catch {
      // Never return/log vendor payloads or errors containing submitted secrets.
      res.status(500).json({ error: "We couldn't update your GoHighLevel connection. Try again shortly." });
    }
  });
  return router;
}
