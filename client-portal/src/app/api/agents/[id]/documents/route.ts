import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

// Multipart proxy — stream the incoming FormData to Oracle unchanged after
// verifying the authed client owns the agent.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/agents/[id]/documents">) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const form = await req.formData();
  const res = await fetch(`${oracleUrl()}/agents/${id}/documents`, {
    method: "POST",
    body: form,
  });
  const body = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(body, { status: res.status });
}
