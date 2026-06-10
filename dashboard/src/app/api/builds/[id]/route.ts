import { NextResponse, type NextRequest } from "next/server";

// Thin proxy to Oracle's GET /builds/:id for client-side polling.

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const upstream = await fetch(`${oracleUrl()}/builds/${id}`, {
    method: "GET",
    cache: "no-store",
  }).catch((err) => {
    console.error("[dashboard/builds] Oracle GET failed", err);
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
