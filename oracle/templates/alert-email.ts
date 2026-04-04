import {
  type BaseEmailProps,
  type SourceLink,
  emailWrapper,
  headerBlock,
  sectionLabel,
  summaryBlock,
  sourceLinksBlock,
  primaryCta,
  footerBlock,
  badge,
} from "./_shared.js";

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
}

export function buildAlertEmail(props: AlertEmailProps): string {
  const { agentName, productName, summary, metricValue, metricLabel, metricDelta, detectedAt, checksTable, sourceLinks, ctaUrl } = props;

  const statusColors: Record<string, string> = { ok: "#16a34a", warn: "#f59e0b", critical: "#dc2626" };
  const statusIcons: Record<string, string> = { ok: "&#10003;", warn: "&#9888;", critical: "&#10007;" };

  const detected = new Date(detectedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  const header = headerBlock(agentName, productName, "Alert", "alert");

  const body = `
    ${summaryBlock(summary)}

    <!-- Alert Metric -->
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 32px; font-weight: 600; color: #dc2626;">${metricValue}</p>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #71717a;">${metricLabel}</p>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #dc2626; font-weight: 500;">${metricDelta}</p>
    </div>

    <p style="margin: 0 0 16px 0; font-size: 11px; color: #a1a1aa;">Detected ${detected}</p>

    ${checksTable.length > 0 ? `
    ${sectionLabel("System Checks")}
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      ${checksTable.map((c) => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f4f4f5; font-size: 13px; color: #52525b;">${c.signal}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f4f4f5; text-align: right;">
          <span style="color: ${statusColors[c.statusType]}; font-size: 12px; font-weight: 500;">${statusIcons[c.statusType]} ${c.status}</span>
        </td>
      </tr>`).join("")}
    </table>` : ""}

    ${sourceLinksBlock(sourceLinks)}

    ${primaryCta("View Full Details", ctaUrl, "alert")}
  `;

  const footer = footerBlock(agentName);
  return emailWrapper("alert", header, body, footer);
}
