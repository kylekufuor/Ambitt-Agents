import Anthropic from "@anthropic-ai/sdk";
import prisma from "../db.js";
import logger from "../logger.js";
import { logUsage } from "../claude.js";

// ---------------------------------------------------------------------------
// request_review — Vera (design-verify / editor-QA agent)
// ---------------------------------------------------------------------------
// A platform tool any content-producing agent can call before sending
// client-facing artifacts. The caller passes a structured payload (currently
// ProposalEmailData) + an optional context blurb; Vera (Haiku) reads it under
// a QA system prompt and returns approve / reject with specific issues.
//
// Locked design (see project_onboarding_agent_scaffold.md):
//   - A TOOL the producing agent calls, not a parallel runtime trigger.
//   - Reviews structured JSON, NOT rendered HTML — field-level checks are
//     cheaper in tokens and easier to ground.
//   - Model = Haiku 4.5 (~$0.005 / call, ~10s latency).
//   - Usage is attributed to the Vera Agent row (seed-vera.ts) so cost
//     tracking + future Vera-ran-X-times reporting flows through the same
//     ApiUsage pipeline every other agent uses.
//
// v1 scope = proposal-email JSON only. Future expansion: welcome emails,
// digests, quote emails, alerts. The tool signature stays the same — the
// system prompt teaches Vera what kind of artifact she's looking at via the
// `artifact_type` field.
// ---------------------------------------------------------------------------

export type VeraArtifactType =
  | "proposal_email" // ProposalEmailData JSON
  | "generic"; // catch-all for future expansion

export interface RequestReviewInput {
  /** Which kind of artifact Vera is reviewing — drives which checklist she uses. */
  artifactType: VeraArtifactType;
  /** The structured payload (e.g. ProposalEmailData). Vera sees it serialized as JSON. */
  data: unknown;
  /**
   * Optional grounding the caller knows but Vera couldn't infer from the data alone.
   * Example: "Prospect is Kyle Kufuor (Ambitt Media). Agent name should be Kwame.
   * Preferred name in greeting should be Kyle, not Kwame. Brand voice samples:
   * <paste>." Keep this under ~500 tokens.
   */
  context?: string;
  /**
   * Which attempt this is. Surfaced back to Atlas so on attempt 3 we can hint
   * "next reject will be your last — fix or ship as-is". Enforced softly via
   * prompt; the engine's 10-loop ceiling is the hard limit.
   */
  attempt?: number;
  /** AgentId of the CALLER (the agent asking for review). For logging. */
  callerAgentId: string;
}

export interface RequestReviewResult {
  status: "approved" | "rejected" | "error";
  /** Text Atlas (or any caller) sees as the tool result. */
  message: string;
  /** Structured critique surfaced to ops/telemetry. */
  critique?: VeraCritique;
  reviewerAgentId?: string;
}

export interface VeraCritique {
  approved: boolean;
  /**
   * Specific defects Vera found. Each issue is a short, actionable sentence
   * tied to a field path when possible. Empty array when approved.
   */
  issues: string[];
  /**
   * Optional softer suggestions — improvements that aren't blockers but
   * Atlas should consider on the next pass. May be present even on approve.
   */
  suggestions: string[];
  /** Short one-line summary of Vera's overall read. Always present. */
  summary: string;
}

const VERA_EMAIL = "vera@ambitt.agency";
const VERA_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1200;

let cachedVeraAgentId: string | null = null;
async function getVeraAgentId(): Promise<string | null> {
  if (cachedVeraAgentId) return cachedVeraAgentId;
  const row = await prisma.agent.findUnique({
    where: { email: VERA_EMAIL },
    select: { id: true },
  });
  if (row) {
    cachedVeraAgentId = row.id;
    return row.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// System prompt — Vera's QA persona + checklist
// ---------------------------------------------------------------------------
// The prompt is intentionally long-form: Vera needs to internalize the brand
// voice rules (we-not-Kyle, write-like-human) and the field-level invariants
// for each artifact type. Long prompt → write once, cache via ephemeral
// cache_control on every call (≥4k chars triggers caching in shared/claude.ts;
// we mirror that threshold here).
// ---------------------------------------------------------------------------

const VERA_SYSTEM_PROMPT = `You are Vera, Ambitt Agents' internal quality reviewer. Your one job is to read structured content another agent drafted for a real client (or prospect) and decide whether it ships — or what needs to be fixed before it ships.

You review BEFORE the client sees anything. The producing agent (usually Atlas) calls you via the request_review tool, passing the JSON it wants to send. You return APPROVE or REJECT with specific, actionable defects.

You are NOT a copywriter. You don't rewrite. You don't suggest entire new sections. You flag concrete defects another agent can fix on the next pass.

# How the proposal email is structured (so you know what each field does)

When you're reviewing a \`proposal_email\` payload, here's what each field renders as. This matters — many fields look superficially similar but play very different roles, and you'll make false-positive rejections if you don't keep them straight.

- **\`subject\`** — the email's subject line. Plain text. Should be short and not pricing-laden.
- **\`greeting.name\`** — the FIRST NAME of the human the email is addressed TO (the prospect, NOT the agent). Renders as "Hi {name},".
- **\`greeting.body\`** — 2–3 sentences of opening prose, written as Ambitt speaking ("we" / "our team"). NEVER first-person human ("Kyle here"), NEVER first-person agent ("I'm Kwame"). This is the voice of the brand.
- **\`hero.title\`** — the email's BIG VISUAL HEADER, treated like a product card title. It is COMPLETELY FINE for this to name the agent and call it an agent — e.g., "Meet Kwame, your new lead-gen agent." That is a HEADLINE describing a software product Atlas is proposing. It is NOT a signature, NOT a greeting, NOT a self-introduction. Naming the agent here is REQUIRED in the locked Atlas prompt — do NOT flag it.
- **\`hero.specs[]\`** — short label/value rows under the hero (Targets, Cadence, Mode, etc.). Plain values, possibly with inline accent spans.
- **\`introQuote.text\`** — an optional pull-quote with teal border. Describes the agent in the third person. Naming the agent here is fine.
- **\`whatWeBuild\`** — describes what the agent does. Third-person about the agent. Naming the agent here is fine.
- **\`flow.steps[].description\`** — numbered steps. Naming the agent ("Bob hunts...", "Bob drafts...") is fine and encouraged.
- **\`sample.card.body\`** — the body of a SAMPLE artifact the agent would produce (e.g., a sample cold email, a sample support reply). This is a DRAFT the agent would write on the client's behalf. The voice inside this body should match whoever is sending the artifact — usually the client (e.g., the client's cold email to a prospect). Naming the agent in HERE would be wrong (the agent doesn't send the artifact as itself), but the agent's name CAN appear in surrounding labels.
- **\`sample.card.signature\`** — the sign-off of the SAMPLE artifact. This is the SENDER of the sample. Almost always the CLIENT's brand (e.g., "— Ambitt Media Team") because the agent drafts FOR the client. Signing as the agent persona ("— Kwame, your lead-gen agent") would be WRONG — that's the case to reject.
- **\`digest.cardTitle\`** — the title of a daily/weekly digest the agent emits to the client. Naming the agent ("Kwame's Daily Report") is fine and encouraged.
- **\`cta\`** — the action buttons. \`subtext\` may mention timeline/scope but NEVER prices.

In short: **the agent's name appearing in design labels (hero title, headlines, digest titles, flow step descriptions) is REQUIRED, not a defect.** The defect to look for is the agent SPEAKING IN FIRST PERSON or SIGNING AN ARTIFACT AS A HUMAN.

# Hard rejection criteria

Reject (approved: false) if ANY of the following are true. Each defect must become a one-sentence issue tied to the field path when possible.

## Forbidden content
- Any dollar amount, price, retainer, hourly rate, setup fee, or pricing tier appears anywhere. Pricing is drafted separately by humans AFTER scope is approved. Even "starting at $X" or "around $X" is forbidden in proposals.
- Any "we can do anything", "any task you can imagine", "unlimited capabilities", "AI can solve any problem" overclaim. We sell specific agents that do specific things — never magic.
- Any naming of an individual operator ("Kyle", "Kyle Kufuor", "Kyle from Ambitt", "Kyle's team", "I work with Kyle"). Ambitt speaks as "we" / "our team" / the brand. The ONE exception: a sample artifact's signature can be a real human name IF the sample is FROM the client themselves (e.g. a cold-email draft signed by the prospect). It must never be the agent name signing as a human.
- Markdown code fences, "Here's the JSON:", "I've prepared", "Let me know if", any conversational preamble or postamble inside string fields. The strings are rendered as-is into a polished email.

## Brand-voice violations (AI tells)
Reject if any of these phrases or patterns appear in any prose field (greeting.body, paragraphs[], introText, descriptions, etc.):
- "leverage", "robust", "seamless", "delve into", "comprehensive", "streamline", "value-add", "unlock", "synergy", "in today's fast-paced world", "it's worth noting", "furthermore", "moreover", "indeed"
- "navigate the landscape", "the journey", "elevate your", "harness the power"
- Tricolons on every line (the "X, Y, and Z" symmetric rhythm)
- Em-dashes used as filler in every sentence (one or two is fine; six in a paragraph reads AI)
- Empty intensifiers: "truly", "incredibly", "absolutely", "literally"
- Bullet-list reflex when prose would read better
- Symmetrical clauses on consecutive lines ("Not just X. But Y." repeated 3+ times)

## Specificity failures
Reject if any of these are true:
- A section reads like it could have been written for ANY prospect — no concrete details from THEIR business, THEIR website, THEIR situation appear.
- whatWeBuild.paragraphs uses placeholder-feeling language ("your business", "your customers") with no specific grounding (the prospect's actual industry, their product, their workflow).
- flow.steps[*].description is generic ("collect data", "send emails") rather than concrete ("pull new tickets from Zendesk, draft a reply matching your tone, queue for your review").
- sample.card.body could be from any agent in any industry — no signal it's tailored to this prospect's situation.

## Intra-JSON consistency
Reject if any of these mismatch:
- greeting.name is the AGENT's name instead of the prospect's preferred name. (greeting.name should be the human the email is addressed TO.)
- The agent's name appears in some sections but not others (e.g. in digest.cardTitle but not in hero.title — pick one: name them throughout, or don't). NOTE: naming the agent in hero.title, whatWeBuild, flow.steps, digest.cardTitle is EXPECTED and CORRECT — only flag the absence of the name where it logically should appear, not its presence.
- sample.card.signature is the AGENT signing AS A PERSON (e.g. "— Kwame, your lead-gen agent" or "— Bob"). The sample artifact's signature should be the CLIENT's brand (e.g. "— Ambitt Media Team") because the agent drafts ON BEHALF OF the client. Signing as the client's brand is correct; signing as the agent is the defect.
- The role described in spec rows / flow / digest contradicts itself (says "lead gen" in one place, "support" in another — without a clear reason).

## Schema-shape issues to flag (NOT reject for — Zod handles those)
You don't need to validate that required fields exist or types match — a Zod validator runs after you. Focus your attention on content quality. If a required field is empty-string or one-word ("hi"), flag THAT as a specificity issue, not a schema issue.

# When to APPROVE

Approve (approved: true) when:
- No hard-reject criteria fire.
- The content reads like a thoughtful peer wrote it for THIS prospect.
- Specific, grounded, concrete. Names match. Brand voice clean.
- Suggestions (the softer field) MAY contain "consider tightening X" or "Y could be sharper" — but anything you'd genuinely block on belongs in issues[], not suggestions[].

# Output format

Return ONLY this JSON object — no preamble, no code fences, no commentary:

{
  "approved": true | false,
  "issues": ["specific defect 1 with field path", "..."],
  "suggestions": ["softer improvement 1", "..."],
  "summary": "one sentence summarizing your read"
}

If approved is true, issues MUST be an empty array. If approved is false, issues MUST contain at least one defect. suggestions can be empty in either case.`;

// ---------------------------------------------------------------------------
// Vera invocation — one Haiku call, returns critique
// ---------------------------------------------------------------------------

async function callVera(
  artifactType: VeraArtifactType,
  data: unknown,
  context: string | undefined,
  attempt: number,
  veraAgentId: string | null
): Promise<VeraCritique> {
  const client = new Anthropic();
  const userMessage = buildUserMessage(artifactType, data, context, attempt);

  const response = await client.messages.create({
    model: VERA_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.2, // QA wants consistency, not creativity
    system: [{ type: "text", text: VERA_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  // Attribute usage to the Vera Agent row if we have it; otherwise skip
  // logging (don't block the review on a missing seed — Vera still works).
  if (veraAgentId) {
    const cacheCreationTokens = response.usage.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
    await logUsage(veraAgentId, "vera.review", {
      model: VERA_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens:
        response.usage.input_tokens +
        response.usage.output_tokens +
        cacheCreationTokens +
        cacheReadTokens,
      cacheCreationTokens,
      cacheReadTokens,
      isPrimaryRun: false,
    }).catch((err) => {
      logger.warn("Vera usage logging failed (continuing)", { err });
    });
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  return parseVeraOutput(raw);
}

function buildUserMessage(
  artifactType: VeraArtifactType,
  data: unknown,
  context: string | undefined,
  attempt: number
): string {
  const parts: string[] = [];
  parts.push(`Artifact type: ${artifactType}`);
  parts.push(`Review attempt: ${attempt}${attempt >= 3 ? " (Atlas's last shot — be precise about what's blocking)" : ""}`);
  if (context && context.trim().length > 0) {
    parts.push(`\nGrounding context from the caller:\n${context.trim()}`);
  }
  parts.push(`\nContent to review (JSON):\n${JSON.stringify(data, null, 2)}`);
  parts.push(`\nReturn your critique JSON now. No code fences, no commentary.`);
  return parts.join("\n");
}

function parseVeraOutput(raw: string): VeraCritique {
  const trimmed = raw.trim();

  // Try direct parse first
  let parsed: unknown = null;
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }

  // Fence extraction
  if (parsed === null) {
    const fence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fence) {
      try {
        parsed = JSON.parse(fence[1].trim());
      } catch {
        // fall through
      }
    }
  }

  // Brace slice
  if (parsed === null) {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        // give up
      }
    }
  }

  // If Vera's output couldn't be parsed at all, treat as "I don't know" → approve.
  // The Zod validator downstream will still gate the render; better to ship a
  // run than block on a malformed reviewer response.
  if (parsed === null || typeof parsed !== "object") {
    logger.warn("Vera output unparseable — defaulting to approve", { raw: trimmed.slice(0, 500) });
    return {
      approved: true,
      issues: [],
      suggestions: [],
      summary: "Vera output unparseable; defaulted to approve (downstream Zod still gates render).",
    };
  }

  const obj = parsed as Record<string, unknown>;
  const approved = obj.approved === true;
  const issues = Array.isArray(obj.issues) ? obj.issues.filter((x): x is string => typeof x === "string") : [];
  const suggestions = Array.isArray(obj.suggestions)
    ? obj.suggestions.filter((x): x is string => typeof x === "string")
    : [];
  const summary = typeof obj.summary === "string" ? obj.summary : "";

  // If Vera says approved but issues[] is non-empty, trust issues over the flag
  // (defensive — caller can mis-set the flag). Same logic in reverse: rejected
  // with empty issues = treat as approved.
  if (approved && issues.length === 0) return { approved: true, issues, suggestions, summary };
  if (!approved && issues.length > 0) return { approved: false, issues, suggestions, summary };
  return { approved: issues.length === 0, issues, suggestions, summary };
}

// ---------------------------------------------------------------------------
// Public API — what the engine wires up
// ---------------------------------------------------------------------------

export async function requestReview(input: RequestReviewInput): Promise<RequestReviewResult> {
  const { artifactType, data, context, callerAgentId } = input;
  const attempt = input.attempt ?? 1;

  if (!artifactType) {
    return {
      status: "error",
      message: "request_review requires artifact_type (e.g. 'proposal_email').",
    };
  }
  if (data === undefined || data === null) {
    return {
      status: "error",
      message: "request_review requires a non-empty data payload to review.",
    };
  }

  // The Vera Agent row is for cost-attribution + reporting; the review itself
  // doesn't depend on it. If the row's missing, log a warning and run the
  // review anyway — usage just won't get attributed. Ops should seed via
  // scripts/seed-vera.ts but that's not a runtime blocker.
  const veraAgentId = await getVeraAgentId();
  if (!veraAgentId) {
    logger.warn("Vera Agent row not found — running review anyway, usage will be unattributed", {
      callerAgentId,
      artifactType,
    });
  }

  let critique: VeraCritique;
  try {
    critique = await callVera(artifactType, data, context, attempt, veraAgentId);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("Vera review call failed", { callerAgentId, artifactType, attempt, err: errMsg });
    // Fail open on infra errors — don't block Atlas's run because Haiku had a hiccup.
    return {
      status: "approved",
      message: `Vera review couldn't run (${errMsg.slice(0, 160)}). Proceeding without QA — downstream Zod still gates the render.`,
      reviewerAgentId: veraAgentId ?? undefined,
    };
  }

  logger.info("Vera review complete", {
    callerAgentId,
    reviewerAgentId: veraAgentId,
    artifactType,
    attempt,
    approved: critique.approved,
    issueCount: critique.issues.length,
    suggestionCount: critique.suggestions.length,
  });

  return {
    status: critique.approved ? "approved" : "rejected",
    message: critique.approved ? formatApproveMessage(critique) : formatRejectMessage(critique, attempt),
    critique,
    reviewerAgentId: veraAgentId ?? undefined,
  };
}

function formatApproveMessage(critique: VeraCritique): string {
  const lines: string[] = [];
  lines.push(`✅ APPROVED — ${critique.summary || "ready to ship."}`);
  if (critique.suggestions.length > 0) {
    lines.push("");
    lines.push("Soft suggestions (optional — not blockers):");
    for (const s of critique.suggestions) lines.push(`• ${s}`);
  }
  lines.push("");
  lines.push("Emit your FINAL JSON now — exactly the payload you just sent me, verbatim. No commentary, no preamble, no code fences.");
  return lines.join("\n");
}

function formatRejectMessage(critique: VeraCritique, attempt: number): string {
  const lines: string[] = [];
  lines.push(`❌ REJECTED (attempt ${attempt}) — ${critique.summary || "fix the issues below and re-submit."}`);
  lines.push("");
  lines.push("Blocking issues — fix each one:");
  for (const i of critique.issues) lines.push(`• ${i}`);
  if (critique.suggestions.length > 0) {
    lines.push("");
    lines.push("Also consider (softer — not blockers):");
    for (const s of critique.suggestions) lines.push(`• ${s}`);
  }
  lines.push("");
  if (attempt >= 3) {
    lines.push("⚠️ This was your 3rd attempt. Fix the blocking issues and call request_review ONE more time, then emit JSON regardless of the result — don't loop further.");
  } else {
    lines.push("Revise your JSON to address each issue, then call request_review again with the corrected payload. Do NOT emit the JSON as your final message until I approve.");
  }
  return lines.join("\n");
}
