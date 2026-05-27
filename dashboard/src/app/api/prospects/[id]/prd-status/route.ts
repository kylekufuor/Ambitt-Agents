import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/db";

// Lightweight polling endpoint for the PRD-progress panel on
// prospects/[id]/prd. Reads Prisma directly (middleware already gates auth);
// no Oracle round-trip. The panel polls this every ~15s while Atlas is
// running and stops as soon as `hasPRD` flips true or `failedAt` lands.

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const prospect = await prisma.prospect.findUnique({
    where: { id },
    select: {
      prdGenerationAttempts: true,
      prdLastAttemptAt: true,
      prdGeneratedAt: true,
      prdGenerationFailedAt: true,
      prdData: true,
    },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  return NextResponse.json({
    hasPRD: prospect.prdData !== null,
    attempts: prospect.prdGenerationAttempts,
    lastAttemptAt: prospect.prdLastAttemptAt?.toISOString() ?? null,
    generatedAt: prospect.prdGeneratedAt?.toISOString() ?? null,
    failedAt: prospect.prdGenerationFailedAt?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
  });
}
