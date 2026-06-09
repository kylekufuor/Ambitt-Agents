import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/db";

// Operator review on a DryRunLog row. Body:
//   { logId: string, reviewedOk: boolean, note?: string }
// Sets reviewedAt + reviewedOk + reviewNote. Idempotent — operator can
// re-review an existing row.

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await ctx.params;

  let body: { logId?: unknown; reviewedOk?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.logId !== "string" || typeof body.reviewedOk !== "boolean") {
    return NextResponse.json(
      { error: "logId (string) and reviewedOk (boolean) are required" },
      { status: 400 }
    );
  }

  // Belt-and-suspenders: confirm the log row actually belongs to this agent
  // (URL ID), so a stray logId can't update someone else's capture.
  const log = await prisma.dryRunLog.findUnique({
    where: { id: body.logId },
    select: { id: true, agentId: true },
  });
  if (!log) {
    return NextResponse.json({ error: "DryRunLog not found" }, { status: 404 });
  }
  if (log.agentId !== agentId) {
    return NextResponse.json({ error: "Log does not belong to this agent" }, { status: 403 });
  }

  const note = typeof body.note === "string" && body.note.trim().length > 0 ? body.note.trim() : null;

  const updated = await prisma.dryRunLog.update({
    where: { id: body.logId },
    data: {
      reviewedAt: new Date(),
      reviewedOk: body.reviewedOk,
      reviewNote: note,
    },
    select: { id: true, reviewedAt: true, reviewedOk: true, reviewNote: true },
  });

  return NextResponse.json({
    id: updated.id,
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    reviewedOk: updated.reviewedOk,
    reviewNote: updated.reviewNote,
  });
}
