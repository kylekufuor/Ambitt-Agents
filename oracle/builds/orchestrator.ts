// oracle/builds/orchestrator.ts
//
// Atlas-on-Fable build orchestrator. One function: `kickoffBuild(buildId)`.
//
// Phase 1 (this file): create a Managed Agents session against the Atlas
// agent definition, send a placeholder message, persist sessionId +
// environmentId to the Build row, and let it ride. The full build playbook
// (Story-writer → Dev → Tester → Vera) lands in Phase 2 when we replace the
// `KICKOFF_PROMPT` constant + add stream-event handling.
//
// Designed to run fire-and-forget: the HTTP handler creates a queued Build
// row, calls this, and returns immediately. Errors here are caught, logged,
// and written to the Build row as `status="failed"` so the dashboard can show
// the failure without the HTTP layer needing to know.

import prisma from "../../shared/db.js";
import logger from "../../shared/logger.js";
import {
  createEnvironment,
  createSession,
  sendUserMessage,
  FABLE_MODEL_ID,
} from "../../shared/managed-agents/index.js";

// Atlas-on-Fable's agent_id is seeded by `scripts/seed-fable-agents.ts` and
// stashed in this env var. If unset, /builds POST fails fast with a clear
// error rather than silently spawning a no-op session.
const ATLAS_FABLE_AGENT_ID = () => process.env.ATLAS_FABLE_AGENT_ID;

// One Managed Agents environment per Ambitt-Agents deployment, cached as an
// env var. First build creates it; subsequent builds reuse. This keeps
// sandbox warm-start latency low and avoids the 60 rpm environment-create
// rate cap.
const SHARED_ENV_ID = () => process.env.FABLE_ENVIRONMENT_ID;

// Phase 1 placeholder. Phase 2 replaces this with the full PRD + quote +
// scenario-generation instructions.
function buildKickoffPrompt(prospect: {
  id: string;
  contactName: string | null;
  businessName: string | null;
  prdData: unknown;
  quoteDraft: unknown;
}): string {
  return [
    `# Atlas-on-Fable build kickoff (Phase 1 stub)`,
    ``,
    `Prospect ID: ${prospect.id}`,
    `Contact: ${prospect.contactName ?? "(unknown)"}`,
    `Business: ${prospect.businessName ?? "(unknown)"}`,
    ``,
    `PRD: ${prospect.prdData ? JSON.stringify(prospect.prdData).slice(0, 500) + "..." : "(missing)"}`,
    ``,
    `Quote: ${prospect.quoteDraft ? JSON.stringify(prospect.quoteDraft).slice(0, 300) + "..." : "(missing)"}`,
    ``,
    `Phase 1 task: acknowledge receipt. Respond with one sentence summarizing the prospect.`,
    `Phase 2 (not yet implemented) will instruct you to delegate to Story-writer, Builder, and Vera sub-agents.`,
  ].join("\n");
}

async function ensureEnvironment(): Promise<string> {
  const cached = SHARED_ENV_ID();
  if (cached) return cached;

  logger.info("Creating Fable shared environment (first build)");
  const env = await createEnvironment({
    name: "ambitt-fable-shared",
    description: "Shared sandbox for Atlas-on-Fable build runs",
    config: {
      type: "cloud",
      networking: { type: "unrestricted" },
    },
    metadata: { service: "ambitt-agents" },
  });
  logger.warn(
    `Created Fable environment ${env.id}. Set FABLE_ENVIRONMENT_ID=${env.id} on Railway to reuse across builds.`
  );
  return env.id;
}

export async function kickoffBuild(buildId: string): Promise<void> {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    include: {
      prospect: {
        select: {
          id: true,
          contactName: true,
          businessName: true,
          prdData: true,
          quoteDraft: true,
        },
      },
    },
  });
  if (!build) {
    logger.error("kickoffBuild: build not found", { buildId });
    return;
  }

  const atlasAgentId = ATLAS_FABLE_AGENT_ID();
  if (!atlasAgentId) {
    await failBuild(buildId, "ATLAS_FABLE_AGENT_ID env var not set; run scripts/seed-fable-agents.ts");
    return;
  }

  try {
    await prisma.build.update({
      where: { id: buildId },
      data: { status: "running", startedAt: new Date() },
    });

    const environmentId = await ensureEnvironment();

    const session = await createSession({
      agent: atlasAgentId,
      environment_id: environmentId,
      title: `Build ${buildId} for prospect ${build.prospect.id}`,
      metadata: {
        buildId,
        prospectId: build.prospect.id,
        model: FABLE_MODEL_ID,
      },
    });

    await prisma.build.update({
      where: { id: buildId },
      data: {
        sessionId: session.id,
        environmentId,
        managedAgentId: atlasAgentId,
      },
    });

    logger.info("Build session created", {
      buildId,
      sessionId: session.id,
      environmentId,
      atlasAgentId,
    });

    await sendUserMessage(session.id, buildKickoffPrompt(build.prospect));

    // Phase 1 ends here. Phase 2 attaches the stream consumer + sub-agent
    // delegation accounting. For now the session is "live" and the caller can
    // poll /builds/:id to see status, or we'll move it to completed by hand
    // during E2E.
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("kickoffBuild failed", { buildId, err: message });
    await failBuild(buildId, message);
  }
}

async function failBuild(buildId: string, reason: string): Promise<void> {
  try {
    await prisma.build.update({
      where: { id: buildId },
      data: {
        status: "failed",
        failureReason: reason,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    logger.error("failBuild: could not write failure to DB", { buildId, err });
  }
}

export default { kickoffBuild };
