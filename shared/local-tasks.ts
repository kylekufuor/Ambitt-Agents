import crypto from "crypto";
import prisma from "./db.js";
import logger from "./logger.js";
import { signDeviceToken } from "./device-token.js";

// ---------------------------------------------------------------------------
// Local Tasks — the on-device execution queue
// ---------------------------------------------------------------------------
// The platform enqueues a LocalTask; the client's paired device (v1: the
// "Ambitt Agents" Chrome extension) polls, shows the client an allow prompt,
// drives the client's own logged-in browser, and posts the result back. This
// module owns the pairing handshake and the task lifecycle. Endpoints in
// oracle/index.ts are thin wrappers over these helpers.
// ---------------------------------------------------------------------------

export const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 min to type the code
export const DEVICE_ONLINE_MS = 30 * 1000; // "online" if seen within 30s
export const DEFAULT_TASK_TTL_MS = 10 * 60 * 1000; // task auto-cancels after 10 min

// Unambiguous alphabet (no 0/O/1/I) for a code a human types off-screen.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(len = 8): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// --- Pairing --------------------------------------------------------------

/**
 * Portal (Supabase-authed, per client) requests a pairing code. Creates a
 * pending ClientDevice carrying a short code the client types into the
 * extension. Clears the client's stale pending rows first so they don't pile
 * up. Returns the code + how long it's valid.
 */
export async function generatePairingCode(
  clientId: string
): Promise<{ code: string; deviceId: string; expiresAt: Date }> {
  await prisma.clientDevice.deleteMany({
    where: { clientId, status: "pending" },
  });

  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  // Retry on the rare unique-code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    try {
      const device = await prisma.clientDevice.create({
        data: { clientId, status: "pending", pairingCode: code, pairingExpiresAt: expiresAt },
        select: { id: true },
      });
      return { code, deviceId: device.id, expiresAt };
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("Could not allocate a pairing code");
}

/**
 * Extension exchanges a pairing code for a device token. Validates the code is
 * pending + unexpired, flips the device to active, and returns a signed token
 * the extension stores and sends on every subsequent request.
 */
export async function pairDevice(
  code: string,
  opts: { label?: string; platform?: string } = {}
): Promise<{ deviceToken: string; deviceId: string; clientId: string } | null> {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!normalized) return null;

  const device = await prisma.clientDevice.findUnique({
    where: { pairingCode: normalized },
    select: { id: true, clientId: true, status: true, pairingExpiresAt: true },
  });
  if (!device || device.status !== "pending") return null;
  if (!device.pairingExpiresAt || device.pairingExpiresAt.getTime() < Date.now()) return null;

  await prisma.clientDevice.update({
    where: { id: device.id },
    data: {
      status: "active",
      label: opts.label?.slice(0, 120) ?? null,
      platform: opts.platform?.slice(0, 60) ?? "chrome-extension",
      pairingCode: null,
      pairingExpiresAt: null,
      pairedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  return { deviceToken: signDeviceToken(device.id), deviceId: device.id, clientId: device.clientId };
}

/** Load an active (non-revoked) device by id — the per-request revocation check. */
export async function loadActiveDevice(deviceId: string) {
  const device = await prisma.clientDevice.findUnique({
    where: { id: deviceId },
    select: { id: true, clientId: true, status: true, revokedAt: true, label: true },
  });
  if (!device || device.status !== "active" || device.revokedAt) return null;
  return device;
}

/** The client's currently-online device (seen within the online window), if any. */
export async function getOnlineDevice(clientId: string) {
  const since = new Date(Date.now() - DEVICE_ONLINE_MS);
  return prisma.clientDevice.findFirst({
    where: { clientId, status: "active", revokedAt: null, lastSeenAt: { gte: since } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, label: true, lastSeenAt: true },
  });
}

// --- Task lifecycle -------------------------------------------------------

export interface EnqueueLocalTaskInput {
  clientId: string;
  agentId: string;
  goal: string;
  startingUrl?: string;
  allowPromptText?: string;
  kind?: string;
  ttlMs?: number;
}

/** Platform enqueues a browse task for the client's device to run. */
export async function enqueueLocalTask(input: EnqueueLocalTaskInput) {
  return prisma.localTask.create({
    data: {
      clientId: input.clientId,
      agentId: input.agentId,
      kind: input.kind ?? "browse",
      goal: input.goal,
      startingUrl: input.startingUrl ?? null,
      allowPromptText: input.allowPromptText ?? null,
      status: "pending",
      expiresAt: new Date(Date.now() + (input.ttlMs ?? DEFAULT_TASK_TTL_MS)),
    },
  });
}

/**
 * A device polls for work. Heartbeats lastSeenAt, expires stale tasks, then
 * atomically claims the oldest pending task for this device's client (compare-
 * and-swap so two polls can't grab the same one). Returns the claimed task or
 * null.
 */
export async function claimNextTask(deviceId: string, clientId: string) {
  await prisma.clientDevice.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });

  // Sweep anything past its deadline so a dead device can't hold the queue.
  await prisma.localTask.updateMany({
    where: { clientId, status: { in: ["pending", "claimed", "approved"] }, expiresAt: { lt: new Date() } },
    data: { status: "cancelled", endedAt: new Date(), error: "Timed out waiting for the device." },
  });

  // Re-surface a task this device already claimed (awaiting the allow prompt)
  // OR already approved (the client clicked Allow; the device should run it).
  // The server is the source of truth, so the poll recovers from any lost
  // popup state or killed worker — the device just does what the server says.
  const inFlight = await prisma.localTask.findFirst({
    where: { clientId, deviceId, status: { in: ["claimed", "approved"] } },
    orderBy: { claimedAt: "asc" },
  });
  if (inFlight) return inFlight;

  for (let attempt = 0; attempt < 3; attempt++) {
    const next = await prisma.localTask.findFirst({
      where: { clientId, status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!next) return null;

    const claimed = await prisma.localTask.updateMany({
      where: { id: next.id, status: "pending" },
      data: { status: "claimed", deviceId, claimedAt: new Date() },
    });
    if (claimed.count === 1) {
      return prisma.localTask.findUnique({ where: { id: next.id } });
    }
    // Someone else grabbed it — try the next one.
  }
  return null;
}

/** Device reports the client's allow/deny decision on a claimed task. */
export async function recordAllowDecision(taskId: string, deviceId: string, allowed: boolean) {
  const result = await prisma.localTask.updateMany({
    where: { id: taskId, deviceId, status: "claimed" },
    data: allowed
      ? { status: "approved", approvedAt: new Date(), startedAt: new Date() }
      : { status: "denied", endedAt: new Date() },
  });
  return result.count === 1;
}

/** Device posts the final outcome of a task it was driving. */
export async function completeTask(
  taskId: string,
  deviceId: string,
  outcome: { status: "succeeded" | "failed"; result?: string; error?: string; transcript?: unknown }
) {
  const result = await prisma.localTask.updateMany({
    where: { id: taskId, deviceId, status: { in: ["approved", "claimed"] } },
    data: {
      status: outcome.status,
      result: outcome.result?.slice(0, 100_000) ?? null,
      error: outcome.error?.slice(0, 2000) ?? null,
      transcript: (outcome.transcript ?? undefined) as never,
      endedAt: new Date(),
    },
  });
  return result.count === 1;
}

/**
 * Platform-side await: poll a task until it reaches a terminal state or the
 * timeout elapses. Phase 2's browse tool uses this after enqueueing.
 */
export async function waitForLocalTask(taskId: string, timeoutMs = DEFAULT_TASK_TTL_MS) {
  const deadline = Date.now() + timeoutMs;
  const terminal = new Set(["succeeded", "failed", "denied", "cancelled"]);
  while (Date.now() < deadline) {
    const task = await prisma.localTask.findUnique({ where: { id: taskId } });
    if (!task) return null;
    if (terminal.has(task.status)) return task;
    await new Promise((r) => setTimeout(r, 1500));
  }
  // Best-effort cancel so a stuck task doesn't linger as "approved".
  await prisma.localTask.updateMany({
    where: { id: taskId, status: { in: ["pending", "claimed", "approved"] } },
    data: { status: "cancelled", endedAt: new Date(), error: "Platform wait timed out." },
  });
  logger.warn("waitForLocalTask timed out", { taskId, timeoutMs });
  return prisma.localTask.findUnique({ where: { id: taskId } });
}
