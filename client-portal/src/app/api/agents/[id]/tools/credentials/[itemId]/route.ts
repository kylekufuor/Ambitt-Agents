import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/agents/[id]/tools/credentials/[itemId]">
) {
  const { id, itemId } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.fieldValues || typeof body.fieldValues !== "object") {
    return NextResponse.json({ error: "fieldValues object required" }, { status: 400 });
  }

  const res = await fetch(
    `${oracleUrl()}/agents/${id}/tools/credentials/${encodeURIComponent(itemId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldValues: body.fieldValues }),
    }
  );
  const respBody = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(respBody, { status: res.status });
}
