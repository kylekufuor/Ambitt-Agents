// oracle/templates/prd/render.ts
//
// Validates + renders Atlas's PRD JSON into a dashboard-themed HTML page Kyle
// reviews. Same pattern as oracle/templates/proposal-email/render.ts: Zod for
// validation, Handlebars for rendering, one entry point that does both.
//
// IMPORTANT: this is INTERNAL — no client ever sees the PRD. Visual treatment
// is dashboard-style (dark theme, dense), not the prospect-facing brand.

import Handlebars from "handlebars";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Zod schema — runtime validator. Mirrors ./types.ts exactly.
// ---------------------------------------------------------------------------

const toolEntry = z.object({
  name: z.string().min(1),
  source: z.enum(["composio", "custom_browse", "custom_platform_tool"]),
  slug: z.string().optional(),
  siteUrl: z.string().optional(),
  functionName: z.string().optional(),
  rationale: z.string().min(1),
  buildDays: z.number().nonnegative().optional(),
});

const buildStep = z.object({
  number: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  owner: z.enum(["ambitt", "client"]),
  estimatedDays: z.number().nonnegative(),
});

export const prdSchema = z.object({
  summary: z.string().min(1),
  identity: z.object({
    agentName: z.string().min(1),
    agentEmailSlug: z.string().min(1).regex(/^[a-z0-9-]+$/, "agentEmailSlug must be lowercase alphanumeric + hyphens"),
    agentRole: z.string().min(1),
    ownerBusinessName: z.string().min(1),
    ownerContactName: z.string().min(1),
    ownerEmail: z.string().email(),
    ownerIndustry: z.string().min(1),
  }),
  systemPrompt: z.string().min(50),
  tools: z.array(toolEntry).min(1),
  schedule: z.object({
    mode: z.enum(["scheduled", "triggered"]),
    cron: z.string().optional(),
    timezone: z.string().min(1),
    triggerSpec: z.string().optional(),
  }),
  channel: z.enum(["email", "slack", "whatsapp"]),
  autonomy: z.enum(["supervised", "semi", "autonomous"]),
  successMetrics: z.array(z.string().min(1)).min(1).max(5),
  hardLimits: z.array(z.string().min(1)),
  memoryNotes: z.string().min(20),
  pricing: z.object({
    suggestedTier: z.enum(["starter", "growth", "scale", "enterprise"]),
    suggestedMonthlyCents: z.number().int().nonnegative(),
    suggestedSetupCents: z.number().int().nonnegative(),
    reasoning: z.string().min(1),
  }),
  risks: z.array(z.string().min(1)),
  buildPlan: z.array(buildStep).min(1),
});

export type AgentPRDData = z.infer<typeof prdSchema>;

// ---------------------------------------------------------------------------
// Handlebars helpers — currency + uppercase + sums
// ---------------------------------------------------------------------------

Handlebars.registerHelper("cents", (cents: unknown) => {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toLocaleString()}`;
});

Handlebars.registerHelper("upper", (s: unknown) => (typeof s === "string" ? s.toUpperCase() : ""));

Handlebars.registerHelper("toolSourceLabel", (source: unknown) => {
  if (source === "composio") return "Composio · OAuth";
  if (source === "custom_browse") return "Custom · browse";
  if (source === "custom_platform_tool") return "Custom · platform tool";
  return String(source);
});

Handlebars.registerHelper("sumBuildDays", function (steps: unknown) {
  if (!Array.isArray(steps)) return 0;
  return steps.reduce((acc: number, s: { estimatedDays?: number }) => acc + (s.estimatedDays ?? 0), 0);
});

// ---------------------------------------------------------------------------
// Template compile
// ---------------------------------------------------------------------------

const TEMPLATE_PATH = join(__dirname, "template.html");
const compiled = Handlebars.compile(readFileSync(TEMPLATE_PATH, "utf-8"));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class PRDValidationError extends Error {
  readonly issues: z.ZodIssue[];
  constructor(issues: z.ZodIssue[]) {
    super(`AgentPRDData failed validation: ${issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    this.issues = issues;
    this.name = "PRDValidationError";
  }
}

export function renderPRD(data: unknown): string {
  const result = prdSchema.safeParse(data);
  if (!result.success) {
    throw new PRDValidationError(result.error.issues);
  }
  return compiled(result.data);
}

/** Same tolerant parser as proposal-email/render.ts. Atlas occasionally wraps in code fences. */
export function parseAtlasPRDOutput(raw: string): unknown {
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
