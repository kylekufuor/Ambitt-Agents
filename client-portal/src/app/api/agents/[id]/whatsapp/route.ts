import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";

// Native WhatsApp MFA-relay setup — the client saves their number + consent so
// their agent can text them a verification request and capture the reply in
// seconds (vs email's minutes). NOT a Composio connection; it's the platform's
// own Twilio channel. Auth: Supabase session + agent-ownership.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const res = await fetch(`${oracleUrl()}/agents/${id}/whatsapp`, { cache: "no-store" }).catch(() => null);
  if (!res) return NextResponse.json({ error: "Could not reach Oracle" }, { status: 502 });
  const data = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const res = await fetch(`${oracleUrl()}/agents/${id}/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ whatsappNumber: body?.whatsappNumber ?? "", consent: body?.consent === true }),
  }).catch(() => null);

  if (!res) return NextResponse.json({ error: "Could not reach Oracle" }, { status: 502 });
  const data = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  return NextResponse.json(data, { status: res.status });
}
