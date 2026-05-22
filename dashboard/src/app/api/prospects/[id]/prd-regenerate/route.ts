import { NextResponse, type NextRequest } from "next/server";

// Dashboard proxy → Oracle PRD regeneration. Forwards Kyle's regen notes
// to Oracle, which re-runs Atlas in the background (~2 min). The PRD page
// surfaces a "regen kicked off" notice so the user knows to refresh later.

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  if (!notes) {
    return NextResponse.json({ error: "notes required" }, { status: 400 });
  }

  const upstream = await fetch(`${oracleUrl()}/onboarding/prospects/${id}/generate-prd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regenNotes: notes }),
  }).catch((err) => {
    console.error("[dashboard/prd-regenerate] Oracle call failed", err);
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
