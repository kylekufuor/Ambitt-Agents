// shared/managed-agents/types.ts
//
// TypeScript types for Anthropic Claude Managed Agents API
// (beta `managed-agents-2026-04-01`).
//
// Mirrors only the request/response shapes we use in the Fable build
// pipeline. Full surface lives at:
//   https://platform.claude.com/docs/en/managed-agents/overview
//
// Kept hand-written rather than generated so we can evolve without re-running
// codegen and so the shape stays small + readable.

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export interface AgentToolset20260401 {
  type: "agent_toolset_20260401";
}

// Reference a custom MCP server declared in `mcp_servers`. Required pairing —
// Managed Agents validates that every entry in mcp_servers has a matching
// mcp_toolset in tools, else 400 invalid_request_error.
export interface McpToolset {
  type: "mcp_toolset";
  mcp_server_name: string;
}

export type AgentTool =
  | AgentToolset20260401
  | McpToolset
  | { type: string; [k: string]: unknown };

export interface AgentMcpServer {
  type: "url";
  name: string;
  url: string;
  // Optional bearer/header auth — keep loose so we don't fight the docs as
  // they evolve.
  authorization_token?: string;
  headers?: Record<string, string>;
}

export interface AgentSkill {
  type: "anthropic" | "custom";
  skill_id: string;
  version?: string;
}

export type MultiAgentEntry =
  | string
  | { type: "agent"; id: string; version?: number }
  | { type: "self" };

export interface MultiAgentConfig {
  type: "coordinator";
  agents: MultiAgentEntry[];
}

export interface CreateAgentRequest {
  name: string;
  model: string | { id: string; speed?: "fast" | "balanced" | "slow" };
  description?: string;
  system: string;
  tools?: AgentTool[];
  skills?: AgentSkill[];
  mcp_servers?: AgentMcpServer[];
  multiagent?: MultiAgentConfig;
  metadata?: Record<string, string>;
}

export interface ManagedAgent {
  id: string;
  version: number;
  name: string;
  model: string | { id: string };
  description?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

export interface CloudEnvironmentConfig {
  type: "cloud";
  networking: { type: "unrestricted" | "restricted" };
  packages?: Record<string, unknown>;
}

export interface SelfHostedEnvironmentConfig {
  type: "self_hosted";
}

export interface CreateEnvironmentRequest {
  name: string;
  description?: string;
  config: CloudEnvironmentConfig | SelfHostedEnvironmentConfig;
  metadata?: Record<string, string>;
}

export interface ManagedEnvironment {
  id: string;
  name: string;
  config: CloudEnvironmentConfig | SelfHostedEnvironmentConfig;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type SessionAgentRef =
  | string
  | { type: "agent"; id: string; version?: number };

export interface CreateSessionRequest {
  agent: SessionAgentRef;
  environment_id: string;
  title?: string;
  vault_ids?: string[];
  metadata?: Record<string, string>;
}

export type SessionStatus = "idle" | "running" | "paused" | "completed" | "failed" | "archived";

export interface ManagedSession {
  id: string;
  agent: { id: string; version: number };
  environment_id: string;
  status: SessionStatus;
  title?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ToolUseBlock | { type: string; [k: string]: unknown };

export interface UserMessageEvent {
  type: "user.message";
  content: ContentBlock[];
}

export interface SendEventsRequest {
  events: UserMessageEvent[];
}

// SSE stream events — we only branch on a handful, leave the rest open.
export interface StreamEvent {
  type: string;
  id?: string;
  content?: ContentBlock[];
  name?: string;
  thread_id?: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Threads (multi-agent per-subagent isolation)
// ---------------------------------------------------------------------------

export interface SessionThread {
  id: string;
  agent: { id: string; version: number };
  status: SessionStatus;
  parent_thread_id?: string;
  stats?: { input_tokens?: number; output_tokens?: number };
  usage?: { cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  type: "error";
  error: {
    type:
      | "invalid_request_error"
      | "authentication_error"
      | "permission_error"
      | "not_found_error"
      | "rate_limit_error"
      | "api_error"
      | "overloaded_error";
    message: string;
  };
  request_id?: string;
}

export class ManagedAgentsApiError extends Error {
  status: number;
  errorType: string;
  requestId?: string;
  body?: ApiErrorBody;
  constructor(status: number, body: ApiErrorBody | string) {
    const isJson = typeof body === "object" && body !== null;
    const message = isJson
      ? `${body.error?.type ?? "api_error"}: ${body.error?.message ?? "unknown"}`
      : `HTTP ${status}: ${String(body).slice(0, 200)}`;
    super(message);
    this.status = status;
    this.errorType = isJson ? body.error?.type ?? "api_error" : "http_error";
    this.requestId = isJson ? body.request_id : undefined;
    this.body = isJson ? body : undefined;
  }
}
