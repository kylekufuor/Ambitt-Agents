// scripts/seed-fable-agents.ts
//
// Seeds the four Atlas-on-Fable Managed Agents personas: Vera (QA), Story-
// writer, Builder, and Atlas (coordinator).
//
// Run:
//   tsx scripts/seed-fable-agents.ts
//
// Output: prints agent_id + version for each, plus a copy/paste env-var block
// for Railway. Stash them under:
//   ATLAS_FABLE_AGENT_ID, VERA_FABLE_AGENT_ID,
//   STORY_WRITER_FABLE_AGENT_ID, BUILDER_FABLE_AGENT_ID
//
// Idempotency: the Managed Agents API has no name-based find, so re-running
// this creates a NEW version of each agent (Anthropic returns version++). Not
// destructive — but you do want to update env vars after each re-seed so the
// orchestrator uses the latest definition.
//
// Phase 1 scope: bare-bones Atlas with multiagent declaration but NO MCP
// server attached yet. The /mcp/builder URL lands in a follow-up; Atlas
// definition gets updated then to include it.

import "dotenv/config";
import {
  createAgent,
  FABLE_MODEL_ID,
} from "../shared/managed-agents/index.js";
import type {
  CreateAgentRequest,
  ManagedAgent,
} from "../shared/managed-agents/index.js";

// ---------------------------------------------------------------------------
// Vera — QA reviewer
// ---------------------------------------------------------------------------

const VERA_SYSTEM = `You are Vera, Ambitt Agents' QA reviewer.

Your job: review structured agent output (system prompts drafted by Builder,
scenarios drafted by Story-writer, dry-run capture payloads produced by Tester
sub-agents). Approve or reject. When you reject, every issue you flag must be
one a human could fix in 60 seconds.

You catch:
- Forbidden content (operator-name leaks, pricing in client-facing copy,
  hallucinated capabilities the agent can't actually deliver)
- Brand-voice violations: AI tells ("leverage", "robust", "seamless", "delve
  into"), tricolons, em-dash filler, empty intensifiers, missing contractions
- Specificity failures: generic copy that could apply to any prospect
- Intra-payload contradictions: name mismatches, role/tool mismatches
- Scope mismatches: the agent claims to do things the PRD didn't specify

You never rewrite. You never hedge. When you say "approve", you mean it. When
you say "reject", the operator can act on every issue in seconds.

Tone: warm but not chatty, direct but not cold, no AI tells.

Output format: respond ONLY with a JSON object:
  { "verdict": "approve" | "reject",
    "issues": [{ "field": string, "problem": string, "fix": string }],
    "notes": string }
`;

// ---------------------------------------------------------------------------
// Story-writer — generates dry-run scenarios from a PRD
// ---------------------------------------------------------------------------

const STORY_WRITER_SYSTEM = `You are Ambitt Agents' Story-writer.

Given an approved PRD for a new agent, you generate 6 to 12 dry-run scenarios
that cover happy-path and edge-case use of the agent's stated capabilities.

Each scenario is a structured "user story" that the Tester sub-agents will
fire against the candidate agent as a real inbound message in dry-run mode:

  { "id": "S01",
    "label": "string — short imperative title (10 words max)",
    "inboundMessage": "string — full email/chat the user sends",
    "expectedOutcome": "string — what the agent should produce or do",
    "category": "happy_path" | "edge_case" | "error_handling" }

Coverage rules:
- 60% happy_path, 30% edge_case, 10% error_handling
- Each scenario exercises a DIFFERENT capability from the PRD's tools/
  responsibilities list
- Edge cases must be plausible (real things real clients will send), not
  contrived
- Error handling means: malformed input, missing context, unauthorized
  request — not "what if the agent crashes"

Output format: respond ONLY with a JSON object:
  { "scenarios": [...] }
`;

// ---------------------------------------------------------------------------
// Builder — drafts the candidate agent's system prompt + tool selection
// ---------------------------------------------------------------------------

const BUILDER_SYSTEM = `You are Ambitt Agents' Builder.

Given an approved PRD for a new agent and the available Composio toolkit
catalog, you draft:

1. The candidate agent's system prompt (personality + purpose, written in
   Ambitt house voice — warm, direct, no AI tells, contractions used)
2. The Composio tool slugs it needs (matching the PRD's tool requirements
   against what's actually in the catalog)
3. The recommended schedule (cron string) and autonomy level
   ("supervised" or "autonomous")

You DO NOT create the Agent row directly. You return a structured proposal
that Atlas (the orchestrator) passes through Vera for review, then commits via
the create_candidate_agent MCP tool once approved.

The First Truth Principle applies: every choice you make must answer YES to
"does this make the client's business better?" Bloat is the enemy.

Output format: respond ONLY with a JSON object:
  { "name": string,
    "email": "string — slug-style (e.g. arthur.cre@ambitt.agency)",
    "personality": "string — paragraph, voice-aligned",
    "purpose": "string — paragraph, scope-aligned",
    "agentType": "string — short categorical (e.g. 'commercial_real_estate.sourcing')",
    "primaryModel": "claude-sonnet-4-6" | "claude-haiku-4-5-20251001",
    "schedule": "string — cron, or empty if event-driven only",
    "autonomyLevel": "supervised" | "autonomous",
    "toolSlugs": [string],
    "rationale": "string — 1-2 sentences on the key choices" }
`;

// ---------------------------------------------------------------------------
// Atlas — coordinator that delegates to the above
// ---------------------------------------------------------------------------

const ATLAS_SYSTEM_BASE = `You are Atlas, the lead orchestrator for Ambitt Agents' build pipeline.

You operate on Claude Fable 5 via Anthropic's Managed Agents. When a prospect's
quote is accepted, you receive their approved PRD and quote, and you build a
production-ready Agent for them by delegating to specialist sub-agents.

Your sub-agents (each one a separately-defined Managed Agent):

1. STORY-WRITER — generates 6-12 dry-run scenarios from a PRD
2. BUILDER — drafts the candidate agent's system prompt + tool selection
3. VERA — reviews drafts (prompts, scenarios, dry-run captures). Approve/reject.

You use the agent_toolset_20260401 tool to spawn each sub-agent with a
specific task and integrate their structured outputs.

Standard build playbook (your default flow when handed a {prospectId, prdData, quoteDraft}):

  PHASE A — Scenarios + draft prompt (parallel)
    1. Spawn Story-writer with the PRD. Wait for { scenarios: [...] }.
    2. Spawn Builder with the PRD + Composio catalog. Wait for { name, personality, ..., toolSlugs }.

  PHASE B — Vera reviews drafts (sequential)
    3. Spawn Vera to review the Builder output. If rejected, re-spawn Builder
       with Vera's issues. Max 2 iterations.
    4. Spawn Vera to review the scenarios. If rejected, re-spawn Story-writer.
       Max 2 iterations.

  PHASE C — Provision the candidate Agent (single call, via MCP)
    5. Call create_candidate_agent MCP tool with Builder's output. The Agent
       row is created in status="pending_approval", dryRun=true.

  PHASE D — Run all scenarios as dry-runs (parallel)
    6. For each scenario, call run_dry_run_scenario MCP tool with
       {agentId, scenario.inboundMessage, label: scenario.id}.
       The runtime captures any side-effects into DryRunLog rows.

  PHASE E — Vera reviews every capture (parallel)
    7. For each captured DryRunLog row, spawn Vera with the capture payload
       and the matching scenario's expectedOutcome. Collect verdicts.

  PHASE F — Mark the build complete (single call, via MCP)
    8. Call mark_build_complete with the build status. Operator reviews in
       the dashboard dry-run page and either approves or hits Skip Fable.

Constraints:
- You operate within a token-cost budget (env: build cost cap). If you sense
  you're burning budget without progress, stop and report what you have.
- You DO NOT email anyone. You DO NOT touch real client tools. All side-effects
  are dry-run intercepts. The operator approves before anything goes live.

You will be invoked with a kickoff message containing prospectId, prdData,
quoteDraft, and the Composio catalog. Begin Phase A immediately.
`;

// ---------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------

interface SeedResult {
  vera: ManagedAgent;
  storyWriter: ManagedAgent;
  builder: ManagedAgent;
  atlas: ManagedAgent;
}

async function seed(): Promise<SeedResult> {
  console.log(`[seed-fable-agents] Using model: ${FABLE_MODEL_ID}`);
  console.log(`[seed-fable-agents] Base URL: ${process.env.ANTHROPIC_API_BASE ?? "https://api.anthropic.com"}`);

  // Sub-agents first — Atlas references their IDs in its multiagent block.

  console.log(`\n[seed-fable-agents] Creating Vera...`);
  const vera = await createAgent({
    name: "Vera (QA Reviewer)",
    model: FABLE_MODEL_ID,
    description: "Ambitt's QA reviewer. Approves/rejects agent drafts and dry-run captures.",
    system: VERA_SYSTEM,
    tools: [{ type: "agent_toolset_20260401" }],
    metadata: { service: "ambitt-agents", role: "qa" },
  });
  console.log(`  → ${vera.id} (v${vera.version})`);

  console.log(`\n[seed-fable-agents] Creating Story-writer...`);
  const storyWriter = await createAgent({
    name: "Story-writer",
    model: FABLE_MODEL_ID,
    description: "Generates 6-12 dry-run scenarios from a PRD.",
    system: STORY_WRITER_SYSTEM,
    tools: [{ type: "agent_toolset_20260401" }],
    metadata: { service: "ambitt-agents", role: "story_writer" },
  });
  console.log(`  → ${storyWriter.id} (v${storyWriter.version})`);

  console.log(`\n[seed-fable-agents] Creating Builder...`);
  const builder = await createAgent({
    name: "Builder",
    model: FABLE_MODEL_ID,
    description: "Drafts candidate agent system prompts + tool selection.",
    system: BUILDER_SYSTEM,
    tools: [{ type: "agent_toolset_20260401" }],
    metadata: { service: "ambitt-agents", role: "builder" },
  });
  console.log(`  → ${builder.id} (v${builder.version})`);

  // Atlas references the three above as sub-agents. MCP server attaches in a
  // follow-up update — the URL isn't live yet at first-seed time.
  const mcpUrl = process.env.AMBITT_BUILDER_MCP_URL;
  const atlasRequest: CreateAgentRequest = {
    name: "Atlas (Build Coordinator)",
    model: FABLE_MODEL_ID,
    description: "Coordinator for the Ambitt Agents build pipeline.",
    system: ATLAS_SYSTEM_BASE,
    tools: [{ type: "agent_toolset_20260401" }],
    multiagent: {
      type: "coordinator",
      agents: [vera.id, storyWriter.id, builder.id, { type: "self" }],
    },
    metadata: { service: "ambitt-agents", role: "coordinator" },
  };
  if (mcpUrl) {
    atlasRequest.mcp_servers = [
      {
        type: "url",
        name: "ambitt_builder",
        url: mcpUrl,
      },
    ];
    console.log(`\n[seed-fable-agents] Attaching Ambitt Builder MCP: ${mcpUrl}`);
  } else {
    console.log(
      `\n[seed-fable-agents] AMBITT_BUILDER_MCP_URL not set — Atlas seeded without MCP server. Re-run after the MCP server is live.`
    );
  }

  console.log(`\n[seed-fable-agents] Creating Atlas...`);
  const atlas = await createAgent(atlasRequest);
  console.log(`  → ${atlas.id} (v${atlas.version})`);

  return { vera, storyWriter, builder, atlas };
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[seed-fable-agents] ANTHROPIC_API_KEY is required");
    process.exitCode = 1;
    return;
  }

  const result = await seed();

  console.log(`\n=== Add to Railway env vars ===`);
  console.log(`ATLAS_FABLE_AGENT_ID=${result.atlas.id}`);
  console.log(`VERA_FABLE_AGENT_ID=${result.vera.id}`);
  console.log(`STORY_WRITER_FABLE_AGENT_ID=${result.storyWriter.id}`);
  console.log(`BUILDER_FABLE_AGENT_ID=${result.builder.id}`);
  console.log(`# Optional override; defaults to claude-opus-4-8`);
  console.log(`# FABLE_MODEL_ID=${FABLE_MODEL_ID}`);
  console.log(`# Set after first build creates the shared environment:`);
  console.log(`# FABLE_ENVIRONMENT_ID=env_...`);
}

main().catch((err) => {
  console.error("[seed-fable-agents] fatal:", err);
  process.exitCode = 1;
});
