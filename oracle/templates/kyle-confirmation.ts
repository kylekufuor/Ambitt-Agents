import type { ParsedLead } from "../lead-agent.js";

export function buildKyleConfirmation(lead: ParsedLead, emailBody: string, emailId: string): string {
  const bodyPreview = emailBody.split("\n").filter(Boolean).map((p) => `<p style="margin: 0 0 8px 0; color: #6b7280;">${p}</p>`).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background-color: #f8f8f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 32px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px;">
              <p style="margin: 0; font-size: 13px; color: #22c55e; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">✓ Email Sent</p>
              <h2 style="margin: 8px 0 0 0; font-size: 20px; color: #1a1a1a; font-weight: 700;">
                ${lead.prospectName}
              </h2>
              <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">
                ${lead.businessName} · ${lead.businessType}
              </p>
            </td>
          </tr>

          <!-- Lead Details -->
          <tr>
            <td style="padding: 0 32px 20px 32px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #f9fafb; border-radius: 8px;">
                    <table role="presentation" style="width: 100%;">
                      ${detailRow("Sent to", lead.prospectEmail ?? "—")}
                      ${detailRow("Business", `${lead.businessName} (${lead.businessType})`)}
                      ${lead.businessSize ? detailRow("Size", lead.businessSize) : ""}
                      ${detailRow("Pain point", lead.painPoint)}
                      ${detailRow("Use case", lead.proposedUseCase)}
                      ${lead.location ? detailRow("Location", lead.location) : ""}
                      ${lead.meetingContext ? detailRow("Met at", lead.meetingContext) : ""}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Email Preview -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <p style="margin: 0 0 12px 0; font-size: 12px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">What they received</p>
              <div style="padding: 16px; background-color: #fafafa; border-radius: 8px; border-left: 3px solid #e5e7eb; font-size: 13px; line-height: 1.6;">
                ${bodyPreview}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px 24px 32px; border-top: 1px solid #f0f0f0; color: #d1d5db; font-size: 11px;">
              <p style="margin: 0;">Email ID: ${emailId} · Sent via Ambitt Lead Agent</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildKyleNeedEmail(lead: ParsedLead, leadId: string, oracleUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background-color: #f8f8f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 32px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <tr>
            <td style="padding: 28px 32px 20px 32px;">
              <p style="margin: 0; font-size: 13px; color: #f59e0b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">⏳ Need Email Address</p>
              <h2 style="margin: 8px 0 0 0; font-size: 20px; color: #1a1a1a; font-weight: 700;">
                ${lead.prospectName}
              </h2>
              <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">
                ${lead.businessName} · ${lead.businessType}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 32px 16px 32px;">
              <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0;">
                Lead captured but no email found in your brief. Send the email and I'll fire the intro immediately.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 32px 12px 32px;">
              <p style="color: #9ca3af; font-size: 13px; margin: 0;">
                <strong>Pain point:</strong> ${lead.painPoint}<br/>
                <strong>Use case:</strong> ${lead.proposedUseCase}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <div style="padding: 16px; background-color: #fffbeb; border-radius: 8px; border: 1px solid #fef3c7;">
                <p style="margin: 0; color: #92400e; font-size: 13px; font-weight: 600;">How to send the email:</p>
                <p style="margin: 8px 0 0 0; color: #78716c; font-size: 13px; line-height: 1.5;">
                  Use your iPhone Shortcut or run:<br/>
                  <code style="background: #fef9ee; padding: 2px 6px; border-radius: 4px; font-size: 12px;">
                    curl -X POST ${oracleUrl}/lead/email -H "Authorization: Bearer $LEAD_API_KEY" -H "Content-Type: application/json" -d '{"leadId":"${leadId}","email":"their@email.com"}'
                  </code>
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 16px 32px 24px 32px; border-top: 1px solid #f0f0f0; color: #d1d5db; font-size: 11px;">
              <p style="margin: 0;">Lead ID: ${leadId} · Ambitt Lead Agent</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 4px 0; font-size: 12px; color: #9ca3af; width: 90px; vertical-align: top;">${label}</td>
      <td style="padding: 4px 0; font-size: 13px; color: #374151;">${value}</td>
    </tr>`;
}
