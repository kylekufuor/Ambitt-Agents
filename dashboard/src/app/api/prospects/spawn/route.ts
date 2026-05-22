import { NextResponse, type NextRequest } from "next/server";

// Dashboard "spawn prospect" → proxies to Oracle find-or-create with
// sendEmail=true. Atlas emails the prospect their personal /onboard/[token]
// link immediately so Kyle doesn't have to copy-paste anything.

export const runtime = "nodejs";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : undefined;
  const email = typeof body.email === "string" ? body.email : undefined;

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const upstream = await fetch(`${oracleUrl()}/onboarding/prospects/find-or-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, sendEmail: true }),
  }).catch((err) => {
    console.error("[dashboard/prospects/spawn] Oracle call failed", err);
    return null;
  });

  if (!upstream) {
    return NextResponse.json({ error: "Could not reach Oracle" }, { status: 502 });
  }
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
