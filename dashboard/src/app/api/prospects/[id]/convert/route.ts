import { NextResponse, type NextRequest } from "next/server";

// Dashboard proxy → Oracle convert endpoint. Phase D: triggers
// Prospect → Client conversion + Agent scaffold in pending_approval +
// tools-handoff email to the new client.
//
// Phase C will eventually replace this manual trigger with a Stripe
// webhook calling the same Oracle endpoint.

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const upstream = await fetch(`${oracleUrl()}/onboarding/prospects/${id}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }).catch((err) => {
    console.error("[dashboard/convert] Oracle call failed", err);
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
