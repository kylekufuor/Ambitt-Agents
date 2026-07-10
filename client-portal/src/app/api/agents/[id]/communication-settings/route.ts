import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

// Communication Settings — the agent's per-role channel routing (inbound
// allowlist / MFA relay / outbound identity) + outbound content policy
// (signature, footer, auto-BCC). GET returns saved settings + pickable options;
// PUT validates + saves. Auth: Supabase session + agent-ownership.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const res = await fetch(`${oracleUrl()}/agents/${id}/communication-settings`, {
    cache: "no-store",
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "Could not reach Oracle" }, { status: 502 });
  const data = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const res = await fetch(`${oracleUrl()}/agents/${id}/communication-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: body?.settings ?? body }),
  }).catch(() => null);

  if (!res) return NextResponse.json({ error: "Could not reach Oracle" }, { status: 502 });
  const data = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(data, { status: res.status });
}
