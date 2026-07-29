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
  // "n/a" rather than a dash placeholder: the quote is client-facing, em dashes
  // are banned there, and the send-time scrub deletes a lone dash between tags,
  // which would leave the price cell blank instead of saying anything.
  if (typeof cents !== "number") return "n/a";
  return `$${(cents / 100).toLocaleString()}`;
});

// Map kind → a duotone mark. These used to be emoji (🔌 ⚙️ 🔁 ✍️ 🧪 🚀), which
// render at a different size, weight and colour on every OS, put a stray hue in
// a one-accent document, and are one of the loudest AI-slop tells going. The
// replacements are the portal's duotone convention: a pale teal disc carrying a
// deep teal detail. Two tones of one hue, drawn at one weight.
//
// Marks only, so the pale disc is not held to a text contrast ratio. The deep
// stroke is #00706f, which clears AA on white anyway.
//
// This changes only what the helper RETURNS. `ScopeItem.kind` stays the same
// six-value enum, so the Atlas prompt and the Zod schema are untouched.
const ICON_BACK = "#c2e6e5";
const ICON_FORE = "#00706f";

function duotone(inner: string): Handlebars.SafeString {
  return new Handlebars.SafeString(
    `<svg viewBox="0 0 20 20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="10" cy="10" r="10" fill="${ICON_BACK}"/>${inner}</svg>`
  );
}

const STROKE = `fill="none" stroke="${ICON_FORE}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`;

const KIND_ICONS: Record<string, Handlebars.SafeString> = {
  // Two nodes joined: something of theirs wired to something of ours.
  integration: duotone(
    `<path d="M7.6 10h4.8" ${STROKE}/><circle cx="6.5" cy="10" r="2" fill="${ICON_FORE}"/><circle cx="13.5" cy="10" r="2" fill="${ICON_FORE}"/>`
  ),
  // Angle brackets: code we write for them specifically.
  custom_code: duotone(`<path d="M8.1 7.4 5.7 10l2.4 2.6M11.9 7.4 14.3 10l-2.4 2.6" ${STROKE}/>`),
  // A loop that closes: it runs again tomorrow without anyone asking.
  automation: duotone(
    `<path d="M14 8.6a4.4 4.4 0 1 0 .1 3.1" ${STROKE}/><path d="M14.4 5.6v3.2h-3.2" ${STROKE}/>`
  ),
  // A nib: the voice work.
  prompt: duotone(
    `<path d="M6.4 13.6 7.3 11l4.4-4.4a1.3 1.3 0 0 1 1.8 1.8L9.1 12.8z" ${STROKE}/><path d="M6.4 13.6 9.1 12.8" ${STROKE}/>`
  ),
  // A beaker: we try it before they do.
  testing: duotone(
    `<path d="M8.5 5.2v3.3l-2.4 4.6a1 1 0 0 0 .9 1.5h6a1 1 0 0 0 .9-1.5l-2.4-4.6V5.2" ${STROKE}/><path d="M7.7 5.2h4.6" ${STROKE}/>`
  ),
  // An arrow leaving: go-live.
  launch: duotone(`<path d="M10 14.2V6.4M6.9 9.5 10 6.3l3.1 3.2" ${STROKE}/>`),
};

// Falls back to a plain disc rather than a bullet character, so an unknown kind
// degrades to something that still belongs in the row rhythm.
const KIND_ICON_FALLBACK = duotone(`<circle cx="10" cy="10" r="3" fill="${ICON_FORE}"/>`);

Handlebars.registerHelper("kindIcon", (kind: unknown) =>
  typeof kind === "string" ? KIND_ICONS[kind] ?? KIND_ICON_FALLBACK : KIND_ICON_FALLBACK
);

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
