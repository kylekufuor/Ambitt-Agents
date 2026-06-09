// oracle/mcp-server/builder.ts
//
// MCP server exposed to Atlas-on-Fable sub-agents (Vera, Story-writer,
// Builder) running in the Anthropic Managed Agents sandbox. Mounted at
// /mcp/builder on Oracle and registered as Atlas's `mcp_servers[0]` via
// `AMBITT_BUILDER_MCP_URL`.
//
// Tools exposed:
//
//   read_prd            — fetch an approved PRD by prospectId
//   read_quote          — fetch the accepted quote by prospectId
//   list_composio_apps  — Composio catalog (Builder consults to pick toolSlugs)
//   create_candidate_agent — Builder calls once per build (creates Agent row,
//                            status=pending_approval + dryRun=true, links Build)
//   run_dry_run_scenario   — Tester sub-agents call per scenario; routes through
//                            processInboundMessage in dry-run mode and returns
//                            DryRunLog capture rows
//   write_vera_verdict     — Vera appends a per-capture verdict to Build
//   update_build_scenarios — Atlas commits Story-writer's scenario list to Build
//   mark_build_complete    — Atlas finalizes the build (status=completed|failed)
//
// All tools take `buildId` (when relevant) so we can scope operations and
// prevent a stray sub-agent from writing to the wrong Build row.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { Request, Response } from "express";

import prisma from "../../shared/db.js";
import logger from "../../shared/logger.js";
import { listApps } from "../../shared/mcp/composio.js";

// ---------------------------------------------------------------------------
// Tool input schemas
// ---------------------------------------------------------------------------

const ReadPrdInput = {
  prospectId: z.string().min(1),
};

const ReadQuoteInput = {
  prospectId: z.string().min(1),
};

const ListComposioAppsInput = {
  searchQuery: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
};

const CreateCandidateAgentInput = {
  buildId: z.string().min(1),
  prospectId: z.string().min(1),
  name: z.string().min(1).max(80),
  email: z.string().email(),
  personality: z.string().min(20),
  purpose: z.string().min(20),
  agentType: z.string().min(1),
  primaryModel: z.enum(["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]),
  schedule: z.string().default(""),
  autonomyLevel: z.enum(["supervised", "autonomous"]).default("supervised"),
  toolSlugs: z.array(z.string()).default([]),
  timezone: z.string().default("America/New_York"),
  tone: z.enum(["formal", "conversational", "brief"]).default("conversational"),
  pricingTier: z.enum(["starter", "growth", "scale", "enterprise"]).default("growth"),
};

const RunDryRunScenarioInput = {
  buildId: z.string().min(1),
  agentId: z.string().min(1),
  scenarioId: z.string().min(1),
  inboundMessage: z.string().min(1),
};

const WriteVeraVerdictInput = {
  buildId: z.string().min(1),
  captureId: z.string().min(1),
  scenarioId: z.string().optional(),
  verdict: z.enum(["approve", "reject"]),
  issues: z
    .array(
      z.object({
        field: z.string(),
        problem: z.string(),
        fix: z.string(),
      })
    )
    .default([]),
  notes: z.string().optional(),
};

const UpdateBuildScenariosInput = {
  buildId: z.string().min(1),
  scenarios: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      inboundMessage: z.string(),
      expectedOutcome: z.string(),
      category: z.enum(["happy_path", "edge_case", "error_handling"]),
    })
  ),
};

const MarkBuildCompleteInput = {
  buildId: z.string().min(1),
  status: z.enum(["completed", "failed"]),
  failureReason: z.string().optional(),
};

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

function textResult(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function handleReadPrd(args: { prospectId: string }) {
  const prospect = await prisma.prospect.findUnique({
    where: { id: args.prospectId },
    select: {
      id: true,
      contactName: true,
      businessName: true,
      role: true,
      website: true,
      prdData: true,
      prdApprovedAt: true,
    },
  });
  if (!prospect) return errorResult(`Prospect ${args.prospectId} not found`);
  if (!prospect.prdData) return errorResult("Prospect PRD has not been drafted");
  if (!prospect.prdApprovedAt) return errorResult("Prospect PRD has not been approved");
  return textResult(prospect);
}

async function handleReadQuote(args: { prospectId: string }) {
  const prospect = await prisma.prospect.findUnique({
    where: { id: args.prospectId },
    select: {
      id: true,
      quoteDraft: true,
      quoteAcceptedAt: true,
    },
  });
  if (!prospect) return errorResult(`Prospect ${args.prospectId} not found`);
  if (!prospect.quoteDraft) return errorResult("Quote has not been drafted");
  if (!prospect.quoteAcceptedAt) return errorResult("Quote has not been accepted");
  return textResult(prospect);
}

async function handleListComposioApps(args: { searchQuery?: string; limit: number }) {
  try {
    const all = await listApps();
    const q = args.searchQuery?.toLowerCase().trim();
    const filtered = q
      ? all.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.key.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q) ||
            a.categories.some((c) => c.toLowerCase().includes(q))
        )
      : all;
    return textResult({
      total: filtered.length,
      returned: Math.min(filtered.length, args.limit),
      apps: filtered.slice(0, args.limit).map((a) => ({
        slug: a.key,
        name: a.name,
        description: a.description,
        categories: a.categories,
      })),
    });
  } catch (err) {
    logger.error("MCP list_composio_apps failed", { err });
    return errorResult(
      `Composio catalog fetch failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function handleCreateCandidateAgent(args: z.infer<z.ZodObject<typeof CreateCandidateAgentInput>>) {
  const build = await prisma.build.findUnique({
    where: { id: args.buildId },
    select: { id: true, prospectId: true, agentId: true, status: true },
  });
  if (!build) return errorResult(`Build ${args.buildId} not found`);
  if (build.prospectId !== args.prospectId) {
    return errorResult(
      `Build ${args.buildId} belongs to prospect ${build.prospectId}, not ${args.prospectId}`
    );
  }
  if (build.agentId) {
    return errorResult(
      `Build ${args.buildId} already has agent ${build.agentId}; cannot create a second candidate`
    );
  }

  // The Agent needs a Client owner. At build time the Prospect may not yet
  // have a converted Client — so we create a placeholder Client OR re-use the
  // existing one. For the build-then-convert flow, we create the Client upfront
  // so the Agent has a real owner; the Convert step later updates the Client
  // record with billing fields.
  const prospect = await prisma.prospect.findUnique({
    where: { id: args.prospectId },
    select: {
      id: true,
      email: true,
      contactName: true,
      businessName: true,
      website: true,
      convertedClientId: true,
    },
  });
  if (!prospect) return errorResult(`Prospect ${args.prospectId} not found`);

  let clientId = prospect.convertedClientId;
  if (!clientId) {
    // Placeholder Client. The Convert step (after operator approval) hydrates
    // industry/businessGoal/brandVoice/preferredChannel from the PRD + quote.
    // Fill with safe defaults here so the schema accepts the row.
    const placeholderClient = await prisma.client.create({
      data: {
        email: prospect.email,
        contactName: prospect.contactName ?? prospect.email,
        businessName: prospect.businessName ?? prospect.contactName ?? prospect.email,
        website: prospect.website,
        industry: "pending",
        businessGoal: "pending — set on convert",
        brandVoice: "pending — set on convert",
        preferredChannel: "email",
        billingEmail: prospect.email,
        stripeCustomerId: `pending_stripe_${prospect.id}`,
      },
    });
    clientId = placeholderClient.id;
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { convertedClientId: clientId },
    });
    logger.info("MCP create_candidate_agent: created placeholder Client", {
      clientId,
      prospectId: prospect.id,
    });
  }

  // Empty memory object — Convert step will hydrate it later.
  const { encrypt } = await import("../../shared/encryption.js");
  const memoryObject = encrypt(JSON.stringify({ source: "fable_build", buildId: args.buildId }));

  const agent = await prisma.agent.create({
    data: {
      clientId,
      name: args.name,
      email: args.email,
      personality: args.personality,
      purpose: args.purpose,
      agentType: args.agentType,
      tools: args.toolSlugs,
      schedule: args.schedule,
      autonomyLevel: args.autonomyLevel,
      timezone: args.timezone,
      tone: args.tone,
      primaryModel: args.primaryModel,
      pricingTier: args.pricingTier,
      status: "building",
      dryRun: true,
      monthlyRetainerCents: 0,
      setupFeeCents: 0,
      clientMemoryObject: memoryObject,
    },
  });

  await prisma.build.update({
    where: { id: args.buildId },
    data: { agentId: agent.id },
  });

  logger.info("MCP create_candidate_agent: agent created", {
    buildId: args.buildId,
    agentId: agent.id,
    clientId,
  });

  return textResult({
    agentId: agent.id,
    clientId,
    status: agent.status,
    dryRun: agent.dryRun,
  });
}

async function handleRunDryRunScenario(args: z.infer<z.ZodObject<typeof RunDryRunScenarioInput>>) {
  const build = await prisma.build.findUnique({
    where: { id: args.buildId },
    select: { id: true, agentId: true, status: true },
  });
  if (!build) return errorResult(`Build ${args.buildId} not found`);
  if (build.agentId !== args.agentId) {
    return errorResult(
      `Build ${args.buildId} is linked to agent ${build.agentId}, not ${args.agentId}`
    );
  }
  if (build.status === "completed" || build.status === "failed" || build.status === "cancelled") {
    return errorResult(`Build ${args.buildId} is ${build.status}; scenarios cannot run`);
  }

  const agent = await prisma.agent.findUnique({
    where: { id: args.agentId },
    select: { id: true, dryRun: true },
  });
  if (!agent) return errorResult(`Agent ${args.agentId} not found`);
  if (!agent.dryRun) {
    return errorResult(
      `Agent ${args.agentId} is not in dry-run mode; refusing to fire real side-effects`
    );
  }

  const before = await prisma.dryRunLog.findFirst({
    where: { agentId: args.agentId },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });
  const afterCursor = before?.capturedAt ?? new Date(0);
  const scenarioLabel = `${args.buildId}:${args.scenarioId}`;

  let runError: string | null = null;
  let runResponse = "";
  try {
    const { processInboundMessage } = await import("../../shared/runtime/index.js");
    const result = await processInboundMessage({
      agentId: args.agentId,
      userMessage: args.inboundMessage,
      channel: "chat",
      threadId: `fable-${args.buildId}-${args.scenarioId}`,
      senderEmail: "fable@dryrun.ambitt.agency",
      billable: false,
    });
    runResponse = result.response;
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
  }

  const captures = await prisma.dryRunLog.findMany({
    where: { agentId: args.agentId, capturedAt: { gt: afterCursor } },
    orderBy: { capturedAt: "asc" },
  });
  if (captures.length > 0) {
    await prisma.dryRunLog.updateMany({
      where: { id: { in: captures.map((c) => c.id) } },
      data: { scenario: scenarioLabel },
    });
  }

  return textResult({
    scenarioLabel,
    response: runResponse,
    error: runError,
    captures: captures.map((c) => ({
      id: c.id,
      kind: c.kind,
      payload: c.payload,
      capturedAt: c.capturedAt.toISOString(),
    })),
  });
}

async function handleWriteVeraVerdict(args: z.infer<z.ZodObject<typeof WriteVeraVerdictInput>>) {
  const build = await prisma.build.findUnique({
    where: { id: args.buildId },
    select: { id: true, veraVerdicts: true },
  });
  if (!build) return errorResult(`Build ${args.buildId} not found`);

  const existing = Array.isArray(build.veraVerdicts) ? (build.veraVerdicts as unknown[]) : [];
  const verdictEntry = {
    captureId: args.captureId,
    scenarioId: args.scenarioId ?? null,
    verdict: args.verdict,
    issues: args.issues,
    notes: args.notes ?? null,
    writtenAt: new Date().toISOString(),
  };
  const updated = [...existing, verdictEntry];

  await prisma.build.update({
    where: { id: args.buildId },
    // Prisma's Json column accepts any JSON-serializable value but the type
    // system doesn't know that `unknown[]` is one. Cast for the field shape.
    data: { veraVerdicts: updated as unknown as object[] },
  });

  // Also stamp the DryRunLog itself so the existing operator UI sees the
  // reviewed state without extra plumbing.
  await prisma.dryRunLog
    .update({
      where: { id: args.captureId },
      data: {
        reviewedAt: new Date(),
        reviewedOk: args.verdict === "approve",
        reviewNote: args.notes ?? null,
      },
    })
    .catch((err) => {
      logger.warn("MCP write_vera_verdict: could not stamp DryRunLog", {
        captureId: args.captureId,
        err,
      });
    });

  return textResult({ ok: true, totalVerdicts: updated.length });
}

async function handleUpdateBuildScenarios(
  args: z.infer<z.ZodObject<typeof UpdateBuildScenariosInput>>
) {
  const build = await prisma.build.findUnique({
    where: { id: args.buildId },
    select: { id: true },
  });
  if (!build) return errorResult(`Build ${args.buildId} not found`);

  await prisma.build.update({
    where: { id: args.buildId },
    data: { scenarios: args.scenarios as unknown as object },
  });

  return textResult({ ok: true, scenarioCount: args.scenarios.length });
}

async function handleMarkBuildComplete(args: z.infer<z.ZodObject<typeof MarkBuildCompleteInput>>) {
  const build = await prisma.build.findUnique({
    where: { id: args.buildId },
    select: { id: true, status: true },
  });
  if (!build) return errorResult(`Build ${args.buildId} not found`);
  if (build.status === "completed" || build.status === "failed" || build.status === "cancelled") {
    return errorResult(`Build is already ${build.status}`);
  }

  await prisma.build.update({
    where: { id: args.buildId },
    data: {
      status: args.status,
      failureReason: args.failureReason ?? null,
      completedAt: new Date(),
    },
  });

  logger.info("MCP mark_build_complete", {
    buildId: args.buildId,
    status: args.status,
  });

  return textResult({ ok: true, status: args.status });
}

// ---------------------------------------------------------------------------
// Server factory + Express handler
// ---------------------------------------------------------------------------

export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "ambitt-builder", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.registerTool(
    "read_prd",
    {
      description: "Fetch the approved Product Requirements Document for a prospect.",
      inputSchema: ReadPrdInput,
    },
    async (args) => handleReadPrd(args)
  );

  server.registerTool(
    "read_quote",
    {
      description: "Fetch the accepted quote for a prospect.",
      inputSchema: ReadQuoteInput,
    },
    async (args) => handleReadQuote(args)
  );

  server.registerTool(
    "list_composio_apps",
    {
      description:
        "Browse the Composio toolkit catalog. Use searchQuery to filter by name/category. Returns slug + name + description.",
      inputSchema: ListComposioAppsInput,
    },
    async (args) => handleListComposioApps(args)
  );

  server.registerTool(
    "create_candidate_agent",
    {
      description:
        "Create the candidate Agent row in status=pending_approval + dryRun=true. Builder sub-agent calls this exactly once per build after Vera approves the draft.",
      inputSchema: CreateCandidateAgentInput,
    },
    async (args) => handleCreateCandidateAgent(args)
  );

  server.registerTool(
    "run_dry_run_scenario",
    {
      description:
        "Fire one scenario as a dry-run against the candidate Agent. The runtime engine captures any side-effects into DryRunLog rows; returns the captures so Vera can review them.",
      inputSchema: RunDryRunScenarioInput,
    },
    async (args) => handleRunDryRunScenario(args)
  );

  server.registerTool(
    "write_vera_verdict",
    {
      description:
        "Append Vera's review verdict for a single dry-run capture. verdict: approve | reject. Also stamps the DryRunLog row so the operator UI shows the review state.",
      inputSchema: WriteVeraVerdictInput,
    },
    async (args) => handleWriteVeraVerdict(args)
  );

  server.registerTool(
    "update_build_scenarios",
    {
      description:
        "Commit Story-writer's generated scenarios to the Build row. Atlas calls this once after Vera approves the scenario set.",
      inputSchema: UpdateBuildScenariosInput,
    },
    async (args) => handleUpdateBuildScenarios(args)
  );

  server.registerTool(
    "mark_build_complete",
    {
      description:
        "Finalize the build (status=completed | failed). Atlas calls this as the final step; operator then opens /agents/[id]/dry-run to approve or reject.",
      inputSchema: MarkBuildCompleteInput,
    },
    async (args) => handleMarkBuildComplete(args)
  );

  return server;
}

// Singleton transport — stateless mode (sessionIdGenerator undefined). MCP
// clients (the Managed Agents harness) hit /mcp/builder per-tool-call; no
// session state to thread.
let cachedTransport: StreamableHTTPServerTransport | null = null;
let cachedServer: McpServer | null = null;

export async function handleBuilderMcpRequest(req: Request, res: Response): Promise<void> {
  try {
    if (!cachedServer || !cachedTransport) {
      cachedServer = buildMcpServer();
      cachedTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await cachedServer.connect(cachedTransport);
    }
    await cachedTransport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error("MCP builder request failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
}

export default { buildMcpServer, handleBuilderMcpRequest };
