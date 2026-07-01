import type { RuntimeOutput } from "../../shared/runtime/index.js";
import { navFooterLinks, AGENT_AVATAR_URL } from "./_shared.js";

// ---------------------------------------------------------------------------
// Agent Response Email Template
// ---------------------------------------------------------------------------
// Structured email for all agent responses to clients.
// Clean, professional, consistent across all agents.
// Supports optional data sections: stats, tables, source links, recommendations.
// ---------------------------------------------------------------------------

interface AgentResponseOptions {
  agentName: string;
  agentId: string;
  agentRole: string;
  clientBusinessName: string;
  responseBody: string;
  toolsUsed: RuntimeOutput["toolsUsed"];
  stats?: Array<{ value: string; label: string; delta: string; deltaType: "up" | "down" }>;
  tableHeaders?: string[];
  tableRows?: Array<{ columns: string[] }>;
  sourceLinks?: Array<{ label: string; url: string; color: string }>;
  recommendations?: Array<{
    title: string;
    description: string;
    reasoning: string;
    approveLabel: string;
    approveActionId: string;
  }>;
  // Optional "Proactive Insights" section — items Claude surfaces beyond the
  // assigned task (competitor moves, opportunities, risks). Rendered as a
  // subtle bullet list at the bottom of the email; only present when the
  // parser in dispatchAgentResponse extracted a non-empty trailing
  // "## Proactive insights" block from the response text.
  proactiveInsights?: string[];
}

const BRAND = "#00b3b3";

// Inline markdown: **bold** and [text](url). Links get the brand teal.
function inlineMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:600;color:#18181b;">$1</strong>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      `<a href="$2" style="color:${BRAND};text-decoration:none;border-bottom:1px solid ${BRAND};">$1</a>`
    );
}

// Render the agent's markdown body into clean, email-safe HTML: headings,
// bold, bullet + numbered lists, dividers, and paragraphs. Agents write
// markdown freely — this makes it render beautifully in every client.
function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^###\s+(.*)/))) {
      closeList();
      out.push(`<p style="margin:18px 0 6px;font-size:14px;font-weight:600;color:#18181b;">${inlineMd(m[1])}</p>`);
    } else if ((m = line.match(/^##\s+(.*)/))) {
      closeList();
      out.push(`<p style="margin:22px 0 8px;font-size:16px;font-weight:600;color:#18181b;">${inlineMd(m[1])}</p>`);
    } else if (/^(---|___|\*\*\*)\s*$/.test(line)) {
      closeList();
      out.push(`<div style="border-top:1px solid #e4e4e7;margin:18px 0;"></div>`);
    } else if ((m = line.match(/^[-•]\s+(.*)/))) {
      if (list !== "ul") { closeList(); out.push(`<ul style="margin:0 0 14px;padding-left:20px;">`); list = "ul"; }
      out.push(`<li style="margin:0 0 6px;">${inlineMd(m[1])}</li>`);
    } else if ((m = line.match(/^\d+\.\s+(.*)/))) {
      if (list !== "ol") { closeList(); out.push(`<ol style="margin:0 0 14px;padding-left:22px;">`); list = "ol"; }
      out.push(`<li style="margin:0 0 6px;">${inlineMd(m[1])}</li>`);
    } else {
      closeList();
      out.push(`<p style="margin:0 0 14px;">${inlineMd(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

export function buildAgentResponseEmail(options: AgentResponseOptions): string {
  const { agentName, agentId, agentRole, clientBusinessName, responseBody, toolsUsed, stats, tableHeaders, tableRows, sourceLinks, recommendations, proactiveInsights } = options;

  const wrappedHtml = renderMarkdown(responseBody);

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
                  <td style="width: 44px; vertical-align: top;">
                    <img src="${AGENT_AVATAR_URL}" width="40" height="40" alt="${agentName}" style="display: block; width: 40px; height: 40px; border-radius: 50%;" />
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

          ${stats && stats.length > 0 ? `
          <!-- Stats Grid -->
          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <p style="margin: 0 0 12px 0; font-size: 10px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 1.2px;">Key Metrics</p>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  ${stats.map((s) => `
                  <td style="padding: 12px; background: #f4f4f5; border-radius: 8px; text-align: center; width: ${Math.floor(100 / stats.length)}%;">
                    <p style="margin: 0; font-size: 20px; font-weight: 500; color: #18181b;">${s.value}</p>
                    <p style="margin: 4px 0 0 0; font-size: 11px; color: #71717a;">${s.label}</p>
                    <p style="margin: 2px 0 0 0; font-size: 11px; color: ${s.deltaType === "up" ? "#16a34a" : "#dc2626"};">${s.delta}</p>
                  </td>`).join('<td style="width: 8px;"></td>')}
                </tr>
              </table>
            </td>
          </tr>` : ""}

          ${tableHeaders && tableRows && tableRows.length > 0 ? `
          <!-- Data Table -->
          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  ${tableHeaders.map((h) => `<th style="padding: 8px 10px; text-align: left; border-bottom: 2px solid #e4e4e7; font-weight: 600; color: #18181b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">${h}</th>`).join("")}
                </tr>
                ${tableRows.map((row) => `
                <tr>
                  ${row.columns.map((col) => `<td style="padding: 8px 10px; border-bottom: 1px solid #f4f4f5; color: #52525b;">${col}</td>`).join("")}
                </tr>`).join("")}
              </table>
            </td>
          </tr>` : ""}

          ${sourceLinks && sourceLinks.length > 0 ? `
          <!-- Source Links -->
          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 1.2px;">Sources</p>
              ${sourceLinks.map((l) => `<a href="${l.url}" style="display: inline-block; font-size: 12px; color: ${l.color}; margin-right: 16px; text-decoration: none; border-bottom: 1px solid ${l.color};">${l.label}</a>`).join("")}
            </td>
          </tr>` : ""}

          ${recommendations && recommendations.length > 0 ? `
          <!-- Recommendations -->
          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <p style="margin: 0 0 12px 0; font-size: 10px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 1.2px;">Recommendations</p>
              ${recommendations.map((rec) => `
              <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 8px;">
                <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #18181b;">${rec.title}</p>
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #52525b; line-height: 1.6;">${rec.description}</p>
                <p style="margin: 0 0 10px 0; font-size: 12px; color: #71717a; font-style: italic;">${rec.reasoning}</p>
                <a href="mailto:reply-\${agentId}@ambitt.agency?subject=APPROVE ${rec.approveActionId}" style="display: inline-block; background: #0f1117; color: #f0f2f7; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 500; text-decoration: none;">${rec.approveLabel}</a>
              </div>`).join("")}
            </td>
          </tr>` : ""}

          ${proactiveInsights && proactiveInsights.length > 0 ? `
          <!-- Proactive Insights -->
          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <div style="background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 6px; padding: 14px 16px;">
                <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 600; color: #92400e; text-transform: uppercase; letter-spacing: 1.2px;">Proactive Insights</p>
                <ul style="margin: 0; padding-left: 18px; color: #78350f; font-size: 13px; line-height: 1.6;">
                  ${proactiveInsights.map((i) => `<li style="margin: 0 0 4px 0;">${i}</li>`).join("")}
                </ul>
              </div>
            </td>
          </tr>` : ""}

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="border-top: 1px solid #e4e4e7;"></div>
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
            <td style="padding: 8px 40px 32px 40px;">
              <table role="presentation">
                <tr>
                  <td style="vertical-align: middle; padding-right: 10px;">
                    <img src="${AGENT_AVATAR_URL}" width="34" height="34" alt="${agentName}" style="display: block; width: 34px; height: 34px; border-radius: 50%;" />
                  </td>
                  <td style="vertical-align: middle;">
                    <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1a1a1a;">${agentName}</p>
                    <p style="margin: 1px 0 0 0; font-size: 12px; color: #9ca3af;">${agentRole} · <span style="color: ${BRAND};">Ambitt Agents</span></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Sub-footer -->
        <table role="presentation" style="max-width: 560px; margin: 16px auto 0 auto;">
          <tr>
            <td style="text-align: center; color: #9ca3af; font-size: 11px; line-height: 1.8; padding-bottom: 8px;">
              ${navFooterLinks(agentName, agentId)}
            </td>
          </tr>
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
