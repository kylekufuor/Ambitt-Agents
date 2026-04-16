import {
  type BaseEmailProps,
  type StatItem,
  type SourceLink,
  type RecommendationItem,
  emailWrapper,
  headerBlock,
  sectionLabel,
  summaryBlock,
  statsGrid,
  sourceLinksBlock,
  recommendationsBlock,
  primaryCta,
  footerBlock,
  badge,
} from "./_shared.js";

interface TaskRow {
  task: string;
  output: string;
  status: string;
  statusType: "done" | "progress" | "warn";
}

export interface DigestEmailProps extends BaseEmailProps {
  periodLabel: string;
  summary: string;
  stats: StatItem[];
  tasksTable: TaskRow[];
  sourceLinks: SourceLink[];
  recommendations: RecommendationItem[];
  ctaUrl: string;
}

export function buildDigestEmail(props: DigestEmailProps): string {
  const { agentName, agentId, productName, periodLabel, summary, stats, tasksTable, sourceLinks, recommendations, ctaUrl } = props;

  const taskStatusColors: Record<string, string> = { done: "#16a34a", progress: "#3b82f6", warn: "#f59e0b" };
  const taskStatusIcons: Record<string, string> = { done: "&#10003;", progress: "&#8635;", warn: "&#9888;" };

  const header = `
<table role="presentation" style="width: 100%;">
  <tr>
    <td>
      <p style="margin: 0 0 2px 0; font-size: 14px; font-weight: 600; color: #ffffff;">${agentName}</p>
      <p style="margin: 0; font-size: 12px; color: #a1a1aa;">${productName}</p>
    </td>
    <td style="text-align: right; vertical-align: top;">
      ${badge(periodLabel, "info")}
    </td>
  </tr>
</table>`;

  const body = `
    ${summaryBlock(summary)}

    ${statsGrid(stats)}

    ${tasksTable.length > 0 ? `
    ${sectionLabel("Tasks This Period")}
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        <th style="padding: 8px 0; text-align: left; border-bottom: 2px solid #e4e4e7; font-size: 10px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">Task</th>
        <th style="padding: 8px 0; text-align: left; border-bottom: 2px solid #e4e4e7; font-size: 10px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">Output</th>
        <th style="padding: 8px 0; text-align: right; border-bottom: 2px solid #e4e4e7; font-size: 10px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
      </tr>
      ${tasksTable.map((t) => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f4f4f5; font-size: 13px; color: #18181b; font-weight: 500;">${t.task}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f4f4f5; font-size: 13px; color: #52525b;">${t.output}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f4f4f5; text-align: right;">
          <span style="color: ${taskStatusColors[t.statusType]}; font-size: 12px;">${taskStatusIcons[t.statusType]} ${t.status}</span>
        </td>
      </tr>`).join("")}
    </table>` : ""}

    ${sourceLinksBlock(sourceLinks)}

    ${recommendationsBlock(recommendations, agentId)}

    <div style="margin-top: 20px;">
      ${primaryCta("View Full Report", ctaUrl)}
    </div>
  `;

  const footer = footerBlock(agentName, agentId);
  return emailWrapper("default", header, body, footer);
}
