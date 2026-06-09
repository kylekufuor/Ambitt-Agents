// shared/managed-agents/index.ts
//
// Barrel for the Managed Agents wrapper. Import from here, not the internal
// modules.

export * from "./types.js";
export * from "./client.js";
export { default as ManagedAgentsClient } from "./client.js";
