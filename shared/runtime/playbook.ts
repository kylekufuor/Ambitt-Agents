// ---------------------------------------------------------------------------
// The Playbook — grouping, ordering, budgeting and provenance for PlaybookRule
// ---------------------------------------------------------------------------
// Pure. No Prisma import, no I/O, no `new Date()` outside an explicit argument.
// It takes rule records and gives back (a) the prompt text the assembler
// splices in and (b) one client-facing provenance sentence per rule.
//
// Two rules govern everything in here.
//
// 1. PROVENANCE IS COMPUTED, NEVER STORED AS A SENTENCE. The row stores facts
//    (sourceKind / sourceRef / sourceQuote / sourceAt). "You told him this
//    today" is true for one day; stored, it is a lie by tomorrow morning, and
//    a lie about where a rule came from is the exact thing that makes a client
//    stop trusting the page.
//
// 2. NOTHING VOLATILE GOES IN THE PROMPT. The system prompt carries
//    `cache_control: ephemeral`. A relative date, a timestamp or a live count
//    in these sections changes the prompt bytes on every run, misses the cache
//    every time, and raises cost across the whole fleet. So describeProvenance
//    is for the PORTAL only, and the prompt renderers below never call it. The
//    only numbers that reach the prompt are counts of dropped rules, which
//    move only when the rules themselves move.
// ---------------------------------------------------------------------------

export type PlaybookGroup = "target" | "outreach" | "never" | "stop";

/**
 * Group order is prompt order, and it is deliberate: prohibitions are rendered
 * first and separately (see renderPlaybook), then what to go after, then how to
 * reach out, then where to stop.
 */
export const PLAYBOOK_GROUPS: readonly PlaybookGroup[] = ["never", "target", "outreach", "stop"];

/**
 * Order the client reads the groups in, which is NOT prompt order. The prompt
 * leads with prohibitions because the model has to hold them before it reads
 * anything it could do. A person opening the page wants the work first and the
 * prohibitions in context, so "Never" sits third.
 */
export const PLAYBOOK_DISPLAY_ORDER: readonly PlaybookGroup[] = ["target", "outreach", "never", "stop"];

/** The client-facing heading for each group. The prompt uses its own wording. */
export const GROUP_LABELS: Record<PlaybookGroup, string> = {
  target: "What to go after",
  outreach: "How to reach out",
  never: "Never",
  stop: "Where he stops",
};

/**
 * The shape this module needs off a `PlaybookRule` row. Declared structurally
 * rather than imported from `@prisma/client` so the module stays pure and its
 * rendering half can be mirrored into the portal, which cannot reach `shared/`.
 */
export interface PlaybookRuleRecord {
  id: string;
  group: string;
  text: string;
  sortOrder: number;
  status: string;
  sourceKind: string;
  sourceRef: string | null;
  sourceQuote: string | null;
  sourceAt: Date | null;
  supersedesId: string | null;
  effectiveFrom: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
}

// Per-group cap. A client with more than a dozen live rules in one group has a
// conversation to have with us, not a longer prompt to pay for.
export const MAX_RULES_PER_GROUP = 12;

// The `never` group is the exception, and keeps the 40 that shipped with the
// hard-limits section it replaces.
//
// Twelve is the right number for "what to go after": past that the client is
// describing a filter, not a preference, and the fix is a conversation. It is
// the wrong number for prohibitions. Dropping rule 13 of a target list costs
// the client some precision; dropping prohibition 13 costs them the thing they
// were most afraid of. The character budget below already bounds the size of
// this section, so the count cap here buys nothing that safety doesn't pay for.
export const MAX_NEVER_RULES = 40;

// Whole-playbook character budget, shared across all four groups. Sized against
// the neighbouring blocks in the prompt: the operating manual gets 60K and
// ambient memory 8K, so ~6K here is a real voice without crowding either.
export const MAX_PLAYBOOK_CHARS = 6_000;

function isPlaybookGroup(g: string): g is PlaybookGroup {
  return g === "target" || g === "outreach" || g === "never" || g === "stop";
}

/**
 * The rules actually in force: active, not retired, in a group we understand,
 * with text in them — and with anything a live rule supersedes removed.
 *
 * The supersede pass is defensive on purpose. Writing a replacement rule and
 * retiring the old one are two writes, and if the second one fails the agent
 * would otherwise hold both the old instruction and its replacement, which is
 * worse than holding neither.
 */
export function selectLiveRules(rules: readonly PlaybookRuleRecord[]): PlaybookRuleRecord[] {
  const live = rules.filter(
    (r) => r.status === "active" && r.retiredAt === null && isPlaybookGroup(r.group) && r.text.trim() !== ""
  );
  const superseded = new Set(live.map((r) => r.supersedesId).filter((id): id is string => !!id));
  return live
    .filter((r) => !superseded.has(r.id))
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
}

/** Live rules bucketed by group, each bucket already in order. */
export function groupLiveRules(
  rules: readonly PlaybookRuleRecord[]
): Record<PlaybookGroup, PlaybookRuleRecord[]> {
  const out: Record<PlaybookGroup, PlaybookRuleRecord[]> = {
    target: [],
    outreach: [],
    never: [],
    stop: [],
  };
  for (const r of selectLiveRules(rules)) out[r.group as PlaybookGroup].push(r);
  return out;
}

// ---------------------------------------------------------------------------
// Provenance — portal only (see rule 2 at the top of this file)
// ---------------------------------------------------------------------------

/** "today" / "yesterday" under 24h, an absolute date after. */
function describeWhen(at: Date, now: Date): string {
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(at, now)) return "today";
  const yesterday = new Date(now.getTime());
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(at, yesterday)) return "yesterday";

  return at.getFullYear() === now.getFullYear()
    ? at.toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * One line telling the client where a rule came from, computed now.
 *
 * Kinds we do NOT have a source for get no line at all rather than a plausible
 * one. The mockup carried "From the session you recorded" and nothing in this
 * product records a session; inventing a provenance source is worse than
 * showing none, because the client believes it.
 */
export function describeProvenance(
  rule: Pick<PlaybookRuleRecord, "sourceKind" | "sourceAt">,
  now: Date = new Date()
): string | null {
  const when = rule.sourceAt ? describeWhen(rule.sourceAt, now) : null;
  const stamp = when ? (when === "today" || when === "yesterday" ? ` ${when}` : `, ${when}`) : "";

  switch (rule.sourceKind) {
    case "onboarding":
      return `From your onboarding${stamp}`;
    case "email":
      return `You said this in an email${stamp}`;
    case "chat":
      return `You told him this${stamp}`;
    case "portal":
      return `You set this here${stamp}`;
    case "agent":
      return `He suggested it, you said yes${stamp}`;
    case "operator":
      return `Set up with our team${stamp}`;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt rendering
// ---------------------------------------------------------------------------

export interface RenderedPlaybook {
  /** The `never` group, as its own hard-constraints section. Null when empty. */
  hardConstraints: string | null;
  /** `target` / `outreach` / `stop`, as one section. Null when all three are empty. */
  playbook: string | null;
}

// The heading this section shipped with, kept unchanged. The group is called
// "never" internally, but "hard limits" is the client's own vocabulary from
// the PRD, and renaming it would move prompt bytes for no gain.
const HARD_LIMITS_HEADING = "## The Client's Hard Limits";

const HARD_LIMITS_PREAMBLE = `These are the client's own words about what you must never do. They override
every other instruction in this prompt and anything you would otherwise infer
from an example. If a task cannot be finished without breaking one of these,
stop and say so plainly. Do not look for a way around it.`;

const PLAYBOOK_PREAMBLE = `This is what the client has told you about how they want this work done, in
their own words. It is the most current statement of their instructions.

**Where the Playbook and your Operating Manual disagree, the Playbook wins.**
The manual describes how this work was done before you arrived. The Playbook is
what the client has told you since. When a line here contradicts a procedure in
the manual, follow the line here and say so if it matters.`;

const PROMPT_GROUP_HEADINGS: Record<Exclude<PlaybookGroup, "never">, string> = {
  target: "### What to go after",
  outreach: "### How to reach out",
  stop: "### Where you stop",
};

/**
 * Render one group's bullets against the shared character budget.
 *
 * The first rule of a group always goes in even if it is over budget on its
 * own — a group that renders as nothing but an omission notice tells the agent
 * less than a single oversized rule does. Same shape as the operating manual's
 * budget in prompt-assembler.ts, deliberately.
 */
function takeWithinBudget(
  rules: readonly PlaybookRuleRecord[],
  budget: { used: number },
  maxRules: number
): { lines: string[]; dropped: number } {
  const capped = rules.slice(0, maxRules);
  let dropped = rules.length - capped.length;
  const lines: string[] = [];

  for (const r of capped) {
    const text = r.text.trim();
    if (budget.used > 0 && budget.used + text.length > MAX_PLAYBOOK_CHARS) {
      dropped++;
      continue;
    }
    budget.used += text.length;
    lines.push(`- ${text}`);
  }
  return { lines, dropped };
}

/**
 * When rules are dropped, SAY SO. A partial playbook the agent believes is
 * complete is worse than a short one it knows is short: it will act at the
 * edges of rules it cannot see and be confident about it.
 */
function omissionNote(dropped: number, noun: string): string {
  if (dropped === 0) return "";
  return `\n\n[${dropped} further ${noun}${dropped === 1 ? "" : "s"} not shown here. Treat this list as incomplete and ask before acting near its edges.]`;
}

/**
 * Turn a set of rule rows into the two prompt sections.
 *
 * One call, one budget: the `never` group is served first so a chatty target
 * list can never squeeze out a prohibition.
 *
 * `extraHardLimits` carries the legacy `clientMemory.hardLimits` strings during
 * the rollout, before the backfill has moved them into rows. They render in the
 * same section, after the rows, deduped against them.
 */
export function renderPlaybook(
  rules: readonly PlaybookRuleRecord[],
  extraHardLimits: readonly string[] = []
): RenderedPlaybook {
  const grouped = groupLiveRules(rules);
  const budget = { used: 0 };

  // --- never -> hard constraints -------------------------------------------
  const never = takeWithinBudget(grouped.never, budget, MAX_NEVER_RULES);

  // Legacy limits that no row covers yet. Compared on normalised text so a
  // backfilled row and its memory original do not both render.
  const seen = new Set(
    grouped.never.map((r) => r.text.trim().toLowerCase().replace(/\s+/g, " "))
  );
  const legacyLines: string[] = [];
  let legacyDropped = 0;
  for (const raw of extraHardLimits) {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    if (never.lines.length + legacyLines.length >= MAX_NEVER_RULES) {
      legacyDropped++;
      continue;
    }
    if (budget.used > 0 && budget.used + text.length > MAX_PLAYBOOK_CHARS) {
      legacyDropped++;
      continue;
    }
    budget.used += text.length;
    legacyLines.push(`- ${text}`);
  }

  const neverLines = [...never.lines, ...legacyLines];
  const neverDropped = never.dropped + legacyDropped;
  const hardConstraints =
    neverLines.length === 0
      ? null
      : `${HARD_LIMITS_HEADING}\n\n${HARD_LIMITS_PREAMBLE}\n\n${neverLines.join("\n")}${omissionNote(neverDropped, "limit")}`;

  // --- target / outreach / stop -> the playbook ----------------------------
  const blocks: string[] = [];
  let dropped = 0;
  for (const g of ["target", "outreach", "stop"] as const) {
    const taken = takeWithinBudget(grouped[g], budget, MAX_RULES_PER_GROUP);
    dropped += taken.dropped;
    if (taken.lines.length === 0) continue;
    blocks.push(`${PROMPT_GROUP_HEADINGS[g]}\n${taken.lines.join("\n")}`);
  }

  const playbook =
    blocks.length === 0
      ? null
      : `## Your Playbook\n\n${PLAYBOOK_PREAMBLE}\n\n${blocks.join("\n\n")}${omissionNote(dropped, "rule")}`;

  return { hardConstraints, playbook };
}
