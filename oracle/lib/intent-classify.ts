// Control-plane Pillar 1 — plain-language control intent classification.
//
// When a client messages their agent (email/WhatsApp/chat) we read the message's
// CONTROL INTENT *before* running the agent, so telling the agent to "stop" /
// "pause" / "send me fewer emails" behaves exactly like telling a human contractor
// to stop — no magic keywords required.
//
// FAIL-SAFE POLICY: when it is genuinely ambiguous whether the client wants to
// stop, we prefer to pause and confirm. That policy lives in isHaltIntent(),
// which treats BOTH "halt" and "ambiguous" as halt. A message that is clearly a
// task ("normal") is never read as a stop.
//
// AVAILABILITY-SAFE: if the model is unreachable/unparseable we fall back to
// "normal" (source "fallback") rather than halting every task — obvious stops are
// already caught by the deterministic keyword fast-path below, which never calls
// a model.

export type ControlIntent = "halt" | "resume" | "throttle" | "normal" | "ambiguous";

export interface IntentResult {
  intent: ControlIntent;
  confidence: number;
  matched?: string;
  source: "keyword" | "model" | "fallback";
}

// Deterministic keyword rules, evaluated IN ORDER. Resume and throttle are checked
// BEFORE halt so that phrases like "you can start again" register as resume (not
// halt on the substring "start"), and "send me fewer emails" registers as throttle.
interface KeywordRule {
  intent: Exclude<ControlIntent, "normal" | "ambiguous">;
  pattern: RegExp;
}

const KEYWORD_RULES: KeywordRule[] = [
  // --- resume (checked first) ---
  { intent: "resume", pattern: /\bresume\b/i },
  { intent: "resume", pattern: /\bunpause\b/i },
  { intent: "resume", pattern: /\bun-pause\b/i },
  { intent: "resume", pattern: /\bstart again\b/i },
  { intent: "resume", pattern: /\bstart back up\b/i },
  { intent: "resume", pattern: /\byou can (start|go|continue)\b/i },
  { intent: "resume", pattern: /\bgo ahead\b/i },
  { intent: "resume", pattern: /\bcarry on\b/i },
  { intent: "resume", pattern: /\bpick it (back )?up\b/i },

  // --- throttle (checked before halt) ---
  { intent: "throttle", pattern: /\bfewer\b/i },
  { intent: "throttle", pattern: /\bless often\b/i },
  { intent: "throttle", pattern: /\bslow down\b/i },
  { intent: "throttle", pattern: /\btoo many\b/i },
  { intent: "throttle", pattern: /\bdial it back\b/i },
  { intent: "throttle", pattern: /\bonce a day\b/i },
  { intent: "throttle", pattern: /\bdaily digest\b/i },
  { intent: "throttle", pattern: /\breduce\b/i },

  // --- halt ---
  { intent: "halt", pattern: /\bpause\b/i },
  { intent: "halt", pattern: /\bstop\b/i },
  { intent: "halt", pattern: /\bhalt\b/i },
  { intent: "halt", pattern: /\bhold off\b/i },
  { intent: "halt", pattern: /\bhold on\b/i },
  { intent: "halt", pattern: /\bcease\b/i },
  { intent: "halt", pattern: /\bfreeze\b/i },
  { intent: "halt", pattern: /\bdon'?t (do|send|email)\b/i },
  { intent: "halt", pattern: /\bno more emails?\b/i },
  { intent: "halt", pattern: /\bquit\b/i },
];

const VALID_INTENTS: ReadonlySet<string> = new Set<ControlIntent>([
  "halt",
  "resume",
  "throttle",
  "normal",
  "ambiguous",
]);

const MODEL_SYSTEM_PROMPT = [
  "You classify the CONTROL INTENT of a message a client sent to their AI agent.",
  "Decide whether the client is trying to control the agent's operation, and how.",
  "",
  "Output ONLY compact JSON on a single line, nothing else:",
  '{"intent":"...","confidence":0-1}',
  "",
  "intent must be exactly one of: halt | resume | throttle | normal | ambiguous",
  '- "halt": the client clearly wants the agent to stop/pause its work.',
  '- "resume": the client clearly wants a paused agent to start again.',
  '- "throttle": the client wants the agent to do less / less often, not stop.',
  '- "normal": the message is CLEARLY a task, question, or request — use this only when it is clearly NOT a control instruction.',
  '- "ambiguous": the message MIGHT be asking the agent to stop but is not clearly a task. When unsure between halt and normal, choose "ambiguous".',
  "",
  "confidence is your certainty in the chosen intent, from 0 to 1.",
].join("\n");

// Default model caller — lazily imports the repo's Claude wrapper so unit tests
// (which always inject their own callModel) never load the SDK/DB layer.
async function defaultCallModel(systemPrompt: string, userText: string): Promise<string> {
  const { callClaude } = await import("../../shared/claude.js");
  const res = await callClaude({
    systemPrompt,
    userMessage: userText,
    model: "claude-haiku-4-5-20251001", // cheap classifier
    maxTokens: 64,
    temperature: 0,
    cacheSystemPrompt: false,
  });
  return res.content;
}

function parseModelJson(raw: string): { intent: ControlIntent; confidence: number } | null {
  // Extract the first {...} object and JSON.parse it. Non-greedy on the closing
  // brace since the classifier output is a flat object.
  const match = raw.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const intent = obj.intent;
    if (typeof intent !== "string" || !VALID_INTENTS.has(intent)) return null;
    let confidence = 0.5;
    if (typeof obj.confidence === "number" && Number.isFinite(obj.confidence)) {
      confidence = Math.max(0, Math.min(1, obj.confidence));
    }
    return { intent: intent as ControlIntent, confidence };
  } catch {
    return null;
  }
}

/**
 * Classify the control intent of a client message BEFORE running the agent.
 *
 * 1. Deterministic keyword fast-path (no model call), case-insensitive, ordered
 *    resume → throttle → halt so "you can start again" resolves to resume.
 * 2. Otherwise ask the model (opts.callModel, or the default Claude-haiku caller)
 *    for compact JSON {intent, confidence}.
 * 3. On model failure / unparseable output → { intent:"normal", source:"fallback" }.
 */
export async function classifyControlIntent(
  message: string,
  opts?: { callModel?: (systemPrompt: string, userText: string) => Promise<string> }
): Promise<IntentResult> {
  const text = message ?? "";

  // 1. Keyword fast-path — first match wins.
  for (const rule of KEYWORD_RULES) {
    const m = text.match(rule.pattern);
    if (m) {
      return {
        intent: rule.intent,
        confidence: 1,
        matched: m[0],
        source: "keyword",
      };
    }
  }

  // 2. Model path.
  const callModel = opts?.callModel ?? defaultCallModel;
  try {
    const raw = await callModel(MODEL_SYSTEM_PROMPT, text);
    const parsed = parseModelJson(raw);
    if (!parsed) {
      // 3. Unparseable → availability-safe fallback.
      return { intent: "normal", confidence: 0, source: "fallback" };
    }
    return { intent: parsed.intent, confidence: parsed.confidence, source: "model" };
  } catch {
    // 3. Model threw → availability-safe fallback (do NOT halt every task).
    return { intent: "normal", confidence: 0, source: "fallback" };
  }
}

/**
 * Fail-safe policy: treat BOTH clear halts and ambiguous "might be a stop"
 * messages as halt, so when unsure we pause and confirm. Clear tasks (normal)
 * and explicit resume/throttle are not halts.
 */
export function isHaltIntent(r: IntentResult): boolean {
  return r.intent === "halt" || r.intent === "ambiguous";
}

export default { classifyControlIntent, isHaltIntent };
