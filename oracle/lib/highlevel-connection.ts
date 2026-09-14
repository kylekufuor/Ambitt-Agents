import { Router } from "express";
import prisma from "../../shared/db.js";
import { encrypt, decrypt } from "../../shared/encryption.js";
import logger from "../../shared/logger.js";
import { verifyToolConnection } from "../../shared/tool-connection-auth.js";
import { MCPClientManager } from "../../shared/mcp/client.js";
import { MCP_SERVERS } from "../../shared/mcp/registry.js";
import { HIGHLEVEL_ID, parseHighLevelCredential, highLevelLocationParameter, withoutHighLevelMessaging } from "../../shared/mcp/highlevel.js";

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

// The portal route gives up at 45 s; the probe (initialize, tools/list, one
// call) shares a single deadline inside that.
const PROBE_TIMEOUT_MS = 30_000;

// True when the tool result carries an object whose id is the configured
// location. GoHighLevel returns { location: { id, name, ... } }; the walk
// tolerates a flatter shape and ignores anything that is not JSON.
function returnsLocation(content: unknown[], locationId: string): boolean {
  const holds = (value: unknown, depth: number): boolean => {
    if (!value || typeof value !== "object" || depth > 4) return false;
    if (Array.isArray(value)) return value.some((item) => holds(item, depth + 1));
    const record = value as Record<string, unknown>;
    if ([record.id, record._id, record.locationId].includes(locationId)) return true;
    return Object.values(record).some((item) => holds(item, depth + 1));
  };
  return content.some((block) => {
    try { return holds(JSON.parse((block as { text?: string }).text ?? "null"), 0); }
    catch { return false; }
  });
}

// A separate manager for a one-shot probe: testing/replacing a token must not
// close an active runtime connection. Read the location to prove data access;
// tools/list alone can be served before a provider checks the selected tenant.
export async function probeHighLevel(credential: string): Promise<number> {
  const manager = new MCPClientManager();
  const { locationId } = parseHighLevelCredential(credential);
  const options = { timeout: PROBE_TIMEOUT_MS, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) };
  try {
    await manager.connect({ server: MCP_SERVERS.highlevel, credential }, options);
    const tools = await manager.listTools(HIGHLEVEL_ID, credential);
    const locationTool = tools.find((tool) => tool.name === "locations_get-location");
    if (!locationTool) throw new Error("Missing location access");
    // The discovered schema names the parameter (path_locationId today);
    // callTool overwrites it with the configured location either way.
    const parameter = highLevelLocationParameter(locationTool.inputSchema) ?? "locationId";
    const result = await manager.callTool(HIGHLEVEL_ID, credential, "locations_get-location", { [parameter]: locationId }, options);
    if (!result.success) throw new Error("Location access failed");
    if (!returnsLocation(result.content, locationId)) throw new Error("Location not verified");
    // Count what the agent will actually be offered (messaging tools are withheld).
    return withoutHighLevelMessaging(tools).length;
  } finally {
    await manager.disconnectAll();
  }
}

// Probe failures are logged by category only. Our own messages are static, and
// the token pattern is scrubbed anyway; a vendor body is never included.
function probeReason(error: unknown): string {
  return (error instanceof Error ? error.message : "unknown").replace(/pit-[A-Za-z0-9_-]+/g, "pit-[redacted]").slice(0, 120);
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
      catch (error) {
        logger.warn("GoHighLevel probe failed", { agentId, action, status: 422, reason: probeReason(error) });
        res.status(422).json({ error: "We couldn't verify GoHighLevel access. Check the token and Location ID, and include View Locations in its permissions." });
        return;
      }
      if (action === "connect") await deps.store.save(clientId, agentId, encrypt(serialized));
      res.json({ connected: action === "connect" || !!saved, verified: true, locationId: credential.locationId, token: "••••••••", toolCount });
    } catch {
      // Never return/log vendor payloads or errors containing submitted secrets.
      logger.warn("GoHighLevel connection request failed", { agentId, action: String(req.body?.action ?? ""), status: 500 });
      res.status(500).json({ error: "We couldn't update your GoHighLevel connection. Try again shortly." });
    }
  });
  return router;
}
