import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/db";

// Flip Agent.dryRun on/off. Body: { dryRun: boolean }. Dashboard-only
// surface — direct Prisma write (middleware gates auth). Oracle reads
// the flag at runtime via shared/email.ts + tool-bridge.ts intercepts;
// no Oracle round-trip needed for the flag itself.

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  let body: { dryRun?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.dryRun !== "boolean") {
    return NextResponse.json(
      { error: "dryRun (boolean) is required" },
      { status: 400 }
    );
  }

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: { id: true, dryRun: true, status: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const updated = await prisma.agent.update({
    where: { id },
    data: { dryRun: body.dryRun },
    select: { id: true, dryRun: true, status: true },
  });

  return NextResponse.json({
    id: updated.id,
    dryRun: updated.dryRun,
    status: updated.status,
  });
}
