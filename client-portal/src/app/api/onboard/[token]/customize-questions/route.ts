import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/db";

/**
 * Portal proxy → Oracle's adaptive-intake endpoint.
 *
 * Token in the URL is the auth (no Supabase session — prospects don't have
 * accounts). Looks up Prospect.id from the token, then POSTs to Oracle's
 * /onboarding/prospects/:id/customize-questions.
 *
 * Returns Oracle's response verbatim (questions JSON + status). Synchronous
 * — Atlas takes ~5-15s on first generation, <1s on cached re-fetch.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;

  const prospect = await prisma.prospect.findUnique({
    where: { token },
    select: { id: true, status: true },
  });
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (prospect.status === "archived" || prospect.status === "ghosted") {
    return NextResponse.json({ error: "Onboarding closed" }, { status: 403 });
  }

  const oracleBase =
    process.env.ORACLE_URL ??
    process.env.NEXT_PUBLIC_ORACLE_URL ??
    "https://oracle-production-c0ff.up.railway.app";

  const upstream = await fetch(
    `${oracleBase}/onboarding/prospects/${prospect.id}/customize-questions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    }
  ).catch((err) => {
    console.error("[onboard/customize-questions] Oracle call failed", err);
    return null;
  });

  if (!upstream) {
    return NextResponse.json({ error: "Could not reach Oracle" }, { status: 502 });
  }

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
