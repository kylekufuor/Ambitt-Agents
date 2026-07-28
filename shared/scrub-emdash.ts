// ---------------------------------------------------------------------------
// Em-dash scrub — send-time enforcement of the platform's em-dash ban.
// ---------------------------------------------------------------------------
// VOICE_RULES in shared/runtime/prompt-assembler.ts already tells every agent
// "Never use em dashes. Not once, ever." This module is the safety net for the
// runs where a model ignores it: the last thing that touches client-facing copy
// before it leaves the building (shared/email.ts, shared/sms.ts, the chat reply
// in shared/runtime/engine.ts). The prompt states the intent; this enforces it.
// If the send paths start warning loudly in prod, the fix is the prompt, not
// this file — the warn count is the signal for whether the rule is holding.
//
// Deliberately narrow:
//   - U+2014 (—) ONLY. En dashes (U+2013, –) are left alone so ranges like
//     "9–5" and "Mon–Fri" survive untouched. Ordinary hyphens are never touched.
//   - Rewrites rather than deletes, because the output has to read like a human
//     wrote it: no double spaces, no ",," / ".," / " ," and no leading or
//     trailing comma left behind.
//   - Pure + dependency-free so it unit-tests as a plain script. Logging is the
//     caller's job, where the agentId / channel context lives.
// ---------------------------------------------------------------------------

const EM_DASH = "—";

// Horizontal whitespace hugging a dash. Includes the nbsp entity spellings so
// that "Hello&nbsp;— world" collapses to "Hello, world" instead of leaving a
// rendered space before the comma.
const SPACE = "(?:[ \\t\\u00a0]|&nbsp;|&#160;|&#xa0;)";
const EM_DASH_RUN = new RegExp(`(${SPACE}*)(\\u2014+)(${SPACE}*)`, "gi");

// Entity spellings of U+2014 — these render as an em dash in an HTML body, so
// they're the same offence written differently. Handled on the HTML path only;
// in plain text "&mdash;" is literal text and stays literal.
const EM_DASH_ENTITY_G = /&mdash;|&#8212;|&#x2014;/gi;
const EM_DASH_ENTITY = /&mdash;|&#8212;|&#x2014;/i;

// Next char already closes the thought → the dash adds nothing. "wait —." → "wait."
const DROP_BEFORE_NEXT = new Set([".", ",", ";", ":", "!", "?", ")", "]", "}"]);
// Previous char already opens a bracket/quote → a comma would be wrong. "(— see" → "(see"
const DROP_AFTER_PREV = new Set(["(", "[", "{", "“", "‘", '"', "'", "/"]);
// Previous char already punctuates → a comma would double up. "yes, — and" → "yes, and"
const SPACE_AFTER_PREV = new Set([",", ";", ":", ".", "!", "?"]);

const UPPER = /\p{Lu}/u;
const DIGIT = /[0-9]/;

// Tags that don't break a sentence. Copy either side of one of these is still
// one sentence, so an em dash hugging a <a>/<strong> gets the same treatment it
// would get in flat text. Anything else (p, div, td, br, li, h1…) is a line
// edge, and a dash sitting against it is dropped rather than turned into a
// comma we can't place correctly across the tag.
const INLINE_TAGS = new Set([
  "a", "abbr", "b", "big", "cite", "code", "em", "font", "i", "img", "label",
  "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u", "var",
]);

/** Trailing nbsp entity — a rendered space, so it counts as a line edge. */
const TRAILING_NBSP = /(?:&nbsp;|&#160;|&#xa0;)$/i;

export interface ScrubResult {
  /** The rewritten text. Strictly identical to the input when replaced === 0. */
  text: string;
  /** How many U+2014 characters were rewritten. A run of two counts as two. */
  replaced: number;
}

function isUpper(ch: string | undefined): boolean {
  return ch !== undefined && UPPER.test(ch);
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && DIGIT.test(ch);
}

/**
 * True if the dash at `dashIndex` sits inside a URL-ish token (no whitespace
 * back to an http/https/www/mailto prefix). Rewriting inside a link breaks it,
 * so those dashes are left alone and are NOT counted as replaced.
 */
function isInsideUrlToken(whole: string, dashIndex: number): boolean {
  let start = dashIndex;
  while (start > 0 && !/\s/.test(whole[start - 1])) start--;
  return /^(https?:\/\/|www\.|mailto:)/i.test(whole.slice(start, dashIndex));
}

/**
 * Rewrite every em dash in a PLAIN TEXT string. Safe on empty/nullish input.
 *
 * Substitution rules, in order:
 *   1. alone on a line                  → removed
 *   2. at start of line ("— Atlas")     → removed, indentation kept
 *   3. at end of line ("hang on —")     → removed with its space
 *   4. next char is closing punctuation → removed ("wait —." → "wait.")
 *   5. prev char opens a bracket/quote  → removed ("(— see" → "(see")
 *   6. prev char is punctuation         → single space ("yes, — and" → "yes, and")
 *   7. unspaced between digits          → hyphen ("2024—2026" → "2024-2026")
 *   8. next char is a capital           → ". " (the dash was ending a clause)
 *   9. everything else                  → ", "
 */
export function stripEmDashes(text: string | null | undefined): ScrubResult {
  return rewritePlain(text, undefined, undefined);
}

/**
 * stripEmDashes with optional neighbour characters for a dash sitting at the
 * very start or end of the string. Used by the HTML path so copy split across
 * an inline tag ("…St</a> — down 8%") is judged on the whole sentence. A
 * neighbour of "\n" means "line edge" (block tag, or rendered whitespace we
 * can't reach to clean up).
 */
function rewritePlain(
  text: string | null | undefined,
  ctxPrev: string | undefined,
  ctxNext: string | undefined
): ScrubResult {
  if (typeof text !== "string" || !text.includes(EM_DASH)) {
    return { text: typeof text === "string" ? text : "", replaced: 0 };
  }

  let replaced = 0;
  const rewritten = text.replace(
    EM_DASH_RUN,
    (
      match: string,
      lead: string,
      dashes: string,
      trail: string,
      offset: number,
      whole: string
    ): string => {
      if (isInsideUrlToken(whole, offset + lead.length)) return match;

      const prev = offset > 0 ? whole[offset - 1] : ctxPrev;
      const nextIndex = offset + match.length;
      const next = nextIndex < whole.length ? whole[nextIndex] : ctxNext;
      const atLineStart = prev === undefined || prev === "\n" || prev === "\r";
      const atLineEnd = next === undefined || next === "\n" || next === "\r";
      const unspaced = lead.length === 0 && trail.length === 0;

      replaced += dashes.length;

      if (atLineStart && atLineEnd) return "";
      if (atLineStart) return lead;
      if (atLineEnd) return "";
      if (next !== undefined && DROP_BEFORE_NEXT.has(next)) return "";
      if (prev !== undefined && DROP_AFTER_PREV.has(prev)) return "";
      if (prev !== undefined && SPACE_AFTER_PREV.has(prev)) return " ";
      if (unspaced && isDigit(prev) && isDigit(next)) return "-";
      if (isUpper(next)) return ". ";
      return ", ";
    }
  );

  return { text: rewritten, replaced };
}

/** Scrub one HTML text node: entity spellings first, then the plain-text rules. */
function scrubTextNode(
  node: string,
  ctxPrev: string | undefined,
  ctxNext: string | undefined
): ScrubResult {
  if (!node) return { text: node, replaced: 0 };
  const normalized = EM_DASH_ENTITY.test(node)
    ? node.replace(EM_DASH_ENTITY_G, EM_DASH)
    : node;
  const result = rewritePlain(normalized, ctxPrev, ctxNext);
  // Hold the invariant "replaced === 0 means the copy is untouched": if every
  // dash in this node was skipped (inside a link), the entity normalization
  // above must not leak out.
  return result.replaced === 0 ? { text: node, replaced: 0 } : result;
}

/** Index just past the ">" that closes the tag opening at `start`, quote-aware. */
function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < html.length; i++) {
    const c = html[i];
    if (quote !== null) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === ">") return i + 1;
  }
  // Unterminated "<" — treat the remainder as markup. Conservative on purpose:
  // missing a scrub is harmless, rewriting inside an attribute is not.
  return html.length;
}

interface Segment {
  /** Markup segments are copied through byte-for-byte; text segments get scrubbed. */
  markup: boolean;
  value: string;
  /** Markup only: does this segment break the sentence either side of it? */
  inline: boolean;
}

/**
 * Split an HTML string into markup and text segments. Tags (quote-aware, so a
 * ">" inside an attribute doesn't end one early), comments, and the raw
 * contents of <script>/<style> all come back as markup.
 */
function tokenize(html: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);

    if (lt === -1) {
      segments.push({ markup: false, value: html.slice(i), inline: false });
      break;
    }
    if (lt > i) {
      segments.push({ markup: false, value: html.slice(i, lt), inline: false });
    }

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      const stop = end === -1 ? html.length : end + 3;
      segments.push({ markup: true, value: html.slice(lt, stop), inline: false });
      i = stop;
      continue;
    }

    const tagEnd = findTagEnd(html, lt);
    const tag = html.slice(lt, tagEnd);
    const parsed = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(tag);
    const isClosing = parsed?.[1] === "/";
    const name = parsed?.[2]?.toLowerCase() ?? "";
    segments.push({ markup: true, value: tag, inline: INLINE_TAGS.has(name) });
    i = tagEnd;

    // Raw-text elements: their contents are code, not copy. Never scrubbed.
    // Opening tags only — </script> must not restart the skip.
    if ((name === "script" || name === "style") && !isClosing && !tag.endsWith("/>")) {
      const closing = new RegExp(`</\\s*${name}\\s*>`, "i").exec(html.slice(i));
      const stop = closing ? i + closing.index : html.length;
      if (stop > i) {
        segments.push({ markup: true, value: html.slice(i, stop), inline: false });
        i = stop;
      }
    }
  }

  return segments;
}

/**
 * The character on one side of a text segment, looking through inline tags.
 * Returns "\n" for anything that reads as a line edge (block tag, rendered
 * whitespace, nbsp entity) and undefined at the ends of the document.
 */
function neighborChar(
  segments: Segment[],
  index: number,
  direction: 1 | -1
): string | undefined {
  for (let i = index + direction; i >= 0 && i < segments.length; i += direction) {
    const seg = segments[i];
    if (seg.markup) {
      if (seg.inline) continue;
      return undefined;
    }
    if (seg.value.length === 0) continue;
    if (direction === -1 && TRAILING_NBSP.test(seg.value)) return "\n";
    const ch = direction === -1 ? seg.value[seg.value.length - 1] : seg.value[0];
    // Whitespace in a NEIGHBOURING node can't be consumed by our replacement,
    // so a comma there would render as " , ". Treat it as a line edge instead:
    // the dash is dropped and the existing space carries the sentence.
    return /\s/.test(ch) ? "\n" : ch;
  }
  return undefined;
}

/**
 * Rewrite every em dash in an HTML body WITHOUT touching markup: tags,
 * attribute values (an em dash inside an href stays put), comments, and
 * <script>/<style> contents are copied through verbatim. Only text nodes are
 * rewritten, using the same rules as stripEmDashes plus cross-tag context so a
 * dash hugging an inline <a>/<strong> still becomes a comma. Safe on
 * empty/nullish input and on plain text with no tags at all.
 */
export function stripEmDashesHtml(html: string | null | undefined): ScrubResult {
  if (typeof html !== "string" || html.length === 0) {
    return { text: typeof html === "string" ? html : "", replaced: 0 };
  }
  if (!html.includes(EM_DASH) && !EM_DASH_ENTITY.test(html)) {
    return { text: html, replaced: 0 };
  }

  const segments = tokenize(html);
  let out = "";
  let replaced = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.markup) {
      out += seg.value;
      continue;
    }
    const node = scrubTextNode(
      seg.value,
      neighborChar(segments, i, -1),
      neighborChar(segments, i, 1)
    );
    out += node.text;
    replaced += node.replaced;
  }

  return { text: out, replaced };
}

export default { stripEmDashes, stripEmDashesHtml };
