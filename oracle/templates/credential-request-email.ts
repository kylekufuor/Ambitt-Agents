import { navFooterLinks } from "./_shared.js";

// ---------------------------------------------------------------------------
// Credential Request email — conversational design
// ---------------------------------------------------------------------------
// Standalone template (does NOT use the dark-header _shared.ts primitives).
// Built for a warm, "real coworker email" feel rather than the formal
// system look of alerts/digests. Other interactive-setup emails (permission
// request, action required) should adopt this design in a follow-up pass.
//
// Visual tokens:
//   - Outer bg:       #f5f3ed (warm beige)
//   - Card bg:        #ffffff with subtle #e5e5e5 border, 12px radius
//   - Avatar:         48px circle, light-blue bg, navy initial
//   - Status pill:    light-blue bg, navy text, pill shape
//   - Headline:       24px, near-black
//   - Inline box:     beige (#f5f3ed), numbered list
//   - Primary CTA:    full-width black, white text
//   - Secondary:      50/50 outlined buttons
//   - Footer:         small muted, inline links with dot separators
// ---------------------------------------------------------------------------

export interface CredentialRequestEmailProps {
  agentName: string;
  agentId: string;
  /** One-sentence headline — what the agent needs and why, e.g. "I need your LinkedIn login". */
  headline: string;
  /** Conversational body paragraph following the headline. */
  body: string;
  /** Direct 1Password URL the primary CTA opens. */
  openUrl: string;
  /** Recommendation row id — used by the mailto Skip reply. */
  approveActionId: string;
  /** Optional 3-step "how this works" override; defaults to a sensible standard. */
  steps?: string[];
}

export function buildCredentialRequestEmail(props: CredentialRequestEmailProps): string {
  const { agentName, agentId, headline, body, openUrl, approveActionId } = props;
  const steps = props.steps ?? [
    "Click the button — opens a pre-made item in your 1Password vault.",
    "Fill in the fields, save.",
    "I'll pick it up on the next task. Revoke any time by deleting the item.",
  ];

  const initial = (agentName.charAt(0) || "A").toUpperCase();
  const askLink = `mailto:reply-${agentId}@ambitt.agency?subject=${encodeURIComponent(`Question for ${agentName}`)}`;
  const skipLink = `mailto:reply-${agentId}@ambitt.agency?subject=${encodeURIComponent(`DISMISS ${approveActionId}`)}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${agentName} — ${headline}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3ed; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f3ed;">
    <tr>
      <td style="padding: 40px 20px;">
        <!-- Card -->
        <table role="presentation" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e7e5e0; border-radius: 14px; overflow: hidden;">

          <!-- Header row: avatar + name/subtitle + status pill -->
          <tr>
            <td style="padding: 24px 28px 20px 28px; border-bottom: 1px solid #f0eee8;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="width: 56px; vertical-align: middle;">
                    <div style="width: 48px; height: 48px; background-color: #dbeafe; border-radius: 50%; text-align: center; line-height: 48px; color: #1e3a8a; font-weight: 600; font-size: 18px;">${initial}</div>
                  </td>
                  <td style="vertical-align: middle; padding-left: 12px;">
                    <p style="margin: 0; font-size: 16px; font-weight: 600; color: #111;">${agentName}</p>
                    <p style="margin: 2px 0 0 0; font-size: 13px; color: #6b7280;">Your Ambitt agent</p>
                  </td>
                  <td style="text-align: right; vertical-align: middle;">
                    <span style="display: inline-block; background-color: #dbeafe; color: #1e3a8a; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 500;">Action needed</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 28px 8px 28px;">
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 600; color: #111; line-height: 1.3;">${headline}</h1>
              <p style="margin: 0 0 20px 0; font-size: 15px; color: #444; line-height: 1.6;">${body}</p>

              <!-- How this works box -->
              <div style="background-color: #f5f3ed; border-radius: 10px; padding: 18px 22px; margin-bottom: 24px;">
                <p style="margin: 0 0 10px 0; font-size: 11px; font-weight: 600; color: #6b7280; letter-spacing: 0.8px; text-transform: uppercase;">How this works</p>
                <ol style="margin: 0; padding-left: 18px; color: #1a1a1a; font-size: 14px; line-height: 1.7;">
                  ${steps.map((s) => `<li style="margin-bottom: 4px;">${s}</li>`).join("")}
                </ol>
              </div>

              <!-- Primary CTA -->
              <a href="${openUrl}" style="display: block; background-color: #111; color: #ffffff; text-align: center; padding: 14px 20px; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none; margin-bottom: 10px;">
                Open 1Password
              </a>

              <!-- Secondary row -->
              <table role="presentation" style="width: 100%; border-collapse: separate; border-spacing: 8px 0;">
                <tr>
                  <td style="width: 50%;">
                    <a href="${askLink}" style="display: block; background-color: #ffffff; color: #1a1a1a; text-align: center; padding: 12px 16px; border-radius: 10px; font-size: 14px; font-weight: 500; text-decoration: none; border: 1px solid #d4d4d8;">
                      Ask ${agentName} a question
                    </a>
                  </td>
                  <td style="width: 50%;">
                    <a href="${skipLink}" style="display: block; background-color: #ffffff; color: #1a1a1a; text-align: center; padding: 12px 16px; border-radius: 10px; font-size: 14px; font-weight: 500; text-decoration: none; border: 1px solid #d4d4d8;">
                      Skip for now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer (inside card, subtle) -->
          <tr>
            <td style="padding: 22px 28px 22px 28px;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.6;">
                Reply to this email to chat with ${agentName}.
              </p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #9ca3af; line-height: 1.8;">
                ${navFooterLinks(agentName, agentId)}
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}
