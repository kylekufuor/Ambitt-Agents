import { NextResponse, type NextRequest } from "next/server";

// Thin proxy to Oracle's POST /builds/:id/cancel.

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const upstream = await fetch(`${oracleUrl()}/builds/${id}/cancel`, {
    method: "POST",
    cache: "no-store",
  }).catch((err) => {
    console.error("[dashboard/builds cancel] Oracle POST failed", err);
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
