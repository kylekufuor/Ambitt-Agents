import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

// Client-configurable agent config. Mirrors Oracle's allowlist — anything
// not listed here is rejected before we even reach Oracle.
const ALLOWED_KEYS = new Set(["tone", "emailFrequency", "digestHour", "digestDayOfWeek"]);

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/agents/[id]/config">) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (ALLOWED_KEYS.has(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: "No allowed config fields provided" }, { status: 400 });
  }

  const res = await fetch(`${oracleUrl()}/agents/${id}/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filtered),
  });
  const respBody = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(respBody, { status: res.status });
}
