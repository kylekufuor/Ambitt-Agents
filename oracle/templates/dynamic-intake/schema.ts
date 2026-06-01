// oracle/templates/dynamic-intake/schema.ts
//
// Atlas (via Haiku — see TRIAGE_MODEL) generates a domain-specific intake
// after the prospect answers the 3 static slides. Output matches this Zod
// schema; rendered as one slide per question in the portal.
//
// Adaptive intake spec, 2026-05-31: "Same prospect journey, no email steps,
// much higher signal." Cap question count at 10 to control drop-off.

import { z } from "zod";

const QUESTION_TYPES = ["text", "longText", "select", "multiSelect", "scale"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const questionSchema = z
  .object({
    /** Stable slug used as the key in Prospect.formData.dynamic.answers. */
    id: z.string().min(1).regex(/^[a-z][a-z0-9_-]*$/, "id must be lowercase slug"),
    /** Determines portal render component. */
    type: z.enum(QUESTION_TYPES),
    /** Shown to the prospect. */
    label: z.string().min(1),
    /** Optional input placeholder; ignored for select/multiSelect/scale. */
    placeholder: z.string().optional(),
    /** Required for select / multiSelect. 2-8 options recommended. */
    options: z.array(z.string().min(1)).min(2).max(12).optional(),
    /** When true, portal blocks "Continue" until answered. */
    required: z.boolean(),
    /**
     * One-sentence note from Atlas about WHY this question matters. Not shown
     * to the prospect. Carried forward to proposal generation so the model
     * can weight answers by their stated purpose.
     */
    rationale: z.string().min(1),
  })
  .refine(
    (q) => !["select", "multiSelect"].includes(q.type) || (q.options && q.options.length >= 2),
    { message: "options required (≥2) for select/multiSelect", path: ["options"] }
  );

export const dynamicIntakeSchema = z.object({
  /**
   * Atlas's classification of the prospect's domain + agent archetype.
   * Surfaced to the prospect on the FIRST dynamic slide as a confirmation
   * header ("We think you're a {domainSummary} — keep going or hit back").
   * Also passed forward into proposal generation as grounding context.
   */
  domainSummary: z.string().min(1),
  /** Short archetype label, e.g. "lead-gen agent" | "EA" | "research analyst". */
  agentArchetype: z.string().min(1),
  /** 6-10 domain-specific questions, one per slide. */
  questions: z.array(questionSchema).min(6).max(10),
});

export type DynamicIntakeQuestions = z.infer<typeof dynamicIntakeSchema>;

export class DynamicIntakeValidationError extends Error {
  readonly issues: z.ZodIssue[];
  constructor(issues: z.ZodIssue[]) {
    super(
      `DynamicIntakeQuestions failed validation: ${issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
    this.issues = issues;
    this.name = "DynamicIntakeValidationError";
  }
}

/**
 * Parses Atlas's text output into a JS object. Handles common output
 * patterns (raw JSON, ```json fenced, leading prose). Returns null if
 * no JSON block could be extracted. Mirrors parseAtlasJsonOutput in the
 * proposal-email render module.
 */
export function parseDynamicIntakeOutput(raw: string): unknown {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // give up
    }
  }

  return null;
}

/**
 * Validates raw parsed JSON against the schema. Throws
 * DynamicIntakeValidationError on failure (callable from a retry loop, same
 * pattern as renderProposalEmail / renderQuote).
 */
export function validateDynamicIntake(data: unknown): DynamicIntakeQuestions {
  const result = dynamicIntakeSchema.safeParse(data);
  if (!result.success) {
    throw new DynamicIntakeValidationError(result.error.issues);
  }
  return result.data;
}
