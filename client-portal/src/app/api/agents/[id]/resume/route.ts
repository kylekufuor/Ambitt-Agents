import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

// A resume from the portal carries CLIENT authority — `requester: "client"`.
// Oracle will only clear a pause the client placed themselves; a safety halt
// (spike detector, outbound seatbelt, budget cap) or a halt we put in place
// stays held and comes back as a 403.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]/resume">) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const res = await fetch(`${oracleUrl()}/agents/${id}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requester: "client" }),
  });
  const body = (await res.json().catch(() => ({ error: "Oracle returned non-JSON" }))) as {
    error?: string;
    pausedBy?: string | null;
  };

  // Oracle's denial message is written for our ops view. Say it to the client
  // in plain English instead, without exposing the internals.
  if (res.status === 403 && (body.pausedBy === "system" || body.pausedBy === "operator" || body.pausedBy == null)) {
    return NextResponse.json(
      {
        error:
          "We've got this one on hold while we check something on our side. Reply to your agent's last email or write to support@ambitt.agency and we'll get it running again.",
      },
      { status: 403 }
    );
  }

  return NextResponse.json(body, { status: res.status });
}
