import { NextResponse, type NextRequest } from "next/server";

// Thin proxy to Oracle's POST /improvements/:id/reject.

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  let upstreamBody: string;
  try {
    const json = await req.json().catch(() => ({}));
    upstreamBody = JSON.stringify(json ?? {});
  } catch {
    upstreamBody = "{}";
  }
  const upstream = await fetch(`${oracleUrl()}/improvements/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: upstreamBody,
    cache: "no-store",
  }).catch((err) => {
    console.error("[dashboard/improvements reject] Oracle POST failed", err);
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
