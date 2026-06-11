import { NextResponse, type NextRequest } from "next/server";

// Re-runs Atlas's quote draft from scratch (against the current PRD).
// Used when Kyle wants Atlas to start over after deciding the draft is
// off — versus tweaking JSON inline. Optional { notes } body carries
// operator instructions Atlas applies as overrides ("increase the price
// by 30%", "tighten the scope items").

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const notes = typeof body?.notes === "string" ? body.notes : undefined;

  const upstream = await fetch(`${oracleUrl()}/onboarding/prospects/${id}/generate-quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notes ? { notes } : {}),
  }).catch((err) => {
    console.error("[dashboard/quote-regenerate] Oracle call failed", err);
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
