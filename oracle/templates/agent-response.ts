import type { RuntimeOutput } from "../../shared/runtime/index.js";
import { navFooterLinks, AGENT_AVATAR_URL } from "./_shared.js";

// ---------------------------------------------------------------------------
// Agent Response Email Template — premium, teal, card-based.
// ---------------------------------------------------------------------------
// A calm, confident email that reads like a capable teammate wrote it. Lots of
// white space, one teal accent, rounded info-cards with soft-teal fills, a
// single primary button, and a clean signature with the agent's avatar.
// Dumb renderer — all content is AI-generated and passed in as props.
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
  proactiveInsights?: string[];
}

const BRAND = "#00b3b3";
const BRAND_DARK = "#0f7a74"; // readable teal for text on soft-teal fills
const CARD = "#eaf7f4"; // soft-teal card fill
const BADGE = "#d3efe9"; // slightly deeper teal for icon badges
const INK = "#15201f"; // near-black heading
const BODY = "#3f4a48"; // body text
const MUTE = "#8a938f"; // muted gray-teal

// Inline markdown: **bold** and [text](url).
function inlineMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, `<strong style="font-weight:600;color:${INK};">$1</strong>`)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      `<a href="$2" style="color:${BRAND_DARK};text-decoration:none;border-bottom:1px solid ${BADGE};">$1</a>`
    );
}

// Render the agent's markdown body into clean, email-safe HTML.
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
      out.push(`<p style="margin:20px 0 6px;font-size:14px;font-weight:600;color:${INK};">${inlineMd(m[1])}</p>`);
    } else if ((m = line.match(/^##\s+(.*)/))) {
      closeList();
      out.push(`<p style="margin:24px 0 8px;font-size:16px;font-weight:600;color:${INK};">${inlineMd(m[1])}</p>`);
    } else if (/^(---|___|\*\*\*)\s*$/.test(line)) {
      closeList();
      out.push(`<div style="border-top:1px solid #e7ecec;margin:20px 0;"></div>`);
    } else if ((m = line.match(/^[-•]\s+(.*)/))) {
      if (list !== "ul") { closeList(); out.push(`<ul style="margin:0 0 16px;padding-left:20px;">`); list = "ul"; }
      out.push(`<li style="margin:0 0 7px;">${inlineMd(m[1])}</li>`);
    } else if ((m = line.match(/^\d+\.\s+(.*)/))) {
      if (list !== "ol") { closeList(); out.push(`<ol style="margin:0 0 16px;padding-left:22px;">`); list = "ol"; }
      out.push(`<li style="margin:0 0 7px;">${inlineMd(m[1])}</li>`);
    } else {
      closeList();
      out.push(`<p style="margin:0 0 16px;">${inlineMd(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

// A rounded teal icon badge (a table cell so it renders in every client).
function iconBadge(glyph: string, square = true): string {
  return `<div style="width:38px;height:38px;background:${BADGE};border-radius:${square ? "11px" : "50%"};text-align:center;">
    <span style="font-size:19px;line-height:38px;color:${BRAND_DARK};">${glyph}</span>
  </div>`;
}

export function buildAgentResponseEmail(options: AgentResponseOptions): string {
  const { agentName, agentId, agentRole, clientBusinessName, responseBody, toolsUsed, stats, tableHeaders, tableRows, sourceLinks, recommendations, proactiveInsights } = options;

  const bodyHtml = renderMarkdown(responseBody);

  // "What I did" status card — a soft-teal card with a checkmark badge.
  const actionsHtml = toolsUsed.length > 0
    ? `
          <tr><td style="padding: 4px 40px 20px 40px;">
            <table role="presentation" style="width:100%;background:${CARD};border-radius:14px;">
              <tr>
                <td style="width:38px;vertical-align:top;padding:18px 0 18px 18px;">${iconBadge("&#10003;", true)}</td>
                <td style="padding:18px 18px 18px 14px;vertical-align:top;">
                  <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:${INK};">Done for you</p>
                  ${toolsUsed
                    .map((t) => `<p style="margin:0 0 3px;font-size:13px;color:${BODY};">${t.success ? "" : "&#9888; "}${t.toolName.replace(/_/g, " ").toLowerCase()}</p>`)
                    .join("")}
                </td>
              </tr>
            </table>
          </td></tr>`
    : "";

  const statsHtml = stats && stats.length > 0 ? `
          <tr><td style="padding: 0 40px 20px 40px;">
            <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;">
              <tr>${stats.map((s) => `
                <td style="padding:16px 12px;background:${CARD};border-radius:12px;text-align:center;">
                  <p style="margin:0;font-size:22px;font-weight:600;color:${INK};">${s.value}</p>
                  <p style="margin:4px 0 0;font-size:11px;color:${MUTE};">${s.label}</p>
                  <p style="margin:3px 0 0;font-size:11px;color:${s.deltaType === "up" ? BRAND_DARK : "#c2410c"};">${s.delta}</p>
                </td>`).join("")}
              </tr>
            </table>
          </td></tr>` : "";

  const tableHtml = tableHeaders && tableRows && tableRows.length > 0 ? `
          <tr><td style="padding: 0 40px 20px 40px;">
            <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr>${tableHeaders.map((h) => `<th style="padding:9px 10px;text-align:left;border-bottom:2px solid ${BADGE};font-weight:600;color:${INK};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${h}</th>`).join("")}</tr>
              ${tableRows.map((row) => `<tr>${row.columns.map((col) => `<td style="padding:9px 10px;border-bottom:1px solid #eef1f0;color:${BODY};">${col}</td>`).join("")}</tr>`).join("")}
            </table>
          </td></tr>` : "";

  // CTA / recommendation cards — soft-teal card, sparkle badge, solid-teal button.
  const recsHtml = recommendations && recommendations.length > 0
    ? recommendations.map((rec) => `
          <tr><td style="padding: 0 40px 14px 40px;">
            <table role="presentation" style="width:100%;background:${CARD};border-radius:14px;">
              <tr>
                <td style="width:38px;vertical-align:top;padding:18px 0 18px 18px;">${iconBadge("&#10022;", false)}</td>
                <td style="padding:18px 14px;vertical-align:middle;">
                  <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:${INK};">${rec.title}</p>
                  <p style="margin:0;font-size:13px;color:${BODY};line-height:1.55;">${rec.description}</p>
                </td>
                <td style="vertical-align:middle;padding:18px 18px 18px 8px;text-align:right;white-space:nowrap;">
                  <a href="mailto:reply-${agentId}@ambitt.agency?subject=APPROVE ${rec.approveActionId}" style="display:inline-block;background:${BRAND};color:#ffffff;padding:10px 18px;border-radius:9px;font-size:13px;font-weight:600;text-decoration:none;">${rec.approveLabel} &#8250;</a>
                </td>
              </tr>
            </table>
          </td></tr>`).join("")
    : "";

  const sourcesHtml = sourceLinks && sourceLinks.length > 0 ? `
          <tr><td style="padding: 2px 40px 20px 40px;">
            <p style="margin:0 0 8px;font-size:10px;font-weight:600;color:${MUTE};text-transform:uppercase;letter-spacing:1.2px;">Sources</p>
            ${sourceLinks.map((l) => `<a href="${l.url}" style="display:inline-block;font-size:12px;color:${BRAND_DARK};margin-right:16px;text-decoration:none;border-bottom:1px solid ${BADGE};">${l.label}</a>`).join("")}
          </td></tr>` : "";

  const insightsHtml = proactiveInsights && proactiveInsights.length > 0 ? `
          <tr><td style="padding: 0 40px 20px 40px;">
            <div style="background:#fbf7ec;border-radius:12px;padding:16px 18px;">
              <p style="margin:0 0 8px;font-size:10px;font-weight:600;color:#9a7b2e;text-transform:uppercase;letter-spacing:1.2px;">Worth your attention</p>
              <ul style="margin:0;padding-left:18px;color:#6b5a2a;font-size:13px;line-height:1.6;">
                ${proactiveInsights.map((i) => `<li style="margin:0 0 4px;">${i}</li>`).join("")}
              </ul>
            </div>
          </td></tr>` : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:40px 16px;">
      <table role="presentation" style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(20,32,31,0.06);">

        <tr><td style="padding:32px 40px 8px 40px;color:${BODY};font-size:15px;line-height:1.7;">
          ${bodyHtml}
        </td></tr>

        ${actionsHtml}
        ${statsHtml}
        ${tableHtml}
        ${recsHtml}
        ${sourcesHtml}
        ${insightsHtml}

        <tr><td style="padding:6px 40px 0 40px;"><div style="border-top:1px solid #eef1f0;"></div></td></tr>

        <tr><td style="padding:18px 40px 6px 40px;">
          <p style="margin:0;font-size:13px;color:${MUTE};">Just reply to this email to give me another task or ask a follow-up.</p>
        </td></tr>

        <tr><td style="padding:10px 40px 30px 40px;">
          <table role="presentation"><tr>
            <td style="vertical-align:middle;padding-right:11px;">
              <img src="${AGENT_AVATAR_URL}" width="34" height="34" alt="${agentName}" style="display:block;width:34px;height:34px;border-radius:50%;" />
            </td>
            <td style="vertical-align:middle;">
              <p style="margin:0;font-size:14px;font-weight:600;color:${INK};">${agentName}</p>
              <p style="margin:1px 0 0;font-size:12px;color:${MUTE};">${agentRole} &middot; <span style="color:${BRAND_DARK};">Ambitt Agents</span></p>
            </td>
          </tr></table>
        </td></tr>

      </table>

      <table role="presentation" style="max-width:560px;margin:16px auto 0 auto;">
        <tr><td style="text-align:center;color:${MUTE};font-size:11px;line-height:1.8;padding-bottom:6px;">${navFooterLinks(agentName, agentId)}</td></tr>
        <tr><td style="text-align:center;color:#b9c1be;font-size:11px;"><p style="margin:0;">Powered by <a href="https://ambitt.agency" style="color:${MUTE};text-decoration:none;">Ambitt Agents</a></p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
