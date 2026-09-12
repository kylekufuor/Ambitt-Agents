// Run: node_modules/.bin/tsx shared/runtime/playbook.test.ts
// Pure unit test for shared/runtime/playbook.ts. No DB, no Anthropic client.
//
// Three things are worth a test here and the rest is plumbing:
//
//   1. Rules reach the agent, in the right section, in the right order. The
//      whole phase is worthless if they do not, and "the row exists" is not
//      evidence that it does — a rule the client can see in the portal and the
//      agent has never read is worse than no feature, because they now trust it.
//   2. Nothing is dropped silently. A partial playbook the agent believes is
//      complete makes it confident at exactly the edges it cannot see.
//   3. Nothing volatile reaches the prompt. The system prompt carries
//      `cache_control: ephemeral`; a date or a relative phrase in these
//      sections changes the bytes on a run where nothing changed, misses the
//      cache, and costs money across the whole fleet.
import {
  GROUP_LABELS,
  MAX_NEVER_RULES,
  MAX_PLAYBOOK_CHARS,
  MAX_RULES_PER_GROUP,
  PLAYBOOK_GROUPS,
  describeProvenance,
  groupLiveRules,
  renderPlaybook,
  selectLiveRules,
  type PlaybookRuleRecord,
} from "./playbook.js";

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

// LOCAL-time constructors throughout. describeProvenance answers a calendar
// question ("is this the same day as now?") in the reader's own timezone, so a
// UTC literal here would pass in Chicago and fail on a UTC box, or the reverse.
const T0 = new Date(2026, 2, 14, 10, 0, 0); // 14 March 2026, local

let seq = 0;
function rule(over: Partial<PlaybookRuleRecord> = {}): PlaybookRuleRecord {
  seq++;
  return {
    id: `r${seq}`,
    group: "target",
    text: `rule ${seq}`,
    sortOrder: seq,
    status: "active",
    sourceKind: "onboarding",
    sourceRef: null,
    sourceQuote: null,
    sourceAt: T0,
    supersedesId: null,
    effectiveFrom: null,
    retiredAt: null,
    createdAt: T0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Selection — what counts as in force
// ---------------------------------------------------------------------------
check("an active rule is live", selectLiveRules([rule()]).length === 1);
check("a proposed rule is NOT live", selectLiveRules([rule({ status: "proposed" })]).length === 0);
check("a declined rule is NOT live", selectLiveRules([rule({ status: "declined" })]).length === 0);
check("a retired rule is NOT live", selectLiveRules([rule({ status: "retired" })]).length === 0);
check(
  "a rule with retiredAt set is NOT live even if status says active",
  selectLiveRules([rule({ status: "active", retiredAt: T0 })]).length === 0,
);
check("a blank rule is NOT live", selectLiveRules([rule({ text: "   " })]).length === 0);
check(
  "a rule in an unknown group is NOT live",
  selectLiveRules([rule({ group: "vibes" })]).length === 0,
);

// Supersede: the replacement wins and the original goes, even if nobody
// remembered to retire it.
const original = rule({ id: "old", text: "Five to fifty units." });
const replacement = rule({ id: "new", text: "Ten to sixty units.", supersedesId: "old" });
const afterSupersede = selectLiveRules([original, replacement]);
check("a superseded rule is dropped", afterSupersede.length === 1);
check("the replacement survives", afterSupersede[0]?.id === "new");
check(
  "an unretired original and its replacement never both render",
  !renderPlaybook([original, replacement]).playbook?.includes("Five to fifty"),
);

// ---------------------------------------------------------------------------
// Ordering — sortOrder, then createdAt, then id. Stable and total.
// ---------------------------------------------------------------------------
const later = new Date(2026, 5, 1, 0, 0, 0);
const ordered = selectLiveRules([
  rule({ id: "c", text: "third", sortOrder: 2 }),
  rule({ id: "a", text: "first", sortOrder: 0 }),
  rule({ id: "b", text: "second", sortOrder: 1 }),
]);
check("rules come back in sortOrder", ordered.map((r) => r.text).join(",") === "first,second,third");

const tied = selectLiveRules([
  rule({ id: "z", text: "newer", sortOrder: 0, createdAt: later }),
  rule({ id: "y", text: "older", sortOrder: 0, createdAt: T0 }),
]);
check("a sortOrder tie breaks on createdAt", tied.map((r) => r.text).join(",") === "older,newer");

const fullTie = selectLiveRules([
  rule({ id: "b2", text: "bee", sortOrder: 0, createdAt: T0 }),
  rule({ id: "a2", text: "ay", sortOrder: 0, createdAt: T0 }),
]);
check("a full tie breaks on id, so the order is stable run to run", fullTie[0]?.id === "a2");

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------
const grouped = groupLiveRules([
  rule({ group: "never", text: "n" }),
  rule({ group: "target", text: "t" }),
  rule({ group: "outreach", text: "o" }),
  rule({ group: "stop", text: "s" }),
]);
check("every group is populated", PLAYBOOK_GROUPS.every((g) => grouped[g].length === 1));
check("every group has a client-facing label", PLAYBOOK_GROUPS.every((g) => !!GROUP_LABELS[g]));
check("prohibitions are the first group in prompt order", PLAYBOOK_GROUPS[0] === "never");

// ---------------------------------------------------------------------------
// THE POINT OF THE PHASE: rules reach the prompt, in the right section
// ---------------------------------------------------------------------------
const real = [
  rule({ group: "target", text: "Multifamily in the Greenville MSA, five to fifty units.", sortOrder: 0 }),
  rule({ group: "target", text: "Owned five years or longer.", sortOrder: 1 }),
  rule({ group: "outreach", text: "Short and plain. Two paragraphs, no pitch, sign it as me.", sortOrder: 0 }),
  rule({ group: "never", text: "Never name a price or make an offer.", sortOrder: 0 }),
  rule({ group: "stop", text: "When an owner replies, hand the conversation to me and stop.", sortOrder: 0 }),
];
const out = renderPlaybook(real);

check("the never group renders as hard constraints", !!out.hardConstraints);
check("the other three render as the playbook", !!out.playbook);
check(
  "a prohibition is in the hard-constraints section, not the playbook",
  out.hardConstraints!.includes("Never name a price") && !out.playbook!.includes("Never name a price"),
);
for (const r of real.filter((x) => x.group !== "never")) {
  check(`playbook carries: ${r.text.slice(0, 32)}…`, out.playbook!.includes(r.text));
}
check(
  "target comes before outreach comes before stop",
  out.playbook!.indexOf("What to go after") < out.playbook!.indexOf("How to reach out") &&
    out.playbook!.indexOf("How to reach out") < out.playbook!.indexOf("Where you stop"),
);
check(
  "within a group, sortOrder holds",
  out.playbook!.indexOf("Greenville") < out.playbook!.indexOf("Owned five years"),
);
check(
  "the playbook states it beats the Operating Manual",
  /Playbook and your Operating Manual disagree[\s\S]{0,40}Playbook wins/i.test(out.playbook!),
);
check(
  "the hard constraints state they beat everything",
  /override[\s\S]{0,80}every other instruction/i.test(out.hardConstraints!),
);

// An empty group does not leave an empty heading behind.
const onlyTarget = renderPlaybook([rule({ group: "target", text: "Only this." })]);
check("no hard-constraints section when nothing is prohibited", onlyTarget.hardConstraints === null);
check("an empty group renders no heading", !onlyTarget.playbook!.includes("Where you stop"));
check("an empty playbook renders nothing at all", renderPlaybook([]).playbook === null);

// ---------------------------------------------------------------------------
// Budget — capped, and the cap is SAID OUT LOUD
// ---------------------------------------------------------------------------
const manyTargets = Array.from({ length: MAX_RULES_PER_GROUP + 5 }, (_, i) =>
  rule({ group: "target", text: `Target rule ${i + 1}.`, sortOrder: i }),
);
const cappedTargets = renderPlaybook(manyTargets);
check(
  "a group is capped",
  (cappedTargets.playbook!.match(/^- Target rule/gm) ?? []).length === MAX_RULES_PER_GROUP,
);
check("the cap is stated, not silent", /5 further rules not shown/.test(cappedTargets.playbook!));
check("the agent is told the list is incomplete", /incomplete/i.test(cappedTargets.playbook!));

// Prohibitions keep the higher cap the hard-limits section shipped with.
const manyNevers = Array.from({ length: MAX_NEVER_RULES + 3 }, (_, i) =>
  rule({ group: "never", text: `Never do thing ${i + 1}.`, sortOrder: i }),
);
const cappedNevers = renderPlaybook(manyNevers);
check(
  "prohibitions get the larger cap",
  (cappedNevers.hardConstraints!.match(/^- Never do thing/gm) ?? []).length === MAX_NEVER_RULES,
);
check("the prohibition cap is stated too", /3 further limits not shown/.test(cappedNevers.hardConstraints!));
check("MAX_NEVER_RULES is above the per-group cap", MAX_NEVER_RULES > MAX_RULES_PER_GROUP);

// The character budget is shared, and prohibitions are served first out of it.
const fat = "x".repeat(MAX_PLAYBOOK_CHARS - 40);
const squeezed = renderPlaybook([
  rule({ group: "never", text: "Never contact a past client.", sortOrder: 0 }),
  rule({ group: "target", text: fat, sortOrder: 0 }),
  rule({ group: "target", text: "This one does not fit.", sortOrder: 1 }),
]);
check("the prohibition survives a fat target list", squeezed.hardConstraints!.includes("past client"));
check("the over-budget rule is dropped", !squeezed.playbook!.includes("This one does not fit"));
check("and the drop is stated", /1 further rule not shown/.test(squeezed.playbook!));

// One oversized rule alone still renders — a group that is nothing but an
// omission notice tells the agent less than one long rule does.
const lone = renderPlaybook([rule({ group: "target", text: "y".repeat(MAX_PLAYBOOK_CHARS * 2) })]);
check("a single over-budget rule still renders", lone.playbook!.includes("yyyy"));

// ---------------------------------------------------------------------------
// Legacy hard limits, carried alongside the rows through the rollout
// ---------------------------------------------------------------------------
const withLegacy = renderPlaybook(
  [rule({ group: "never", text: "Never name a price." })],
  ["Never email out-of-state owners.", "  NEVER   NAME a price.  "],
);
check("a legacy-only limit reaches the agent", withLegacy.hardConstraints!.includes("out-of-state"));
check(
  "a limit that has been backfilled renders once",
  (withLegacy.hardConstraints!.match(/name a price/gi) ?? []).length === 1,
);
check(
  "legacy limits alone still produce a section",
  renderPlaybook([], ["Never call after 6pm."]).hardConstraints!.includes("Never call after 6pm."),
);
check("blank legacy limits are ignored", renderPlaybook([], ["", "   "]).hardConstraints === null);

// ---------------------------------------------------------------------------
// Cache safety — nothing volatile in either section
// ---------------------------------------------------------------------------
const both = [out.hardConstraints!, out.playbook!].join("\n");
check("no ISO timestamp in the prompt sections", !/\d{4}-\d{2}-\d{2}T/.test(both));
check("no relative date in the prompt sections", !/\b(today|yesterday|ago)\b/i.test(both));
check("no month name in the prompt sections", !/\b(January|March|August|December)\b/.test(both));
check(
  "the same rules render byte-identically twice",
  JSON.stringify(renderPlaybook(real)) === JSON.stringify(renderPlaybook(real)),
);

// ---------------------------------------------------------------------------
// describeProvenance — computed, never stored
// ---------------------------------------------------------------------------
const NOW = new Date(2026, 7, 2, 9, 0, 0); // 2 August 2026, 9am local
const said = (kind: string, at: Date | null) => describeProvenance({ sourceKind: kind, sourceAt: at }, NOW);

check("same day reads as today", said("chat", new Date(2026, 7, 2, 7, 0, 0)) === "You told him this today");
check(
  "the day before reads as yesterday",
  said("chat", new Date(2026, 7, 1, 22, 0, 0)) === "You told him this yesterday",
);
check("older reads as an absolute date", said("chat", new Date(2026, 2, 14, 10, 0, 0)) === "You told him this, 14 March");
check(
  "a different year carries the year",
  said("chat", new Date(2025, 2, 14, 10, 0, 0)) === "You told him this, 14 March 2025",
);
check("onboarding has its own phrasing", said("onboarding", T0) === "From your onboarding, 14 March");
check("email has its own phrasing", said("email", T0) === "You said this in an email, 14 March");
check("portal has its own phrasing", said("portal", T0) === "You set this here, 14 March");
check("an agent proposal the client accepted says so", said("agent", T0) === "He suggested it, you said yes, 14 March");
check("no date still gives a source", said("onboarding", null) === "From your onboarding");

// The same line must change as the calendar moves. That is the whole reason it
// is not stored: a stored "today" is a lie by tomorrow morning.
const spokenToday = new Date(2026, 7, 2, 7, 0, 0);
check(
  "the same fact reads differently on a later day",
  said("chat", spokenToday) !==
    describeProvenance({ sourceKind: "chat", sourceAt: spokenToday }, new Date(2026, 7, 20, 9, 0, 0)),
);

// An unknown source gets NO line. The mockup carried "From the session you
// recorded" and nothing in this product records a session; inventing a source
// is worse than showing none, because the client believes it.
check("an unknown source kind gets no line", said("session_recording", T0) === null);

console.log(`${pass}/${pass + fail} passed`);
process.exitCode = fail > 0 ? 1 : 0;
