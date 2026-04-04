import * as https from "node:https";
import * as tls from "node:tls";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Site Scanner — tech stack, SSL, security headers, DNS
// ---------------------------------------------------------------------------
// All free. No API keys. Just HTTP requests and TLS inspection.
// Pulls: tech stack from headers/HTML, SSL cert details, security headers
// grade, DNS records, and basic site metadata.
// ---------------------------------------------------------------------------

export interface SiteScanResult {
  url: string;
  reachable: boolean;
  statusCode: number | null;
  redirectsTo: string | null;

  // SSL
  ssl: {
    valid: boolean;
    issuer: string | null;
    expiresAt: string | null;
    daysUntilExpiry: number | null;
    protocol: string | null;
  };

  // Security headers
  securityHeaders: {
    grade: string; // A+ to F
    present: string[];
    missing: string[];
  };

  // Tech stack (detected from headers + HTML)
  techStack: Array<{
    name: string;
    category: string;
    confidence: "high" | "medium" | "low";
  }>;

  // Basic metadata
  metadata: {
    title: string | null;
    description: string | null;
    language: string | null;
    generator: string | null;
    serverHeader: string | null;
    poweredBy: string | null;
  };
}

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url;
}

// ---------------------------------------------------------------------------
// SSL Certificate Check
// ---------------------------------------------------------------------------

async function checkSSL(hostname: string): Promise<SiteScanResult["ssl"]> {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect(
        { host: hostname, port: 443, servername: hostname, timeout: 10000 },
        () => {
          const cert = socket.getPeerCertificate();
          const protocol = socket.getProtocol();
          socket.destroy();

          if (!cert || !cert.valid_to) {
            resolve({ valid: false, issuer: null, expiresAt: null, daysUntilExpiry: null, protocol });
            return;
          }

          const expiresAt = new Date(cert.valid_to);
          const daysUntilExpiry = Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

          resolve({
            valid: daysUntilExpiry > 0,
            issuer: typeof cert.issuer === "object"
              ? String(cert.issuer.O ?? cert.issuer.CN ?? "Unknown")
              : null,
            expiresAt: expiresAt.toISOString(),
            daysUntilExpiry,
            protocol: protocol ?? null,
          });
        }
      );
      socket.on("error", () => {
        resolve({ valid: false, issuer: null, expiresAt: null, daysUntilExpiry: null, protocol: null });
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve({ valid: false, issuer: null, expiresAt: null, daysUntilExpiry: null, protocol: null });
      });
    } catch {
      resolve({ valid: false, issuer: null, expiresAt: null, daysUntilExpiry: null, protocol: null });
    }
  });
}

// ---------------------------------------------------------------------------
// Security Headers Analysis
// ---------------------------------------------------------------------------

const SECURITY_HEADERS = [
  { name: "strict-transport-security", label: "HSTS", weight: 2 },
  { name: "content-security-policy", label: "Content-Security-Policy", weight: 2 },
  { name: "x-frame-options", label: "X-Frame-Options", weight: 1 },
  { name: "x-content-type-options", label: "X-Content-Type-Options", weight: 1 },
  { name: "referrer-policy", label: "Referrer-Policy", weight: 1 },
  { name: "permissions-policy", label: "Permissions-Policy", weight: 1 },
  { name: "x-xss-protection", label: "X-XSS-Protection", weight: 0.5 },
];

function analyzeSecurityHeaders(headers: Record<string, string>): SiteScanResult["securityHeaders"] {
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );

  const present: string[] = [];
  const missing: string[] = [];
  let score = 0;
  let maxScore = 0;

  for (const h of SECURITY_HEADERS) {
    maxScore += h.weight;
    if (lowerHeaders[h.name]) {
      present.push(h.label);
      score += h.weight;
    } else {
      missing.push(h.label);
    }
  }

  const pct = maxScore > 0 ? score / maxScore : 0;
  let grade: string;
  if (pct >= 0.95) grade = "A+";
  else if (pct >= 0.85) grade = "A";
  else if (pct >= 0.7) grade = "B";
  else if (pct >= 0.5) grade = "C";
  else if (pct >= 0.3) grade = "D";
  else grade = "F";

  return { grade, present, missing };
}

// ---------------------------------------------------------------------------
// Tech Stack Detection (from headers + HTML)
// ---------------------------------------------------------------------------

interface TechSignature {
  name: string;
  category: string;
  headerMatch?: { header: string; pattern: RegExp };
  htmlMatch?: RegExp;
  metaMatch?: { name: string; pattern: RegExp };
  confidence: "high" | "medium" | "low";
}

const TECH_SIGNATURES: TechSignature[] = [
  // Servers
  { name: "Nginx", category: "Web Server", headerMatch: { header: "server", pattern: /nginx/i }, confidence: "high" },
  { name: "Apache", category: "Web Server", headerMatch: { header: "server", pattern: /apache/i }, confidence: "high" },
  { name: "Cloudflare", category: "CDN", headerMatch: { header: "server", pattern: /cloudflare/i }, confidence: "high" },
  { name: "Vercel", category: "Hosting", headerMatch: { header: "server", pattern: /vercel/i }, confidence: "high" },
  { name: "Netlify", category: "Hosting", headerMatch: { header: "server", pattern: /netlify/i }, confidence: "high" },
  { name: "AWS CloudFront", category: "CDN", headerMatch: { header: "via", pattern: /cloudfront/i }, confidence: "high" },

  // Frameworks (from headers)
  { name: "Next.js", category: "Framework", headerMatch: { header: "x-powered-by", pattern: /next\.js/i }, confidence: "high" },
  { name: "Express", category: "Framework", headerMatch: { header: "x-powered-by", pattern: /express/i }, confidence: "high" },
  { name: "ASP.NET", category: "Framework", headerMatch: { header: "x-powered-by", pattern: /asp\.net/i }, confidence: "high" },
  { name: "PHP", category: "Language", headerMatch: { header: "x-powered-by", pattern: /php/i }, confidence: "high" },

  // CMS (from HTML)
  { name: "WordPress", category: "CMS", htmlMatch: /wp-content|wp-includes|wordpress/i, confidence: "high" },
  { name: "Shopify", category: "E-commerce", htmlMatch: /cdn\.shopify\.com|shopify\.com\/s/i, confidence: "high" },
  { name: "Squarespace", category: "CMS", htmlMatch: /squarespace\.com|static1\.squarespace/i, confidence: "high" },
  { name: "Wix", category: "CMS", htmlMatch: /wix\.com|parastorage\.com/i, confidence: "high" },
  { name: "Webflow", category: "CMS", htmlMatch: /webflow\.com|assets\.website-files/i, confidence: "high" },

  // Analytics
  { name: "Google Analytics", category: "Analytics", htmlMatch: /google-analytics\.com|gtag\/js|googletagmanager/i, confidence: "high" },
  { name: "Google Tag Manager", category: "Analytics", htmlMatch: /googletagmanager\.com\/gtm/i, confidence: "high" },
  { name: "Meta Pixel", category: "Analytics", htmlMatch: /facebook\.net\/en_US\/fbevents|connect\.facebook\.net/i, confidence: "high" },
  { name: "Hotjar", category: "Analytics", htmlMatch: /hotjar\.com|static\.hotjar/i, confidence: "high" },
  { name: "Mixpanel", category: "Analytics", htmlMatch: /mixpanel\.com/i, confidence: "medium" },
  { name: "PostHog", category: "Analytics", htmlMatch: /posthog\.com|app\.posthog/i, confidence: "medium" },
  { name: "Plausible", category: "Analytics", htmlMatch: /plausible\.io/i, confidence: "medium" },

  // Marketing
  { name: "HubSpot", category: "Marketing", htmlMatch: /js\.hs-scripts\.com|hubspot\.com/i, confidence: "high" },
  { name: "Intercom", category: "Support", htmlMatch: /intercom\.io|widget\.intercom/i, confidence: "high" },
  { name: "Zendesk", category: "Support", htmlMatch: /zendesk\.com|zdassets\.com/i, confidence: "high" },
  { name: "Drift", category: "Marketing", htmlMatch: /drift\.com|js\.driftt\.com/i, confidence: "high" },
  { name: "Crisp", category: "Support", htmlMatch: /crisp\.chat/i, confidence: "high" },
  { name: "Mailchimp", category: "Email Marketing", htmlMatch: /mailchimp\.com|chimpstatic\.com/i, confidence: "medium" },
  { name: "Klaviyo", category: "Email Marketing", htmlMatch: /klaviyo\.com|static\.klaviyo/i, confidence: "high" },

  // Payments
  { name: "Stripe", category: "Payments", htmlMatch: /js\.stripe\.com|stripe\.com/i, confidence: "medium" },

  // Frameworks (from HTML)
  { name: "React", category: "Framework", htmlMatch: /__NEXT_DATA__|reactroot|_react/i, confidence: "medium" },
  { name: "Vue.js", category: "Framework", htmlMatch: /vue\.js|vuejs\.org|__vue/i, confidence: "medium" },
  { name: "Tailwind CSS", category: "CSS Framework", htmlMatch: /tailwindcss|tailwind\.min/i, confidence: "low" },
  { name: "Bootstrap", category: "CSS Framework", htmlMatch: /bootstrap\.min|getbootstrap\.com/i, confidence: "medium" },

  // Meta generator tag
  { name: "WordPress", category: "CMS", metaMatch: { name: "generator", pattern: /wordpress/i }, confidence: "high" },
  { name: "Drupal", category: "CMS", metaMatch: { name: "generator", pattern: /drupal/i }, confidence: "high" },
  { name: "Joomla", category: "CMS", metaMatch: { name: "generator", pattern: /joomla/i }, confidence: "high" },
  { name: "Ghost", category: "CMS", metaMatch: { name: "generator", pattern: /ghost/i }, confidence: "high" },
];

function detectTechStack(
  headers: Record<string, string>,
  html: string
): SiteScanResult["techStack"] {
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );

  const detected = new Map<string, SiteScanResult["techStack"][0]>();

  for (const sig of TECH_SIGNATURES) {
    if (detected.has(sig.name)) continue;

    let matched = false;

    if (sig.headerMatch) {
      const headerValue = lowerHeaders[sig.headerMatch.header.toLowerCase()];
      if (headerValue && sig.headerMatch.pattern.test(headerValue)) matched = true;
    }

    if (!matched && sig.htmlMatch) {
      if (sig.htmlMatch.test(html)) matched = true;
    }

    if (!matched && sig.metaMatch) {
      const metaRegex = new RegExp(
        `<meta[^>]*name=["']${sig.metaMatch.name}["'][^>]*content=["']([^"']*)["']`,
        "i"
      );
      const metaMatch = html.match(metaRegex);
      if (metaMatch && sig.metaMatch.pattern.test(metaMatch[1])) matched = true;
    }

    if (matched) {
      detected.set(sig.name, {
        name: sig.name,
        category: sig.category,
        confidence: sig.confidence,
      });
    }
  }

  return Array.from(detected.values());
}

// ---------------------------------------------------------------------------
// HTML Metadata Extraction
// ---------------------------------------------------------------------------

function extractMetadata(html: string, headers: Record<string, string>): SiteScanResult["metadata"] {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    ?? html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const langMatch = html.match(/<html[^>]*lang=["']([^"']*)["']/i);
  const genMatch = html.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']*)["']/i);

  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );

  return {
    title: titleMatch?.[1]?.trim().slice(0, 200) ?? null,
    description: descMatch?.[1]?.trim().slice(0, 300) ?? null,
    language: langMatch?.[1] ?? null,
    generator: genMatch?.[1] ?? null,
    serverHeader: lowerHeaders["server"] ?? null,
    poweredBy: lowerHeaders["x-powered-by"] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

export async function scanSite(url: string): Promise<SiteScanResult> {
  const normalizedUrl = normalizeUrl(url);
  const parsedUrl = new URL(normalizedUrl);

  // Check SSL
  const ssl = await checkSSL(parsedUrl.hostname);

  // Fetch the page
  let statusCode: number | null = null;
  let redirectsTo: string | null = null;
  let headers: Record<string, string> = {};
  let html = "";
  let reachable = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "AmbittAgents/2.0 SiteScanner",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    clearTimeout(timeout);
    statusCode = response.status;
    reachable = response.ok;

    // Check for redirects
    if (response.url !== normalizedUrl) {
      redirectsTo = response.url;
    }

    // Get headers
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Get HTML (limit to first 500KB for analysis)
    html = (await response.text()).slice(0, 500_000);
  } catch (error) {
    logger.warn("Site scanner fetch failed", { url: normalizedUrl, error });
  }

  // Analyze
  const securityHeaders = analyzeSecurityHeaders(headers);
  const techStack = detectTechStack(headers, html);
  const metadata = extractMetadata(html, headers);

  logger.info("Site scan complete", {
    url: normalizedUrl,
    reachable,
    securityGrade: securityHeaders.grade,
    techCount: techStack.length,
  });

  return {
    url: normalizedUrl,
    reachable,
    statusCode,
    redirectsTo,
    ssl,
    securityHeaders,
    techStack,
    metadata,
  };
}

/**
 * Format scan results as a readable string for Claude.
 */
export function formatScanResults(result: SiteScanResult): string {
  const lines: string[] = [];

  lines.push(`## Site Scan: ${result.url}`);
  lines.push(`Status: ${result.reachable ? "Reachable" : "Unreachable"} (HTTP ${result.statusCode ?? "N/A"})`);
  if (result.redirectsTo) lines.push(`Redirects to: ${result.redirectsTo}`);
  lines.push("");

  // Metadata
  if (result.metadata.title) lines.push(`Title: ${result.metadata.title}`);
  if (result.metadata.description) lines.push(`Description: ${result.metadata.description}`);
  lines.push("");

  // SSL
  lines.push(`### SSL Certificate`);
  if (result.ssl.valid) {
    lines.push(`- Valid: Yes`);
    lines.push(`- Issuer: ${result.ssl.issuer ?? "Unknown"}`);
    lines.push(`- Expires: ${result.ssl.expiresAt ?? "Unknown"} (${result.ssl.daysUntilExpiry} days)`);
    lines.push(`- Protocol: ${result.ssl.protocol ?? "Unknown"}`);
  } else {
    lines.push(`- Valid: NO — SSL certificate is invalid or expired`);
  }
  lines.push("");

  // Security
  lines.push(`### Security Headers — Grade: ${result.securityHeaders.grade}`);
  if (result.securityHeaders.present.length > 0) {
    lines.push(`Present: ${result.securityHeaders.present.join(", ")}`);
  }
  if (result.securityHeaders.missing.length > 0) {
    lines.push(`Missing: ${result.securityHeaders.missing.join(", ")}`);
  }
  lines.push("");

  // Tech stack
  if (result.techStack.length > 0) {
    lines.push(`### Detected Technology Stack`);
    const byCategory = new Map<string, string[]>();
    for (const tech of result.techStack) {
      const list = byCategory.get(tech.category) ?? [];
      list.push(tech.name);
      byCategory.set(tech.category, list);
    }
    for (const [category, techs] of byCategory) {
      lines.push(`- ${category}: ${techs.join(", ")}`);
    }
  } else {
    lines.push(`### Technology Stack: Could not detect specific technologies`);
  }

  return lines.join("\n");
}
