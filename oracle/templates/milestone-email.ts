import {
  type BaseEmailProps,
  type StatItem,
  type RecommendationItem,
  emailWrapper,
  headerBlock,
  sectionLabel,
  summaryBlock,
  statsGrid,
  recommendationsBlock,
  primaryCta,
  footerBlock,
} from "./_shared.js";

export interface MilestoneEmailProps extends BaseEmailProps {
  summary: string;
  milestoneValue: string;
  milestoneLabel: string;
  milestoneDate: string;
  currentProgress: number;
  nextMilestone: string;
  stats: StatItem[];
  recommendations: RecommendationItem[];
  ctaUrl: string;
}

export function buildMilestoneEmail(props: MilestoneEmailProps): string {
  const { agentName, agentId, productName, summary, milestoneValue, milestoneLabel, milestoneDate, currentProgress, nextMilestone, stats, recommendations, ctaUrl } = props;

  const dateFormatted = new Date(milestoneDate).toLocaleDateString("en-US", { dateStyle: "medium" });

  const header = headerBlock(agentName, productName, "Milestone", "success");

  const body = `
    <!-- Milestone Hero -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 24px 40px;">
        <p style="margin: 0; font-size: 36px; font-weight: 600; color: #16a34a;">${milestoneValue}</p>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #52525b; font-weight: 500;">${milestoneLabel}</p>
        <p style="margin: 4px 0 0 0; font-size: 11px; color: #a1a1aa;">${dateFormatted}</p>
      </div>
    </div>

    ${summaryBlock(summary)}

    <!-- Next Milestone Progress -->
    <div style="margin-bottom: 24px;">
      ${sectionLabel("Next Milestone")}
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #18181b; font-weight: 500;">${nextMilestone}</p>
      <div style="background: #f4f4f5; border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background: #16a34a; height: 8px; border-radius: 4px; width: ${Math.min(currentProgress, 100)}%;"></div>
      </div>
      <p style="margin: 4px 0 0 0; font-size: 11px; color: #a1a1aa;">${currentProgress}% progress</p>
    </div>

    ${statsGrid(stats)}

    ${recommendationsBlock(recommendations, agentId)}

    <div style="margin-top: 20px;">
      ${primaryCta("View Full Report", ctaUrl)}
    </div>
  `;

  const footer = footerBlock(agentName);
  return emailWrapper("success", header, body, footer);
}
