import {
  type BaseEmailProps,
  emailWrapper,
  headerBlock,
  sectionLabel,
  summaryBlock,
  primaryCta,
  footerBlock,
} from "./_shared.js";

export interface ProgressEmailProps extends BaseEmailProps {
  dayNumber: number;
  totalDays: number;
  summary: string;
  progressItems: Array<{ label: string; pct: number }>;
  needsFromClient: Array<{ item: string }>;
  ctaUrl: string;
}

export function buildProgressEmail(props: ProgressEmailProps): string {
  const { agentName, agentId, productName, dayNumber, totalDays, summary, progressItems, needsFromClient, ctaUrl } = props;

  const overallPct = Math.round((dayNumber / totalDays) * 100);

  const header = headerBlock(agentName, productName, `Day ${dayNumber} of ${totalDays}`, "active");

  const body = `
    <!-- Overall Progress Bar -->
    <div style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
        <p style="margin: 0; font-size: 12px; font-weight: 500; color: #18181b;">Overall Progress</p>
        <p style="margin: 0; font-size: 12px; font-weight: 500; color: #18181b;">${overallPct}%</p>
      </div>
      <div style="background: #f4f4f5; border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background: #16a34a; height: 8px; border-radius: 4px; width: ${overallPct}%;"></div>
      </div>
    </div>

    ${summaryBlock(summary)}

    ${progressItems.length > 0 ? `
    ${sectionLabel("Progress Details")}
    <div style="margin-bottom: 20px;">
      ${progressItems.map((item) => `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <p style="margin: 0; font-size: 13px; color: #52525b;">${item.label}</p>
          <p style="margin: 0; font-size: 13px; font-weight: 500; color: #18181b;">${item.pct}%</p>
        </div>
        <div style="background: #f4f4f5; border-radius: 4px; height: 6px; overflow: hidden;">
          <div style="background: ${item.pct >= 100 ? "#16a34a" : item.pct >= 50 ? "#3b82f6" : "#f59e0b"}; height: 6px; border-radius: 4px; width: ${Math.min(item.pct, 100)}%;"></div>
        </div>
      </div>`).join("")}
    </div>` : ""}

    ${needsFromClient.length > 0 ? `
    ${sectionLabel("Needs From You")}
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      ${needsFromClient.map((n) => `
      <div style="margin-bottom: 6px;">
        <p style="margin: 0; font-size: 13px; color: #92400e;">&#9679; ${n.item}</p>
      </div>`).join("")}
    </div>` : ""}

    ${primaryCta("View Full Progress", ctaUrl)}
  `;

  const footer = footerBlock(agentName, agentId);
  return emailWrapper("default", header, body, footer);
}
