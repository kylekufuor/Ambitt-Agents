import type { ParsedLead } from "../lead-agent.js";

export function buildProspectEmail(lead: ParsedLead, body: string, calendlyUrl: string): string {
  const firstName = lead.prospectName.split(" ")[0];
  const bodyHtml = body.split("\n").filter(Boolean).map((p) => `<p style="margin: 0 0 16px 0;">${p}</p>`).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ambitt Agents</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f8f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 0 40px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td>
                    <div style="display: inline-block; width: 32px; height: 32px; background-color: #1a1a1a; border-radius: 8px; text-align: center; line-height: 32px; color: #ffffff; font-weight: 700; font-size: 14px;">A</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 40px 16px 40px; color: #374151; font-size: 15px; line-height: 1.7;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 8px 40px 32px 40px;">
              <a href="${calendlyUrl}" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                Book a 15-Minute Demo
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="border-top: 1px solid #f0f0f0;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 32px 40px; color: #9ca3af; font-size: 13px; line-height: 1.6;">
              <p style="margin: 0;">Kyle Kufuor · Founder, Ambitt Agents</p>
              <p style="margin: 4px 0 0 0;">
                <a href="https://ambitt.agency" style="color: #6b7280; text-decoration: none;">ambitt.agency</a>
              </p>
            </td>
          </tr>

        </table>

        <!-- Sub-footer -->
        <table role="presentation" style="max-width: 560px; margin: 16px auto 0 auto;">
          <tr>
            <td style="text-align: center; color: #d1d5db; font-size: 11px; line-height: 1.5;">
              <p style="margin: 0;">Ambitt Agents — AI that works like your best employee</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
