// oracle/templates/quote/render.ts
//
// Zod validator + Handlebars renderer for QuoteData. Same pattern as
// proposal-email/render.ts and prd/render.ts. Client-facing visual treatment
// matches the proposal — warm whites, teal accent, Ambitt brand.

import Handlebars from "handlebars";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Zod schema — mirrors ./types.ts
// ---------------------------------------------------------------------------

const scopeItem = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  kind: z.enum(["integration", "custom_code", "automation", "prompt", "testing", "launch"]),
});

export const quoteSchema = z.object({
  subject: z.string().min(1),
  greeting: z.object({
    name: z.string().min(1),
    body: z.string().min(1),
  }),
  hero: z.object({
    label: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().min(1),
  }),
  pricing: z.object({
    setupCents: z.number().int().nonnegative(),
    monthlyCents: z.number().int().nonnegative(),
    tierLabel: z.string().min(1),
    summary: z.string().min(1),
  }),
  scopeOfWork: z.object({
    intro: z.string().optional(),
    items: z.array(scopeItem).min(3).max(15),
  }),
  monthlyIncludes: z.array(z.string().min(1)).min(3).max(8),
  notIncluded: z.array(z.string().min(1)).min(2).max(6),
  timeline: z.object({
    buildWindow: z.string().min(1),
    description: z.string().min(1),
  }),
  terms: z.object({
    validity: z.string().min(1),
    paymentTerms: z.string().min(1),
    cancellation: z.string().min(1),
  }),
  cta: z.object({
    headline: z.string().min(1),
    subtext: z.string().min(1),
    approveLabel: z.string().min(1),
    approveUrl: z.string().min(1),
    denyLabel: z.string().min(1),
    denyUrl: z.string().min(1),
  }),
  footer: z.object({
    domain: z.string().min(1),
    location: z.string().min(1),
    note: z.string().optional(),
  }),
});

export type QuoteData = z.infer<typeof quoteSchema>;

// ---------------------------------------------------------------------------
// Handlebars helpers — currency formatting
// ---------------------------------------------------------------------------

Handlebars.registerHelper("dollars", (cents: unknown) => {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toLocaleString()}`;
});

// Map kind → icon character + accent (kept simple inline). Easier than SVG icons.
Handlebars.registerHelper("kindIcon", (kind: unknown) => {
  const map: Record<string, string> = {
    integration: "🔌",
    custom_code: "⚙️",
    automation: "🔁",
    prompt: "✍️",
    testing: "🧪",
    launch: "🚀",
  };
  return typeof kind === "string" ? map[kind] ?? "•" : "•";
});

Handlebars.registerHelper("kindLabel", (kind: unknown) => {
  const map: Record<string, string> = {
    integration: "Integration",
    custom_code: "Custom code",
    automation: "Automation",
    prompt: "Prompt engineering",
    testing: "Testing",
    launch: "Launch",
  };
  return typeof kind === "string" ? map[kind] ?? "Item" : "Item";
});

// ---------------------------------------------------------------------------
// Template compile
// ---------------------------------------------------------------------------

const TEMPLATE_PATH = join(__dirname, "template.html");
const compiled = Handlebars.compile(readFileSync(TEMPLATE_PATH, "utf-8"));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class QuoteValidationError extends Error {
  readonly issues: z.ZodIssue[];
  constructor(issues: z.ZodIssue[]) {
    super(`QuoteData failed validation: ${issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    this.issues = issues;
    this.name = "QuoteValidationError";
  }
}

export function renderQuote(data: unknown): string {
  const result = quoteSchema.safeParse(data);
  if (!result.success) {
    throw new QuoteValidationError(result.error.issues);
  }
  return compiled(result.data);
}

/** Tolerant Atlas-output parser. Same approach as proposal-email/render.ts. */
export function parseAtlasQuoteOutput(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through */
    }
  }
  const fence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      /* give up */
    }
  }
  return null;
}
