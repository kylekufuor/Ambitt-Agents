// ---------------------------------------------------------------------------
// Presenting agent-authored lead data
// ---------------------------------------------------------------------------
// Lead.name, Lead.notes and every value inside Lead.details are written by the
// agent, not by us and not by a form. The portal was rendering all three as if
// they were tidy database columns. Measured against Casey Litsey's three live
// leads on 2026-07-30, they are not:
//
//   name          "Maple Holdings LLC — Maple Industrial Park"   (em dash, all 3)
//   notes         "...No reply logged yet — Day 3 follow-up due" (em dash)
//   details.year_built    "1987"                                 (4 chars)
//   details.crexi_check   "No matching listing found on Crexi —
//                          confirmed off-market"                 (57 chars, em dash)
//   details.market_note   118 chars, em dash, en dash in a range
//
// So three separate defects, all of which a client sees today:
//
// 1. EM DASHES. The ban is real and enforced at email send time. The portal
//    never called the scrub, so the same sentence read clean in a letter and
//    dashed on a lead card. Worse on the record page, where Lead.name IS the
//    page title, so the banned character opens the largest text on the screen.
//
// 2. MACHINE KEYS. `crexi_check`, `follow_up_due`, `year_built` were printed
//    raw. The agent writes keys for itself; the client should not have to read
//    them.
//
// 3. ONE SHAPE FOR EVERY VALUE. Values run from "1987" to a 118-character
//    sentence, and every one was rendered in the layout meant for the former:
//    right-aligned 12.5px mono, which turns a sentence into ragged mono prose
//    hugging the right edge of a 300px rail.
//
// There is also a fourth thing that is not a rendering bug but reads as one:
// `details.status` ("Off-Market") sat four rows above the lifecycle pill
// ("Contacted"), so the page showed two fields called status disagreeing with
// each other. They are different things. Lead.status is where the outreach has
// got to; details.status is what kind of deal it is, and it duplicates
// details.scenario. It is suppressed here rather than renamed, because the
// scenario tag already says it.
// ---------------------------------------------------------------------------

import { stripEmDashes } from "./scrub-emdash";

/**
 * Any agent-authored string on its way to a client's screen. Same scrub the
 * email path uses, so the two surfaces cannot disagree.
 */
export function presentText(value: string | null | undefined): string {
  return stripEmDashes(value).text;
}

export type Temperature = "hot" | "warm" | "cold";

export interface PresentedTemperature {
  value: Temperature;
  /** The sentence shown under the tag. Null only when nobody has judged it. */
  reason: string | null;
  /**
   * `agent`   Arthur decided and said why.
   * `client`  the client moved it by hand; Arthur may propose but not overwrite.
   * `derived` nobody has judged it, we placed it from the outreach status.
   */
  by: "agent" | "client" | "derived";
}

/**
 * Where a lead sits on the board.
 *
 * The honest part is `derived`. Every lead in the system predates the
 * temperature column, so on day one the board would otherwise be empty or, far
 * worse, full of confident-looking tags nobody actually made. We place those
 * rows from their outreach status and SAY that is what happened, because the
 * whole reason the board is worth looking at is that every card can explain
 * itself. Inventing a reason to fill the gap would poison exactly the thing
 * this feature is for.
 */
export function presentTemperature(lead: {
  temperature?: string | null;
  temperatureReason?: string | null;
  temperatureSetBy?: string | null;
  status: string;
}): PresentedTemperature {
  const raw = (lead.temperature ?? "").trim().toLowerCase();
  if (raw === "hot" || raw === "warm" || raw === "cold") {
    const by = lead.temperatureSetBy === "client" ? "client" : "agent";
    const reason = presentText(lead.temperatureReason).trim();
    return { value: raw, reason: reason || null, by };
  }

  const s = lead.status.trim().toLowerCase();
  // Someone answered, so it wants a human. Anything written off is parked.
  const value: Temperature =
    s === "replied" || s === "qualified" || s === "won"
      ? "hot"
      : s === "lost" || s === "archived"
        ? "cold"
        : "warm";
  return { value, reason: null, by: "derived" };
}

/** The line shown where a reason would be, when there is no reason. */
export const DERIVED_TEMPERATURE_NOTE =
  "Placed by where the outreach has got to. Arthur has not judged this one yet.";

export interface PresentedName {
  /** The entity that holds it. The record page title. */
  title: string;
  /** The property itself, when the agent packed one into the name. */
  subtitle: string | null;
}

/**
 * A lead name is not a sentence, so the prose scrub is the wrong tool for it.
 * The agent writes "<Entity> — <Property>", where the dash is a separator
 * between two fields rather than punctuation inside one. Running the sentence
 * rules over it produces "Maple Holdings LLC. Maple Industrial Park", which
 * reads as two sentences and is arguably worse than the dash it replaced.
 *
 * Split it instead. The record page already wants an entity title and a
 * property line underneath, so the dash was always marking a structure the
 * design has a place for. `details.property` carries the same value and is
 * suppressed from the property list for exactly this reason.
 */
export function presentLeadName(name: string | null | undefined): PresentedName {
  const raw = typeof name === "string" ? name.trim() : "";
  if (!raw) return { title: "", subtitle: null };

  // Only a SPACED dash separates fields. An unspaced one is inside a token
  // ("Fifty-Two", a hyphenated surname) and must not split the name.
  const parts = raw.split(/\s+[—–]\s+/);
  if (parts.length < 2) return { title: presentText(raw).trim(), subtitle: null };

  const title = presentText(parts[0]).trim();
  // Three or more parts is unusual; keep everything after the first separator
  // together rather than silently dropping the tail.
  const subtitle = presentText(parts.slice(1).join(", ")).trim();
  return { title: title || presentText(raw).trim(), subtitle: subtitle || null };
}

/**
 * Detail keys already shown as a first-class element on the record surfaces.
 * Repeating them in the property list is noise at best; in the case of
 * `status` it actively contradicts the lifecycle pill next to it.
 */
const REDUNDANT_DETAIL_KEYS = new Set([
  "status", // duplicates `scenario`, and collides with Lead.status
  "scenario", // rendered as the scenario tag
  "property", // rendered as the record title
  "address", // rendered under the title
  "name",
  "company",
]);

/** Machine keys the agent writes that have a settled human name. */
const KEY_LABELS: Record<string, string> = {
  year_built: "Year built",
  crexi_check: "Crexi check",
  costar_check: "CoStar check",
  market_note: "Market note",
  follow_up_due: "Follow up",
  owned_since: "Owned since",
  loan_matures: "Loan matures",
  unit_count: "Units",
  parcel_id: "Parcel",
};

/**
 * `crexi_check` -> `Crexi check`. Sentence case, not Title Case: a list of
 * Title Cased labels reads like a form, and this is a description of a
 * building.
 */
export function humanizeKey(key: string): string {
  const known = KEY_LABELS[key.toLowerCase()];
  if (known) return known;
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type DetailKind = "scalar" | "prose";

export interface PresentedDetail {
  key: string;
  label: string;
  value: string;
  /**
   * `scalar` fits an aligned label/value pair. `prose` is a sentence and needs
   * to be set as one: full width, left aligned, normal text rather than mono.
   */
  kind: DetailKind;
}

/**
 * Long enough that right-aligning it against a narrow column produces the
 * ragged mono block this module exists to prevent. Tuned against the live
 * rows: "1200 Maple Ave, Tulsa OK" (24, five words) stays a scalar,
 * "Day 3 follow-up pending Casey approval" (38, six words) becomes prose.
 */
function classify(value: string): DetailKind {
  const words = value.trim().split(/\s+/).length;
  return value.length > 32 || words > 5 ? "prose" : "scalar";
}

/**
 * Turn a raw `Lead.details` object into something renderable. Drops empties,
 * drops keys already shown elsewhere, humanizes what is left, scrubs the
 * values, and says which of the two layouts each one needs.
 */
export function presentDetails(details: unknown): PresentedDetail[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];

  const out: PresentedDetail[] = [];
  for (const [key, raw] of Object.entries(details as Record<string, unknown>)) {
    if (raw === null || raw === undefined || raw === "") continue;
    if (REDUNDANT_DETAIL_KEYS.has(key.toLowerCase())) continue;

    // Objects and arrays are not something a client can read. Skipping is
    // better than printing "[object Object]" at them.
    if (typeof raw === "object") continue;

    const value = presentText(String(raw)).trim();
    if (!value) continue;

    out.push({ key, label: humanizeKey(key), value, kind: classify(value) });
  }

  // Scalars first: they are the skimmable facts about the building. Sentences
  // are commentary and read better after the numbers, not interleaved with
  // them.
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "scalar" ? -1 : 1));
}

/**
 * The scenario tag ("OFF-MARKET" -> "Off market"). Kept separate from the
 * lifecycle status on purpose: one is what kind of deal this is, the other is
 * how far the outreach has got, and showing them as the same kind of chip is
 * what made two fields look like they disagreed.
 */
export function presentScenario(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const d = details as Record<string, unknown>;
  const raw = d.scenario ?? d.status;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const words = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "Contacted" with no `lastContactedAt` is a real and current state: the
 * engine only stamps the date forward from 2026-07-29, so rows written before
 * that assert an outreach they cannot date. Two of Casey's three leads are in
 * it. Saying "Contacted" with a blank date reads like a bug; saying so plainly
 * does not.
 */
export function presentContact(
  status: string,
  lastContactedAt: Date | string | null | undefined,
): string | null {
  const OUTREACH_DONE = new Set(["contacted", "replied", "qualified", "won"]);
  if (!OUTREACH_DONE.has(status.toLowerCase())) return null;
  if (!lastContactedAt) return "Written to, before we started recording the date";
  const d = lastContactedAt instanceof Date ? lastContactedAt : new Date(lastContactedAt);
  if (Number.isNaN(d.getTime())) return "Written to, before we started recording the date";
  return `Written to ${d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}
