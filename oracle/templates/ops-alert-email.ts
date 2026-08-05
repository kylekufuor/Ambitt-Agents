import {
  emailDocument,
  section,
  statusChip,
  h1,
  paragraph,
  divider,
  panel,
  button,
  type Tone,
} from "./_shared.js";

/* ---------------------------------------------------------------------------
   Operator alerts — the two shapes Kyle picked.

   These are the ONLY emails in the system written for us rather than for a
   client, and until now they were not written at all: fleet health arrived as
   a plain-text WhatsApp string that fell back to email, so it landed as a
   warning emoji and three lines of monospace-ish body copy in Gmail. It looked
   like a cron job talking to itself, which is exactly what it was.

   Two shapes, because operator mail has two jobs:

     A — the one-line verdict. ONE thing is true and you need to know it. The
         subject and the first line say the whole thing; everything under it is
         evidence for that sentence. Does not scale past a couple of facts, and
         is not meant to.

     B — the status board. SEVERAL things are true at once. Every agent on a
         row, problems floated to the top, state carried by a word as well as a
         colour. Scales to a fleet of thirty, where A would become a wall.

   Both inherit the client email design system rather than inventing an ops
   one: the same card, rail, dark-mode handling and type. An operator alert
   that looks unlike the product is a second design to maintain and a worse
   first impression when it gets forwarded.
   --------------------------------------------------------------------------- */

/** How bad is it? Drives the rail colour, the chip and nothing else. */
export type AlertSeverity = "problem" | "attention" | "good";

const SEVERITY_TONE: Record<AlertSeverity, Tone> = {
  problem: "problem",
  attention: "attention",
  good: "good",
};

/** A label/value pair under the verdict. Kept to four; past that, use a digest. */
export interface AlertFact {
  label: string;
  value: string;
}

export interface OpsAlertProps {
  severity: AlertSeverity;
  /** Chip text. Short. "Needs attention", "All clear", "Stopped". */
  chip: string;
  /** When it happened, already formatted for a human. */
  timestamp: string;
  /**
   * The verdict, as a full sentence with a full stop. This is the email.
   * "Atlas has not run in 6 days." — not "Stale agent detected".
   */
  headline: string;
  /** One or two sentences of context. What it means and what else is true. */
  body: string;
  facts?: AlertFact[];
  cta?: { label: string; url: string };
  /** Why this arrived. Always present: an alert you cannot turn off is a trap. */
  whyLine: string;
}

/** Label/value rows. A table, because this has to survive Outlook. */
function factRows(facts: AlertFact[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
${facts
  .map(
    (f, i) => `<tr>
  <td class="dm-mute" style="padding:${i === 0 ? "0" : "10px"} 16px 0 0;font-size:13px;color:#5b6b72;white-space:nowrap;vertical-align:top;">${f.label}</td>
  <td class="dm-ink" align="right" style="padding:${i === 0 ? "0" : "10px"} 0 0 0;font-size:14px;font-weight:600;color:#1b3139;text-align:right;vertical-align:top;">${f.value}</td>
</tr>`
  )
  .join("")}
</table>`;
}

/**
 * OPTION A — the one-line verdict.
 *
 * The headline carries the whole message so it survives being read as a
 * notification preview and nothing else. Facts sit in a wash panel under it as
 * evidence, not as the point.
 */
export function buildOpsAlertEmail(props: OpsAlertProps): string {
  const tone = SEVERITY_TONE[props.severity];

  const head = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
<tr>
  <td valign="middle" style="vertical-align:middle;">${statusChip(props.chip, tone)}</td>
  <td align="right" valign="middle" class="dm-mute" style="text-align:right;vertical-align:middle;font-size:13px;color:#5b6b72;">${props.timestamp}</td>
</tr>
</table>`;

  const rows = [
    section(head, 28, 20),
    section(h1(props.headline) + paragraph(props.body), 0, props.facts?.length ? 20 : 24),
    props.facts?.length ? section(panel(factRows(props.facts)), 0, 24) : "",
    props.cta ? section(button(props.cta.label, props.cta.url), 0, 28) : "",
    section(divider(0, 18) + whyBlock(props.whyLine), 0, 28),
  ].join("");

  return emailDocument({
    // The preheader repeats the verdict on purpose: in a list of notifications
    // the subject and preheader are often all that gets read.
    preheader: props.headline,
    tone,
    rows,
  });
}

function whyBlock(line: string): string {
  return `<p class="dm-mute" style="margin:0;font-size:12.5px;line-height:1.5;color:#5b6b72;">${line}</p>`;
}

/** One agent's line on the status board. */
export interface FleetRow {
  name: string;
  /** The quiet qualifier after the name: a client, or what the agent is for. */
  context: string;
  /** "Stale 6 days", "Running", "Paused by you". A word, not just a colour. */
  state: string;
  severity: AlertSeverity;
}

export interface FleetDigestProps {
  /** "Fleet health · Mon 3 Aug" */
  title: string;
  /** The verdict for the whole fleet. "One agent needs you." */
  headline: string;
  rows: FleetRow[];
  cta?: { label: string; url: string };
  whyLine: string;
}

const DOT: Record<AlertSeverity, string> = {
  problem: "#e05070",
  attention: "#e0932f",
  good: "#3d9e63",
};

/** Severity order for sorting: problems first, healthy last. */
const RANK: Record<AlertSeverity, number> = { problem: 0, attention: 1, good: 2 };

/**
 * OPTION B — the status board.
 *
 * Rows are sorted by severity, not by name. On a fleet of thirty the two that
 * need you must be the two you see first, and alphabetical order actively
 * hides them.
 *
 * State is a WORD as well as a dot. Colour alone fails for the ~8% of men with
 * a colour vision deficiency, and fails again in any client that strips
 * backgrounds.
 */
export function buildFleetDigestEmail(props: FleetDigestProps): string {
  const sorted = [...props.rows].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const worst: AlertSeverity = sorted[0]?.severity ?? "good";
  const tone = SEVERITY_TONE[worst];

  const board = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
${sorted
  .map(
    (r, i) => `<tr>
  <td width="10" valign="middle" style="width:10px;vertical-align:middle;padding:${i === 0 ? "0" : "12px"} 0 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="8" height="8" bgcolor="${DOT[r.severity]}" style="width:8px;height:8px;background-color:${DOT[r.severity]};border-radius:8px;line-height:8px;font-size:0;">&nbsp;</td>
    </tr></table>
  </td>
  <td valign="middle" style="vertical-align:middle;padding:${i === 0 ? "0" : "12px"} 0 0 12px;">
    <span class="dm-ink" style="font-size:15px;font-weight:600;color:#1b3139;">${r.name}</span>
    <span class="dm-mute" style="font-size:13px;color:#5b6b72;"> · ${r.context}</span>
  </td>
  <td align="right" valign="middle" style="text-align:right;vertical-align:middle;padding:${i === 0 ? "0" : "12px"} 0 0 12px;">
    <span class="dm-body" style="font-size:13px;font-weight:600;color:${r.severity === "good" ? "#5b6b72" : DOT[r.severity]};white-space:nowrap;">${r.state}</span>
  </td>
</tr>`
  )
  .join("")}
</table>`;

  const rows = [
    section(
      `<p class="dm-mute" style="margin:0;font-size:13px;font-weight:600;color:#5b6b72;letter-spacing:0.02em;">${props.title}</p>`,
      28,
      14
    ),
    section(h1(props.headline), 0, 22),
    section(panel(board), 0, props.cta ? 24 : 28),
    props.cta ? section(button(props.cta.label, props.cta.url), 0, 28) : "",
    section(divider(0, 18) + whyBlock(props.whyLine), 0, 28),
  ].join("");

  return emailDocument({ preheader: props.headline, tone, rows });
}
