import { NextResponse, type NextRequest } from "next/server";

// Thin proxy to Oracle's POST /agents/:id/dry-run. Body { scenario, label? }
// passed through verbatim. Oracle owns the run logic + capture labelling.

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  let body: string;
  try {
    const json = await req.json();
    body = JSON.stringify(json ?? {});
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const upstream = await fetch(`${oracleUrl()}/agents/${id}/dry-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  }).catch((err) => {
    console.error("[dashboard/dry-run] Oracle call failed", err);
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
