import {
  T,
  type BaseEmailProps,
  type SourceLink,
  emailDocument,
  section,
  letterhead,
  h2,
  paragraph,
  dataTable,
  portalInvite,
  sourceLinksBlock,
  divider,
  signature,
  footerRows,
  signatureRoleLine,
} from "./_shared.js";
import { portalLink } from "../../shared/portal-links.js";

// ---------------------------------------------------------------------------
// Alert — something moved and the client should know now
// ---------------------------------------------------------------------------
// Amber, not red. Red is for "we broke" (error-email). An alert is a heads-up,
// and half of them are good news, so a blood-red banner was always the wrong
// read. The number gets to be big because the number IS the message.
// ---------------------------------------------------------------------------

interface CheckItem {
  signal: string;
  status: string;
  statusType: "ok" | "warn" | "critical";
}

export interface AlertEmailProps extends BaseEmailProps {
  summary: string;
  metricValue: string;
  metricLabel: string;
  metricDelta: string;
  detectedAt: string;
  checksTable: CheckItem[];
  sourceLinks: SourceLink[];
  ctaUrl: string;
  agentRole?: string;
}

export function buildAlertEmail(props: AlertEmailProps): string {
  const {
    agentName,
    agentId,
    summary,
    metricValue,
    metricLabel,
    metricDelta,
    detectedAt,
    checksTable,
    sourceLinks,
    ctaUrl,
    agentRole,
  } = props;

  const statusColor: Record<CheckItem["statusType"], string> = {
    ok: T.tealText,
    warn: T.attention,
    critical: T.problem,
  };
  // Dark-mode counterparts, so a reading keeps its meaning after inversion.
  const statusClass: Record<CheckItem["statusType"], string> = {
    ok: "dm-ok",
    warn: "dm-warn",
    critical: "dm-bad",
  };

  const detected = new Date(detectedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const rows = [
    section(
      letterhead({
        agentName,
        roleLine: signatureRoleLine(agentRole),
        chipLabel: "Heads up",
        tone: "attention",
      }),
      30,
      0
    ),

    // The headline number. One big figure, its label, and the move.
    section(
      `<p class="h1 dm-ink" style="margin:0;font-size:40px;line-height:1.05;font-weight:600;color:${T.ink};letter-spacing:-0.028em;font-variant-numeric:tabular-nums;">${metricValue}</p>
<p class="dm-body" style="margin:8px 0 0 0;font-size:16px;line-height:1.45;color:${T.body};">${metricLabel}</p>
<p style="margin:4px 0 0 0;font-size:15px;line-height:1.45;font-weight:600;color:${T.attention};">${metricDelta}</p>`,
      26,
      0
    ),

    section(paragraph(summary), 22, 0),

    checksTable.length > 0
      ? section(
          h2("What I checked") +
            dataTable(
              ["Signal", "Reading"],
              checksTable.map((c) => ({
                columns: [
                  c.signal,
                  `<span class="${statusClass[c.statusType]}" style="color:${statusColor[c.statusType]};font-weight:500;">${c.status}</span>`,
                ],
              }))
            ),
          10,
          0
        )
      : "",

    section(
      `<p class="dm-mute" style="margin:0;font-size:13px;color:${T.mute};">Spotted ${detected}</p>`,
      16,
      0
    ),

    sourceLinks.length > 0 ? section(sourceLinksBlock(sourceLinks), 14, 0) : "",

    section(
      portalInvite(
        "The full history behind this reading is in your portal.",
        "See the detail",
        ctaUrl || portalLink(agentId, "overview")
      ),
      18,
      0
    ),

    section(divider(26, 22) + signature(agentName, agentRole), 0, 32),
  ].join("");

  return emailDocument({
    preheader: `${metricLabel}: ${metricValue}, ${metricDelta}`,
    tone: "attention",
    rows,
    outerRows: footerRows(agentName, agentId),
  });
}
