import { NextResponse } from "next/server";

// Mints a short-lived signed WebSocket URL for the Atlas voice agent.
// The ElevenLabs API key never reaches the browser — the client fetches
// this route, gets a 15-minute signed URL, and opens the session with it.
//
// 503 when voice isn't configured (no key / no agent id) — the orb falls
// back to the radial menu in that case.

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ATLAS_VOICE_AGENT_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: "Atlas voice is not configured (ELEVENLABS_API_KEY / ATLAS_VOICE_AGENT_ID missing)" },
      { status: 503 }
    );
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    {
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    }
  ).catch((err) => {
    console.error("[atlas-voice] signed-url fetch failed", err);
    return null;
  });

  if (!upstream || !upstream.ok) {
    const detail = upstream ? await upstream.text().catch(() => "") : "network error";
    console.error("[atlas-voice] signed-url upstream error", upstream?.status, detail.slice(0, 300));
    return NextResponse.json({ error: "Could not mint signed URL" }, { status: 502 });
  }

  const body = (await upstream.json()) as { signed_url?: string };
  if (!body.signed_url) {
    return NextResponse.json({ error: "Upstream returned no signed_url" }, { status: 502 });
  }

  return NextResponse.json({ signedUrl: body.signed_url });
}
