import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]/pause">) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const res = await fetch(`${oracleUrl()}/agents/${id}/pause`, { method: "POST" });
  const body = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(body, { status: res.status });
}
