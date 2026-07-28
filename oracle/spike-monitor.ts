// ---------------------------------------------------------------------------
// Fleet spike monitor — the proactive half of the runaway early-warning.
// ---------------------------------------------------------------------------
// Runs on a ~15-min cron. For each active agent it builds volume/cost metrics
// from EmailSend + ApiUsage, runs the pure assessSpike() heuristic, and:
//   - persists spike state on the Agent (drives the dashboard red/amber badge),
//   - on CRITICAL: auto-pauses the agent (system pause → operator-only resume)
//     and WhatsApps Kyle (deduped by a 60-min cooldown + always on escalation),
//   - on WARN: dashboard only (no pause, no page),
//   - clears the flag when the agent settles,
//   - ALWAYS stamps spikeCheckedAt on a successful evaluation (the watchdog
//     heartbeat — see below).
// Complements the inline seatbelt (fast-burst blocker): this catches slower
// floods + cost runaways + gives the operator visibility.
//
// Heartbeat + liveness (2026-07-28)
// ---------------------------------
// The monitor used to touch the Agent row only when a spike was found or
// cleared, so a quiet fleet and a DEAD watchdog looked identical: spikeCheckedAt
// was null everywhere. Two changes fix that:
//   1. spikeCheckedAt is written on EVERY successful check, spiking or not.
//      It therefore means "last successful assessment" — a per-agent failure
//      deliberately leaves the old (stale) timestamp so staleness is real.
//   2. If the check fails for EVERY agent (or the fleet load throws — the
//      2026-07-24 Supabase outage), one operator alert fires, deduped by a
//      6h cooldown so a sustained outage pages once per window, not 4×/hour.
// ---------------------------------------------------------------------------

import prisma from "../shared/db.js";
import logger from "../shared/logger.js";
import { sendKyleWhatsApp } from "../shared/whatsapp.js";
import { assessSpike, spikeConfigForSensitivity, type SpikeMetrics, type SpikeVerdict } from "../shared/spike-detect.js";
import { haltAgent } from "./lib/pause-control.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // don't re-WhatsApp the same critical spike within 60 min
export const MONITOR_DOWN_COOLDOWN_MS = 6 * HOUR; // don't re-page for the same sustained outage

// Counts per day for the last 7 COMPLETED days (excludes today's partial),
// oldest→newest. index 6 = yesterday.
function bucketDaily(times: Date[], nowMs: number): number[] {
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const buckets = new Array(7).fill(0) as number[];
  for (const t of times) {
    const daysAgo = Math.floor((startOfToday.getTime() - t.getTime()) / DAY);
    if (daysAgo >= 0 && daysAgo < 7) buckets[6 - daysAgo] += 1;
  }
  return buckets;
}
function bucketDailyCost(rows: Array<{ createdAt: Date; costInCents: number }>, nowMs: number): number[] {
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const buckets = new Array(7).fill(0) as number[];
  for (const r of rows) {
    const daysAgo = Math.floor((startOfToday.getTime() - r.createdAt.getTime()) / DAY);
    if (daysAgo >= 0 && daysAgo < 7) buckets[6 - daysAgo] += r.costInCents;
  }
  return buckets;
}

// The Agent columns this monitor owns, for one evaluation. PURE — every branch
// carries spikeCheckedAt, which is what makes a stale heartbeat detectable.
// `didAlert` only ever ADDS spikeAlertedAt; it never clears it, so the critical
// cooldown survives a settle→re-spike cycle.
export function buildSpikeUpdate(
  v: SpikeVerdict,
  checkedAt: Date,
  didAlert: boolean,
): {
  spikeSeverity: string | null;
  spikeBadge: string | null;
  spikeReason: string | null;
  spikeCheckedAt: Date;
  spikeAlertedAt?: Date;
} {
  const base = v.spiking
    ? {
        spikeSeverity: v.severity,
        spikeBadge: v.badge,
        spikeReason: v.reasons.join("; ").slice(0, 500),
        spikeCheckedAt: checkedAt,
      }
    : { spikeSeverity: null, spikeBadge: null, spikeReason: null, spikeCheckedAt: checkedAt };
  return didAlert ? { ...base, spikeAlertedAt: checkedAt } : base;
}

// Should we page the operator that the monitor itself is broken? First failure
// always pages; a sustained outage re-pages once per cooldown window.
export function shouldAlertMonitorDown(
  lastAlertAtMs: number | null,
  nowMs: number,
  cooldownMs: number = MONITOR_DOWN_COOLDOWN_MS,
): boolean {
  if (lastAlertAtMs === null) return true;
  return nowMs - lastAlertAtMs >= cooldownMs;
}

// Module-level so the cooldown survives across cron ticks (same process). A
// deploy resets it — an extra page after a restart during an outage is the
// safe side of that trade.
let lastMonitorDownAlertAt: number | null = null;

// One operator page when the watchdog itself is blind. Best-effort throughout:
// during a DB outage the audit row can't be written either, and that must not
// mask the alert.
async function alertMonitorDown(reason: string, nowMs: number): Promise<void> {
  logger.error("Spike monitor is not evaluating agents", { reason });
  if (!shouldAlertMonitorDown(lastMonitorDownAlertAt, nowMs)) return;

  try {
    await sendKyleWhatsApp(
      `🛑 SPIKE MONITOR BLIND — ${reason}\n` +
        `Runaway detection is NOT running: no agent is being watched for volume/cost spikes until this clears.`,
    );
    lastMonitorDownAlertAt = nowMs;
  } catch (e) {
    logger.warn("Spike-monitor-down alert failed to send", { err: e instanceof Error ? e.message : String(e) });
  }

  try {
    await prisma.oracleAction.create({
      data: {
        actionType: "alert_kyle",
        description: `Spike monitor blind — ${reason}`.slice(0, 500),
        status: "failed",
        result: reason.slice(0, 2000),
      },
    });
  } catch {
    /* the DB is the most likely thing that's down — never let this throw */
  }
}

export interface SpikeCheckResult {
  evaluated: number;
  spiking: number;
  alerted: number;
  autoPaused: number;
  failed: number;
}

// Load the fleet, and page the operator if we can't: a monitor that can't even
// list its agents checked nobody this tick.
async function loadActiveFleet(nowMs: number) {
  try {
    return await prisma.agent.findMany({
      where: { status: "active" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        budgetMonthlyCents: true,
        safetySensitivity: true,
        spikeSeverity: true,
        spikeAlertedAt: true,
        client: { select: { businessName: true } },
      },
    });
  } catch (e) {
    await alertMonitorDown(
      `could not load the active fleet: ${e instanceof Error ? e.message : String(e)}`,
      nowMs,
    );
    throw e; // the cron's own catch still logs it
  }
}

export async function checkSpikes(): Promise<SpikeCheckResult> {
  const nowMs = Date.now();
  const agents = await loadActiveFleet(nowMs);

  let spiking = 0;
  let alerted = 0;
  let autoPaused = 0;
  let failed = 0;

  for (const a of agents) {
    try {
      const t1h = new Date(nowMs - HOUR);
      const t24h = new Date(nowMs - DAY);
      const t7d = new Date(nowMs - 7 * DAY);

      const [emails1h, emails24h, emails7d, cost24hAgg, cost7dRows] = await Promise.all([
        prisma.emailSend.count({ where: { agentId: a.id, acceptedAt: { gte: t1h } } }),
        prisma.emailSend.count({ where: { agentId: a.id, acceptedAt: { gte: t24h } } }),
        prisma.emailSend.findMany({ where: { agentId: a.id, acceptedAt: { gte: t7d } }, select: { acceptedAt: true } }),
        prisma.apiUsage.aggregate({ where: { agentId: a.id, isPrimaryRun: true, createdAt: { gte: t24h } }, _sum: { costInCents: true } }),
        prisma.apiUsage.findMany({ where: { agentId: a.id, isPrimaryRun: true, createdAt: { gte: t7d } }, select: { createdAt: true, costInCents: true } }),
      ]);

      const ageHours = (nowMs - a.createdAt.getTime()) / HOUR;
      const metrics: SpikeMetrics = {
        emails1h,
        emails24h,
        dailyEmails7: bucketDaily(emails7d.map((e) => e.acceptedAt), nowMs),
        cost24hCents: cost24hAgg._sum.costInCents ?? 0,
        dailyCost7Cents: bucketDailyCost(cost7dRows, nowMs),
        budgetMonthlyCents: a.budgetMonthlyCents ?? 0,
        established: ageHours >= 72 && emails7d.length >= 20,
      };

      const v = assessSpike(metrics, spikeConfigForSensitivity(a.safetySensitivity));

      const reasonText = v.reasons.join("; ");
      let didAlert = false;

      if (v.spiking) {
        spiking++;

        if (v.severity === "critical") {
          const wasCritical = a.spikeSeverity === "critical";
          const cooled = !a.spikeAlertedAt || nowMs - a.spikeAlertedAt.getTime() >= ALERT_COOLDOWN_MS;
          if (!wasCritical || cooled) {
            try {
              await sendKyleWhatsApp(
                `🚨 SPIKE — ${a.name} (${a.client?.businessName ?? "?"}) auto-paused.\n${reasonText}\nResume from the dashboard once it's safe.`,
              );
              didAlert = true;
              alerted++;
            } catch (e) {
              logger.warn("Spike WhatsApp failed", { agentId: a.id, err: e instanceof Error ? e.message : String(e) });
            }
          }
          try {
            await haltAgent(prisma, { agentId: a.id, by: "system", reason: `spike: ${reasonText}`.slice(0, 300) });
            autoPaused++;
          } catch (e) {
            logger.warn("Spike auto-pause failed", { agentId: a.id, err: e instanceof Error ? e.message : String(e) });
          }
        }
      }

      // ONE write per agent per tick, spiking or not — this is the heartbeat.
      await prisma.agent.update({
        where: { id: a.id },
        data: buildSpikeUpdate(v, new Date(nowMs), didAlert),
      });

      if (v.spiking) {
        logger.warn("Agent spike detected", { agentId: a.id, name: a.name, severity: v.severity, badge: v.badge, autoPaused: v.autoPause });
      }
    } catch (e) {
      // Deliberately NO heartbeat write here: a failed check must leave
      // spikeCheckedAt stale so "we haven't looked at this agent" stays visible.
      failed++;
      logger.warn("Spike check failed for agent", { agentId: a.id, err: e instanceof Error ? e.message : String(e) });
    }
  }

  // Every agent failed → this is an outage, not one bad row. One page per
  // cooldown window. (A partial failure stays a per-agent warn log: the fleet
  // is still being watched, and the stale spikeCheckedAt shows which agent.)
  if (agents.length > 0 && failed === agents.length) {
    await alertMonitorDown(`every agent check failed (${failed}/${agents.length})`, nowMs);
  }

  return { evaluated: agents.length, spiking, alerted, autoPaused, failed };
}
