import {
  T,
  type BaseEmailProps,
  emailDocument,
  section,
  letterhead,
  h2,
  paragraph,
  progressBar,
  panel,
  bullets,
  portalInvite,
  divider,
  signature,
  footerRows,
  signatureRoleLine,
} from "./_shared.js";
import { portalLink } from "../../shared/portal-links.js";

// ---------------------------------------------------------------------------
// Progress — "here's where setup has got to"
// ---------------------------------------------------------------------------
// The old version used `display:flex` for its label/percentage rows, which
// simply does not exist in Outlook, so the layout collapsed. Everything here is
// nested tables via progressBar().
//
// "Needs from you" is the only part the client has to act on, so it's the only
// part carrying colour.
// ---------------------------------------------------------------------------

export interface ProgressEmailProps extends BaseEmailProps {
  dayNumber: number;
  totalDays: number;
  summary: string;
  progressItems: Array<{ label: string; pct: number }>;
  needsFromClient: Array<{ item: string }>;
  ctaUrl: string;
  agentRole?: string;
}

export function buildProgressEmail(props: ProgressEmailProps): string {
  const {
    agentName,
    agentId,
    dayNumber,
    totalDays,
    summary,
    progressItems,
    needsFromClient,
    ctaUrl,
    agentRole,
  } = props;

  const overallPct = Math.round((dayNumber / totalDays) * 100);

  const rows = [
    section(
      letterhead({
        agentName,
        roleLine: signatureRoleLine(agentRole),
        chipLabel: `Day ${dayNumber} of ${totalDays}`,
      }),
      30,
      0
    ),

    section(paragraph(summary), 24, 4),

    section(progressBar(overallPct, "Overall") , 8, 4),

    progressItems.length > 0
      ? section(
          h2("Where each piece is") +
            progressItems
              .map(
                (i) =>
                  `<div style="margin:0 0 16px 0;">${progressBar(i.pct, i.label)}</div>`
              )
              .join(""),
          22,
          0
        )
      : "",

    needsFromClient.length > 0
      ? section(
          panel(
            `<p class="dm-ink" style="margin:0 0 10px 0;font-size:16px;font-weight:600;color:${T.ink};">The only bits I need from you</p>` +
              bullets(needsFromClient.map((n) => n.item)),
            "attention"
          ),
          14,
          0
        )
      : "",

    section(
      portalInvite(
        "You can watch this fill in from your portal as it goes.",
        "Check on setup",
        ctaUrl || portalLink(agentId, "overview")
      ),
      18,
      0
    ),

    section(divider(26, 22) + signature(agentName, agentRole), 0, 32),
  ].join("");

  return emailDocument({
    preheader: `Day ${dayNumber} of ${totalDays}. ${summary.slice(0, 100)}`,
    tone: "brand",
    rows,
    outerRows: footerRows(agentName, agentId),
  });
}
