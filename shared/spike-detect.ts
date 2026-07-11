// ---------------------------------------------------------------------------
// Fleet runaway early-warning — per-agent volume/cost spike detection
// ---------------------------------------------------------------------------
// Pure, side-effect-free heuristic so Oracle (proactive WhatsApp alert +
// auto-pause cron) has ONE explainable definition of "this agent is behaving
// like a runaway". Born from the Arthur→Casey incident: catch an agent
// emailing/spending far above its normal rate BEFORE it becomes an incident.
//
// Design (from research on production agent-ops — see the commit notes):
//  - Outbound email/hour is the domain-specific killer signal (our blast risk);
//    24h volume + 24h cost are backstops.
//  - 1h windows use ABSOLUTE floors only (the per-hour baseline is too sparse
//    for a meaningful ratio). 24h windows combine an absolute floor with a
//    RELATIVE multiplier so a normally-busy agent's proportional day stays quiet
//    while a real jump (30/day → 240/day) still trips.
//  - Baseline = MEDIAN of the last 7 completed days (robust to one busy day;
//    z-score/MAD are unstable on sparse, zero-heavy samples).
//  - Cold start: relative checks OFF until "established"; absolute floors stay
//    ON, so a day-one runaway still trips without false alarms on new agents.
//  - A budget-tie rule flags critical when 24h spend eats ≥ half the monthly
//    budget, regardless of baseline.
//  - The 1h email floors sit BELOW the seatbelt's 20/hr hard cap, so the
//    operator gets a heads-up before the circuit breaker trips.
// warn → WhatsApp the operator; critical → auto-pause (system) + WhatsApp.
// Thresholds are global defaults now, per-agent-tunable later. Unit-tested.
// ---------------------------------------------------------------------------

export interface SpikeConfig {
  email1hWarn: number;
  email1hCrit: number;
  email24hWarn: number;
  email24hCrit: number;
  email24hWarnMult: number;
  email24hCritMult: number;
  email24hMinForRel: number; // below this, the 24h relative check is skipped (avoids 1→4 = 4×)
  cost24hWarnCents: number;
  cost24hCritCents: number;
  cost24hWarnMult: number;
  cost24hCritMult: number;
  cost24hMinForRelCents: number;
  budget24hCritPct: number; // 24h spend ≥ this fraction of monthly budget → critical
}

export const SPIKE_DEFAULTS: SpikeConfig = {
  email1hWarn: 8,
  email1hCrit: 15,
  email24hWarn: 30,
  email24hCrit: 60,
  email24hWarnMult: 4,
  email24hCritMult: 8,
  email24hMinForRel: 10,
  cost24hWarnCents: 500, // $5
  cost24hCritCents: 1500, // $15
  cost24hWarnMult: 4,
  cost24hCritMult: 8,
  cost24hMinForRelCents: 500, // $5 — below this, a big multiple of a trivial spend isn't worth an alert
  budget24hCritPct: 0.5,
};

export interface SpikeMetrics {
  emails1h: number;
  emails24h: number;
  dailyEmails7: number[]; // counts for the last 7 COMPLETED days (excl. today)
  cost24hCents: number;
  dailyCost7Cents: number[]; // spend for the last 7 completed days
  budgetMonthlyCents: number; // 0 = no budget set
  established: boolean; // age ≥ ~3d AND enough history for a trusted baseline
}

export type SpikeSeverity = "none" | "warn" | "critical";
export type SpikeMetricKey = "email_1h" | "email_24h" | "cost_24h";

export interface SpikeVerdict {
  spiking: boolean;
  severity: SpikeSeverity;
  autoPause: boolean; // true when critical — caller may system-pause
  metricKey: SpikeMetricKey | null; // the worst signal (used as the dedupe key)
  reasons: string[];
  badge: string; // compact chip label, e.g. "18/1h"; "" when not spiking
  worstRatio: number; // highest value/median ratio seen (0 if none / no baseline)
}

function rank(s: SpikeSeverity): number {
  return s === "critical" ? 2 : s === "warn" ? 1 : 0;
}
function maxSev(a: SpikeSeverity, b: SpikeSeverity): SpikeSeverity {
  return rank(b) > rank(a) ? b : a;
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface Signal {
  sev: SpikeSeverity;
  ratio: number;
}

// Absolute-only assessment (used for the sparse 1h window).
function absSignal(value: number, warn: number, crit: number): Signal {
  if (value >= crit) return { sev: "critical", ratio: 0 };
  if (value >= warn) return { sev: "warn", ratio: 0 };
  return { sev: "none", ratio: 0 };
}

// Absolute floor + relative multiplier over a median baseline (24h windows).
function relSignal(
  value: number,
  warn: number,
  crit: number,
  baseline: number,
  warnMult: number,
  critMult: number,
  minForRel: number,
  established: boolean,
): Signal {
  let sev: SpikeSeverity = value >= crit ? "critical" : value >= warn ? "warn" : "none";
  const ratio = baseline > 0 ? value / baseline : 0;
  if (established && baseline > 0 && value >= minForRel) {
    if (ratio >= critMult) sev = maxSev(sev, "critical");
    else if (ratio >= warnMult) sev = maxSev(sev, "warn");
  }
  return { sev, ratio };
}

export function assessSpike(m: SpikeMetrics, cfg: SpikeConfig = SPIKE_DEFAULTS): SpikeVerdict {
  const emailBaseline = median(m.dailyEmails7);
  const costBaseline = median(m.dailyCost7Cents);

  const signals: Array<{ key: SpikeMetricKey; sig: Signal; reason: (s: Signal) => string; badge: string }> = [
    {
      key: "email_1h",
      sig: absSignal(m.emails1h, cfg.email1hWarn, cfg.email1hCrit),
      reason: () => `${m.emails1h} emails in the last hour`,
      badge: `${m.emails1h}/1h`,
    },
    {
      key: "email_24h",
      sig: relSignal(m.emails24h, cfg.email24hWarn, cfg.email24hCrit, emailBaseline, cfg.email24hWarnMult, cfg.email24hCritMult, cfg.email24hMinForRel, m.established),
      reason: (s) => `${m.emails24h} emails in the last 24h${s.ratio >= 2 ? ` (~${Math.round(s.ratio)}× normal)` : ""}`,
      badge: `${m.emails24h}/24h`,
    },
    {
      key: "cost_24h",
      sig: (() => {
        const s = relSignal(m.cost24hCents, cfg.cost24hWarnCents, cfg.cost24hCritCents, costBaseline, cfg.cost24hWarnMult, cfg.cost24hCritMult, cfg.cost24hMinForRelCents, m.established);
        // Budget tie: 24h spend ≥ half the monthly envelope is critical no matter the baseline.
        if (m.budgetMonthlyCents > 0 && m.cost24hCents >= cfg.budget24hCritPct * m.budgetMonthlyCents) {
          s.sev = maxSev(s.sev, "critical");
        }
        return s;
      })(),
      reason: (s) => `$${(m.cost24hCents / 100).toFixed(2)} spend in 24h${s.ratio >= 2 ? ` (~${Math.round(s.ratio)}× normal)` : ""}`,
      badge: `$${Math.round(m.cost24hCents / 100)}/24h`,
    },
  ];

  let severity: SpikeSeverity = "none";
  let worst: { key: SpikeMetricKey; badge: string } | null = null;
  let worstRank = -1;
  let worstRatio = 0;
  const reasons: string[] = [];

  for (const sg of signals) {
    if (sg.sig.sev === "none") continue;
    severity = maxSev(severity, sg.sig.sev);
    reasons.push(sg.reason(sg.sig));
    worstRatio = Math.max(worstRatio, sg.sig.ratio);
    // Pick the worst signal by severity, then by ratio, as the dedupe/badge key.
    const r = rank(sg.sig.sev) * 100 + sg.sig.ratio;
    if (r > worstRank) {
      worstRank = r;
      worst = { key: sg.key, badge: sg.badge };
    }
  }

  const spiking = severity !== "none";
  return {
    spiking,
    severity,
    autoPause: severity === "critical",
    metricKey: spiking && worst ? worst.key : null,
    reasons,
    badge: spiking && worst ? worst.badge : "",
    worstRatio: spiking ? Math.round(worstRatio * 10) / 10 : 0,
  };
}
