import {
  type BaseEmailProps,
  type SourceLink,
  emailWrapper,
  headerBlock,
  sectionLabel,
  summaryBlock,
  sourceLinksBlock,
  primaryCta,
  secondaryCta,
  footerBlock,
} from "./_shared.js";

export interface ErrorEmailProps extends BaseEmailProps {
  summary: string;
  errorCode: string;
  errorMessage: string;
  errorTime: string;
  recoverySteps: Array<{ step: string }>;
  sourceLinks: SourceLink[];
  retryActionId: string;
  ctaUrl: string;
}

export function buildErrorEmail(props: ErrorEmailProps): string {
  const { agentName, agentId, productName, summary, errorCode, errorMessage, errorTime, recoverySteps, sourceLinks, retryActionId, ctaUrl } = props;

  const errorTimeFormatted = new Date(errorTime).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  const header = headerBlock(agentName, productName, "Error", "alert");

  const body = `
    ${summaryBlock(summary)}

    <!-- Error Block -->
    <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 20px; font-family: 'SF Mono', 'Fira Code', monospace;">
      <p style="margin: 0 0 4px 0; font-size: 11px; color: #fca5a5; font-weight: 600;">${errorCode}</p>
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #e4e4e7; line-height: 1.6;">${errorMessage}</p>
      <p style="margin: 0; font-size: 11px; color: #71717a;">${errorTimeFormatted}</p>
    </div>

    ${recoverySteps.length > 0 ? `
    ${sectionLabel("Recovery Steps")}
    <div style="margin-bottom: 20px;">
      ${recoverySteps.map((s, i) => `
      <div style="margin-bottom: 8px;">
        <table role="presentation" style="width: 100%;">
          <tr>
            <td style="width: 28px; vertical-align: top;">
              <div style="width: 24px; height: 24px; background: #f4f4f5; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; color: #52525b;">${i + 1}</div>
            </td>
            <td style="vertical-align: top; padding-top: 2px;">
              <p style="margin: 0; font-size: 13px; color: #52525b; line-height: 1.75;">${s.step}</p>
            </td>
          </tr>
        </table>
      </div>`).join("")}
    </div>` : ""}

    ${sourceLinksBlock(sourceLinks)}

    ${primaryCta("Retry Now", `mailto:reply-${agentId}@ambitt.agency?subject=RETRY%20${retryActionId}`, "alert")}
    ${secondaryCta("View Logs", ctaUrl, "Dismiss", `mailto:reply-${agentId}@ambitt.agency?subject=DISMISS%20${retryActionId}`)}
  `;

  const footer = footerBlock(agentName);
  return emailWrapper("alert", header, body, footer);
}
