import { createRequire } from "module";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Third-party integration health check
// ---------------------------------------------------------------------------
// The Composio v1/v2 API retirement broke tool connections in production before
// we noticed. This module is the guardrail so it never happens silently again.
// It does two things on a schedule:
//   1. SMOKE-TESTS every vendor API we depend on (a live call that would fail
//      the moment the vendor deprecates/changes it).
//   2. Flags SDK VERSION DRIFT — installed vs npm-latest — because a big gap is
//      the early-warning sign that precedes a breaking change (Composio was 5
//      minors behind: 0.6.8 vs 0.13.1).
// Results feed a weekly cron that pings the operator on anything not "ok".
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);

export type Severity = "ok" | "warn" | "fail";

export interface HealthResult {
  name: string;
  severity: Severity;
  detail: string;
}

const TIMEOUT_MS = 12000;

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** A live call per vendor. Missing key => skipped (warn), not a false alarm. */
async function smokeCheck(
  name: string,
  envKey: string,
  run: (key: string) => Promise<{ ok: boolean; detail: string }>
): Promise<HealthResult> {
  const key = process.env[envKey];
  if (!key) return { name, severity: "warn", detail: `skipped — ${envKey} not set` };
  try {
    const { ok, detail } = await run(key);
    return { name, severity: ok ? "ok" : "fail", detail };
  } catch (err) {
    return { name, severity: "fail", detail: err instanceof Error ? err.message : String(err) };
  }
}

// ---- Vendor smoke tests --------------------------------------------------

async function checkComposio(): Promise<HealthResult> {
  return smokeCheck("Composio (v3 API)", "COMPOSIO_API_KEY", async (key) => {
    // Hit a v3 endpoint. If Composio retires v3 the way they retired v1/v2, the
    // body carries "no longer available / upgrade" and we catch it here.
    const res = await timedFetch("https://backend.composio.dev/api/v3/toolkits?limit=1", {
      headers: { "x-api-key": key },
    });
    const body = await res.text();
    if (/no longer available|please upgrade/i.test(body)) {
      return { ok: false, detail: `v3 endpoint deprecated: ${body.slice(0, 120)}` };
    }
    return { ok: res.ok, detail: res.ok ? "v3 toolkits reachable" : `HTTP ${res.status}: ${body.slice(0, 120)}` };
  });
}

async function checkSupabase(): Promise<HealthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return { name: "Supabase (auth)", severity: "warn", detail: "skipped — Supabase URL/anon key not set" };
  try {
    const res = await timedFetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } });
    return { name: "Supabase (auth)", severity: res.ok ? "ok" : "fail", detail: res.ok ? "auth settings reachable" : `HTTP ${res.status}` };
  } catch (err) {
    return { name: "Supabase (auth)", severity: "fail", detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkResend(): Promise<HealthResult> {
  return smokeCheck("Resend (email)", "RESEND_API_KEY", async (key) => {
    const res = await timedFetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
    return { ok: res.ok, detail: res.ok ? "API reachable" : `HTTP ${res.status}` };
  });
}

async function checkStripe(): Promise<HealthResult> {
  return smokeCheck("Stripe (billing)", "STRIPE_SECRET_KEY", async (key) => {
    const res = await timedFetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${key}` } });
    return { ok: res.ok, detail: res.ok ? "API reachable" : `HTTP ${res.status}` };
  });
}

async function checkAnthropic(): Promise<HealthResult> {
  return smokeCheck("Anthropic (Claude)", "ANTHROPIC_API_KEY", async (key) => {
    const res = await timedFetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    return { ok: res.ok, detail: res.ok ? "models reachable" : `HTTP ${res.status}` };
  });
}

// ---- SDK version drift ---------------------------------------------------

// The packages whose breaking changes actually take the platform down.
const WATCHED_PACKAGES = [
  "@composio/core",
  "@anthropic-ai/sdk",
  "@supabase/supabase-js",
  "@supabase/ssr",
  "stripe",
  "resend",
  "openai",
  "@google/generative-ai",
  "twilio",
  "@browserbasehq/stagehand",
  "@elevenlabs/elevenlabs-js",
];

function installedVersion(pkg: string): string | null {
  try {
    return (require(`${pkg}/package.json`) as { version: string }).version;
  } catch {
    return null;
  }
}

async function latestVersion(pkg: string): Promise<string | null> {
  try {
    const res = await timedFetch(`https://registry.npmjs.org/${pkg}/latest`);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

function major(v: string): number {
  return parseInt(v.replace(/^[^\d]*/, "").split(".")[0] || "0", 10);
}
function minor(v: string): number {
  return parseInt(v.split(".")[1] || "0", 10);
}

async function checkVersionDrift(): Promise<HealthResult[]> {
  const out = await Promise.all(
    WATCHED_PACKAGES.map(async (pkg): Promise<HealthResult | null> => {
      const inst = installedVersion(pkg);
      if (!inst) return null; // not installed in this service — skip
      const latest = await latestVersion(pkg);
      if (!latest) return { name: `drift: ${pkg}`, severity: "warn", detail: `installed ${inst}, npm latest unknown` };
      if (inst === latest) return { name: `drift: ${pkg}`, severity: "ok", detail: `${inst} (latest)` };
      const majorBehind = major(latest) - major(inst);
      const minorBehind = minor(latest) - minor(inst);
      // Drift is advisory (a heads-up), never "broken right now" — so it's a
      // warning that surfaces in the weekly digest, not an immediate page. A
      // major jump is the deprecation-risk zone, so we call it out in the text.
      const behind = majorBehind >= 1 ? ` (${majorBehind} major behind — deprecation risk)` : "";
      return {
        name: `drift: ${pkg}`,
        severity: "warn",
        detail: `installed ${inst} → npm latest ${latest}${behind}`,
      };
    })
  );
  return out.filter((r): r is HealthResult => r !== null);
}

// ---- Public entry --------------------------------------------------------

export async function runIntegrationHealthcheck(): Promise<HealthResult[]> {
  const [vendors, drift] = await Promise.all([
    Promise.all([checkComposio(), checkSupabase(), checkResend(), checkStripe(), checkAnthropic()]),
    checkVersionDrift(),
  ]);
  const results = [...vendors, ...drift];
  logger.info("Integration healthcheck complete", {
    fail: results.filter((r) => r.severity === "fail").length,
    warn: results.filter((r) => r.severity === "warn").length,
  });
  return results;
}

/** Render a concise operator-facing report (WhatsApp/email friendly). */
export function formatHealthReport(results: HealthResult[]): { hasProblems: boolean; message: string } {
  const fails = results.filter((r) => r.severity === "fail");
  const warns = results.filter((r) => r.severity === "warn");
  const icon = (s: Severity) => (s === "ok" ? "✅" : s === "warn" ? "⚠️" : "❌");
  const lines = results
    .filter((r) => r.severity !== "ok")
    .map((r) => `${icon(r.severity)} ${r.name} — ${r.detail}`);
  const header =
    fails.length > 0
      ? `🚨 Integration health: ${fails.length} FAILING, ${warns.length} warnings`
      : warns.length > 0
        ? `⚠️ Integration health: ${warns.length} warnings (updates available)`
        : `✅ Integration health: all ${results.length} checks passing`;
  return {
    hasProblems: fails.length > 0 || warns.length > 0,
    message: [header, ...lines].join("\n"),
  };
}
