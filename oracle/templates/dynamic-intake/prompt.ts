// oracle/templates/dynamic-intake/prompt.ts
//
// Builds the Haiku prompt that generates the adaptive intake. Called from
// the /onboarding/prospects/:id/customize-questions endpoint after the
// prospect answers the 3 static slides (name+email, business basics,
// agent goal).
//
// Why Haiku: this is a structured-output task, not a reasoning task. Sonnet
// is reserved for the proposal/PRD/quote drafting where domain reasoning
// matters more. Haiku is 3× cheaper and ~3× faster — critical because this
// runs synchronously while the prospect waits on slide 4.

interface StaticIntakeContext {
  /** From slide 0: prospect's name. */
  contactName: string | null;
  /** From slide 0: prospect's email. */
  email: string;
  /** From slide 1: business name. */
  businessName: string | null;
  /** From slide 1: website URL or "—". */
  website: string | null;
  /** From slide 1: prospect's role. */
  role: string | null;
  /** From slide 2: free-text answer to "what would you want an AI agent to handle?" */
  agentGoal: string;
}

const SCHEMA_REFERENCE = `\`\`\`ts
interface DynamicIntakeQuestions {
  domainSummary: string;       // e.g. "Mid-market B2B SaaS, sales-led GTM"
  agentArchetype: string;      // e.g. "lead-gen + outreach" | "EA" | "research analyst" | "customer support"
  questions: Array<{
    id: string;                // lowercase slug, e.g. "asset-classes"
    type: "text" | "longText" | "select" | "multiSelect" | "scale";
    label: string;             // question text shown to the prospect
    placeholder?: string;      // hint text inside text/longText input
    options?: string[];        // REQUIRED for select / multiSelect (2-12 items)
    required: boolean;         // true ONLY if absence would block a good proposal
    rationale: string;         // 1 sentence — why we need this; not shown to prospect
  }>;  // 6-10 items, one per slide
}
\`\`\``;

export function buildDynamicIntakePrompt(ctx: StaticIntakeContext): string {
  const ctxLines = [
    `- Name: ${ctx.contactName ?? "(not provided)"}`,
    `- Email: ${ctx.email}`,
    `- Business: ${ctx.businessName ?? "(not provided)"}`,
    `- Website: ${ctx.website ?? "(not provided)"}`,
    `- Role: ${ctx.role ?? "(not provided)"}`,
    `- Agent goal (their words): "${ctx.agentGoal}"`,
  ].join("\n");

  return `You're tailoring the intake form for a new prospect. Your job: read what they've already told us, identify their domain + the agent archetype, and generate the next 6-10 questions to ask them. Output ONLY a JSON object — no preamble, no commentary, no code fences.

# What we already know (the 3 static slides they just filled)
${ctxLines}

# Your output must match this exact schema
${SCHEMA_REFERENCE}

# Rules — read carefully

1. **Identify the domain + archetype** from "Agent goal" + business context. Be specific: "CRE deal-sourcing agent" not "real estate". "Inbound lead-qualification agent for B2B SaaS" not "sales agent". This goes in \`domainSummary\` + \`agentArchetype\`.

2. **6-10 questions** that fill gaps in what we already know. Skew toward 7-8 unless the domain genuinely needs more.

3. **Do NOT duplicate** what's already captured. We already have name, email, business name, website, role, and the high-level agent goal — don't ask any of those again.

4. **One question MUST capture budget intent** — could be a scale (1-5 on "how price-sensitive are you"), a select ("starter <$1k / growth $1-3k / scale $2.5k+ / not sure"), or text — pick what fits the domain. Required field. Put it near the end so the prospect is already invested.

5. **Question types — pick the right tool**:
   - \`select\`: mutually exclusive choice ("which best describes…")
   - \`multiSelect\`: "which of these apply" (2-8 options usually)
   - \`scale\`: 1-5 priority / frequency / volume ratings
   - \`text\`: short open-ended (e.g. specific number, name, target)
   - \`longText\`: descriptions, lists, "tell me about your process"

6. **Required = true** only for questions whose absence would force us to guess in the proposal. Most questions should be required:false to keep momentum.

7. **Rationale** = one sentence on WHY we need this answer. Not shown to the prospect. Future drafting steps read these to weight answers — be specific ("Determines whether we propose a daily-cadence agent or event-triggered").

8. **Total answer time** across all questions should be 3-5 minutes. Cut anything a busy founder couldn't answer in 30 seconds.

9. **id format**: lowercase, hyphenated, no prefix. e.g. \`asset-classes\`, \`monthly-volume\`, \`budget-tier\`. Keep them stable — if the prospect resumes mid-flow we key answers on these ids.

10. **Output ONLY the JSON object.** Starts with \`{\`, ends with \`}\`. No markdown, no fences, no preamble.`;
}

/**
 * Builds the retry-correction prompt when the first generation fails Zod
 * validation. Re-includes the schema verbatim (same hardening we did on
 * proposal/PRD/quote — without the schema reminder, the model drifts on
 * field names).
 */
export function buildDynamicIntakeCorrection(
  issues: { path: PropertyKey[]; message: string }[]
): string {
  const issueList = issues
    .map((i, n) => `${n + 1}. ${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  return `Your previous response didn't pass schema validation. Issues:
${issueList}

REMINDER — the EXACT schema your output must match (authoritative; do NOT invent field names):

${SCHEMA_REFERENCE}

Re-emit the COMPLETE DynamicIntakeQuestions JSON matching this exact shape. Output ONLY the JSON object — starts with \`{\`, ends with \`}\`. No commentary, no code fences, no markdown.`;
}
