// shared/managed-agents/client.ts
//
// Fetch-based wrapper for Anthropic Claude Managed Agents API.
//
// Why not the official SDK? `@anthropic-ai/sdk` 0.80 (what this codebase pins)
// predates managed-agents support. Latest (0.104) has it, but upgrading the
// SDK org-wide risks regressing claude.ts, shared/runtime, shared/mcp — all of
// which use the same import path. Wrapping the REST surface in ~250 LOC keeps
// the blast radius zero and lets us own the retry + telemetry shape.
//
// All requests carry the beta header `managed-agents-2026-04-01` and the
// standard `anthropic-version: 2023-06-01`. The Managed Agents quickstart docs
// note all API accounts are auto-enrolled in this beta — no allow-list dance.
//
// Retry: same pattern as shared/claude.ts (3 attempts, exponential 1s backoff,
// final attempt throws). 429 honors `retry-after`. Network errors retry. 4xx
// validation errors fail fast (no retry).

import logger from "../logger.js";
import type {
  ApiErrorBody,
  CreateAgentRequest,
  CreateEnvironmentRequest,
  CreateSessionRequest,
  ManagedAgent,
  ManagedEnvironment,
  ManagedSession,
  SendEventsRequest,
  SessionThread,
  StreamEvent,
} from "./types.js";
import { ManagedAgentsApiError } from "./types.js";

const BASE_URL = process.env.ANTHROPIC_API_BASE ?? "https://api.anthropic.com";
const BETA_HEADER = "managed-agents-2026-04-01";
const ANTHROPIC_VERSION = "2023-06-01";

// Fable 5 is the consumer-facing model name. The API ID — at least in the
// quickstart docs — is `claude-opus-4-8`. Keep this an env override so we can
// flip when Anthropic finalizes the model slug for Fable 5 specifically.
export const FABLE_MODEL_ID = process.env.FABLE_MODEL_ID ?? "claude-opus-4-8";

interface RequestOptions {
  retries?: number;
  signal?: AbortSignal;
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is required for Managed Agents");
  }
  return key;
}

function baseHeaders(): Record<string, string> {
  return {
    "x-api-key": getApiKey(),
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-beta": BETA_HEADER,
    "content-type": "application/json",
  };
}

async function parseError(res: Response): Promise<ManagedAgentsApiError> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as ApiErrorBody;
    return new ManagedAgentsApiError(res.status, body);
  } catch {
    return new ManagedAgentsApiError(res.status, text || `HTTP ${res.status}`);
  }
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529;
}

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  opts: RequestOptions = {}
): Promise<T> {
  const retries = opts.retries ?? 3;
  const url = `${BASE_URL}${path}`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: baseHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: opts.signal,
      });

      if (res.ok) {
        // 204 No Content
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      const err = await parseError(res);
      if (!isRetryable(res.status) || attempt === retries) {
        logger.error(`Managed Agents ${method} ${path} failed`, {
          status: res.status,
          errorType: err.errorType,
          message: err.message,
          requestId: err.requestId,
          attempt,
        });
        throw err;
      }

      // honor retry-after on 429
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000 * attempt;
      logger.warn(`Managed Agents ${method} ${path} retrying (${attempt}/${retries})`, {
        status: res.status,
        waitMs,
      });
      await sleep(waitMs);
      lastError = err;
    } catch (err) {
      // network-level errors retry; ApiError already handled above
      if (err instanceof ManagedAgentsApiError) throw err;
      if (attempt === retries) {
        logger.error(`Managed Agents ${method} ${path} network failure (final)`, { err });
        throw err;
      }
      logger.warn(`Managed Agents ${method} ${path} network retry (${attempt}/${retries})`, { err });
      await sleep(1000 * attempt);
      lastError = err;
    }
  }

  throw lastError ?? new Error("Managed Agents request failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function createAgent(input: CreateAgentRequest): Promise<ManagedAgent> {
  return request<ManagedAgent>("POST", "/v1/agents", input);
}

export async function getAgent(agentId: string): Promise<ManagedAgent> {
  return request<ManagedAgent>("GET", `/v1/agents/${agentId}`);
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

export async function createEnvironment(
  input: CreateEnvironmentRequest
): Promise<ManagedEnvironment> {
  return request<ManagedEnvironment>("POST", "/v1/environments", input);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(input: CreateSessionRequest): Promise<ManagedSession> {
  return request<ManagedSession>("POST", "/v1/sessions", input);
}

export async function getSession(sessionId: string): Promise<ManagedSession> {
  return request<ManagedSession>("GET", `/v1/sessions/${sessionId}`);
}

export async function archiveSession(sessionId: string): Promise<void> {
  await request<void>("DELETE", `/v1/sessions/${sessionId}`);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function sendUserMessage(
  sessionId: string,
  text: string
): Promise<void> {
  const body: SendEventsRequest = {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text }],
      },
    ],
  };
  await request<void>("POST", `/v1/sessions/${sessionId}/events`, body);
}

export async function listEvents(
  sessionId: string,
  limit = 100
): Promise<{ data: StreamEvent[]; has_more: boolean }> {
  return request<{ data: StreamEvent[]; has_more: boolean }>(
    "GET",
    `/v1/sessions/${sessionId}/events?limit=${limit}`
  );
}

// ---------------------------------------------------------------------------
// Threads (per-sub-agent isolation)
// ---------------------------------------------------------------------------

export async function listThreads(sessionId: string): Promise<{ data: SessionThread[] }> {
  return request<{ data: SessionThread[] }>("GET", `/v1/sessions/${sessionId}/threads`);
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

// Yields parsed event objects from the SSE stream. Caller breaks on
// `session.status_idle` (agent finished) or status_failed.
export async function* streamSession(
  sessionId: string,
  opts: { signal?: AbortSignal } = {}
): AsyncGenerator<StreamEvent, void, unknown> {
  const url = `${BASE_URL}/v1/sessions/${sessionId}/stream`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...baseHeaders(),
      accept: "text/event-stream",
    },
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    throw await parseError(res);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: events separated by blank lines, each line either `event: <name>`
    // or `data: <json>`. We only need data lines.
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || !line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        yield JSON.parse(payload) as StreamEvent;
      } catch (err) {
        logger.warn("Managed Agents SSE: failed to parse data line", {
          payload: payload.slice(0, 200),
          err,
        });
      }
    }
  }
}

export default {
  createAgent,
  getAgent,
  createEnvironment,
  createSession,
  getSession,
  archiveSession,
  sendUserMessage,
  listEvents,
  listThreads,
  streamSession,
  FABLE_MODEL_ID,
};
