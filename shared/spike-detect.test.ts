// Run: node_modules/.bin/tsx shared/spike-detect.test.ts
import { assessSpike, median, spikeConfigForSensitivity, SPIKE_DEFAULTS, type SpikeMetrics } from "./spike-detect.js";

function base(over: Partial<SpikeMetrics> = {}): SpikeMetrics {
  return {
    emails1h: 0,
    emails24h: 0,
    dailyEmails7: [5, 4, 6, 5, 4, 5, 6], // median 5/day — a realistic normal
    cost24hCents: 0,
    dailyCost7Cents: [300, 250, 350, 300, 280, 300, 320], // median ~$3/day
    budgetMonthlyCents: 5000, // $50/mo
    established: true,
    ...over,
  };
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// median helper
check("median odd", median([1, 2, 3]) === 2);
check("median even", median([1, 2, 3, 4]) === 2.5);
check("median empty", median([]) === 0);
check("median robust to one busy day", median([2, 2, 2, 2, 2, 2, 99]) === 2);

// quiet agent → nothing
{
  const v = assessSpike(base({ emails1h: 2, emails24h: 6, cost24hCents: 120 }));
  check("quiet agent → none", !v.spiking && v.severity === "none" && !v.autoPause, JSON.stringify(v));
}

// 1h blast — absolute floors
{
  const v = assessSpike(base({ emails1h: 16, emails24h: 16 }));
  check("16 emails/1h → critical + autoPause", v.severity === "critical" && v.autoPause && v.metricKey === "email_1h" && v.badge === "16/1h", JSON.stringify(v));
}
{
  const v = assessSpike(base({ emails1h: 9, emails24h: 11 }));
  check("9 emails/1h → warn (no autoPause)", v.severity === "warn" && !v.autoPause && v.metricKey === "email_1h", JSON.stringify(v));
}

// 24h absolute critical floor
{
  const v = assessSpike(base({ emails24h: 65 }));
  check("65 emails/24h → critical (abs floor)", v.severity === "critical" && v.metricKey === "email_24h", JSON.stringify(v));
}

// 24h RELATIVE spike, isolated from the abs crit floor (value between warn 30 and crit 60, but 8×+ the median)
{
  const v = assessSpike(base({ emails24h: 50, dailyEmails7: [5, 5, 5, 5, 5, 5, 5] })); // median 5 → 50/5 = 10× ≥ 8×
  check("50/24h at 10× median → critical (relative)", v.severity === "critical" && v.metricKey === "email_24h" && v.worstRatio >= 8, JSON.stringify(v));
}
// same numbers, NOT established → relative off → only abs warn (50≥30, <60)
{
  const v = assessSpike(base({ emails24h: 50, dailyEmails7: [5, 5, 5, 5, 5, 5, 5], established: false }));
  check("cold-start 50/24h → warn only (relative off)", v.severity === "warn", JSON.stringify(v));
}

// min-for-relative guard: 4 emails is 4× a median of 1, but below minForRel(10) → not flagged
{
  const v = assessSpike(base({ emails24h: 4, dailyEmails7: [1, 1, 1, 1, 1, 1, 1] }));
  check("4/24h at 4× tiny median → none (min-for-rel guard)", !v.spiking, JSON.stringify(v));
}

// cost budget-tie: $12/24h with a $20/mo budget → ≥50% → critical even though < $15 crit floor
{
  const v = assessSpike(base({ cost24hCents: 1200, budgetMonthlyCents: 2000, dailyCost7Cents: [50, 50, 50, 50, 50, 50, 50] }));
  check("cost $12/24h ≥ 50% of $20 budget → critical", v.severity === "critical" && v.metricKey === "cost_24h", JSON.stringify(v));
}
// cost normal
{
  const v = assessSpike(base({ cost24hCents: 300 }));
  check("cost $3/24h below floor → none", !v.spiking, JSON.stringify(v));
}

// worst-signal picking: both email_1h critical and cost warn → metricKey is the critical one
{
  const v = assessSpike(base({ emails1h: 20, cost24hCents: 600 }));
  check("worst signal wins → email_1h critical", v.severity === "critical" && v.metricKey === "email_1h", JSON.stringify(v));
}

// --- sensitivity scaling ---
check("sensitivity standard → defaults", spikeConfigForSensitivity("standard") === SPIKE_DEFAULTS && spikeConfigForSensitivity(null) === SPIKE_DEFAULTS);
check("sensitivity relaxed doubles email floors", spikeConfigForSensitivity("relaxed").email1hCrit === 30 && spikeConfigForSensitivity("relaxed").email1hWarn === 16);
check("sensitivity strict halves email floors", spikeConfigForSensitivity("strict").email1hCrit === 8 && spikeConfigForSensitivity("strict").email1hWarn === 4);
{
  // 16/1h is critical at standard but only warn when the agent is Relaxed.
  const v = assessSpike(base({ emails1h: 16, emails24h: 16 }), spikeConfigForSensitivity("relaxed"));
  check("relaxed: 16/1h → warn (not critical)", v.severity === "warn", JSON.stringify(v));
}
{
  // 9/1h is only warn at standard but critical when the agent is Strict.
  const v = assessSpike(base({ emails1h: 9, emails24h: 9 }), spikeConfigForSensitivity("strict"));
  check("strict: 9/1h → critical", v.severity === "critical", JSON.stringify(v));
}

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
