import { NextResponse } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

// Proxy for "Things you can ask {agent}" examples. Oracle is cache-first and
// generates on first call, so this can be slow (~10s) exactly once per agent,
// then instant. Owner-only.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const res = await fetch(`${oracleUrl()}/agents/${id}/example-emails`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(body, { status: res.status });
}
