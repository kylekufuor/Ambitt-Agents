import { NextResponse, type NextRequest } from "next/server";

// Triggers the Send flow: Oracle flips status to quote_sent + emails the
// prospect a teaser linking to /quotes/[token].

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const upstream = await fetch(`${oracleUrl()}/onboarding/prospects/${id}/quote-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }).catch((err) => {
    console.error("[dashboard/quote-send] Oracle call failed", err);
    return null;
  });

  if (!upstream) {
    return NextResponse.json({ error: "Could not reach Oracle" }, { status: 502 });
  }
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
