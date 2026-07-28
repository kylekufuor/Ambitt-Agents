import type Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Context budget — keeps an assembled prompt inside the model's window
// ---------------------------------------------------------------------------
// Arthur's 2026-07-06 scheduled run died with
//   400 invalid_request_error: prompt is too long: 212067 tokens > 200000
// and the run was never retried. 200,000 is HAIKU's window, not Sonnet's: the
// engine's triage routing starts every loop on TRIAGE_MODEL (claude-haiku-4-5,
// 200K) and only escalates to CLIENT_MODEL (claude-sonnet-4-6, 1M) for the
// final synthesis. So the ceiling a run actually has to respect is whichever
// model is about to be called — which is why the budget below is per-model.
//
// What actually grew: NOT the system prompt. The assembler already caps memory
// (8K chars), renders only the last 10 conversation turns at 500 chars each,
// and Arthur's whole encrypted memory object is 17KB. What was unbounded is the
// `messages` array inside the tool loop: up to 10 rounds of tool results, and
// MCP/Composio results are returned verbatim with no size limit. That is the
// thing this module bounds.
//
// Everything here is pure and dependency-free so it can be unit-tested without
// a DB, a network, or an Anthropic client.
// ---------------------------------------------------------------------------

/**
 * Context windows per model id. Keep in sync with the ids in shared/claude.ts.
 * An unknown id gets DEFAULT_CONTEXT_LIMIT — deliberately the SMALLEST window
 * we ship, because guessing high is how you earn a 400.
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-haiku-4-5": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
  "claude-sonnet-4-6": 1_000_000,
  "claude-opus-4-7": 1_000_000,
};

export const DEFAULT_CONTEXT_LIMIT = 200_000;

export function contextLimitFor(model: string): number {
  return MODEL_CONTEXT_LIMITS[model] ?? DEFAULT_CONTEXT_LIMIT;
}

// Token estimation. We deliberately do NOT call /v1/messages/count_tokens here:
// it is a network round trip per loop iteration on the hot path, and it can
// fail — which would make the safety check itself a source of failed runs. A
// character heuristic is enough to catch a 200K blowout.
//
// 3.5 chars/token instead of the usual ~4: tool results are JSON, which
// tokenizes denser than prose. Over-estimating trims a little early; under-
// estimating ships a request we already knew would 400. We choose to trim early.
export const CHARS_PER_TOKEN = 3.5;

// Per-block overhead the wire format adds (role, type, ids, JSON scaffolding).
const BLOCK_OVERHEAD_TOKENS = 8;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function estimateUnknownBlock(block: unknown): number {
  try {
    return estimateTokens(JSON.stringify(block) ?? "");
  } catch {
    return 0;
  }
}

/** Approximate token count of one message (any content shape). */
export function estimateMessageTokens(message: Anthropic.Messages.MessageParam): number {
  const content = message.content;
  if (typeof content === "string") return estimateTokens(content) + BLOCK_OVERHEAD_TOKENS;
  if (!Array.isArray(content)) return estimateUnknownBlock(content) + BLOCK_OVERHEAD_TOKENS;

  let total = 0;
  for (const block of content) {
    total += BLOCK_OVERHEAD_TOKENS;
    if (!block || typeof block !== "object") {
      total += estimateUnknownBlock(block);
      continue;
    }
    const b = block as { type?: string; text?: unknown; content?: unknown; input?: unknown };
    if (b.type === "text" && typeof b.text === "string") {
      total += estimateTokens(b.text);
    } else if (b.type === "tool_result") {
      total += typeof b.content === "string"
        ? estimateTokens(b.content)
        : estimateUnknownBlock(b.content);
    } else if (b.type === "tool_use") {
      total += estimateUnknownBlock(b.input);
    } else {
      total += estimateUnknownBlock(block);
    }
  }
  return total;
}

export function estimateMessagesTokens(
  messages: readonly Anthropic.Messages.MessageParam[],
): number {
  let total = 0;
  for (const m of messages) total += estimateMessageTokens(m);
  return total;
}

/** Tool definitions are re-sent on every call — they count against the window. */
export function estimateToolsTokens(tools: readonly Anthropic.Messages.Tool[]): number {
  let total = 0;
  for (const tool of tools) {
    total += BLOCK_OVERHEAD_TOKENS;
    total += estimateTokens(tool.name ?? "");
    total += estimateTokens(typeof tool.description === "string" ? tool.description : "");
    total += estimateUnknownBlock(tool.input_schema);
  }
  return total;
}

export interface PromptBudget {
  /** The model's full context window. */
  limit: number;
  /** Output tokens the request reserves (max_tokens) — they share the window. */
  reserveOutput: number;
  /** Slack for estimator error. */
  safetyMargin: number;
  /** What the prompt (system + tools + messages) may actually use. */
  promptCeiling: number;
}

// 5% of the window, capped at 20K. Absorbs the char-heuristic's error without
// giving up a meaningful slice of a 1M-token model.
function safetyMarginFor(limit: number): number {
  return Math.min(20_000, Math.ceil(limit * 0.05));
}

export function budgetFor(model: string, reserveOutput: number): PromptBudget {
  const limit = contextLimitFor(model);
  const safetyMargin = safetyMarginFor(limit);
  return {
    limit,
    reserveOutput,
    safetyMargin,
    promptCeiling: Math.max(0, limit - reserveOutput - safetyMargin),
  };
}

// ---------------------------------------------------------------------------
// Trimming
// ---------------------------------------------------------------------------

/**
 * Hard cap on a SINGLE tool result as it enters the conversation. ~17K tokens:
 * generous enough for a real page of data or a big CSV read, small enough that
 * ten of them can't eat a 200K window on their own.
 */
export const MAX_TOOL_RESULT_CHARS = 60_000;

/** How many of the most recent tool results are never trimmed. */
export const KEEP_RECENT_TOOL_RESULTS = 4;

export const TOOL_RESULT_CAP_NOTICE =
  "\n\n[Output truncated here: it was too large to fit in this run's context. Re-run the tool with a narrower query if you need the rest.]";

export const TOOL_RESULT_TRIMMED_NOTICE =
  "[Earlier tool output from this run was dropped to fit the context window. It ran and returned data; that data is no longer in view. Re-run the tool if you still need it.]";

/** Cap one tool result's text as it is produced. PURE. */
export function capToolResultContent(
  content: string,
  maxChars: number = MAX_TOOL_RESULT_CHARS,
): { content: string; truncated: boolean } {
  if (content.length <= maxChars) return { content, truncated: false };
  return { content: content.slice(0, maxChars) + TOOL_RESULT_CAP_NOTICE, truncated: true };
}

export interface TrimResult {
  messages: Anthropic.Messages.MessageParam[];
  /** How many older tool results were emptied out. */
  trimmedBlocks: number;
  /** Estimated prompt tokens AFTER trimming (system + tools + messages). */
  estimatedTokens: number;
  /** False when even a fully-trimmed prompt still doesn't fit. */
  withinBudget: boolean;
}

/**
 * Bring a running conversation back under budget. PURE — returns a new array,
 * never mutates the input.
 *
 * Strategy: keep the THREAD, drop the BULK. We never delete a message, because
 * deleting an assistant turn that holds a `tool_use` block while its paired
 * `tool_result` survives is an instant 400 ("tool_result without tool_use"), and
 * dropping the first user message would delete the task itself. Instead we
 * replace the CONTENT of the oldest tool results with an explicit notice, so:
 *   - every tool_use/tool_result pair stays intact,
 *   - the model can still see that a tool ran and what it was asked,
 *   - the newest KEEP_RECENT_TOOL_RESULTS results (the ones it is actually
 *     reasoning about) are never touched,
 *   - the elision is visible in the prompt rather than silent, so the model
 *     doesn't conclude nothing came before.
 */
export function trimMessagesToBudget(
  messages: readonly Anthropic.Messages.MessageParam[],
  opts: { promptCeiling: number; fixedTokens: number; keepRecentToolResults?: number },
): TrimResult {
  const keepRecent = opts.keepRecentToolResults ?? KEEP_RECENT_TOOL_RESULTS;
  let total = opts.fixedTokens + estimateMessagesTokens(messages);

  if (total <= opts.promptCeiling) {
    return {
      messages: [...messages],
      trimmedBlocks: 0,
      estimatedTokens: total,
      withinBudget: true,
    };
  }

  // Work on a shallow-cloned structure so the caller's array is untouched.
  const next: Anthropic.Messages.MessageParam[] = messages.map((m) =>
    Array.isArray(m.content) ? { ...m, content: [...m.content] } : { ...m }
  );

  // Locate every tool_result block, oldest first.
  const targets: Array<{ mi: number; bi: number }> = [];
  next.forEach((m, mi) => {
    if (!Array.isArray(m.content)) return;
    m.content.forEach((block, bi) => {
      const b = block as { type?: string };
      if (b?.type === "tool_result") targets.push({ mi, bi });
    });
  });

  const trimmable = targets.slice(0, Math.max(0, targets.length - keepRecent));
  let trimmedBlocks = 0;

  for (const { mi, bi } of trimmable) {
    if (total <= opts.promptCeiling) break;
    const content = next[mi]!.content as unknown[];
    const block = content[bi] as { type: string; content?: unknown };
    const before = estimateMessageTokens(next[mi]!);
    const alreadyTrimmed =
      typeof block.content === "string" && block.content === TOOL_RESULT_TRIMMED_NOTICE;
    if (alreadyTrimmed) continue;
    content[bi] = { ...block, content: TOOL_RESULT_TRIMMED_NOTICE };
    const after = estimateMessageTokens(next[mi]!);
    total -= before - after;
    trimmedBlocks++;
  }

  return {
    messages: next,
    trimmedBlocks,
    estimatedTokens: total,
    withinBudget: total <= opts.promptCeiling,
  };
}

/**
 * The error we raise instead of sending a request we can already predict will
 * 400. Callers surface this to the scheduled-run failure alert.
 */
export function contextOverflowMessage(input: {
  model: string;
  budget: PromptBudget;
  estimatedTokens: number;
  systemTokens: number;
  toolsTokens: number;
  messagesTokens: number;
  toolCount: number;
}): string {
  return (
    `Context budget exceeded before calling ${input.model}: assembled prompt is ~${input.estimatedTokens.toLocaleString()} tokens ` +
    `against a usable ceiling of ${input.budget.promptCeiling.toLocaleString()} ` +
    `(model window ${input.budget.limit.toLocaleString()}, minus ${input.budget.reserveOutput.toLocaleString()} reserved for output ` +
    `and ${input.budget.safetyMargin.toLocaleString()} safety margin). ` +
    `Breakdown: system ~${input.systemTokens.toLocaleString()}, ` +
    `${input.toolCount} tool definitions ~${input.toolsTokens.toLocaleString()}, ` +
    `conversation ~${input.messagesTokens.toLocaleString()}. ` +
    `Request not sent.`
  );
}
