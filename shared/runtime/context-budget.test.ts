// Run: node_modules/.bin/tsx shared/runtime/context-budget.test.ts
// Pure unit test for the runtime context budget. No DB, no Anthropic client.
//
// The regression this guards: Arthur's 2026-07-06 scheduled run died with
//   400 invalid_request_error: prompt is too long: 212067 tokens > 200000
// and was never retried. 200,000 is HAIKU's window (the triage model the loop
// starts on), not Sonnet's 1M — so the budget has to be per-model, and the
// growth it has to contain is unbounded tool results inside the loop, not the
// system prompt (which the assembler already caps).
import type Anthropic from "@anthropic-ai/sdk";
import {
  budgetFor,
  capToolResultContent,
  contextLimitFor,
  contextOverflowMessage,
  estimateMessagesTokens,
  estimateTokens,
  estimateToolsTokens,
  trimMessagesToBudget,
  DEFAULT_CONTEXT_LIMIT,
  MAX_TOOL_RESULT_CHARS,
  KEEP_RECENT_TOOL_RESULTS,
  TOOL_RESULT_TRIMMED_NOTICE,
} from "./context-budget.js";

// --- Tiny assertion harness ------------------------------------------------
let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Model limits — the whole point is that Haiku is the tight one
// ---------------------------------------------------------------------------
check("haiku (triage model) is a 200K window", contextLimitFor("claude-haiku-4-5-20251001") === 200_000);
check("haiku alias is a 200K window", contextLimitFor("claude-haiku-4-5") === 200_000);
check("sonnet 4.6 is a 1M window", contextLimitFor("claude-sonnet-4-6") === 1_000_000);
check("opus 4.7 is a 1M window", contextLimitFor("claude-opus-4-7") === 1_000_000);
check("opus 5 (client model) is a 1M window", contextLimitFor("claude-opus-5") === 1_000_000);
check(
  "an unknown model id gets the SMALLEST window, not the largest",
  contextLimitFor("claude-something-new") === DEFAULT_CONTEXT_LIMIT && DEFAULT_CONTEXT_LIMIT === 200_000
);

// ---------------------------------------------------------------------------
// Budget arithmetic
// ---------------------------------------------------------------------------
const haikuBudget = budgetFor("claude-haiku-4-5-20251001", 16384);
check("budget reserves the output tokens", haikuBudget.reserveOutput === 16384);
check(
  "haiku prompt ceiling = window - output - margin",
  haikuBudget.promptCeiling === 200_000 - 16384 - haikuBudget.safetyMargin,
  JSON.stringify(haikuBudget)
);
check("haiku ceiling leaves real headroom", haikuBudget.promptCeiling > 160_000 && haikuBudget.promptCeiling < 200_000, String(haikuBudget.promptCeiling));
const sonnetBudget = budgetFor("claude-sonnet-4-6", 16384);
check("sonnet gets a far larger ceiling than haiku", sonnetBudget.promptCeiling > 900_000, String(sonnetBudget.promptCeiling));
check("safety margin is capped, not 5% of 1M", sonnetBudget.safetyMargin === 20_000, String(sonnetBudget.safetyMargin));

// ---------------------------------------------------------------------------
// Estimator — must not UNDER-count, that's how you ship a 400
// ---------------------------------------------------------------------------
check("empty string is zero tokens", estimateTokens("") === 0);
check("estimator scales with length", estimateTokens("x".repeat(3500)) === 1000);
check(
  "estimate over-counts rather than under-counts vs the ~4 chars/token rule of thumb",
  estimateTokens("x".repeat(4000)) > 1000
);
check(
  "a 212K-token-class prompt is recognised as such",
  estimateTokens("x".repeat(212_067 * 3.5)) >= 212_000
);

// ---------------------------------------------------------------------------
// Helpers for building conversations
// ---------------------------------------------------------------------------
type Msg = Anthropic.Messages.MessageParam;

function toolRound(id: string, resultChars: number): Msg[] {
  return [
    {
      role: "assistant",
      content: [
        { type: "tool_use", id, name: "COMPOSIO__list_emails", input: { query: "unread" } },
      ] as Anthropic.Messages.ContentBlockParam[],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: id, content: "R".repeat(resultChars), is_error: false },
      ] as Anthropic.Messages.ContentBlockParam[],
    },
  ];
}

function conversation(rounds: number, resultChars: number): Msg[] {
  const msgs: Msg[] = [{ role: "user", content: "This is your scheduled run. Do your job." }];
  for (let i = 0; i < rounds; i++) msgs.push(...toolRound(`toolu_${i}`, resultChars));
  return msgs;
}

// ---------------------------------------------------------------------------
// Trimming — short history untouched
// ---------------------------------------------------------------------------
const shortHistory = conversation(3, 2_000);
const shortTrim = trimMessagesToBudget(shortHistory, {
  promptCeiling: haikuBudget.promptCeiling,
  fixedTokens: 20_000,
});
check("a normal run is not trimmed at all", shortTrim.trimmedBlocks === 0, JSON.stringify({ trimmed: shortTrim.trimmedBlocks, est: shortTrim.estimatedTokens }));
check("a normal run is within budget", shortTrim.withinBudget === true);
check(
  "a normal run's messages come back byte-identical",
  JSON.stringify(shortTrim.messages) === JSON.stringify(shortHistory)
);
check(
  "the input array is never mutated",
  typeof (shortHistory[2]!.content as Anthropic.Messages.ContentBlockParam[])[0] === "object" &&
    ((shortHistory[2]!.content as { content?: string }[])[0]!.content ?? "").length === 2_000
);

// ---------------------------------------------------------------------------
// Trimming — a blown-out run is bounded, newest kept
// ---------------------------------------------------------------------------
// 10 loops × 70K chars of tool output = 700K chars ≈ 200K tokens. This is the
// Arthur shape: nothing individually crazy, no single huge document, just an
// agentic loop nobody bounded.
const blownOut = conversation(10, 70_000);
const fixed = 20_000; // system prompt + tool definitions
const before = fixed + estimateMessagesTokens(blownOut);
check("fixture really does blow the haiku window", before > 200_000, `est ${before}`);

const trimmed = trimMessagesToBudget(blownOut, {
  promptCeiling: haikuBudget.promptCeiling,
  fixedTokens: fixed,
});
check("blown-out run is brought back under budget", trimmed.withinBudget === true, `est ${trimmed.estimatedTokens} ceiling ${haikuBudget.promptCeiling}`);
check("trimming actually reduced the estimate", trimmed.estimatedTokens < before);
check("something was trimmed", trimmed.trimmedBlocks > 0, String(trimmed.trimmedBlocks));

// Structure has to survive: every tool_use still has its tool_result, or the
// API 400s on the very next call.
const toolUseIds: string[] = [];
const toolResultIds: string[] = [];
for (const m of trimmed.messages) {
  if (!Array.isArray(m.content)) continue;
  for (const b of m.content as Array<{ type?: string; id?: string; tool_use_id?: string }>) {
    if (b.type === "tool_use" && b.id) toolUseIds.push(b.id);
    if (b.type === "tool_result" && b.tool_use_id) toolResultIds.push(b.tool_use_id);
  }
}
check("no message is dropped", trimmed.messages.length === blownOut.length);
check("every tool_use still has its tool_result", JSON.stringify(toolUseIds) === JSON.stringify(toolResultIds), `${toolUseIds.length} vs ${toolResultIds.length}`);
check("the original task message survives", trimmed.messages[0]?.content === "This is your scheduled run. Do your job.");

// Newest results are the ones the model is reasoning about — they stay whole.
function resultContentAt(msgs: Msg[], round: number): string {
  const msg = msgs[1 + round * 2 + 1]!; // user message of that round
  const block = (msg.content as Array<{ content?: string }>)[0]!;
  return block.content ?? "";
}
for (let r = 10 - KEEP_RECENT_TOOL_RESULTS; r < 10; r++) {
  check(`newest result #${r} kept intact`, resultContentAt(trimmed.messages, r).length === 70_000, `len ${resultContentAt(trimmed.messages, r).length}`);
}
check("oldest result was replaced with the elision notice", resultContentAt(trimmed.messages, 0) === TOOL_RESULT_TRIMMED_NOTICE, resultContentAt(trimmed.messages, 0).slice(0, 80));
check(
  "the elision is visible to the model, not silent",
  TOOL_RESULT_TRIMMED_NOTICE.toLowerCase().includes("dropped") && TOOL_RESULT_TRIMMED_NOTICE.length > 40
);

// Trim only as much as needed: with a mild overflow, only the oldest go.
const mild = conversation(10, 62_000);
const mildTrim = trimMessagesToBudget(mild, {
  promptCeiling: haikuBudget.promptCeiling,
  fixedTokens: fixed,
});
check("mild overflow trims fewer blocks than a severe one", mildTrim.trimmedBlocks > 0 && mildTrim.trimmedBlocks < trimmed.trimmedBlocks, `${mildTrim.trimmedBlocks} vs ${trimmed.trimmedBlocks}`);

// The same conversation is fine on Sonnet's 1M window — the budget is per-model.
const onSonnet = trimMessagesToBudget(blownOut, {
  promptCeiling: sonnetBudget.promptCeiling,
  fixedTokens: fixed,
});
check("the same history needs no trimming on sonnet's 1M window", onSonnet.trimmedBlocks === 0 && onSonnet.withinBudget === true);

// ---------------------------------------------------------------------------
// Refusal — when even a fully trimmed prompt can't fit
// ---------------------------------------------------------------------------
const hopeless = trimMessagesToBudget(conversation(1, 1_000), {
  promptCeiling: haikuBudget.promptCeiling,
  fixedTokens: 500_000, // an absurd system prompt + tool set
});
check("refuses (withinBudget=false) when the fixed part alone overflows", hopeless.withinBudget === false, JSON.stringify(hopeless.estimatedTokens));

const overflowText = contextOverflowMessage({
  model: "claude-haiku-4-5-20251001",
  budget: haikuBudget,
  estimatedTokens: 212_067,
  systemTokens: 18_000,
  toolsTokens: 6_000,
  messagesTokens: 188_067,
  toolCount: 24,
});
check("refusal names the model", overflowText.includes("claude-haiku-4-5-20251001"));
check("refusal gives the estimate and the ceiling", overflowText.includes("212,067") && overflowText.includes(haikuBudget.promptCeiling.toLocaleString()));
check("refusal breaks down where the tokens went", overflowText.includes("system ~18,000") && overflowText.includes("conversation ~188,067"));
check("refusal states nothing was sent", overflowText.includes("Request not sent."));

// ---------------------------------------------------------------------------
// Single-result cap
// ---------------------------------------------------------------------------
const small = capToolResultContent("a short result");
check("a small tool result is untouched", small.truncated === false && small.content === "a short result");
const huge = capToolResultContent("R".repeat(MAX_TOOL_RESULT_CHARS + 50_000));
check("an oversized tool result is capped", huge.truncated === true);
check("cap keeps the head of the output", huge.content.startsWith("RRRR"));
check("cap tells the model what happened", huge.content.includes("truncated"));
check(
  "capped length stays close to the cap",
  huge.content.length < MAX_TOOL_RESULT_CHARS + 300,
  String(huge.content.length)
);

// ---------------------------------------------------------------------------
// Tool definitions count too
// ---------------------------------------------------------------------------
const toolsTokens = estimateToolsTokens([
  {
    name: "web_search",
    description: "D".repeat(700),
    input_schema: { type: "object", properties: { query: { type: "string" } } },
  },
] as Anthropic.Messages.Tool[]);
check("tool definitions are counted", toolsTokens > 190, String(toolsTokens));
check("empty tool list is zero", estimateToolsTokens([]) === 0);

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
