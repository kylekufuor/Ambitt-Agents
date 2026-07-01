import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

// Disconnect / remove a tool from the agent. custom → delete stored credentials;
// oauth (Composio) → delete all of that app's connections. Auth: Supabase
// session + agent-ownership.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const toolId = body?.toolId;
  const appName = body?.appName;
  if (!toolId && !appName) {
    return NextResponse.json({ error: "toolId or appName is required" }, { status: 400 });
  }

  const res = await fetch(`${oracleUrl()}/agents/${id}/tools/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolId, appName }),
  }).catch(() => null);

  if (!res) return NextResponse.json({ error: "Could not reach Oracle" }, { status: 502 });
  const data = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  if (!res.ok) return NextResponse.json({ error: data.error ?? "Disconnect failed" }, { status: res.status });
  return NextResponse.json(data);
}
