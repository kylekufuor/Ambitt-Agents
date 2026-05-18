import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/db";

function oracleUrl(): string {
  return process.env.ORACLE_URL
    ?? process.env.NEXT_PUBLIC_ORACLE_URL
    ?? "https://oracle-production-c0ff.up.railway.app";
}

/**
 * Prospect form submission.
 *
 * Token in the URL is the auth (no Supabase session — prospects don't have
 * accounts yet). Body is `{ values: Record<string, string> }`. We lift a
 * handful of convenience fields out to top-level columns for indexing and
 * downstream display; everything else lives in Prospect.formData.
 *
 * On success, the Prospect row is updated and the status moves to
 * `awaiting_presentation`. The Oracle webhook to trigger Atlas's first run is
 * wired in a follow-up task — for now we just persist and respond.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/onboard/[token]/submit">
) {
  const { token } = await ctx.params;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !body.values || typeof body.values !== "object") {
    return NextResponse.json({ error: "values object required" }, { status: 400 });
  }

  const prospect = await prisma.prospect.findUnique({ where: { token } });
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (prospect.status === "archived" || prospect.status === "ghosted") {
    return NextResponse.json({ error: "Onboarding closed" }, { status: 403 });
  }

  const values = body.values as Record<string, string>;

  // Lift convenience fields out — these are indexed/displayed elsewhere.
  // Everything else lives in formData.
  const {
    contactName,
    businessName,
    role,
    website,
    email: _email, // intentionally not updatable from the form
    ...formData
  } = values;

  await prisma.prospect.update({
    where: { id: prospect.id },
    data: {
      contactName: contactName?.trim() || prospect.contactName,
      businessName: businessName?.trim() || prospect.businessName,
      role: role?.trim() || prospect.role,
      website: website?.trim() || prospect.website,
      formData: { ...(prospect.formData as object), ...formData } as object,
      status: "discovery_complete",
      lastActivityAt: new Date(),
    },
  });

  // Fire-and-forget — Atlas generation can take 20–60s. We return 200 to the
  // browser immediately so the prospect sees the "Got it" confirmation; the
  // presentation email lands in their inbox when Atlas finishes.
  fetch(`${oracleUrl()}/onboarding/prospects/${prospect.id}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "form_submitted" }),
  }).catch((err) => {
    console.error("[onboard/submit] Oracle ping failed", err);
  });

  return NextResponse.json({ ok: true });
}
