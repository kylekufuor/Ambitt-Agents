import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  // Dev impersonation — view any client's real portal without their OTP.
  // DOUBLE-GATED: only fires when NODE_ENV=development AND PORTAL_DEV_AS is
  // set to an email. Inert in production (Railway runs NODE_ENV=production).
  // Usage: cd client-portal && PORTAL_DEV_AS=client@email npm run dev
  if (process.env.NODE_ENV === "development" && process.env.PORTAL_DEV_AS) {
    const devClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (devClient.auth as any).getUser = async () => ({
      data: { user: { email: process.env.PORTAL_DEV_AS, id: "dev-impersonation" } },
      error: null,
    });
    return devClient;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — can't set cookies
          }
        },
      },
    }
  );
}
