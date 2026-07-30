// Run: node_modules/.bin/tsx client-portal/src/lib/lead-presentation.test.ts
//
// Pins the presentation of agent-authored lead data. No DB, no network.
//
// Every fixture below is a VERBATIM copy of a live row from Casey Litsey's
// book, read on 2026-07-30. That matters: the previous design was validated
// against fifteen invented rows that were tidy in exactly the dimensions the
// real ones are not (short scalar values, no em dashes, uniform keys), and it
// shipped three defects a client could see on day one.
import {
  presentLastSpoke,
  presentTemperature,
  presentLeadName,
  presentText,
  humanizeKey,
  presentDetails,
  presentScenario,
  presentContact,
} from "./lead-presentation";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.error(`FAIL  ${name}\n  got:  ${g}\n  want: ${w}`);
  }
}
function checkTrue(name: string, cond: boolean, ctx?: unknown) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL  ${name}${ctx === undefined ? "" : `\n  ctx: ${JSON.stringify(ctx)}`}`);
  }
}

// --- live fixtures ---------------------------------------------------------
const MAPLE = {
  name: "Maple Holdings LLC — Maple Industrial Park",
  status: "contacted",
  lastContactedAt: null,
  notes:
    "Off-market industrial, 1987 vintage. First outreach approved by Casey. No reply logged yet — Day 3 follow-up due. Crexi cross-check clean.",
  details: {
    status: "Off-Market",
    address: "1200 Maple Ave, Tulsa OK",
    property: "Maple Industrial Park",
    scenario: "OFF-MARKET",
    year_built: "1987",
    crexi_check: "No matching listing found on Crexi — confirmed off-market",
    follow_up_due: "Day 3 follow-up pending Casey approval",
  },
};

const OAK_MARKET_NOTE =
  "Medical office cap rates in Tulsa running 6.0–7.8% in 2025 per CBRE/CREG — strong investor demand for this asset class";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Em dashes. The whole reason the portal needed the scrub at all.
// ═══════════════════════════════════════════════════════════════════════════
// A name is not a sentence. Scrubbing it as prose gave
// "Maple Holdings LLC. Maple Industrial Park", two sentences where there was
// one label, so names split into the two fields the dash was separating.
check("REGRESSION: entity and property split rather than becoming two sentences",
  presentLeadName(MAPLE.name),
  { title: "Maple Holdings LLC", subtitle: "Maple Industrial Park" });
checkTrue("no em dash survives in either part",
  !JSON.stringify(presentLeadName(MAPLE.name)).includes("—"));
check("all three live names split cleanly",
  ["Maple Holdings LLC — Maple Industrial Park",
   "Oak Partners LP — Oak Street Medical Plaza",
   "Big Jim Realty — Riverside Flex Center"].map((n) => presentLeadName(n).title),
  ["Maple Holdings LLC", "Oak Partners LP", "Big Jim Realty"]);
check("a name with no separator keeps its whole self",
  presentLeadName("Pfannenstiel Holdings"),
  { title: "Pfannenstiel Holdings", subtitle: null });
// An unspaced dash is inside a word, not between fields.
check("hyphenated name is not split",
  presentLeadName("Smith-Barrow Trust"),
  { title: "Smith-Barrow Trust", subtitle: null });
check("empty name", presentLeadName(null), { title: "", subtitle: null });
check("more than one separator keeps the tail",
  presentLeadName("A LLC — Site One — Phase 2").subtitle, "Site One, Phase 2");

checkTrue("agent notes are scrubbed too", !presentText(MAPLE.notes).includes("—"));

for (const [label, raw] of Object.entries({
  crexi: MAPLE.details.crexi_check,
  market: OAK_MARKET_NOTE,
})) {
  checkTrue(`detail value scrubbed: ${label}`, !presentText(raw).includes("—"), {
    after: presentText(raw),
  });
}

// An EN dash inside a numeric range is correct typography and is NOT the
// banned character. Scrubbing it would be a different bug.
checkTrue("en dash in '6.0–7.8%' survives", presentText(OAK_MARKET_NOTE).includes("6.0–7.8%"));

// Nothing is lost to the scrub: it rewrites the dash, it does not truncate.
checkTrue("scrub does not drop the sentence",
  presentText(OAK_MARKET_NOTE).includes("strong investor demand"));

// ═══════════════════════════════════════════════════════════════════════════
// 2. Machine keys
// ═══════════════════════════════════════════════════════════════════════════
check("crexi_check", humanizeKey("crexi_check"), "Crexi check");
check("year_built", humanizeKey("year_built"), "Year built");
check("follow_up_due", humanizeKey("follow_up_due"), "Follow up");
check("unknown snake key", humanizeKey("roof_replaced_year"), "Roof replaced year");
check("camelCase key", humanizeKey("loanMatures"), "Loan matures");
check("already human", humanizeKey("Units"), "Units");

// ═══════════════════════════════════════════════════════════════════════════
// 3. Two layouts, because there are two kinds of value
// ═══════════════════════════════════════════════════════════════════════════
const d = presentDetails(MAPLE.details);
const byKey = Object.fromEntries(d.map((x) => [x.key, x]));

check("year_built is a scalar", byKey.year_built?.kind, "scalar");
check("crexi_check is prose", byKey.crexi_check?.kind, "prose");
check("follow_up_due is prose (6 words)", byKey.follow_up_due?.kind, "prose");
// The regression: a 57-char sentence rendered in the scalar layout is what
// produced right-aligned ragged mono in a 300px rail.
checkTrue("REGRESSION: no long value is classified scalar",
  d.every((x) => !(x.kind === "scalar" && x.value.length > 32)),
  d.map((x) => ({ k: x.key, kind: x.kind, len: x.value.length })));

// Scalars sort before prose so the skimmable facts are not interleaved.
const kinds = d.map((x) => x.kind);
check("scalars come first", kinds, [...kinds].sort((a, b) => (a === b ? 0 : a === "scalar" ? -1 : 1)));

// ═══════════════════════════════════════════════════════════════════════════
// 4. The two-fields-called-status collision
// ═══════════════════════════════════════════════════════════════════════════
checkTrue("REGRESSION: details.status is not rendered next to the lifecycle pill",
  !d.some((x) => x.key.toLowerCase() === "status"), d.map((x) => x.key));
checkTrue("scenario is not repeated in the property list",
  !d.some((x) => x.key.toLowerCase() === "scenario"));
checkTrue("title/subtitle fields are not repeated either",
  !d.some((x) => ["property", "address"].includes(x.key.toLowerCase())));
// It is still shown, just once, as the thing it actually is.
check("scenario reads as a tag", presentScenario(MAPLE.details), "Off market");
check("falls back to details.status when scenario is absent",
  presentScenario({ status: "Listed" }), "Listed");

// ═══════════════════════════════════════════════════════════════════════════
// 5. Contacted with no date — two of Casey's three rows
// ═══════════════════════════════════════════════════════════════════════════
check("REGRESSION: contacted with a null date says so plainly",
  presentContact(MAPLE.status, MAPLE.lastContactedAt),
  "Written to, before we started recording the date");
check("contacted with a real date",
  presentContact("contacted", new Date("2026-07-22T16:41:00Z")),
  "Written to 22 Jul 2026");
check("a new lead claims no outreach at all", presentContact("new", null), null);
check("an unparseable date does not render Invalid Date",
  presentContact("contacted", "not-a-date"),
  "Written to, before we started recording the date");

// ═══════════════════════════════════════════════════════════════════════════
// 6. Junk in, nothing out
// ═══════════════════════════════════════════════════════════════════════════
check("null details", presentDetails(null), []);
check("array details", presentDetails(["a"]), []);
check("string details", presentDetails("nope"), []);
check("empty values dropped", presentDetails({ a: "", b: null, c: "  " }), []);
checkTrue("nested object is skipped, not stringified",
  !JSON.stringify(presentDetails({ owner: { name: "x" } })).includes("object Object"));
check("numbers survive", presentDetails({ unit_count: 38 })[0]?.value, "38");
check("booleans survive", presentDetails({ verified: true })[0]?.value, "true");
check("presentText on null", presentText(null), "");



// ═══════════════════════════════════════════════════════════════════════════
// 7. Temperature, including the honest fallback
// ═══════════════════════════════════════════════════════════════════════════
// Every lead in the system predates the temperature column, so the fallback is
// not an edge case today, it is ALL of Casey's rows.
{
  const agentSet = presentTemperature({
    temperature: "hot", temperatureReason: "he asked for a number — after saying no",
    temperatureSetBy: "agent", status: "replied",
  });
  check("agent-set temperature is used as-is", agentSet.value, "hot");
  check("its reason is carried through", agentSet.by, "agent");
  checkTrue("REGRESSION: the reason is scrubbed like any agent text",
    !agentSet.reason!.includes("—"), agentSet.reason);

  const clientSet = presentTemperature({
    temperature: "cold", temperatureReason: "not my market", temperatureSetBy: "client", status: "replied",
  });
  check("a client's own choice beats their status", clientSet.value, "cold");
  check("and is attributed to them", clientSet.by, "client");

  // Casey's three live rows: contacted, contacted, new. None judged yet.
  for (const [status, want] of [["replied","hot"],["qualified","hot"],["won","hot"],
                                ["contacted","warm"],["new","warm"],
                                ["lost","cold"],["archived","cold"]] as const) {
    const d = presentTemperature({ status });
    check(`derived: ${status} -> ${want}`, d.value, want);
    check(`derived: ${status} claims no reason`, d.reason, null);
    check(`derived: ${status} is labelled derived`, d.by, "derived");
  }
  checkTrue("REGRESSION: a derived temperature never invents a reason",
    ["new","contacted","replied","lost","archived","weird"].every(s => presentTemperature({status:s}).reason === null));
  check("an unknown status still lands somewhere", presentTemperature({ status: "zzz" }).value, "warm");
  check("junk in the column falls back to derivation",
    presentTemperature({ temperature: "lukewarm", status: "replied" }).by, "derived");
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. The table column form
// ═══════════════════════════════════════════════════════════════════════════
// The prose form reads "before we started recording the date", which is right
// in a sentence and far too long for a cell under a "You last spoke" header.
check("a real date is short", presentLastSpoke("contacted", new Date("2026-07-22T16:41:00Z")), "22 Jul");
check("REGRESSION: contacted with no date is two words, not a sentence",
  presentLastSpoke("contacted", null), "not recorded");
check("never contacted says never", presentLastSpoke("new", null), "never");
check("a lead written off without contact says never", presentLastSpoke("lost", null), "never");
check("an unparseable date does not render Invalid Date", presentLastSpoke("replied", "nope"), "not recorded");
checkTrue("the cell never runs long", ["contacted","new","replied","lost"].every(
  st => presentLastSpoke(st, null).length <= 12));

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
