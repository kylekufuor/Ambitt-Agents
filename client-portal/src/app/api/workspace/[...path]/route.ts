import { NextRequest, NextResponse } from "next/server";
import { requirePortalContext } from "@/lib/portal-context";
import { oracleUrl } from "@/lib/agent-auth";
import { signWorkspaceRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  // Same-origin mutations only; auth cookies must never act as a public proxy.
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (
      !origin ||
      new URL(origin).host !== host ||
      req.headers.get("sec-fetch-site") === "cross-site"
    )
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { client, agent } = await requirePortalContext();
  if (!agent)
    return NextResponse.json(
      { error: "Your agent is still being set up." },
      { status: 409 },
    );
  const { path: parts } = await ctx.params;
  if (parts.some((p) => !/^[a-zA-Z0-9_-]+$/.test(p)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const path = `/workspace/${parts.join("/")}${req.nextUrl.search}`;
  const body = req.method === "GET" ? "" : await req.text();
  if (Buffer.byteLength(body) > 7_000_000)
    return NextResponse.json(
      { error: "Files must be smaller than 5 MB." },
      { status: 413 },
    );
  try {
    const token = signWorkspaceRequest(
      client.id,
      agent.id,
      req.method,
      path,
      body,
    );
    const res = await fetch(`${oracleUrl()}${path}`, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body || undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(95_000),
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The workspace service did not respond. Please try again." },
      { status: 502 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
