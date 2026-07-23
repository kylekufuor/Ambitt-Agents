import prisma from "./db.js";
import logger from "./logger.js";
import { parseCommunicationSettings } from "./communication-settings.js";
import { resolveSeatbeltConfig, SEATBELT_DEFAULTS } from "./seatbelts.js";

// ---------------------------------------------------------------------------
// MFA relay — shared 2FA-code relay state + channel logic (SMS-first → email).
//
// Two request paths feed this module, both running in the ONE Oracle process:
//   worker  — Remote Hands `need-2fa` (oracle/index.ts): the worker polls
//             `2fa-code` for the captured code (consumed on read).
//   runtime — the engine's `request_2fa_code` tool (shared/runtime/engine.ts):
//             the run pauses; code capture resumes it via processInboundMessage
//             (dispatched by the /webhooks/sms handler, not here).
//
// Capture/pending state is in-memory and NOT durable by design — an Oracle
// restart mid-MFA means the worker re-requests (matches the pre-existing design
// in oracle/index.ts). If Oracle ever goes multi-replica (Kubernetes), these
// maps move to Redis/DB behind the same function signatures.
//
// The runaway CAP, by contrast, IS durable: it counts SmsSend audit rows in the
// last rolling hour (smsCapExceededDurable) and, when exceeded, blocks the send
// and system-pauses the agent — parity with the EmailSend-backed outbound
// seatbelt. A restart cannot reset a runaway back under the cap.
//
// The channel chain is exactly two: SMS first, email fallback. WhatsApp is out
// of the relay entirely (Kyle, 2026-07-23). Codes are consumed on read, never
// persisted beyond TTL, never logged.
// ---------------------------------------------------------------------------

// Hold the 2FA request/code 15 min — email fallback (Gmail → Resend) can lag
// several minutes, and a person on a call needs room. Env-overridable
// (MFA_TTL_MS) so QA can test expiry without waiting 15 minutes.
export const MFA_TTL_MS = (() => {
  const raw = Number(process.env.MFA_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 15 * 60 * 1000;
})();

// Don't re-send while a pending request for the same client is under 2 min old.
const THROTTLE_MS = 2 * 60 * 1000;
// Hard cap: relay SMS per client per hour. The LIVE authority is now the
// durable SmsSend-row count (smsCapExceededDurable) — over the cap the send is
// blocked and the agent is system-paused, at parity with the email seatbelt.
// The per-agent effective cap is resolved through resolveSeatbeltConfig (so
// safety-sensitivity + per-agent overrides scale it); this constant is only the
// default fallback, kept in sync with the seatbelt source of truth.
const SMS_HOURLY_CAP = SEATBELT_DEFAULTS.smsHourlyMax;
const HOUR_MS = 60 * 60 * 1000;

// Normalize any phone shape ("+1 (817) 809-7106", "whatsapp:+18178097106") to
// its last 10 digits — the key for matching an inbound reply to its request.
export const phoneKey = (s: string): string =>
  (s || "").replace(/\D/g, "").slice(-10);

export type PendingOrigin = "worker" | "engine";

// clientId → the worker task waiting on a code (guards the email-capture
// branch in /webhooks/email-inbound). Worker origin only.
const pending2fa = new Map<string, { taskId: string; at: number }>();
// clientId → captured code awaiting the worker's `2fa-code` poll.
const codes2fa = new Map<string, { code: string; at: number }>();
// last-10-digits → the pending request an inbound text answers. `nudged`
// tracks the one-per-request "text back just the digits" reply.
const pending2faByPhone = new Map<
  string,
  { clientId: string; agentId?: string; origin: PendingOrigin; nudged: boolean; at: number }
>();
// clientId → last successful relay (throttle window).
const lastRelay = new Map<string, { channel: "sms" | "email"; at: number }>();
// clientId currently mid-relay. Reserved synchronously at entry (before any
// await) so two interleaved relay calls for the same client can't both pass the
// throttle+cap checks and double-send (Finding #2). Released in a finally.
const inFlight = new Set<string>();
// clientId → real SMS send timestamps inside the rolling hour (in-memory cap
// counter). RETAINED for the unit suite + as the documented Redis/multi-replica
// migration seam; superseded as the LIVE authority by the durable SmsSend-row
// count (smsCapExceededDurable). Not on the production hot path.
const smsSends = new Map<string, number[]>();
// clientId → last cap-alert time (once-per-hour operator-alert dedupe). Shared
// by the in-memory smsCapExceeded and the durable cap path.
const capAlertedAt = new Map<string, number>();

/**
 * Pull a 4-8 digit verification code out of a reply. Works on SMS bodies and
 * email replies (quoted history stripped first — harmless on SMS). Also
 * normalizes the common vendor pair format "123-456" / "123 456" → "123456",
 * which the plain \d{4,8} match can't see (neither 3-digit group qualifies).
 */
export function extractMfaCode(text: string): string | null {
  if (!text) return null;
  const top = text.split(/^\s*>|-{3,}\s*Original|On .* wrote:/m)[0].slice(0, 400);
  const direct = top.match(/\b(\d{4,8})\b/);
  if (direct) return direct[1];
  const pair = top.match(/\b(\d{3})[-\s](\d{3})\b/);
  if (pair) return pair[1] + pair[2];
  return null;
}

/** Arm the email-capture guard for a worker task (fresh request invalidates any stale unconsumed code). */
export function registerPendingByClient(clientId: string, taskId: string, at = Date.now()): void {
  pending2fa.set(clientId, { taskId, at });
  codes2fa.delete(clientId);
}

/** Register an outbound SMS ask so the inbound reply can be matched by sender phone. */
export function registerPendingByPhone(
  phone: string,
  entry: { clientId: string; agentId?: string; origin: PendingOrigin },
  at = Date.now()
): void {
  pending2faByPhone.set(phoneKey(phone), { ...entry, nudged: false, at });
}

export type PhoneCapture =
  | { kind: "captured"; clientId: string; agentId?: string; origin: PendingOrigin; code: string }
  // A pending request exists but the reply had no digits. `nudge` is true
  // exactly once per pending request — the caller sends the nudge copy, then
  // subsequent garbage gets silence (no loops with autoresponders).
  | { kind: "no_code"; nudge: boolean }
  // Unknown sender or expired pending — caller answers with empty TwiML.
  | { kind: "no_match" };

/**
 * Match an inbound text to a pending request and extract the code. On capture:
 * worker-origin codes land in the poll map; both origins sweep their sibling
 * pendings so a late reply on the other channel isn't re-captured.
 */
export function capturePhoneCode(from: string, body: string, now = Date.now()): PhoneCapture {
  const key = phoneKey(from);
  const pend = key ? pending2faByPhone.get(key) : undefined;
  if (!pend) return { kind: "no_match" };
  if (now - pend.at >= MFA_TTL_MS) {
    pending2faByPhone.delete(key);
    return { kind: "no_match" };
  }
  const code = extractMfaCode(body);
  if (!code) {
    const nudge = !pend.nudged;
    pend.nudged = true;
    return { kind: "no_code", nudge };
  }
  if (pend.origin === "worker") codes2fa.set(pend.clientId, { code, at: now });
  pending2faByPhone.delete(key);
  pending2fa.delete(pend.clientId);
  return { kind: "captured", clientId: pend.clientId, agentId: pend.agentId, origin: pend.origin, code };
}

/**
 * The email-reply capture (worker origin only — guarded by pending2fa, so a
 * normal client reply never reaches the code path). On capture, sweeps any
 * phone pendings for this client (the SMS ask is answered).
 */
export function captureEmailCode(clientId: string, emailText: string, now = Date.now()): { matched: boolean; code?: string } {
  const pending = pending2fa.get(clientId);
  if (!pending || now - pending.at >= MFA_TTL_MS) return { matched: false };
  const code = extractMfaCode(emailText || "");
  if (!code) return { matched: false };
  codes2fa.set(clientId, { code, at: now });
  pending2fa.delete(clientId);
  for (const [k, v] of pending2faByPhone) {
    if (v.clientId === clientId) pending2faByPhone.delete(k);
  }
  return { matched: true, code };
}

/** Worker poll: consumed on read, null after TTL. */
export function takeCode(clientId: string, now = Date.now()): string | null {
  const entry = codes2fa.get(clientId);
  if (entry && now - entry.at < MFA_TTL_MS) {
    codes2fa.delete(clientId);
    return entry.code;
  }
  return null;
}

/**
 * Throttle check: a relay under 2 min old whose request is still unanswered →
 * don't re-send. Once the code is captured the pendings are swept, so a fresh
 * request (e.g. worker retry after a rejected code) sends normally.
 */
export function relayThrottled(clientId: string, now = Date.now()): { channel: "sms" | "email" } | null {
  const last = lastRelay.get(clientId);
  if (!last || now - last.at >= THROTTLE_MS) return null;
  const byClient = pending2fa.get(clientId);
  const clientPending = !!byClient && now - byClient.at < MFA_TTL_MS;
  let phonePending = false;
  for (const v of pending2faByPhone.values()) {
    if (v.clientId === clientId && now - v.at < MFA_TTL_MS) {
      phonePending = true;
      break;
    }
  }
  if (!clientPending && !phonePending) return null;
  return { channel: last.channel };
}

/**
 * Operator-alert dedupe: return true at most once per hour for a given client,
 * recording the alert time on a true. Shared by the in-memory smsCapExceeded and
 * the durable cap path so a runaway loop can't spam the operator.
 */
function markCapAlert(clientId: string, now = Date.now()): boolean {
  const alerted = capAlertedAt.get(clientId);
  const should = !alerted || now - alerted >= HOUR_MS;
  if (should) capAlertedAt.set(clientId, now);
  return should;
}

/**
 * In-memory rolling-hour SMS cap. RETAINED for unit coverage + as the
 * documented multi-replica migration seam; the LIVE authority is the durable
 * smsCapExceededDurable below. `alertOperator` is true at most once per window.
 */
export function smsCapExceeded(clientId: string, now = Date.now()): { exceeded: boolean; alertOperator: boolean } {
  const sends = (smsSends.get(clientId) ?? []).filter((t) => now - t < HOUR_MS);
  smsSends.set(clientId, sends);
  if (sends.length < SMS_HOURLY_CAP) return { exceeded: false, alertOperator: false };
  return { exceeded: true, alertOperator: markCapAlert(clientId, now) };
}

export function recordSmsSend(clientId: string, now = Date.now()): void {
  const sends = smsSends.get(clientId) ?? [];
  sends.push(now);
  smsSends.set(clientId, sends);
}

/** Minimal structural DB surface the durable cap needs (real PrismaClient satisfies it). */
export interface RelaySmsDb {
  smsSend: { count(args: { where: any }): Promise<number> };
}

/**
 * DURABLE runaway cap — the live authority. Counts real SmsSend audit rows for
 * this client in the last rolling hour; at/over `cap`, the caller blocks the
 * send and system-pauses the agent (parity with the EmailSend-backed seatbelt).
 * Dry-run agents write no SmsSend rows, so they never accumulate toward the cap.
 * Counts every SMS kind for the client (stricter than 2FA-only): a runaway is a
 * runaway regardless of message kind.
 */
export async function smsCapExceededDurable(
  db: RelaySmsDb,
  clientId: string,
  cap: number,
  now = Date.now()
): Promise<boolean> {
  const count = await db.smsSend.count({
    where: { clientId, createdAt: { gte: new Date(now - HOUR_MS) } },
  });
  return count >= cap;
}

export interface RelayMfaInput {
  clientId: string;
  agentId: string;
  service: string;
  mode: "worker" | "runtime";
  // Worker mode: the LocalTask id, stored on the email-capture guard entry.
  taskId?: string;
  // Runtime mode: the model's stated reason, folded into the email fallback body.
  reason?: string;
}

export interface RelayMfaResult {
  channel: "sms" | "email" | "none";
  throttled?: boolean;
  // True when the SMS cap tripped: nothing was sent, no email fallback was
  // tried, and the agent was system-paused (runaway stop). Distinct from a
  // plain "none" (both channels failed / none on file).
  halted?: boolean;
}

// ---------------------------------------------------------------------------
// Injectable dependencies — the send/halt/alert side-effects live behind this
// bag so the composed relay path can be unit-tested with fakes. In production
// `defaultRelayDeps()` wires the real implementations; the dynamic imports are
// preserved (they keep shared/ from statically depending on oracle/ and defer
// the twilio/resend loads).
// ---------------------------------------------------------------------------

// Structural DB surface the relay needs. The real PrismaClient satisfies it.
export interface RelayDb {
  agent: {
    findUnique(args: { where: { id: string }; select: any }): Promise<{
      name: string;
      agentType: string | null;
      dryRun: boolean;
      communicationSettings: unknown;
      safetySensitivity: string | null;
      client: { email: string | null; whatsappNumber: string | null; businessName: string | null } | null;
    } | null>;
  };
  dryRunLog: { create(args: { data: any }): Promise<unknown> };
  smsSend: {
    count(args: { where: any }): Promise<number>;
    create(args: { data: any }): Promise<unknown>;
  };
}

export interface WorkerEmailArgs {
  agentId: string;
  agentName: string;
  to: string;
  service: string;
}

export interface RuntimeEmailArgs {
  agentId: string;
  agentName: string;
  agentRole: string;
  to: string;
  clientBusinessName: string;
  clientId: string;
  service: string;
  reason?: string;
}

export interface RelayDeps {
  db: RelayDb;
  smsConfigured: () => boolean | Promise<boolean>;
  sendSms: (opts: { to: string; message: string }) => Promise<unknown>;
  haltAgent: (args: { agentId: string; by: "system"; reason: string }) => Promise<unknown>;
  alertOperator: (message: string) => Promise<unknown>;
  sendWorkerEmail: (args: WorkerEmailArgs) => Promise<unknown>;
  sendRuntimeEmail: (args: RuntimeEmailArgs) => Promise<unknown>;
}

/** Production wiring for RelayDeps. Preserves the original dynamic imports. */
export function defaultRelayDeps(): RelayDeps {
  return {
    // RelayDb is a faithful structural subset of PrismaClient; the cast is the
    // real-wiring boundary (prisma's generic findUnique return doesn't unify
    // with the narrow row type in assignment position). Usage inside
    // relayMfaRequest stays checked against RelayDb.
    db: prisma as unknown as RelayDb,
    smsConfigured: async () => (await import("./sms.js")).smsConfigured(),
    sendSms: async (opts) => (await import("./sms.js")).sendSms(opts),
    haltAgent: async (args) => {
      const { haltAgent } = await import("../oracle/lib/pause-control.js");
      return haltAgent(prisma, args);
    },
    alertOperator: async (message) => {
      const { sendKyleWhatsApp } = await import("./whatsapp.js");
      return sendKyleWhatsApp(message);
    },
    sendWorkerEmail: async ({ agentId, agentName, to, service }) => {
      const { sendEmail } = await import("./email.js");
      return sendEmail({
        agentId,
        agentName,
        to,
        subject: `${agentName} — verification code for ${service}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:24px;font-size:15px;color:#26332f;line-height:1.6;">
        <p>${service} just sent you a one-time verification code so I can finish logging in on your behalf.</p>
        <p><strong>Reply to this email with the code</strong> (just the digits) and I'll continue right away.</p>
        <p style="color:#9aa8a4;font-size:13px;">The code is used once and never stored. ${agentName}, your agent at Ambitt</p>
      </div>`,
        replyToAgentId: agentId,
      });
    },
    sendRuntimeEmail: async ({ agentId, agentName, agentRole, to, clientBusinessName, clientId, service, reason }) => {
      // Runtime mode: the paused run resumes when the client's email reply flows
      // through the normal inbound path. Routed through sendAgentEmail so the
      // outbound seatbelt + dry-run intercept apply downstream in the router.
      const { sendAgentEmail } = await import("../oracle/lib/emailRouter.js");
      const why = reason?.trim() ? `${reason.trim()} ` : "";
      const responseBody = `${why}${service} just sent you a one-time verification code so I can finish logging in on your behalf.\n\nPlease reply to this email with the code (just the digits) and I'll continue right away. The code is only used once and is never stored.`;
      return sendAgentEmail({
        trigger: "agent-response",
        to,
        agentId,
        agentName,
        agentRole,
        clientBusinessName,
        clientId,
        responseBody,
        toolsUsed: [],
      });
    },
  };
}

/**
 * Single entry point for both 2FA-request paths. Picks the channel
 * (SMS-first platform default; an explicit `mfaRelay: platform_email`
 * preference wins — email first, SMS second; legacy `platform_whatsapp` is
 * treated as unset), sends the ask, and registers the capture pendings.
 * Dry-run agents capture to DryRunLog (kind "sms") instead of sending — the
 * email fallback keeps its own intercept downstream in sendEmail. On total
 * failure ("none") the operator is alerted — never silent.
 *
 * Runaway protection (parity with the email seatbelt): before a real SMS send,
 * the DURABLE per-client hourly cap is checked against the SmsSend audit table.
 * Over the cap the send is BLOCKED, the agent is system-paused
 * (haltAgent by:"system"), the operator is alerted, and we return
 * { channel:"none", halted:true } — we do NOT silently fall back to email and
 * let a loop keep running. The cap scales with per-agent safety-sensitivity +
 * overrides via resolveSeatbeltConfig.
 *
 * Concurrency (Finding #2): a per-client in-flight reservation is taken
 * synchronously at entry, before any await, so two interleaved calls can't both
 * pass the throttle+cap checks and double-send. Released in a finally.
 *
 * Side-effects (send / halt / alert / DB) are injected via `deps` so the
 * composed path is unit-testable; production uses defaultRelayDeps().
 *
 * Relay messages are plumbing, not work product: no interactionCount bump,
 * no billing anywhere in this path.
 */
export async function relayMfaRequest(
  input: RelayMfaInput,
  deps: RelayDeps = defaultRelayDeps()
): Promise<RelayMfaResult> {
  const { clientId, agentId, service, mode } = input;
  const now = Date.now();

  const throttled = relayThrottled(clientId, now);
  if (throttled) {
    logger.info("MFA relay throttled — pending request under 2 min old", { clientId, mode });
    return { channel: throttled.channel, throttled: true };
  }

  // Race guard: reserve the client slot synchronously (before any await). A
  // concurrent relay already in flight for this client is collapsed into the
  // in-flight one — report throttled, send nothing.
  if (inFlight.has(clientId)) {
    logger.info("MFA relay: concurrent relay in flight — duplicate skipped", { clientId, mode });
    return { channel: lastRelay.get(clientId)?.channel ?? "sms", throttled: true };
  }
  inFlight.add(clientId);

  try {
    const agent = await deps.db.agent.findUnique({
      where: { id: agentId },
      select: {
        name: true,
        agentType: true,
        dryRun: true,
        communicationSettings: true,
        safetySensitivity: true,
        client: { select: { email: true, whatsappNumber: true, businessName: true } },
      },
    });
    if (!agent) {
      logger.error("MFA relay: agent not found", { agentId, clientId });
      return { channel: "none" };
    }

    const clientEmail = agent.client?.email ?? null;
    // Client.whatsappNumber IS the client's mobile on file (portal-collected);
    // reused as the SMS target for v1 per spec Open Question 1.
    const clientMobile = agent.client?.whatsappNumber ?? null;
    const businessLabel = agent.client?.businessName || clientId;

    // Effective per-client SMS cap: safety-sensitivity + per-agent overrides
    // scale it the same way as the email seatbelt caps (default 6/hr).
    const smsCap = resolveSeatbeltConfig(agent.communicationSettings, agent.safetySensitivity).smsHourlyMax;

    // Worker mode arms the email-capture guard up-front regardless of channel,
    // so an email reply is captured even when the ask went out by SMS.
    if (mode === "worker") registerPendingByClient(clientId, input.taskId ?? "unknown", now);

    const comms = parseCommunicationSettings(agent.communicationSettings);
    const prefersEmail = comms.mfaRelay?.kind === "platform_email";
    const order: ("sms" | "email")[] = prefersEmail ? ["email", "sms"] : ["sms", "email"];

    let channel: "sms" | "email" | "none" = "none";
    for (const ch of order) {
      if (channel !== "none") break;
      if (ch === "sms" && clientMobile) {
        if (!(await deps.smsConfigured())) {
          logger.info("MFA relay: SMS not configured — trying next channel", { clientId });
          continue;
        }
        const message = `${agent.name} here — ${service} just sent you a verification code. Text back just the code and I'll finish signing in.`;
        if (agent.dryRun) {
          // Runtime-identical, nothing leaves: capture the would-be text and
          // still register the pending so the flow can be driven end-to-end.
          // Dry-run writes NO SmsSend row — dry-run agents never accumulate
          // toward the durable cap.
          try {
            await deps.db.dryRunLog.create({
              data: {
                agentId,
                kind: "sms",
                payload: { to: clientMobile, message, service, purpose: "2fa_relay", mode },
              },
            });
            logger.info("Dry-run: 2FA SMS captured (not sent)", { agentId, clientId });
            registerPendingByPhone(
              clientMobile,
              { clientId, agentId, origin: mode === "worker" ? "worker" : "engine" },
              now
            );
            channel = "sms";
          } catch (dryErr) {
            logger.warn("MFA relay: dry-run SMS capture failed, trying next channel", {
              error: dryErr instanceof Error ? dryErr.message : String(dryErr),
              clientId,
            });
          }
          continue;
        }

        // Durable cap = the live authority. Over the cap: BLOCK the send, halt
        // the agent (system pause, operator-only resume), alert once/hour, and
        // do NOT fall back to email — stop the runaway.
        //
        // If the cap COUNT itself throws (SmsSend table not migrated yet on a
        // deploy-order gap, or the DB is briefly unreachable) we can't verify the
        // runaway cap. Fail toward the SAFER channel: skip SMS entirely and let
        // the email fallback (which has its own durable seatbelt) take it —
        // never send un-capped SMS, and never throw the whole relay (the relay's
        // contract is "never throw, always degrade"). Alert the operator once so
        // we're not silent about running blind on the cap.
        let capExceeded: boolean;
        try {
          capExceeded = await smsCapExceededDurable(deps.db, clientId, smsCap, now);
        } catch (capErr) {
          logger.warn("MFA relay: durable SMS cap check failed — degrading to email", {
            clientId,
            agentId,
            error: capErr instanceof Error ? capErr.message : String(capErr),
          });
          if (markCapAlert(clientId, now)) {
            try {
              await deps.alertOperator(
                `⚠️ 2FA relay couldn't verify the SMS rate cap for ${businessLabel} (SmsSend count errored) — degrading to email for ${agent.name}. Check the DB / SmsSend table.`
              );
            } catch (alertErr) {
              logger.warn("MFA relay: cap-check-failed alert failed", {
                error: alertErr instanceof Error ? alertErr.message : String(alertErr),
              });
            }
          }
          continue;
        }
        if (capExceeded) {
          await deps.haltAgent({ agentId, by: "system", reason: "sms 2fa relay rate cap exceeded" });
          logger.warn("MFA relay: durable SMS cap exceeded — send blocked, agent system-paused", {
            clientId,
            agentId,
            smsCap,
          });
          if (markCapAlert(clientId, now)) {
            try {
              await deps.alertOperator(
                `🚨 2FA relay SMS cap hit for ${businessLabel} (${smsCap}/hr). Agent ${agent.name} auto-paused (possible request loop). Resume from the dashboard when it's safe.`
              );
            } catch (alertErr) {
              logger.warn("MFA relay: cap alert failed", {
                error: alertErr instanceof Error ? alertErr.message : String(alertErr),
              });
            }
          }
          return { channel: "none", halted: true };
        }

        try {
          await deps.sendSms({ to: clientMobile, message });
          // Durable audit row = the cap ledger. Best-effort (mirrors EmailSend):
          // the text already went out, so a write hiccup must not fail the send
          // or trigger a resend. Store only the last 4 digits; never the code.
          try {
            await deps.db.smsSend.create({
              data: {
                clientId,
                agentId,
                kind: "sms_2fa",
                status: "sent",
                toLast4: phoneKey(clientMobile).slice(-4) || null,
              },
            });
          } catch (auditErr) {
            logger.warn("SmsSend audit row write failed (continuing)", {
              clientId,
              agentId,
              err: auditErr instanceof Error ? auditErr.message : String(auditErr),
            });
          }
          registerPendingByPhone(
            clientMobile,
            { clientId, agentId, origin: mode === "worker" ? "worker" : "engine" },
            now
          );
          channel = "sms";
        } catch (smsErr) {
          logger.warn("MFA relay: SMS send failed, trying next channel", {
            error: smsErr instanceof Error ? smsErr.message : String(smsErr),
            clientId,
          });
        }
      } else if (ch === "email" && clientEmail) {
        try {
          if (mode === "worker") {
            await deps.sendWorkerEmail({
              agentId,
              agentName: agent.name,
              to: clientEmail,
              service,
            });
          } else {
            await deps.sendRuntimeEmail({
              agentId,
              agentName: agent.name,
              agentRole: agent.agentType ?? "Assistant",
              to: clientEmail,
              clientBusinessName: agent.client?.businessName ?? "",
              clientId,
              service,
              reason: input.reason,
            });
          }
          channel = "email";
        } catch (emailErr) {
          logger.warn("MFA relay: email send failed, trying next channel", {
            error: emailErr instanceof Error ? emailErr.message : String(emailErr),
            clientId,
          });
        }
      }
    }

    if (channel === "none") {
      // Never silent: both channels failed (or none on file) — tell the operator
      // instead of letting the task die quietly. Reaches the operator by email
      // today via the sendKyleWhatsApp fallback.
      const tried = [clientMobile ? "sms" : null, clientEmail ? "email" : null].filter(Boolean).join(" + ") || "no channels on file";
      try {
        await deps.alertOperator(
          `🚨 2FA relay FAILED for ${businessLabel} — could not reach the client on any channel.\nService: ${service}\nAgent: ${agent.name} (${mode} path)\nTried: ${tried}`
        );
      } catch (alertErr) {
        logger.error("MFA relay: operator alert failed", {
          error: alertErr instanceof Error ? alertErr.message : String(alertErr),
          clientId,
        });
      }
    } else {
      lastRelay.set(clientId, { channel, at: now });
      logger.info("2FA request sent", { clientId, agentId, channel, service, mode });
    }

    return { channel };
  } finally {
    inFlight.delete(clientId);
  }
}
