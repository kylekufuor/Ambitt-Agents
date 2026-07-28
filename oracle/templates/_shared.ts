// ---------------------------------------------------------------------------
// Ambitt agent email — design system primitives
// ---------------------------------------------------------------------------
// THIS FILE IS THE SOURCE OF TRUTH FOR EVERY AGENT EMAIL. Read it before
// styling any template. If a template needs a new visual idea, add the
// primitive here so the whole family inherits it, never inline a one-off.
//
// The email IS the product. A client can open the portal to see the work, but
// they never have to, so this is the surface they judge us on. It has to feel
// like it came from a company, not from a monitoring tool.
//
// ---------------------------------------------------------------------------
// THE SEVEN DECISIONS
// ---------------------------------------------------------------------------
// 1. ONE TYPEFACE, SET WITH RESTRAINT. No webfonts (Gmail drops them and the
//    fallback is unowned), no serif, no display/body pairing. A system-first
//    stack lands on SF on Apple and Segoe UI on Windows, which is where email
//    actually gets read, and both are well-drawn. The premium comes from how
//    it's set: headings at weight 600 (never 700), 1.2 leading, negative
//    tracking only above 19px. This mirrors the Databricks finding and it
//    matches the portal's Lexend-semibold rhythm as closely as email allows.
//
// 2. SURFACES SEPARATE BY TONE, NOT BY BORDERS. A flat gray 1px outline around
//    a card is the #1 AI-slop tell and it's banned in client-portal/DESIGN.md.
//    In email we can't rely on box-shadow (Outlook drops it), so the tonal
//    ladder does the work and always renders: slate page > white card > wash
//    panel. Shadow is layered on top as progressive enhancement only.
//
// 3. THE LETTERHEAD IS A 3PX TEAL RULE, NOT A BLACK SLAB. The old system put a
//    full-bleed near-black band (or red, or brown) across the top of every
//    email, which is what made them read as system notices. State now lives in
//    a hairline rule + one small chip. Quieter, and unmistakably ours.
//
// 4. TWO-STEP TEAL. Logo teal #00b3b3 has a 2.6:1 contrast ratio on white, so
//    it fails as text and as a button fill. It stays what it's good at:
//    marks, rules, fills. Text and buttons use the deep step (#00807e /
//    #00706f) which clears AA. One hue, two roles, nothing muddied.
//
// 5. IMAGES ARE IDENTITY ONLY, NEVER LOAD-BEARING. Most clients block
//    images by default and Gmail clips at ~102KB. So: exactly one image, the
//    agent avatar, and it sits in a td with a teal `bgcolor` and styled alt
//    text. Blocked, it degrades to a teal disc with the agent's initial, which
//    is a perfectly good avatar. No decorative illustration, no stock photo,
//    no hero image, no screenshots. The wordmark is live text so it recolors
//    in dark mode instead of turning into an invisible dark PNG.
//
// 6. DARK MODE IS DECLARED, NOT FOUGHT. `color-scheme` meta tells Apple Mail
//    and iOS we handle it, which stops the blunt auto-invert; a
//    prefers-color-scheme block then does it properly. Nothing is pure white
//    or pure black in either direction, so a client that inverts anyway still
//    lands somewhere deliberate.
//
// 7. PORTAL LINKS ARE INVITATIONS. The portal is good and it's there if they
//    want it, but the client must never feel sent to do homework. Hence
//    `portalInvite()`: a quiet panel with a reason and a ghost button, never a
//    bare blue link and never an instruction.
//
// House rules that show up as code here: no em dashes in platform copy (see
// emdash.test.ts), sentence case everywhere including buttons, at most one
// uppercase eyebrow per email, "we"/"our team" and never an operator's name.
// ---------------------------------------------------------------------------

import { portalLink } from "../../shared/portal-links.js";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * Where the brand PNGs are served from. Overridable so the preview renderer
 * (scripts/render-emails.ts) can point at the local working copy and show what
 * a change to the asset will actually look like before it ships.
 */
function assetBase(): string {
  return process.env.EMAIL_ASSET_BASE ?? "https://portal.ambitt.agency/brand";
}

/** The agent's face. One image per email, cached across both placements. */
export const AGENT_AVATAR_URL = `${assetBase()}/ambitt-agent-avatar.png`;

export const T = {
  // Surfaces: the tonal ladder that replaces borders.
  page: "#eef2f6", // cool slate wash, kin to the portal's #f5f8fa
  card: "#ffffff",
  wash: "#f2f6f9", // inset panel, a ~4% step off the card
  washBrand: "#e7f5f5", // teal-tinted panel
  washAttention: "#fdf4e7",
  washProblem: "#fdeef1",
  washGood: "#e6f4f1",

  // Ink: nothing is pure black.
  ink: "#1d2f40", // headings
  body: "#33475b", // portal --text, matched exactly
  mute: "#56697c", // 5.0:1 on the page wash, 5.2:1 on a panel
  faint: "#728799", // separators only, never body text
  rule: "#e2eaf1", // hairlines, for table rows only

  // Brand: one hue, two roles.
  teal: "#00b3b3", // marks, rules, fills. Never text.
  tealDeep: "#00807e", // button fill under white text (4.8:1)
  tealText: "#00706f", // teal on white (6.0:1)

  // State: borrowed from the portal's section accents so the family reads.
  attention: "#b45309",
  problem: "#be123c",
  good: "#00706a",

  // One typeface, top to bottom.
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI Variable Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif",
} as const;

/** Which accent the letterhead rule and chip carry. */
export type Tone = "brand" | "attention" | "problem" | "good";

const TONE: Record<Tone, { rule: string; text: string; wash: string }> = {
  brand: { rule: T.teal, text: T.tealText, wash: T.washBrand },
  attention: { rule: "#e8a33d", text: T.attention, wash: T.washAttention },
  problem: { rule: "#e8536f", text: T.problem, wash: T.washProblem },
  good: { rule: "#22b8a0", text: T.good, wash: T.washGood },
};

// Legacy prop shapes. Templates still speak these; keep them stable.
export interface BaseEmailProps {
  agentName: string;
  clientName: string;
  productName: string;
  agentId: string;
  clientId: string;
}

export interface StatItem {
  value: string;
  label: string;
  delta: string;
  deltaType: "up" | "down";
}

export interface SourceLink {
  label: string;
  url: string;
  color: string;
}

export interface RecommendationItem {
  title: string;
  description: string;
  reasoning: string;
  approveLabel: string;
  approveActionId: string;
}

// ---------------------------------------------------------------------------
// Document shell
// ---------------------------------------------------------------------------

/**
 * Preheader: the grey line the inbox shows after the subject. Left unset it
 * fills with whatever the first words of the body happen to be, which is how
 * a considered email ends up previewing as "View in browser Hi Casey,".
 * Hidden in the body, shown in the list. Padded so nothing leaks in after it.
 */
function preheaderBlock(text: string): string {
  const pad = "&#8199;&#65279;&nbsp;".repeat(60);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${text}${pad}</div>`;
}

/**
 * The outer document. Every template goes through here, so the meta tags,
 * dark-mode rules and mobile behaviour are decided once.
 *
 * `rows` is a run of `<tr>` elements produced by the section helpers below.
 */
export function emailDocument(opts: {
  preheader: string;
  tone?: Tone;
  rows: string;
  /** Rendered under the card, outside it. Footer nav lives here. */
  outerRows?: string;
}): string {
  const tone = TONE[opts.tone ?? "brand"];
  return `<!DOCTYPE html>
<html lang="en" style="color-scheme:light dark;supported-color-schemes:light dark;">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title></title>
<style>
  /* Inline styles win on specificity, so overrides carry !important. */
  @media only screen and (max-width:600px) {
    .px { padding-left:24px !important; padding-right:24px !important; }
    .card { border-radius:12px !important; }
    .h1 { font-size:22px !important; }
    .h2 { font-size:18px !important; }
    .stat-v { font-size:22px !important; }
    .btn a { display:block !important; text-align:center !important; }
    .stack { display:block !important; width:100% !important; }
    .stack-gap { height:10px !important; display:block !important; }
    /* A 5-column shortlist at 390px needs the gutter and the type to give a
       little, or every property name wraps to three lines. */
    .tbl th, .tbl td { font-size:13px !important; padding-left:9px !important; }
    .tbl th:first-child, .tbl td:first-child { padding-left:0 !important; }
  }
  @media (prefers-color-scheme: dark) {
    .dm-page { background-color:#111c25 !important; }
    .dm-card { background-color:#18242f !important; }
    .dm-wash { background-color:#1f2d3a !important; }
    .dm-ink, .dm-ink * { color:#eaf1f6 !important; }
    .dm-body, .dm-body * { color:#c3d2de !important; }
    .dm-mute, .dm-mute * { color:#93a7b8 !important; }
    .dm-rule { border-color:#2a3b4a !important; }
    /* Declared last on purpose. The blanket .dm-body/.dm-mute descendant rules
       above would otherwise flatten every semantic colour inside a table cell,
       so "Done" and "Needs you" would arrive in dark mode as the same grey.
       Equal specificity, later wins. */
    .dm-teal, .dm-teal * { color:#4ed4d0 !important; }
    .dm-ok, .dm-ok * { color:#4ed4d0 !important; }
    .dm-warn, .dm-warn * { color:#f2ad63 !important; }
    .dm-bad, .dm-bad * { color:#ff8fa3 !important; }
  }
</style>
</head>
<body class="dm-page" style="margin:0;padding:0;width:100%;background-color:${T.page};font-family:${T.font};-webkit-font-smoothing:antialiased;">
${preheaderBlock(opts.preheader)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="dm-page" style="width:100%;border-collapse:collapse;background-color:${T.page};">
<tr><td align="center" style="padding:32px 12px 40px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center" class="card dm-card" style="width:100%;max-width:600px;background-color:${T.card};border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(29,47,64,0.04),0 8px 20px rgba(29,47,64,0.05),0 24px 48px rgba(29,47,64,0.05);">
  <tr><td height="3" bgcolor="${tone.rule}" style="height:3px;line-height:3px;font-size:0;background-color:${tone.rule};">&nbsp;</td></tr>
${opts.rows}
</table>

${opts.outerRows ?? ""}

</td></tr>
</table>
</body>
</html>`;
}

/** A padded row inside the card. `pt`/`pb` tune vertical rhythm. */
export function section(html: string, pt = 0, pb = 0): string {
  return `<tr><td class="px" style="padding:${pt}px 40px ${pb}px 40px;">${html}</td></tr>`;
}

// ---------------------------------------------------------------------------
// Letterhead
// ---------------------------------------------------------------------------

/**
 * The agent's face, bulletproof. The `td` carries the teal disc via `bgcolor`
 * so a blocked image still reads as an avatar rather than a broken-image icon,
 * and the alt text is styled white/centred so it lands as the initial.
 */
export function avatar(agentName: string, size = 44): string {
  const initial = (agentName.trim().charAt(0) || "A").toUpperCase();
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${size}" height="${size}" bgcolor="${T.teal}" align="center" valign="middle" style="width:${size}px;height:${size}px;background-color:${T.teal};border-radius:${size}px;text-align:center;vertical-align:middle;">
<img src="${AGENT_AVATAR_URL}" width="${size}" height="${size}" alt="${initial}" style="display:block;width:${size}px;height:${size}px;border-radius:${size}px;border:0;outline:none;text-decoration:none;color:#ffffff;font-family:${T.font};font-size:${Math.round(size * 0.4)}px;font-weight:600;line-height:${size}px;text-align:center;" />
</td></tr></table>`;
}

/**
 * Who this is from, at the top of every email: face, name, and the role line
 * in the standardised "[Role] at Ambitt Agents" shape. An optional chip on the
 * right carries state. This replaces the black header slab.
 */
export function letterhead(opts: {
  agentName: string;
  roleLine: string;
  chipLabel?: string;
  tone?: Tone;
}): string {
  const chip = opts.chipLabel ? statusChip(opts.chipLabel, opts.tone ?? "brand") : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
<tr>
  <td width="44" valign="middle" style="width:44px;vertical-align:middle;">${avatar(opts.agentName, 44)}</td>
  <td valign="middle" style="vertical-align:middle;padding-left:14px;">
    <p class="dm-ink" style="margin:0;font-size:16px;font-weight:600;color:${T.ink};letter-spacing:-0.005em;">${opts.agentName}</p>
    <p class="dm-mute" style="margin:2px 0 0 0;font-size:13px;color:${T.mute};">${opts.roleLine}</p>
  </td>
  ${chip ? `<td align="right" valign="middle" style="text-align:right;vertical-align:middle;">${chip}</td>` : ""}
</tr>
</table>`;
}

/** Small state pill. Sentence case, never shouting. */
export function statusChip(label: string, tone: Tone = "brand"): string {
  const t = TONE[tone];
  return `<span style="display:inline-block;font-size:12px;font-weight:600;color:${t.text};background-color:${t.wash};padding:5px 11px;border-radius:20px;white-space:nowrap;">${label}</span>`;
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/** Lead heading. Weight 600, tight leading, slight negative tracking. */
export function h1(text: string): string {
  return `<p class="h1 dm-ink" style="margin:0 0 12px 0;font-size:25px;line-height:1.2;font-weight:600;color:${T.ink};letter-spacing:-0.016em;">${text}</p>`;
}

/**
 * Section heading. No top margin: a composed template controls the gap above
 * with its own `section()` padding, and a heading that carries its own leading
 * margin on top of that is how you get a 40px hole in the middle of an email.
 */
export function h2(text: string): string {
  return `<p class="h2 dm-ink" style="margin:0 0 10px 0;font-size:19px;line-height:1.25;font-weight:600;color:${T.ink};letter-spacing:-0.01em;">${text}</p>`;
}

export function h3(text: string): string {
  return `<p class="dm-ink" style="margin:0 0 8px 0;font-size:16px;line-height:1.35;font-weight:600;color:${T.ink};">${text}</p>`;
}

/**
 * The same headings, with the top margin they need when they appear mid-prose.
 * Only the markdown renderer in agent-response.ts uses these: there, a heading
 * genuinely does follow a paragraph and has to open space for itself.
 */
export function h2Flow(text: string): string {
  return `<p class="h2 dm-ink" style="margin:28px 0 10px 0;font-size:19px;line-height:1.25;font-weight:600;color:${T.ink};letter-spacing:-0.01em;">${text}</p>`;
}

export function h3Flow(text: string): string {
  return `<p class="dm-ink" style="margin:22px 0 8px 0;font-size:16px;line-height:1.35;font-weight:600;color:${T.ink};">${text}</p>`;
}

export function paragraph(text: string): string {
  return `<p class="dm-body" style="margin:0 0 16px 0;font-size:16px;line-height:1.62;color:${T.body};">${text}</p>`;
}

/**
 * Uppercase micro-label. Deliberately rationed: at most one per email. The old
 * templates ran five or six of these and it read like a form.
 */
export function eyebrow(text: string): string {
  return `<p class="dm-mute" style="margin:0 0 12px 0;font-size:11px;font-weight:600;color:${T.mute};text-transform:uppercase;letter-spacing:0.09em;">${text}</p>`;
}

export function divider(mt = 24, mb = 24): string {
  return `<div class="dm-rule" style="border-top:1px solid ${T.rule};margin:${mt}px 0 ${mb}px 0;font-size:0;line-height:0;">&nbsp;</div>`;
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

/**
 * Key numbers as an editorial strip, not as boxed tiles. Three equal rounded
 * cards in a row is an AI-slop tell; a hairline-bounded row of numbers reads
 * like a report. Capped at three so it never wraps badly on a phone.
 */
export function statStrip(stats: StatItem[]): string {
  if (stats.length === 0) return "";
  const shown = stats.slice(0, 3);
  const w = Math.floor(100 / shown.length);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="dm-rule" style="width:100%;border-collapse:collapse;border-top:1px solid ${T.rule};border-bottom:1px solid ${T.rule};">
<tr>${shown
    .map(
      (s) => `<td width="${w}%" valign="top" style="width:${w}%;padding:18px 10px 18px 0;vertical-align:top;">
<p class="stat-v dm-ink" style="margin:0;font-size:26px;line-height:1.1;font-weight:600;color:${T.ink};letter-spacing:-0.02em;font-variant-numeric:tabular-nums;">${s.value}</p>
<p class="dm-mute" style="margin:5px 0 0 0;font-size:13px;line-height:1.35;color:${T.mute};">${s.label}</p>
<p class="dm-teal" style="margin:3px 0 0 0;font-size:13px;line-height:1.35;color:${s.deltaType === "up" ? T.tealText : T.attention};">${s.delta}</p>
</td>`
    )
    .join("")}</tr>
</table>`;
}

/** Cells that look like a number, a price or a size get right-aligned. */
function isNumeric(cell: string): boolean {
  return /^[$£€]?[\d,.]+(k|m|b|%|\s?sf)?$/i.test(cell.replace(/<[^>]+>/g, "").trim());
}

/** A data table. Hairline rows, no outer box, tabular figures. */
export function dataTable(headers: string[], rows: Array<{ columns: string[] }>): string {
  if (headers.length === 0 || rows.length === 0) return "";
  const align = headers.map((_, i) => rows.every((r) => !r.columns[i] || isNumeric(r.columns[i])));
  // Gutter lives on the left of every column after the first, so a right-aligned
  // number can never end up touching the label in the next column.
  const gut = (i: number) => (i === 0 ? 0 : 16);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="tbl" style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;">
<tr>${headers
    .map(
      (h, i) =>
        `<th class="dm-mute dm-rule" align="${align[i] ? "right" : "left"}" style="padding:0 0 9px ${gut(i)}px;text-align:${align[i] ? "right" : "left"};border-bottom:1px solid ${T.rule};font-size:12px;font-weight:600;color:${T.mute};white-space:nowrap;">${h}</th>`
    )
    .join("")}</tr>
${rows
    .map(
      (r) => `<tr>${r.columns
        .map(
          (c, i) =>
            `<td class="${i === 0 ? "dm-ink" : "dm-body"} dm-rule" align="${align[i] ? "right" : "left"}" style="padding:11px 0 11px ${gut(i)}px;text-align:${align[i] ? "right" : "left"};border-bottom:1px solid ${T.rule};font-size:14px;line-height:1.4;color:${i === 0 ? T.ink : T.body};${i === 0 ? "font-weight:500;" : "white-space:nowrap;"}">${c}</td>`
        )
        .join("")}</tr>`
    )
    .join("")}
</table>`;
}

/** An inset panel. Tonal wash, no border, ever. */
export function panel(html: string, tone: Tone | "neutral" = "neutral"): string {
  const bg = tone === "neutral" ? T.wash : TONE[tone].wash;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="dm-wash" style="width:100%;background-color:${bg};border-radius:10px;">
<tr><td style="padding:18px 20px;">${html}</td></tr></table>`;
}

/** Numbered steps. Real table layout, because `display:flex` does not exist in Outlook. */
export function steps(items: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
${items
    .map(
      (s, i) => `<tr>
<td width="30" valign="top" style="width:30px;vertical-align:top;padding:0 0 12px 0;">
  <p class="dm-teal" style="margin:0;font-size:14px;font-weight:600;color:${T.tealText};font-variant-numeric:tabular-nums;line-height:1.6;">${i + 1}.</p>
</td>
<td valign="top" style="vertical-align:top;padding:0 0 12px 0;">
  <p class="dm-body" style="margin:0;font-size:15px;line-height:1.6;color:${T.body};">${s}</p>
</td>
</tr>`
    )
    .join("")}
</table>`;
}

/** A quiet bulleted list that matches the body rhythm. */
export function bullets(items: string[]): string {
  if (items.length === 0) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
${items
    .map(
      (b) => `<tr>
<td width="16" valign="top" style="width:16px;vertical-align:top;padding:0 0 9px 0;"><span style="color:${T.teal};font-size:15px;line-height:1.6;">&bull;</span></td>
<td valign="top" style="vertical-align:top;padding:0 0 9px 0;"><p class="dm-body" style="margin:0;font-size:15px;line-height:1.6;color:${T.body};">${b}</p></td>
</tr>`
    )
    .join("")}
</table>`;
}

/**
 * The shape most AI-authored bodies arrive in: prose paragraphs with the odd
 * "- " bullet run, occasionally a "## " heading. Onboarding, the checkpoints
 * and the activation brief all speak this, so it renders in one place and they
 * can't drift apart. Formatting only, nothing authored.
 */
export function richText(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (pending.length) {
      out.push(bullets(pending));
      pending = [];
    }
  };
  for (const line of lines) {
    if (line.startsWith("- ") || line.startsWith("• ")) {
      pending.push(line.slice(2));
    } else if (line.startsWith("## ")) {
      flush();
      out.push(h2Flow(line.slice(3)));
    } else {
      flush();
      out.push(
        `<p class="dm-body" style="margin:0 0 15px 0;font-size:16px;line-height:1.62;color:${T.body};">${line}</p>`
      );
    }
  }
  flush();
  return out.join("");
}

/**
 * A progress bar, drawn with nested tables because a `div` with a percentage
 * width inside another `div` is not something Outlook will honour.
 *
 * Always teal. The old version ran a green/blue/amber traffic light which made
 * a setup checklist look like a system health dashboard; the number already
 * says how far along it is.
 */
export function progressBar(pct: number, label?: string): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return `${
    label
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:0 0 7px 0;"><tr>
<td style="text-align:left;"><p class="dm-body" style="margin:0;font-size:15px;color:${T.body};">${label}</p></td>
<td style="text-align:right;"><p class="dm-ink" style="margin:0;font-size:15px;font-weight:600;color:${T.ink};font-variant-numeric:tabular-nums;">${p}%</p></td>
</tr></table>`
      : ""
  }<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="dm-wash" style="width:100%;background-color:${T.wash};border-radius:4px;">
<tr><td height="7" style="height:7px;line-height:7px;font-size:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${p}%" style="width:${p}%;"><tr>
<td height="7" bgcolor="${T.teal}" style="height:7px;line-height:7px;font-size:0;background-color:${T.teal};border-radius:4px;">&nbsp;</td>
</tr></table>
</td></tr></table>`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Bulletproof button. Colour lives on the `td` so Outlook (which ignores
 * padding and background on an `a`) still paints a solid block.
 *
 * ALWAYS TEAL, deliberately. An earlier pass tinted the button with the email's
 * tone, which gave the approval email a burnt-orange "Yes, go ahead" and the
 * error email a red "Try again". Both read as danger when neither action is
 * dangerous. State belongs on the rule, the chip and the panel wash; the button
 * is the one thing you click, so it's the one colour that never moves.
 */
export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn"><tr>
<td bgcolor="${T.tealDeep}" align="center" style="background-color:${T.tealDeep};border-radius:8px;">
<a href="${url}" style="display:inline-block;padding:13px 26px;font-family:${T.font};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
</td></tr></table>`;
}

/** Low-emphasis alternative. Reads as an option, not a second shout. */
export function ghostButton(label: string, url: string): string {
  return `<a href="${url}" class="dm-teal" style="display:inline-block;font-size:14px;font-weight:600;color:${T.tealText};text-decoration:none;">${label} &rsaquo;</a>`;
}

/** Two side-by-side quiet options. Stacks on a phone via `.stack`. */
export function optionPair(a: { label: string; url: string }, b: { label: string; url: string }): string {
  const cell = (o: { label: string; url: string }) =>
    `<a href="${o.url}" class="dm-body" style="display:block;text-align:center;background-color:${T.wash};color:${T.body};padding:12px 14px;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;">${o.label}</a>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
<tr>
  <td class="stack" width="50%" style="width:50%;padding-right:5px;">${cell(a)}</td>
  <td class="stack-gap" style="display:none;font-size:0;line-height:0;height:0;">&nbsp;</td>
  <td class="stack" width="50%" style="width:50%;padding-left:5px;">${cell(b)}</td>
</tr>
</table>`;
}

/**
 * The ask: one thing the agent wants a yes on. Title, what it is, why it's
 * worth doing, and a single button. Sits in a teal wash so it reads as the
 * agent's voice rather than as a system prompt.
 */
export function decisionCard(opts: {
  title: string;
  description: string;
  reasoning?: string;
  primaryLabel: string;
  primaryUrl: string;
  tone?: Tone;
}): string {
  const tone = opts.tone ?? "brand";
  return panel(
    `<p class="dm-ink" style="margin:0 0 6px 0;font-size:16px;font-weight:600;color:${T.ink};">${opts.title}</p>
<p class="dm-body" style="margin:0 0 ${opts.reasoning ? "8" : "16"}px 0;font-size:15px;line-height:1.55;color:${T.body};">${opts.description}</p>
${opts.reasoning ? `<p class="dm-mute" style="margin:0 0 16px 0;font-size:14px;line-height:1.55;color:${T.mute};">${opts.reasoning}</p>` : ""}
${button(opts.primaryLabel, opts.primaryUrl)}`,
    tone
  );
}

/**
 * The portal, offered rather than assigned. Never a bare blue link, never
 * phrased as a task. `line` should say what's waiting there and why they might
 * want it, not what they should go and do.
 */
export function portalInvite(line: string, label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="dm-wash" style="width:100%;background-color:${T.wash};border-radius:10px;">
<tr>
  <td style="padding:16px 20px;">
    <p class="dm-body" style="margin:0 0 4px 0;font-size:14px;line-height:1.55;color:${T.body};">${line}</p>
    ${ghostButton(label, url)}
  </td>
</tr>
</table>`;
}

/** Reference links, quiet, at the size of a caption. */
export function sourceLinksBlock(links: SourceLink[]): string {
  if (links.length === 0) return "";
  return `<p class="dm-mute" style="margin:0;font-size:13px;line-height:1.9;color:${T.mute};">Sources: ${links
    .map((l) => `<a href="${l.url}" class="dm-teal" style="color:${T.tealText};text-decoration:none;">${l.label}</a>`)
    .join(`<span class="dm-mute" style="color:${T.faint};"> &middot; </span>`)}</p>`;
}

// ---------------------------------------------------------------------------
// Sign-off
// ---------------------------------------------------------------------------
// House convention (Kyle, 5ef3bba): the agent's name on its own line, then
// their role underneath. NO leading dash. The "— {name}" sign-off the templates
// used to carry is the banned character, and the send-time scrub in
// shared/email.ts DELETES a dash sitting at a line edge, so that copy shipped
// as a bare name with no sign-off shape at all.
//
//   Arthur
//   Sourcing agent at Ambitt Agents

/** Second sign-off line when the caller has no role to give us. True, and not an invented title. */
const NEUTRAL_ROLE_LINE = "Your agent at Ambitt Agents";

/**
 * Second line of the sign-off: "[Role] at Ambitt Agents".
 *
 * `role` is whatever short job title the caller has to hand. For agents Atlas
 * built, the first sentence of Agent.purpose IS the role the client picked
 * (see the Convert path in oracle/index.ts), which is why we take the first
 * sentence and cap it: the rest of `purpose` is the internal operating brief
 * and none of it belongs in a client's inbox.
 */
export function signatureRoleLine(role?: string | null): string {
  const firstSentence = (role ?? "").split(/[.\n]/)[0].replace(/\s+/g, " ").trim();
  const clipped =
    firstSentence.length > 60
      ? firstSentence.slice(0, 60).replace(/[\s,;:-]+$/, "")
      : firstSentence;
  return clipped ? `${clipped} at Ambitt Agents` : NEUTRAL_ROLE_LINE;
}

/** Face, name, role. The shape of a person signing off, not a system stamp. */
export function signature(agentName: string, role?: string | null): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="40" valign="middle" style="width:40px;vertical-align:middle;">${avatar(agentName, 40)}</td>
<td valign="middle" style="vertical-align:middle;padding-left:12px;">
  <p class="dm-ink" style="margin:0;font-size:15px;font-weight:600;color:${T.ink};">${agentName}</p>
  <p class="dm-mute" style="margin:2px 0 0 0;font-size:13px;color:${T.mute};">${signatureRoleLine(role)}</p>
</td>
</tr></table>`;
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
// Two tiers on purpose. The reply line is the one thing that matters and it
// gets to be a sentence; everything else is a quiet utility row you only read
// when you're looking for it.
//
// NOTE: the chat URL must stay a bare `https://chat.ambitt.agency/{agentId}`.
// oracle/lib/emailRouter.ts string-replaces it to append a signed token.

export function navFooterLinks(agentName: string, agentId: string): string {
  const agentShort = agentName.length > 16 ? `${agentName.slice(0, 14)}…` : agentName;
  const links = [
    { label: `Chat with ${agentShort}`, href: `https://chat.ambitt.agency/${agentId}` },
    { label: "Your portal", href: portalLink(agentId, "overview") },
    { label: "Tools", href: portalLink(agentId, "tools") },
    { label: "Communication", href: portalLink(agentId, "communication") },
    { label: "Billing", href: portalLink(agentId, "billing") },
    {
      label: "Pause agent",
      href: `mailto:reply-${agentId}@ambitt.agency?subject=${encodeURIComponent("PAUSE")}`,
    },
    { label: "Help", href: "mailto:support@ambitt.agency" },
  ];
  return links
    .map((l) => `<a href="${l.href}" style="color:${T.mute};text-decoration:none;white-space:nowrap;">${l.label}</a>`)
    .join(`<span style="color:${T.faint};"> &middot; </span>`);
}

/**
 * Everything below the card: the reply invitation, the utility row, and the
 * wordmark. The wordmark is live text, not an image, so it survives dark mode
 * and image blocking both.
 */
export function footerRows(
  agentName: string,
  agentId: string,
  options: { systemEmail?: boolean } = {}
): string {
  const onUs = options.systemEmail
    ? `<p class="dm-mute" style="margin:10px 0 0 0;font-size:13px;color:${T.mute};">This one is on us. It doesn't count toward your monthly interactions.</p>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center" style="width:100%;max-width:600px;margin:0 auto;">
<tr><td class="px" style="padding:22px 40px 0 40px;text-align:center;">
  <p class="dm-body" style="margin:0;font-size:14px;line-height:1.6;color:${T.body};">Just reply to this email. ${agentName} reads every one.</p>
  ${onUs}
</td></tr>
<tr><td class="px" style="padding:14px 40px 0 40px;text-align:center;">
  <p class="dm-mute" style="margin:0;font-size:12.5px;line-height:2.1;color:${T.mute};">${navFooterLinks(agentName, agentId)}</p>
</td></tr>
<tr><td style="padding:16px 24px 0 24px;text-align:center;">
  <p style="margin:0;font-size:12.5px;">
    <span class="dm-mute" style="font-weight:600;color:${T.mute};">Ambitt</span><span class="dm-teal" style="font-weight:600;color:${T.tealText};"> Agents</span>
  </p>
</td></tr>
</table>`;
}

// ---------------------------------------------------------------------------
// Back-compat
// ---------------------------------------------------------------------------
// emdash.test.ts calls footerBlock directly. Kept as a thin alias so the test
// keeps covering the real footer copy.

export function footerBlock(
  agentName: string,
  agentId: string,
  options: { systemEmail?: boolean } = {}
): string {
  return footerRows(agentName, agentId, options);
}
