import type { RuntimeOutput } from "../../shared/runtime/index.js";

// ---------------------------------------------------------------------------
// Agent Response Email Template
// ---------------------------------------------------------------------------
// Structured email for all agent responses to clients.
// Clean, professional, consistent across all agents.
// ---------------------------------------------------------------------------

interface AgentResponseOptions {
  agentName: string;
  agentRole: string;
  clientBusinessName: string;
  responseBody: string;
  toolsUsed: RuntimeOutput["toolsUsed"];
}

export function buildAgentResponseEmail(options: AgentResponseOptions): string {
  const { agentName, agentRole, clientBusinessName, responseBody, toolsUsed } = options;

  const bodyHtml = responseBody
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("- ") || line.startsWith("• ")) {
        return `<li style="margin: 0 0 6px 0;">${line.slice(2)}</li>`;
      }
      return `<p style="margin: 0 0 14px 0;">${line}</p>`;
    })
    .join("");

  // Wrap list items in <ul> tags
  const wrappedHtml = bodyHtml.replace(
    /(<li[^>]*>.*?<\/li>\s*)+/g,
    (match) => `<ul style="margin: 0 0 14px 0; padding-left: 20px;">${match}</ul>`
  );

  const actionsHtml = toolsUsed.length > 0
    ? `
          <!-- Actions taken -->
          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <div style="background-color: #f0fdf4; border-radius: 8px; padding: 16px 20px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #15803d; text-transform: uppercase; letter-spacing: 0.5px;">Actions Taken</p>
                ${toolsUsed
                  .map((t) => {
                    const icon = t.success ? "✓" : "✗";
                    const color = t.success ? "#15803d" : "#dc2626";
                    return `<p style="margin: 0 0 4px 0; font-size: 13px; color: #374151;"><span style="color: ${color}; font-weight: 600;">${icon}</span> ${t.serverId} → ${t.toolName}</p>`;
                  })
                  .join("")}
              </div>
            </td>
          </tr>`
    : "";

  return `
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
                  <td style="width: 40px; vertical-align: top;">
                    <div style="width: 36px; height: 36px; background-color: #1a1a1a; border-radius: 10px; text-align: center; line-height: 36px; color: #ffffff; font-weight: 700; font-size: 15px;">${agentName[0]}</div>
                  </td>
                  <td style="padding-left: 12px; vertical-align: center;">
                    <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1a1a1a;">${agentName}</p>
                    <p style="margin: 2px 0 0 0; font-size: 12px; color: #9ca3af;">${agentRole} · ${clientBusinessName}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Response Body -->
          <tr>
            <td style="padding: 24px 40px 16px 40px; color: #374151; font-size: 15px; line-height: 1.7;">
              ${wrappedHtml}
            </td>
          </tr>

          ${actionsHtml}

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="border-top: 1px solid #f0f0f0;"></div>
            </td>
          </tr>

          <!-- Reply prompt -->
          <tr>
            <td style="padding: 20px 40px 12px 40px;">
              <p style="margin: 0; font-size: 13px; color: #6b7280;">Reply to this email to give me another task or ask a follow-up question.</p>
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding: 8px 40px 32px 40px; color: #9ca3af; font-size: 13px;">
              <p style="margin: 0;">— ${agentName}, ${agentRole} at Ambitt</p>
            </td>
          </tr>

        </table>

        <!-- Sub-footer -->
        <table role="presentation" style="max-width: 560px; margin: 16px auto 0 auto;">
          <tr>
            <td style="text-align: center; color: #d1d5db; font-size: 11px;">
              <p style="margin: 0;">Powered by <a href="https://ambitt.agency" style="color: #9ca3af; text-decoration: none;">Ambitt Agents</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
