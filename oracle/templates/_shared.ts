// ---------------------------------------------------------------------------
// Shared Email Template Helpers — design system primitives
// ---------------------------------------------------------------------------
// Every template composes from these. Keeps the design system in one place.
// ---------------------------------------------------------------------------

export interface BaseEmailProps {
  agentName: string;
  clientName: string;
  productName: string;
  agentId: string;
  clientId: string;
}

export interface StatItem {
  value: string;
  label: string;
  delta: string;
  deltaType: "up" | "down";
}

export interface SourceLink {
  label: string;
  url: string;
  color: string;
}

export interface RecommendationItem {
  title: string;
  description: string;
  reasoning: string;
  approveLabel: string;
  approveActionId: string;
}

// ---------------------------------------------------------------------------
// Header variants
// ---------------------------------------------------------------------------

type HeaderVariant = "default" | "alert" | "warning" | "success";

const HEADER_BG: Record<HeaderVariant, string> = {
  default: "#0f1117",
  alert: "#450a0a",
  warning: "#1c1200",
  success: "#052e16",
};

type BadgeVariant = "active" | "alert" | "warning" | "success" | "info";

const BADGE_STYLES: Record<BadgeVariant, { text: string; bg: string; border: string }> = {
  active: { text: "#3d8f6e", bg: "#0d2419", border: "#1a4a30" },
  alert: { text: "#fca5a5", bg: "#450a0a", border: "#7f1d1d" },
  warning: { text: "#fbbf24", bg: "#2d1a00", border: "#854d0e" },
  success: { text: "#86efac", bg: "#052e16", border: "#166534" },
  info: { text: "#7eb8f7", bg: "#0d1f35", border: "#1a3a5c" },
};

export function badge(label: string, variant: BadgeVariant): string {
  const s = BADGE_STYLES[variant];
  return `<span style="display: inline-block; font-size: 10px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: ${s.text}; background: ${s.bg}; border: 1px solid ${s.border}; padding: 3px 8px; border-radius: 4px;">${label}</span>`;
}

// ---------------------------------------------------------------------------
// Layout wrappers
// ---------------------------------------------------------------------------

export function emailWrapper(headerVariant: HeaderVariant, headerContent: string, bodyContent: string, footerContent: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 32px 16px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e4e4e7;">

          <!-- Header -->
          <tr>
            <td style="background: ${HEADER_BG[headerVariant]}; padding: 24px 32px;">
              ${headerContent}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top: 1px solid #e4e4e7; padding: 16px 32px;">
              ${footerContent}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function headerBlock(agentName: string, productName: string, badgeLabel: string, badgeVariant: BadgeVariant): string {
  return `
<table role="presentation" style="width: 100%;">
  <tr>
    <td>
      <p style="margin: 0 0 2px 0; font-size: 14px; font-weight: 600; color: #ffffff;">${agentName}</p>
      <p style="margin: 0; font-size: 12px; color: #a1a1aa;">${productName}</p>
    </td>
    <td style="text-align: right; vertical-align: top;">
      ${badge(badgeLabel, badgeVariant)}
    </td>
  </tr>
</table>`;
}

export function sectionLabel(text: string): string {
  return `<p style="margin: 0 0 10px 0; font-size: 10px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 1.2px;">${text}</p>`;
}

export function summaryBlock(text: string): string {
  return `<p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.75; color: #52525b;">${text}</p>`;
}

export function statsGrid(stats: StatItem[]): string {
  if (stats.length === 0) return "";
  return `
${sectionLabel("Key Metrics")}
<table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
  <tr>
    ${stats.map((s) => `
    <td style="padding: 12px; background: #f4f4f5; border-radius: 8px; text-align: center;">
      <p style="margin: 0; font-size: 20px; font-weight: 500; color: #18181b;">${s.value}</p>
      <p style="margin: 4px 0 0 0; font-size: 11px; color: #71717a;">${s.label}</p>
      <p style="margin: 2px 0 0 0; font-size: 11px; color: ${s.deltaType === "up" ? "#16a34a" : "#dc2626"};">${s.delta}</p>
    </td>`).join('<td style="width: 8px;"></td>')}
  </tr>
</table>`;
}

export function sourceLinksBlock(links: SourceLink[]): string {
  if (links.length === 0) return "";
  return `
${sectionLabel("Sources")}
<div style="margin-bottom: 20px;">
  ${links.map((l) => `<a href="${l.url}" style="display: inline-block; font-size: 12px; color: ${l.color}; margin-right: 16px; margin-bottom: 4px; text-decoration: none; border-bottom: 1px solid ${l.color};">${l.label}</a>`).join("")}
</div>`;
}

export function recommendationsBlock(recs: RecommendationItem[], agentId: string): string {
  if (recs.length === 0) return "";
  return `
${sectionLabel("Recommendations")}
${recs.map((rec) => `
<div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 8px;">
  <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #18181b;">${rec.title}</p>
  <p style="margin: 0 0 8px 0; font-size: 13px; color: #52525b; line-height: 1.6;">${rec.description}</p>
  <p style="margin: 0 0 10px 0; font-size: 12px; color: #71717a; font-style: italic;">${rec.reasoning}</p>
  <a href="mailto:reply-${agentId}@ambitt.agency?subject=APPROVE%20${rec.approveActionId}" style="display: inline-block; background: #0f1117; color: #f0f2f7; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 500; text-decoration: none;">${rec.approveLabel}</a>
</div>`).join("")}`;
}

export function primaryCta(label: string, url: string, variant: "default" | "alert" = "default"): string {
  const bg = variant === "alert" ? "#7f1d1d" : "#0f1117";
  const color = variant === "alert" ? "#fecaca" : "#f0f2f7";
  return `<a href="${url}" style="display: block; text-align: center; background: ${bg}; color: ${color}; padding: 12px; border-radius: 8px; font-size: 13px; font-weight: 500; text-decoration: none;">${label}</a>`;
}

export function secondaryCta(label1: string, url1: string, label2: string, url2: string): string {
  return `
<table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 8px;">
  <tr>
    <td style="width: 50%; padding-right: 4px;">
      <a href="${url1}" style="display: block; text-align: center; background: #f4f4f5; color: #18181b; padding: 9px; border-radius: 8px; font-size: 12px; border: 1px solid #e4e4e7; text-decoration: none;">${label1}</a>
    </td>
    <td style="width: 50%; padding-left: 4px;">
      <a href="${url2}" style="display: block; text-align: center; background: #f4f4f5; color: #18181b; padding: 9px; border-radius: 8px; font-size: 12px; border: 1px solid #e4e4e7; text-decoration: none;">${label2}</a>
    </td>
  </tr>
</table>`;
}

// ---------------------------------------------------------------------------
// Persistent nav footer — shown on every agent email.
// Quiet links for the client to reach any part of the platform from any email.
// ---------------------------------------------------------------------------

const NAV_LINK_STYLE =
  'color: #a1a1aa; text-decoration: none; border-bottom: 1px dotted #d4d4d8;';

export function navFooterLinks(agentName: string, agentId: string): string {
  const agentShort = agentName.length > 16 ? `${agentName.slice(0, 14)}…` : agentName;
  const links = [
    { label: `Chat with ${agentShort}`, href: `https://chat.ambitt.agency/${agentId}` },
    { label: `Manage ${agentShort}`, href: `https://clients.ambitt.agency/agents/${agentId}` },
    { label: "Billing", href: "https://clients.ambitt.agency/billing" },
    {
      label: "Request a tool",
      href: `mailto:support@ambitt.agency?subject=${encodeURIComponent("Tool request")}`,
    },
    {
      label: "Pause agent",
      href: `mailto:reply-${agentId}@ambitt.agency?subject=${encodeURIComponent("PAUSE")}`,
    },
    { label: "Help", href: "mailto:support@ambitt.agency" },
  ];
  return links
    .map((l) => `<a href="${l.href}" style="${NAV_LINK_STYLE}">${l.label}</a>`)
    .join('<span style="color: #e4e4e7; margin: 0 6px;">·</span>');
}

export function footerBlock(
  agentName: string,
  agentId: string,
  options: { systemEmail?: boolean } = {}
): string {
  const onUsLine = options.systemEmail
    ? `<p style="margin: 8px 0 0 0; font-size: 11px; color: #86efac; font-style: italic;">This one is on us — it doesn't count toward your monthly interactions.</p>`
    : "";
  return `
<p style="margin: 0; font-size: 11px; color: #a1a1aa;">
  ${agentName} · <a href="https://ambitt.agency" style="color: #a1a1aa; text-decoration: none;">Ambitt Agents</a>
</p>
<p style="margin: 4px 0 0 0; font-size: 11px; color: #d4d4d8;">Reply to this email to respond to your agent.</p>
${onUsLine}
<p style="margin: 10px 0 0 0; font-size: 11px; color: #a1a1aa; line-height: 1.8;">
  ${navFooterLinks(agentName, agentId)}
</p>`;
}
