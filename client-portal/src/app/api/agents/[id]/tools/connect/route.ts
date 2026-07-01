import { NextResponse, type NextRequest } from "next/server";
import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";
import { publicOrigin } from "@/lib/public-url";

// Initiate an OAuth connection for a Composio tool (Gmail, Google Drive, …).
// The client clicks "Connect" on the Tools page; we ask Oracle for a Composio
// OAuth link, scoped to this client, with a redirect back to the Tools page.
// The browser then navigates to that link (Google consent), and Composio
// redirects back here with the connection live.
//
// Auth: Supabase session + agent-ownership check (verifyAgentOwnership).

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const appName = body?.appName;
  const force = !!body?.force; // "Add another account" — connect a second inbox
  if (!appName || typeof appName !== "string") {
    return NextResponse.json({ error: "appName required" }, { status: 400 });
  }

  // Bring the client back to this exact Tools page after Google consent, with
  // a marker so the page can re-fetch + confirm the connection landed.
  // MUST use the public origin (not new URL(req.url).origin, which is the
  // container's internal localhost behind Railway's proxy) — otherwise Composio
  // redirects the client to their own machine after consent.
  const origin = publicOrigin(req);
  const redirectUrl = `${origin}/agents/${id}/tools?connected=${encodeURIComponent(appName)}`;

  const res = await fetch(`${oracleUrl()}/composio/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: auth.clientId, appName, redirectUrl, force }),
  }).catch(() => null);

  if (!res) return NextResponse.json({ error: "Could not reach Oracle" }, { status: 502 });

  const data = await res.json().catch(() => ({ error: "Oracle returned non-JSON" }));
  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? `Connect failed (${res.status})` }, { status: res.status });
  }

  // Oracle returns { redirectUrl, connectionId, alreadyConnected? }.
  // redirectUrl is the Composio OAuth URL the browser should navigate to.
  return NextResponse.json({
    oauthUrl: data.redirectUrl ?? "",
    alreadyConnected: data.alreadyConnected ?? false,
  });
}
