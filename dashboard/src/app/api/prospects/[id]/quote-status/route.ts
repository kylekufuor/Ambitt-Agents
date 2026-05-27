import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/db";

// Lightweight polling endpoint for the Quote-progress panel. Reads Prisma
// directly (middleware gates auth). Unlike the PRD pipeline, quote generation
// has no instrumentation columns and no auto-retry cron — so all we expose is
// "did the prospect's PRD get approved" (start signal) and "is there a draft
// yet" (done signal). The panel times itself off `prdApprovedAt`.

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const prospect = await prisma.prospect.findUnique({
    where: { id },
    select: {
      prdApprovedAt: true,
      quoteDraft: true,
    },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  return NextResponse.json({
    hasQuote: prospect.quoteDraft !== null,
    prdApprovedAt: prospect.prdApprovedAt?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
  });
}
