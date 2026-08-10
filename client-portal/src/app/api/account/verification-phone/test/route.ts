import { NextResponse, type NextRequest } from "next/server";
import { requirePortalContext } from "@/lib/portal-context";
import { signChatToken } from "@/lib/chat-token";
import { oracleUrl } from "@/lib/agent-auth";

/* ---------------------------------------------------------------------------
   "Send me a test text" — the client proves their own number works.

   Two routes, both authenticated by the portal session and then re-attested to
   Oracle with a signed token. The token is the load-bearing part: Oracle can
   send an SMS to whatever number is on a client record, so an endpoint that
   took a bare clientId would be a machine that texts strangers on demand. The
   session proves who is asking; the token carries that proof across the
   service boundary.

   POST        → send the text
   POST ?poll  → has the reply landed yet
   --------------------------------------------------------------------------- */

async function callOracle(path: string, token: string) {
  const res = await fetch(`${oracleUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return { status: 502, data: { error: "Could not reach us just now. Try again in a moment." } };
  const data = await res.json().catch(() => ({ error: "Unexpected response." }));
  return { status: res.status, data };
}

export async function POST(req: NextRequest) {
  const { client, agent } = await requirePortalContext();
  // agentId is part of the token's shape, not a permission — the test belongs
  // to the client, and a client mid-scaffold has no agent yet.
  const token = signChatToken(client.id, agent?.id ?? "none");

  const poll = req.nextUrl.searchParams.get("poll") === "1";
  const { status, data } = await callOracle(
    poll ? "/clients/verification-phone/test/result" : "/clients/verification-phone/test",
    token
  );
  return NextResponse.json(data, { status });
}
