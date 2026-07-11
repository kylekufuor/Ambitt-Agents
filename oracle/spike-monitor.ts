// ---------------------------------------------------------------------------
// Fleet spike monitor — the proactive half of the runaway early-warning.
// ---------------------------------------------------------------------------
// Runs on a ~15-min cron. For each active agent it builds volume/cost metrics
// from EmailSend + ApiUsage, runs the pure assessSpike() heuristic, and:
//   - persists spike state on the Agent (drives the dashboard red/amber badge),
//   - on CRITICAL: auto-pauses the agent (system pause → operator-only resume)
//     and WhatsApps Kyle (deduped by a 60-min cooldown + always on escalation),
//   - on WARN: dashboard only (no pause, no page),
//   - clears the flag when the agent settles.
// Complements the inline seatbelt (fast-burst blocker): this catches slower
// floods + cost runaways + gives the operator visibility.
// ---------------------------------------------------------------------------

import prisma from "../shared/db.js";
import logger from "../shared/logger.js";
import { sendKyleWhatsApp } from "../shared/whatsapp.js";
import { assessSpike, spikeConfigForSensitivity, type SpikeMetrics } from "../shared/spike-detect.js";
import { haltAgent } from "./lib/pause-control.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // don't re-WhatsApp the same critical spike within 60 min

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

export async function checkSpikes(): Promise<{ evaluated: number; spiking: number; alerted: number; autoPaused: number }> {
  const nowMs = Date.now();
  const agents = await prisma.agent.findMany({
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

  let spiking = 0;
  let alerted = 0;
  let autoPaused = 0;

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

      if (!v.spiking) {
        // Clear a previously-set flag; otherwise leave the agent untouched.
        if (a.spikeSeverity) {
          await prisma.agent.update({
            where: { id: a.id },
            data: { spikeSeverity: null, spikeBadge: null, spikeReason: null, spikeCheckedAt: new Date(nowMs) },
          });
        }
        continue;
      }

      spiking++;
      const reasonText = v.reasons.join("; ");
      let didAlert = false;

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

      await prisma.agent.update({
        where: { id: a.id },
        data: {
          spikeSeverity: v.severity,
          spikeBadge: v.badge,
          spikeReason: reasonText.slice(0, 500),
          spikeCheckedAt: new Date(nowMs),
          ...(didAlert ? { spikeAlertedAt: new Date(nowMs) } : {}),
        },
      });

      logger.warn("Agent spike detected", { agentId: a.id, name: a.name, severity: v.severity, badge: v.badge, autoPaused: v.autoPause });
    } catch (e) {
      logger.warn("Spike check failed for agent", { agentId: a.id, err: e instanceof Error ? e.message : String(e) });
    }
  }

  return { evaluated: agents.length, spiking, alerted, autoPaused };
}
