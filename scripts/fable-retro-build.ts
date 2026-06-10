// scripts/fable-retro-build.ts
//
// Fire an Atlas-on-Fable retro build for a prospect that's already gone
// through the funnel (PRD approved + quote accepted), for side-by-side
// comparison vs the operator-built version of the agent.
//
// Usage:
//   tsx scripts/fable-retro-build.ts <prospectId>
//   tsx scripts/fable-retro-build.ts --by-email caseylitsey@... (Casey/Arthur)
//   tsx scripts/fable-retro-build.ts --by-email hello@ambittmedia.com (Francis)
//
// What it does:
//   1. Validates the prospect has prdApprovedAt + quoteAcceptedAt set.
//   2. Skips if there's already a queued/running Build for the prospect.
//   3. Creates a fresh Build row (tagged `retro=true` in metadata so the
//      dashboard can show "retro validation build" instead of a normal one).
//   4. Calls kickoffBuild — Atlas-on-Fable runs the full playbook + produces
//      a candidate Agent in status=building + dryRun=true.
//   5. Prints the Build ID + the candidate Agent ID so the operator can
//      open both /agents/[id]/dry-run pages side-by-side for comparison.
//
// Per Phase 7 plan: only operator-fired (no auto-trigger); validation-only;
// the candidate Agent stays in dryRun forever unless the operator promotes it.

import "dotenv/config";
import prisma from "../shared/db.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: tsx scripts/fable-retro-build.ts <prospectId | --by-email <email>>");
    process.exitCode = 1;
    return;
  }

  let prospect: { id: string; contactName: string | null; businessName: string | null } | null;

  if (args[0] === "--by-email" && args[1]) {
    prospect = await prisma.prospect.findUnique({
      where: { email: args[1] },
      select: { id: true, contactName: true, businessName: true },
    });
  } else {
    prospect = await prisma.prospect.findUnique({
      where: { id: args[0] },
      select: { id: true, contactName: true, businessName: true },
    });
  }

  if (!prospect) {
    console.error(`[fable-retro-build] Prospect not found.`);
    process.exitCode = 1;
    return;
  }

  // Re-fetch with the full shape we need.
  const full = await prisma.prospect.findUnique({
    where: { id: prospect.id },
    select: {
      id: true,
      email: true,
      contactName: true,
      businessName: true,
      status: true,
      prdData: true,
      prdApprovedAt: true,
      quoteDraft: true,
      quoteAcceptedAt: true,
      convertedClientId: true,
    },
  });
  if (!full) {
    console.error(`[fable-retro-build] Prospect not found on second fetch.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n[fable-retro-build] Prospect ${full.id}`);
  console.log(`  ${full.contactName ?? "(unknown)"} · ${full.businessName ?? "(unknown)"}`);
  console.log(`  email: ${full.email}`);
  console.log(`  status: ${full.status}`);
  console.log(`  prdApprovedAt: ${full.prdApprovedAt?.toISOString() ?? "(unset)"}`);
  console.log(`  quoteAcceptedAt: ${full.quoteAcceptedAt?.toISOString() ?? "(unset)"}`);
  console.log(`  convertedClientId: ${full.convertedClientId ?? "(unset)"}`);

  if (!full.prdApprovedAt) {
    console.error(`\n[fable-retro-build] PRD not approved. Cannot fire retro build.`);
    process.exitCode = 1;
    return;
  }
  if (!full.quoteAcceptedAt) {
    console.error(`\n[fable-retro-build] Quote not accepted. Cannot fire retro build.`);
    process.exitCode = 1;
    return;
  }

  // Skip if a queued/running build already exists.
  const existing = await prisma.build.findFirst({
    where: { prospectId: full.id, status: { in: ["queued", "running"] } },
    select: { id: true, status: true, createdAt: true },
  });
  if (existing) {
    console.error(
      `\n[fable-retro-build] Build ${existing.id} is already ${existing.status} for this prospect (created ${existing.createdAt.toISOString()}). Wait for it to finish or cancel it first.`
    );
    process.exitCode = 1;
    return;
  }

  // Create the Build row.
  const budgetCents = Number(process.env.FABLE_BUILD_BUDGET_CENTS ?? "20000");
  const build = await prisma.build.create({
    data: {
      prospectId: full.id,
      status: "queued",
      budgetCents,
    },
  });
  console.log(`\n[fable-retro-build] Build ${build.id} queued (budget $${(budgetCents / 100).toFixed(2)}).`);

  // Fire kickoff. Same path the prod /builds POST uses.
  const { kickoffBuild } = await import("../oracle/builds/orchestrator.js");
  try {
    await kickoffBuild(build.id);
  } catch (err) {
    console.error(
      `[fable-retro-build] kickoffBuild threw: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Refresh + print.
  const refreshed = await prisma.build.findUnique({
    where: { id: build.id },
    select: {
      status: true,
      sessionId: true,
      environmentId: true,
      agentId: true,
      failureReason: true,
    },
  });

  console.log(`\n[fable-retro-build] Build state after kickoff:`);
  console.log(`  status: ${refreshed?.status}`);
  console.log(`  sessionId: ${refreshed?.sessionId ?? "(unset)"}`);
  console.log(`  environmentId: ${refreshed?.environmentId ?? "(unset)"}`);
  console.log(`  agentId: ${refreshed?.agentId ?? "(unset, Atlas hasn't called create_candidate_agent yet)"}`);
  if (refreshed?.failureReason) {
    console.log(`  failureReason: ${refreshed.failureReason}`);
  }

  console.log(`\nTrack progress:`);
  console.log(`  Dashboard: /agents/[candidateAgentId]/dry-run`);
  console.log(`  Oracle:    GET /builds/${build.id}`);
  console.log(`  Cron poll: every minute (next tick updates cost + checks idle).`);
  console.log(``);
  console.log(`To compare side-by-side against the operator-built agent:`);
  console.log(`  1. Wait for Build.status to flip from "running" → "completed" or "failed".`);
  console.log(`  2. Open the candidate Agent at /agents/<candidateAgentId>.`);
  console.log(`  3. Open the operator-built Agent at /agents/<existingAgentId>.`);
  console.log(`  4. Diff personality / purpose / tools / scenarios visually.`);
  console.log(`  5. The candidate stays in dryRun forever unless you explicitly promote it.`);
}

main()
  .catch((err) => {
    console.error("[fable-retro-build] fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
