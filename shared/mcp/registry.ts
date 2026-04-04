import type { MCPServerDefinition } from "./types.js";

// ---------------------------------------------------------------------------
// MCP Server Registry — all 15 launch tools
// ---------------------------------------------------------------------------
// Each entry defines how to connect to the MCP server for a given tool.
// Transport is either "http" (remote server) or "stdio" (local npm package).
// Auth method tells the client how to pass credentials.
//
// IMPORTANT: URLs and package names are based on official docs as of April 2026.
// If a server moves or a package renames, update here — no other code changes needed.
// ---------------------------------------------------------------------------

export const MCP_SERVERS: Record<string, MCPServerDefinition> = {
  // === CRM ===

  salesforce: {
    id: "salesforce",
    name: "Salesforce",
    description: "CRM — pipelines, contacts, opportunities, accounts, reports. 60+ tools including create/update/delete.",
    category: "crm",
    logoUrl: "/tools/salesforce.svg",
    transport: "http",
    url: "https://mcp.salesforce.com",
    auth: "oauth",
    credentialField: "oauthToken",
    docsUrl: "https://developer.salesforce.com/docs/mcp",
    officialServer: true,
  },

  hubspot: {
    id: "hubspot",
    name: "HubSpot",
    description: "CRM — contacts, deals, companies, tickets, marketing email, forms. Official HubSpot MCP.",
    category: "crm",
    logoUrl: "/tools/hubspot.svg",
    transport: "http",
    url: "https://developers.hubspot.com/mcp",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://developers.hubspot.com/mcp",
    officialServer: true,
  },

  // === PAYMENTS ===

  stripe: {
    id: "stripe",
    name: "Stripe",
    description: "Payments — customers, subscriptions, invoices, charges, refunds, payment intents. Read + write via RAK permissions.",
    category: "payments",
    logoUrl: "/tools/stripe.svg",
    transport: "http",
    url: "https://mcp.stripe.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://docs.stripe.com/mcp",
    officialServer: true,
  },

  // === ANALYTICS & DATA ===

  snowflake: {
    id: "snowflake",
    name: "Snowflake",
    description: "Data warehouse — SQL queries, Cortex AI, semantic views, object management. OAuth-based managed server.",
    category: "analytics",
    logoUrl: "/tools/snowflake.svg",
    transport: "http",
    url: "https://mcp.snowflakecomputing.com",
    auth: "oauth",
    credentialField: "oauthToken",
    docsUrl: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp",
    officialServer: true,
  },

  postgresql: {
    id: "postgresql",
    name: "PostgreSQL",
    description: "Database — read-only SQL queries, schema inspection, table listing. Direct Postgres connection.",
    category: "database",
    logoUrl: "/tools/postgresql.svg",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    auth: "connection_string",
    credentialField: "apiKey",
    envKey: "POSTGRES_CONNECTION_STRING",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    officialServer: true,
    readOnly: true,
  },

  powerbi: {
    id: "powerbi",
    name: "Power BI",
    description: "Business intelligence — dashboards, reports, datasets, refresh schedules. Via Peliqan multi-platform MCP.",
    category: "analytics",
    logoUrl: "/tools/powerbi.svg",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@peliqan/mcp-server"],
    auth: "env",
    credentialField: "apiKey",
    envKey: "POWERBI_API_KEY",
    docsUrl: "https://github.com/Peliqan-io/mcp-server-peliqan",
    officialServer: false,
  },

  // === PROJECT MANAGEMENT ===

  asana: {
    id: "asana",
    name: "Asana",
    description: "Project management — tasks, projects, sections, assignees, due dates, comments. Official MCP Apps partner.",
    category: "project_management",
    logoUrl: "/tools/asana.svg",
    transport: "http",
    url: "https://mcp.asana.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://developers.asana.com/docs/using-asanas-mcp-server",
    officialServer: true,
  },

  notion: {
    id: "notion",
    name: "Notion",
    description: "Workspace — pages, databases, blocks, search. Read and write operations.",
    category: "project_management",
    logoUrl: "/tools/notion.svg",
    transport: "http",
    url: "https://mcp.notion.so",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://developers.notion.com/docs/mcp-supported-tools",
    officialServer: true,
  },

  // === COMMUNICATION ===

  slack: {
    id: "slack",
    name: "Slack",
    description: "Messaging — channels, messages, threads, search, user info. Read + post. Official MCP Apps partner.",
    category: "communication",
    logoUrl: "/tools/slack.svg",
    transport: "http",
    url: "https://mcp.slack.com",
    auth: "oauth",
    credentialField: "oauthToken",
    docsUrl: "https://api.slack.com/docs/mcp",
    officialServer: true,
  },

  // === SUPPORT ===

  zendesk: {
    id: "zendesk",
    name: "Zendesk",
    description: "Support — tickets, users, organizations, views, macros, SLA policies. Read + write.",
    category: "support",
    logoUrl: "/tools/zendesk.svg",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@zendesk/mcp-server"],
    auth: "env",
    credentialField: "apiKey",
    envKey: "ZENDESK_API_TOKEN",
    docsUrl: "https://developer.zendesk.com/documentation/mcp",
    officialServer: false,
  },

  intercom: {
    id: "intercom",
    name: "Intercom",
    description: "Customer messaging — conversations, contacts, companies, tags, segments. Via Peliqan MCP.",
    category: "support",
    logoUrl: "/tools/intercom.svg",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@peliqan/mcp-server"],
    auth: "env",
    credentialField: "apiKey",
    envKey: "INTERCOM_API_TOKEN",
    docsUrl: "https://github.com/Peliqan-io/mcp-server-peliqan",
    officialServer: false,
  },

  // === FINANCE ===

  quickbooks: {
    id: "quickbooks",
    name: "QuickBooks",
    description: "Accounting — invoices, payments, expenses, customers, reports, chart of accounts. OAuth.",
    category: "finance",
    logoUrl: "/tools/quickbooks.svg",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@peliqan/mcp-server"],
    auth: "oauth",
    credentialField: "oauthToken",
    envKey: "QUICKBOOKS_OAUTH_TOKEN",
    docsUrl: "https://developer.intuit.com",
    officialServer: false,
  },

  xero: {
    id: "xero",
    name: "Xero",
    description: "Accounting — invoices, contacts, bank transactions, reports. OAuth.",
    category: "finance",
    logoUrl: "/tools/xero.svg",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-xero"],
    auth: "oauth",
    credentialField: "oauthToken",
    envKey: "XERO_OAUTH_TOKEN",
    docsUrl: "https://developer.xero.com",
    officialServer: false,
  },

  // === COMMERCE ===

  shopify: {
    id: "shopify",
    name: "Shopify",
    description: "E-commerce — orders, products, inventory, customers, collections. Read + write operations.",
    category: "commerce",
    logoUrl: "/tools/shopify.svg",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-shopify"],
    auth: "env",
    credentialField: "apiKey",
    envKey: "SHOPIFY_ACCESS_TOKEN",
    docsUrl: "https://shopify.dev",
    officialServer: false,
  },

  // === MARKETING ===

  klaviyo: {
    id: "klaviyo",
    name: "Klaviyo",
    description: "Email marketing — campaigns, flows, segments, profiles, metrics, lists. Official server GA since 2025.",
    category: "marketing",
    logoUrl: "/tools/klaviyo.svg",
    transport: "http",
    url: "https://mcp.klaviyo.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://developers.klaviyo.com/en/docs/klaviyo_mcp_server",
    officialServer: true,
  },

  // === ADVERTISING ===

  google_ads: {
    id: "google_ads",
    name: "Google Ads",
    description: "Advertising — campaigns, ad groups, keywords, conversions, spend, performance reports. Official Google MCP.",
    category: "advertising",
    logoUrl: "/tools/google-ads.svg",
    transport: "http",
    url: "https://googleads.googleapis.com/mcp",
    auth: "oauth",
    credentialField: "oauthToken",
    docsUrl: "https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server",
    officialServer: true,
  },

  meta_ads: {
    id: "meta_ads",
    name: "Meta Ads",
    description: "Facebook + Instagram advertising — campaigns, ad sets, ads, audiences, reporting. 30+ tools for ad management.",
    category: "advertising",
    logoUrl: "/tools/meta-ads.svg",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@pipeboard/meta-ads-mcp"],
    auth: "env",
    credentialField: "apiKey",
    envKey: "META_ADS_ACCESS_TOKEN",
    docsUrl: "https://github.com/pipeboard-co/meta-ads-mcp",
    officialServer: false,
  },

  linkedin_ads: {
    id: "linkedin_ads",
    name: "LinkedIn Ads",
    description: "B2B advertising — campaigns, creatives, lead gen forms, audience targeting, conversion tracking.",
    category: "advertising",
    logoUrl: "/tools/linkedin-ads.svg",
    transport: "http",
    url: "https://api.linkedin.com/mcp",
    auth: "oauth",
    credentialField: "oauthToken",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/",
    officialServer: false,
  },

  // === SEO ===

  semrush: {
    id: "semrush",
    name: "SEMrush",
    description: "SEO — traffic analytics, keyword research, backlinks, site audit, competitor analysis, domain overview. Official MCP server.",
    category: "seo",
    logoUrl: "/tools/semrush.svg",
    transport: "http",
    url: "https://mcp.semrush.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://www.pulsemcp.com/servers/semrush",
    officialServer: true,
  },

  ahrefs: {
    id: "ahrefs",
    name: "Ahrefs",
    description: "SEO — backlink analysis, domain rating, organic keywords, content explorer, site audit, rank tracking. Official MCP server.",
    category: "seo",
    logoUrl: "/tools/ahrefs.svg",
    transport: "http",
    url: "https://mcp.ahrefs.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://ahrefs.com/blog/what-is-mcp-server/",
    officialServer: true,
  },

  google_search_console: {
    id: "google_search_console",
    name: "Google Search Console",
    description: "Search performance — queries, clicks, impressions, CTR, indexing status, crawl data.",
    category: "seo",
    logoUrl: "/tools/google-search-console.svg",
    transport: "http",
    url: "https://searchconsole.googleapis.com/mcp",
    auth: "oauth",
    credentialField: "oauthToken",
    docsUrl: "https://developers.google.com/webmaster-tools",
    officialServer: true,
  },

  // === ANALYTICS ===

  google_analytics: {
    id: "google_analytics",
    name: "Google Analytics",
    description: "Web analytics — traffic, conversions, user behavior, real-time data, audience segments, funnel analysis. GA4.",
    category: "analytics",
    logoUrl: "/tools/google-analytics.svg",
    transport: "http",
    url: "https://analyticsdata.googleapis.com/mcp",
    auth: "oauth",
    credentialField: "oauthToken",
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1",
    officialServer: true,
  },

  // === PRODUCT ANALYTICS ===

  amplitude: {
    id: "amplitude",
    name: "Amplitude",
    description: "Product analytics — charts, dashboards, cohorts, experiments, feature flags, user journeys, retention.",
    category: "product_analytics",
    logoUrl: "/tools/amplitude.svg",
    transport: "http",
    url: "https://mcp.amplitude.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://www.docs.developers.amplitude.com",
    officialServer: true,
  },

  mixpanel: {
    id: "mixpanel",
    name: "Mixpanel",
    description: "Product analytics — event tracking, funnels, flows, retention, cohorts, impact analysis.",
    category: "product_analytics",
    logoUrl: "/tools/mixpanel.svg",
    transport: "http",
    url: "https://mcp.mixpanel.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://developer.mixpanel.com",
    officialServer: false,
  },

  // === PROJECT MANAGEMENT (additional) ===

  linear: {
    id: "linear",
    name: "Linear",
    description: "Issue tracking — issues, projects, cycles, roadmaps, teams, labels. Built for fast-moving teams.",
    category: "project_management",
    logoUrl: "/tools/linear.svg",
    transport: "http",
    url: "https://mcp.linear.app",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://developers.linear.app",
    officialServer: true,
  },

  jira: {
    id: "jira",
    name: "Jira",
    description: "Project management — issues, sprints, boards, epics, workflows, JQL queries. Official Atlassian MCP.",
    category: "project_management",
    logoUrl: "/tools/jira.svg",
    transport: "http",
    url: "https://mcp.atlassian.com",
    auth: "oauth",
    credentialField: "oauthToken",
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/",
    officialServer: true,
  },

  monday: {
    id: "monday",
    name: "Monday.com",
    description: "Work management — boards, items, columns, automations, dashboards, integrations.",
    category: "project_management",
    logoUrl: "/tools/monday.svg",
    transport: "http",
    url: "https://mcp.monday.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://developer.monday.com",
    officialServer: false,
  },

  // === CRM (additional) ===

  pipedrive: {
    id: "pipedrive",
    name: "Pipedrive",
    description: "Sales CRM — deals, contacts, pipeline stages, activities, email tracking, revenue forecasting.",
    category: "crm",
    logoUrl: "/tools/pipedrive.svg",
    transport: "http",
    url: "https://mcp.pipedrive.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://developers.pipedrive.com",
    officialServer: false,
  },

  // === EMAIL MARKETING (additional) ===

  mailchimp: {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Email marketing — campaigns, audiences, templates, automations, subscriber management, analytics.",
    category: "email_marketing",
    logoUrl: "/tools/mailchimp.svg",
    transport: "http",
    url: "https://mcp.mailchimp.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://mailchimp.com/developer/",
    officialServer: false,
  },

  sendgrid: {
    id: "sendgrid",
    name: "SendGrid",
    description: "Email delivery — transactional email, marketing campaigns, analytics, templates, contact management.",
    category: "email_marketing",
    logoUrl: "/tools/sendgrid.svg",
    transport: "http",
    url: "https://mcp.sendgrid.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://docs.sendgrid.com",
    officialServer: false,
  },

  // === SUPPORT (additional) ===

  freshdesk: {
    id: "freshdesk",
    name: "Freshdesk",
    description: "Support — tickets, contacts, companies, SLA policies, canned responses, satisfaction surveys.",
    category: "support",
    logoUrl: "/tools/freshdesk.svg",
    transport: "http",
    url: "https://mcp.freshdesk.com",
    auth: "bearer",
    credentialField: "apiKey",
    docsUrl: "https://developers.freshdesk.com",
    officialServer: false,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getServerDefinition(serverId: string): MCPServerDefinition | undefined {
  return MCP_SERVERS[serverId];
}

export function getServersByCategory(category: string): MCPServerDefinition[] {
  return Object.values(MCP_SERVERS).filter((s) => s.category === category);
}

export function getAllServerIds(): string[] {
  return Object.keys(MCP_SERVERS);
}

export function getOfficialServers(): MCPServerDefinition[] {
  return Object.values(MCP_SERVERS).filter((s) => s.officialServer);
}

export default MCP_SERVERS;
