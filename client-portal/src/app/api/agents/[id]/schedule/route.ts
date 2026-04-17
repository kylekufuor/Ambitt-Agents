import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/agents/[id]/schedule">) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const schedule = typeof body?.schedule === "string" ? body.schedule : null;
  if (!schedule) {
    return NextResponse.json({ error: "Missing 'schedule'" }, { status: 400 });
  }

  const res = await fetch(`${oracleUrl()}/agents/${id}/schedule`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schedule }),
  });
  const respBody = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(respBody, { status: res.status });
}
