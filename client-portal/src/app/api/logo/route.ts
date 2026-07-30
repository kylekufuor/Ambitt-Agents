import { NextResponse, type NextRequest } from "next/server";

/**
 * Official logo for a site we name in the portal, by domain.
 *
 * Why this is a proxy and not an <img src="https://icons.…"> in the page:
 * loading a third-party icon straight from the browser tells that third party
 * exactly which tools each of our clients uses, on every page view. Casey's
 * CoStar and Crexi subscriptions are his business and nobody else's. The fetch
 * happens here instead, so the browser only ever talks to us.
 *
 * SSRF-safe by construction: the hostname is validated and then interpolated
 * into a FIXED upstream host. There is no path where a caller chooses the URL
 * we fetch.
 */

// Two sources, both hit from OUR server. DuckDuckGo first because it serves
// the higher-resolution mark when it has one (Crexi 17 kB vs 744 B), Google
// second because it has domains DuckDuckGo does not — CoStar being exactly
// that case, and the tool our first client cares most about.
const SOURCES = [
  (host: string) => `https://icons.duckduckgo.com/ip3/${host}.ico`,
  (host: string) => `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
];

// Upstreams we will fetch a ready-made logo URL from. An allowlist, not a
// pattern: `?u=` must resolve to one of these exact hosts or it is refused.
// Without this the endpoint would be an open proxy.
const ALLOWED_LOGO_HOSTS = new Set([
  "logos.composio.dev",
  "www.google.com",
  "icons.duckduckgo.com",
]);

/** An allowlisted absolute logo URL, or null. */
export function allowedLogoUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    if (!ALLOWED_LOGO_HOSTS.has(u.hostname.toLowerCase())) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// Hostnames only, and nothing that could resolve inside our own network.
const HOST_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/i;
const BLOCKED = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i;

/** "https://www.costar.com/search?x=1" -> "costar.com". Returns null if unusable. */
export function domainFromUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  let host: string;
  try {
    host = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/^www\./, "");
  if (!HOST_RE.test(host) || BLOCKED.test(host)) return null;
  return host;
}

// A 1x1 transparent gif. Returned instead of a 404 so the <img> onError path
// is reserved for real failures and a missing logo never draws a broken icon.
const BLANK = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function blank() {
  return new NextResponse(new Uint8Array(BLANK), {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      // Short cache on misses so a site that gains a favicon shows it soon.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(req: NextRequest) {
  // `u` is a ready-made logo URL (Composio's mark for one of its apps).
  // `d` is a bare domain we resolve ourselves. Either way WE do the fetching.
  const direct = allowedLogoUrl(req.nextUrl.searchParams.get("u"));
  const host = domainFromUrl(req.nextUrl.searchParams.get("d"));
  if (!direct && !host) return blank();

  const attempts = direct ? [() => direct] : SOURCES.map((f) => () => f(host!));

  for (const build of attempts) {
    try {
      const upstream = await fetch(build(), {
        // Never forward anything identifying about the client.
        headers: { Accept: "image/*" },
        signal: AbortSignal.timeout(4000),
        cache: "force-cache",
      });
      // A 404 here still carries a placeholder body, so status is checked
      // before bytes — otherwise every unknown domain gets a grey globe.
      if (!upstream.ok) continue;

      const type = upstream.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) continue;

      const body = new Uint8Array(await upstream.arrayBuffer());
      // An empty or absurd payload is a miss dressed as a hit.
      if (body.byteLength < 64 || body.byteLength > 512_000) continue;

      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": type,
          // Logos change about never; a day at the edge and a week stale-while
          // -revalidate keeps this off the critical path.
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    } catch {
      // Try the next source rather than giving up on the first timeout.
    }
  }
  return blank();
}
