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

interface PermissionItem {
  toolName: string;
  accessLevel: string;
  description: string;
}

export interface PermissionEmailProps extends BaseEmailProps {
  summary: string;
  permissions: PermissionItem[];
  intentSteps: Array<{ step: string }>;
  approveActionId: string;
  ctaUrl: string;
}

export function buildPermissionEmail(props: PermissionEmailProps): string {
  const { agentName, agentId, productName, summary, permissions, intentSteps, approveActionId, ctaUrl } = props;

  const header = headerBlock(agentName, productName, "Permission Request", "warning");

  const body = `
    ${summaryBlock(summary)}

    ${permissions.length > 0 ? `
    ${sectionLabel("Permissions Requested")}
    <div style="margin-bottom: 20px;">
      ${permissions.map((p) => `
      <div style="background: #f4f4f5; border-radius: 8px; padding: 14px 16px; margin-bottom: 6px;">
        <table role="presentation" style="width: 100%;">
          <tr>
            <td>
              <p style="margin: 0; font-size: 13px; font-weight: 600; color: #18181b;">${p.toolName}</p>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #52525b;">${p.description}</p>
            </td>
            <td style="text-align: right; vertical-align: top;">
              <span style="display: inline-block; font-size: 11px; font-weight: 500; color: #52525b; background: #ffffff; border: 1px solid #e4e4e7; padding: 2px 8px; border-radius: 4px;">${p.accessLevel}</span>
            </td>
          </tr>
        </table>
      </div>`).join("")}
    </div>` : ""}

    ${intentSteps.length > 0 ? `
    ${sectionLabel("What I'll Do With Access")}
    <div style="margin-bottom: 20px;">
      ${intentSteps.map((s, i) => `
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

    ${primaryCta("Grant Access", `mailto:reply-${agentId}@ambitt.agency?subject=APPROVE%20${approveActionId}`)}
    ${secondaryCta("Ask a Question", `mailto:reply-${agentId}@ambitt.agency?subject=Question%20about%20${approveActionId}`, "Deny", `mailto:reply-${agentId}@ambitt.agency?subject=DISMISS%20${approveActionId}`)}
  `;

  const footer = footerBlock(agentName);
  return emailWrapper("warning", header, body, footer);
}
