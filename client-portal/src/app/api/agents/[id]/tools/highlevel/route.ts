import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";
import { signToolConnection } from "@/lib/tool-connection-auth";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || JSON.stringify(body).length > 4096) {
    return NextResponse.json({ error: "Enter your connection details." }, { status: 400 });
  }
  try {
    const res = await fetch(`${oracleUrl()}/agents/${encodeURIComponent(id)}/tools/highlevel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tool-Connection-Auth": signToolConnection(auth.clientId, id, body) },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(45_000),
    });
    return NextResponse.json(await res.json(), { status: res.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "We couldn't reach your connection service. Try again shortly." }, { status: 502 });
  }
}
