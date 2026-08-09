import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client for the operator dashboard.
 *
 * `rememberDevice` controls how long the session cookie lives:
 *   true  -> 90 days, so this machine stops asking for a code every visit
 *   false -> a session cookie, gone when the browser closes
 *
 * `isSingleton: false` is load-bearing, not tidiness. createBrowserClient
 * caches one instance by default, so a second call silently returns the first
 * and ignores these options — the remember box would look wired and do
 * nothing. The client portal learned this the same way.
 */
export function createClient(opts?: { rememberDevice?: boolean }) {
  const base = [
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ] as const;

  if (opts === undefined) return createBrowserClient(...base);

  return createBrowserClient(...base, {
    isSingleton: false,
    cookieOptions: opts.rememberDevice
      ? { maxAge: 60 * 60 * 24 * 90, sameSite: "lax", secure: true, path: "/" }
      : // No maxAge at all = a session cookie. Do NOT pass maxAge: 0, which
        // tells the browser to delete it immediately and signs you straight
        // back out.
        { sameSite: "lax", secure: true, path: "/" },
  });
}
