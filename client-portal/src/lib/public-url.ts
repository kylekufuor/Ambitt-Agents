import type { NextRequest } from "next/server";

/**
 * The PUBLIC origin the client is actually browsing — e.g.
 * "https://portal.ambitt.agency" — reconstructed from the proxy's forwarded
 * host headers.
 *
 * Why this exists: `new URL(req.url).origin` inside a Route Handler does NOT
 * survive Railway's reverse proxy. The Next.js server sees the container's
 * internal request, so that origin resolves to "http://localhost:3000".
 * Anything the browser gets redirected to (an OAuth callback URL handed to
 * Composio, a Supabase auth redirect) then points at the client's OWN machine
 * → ERR_CONNECTION_REFUSED. This is exactly what broke Casey's Gmail connect.
 *
 * The middleware already proves `req.headers.get("host")` is the real public
 * host in this deployment (it routes chat.ambitt.agency off it), so we trust
 * the forwarded host headers, and only fall back to a configured URL or the
 * raw origin if they're somehow absent.
 */
export function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(host);
    const proto = req.headers.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
    return `${proto}://${host}`;
  }
  const configured =
    process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.CLIENT_PORTAL_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin;
}
