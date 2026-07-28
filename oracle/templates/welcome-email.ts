// ---------------------------------------------------------------------------
// Welcome Email — sent when an agent is activated
// ---------------------------------------------------------------------------
// First impression. The client opens this and meets their agent, so it carries
// more weight than anything else we send. Everything visual comes from
// _shared.ts; this file composes and nothing else.
//
// Dumb renderer (CLAUDE.md rule 12): the brief, the capabilities and the tool
// list all arrive as props. The only words this file owns are the fixed
// mechanics ("reply to this email", "DOCS in the subject").
// ---------------------------------------------------------------------------

import {
  T,
  emailDocument,
  section,
  letterhead,
  h2,
  paragraph,
  bullets,
  richText,
  panel,
  portalInvite,
  divider,
  signature,
  footerRows,
  signatureRoleLine,
} from "./_shared.js";
import { portalLink } from "../../shared/portal-links.js";

interface WelcomeEmailOptions {
  agentName: string;
  agentId: string;
  agentPurpose: string;
  clientFirstName: string;
  clientBusinessName: string;
  tools: string[];
  capabilities: string[];
  hasDocuments?: boolean;
  agentEmail?: string;
  portalUrl?: string;
  // When the activation brief ran successfully, these surface the agent's
  // research directly in the welcome email. briefText is plain text with
  // "- " bullet lines; briefHasPdf indicates a PDF attachment will be included.
  briefText?: string;
  briefHasPdf?: boolean;
}

/** Connected systems, as quiet teal chips. Reads as a fact, not a trophy shelf. */
function toolChips(tools: string[]): string {
  if (tools.length === 0) return "";
  return tools
    .map(
      (t) =>
        `<span style="display:inline-block;font-size:13.5px;font-weight:500;color:${T.tealText};background-color:${T.washBrand};padding:6px 12px;border-radius:7px;margin:0 6px 7px 0;">${t}</span>`
    )
    .join("");
}

export function buildWelcomeEmail(options: WelcomeEmailOptions): {
  subject: string;
  html: string;
} {
  const {
    agentName,
    agentId,
    agentPurpose,
    clientFirstName,
    clientBusinessName,
    tools,
    capabilities,
    hasDocuments,
    portalUrl,
    briefText,
    briefHasPdf,
  } = options;

  // Written without an em dash on purpose: the send-time scrub in
  // shared/email.ts rewrites U+2014, and our own copy shouldn't need rewriting.
  const subject = `${agentName} is your new Ambitt agent for ${clientBusinessName}`;

  const hasBrief = !!briefText && briefText.trim().length > 0;

  const rows = [
    section(letterhead({ agentName, roleLine: signatureRoleLine(agentPurpose), chipLabel: "Now working" }), 30, 0),

    section(
      paragraph(`Hi ${clientFirstName},`) +
        paragraph(
          hasBrief
            ? `I'm <strong style="font-weight:600;color:${T.ink};">${agentName}</strong>, and I'm working for ${clientBusinessName} from today. Before I introduced myself I went and read up on the business, so I could start useful rather than start asking.`
            : `I'm <strong style="font-weight:600;color:${T.ink};">${agentName}</strong>, and I'm working for ${clientBusinessName} from today. I've been set up for your business specifically and I'm ready to go.`
        ),
      24,
      0
    ),

    hasBrief
      ? section(
          h2(`What I found about ${clientBusinessName}`) +
            panel(
              richText(briefText!) +
                (briefHasPdf
                  ? `<p class="dm-mute" style="margin:6px 0 0 0;font-size:13.5px;color:${T.mute};">The full brief is attached as a PDF.</p>`
                  : "")
            ),
          26,
          0
        )
      : "",

    capabilities.length > 0
      ? section(h2("What I'll be doing") + bullets(capabilities), 26, 0)
      : "",

    tools.length > 0
      ? section(
          h2("What I'm connected to") +
            `<div style="line-height:1.9;">${toolChips(tools)}</div>` +
            `<p class="dm-mute" style="margin:8px 0 0 0;font-size:13.5px;line-height:1.55;color:${T.mute};">Nothing else. If I ever need access to something new, I'll ask you first and tell you why.</p>`,
          20,
          0
        )
      : "",

    section(
      h2("How to give me work") +
        paragraph(
          `Reply to this email. Write it the way you'd text a colleague, plain English, no format to learn. I'll take it from there and come back to you with the result.`
        ),
      26,
      0
    ),

    !hasDocuments
      ? section(
          panel(
            `<p class="dm-ink" style="margin:0 0 8px 0;font-size:16px;font-weight:600;color:${T.ink};">One thing that would help</p>` +
              `<p class="dm-body" style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:${T.body};">I don't have any of your own documents yet. An SOP, a past deal, brand guidelines, whatever you'd hand a new hire on day one. It makes everything I send you sharper.</p>` +
              `<p class="dm-body" style="margin:0;font-size:15px;line-height:1.6;color:${T.body};">Reply with <strong style="font-weight:600;color:${T.ink};">DOCS</strong> in the subject and attach the files${
                portalUrl ? ", or drop them in your portal" : ""
              }. Whenever suits. I'll work with what I have until then.</p>`,
            "attention"
          ),
          16,
          0
        )
      : "",

    section(
      portalInvite(
        `You've got a portal too. It's where you can see what I've been doing, connect a tool, or change how often I report. You shouldn't need it, but it's there.`,
        "Have a look around",
        portalUrl ?? portalLink(agentId, "overview")
      ),
      18,
      0
    ),

    section(divider(26, 22) + signature(agentName, agentPurpose), 0, 32),
  ].join("");

  const html = emailDocument({
    preheader: hasBrief
      ? `I read up on ${clientBusinessName} before saying hello. Here's what I found.`
      : `I'm set up for ${clientBusinessName} and ready to start. Here's how we'll work.`,
    tone: "brand",
    rows,
    outerRows: footerRows(agentName, agentId, { systemEmail: true }),
  });

  return { subject, html };
}

/**
 * Generate capability bullet points from the agent's tool list and type.
 * Claude could do this better, but for immediate welcome emails this is instant.
 */
export function inferCapabilities(agentType: string, tools: string[]): string[] {
  const capabilities: string[] = [];

  const toolCaps: Record<string, string[]> = {
    posthog: ["Track user behavior, funnels, and session replays", "Monitor feature flag usage and A/B tests", "Surface activation and retention insights"],
    supabase: ["Query your database for user and business data", "Monitor signups, auth events, and storage usage", "Pull real-time data for reports"],
    resend: ["Send you formatted reports and digests via email", "Deliver alerts when metrics change", "Email data exports and PDF reports"],
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
    gmail: ["Read and send emails on your behalf", "Search email history", "Manage labels and drafts"],
    google_analytics: ["Pull traffic and conversion data", "Analyze user behavior and acquisition", "Monitor goal completions"],
    linkedin: ["Research prospects and companies", "Monitor profile engagement", "Track connection activity"],
    zoominfo: ["Look up company and contact data", "Find decision-makers and their contact info", "Research prospects by industry and size"],
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
