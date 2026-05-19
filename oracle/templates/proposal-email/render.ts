// oracle/templates/proposal-email/render.ts
//
// Compiles the Handlebars template once at import time and exposes:
//   - `proposalEmailSchema`  — Zod schema mirroring ProposalEmailData
//   - `renderProposalEmail(data)` — validates, renders, returns HTML string
//
// Atlas produces JSON matching ProposalEmailData (see ./types.ts + AGENT_EMAIL_SPEC.md).
// The template lives in ./template.html — design tokens are hardcoded there.

import Handlebars from "handlebars";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Zod schema — runtime validator. Mirrors ./types.ts exactly.
// ---------------------------------------------------------------------------

const specRow = z.object({ label: z.string(), value: z.string() });

const flowStep = z.object({
  number: z.number().int().min(1),
  title: z.string(),
  description: z.string(),
});

const sampleHeaderRow = z.object({
  label: z.string(),
  value: z.string(),
  type: z.enum(["link", "subject", "text"]).optional(),
});

const digestColumn = z.object({ key: z.string(), label: z.string() });
const digestCell = z.object({ value: z.string(), type: z.literal("pill").optional() });

export const proposalEmailSchema = z.object({
  subject: z.string().min(1),
  greeting: z.object({
    name: z.string().min(1),
    body: z.string().min(1),
  }),
  hero: z.object({
    label: z.string().min(1),
    title: z.string().min(1),
    status: z
      .object({
        text: z.string(),
        tone: z.enum(["info", "warn", "success", "neutral"]),
      })
      .optional(),
    specs: z.array(specRow).min(3).max(7),
  }),
  introQuote: z.object({ text: z.string().min(1) }).optional(),
  whatWeBuild: z.object({
    label: z.string().optional(),
    headline: z.string().min(1),
    paragraphs: z.array(z.string().min(1)).min(1).max(3),
  }),
  flow: z.object({
    label: z.string().optional(),
    headline: z.string().min(1),
    steps: z.array(flowStep).min(3).max(7),
  }),
  sample: z
    .object({
      label: z.string().optional(),
      headline: z.string().min(1),
      introText: z.string().min(1),
      card: z.object({
        headerRows: z.array(sampleHeaderRow).optional(),
        body: z.string().min(1),
        signature: z.string().optional(),
      }),
    })
    .optional(),
  digest: z
    .object({
      label: z.string().optional(),
      headline: z.string().min(1),
      introText: z.string().min(1),
      cardTitle: z.string().min(1),
      cardMeta: z.string().min(1),
      columns: z.array(digestColumn).min(3).max(5),
      rows: z.array(z.array(digestCell)).min(1),
    })
    .optional(),
  cta: z.object({
    headline: z.string().min(1),
    subtext: z.string().min(1),
    primaryLabel: z.string().min(1),
    primaryUrl: z.string().min(1),
    secondaryLabel: z.string().min(1),
    secondaryUrl: z.string().min(1),
    tertiaryLabel: z.string().optional(),
    tertiaryUrl: z.string().optional(),
  }),
  footer: z.object({
    domain: z.string().min(1),
    location: z.string().min(1),
    note: z.string().optional(),
  }),
});

export type ProposalEmailData = z.infer<typeof proposalEmailSchema>;

// ---------------------------------------------------------------------------
// Handlebars template — compiled once.
// ---------------------------------------------------------------------------

const TEMPLATE_PATH = join(__dirname, "template.html");
const compiled = Handlebars.compile(readFileSync(TEMPLATE_PATH, "utf-8"));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class ProposalEmailValidationError extends Error {
  readonly issues: z.ZodIssue[];
  constructor(issues: z.ZodIssue[]) {
    super(`ProposalEmailData failed validation: ${issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    this.issues = issues;
    this.name = "ProposalEmailValidationError";
  }
}

/**
 * Validates the data against the schema, then renders to HTML.
 * Throws ProposalEmailValidationError on invalid input — caller can catch +
 * decide to retry Atlas with the validation message.
 */
export function renderProposalEmail(data: unknown): string {
  const result = proposalEmailSchema.safeParse(data);
  if (!result.success) {
    throw new ProposalEmailValidationError(result.error.issues);
  }
  return compiled(result.data);
}

/**
 * Parses Atlas's text output (which may include code fences) into a JS object.
 * Returns null if no JSON block could be extracted.
 *
 * Handles common Atlas output patterns:
 *   - Raw JSON
 *   - ```json ... ``` fenced
 *   - ``` ... ``` fenced
 *   - Leading/trailing prose (slices to first { and last })
 */
export function parseAtlasJsonOutput(raw: string): unknown {
  const trimmed = raw.trim();

  // Try direct parse first
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through to fence extraction
    }
  }

  // Look for ```json ... ``` or ``` ... ``` fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through to brace extraction
    }
  }

  // Last resort: slice from first { to last }
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
