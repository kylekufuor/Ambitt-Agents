import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/agents/[id]/tool-requests">) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const toolName = typeof body?.toolName === "string" ? body.toolName.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!toolName) return NextResponse.json({ error: "Tool name is required" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "A short reason is required" }, { status: 400 });

  const res = await fetch(`${oracleUrl()}/agents/${id}/tool-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName, reason }),
  });
  const respBody = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(respBody, { status: res.status });
}
