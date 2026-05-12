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

// ---------------------------------------------------------------------------
// Credential Request email
// ---------------------------------------------------------------------------
// Sent when the agent needs a credential (password, SSN, API key, etc.) that
// it doesn't have. The handler has already created an empty 1Password item
// in the client's vault — this email links them there to fill it in.
//
// Distinct from action-required (which is for approving an action plan) and
// from permission-email (Composio OAuth tool connection). This one's the
// "go drop a secret into 1Password" UX.
//
// Visual + copy choices:
// - Header variant "info" (blue), not "warning" — this is a setup ask,
//   not a high-risk action.
// - Primary CTA label: "Open 1Password" — names the destination explicitly
//   so the client knows what happens when they click.
// - "Ask a Question" + "Skip" secondaries via mailto. Skip dismisses the
//   recommendation row; agent will ask again next time it needs the value.
// - Trust statement reinforces the security model: value lives in
//   1Password, never in Ambitt's systems, revocable any time.
// ---------------------------------------------------------------------------

export interface CredentialRequestEmailProps extends BaseEmailProps {
  /** Plain-English headline of why the agent needs the credential. */
  summary: string;
  /** What's the credential called in 1Password (matches the item title). */
  itemTitle: string;
  /** Field names the client needs to fill in (e.g. ["username", "password"]). */
  fieldTitles: string[];
  /** Direct 1Password URL for the empty item. */
  openUrl: string;
  /** Recommendation row id — used by the mailto-DISMISS reply path. */
  approveActionId: string;
}

export function buildCredentialRequestEmail(props: CredentialRequestEmailProps): string {
  const { agentName, agentId, productName, summary, itemTitle, fieldTitles, openUrl, approveActionId } = props;

  const header = headerBlock(agentName, productName, "Credential Request", "info");

  const fieldList = fieldTitles
    .map(
      (title) => `
      <div style="background: #f4f4f5; border-radius: 8px; padding: 12px 16px; margin-bottom: 6px;">
        <table role="presentation" style="width: 100%;">
          <tr>
            <td>
              <p style="margin: 0; font-size: 13px; font-weight: 600; color: #18181b;">${title}</p>
            </td>
            <td style="text-align: right; vertical-align: top;">
              <span style="display: inline-block; font-size: 11px; font-weight: 500; color: #52525b; background: #ffffff; border: 1px solid #e4e4e7; padding: 2px 8px; border-radius: 4px;">empty &middot; needs your input</span>
            </td>
          </tr>
        </table>
      </div>`
    )
    .join("");

  const body = `
    ${summaryBlock(summary)}

    ${sectionLabel(`Fields to fill in "${itemTitle}"`)}
    <div style="margin-bottom: 20px;">
      ${fieldList}
    </div>

    ${sectionLabel("How this works")}
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
      <p style="margin: 0 0 6px 0; font-size: 13px; color: #1e3a8a; line-height: 1.6;">
        I created an empty item in your 1Password vault titled <strong>"${itemTitle}"</strong>. Click the button below to open it directly in 1Password &mdash; fill in the fields and save, then I'll be able to use them on the next task.
      </p>
      <p style="margin: 0; font-size: 12px; color: #3b82f6; line-height: 1.6;">
        Your secret stays in your 1Password vault. I read it from there only at the moment I'm filling in a form for you. You can revoke access any time by editing or deleting the item.
      </p>
    </div>

    ${primaryCta("Open 1Password", openUrl)}
    ${secondaryCta(
      "Ask a Question",
      `mailto:reply-${agentId}@ambitt.agency?subject=Question%20about%20${approveActionId}`,
      "Skip",
      `mailto:reply-${agentId}@ambitt.agency?subject=DISMISS%20${approveActionId}`
    )}
  `;

  const footer = footerBlock(agentName, agentId);
  return emailWrapper("default", header, body, footer);
}
