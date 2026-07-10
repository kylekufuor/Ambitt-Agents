// ---------------------------------------------------------------------------
// portalLink — canonical deep-links into the client portal
// ---------------------------------------------------------------------------
// One place that knows the portal's base URL and route shapes, so email
// signatures and the agent's own "go set this up in your portal" guidance hand
// the client a real, correct link instead of vague prose. Base URL comes from
// CLIENT_PORTAL_URL (set on Railway), falling back to the live clean domain.
// ---------------------------------------------------------------------------

export type PortalPage = "overview" | "tools" | "communication" | "billing";

export function portalBaseUrl(): string {
  return process.env.CLIENT_PORTAL_URL ?? "https://portal.ambitt.agency";
}

/**
 * Deep-link to a page of the portal for a given agent.
 *  - overview      → the agent's page (settings, knowledge, activity)
 *  - tools         → connect tools / enter logins (add Gmail inboxes here)
 *  - communication → the Communication section (channels, signature, footer)
 *  - billing       → the client's billing page
 */
export function portalLink(agentId: string, page: PortalPage = "overview"): string {
  const base = portalBaseUrl().replace(/\/+$/, "");
  switch (page) {
    case "tools":
      return `${base}/agents/${agentId}/tools`;
    case "communication":
      return `${base}/agents/${agentId}#communication`;
    case "billing":
      return `${base}/billing`;
    case "overview":
    default:
      return `${base}/agents/${agentId}`;
  }
}
