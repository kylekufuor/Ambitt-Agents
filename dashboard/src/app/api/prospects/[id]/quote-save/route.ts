import { NextResponse, type NextRequest } from "next/server";

// Proxies Kyle's quote edits to Oracle. Oracle validates via Zod before
// writing to Prisma — kept single-sourced so we don't drift between
// dashboard/portal/oracle Prisma copies.

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.text(); // pass through raw — Oracle re-parses

  const upstream = await fetch(`${oracleUrl()}/onboarding/prospects/${id}/quote-save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch((err) => {
    console.error("[dashboard/quote-save] Oracle call failed", err);
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
