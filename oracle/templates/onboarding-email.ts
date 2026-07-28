// ---------------------------------------------------------------------------
// Onboarding Email — "How to work with me"
// ---------------------------------------------------------------------------
// Sent 5 minutes after the welcome email. Teaches the client how to operate
// with their agent day-to-day: how to send tasks, how to share more docs,
// when scheduled runs fire, how to escalate.
//
// Body is AI-personalized by oracle/onboarding-content.ts using what the
// agent learned from the Zoom-collected business info. Template is a dumb
// renderer — it just wraps the body in the Ambitt shell.
// ---------------------------------------------------------------------------

import { navFooterLinks, signatureRoleLine } from "./_shared.js";

interface OnboardingEmailOptions {
  agentName: string;
  agentId: string;
  preferredName: string;
  clientBusinessName: string;
  /** AI-generated body — plain text with "- " bullet lines for unordered lists. */
  body: string;
}

export function buildOnboardingEmail(options: OnboardingEmailOptions): {
  subject: string;
  html: string;
} {
  const { agentName, agentId, preferredName, clientBusinessName, body } = options;

  const subject = `How to work with ${agentName}`;

  const bodyHtml = renderBody(body);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f8f8f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Agent Header -->
          <tr>
            <td style="padding: 32px 40px 0 40px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="width: 44px; vertical-align: top;">
                    <div style="width: 40px; height: 40px; background-color: #1a1a1a; border-radius: 10px; text-align: center; line-height: 40px; color: #ffffff; font-weight: 700; font-size: 17px;">${agentName[0]}</div>
                  </td>
                  <td style="padding-left: 14px;">
                    <p style="margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;">${agentName}</p>
                    <p style="margin: 3px 0 0 0; font-size: 12px; color: #9ca3af;">Working with you at ${clientBusinessName}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting + body -->
          <tr>
            <td style="padding: 24px 40px 0 40px; color: #374151; font-size: 15px; line-height: 1.7;">
              <p style="margin: 0 0 16px 0;">Hi ${preferredName},</p>
              ${bodyHtml}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <div style="border-top: 1px solid #f0f0f0;"></div>
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding: 20px 40px 8px 40px; color: #9ca3af; font-size: 13px; line-height: 1.6;">
              <p style="margin: 0;">${agentName}</p>
              <p style="margin: 2px 0 0 0;">${signatureRoleLine()}</p>
            </td>
          </tr>

          <!-- On-us note -->
          <tr>
            <td style="padding: 0 40px 12px 40px;">
              <p style="margin: 0; font-size: 12px; color: #15803d; font-style: italic;">This one is on us. It doesn't count toward your monthly interactions.</p>
            </td>
          </tr>

          <!-- Nav footer -->
          <tr>
            <td style="padding: 0 40px 24px 40px; color: #9ca3af; font-size: 11px; line-height: 1.8;">
              ${navFooterLinks(agentName, agentId)}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

/** Turn plain text with "- " bullets into basic email-safe HTML. */
function renderBody(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rendered = lines
    .map((line) => {
      if (line.startsWith("- ") || line.startsWith("• ")) {
        return `<li style="margin: 0 0 6px 0;">${line.slice(2)}</li>`;
      }
      return `<p style="margin: 0 0 14px 0;">${line}</p>`;
    })
    .join("")
    .replace(
      /(<li[^>]*>.*?<\/li>\s*)+/g,
      (match) => `<ul style="margin: 0 0 14px 0; padding-left: 20px;">${match}</ul>`
    );
  return rendered;
}
