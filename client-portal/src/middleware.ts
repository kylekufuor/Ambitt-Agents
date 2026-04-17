import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Subdomain routing: chat.ambitt.agency is served from the same Next.js app
// as clients.ambitt.agency. When the request comes in on the chat subdomain,
// rewrite `/path` → `/chat/path` internally so it hits the `/chat/[agentId]`
// route tree. Auth on that path is token-based (HMAC), not Supabase —
// skip the session redirect entirely for chat traffic.
function isChatHost(host: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  return h === "chat.ambitt.agency" || h.startsWith("chat.localhost");
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host");

  // --- Chat subdomain path ---
  if (isChatHost(host)) {
    const url = request.nextUrl.clone();
    // If we already rewrote this request once, don't double-prefix.
    if (!url.pathname.startsWith("/chat")) {
      url.pathname = url.pathname === "/" ? "/chat" : `/chat${url.pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next({ request });
  }

  // --- Portal (clients.ambitt.agency) — Supabase-gated ---
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname.startsWith("/api/auth")
  ) {
    return supabaseResponse;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
