import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

// A pause from the portal is a CLIENT pause — `by: "client"` is what tells
// Oracle that. It's the weakest halt on purpose: it never downgrades an
// operator or system (spike / seatbelt / budget) halt, and only the client or
// our team can lift it.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]/pause">) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const res = await fetch(`${oracleUrl()}/agents/${id}/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ by: "client", reason: "Paused by the client from the portal" }),
  });
  const body = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(body, { status: res.status });
}
