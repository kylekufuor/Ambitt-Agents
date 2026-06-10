import { NextResponse, type NextRequest } from "next/server";

// Thin proxy to Oracle's POST /improvements/:id/revert.

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const upstream = await fetch(`${oracleUrl()}/improvements/${id}/revert`, {
    method: "POST",
    cache: "no-store",
  }).catch((err) => {
    console.error("[dashboard/improvements revert] Oracle POST failed", err);
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
