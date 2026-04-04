// ---------------------------------------------------------------------------
// Scout — v1 agent runner (DEPRECATED)
// ---------------------------------------------------------------------------
// This is the legacy task-runner pattern. All agents now use the unified
// runtime at shared/runtime/engine.ts. This file is kept for backward
// compatibility with the Oracle /agents/:id/run endpoint but should be
// migrated to the new runtime.
// ---------------------------------------------------------------------------

import logger from "../../shared/logger.js";

export async function runScout(agentId: string): Promise<void> {
  logger.warn("Scout v1 runner called — use the agent runtime instead", { agentId });
  throw new Error("Scout v1 runner is deprecated. Use processInboundMessage() from shared/runtime instead.");
}

export default { runScout };
