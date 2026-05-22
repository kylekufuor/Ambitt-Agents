import { NextResponse, type NextRequest } from "next/server";

/**
 * Portal proxy → Oracle's prospect find-or-create endpoint.
 *
 * Lives at /api/onboard/find-or-create (no token). Middleware bypasses
 * /api/onboard/** so this is reachable to anonymous visitors who land on
 * the public /onboard page and submit name + email.
 *
 * Why proxy instead of calling Oracle direct from the browser: same-origin
 * (no CORS surface for clients to worry about), and we can attach cookies
 * or rate-limit here later without changing the public form.
 */
export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL
    ?? process.env.NEXT_PUBLIC_ORACLE_URL
    ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : undefined;
  const email = typeof body.email === "string" ? body.email : undefined;

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const upstream = await fetch(`${oracleUrl()}/onboarding/prospects/find-or-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  }).catch((err) => {
    console.error("[onboard/find-or-create] Oracle call failed", err);
    return null;
  });

  if (!upstream) {
    return NextResponse.json({ error: "Could not reach onboarding service" }, { status: 502 });
  }
  // Forward whatever Oracle said — its body shape is the contract.
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
