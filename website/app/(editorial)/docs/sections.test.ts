// Run: node_modules/.bin/tsx app/docs/sections.test.ts
// Pure unit test for the docs table of contents and its scroll-spy rule.
//
// The observer wiring is standard and visible on the page; the decision it
// delegates is not. Several sections are on screen at once whenever one is
// short or the reader scrolls quickly, and picking the wrong one makes the
// highlight jitter between neighbours instead of tracking the reader.
import { DOC_GROUPS, DOC_SECTIONS, pickActiveSection } from "./sections.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

// --- The list itself --------------------------------------------------------
check("every group has sections", DOC_GROUPS.every((g) => g.sections.length > 0), true);
check("flat list matches the groups", DOC_SECTIONS.length, DOC_GROUPS.reduce((n, g) => n + g.sections.length, 0));

const ids = DOC_SECTIONS.map((s) => s.id);
check("ids are unique", new Set(ids).size, ids.length);
check("ids are anchor-safe", ids.every((i) => /^[a-z][a-z0-9-]*$/.test(i)), true);
check("every section has a blurb", DOC_SECTIONS.every((s) => s.blurb.trim().length > 10), true);

// The portal deep-links into these four. Renaming one silently breaks a link a
// client is following, so they are pinned here rather than left to vigilance.
for (const linked of ["asking", "leads", "control", "billing"]) {
  check(`portal deep-link #${linked} still exists`, ids.includes(linked), true);
}

// --- The scroll-spy rule ----------------------------------------------------
check("single visible section wins", pickActiveSection(["leads"]), "leads");

check(
  "topmost wins when several are on screen",
  pickActiveSection(["codes", "control", "leads"]),
  "leads"
);

check(
  "topmost is document order, not argument order",
  pickActiveSection(["help", "signing-in"]),
  "signing-in"
);

check("accepts a Set as well as an array", pickActiveSection(new Set(["tools", "billing"])), "tools");

// Nothing on screen is normal mid-scroll between two sections. Holding the
// previous value is what stops the nav blanking out as you read.
check("empty keeps the previous section", pickActiveSection([], "codes"), "codes");
check("empty with no previous falls back to the first", pickActiveSection([]), DOC_SECTIONS[0].id);
check("unknown ids are ignored", pickActiveSection(["not-a-section"], "leads"), "leads");

console.log(`\ndocs sections: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
