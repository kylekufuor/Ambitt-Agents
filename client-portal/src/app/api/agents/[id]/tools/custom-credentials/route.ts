import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

// Save credentials for a non-Composio (browser-login) tool — e.g. CoStar. The
// client types username/password on the Tools page; Oracle validates against
// the agent's declared custom-tool fields and stores them encrypted. Auth:
// Supabase session + agent-ownership.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const toolName = body?.toolName;
  const fields = body?.fields ?? body?.fieldValues;
  if (!toolName || typeof toolName !== "string" || !fields || typeof fields !== "object") {
    return NextResponse.json({ error: "toolName and fields are required" }, { status: 400 });
  }

  const res = await fetch(`${oracleUrl()}/agents/${id}/tools/custom-credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName, fields }),
  }).catch(() => null);

  if (!res) return NextResponse.json({ error: "Could not reach Oracle" }, { status: 502 });
  const data = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  if (!res.ok) return NextResponse.json({ error: data.error ?? "Save failed" }, { status: res.status });
  return NextResponse.json(data);
}
