import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Google PageSpeed Insights — free, no API key required
// ---------------------------------------------------------------------------
// Analyzes any public URL for performance, accessibility, SEO, and best
// practices. Returns scores, Core Web Vitals, and specific opportunities
// for improvement. Rate limit: ~25 req/day without key, 25k/day with key.
// ---------------------------------------------------------------------------

const PAGESPEED_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface PageSpeedResult {
  url: string;
  strategy: "mobile" | "desktop";
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  coreWebVitals: {
    firstContentfulPaint: string;
    largestContentfulPaint: string;
    totalBlockingTime: string;
    cumulativeLayoutShift: string;
    speedIndex: string;
  };
  opportunities: Array<{
    title: string;
    description: string;
    savings: string | null;
  }>;
  diagnostics: Array<{
    title: string;
    description: string;
    displayValue: string | null;
  }>;
}

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url;
}

export async function analyzePerformance(
  url: string,
  strategy: "mobile" | "desktop" = "mobile"
): Promise<PageSpeedResult> {
  const normalizedUrl = normalizeUrl(url);
  const apiKey = process.env.GOOGLE_API_KEY; // optional — works without it

  let apiUrl = `${PAGESPEED_API}?url=${encodeURIComponent(normalizedUrl)}&strategy=${strategy}`;
  apiUrl += "&category=performance&category=accessibility&category=best-practices&category=seo";
  if (apiKey) apiUrl += `&key=${apiKey}`;

  const response = await fetch(apiUrl);

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("PageSpeed API failed", { url: normalizedUrl, status: response.status, body: errorBody });
    throw new Error(`PageSpeed API returned ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const lighthouse = data.lighthouseResult;

  if (!lighthouse) {
    throw new Error("No Lighthouse results returned — the URL may be unreachable");
  }

  // Extract scores (0-100)
  const categories = lighthouse.categories ?? {};
  const scores = {
    performance: Math.round((categories.performance?.score ?? 0) * 100),
    accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((categories["best-practices"]?.score ?? 0) * 100),
    seo: Math.round((categories.seo?.score ?? 0) * 100),
  };

  // Extract Core Web Vitals from audits
  const audits = lighthouse.audits ?? {};
  const coreWebVitals = {
    firstContentfulPaint: audits["first-contentful-paint"]?.displayValue ?? "N/A",
    largestContentfulPaint: audits["largest-contentful-paint"]?.displayValue ?? "N/A",
    totalBlockingTime: audits["total-blocking-time"]?.displayValue ?? "N/A",
    cumulativeLayoutShift: audits["cumulative-layout-shift"]?.displayValue ?? "N/A",
    speedIndex: audits["speed-index"]?.displayValue ?? "N/A",
  };

  // Extract improvement opportunities
  const opportunities: PageSpeedResult["opportunities"] = [];
  for (const [key, audit] of Object.entries(audits) as [string, any][]) {
    if (
      audit.details?.type === "opportunity" &&
      audit.score !== null &&
      audit.score < 1
    ) {
      opportunities.push({
        title: audit.title ?? key,
        description: audit.description?.replace(/<[^>]*>/g, "").slice(0, 200) ?? "",
        savings: audit.details?.overallSavingsMs
          ? `${Math.round(audit.details.overallSavingsMs)}ms`
          : audit.details?.overallSavingsBytes
            ? `${Math.round(audit.details.overallSavingsBytes / 1024)}KB`
            : null,
      });
    }
  }

  // Extract diagnostics (informational audits that failed)
  const diagnostics: PageSpeedResult["diagnostics"] = [];
  for (const [key, audit] of Object.entries(audits) as [string, any][]) {
    if (
      audit.details?.type === "table" &&
      audit.score !== null &&
      audit.score < 1 &&
      !opportunities.some((o) => o.title === audit.title)
    ) {
      diagnostics.push({
        title: audit.title ?? key,
        description: audit.description?.replace(/<[^>]*>/g, "").slice(0, 200) ?? "",
        displayValue: audit.displayValue ?? null,
      });
    }
  }

  logger.info("PageSpeed analysis complete", {
    url: normalizedUrl,
    strategy,
    performance: scores.performance,
  });

  return {
    url: normalizedUrl,
    strategy,
    scores,
    coreWebVitals,
    opportunities: opportunities.slice(0, 10),
    diagnostics: diagnostics.slice(0, 10),
  };
}

/**
 * Run both mobile and desktop analysis and return combined results.
 */
export async function analyzePerformanceFull(url: string): Promise<{
  mobile: PageSpeedResult;
  desktop: PageSpeedResult;
}> {
  const [mobile, desktop] = await Promise.all([
    analyzePerformance(url, "mobile"),
    analyzePerformance(url, "desktop"),
  ]);
  return { mobile, desktop };
}

/**
 * Format PageSpeed results as a readable string for Claude.
 */
export function formatPageSpeedResults(result: PageSpeedResult): string {
  const lines: string[] = [];

  lines.push(`## PageSpeed Analysis: ${result.url} (${result.strategy})`);
  lines.push("");
  lines.push(`### Scores`);
  lines.push(`- Performance: ${result.scores.performance}/100 ${scoreEmoji(result.scores.performance)}`);
  lines.push(`- Accessibility: ${result.scores.accessibility}/100 ${scoreEmoji(result.scores.accessibility)}`);
  lines.push(`- Best Practices: ${result.scores.bestPractices}/100 ${scoreEmoji(result.scores.bestPractices)}`);
  lines.push(`- SEO: ${result.scores.seo}/100 ${scoreEmoji(result.scores.seo)}`);
  lines.push("");
  lines.push(`### Core Web Vitals`);
  lines.push(`- First Contentful Paint: ${result.coreWebVitals.firstContentfulPaint}`);
  lines.push(`- Largest Contentful Paint: ${result.coreWebVitals.largestContentfulPaint}`);
  lines.push(`- Total Blocking Time: ${result.coreWebVitals.totalBlockingTime}`);
  lines.push(`- Cumulative Layout Shift: ${result.coreWebVitals.cumulativeLayoutShift}`);
  lines.push(`- Speed Index: ${result.coreWebVitals.speedIndex}`);

  if (result.opportunities.length > 0) {
    lines.push("");
    lines.push(`### Improvement Opportunities`);
    for (const opp of result.opportunities) {
      const savings = opp.savings ? ` (save ~${opp.savings})` : "";
      lines.push(`- ${opp.title}${savings}`);
    }
  }

  if (result.diagnostics.length > 0) {
    lines.push("");
    lines.push(`### Diagnostics`);
    for (const diag of result.diagnostics) {
      const value = diag.displayValue ? ` — ${diag.displayValue}` : "";
      lines.push(`- ${diag.title}${value}`);
    }
  }

  return lines.join("\n");
}

function scoreEmoji(score: number): string {
  if (score >= 90) return "(good)";
  if (score >= 50) return "(needs work)";
  return "(poor)";
}
