// ---------------------------------------------------------------------------
// Welcome Email — sent when an agent is activated
// ---------------------------------------------------------------------------
// First impression. The client opens this and meets their agent.
// Must feel personal, specific, and immediately useful.
// ---------------------------------------------------------------------------

interface WelcomeEmailOptions {
  agentName: string;
  agentPurpose: string;
  clientFirstName: string;
  clientBusinessName: string;
  tools: string[];
  capabilities: string[];
}

export function buildWelcomeEmail(options: WelcomeEmailOptions): {
  subject: string;
  html: string;
} {
  const { agentName, agentPurpose, clientFirstName, clientBusinessName, tools, capabilities } = options;

  const subject = `Meet ${agentName} — your new Ambitt agent for ${clientBusinessName}`;

  const toolPills = tools
    .map((t) => `<span style="display: inline-block; background: #f0fdf4; color: #15803d; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px; margin: 0 4px 4px 0;">${t}</span>`)
    .join("");

  const capabilityList = capabilities
    .map((c) => `<li style="margin: 0 0 8px 0; color: #374151; font-size: 14px;">${c}</li>`)
    .join("");

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
                    <p style="margin: 3px 0 0 0; font-size: 12px; color: #9ca3af;">Your AI Agent at Ambitt · ${clientBusinessName}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 28px 40px 0 40px; color: #374151; font-size: 15px; line-height: 1.7;">
              <p style="margin: 0 0 16px 0;">Hi ${clientFirstName},</p>
              <p style="margin: 0 0 16px 0;">I'm <strong>${agentName}</strong>, your new AI agent. I've been set up specifically for ${clientBusinessName} and I'm ready to start working.</p>
            </td>
          </tr>

          <!-- Connected Tools -->
          <tr>
            <td style="padding: 20px 40px 0 40px;">
              <p style="margin: 0 0 10px 0; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Connected Tools</p>
              <div style="line-height: 2;">
                ${toolPills}
              </div>
            </td>
          </tr>

          <!-- What I can do -->
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <p style="margin: 0 0 12px 0; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">What I Can Do For You</p>
              <ul style="margin: 0; padding-left: 18px;">
                ${capabilityList}
              </ul>
            </td>
          </tr>

          <!-- How to use -->
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px;">
                <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">How to Give Me Tasks</p>
                <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                  Just <strong>reply to this email</strong> with what you need. Write it like you'd text a colleague — plain English, no special format needed. I'll handle the rest and email you back with results.
                </p>
              </div>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 28px 40px 0 40px;">
              <div style="border-top: 1px solid #f0f0f0;"></div>
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding: 20px 40px 32px 40px; color: #9ca3af; font-size: 13px; line-height: 1.6;">
              <p style="margin: 0;">— ${agentName}, ${agentPurpose}</p>
              <p style="margin: 4px 0 0 0;">Powered by <a href="https://ambitt.agency" style="color: #6b7280; text-decoration: none;">Ambitt Agents</a></p>
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

/**
 * Generate capability bullet points from the agent's tool list and type.
 * Claude could do this better, but for immediate welcome emails this is instant.
 */
export function inferCapabilities(agentType: string, tools: string[]): string[] {
  const capabilities: string[] = [];

  const toolCaps: Record<string, string[]> = {
    salesforce: ["Query and update your CRM pipeline", "Track deal stages and contact activity", "Generate pipeline reports"],
    hubspot: ["Manage contacts, deals, and companies", "Monitor marketing email performance", "Pull CRM reports on demand"],
    stripe: ["Check subscription status and revenue", "Look up customer payment history", "Monitor failed payments and churn"],
    snowflake: ["Run SQL queries on your data warehouse", "Build reports from your datasets"],
    postgresql: ["Query your database for insights", "Inspect schema and table structures"],
    powerbi: ["Pull dashboard data and reports", "Monitor dataset refresh status"],
    asana: ["Track project progress and deadlines", "Update task status and assignments", "Report on team workload"],
    notion: ["Search and update your workspace", "Create and manage database entries"],
    slack: ["Send messages to channels and threads", "Search conversation history", "Post automated updates"],
    zendesk: ["Monitor support tickets and SLAs", "Update ticket status and assignments"],
    intercom: ["Track customer conversations", "Monitor response times and satisfaction"],
    quickbooks: ["Check invoice and payment status", "Pull financial reports and summaries"],
    xero: ["Monitor bank transactions and reconciliation", "Generate accounting reports"],
    shopify: ["Track orders and inventory levels", "Monitor product performance", "Pull sales reports"],
    klaviyo: ["Monitor email campaign performance", "Track flow metrics and engagement", "Segment analysis"],
  };

  for (const tool of tools) {
    const caps = toolCaps[tool];
    if (caps) capabilities.push(...caps.slice(0, 2));
  }

  // Add general capability based on agent type
  const typeCaps: Record<string, string> = {
    analytics: "Analyze your metrics and surface insights you'd miss",
    content: "Create and optimize content tailored to your audience",
    marketing: "Track campaign performance and recommend improvements",
    sales: "Qualify leads and keep your pipeline moving",
    engagement: "Monitor user retention and suggest engagement tactics",
    support: "Track ticket volume and identify common issues",
    research: "Research markets, competitors, and opportunities",
    design: "Audit your UI and flag consistency issues",
    ops: "Monitor system health and flag problems early",
    reputation: "Track reviews and brand mentions across platforms",
  };

  const general = typeCaps[agentType];
  if (general) capabilities.push(general);

  return capabilities.slice(0, 5);
}
