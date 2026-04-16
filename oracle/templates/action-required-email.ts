import {
  type BaseEmailProps,
  emailWrapper,
  headerBlock,
  sectionLabel,
  summaryBlock,
  primaryCta,
  secondaryCta,
  footerBlock,
} from "./_shared.js";

export interface ActionRequiredEmailProps extends BaseEmailProps {
  summary: string;
  actionSteps: Array<{ step: string }>;
  reasoning: string;
  impactStatement: string;
  approveActionId: string;
  ctaUrl: string;
}

export function buildActionRequiredEmail(props: ActionRequiredEmailProps): string {
  const { agentName, agentId, productName, summary, actionSteps, reasoning, impactStatement, approveActionId, ctaUrl } = props;

  const header = headerBlock(agentName, productName, "Action Required", "warning");

  const body = `
    ${summaryBlock(summary)}

    ${sectionLabel("What I'll Do")}
    <div style="margin-bottom: 20px;">
      ${actionSteps.map((s, i) => `
      <div style="display: flex; margin-bottom: 8px;">
        <div style="min-width: 24px; height: 24px; background: #f4f4f5; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; color: #52525b; margin-right: 10px;">${i + 1}</div>
        <p style="margin: 0; font-size: 13px; color: #52525b; line-height: 1.75; padding-top: 2px;">${s.step}</p>
      </div>`).join("")}
    </div>

    ${sectionLabel("Why")}
    <p style="margin: 0 0 20px 0; font-size: 13px; color: #52525b; line-height: 1.75;">${reasoning}</p>

    <!-- Impact Warning -->
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 12px; color: #92400e; font-weight: 500;">&#9888; ${impactStatement}</p>
    </div>

    ${primaryCta("Approve This Action", `mailto:reply-${agentId}@ambitt.agency?subject=APPROVE%20${approveActionId}`)}
    ${secondaryCta("Ask a Question", `mailto:reply-${agentId}@ambitt.agency?subject=Question%20about%20${approveActionId}`, "Dismiss", `mailto:reply-${agentId}@ambitt.agency?subject=DISMISS%20${approveActionId}`)}
  `;

  const footer = footerBlock(agentName, agentId);
  return emailWrapper("warning", header, body, footer);
}
