import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client.
 *
 * `rememberDevice` controls how long the session cookie lives:
 *   true  -> 90 days, so a client on their own laptop stays signed in
 *   false -> a session cookie, gone when the browser closes
 *
 * `isSingleton: false` matters and is not decoration. createBrowserClient
 * caches one instance by default, so the SECOND call would silently return the
 * first one and quietly ignore these options — the remember-me box would look
 * wired and do nothing.
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
        // tells the browser to delete it immediately and logs the user
        // straight back out.
        { sameSite: "lax", secure: true, path: "/" },
  });
}
