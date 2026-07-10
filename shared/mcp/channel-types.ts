// ---------------------------------------------------------------------------
// Communication channel-type resolver
// ---------------------------------------------------------------------------
// Single source of truth for "is this tool a personal comms channel, and which
// kind?". Drives which connected tools surface in an agent's Communication
// Settings (inbound / MFA relay / outbound roles).
//
// Covers BOTH:
//   - MCP-registry tools     — via the `channelType` field on the registry entry
//   - Composio toolkits      — via the curated map below (Gmail, Outlook, etc.
//                              are Composio toolkits and are NOT in the MCP
//                              registry, yet Gmail is the primary send-as case)
//
// Curated on purpose: Composio's own category is unreliable and doesn't tell us
// the channel kind (email vs chat vs sms), which the MFA-relay role needs so it
// can prefer real-time channels over email.
// ---------------------------------------------------------------------------

import type { MCPChannelType } from "./types.js";
import { MCP_SERVERS } from "./registry.js";

/**
 * Curated slug → channel type for Composio toolkits (and any tool not in the MCP
 * registry). Keys are lowercased tool/toolkit slugs. Add aliases liberally —
 * Composio slugs vary (gmail / googlemail, outlook / office365 / microsoft).
 */
const COMPOSIO_CHANNEL_TYPES: Record<string, MCPChannelType> = {
  // email
  gmail: "email",
  googlemail: "email",
  google_mail: "email",
  outlook: "email",
  microsoft_outlook: "email",
  office365: "email",
  office_365: "email",
  microsoft365: "email",
  resend: "email",
  sendgrid: "email",
  mailgun: "email",
  postmark: "email",
  front: "email",

  // chat
  slack: "chat",
  discord: "chat",
  telegram: "chat",
  microsoft_teams: "chat",
  teams: "chat",
  intercom: "chat",

  // sms / phone
  twilio: "sms",
  messagebird: "sms",
  vonage: "sms",
  whatsapp: "chat",
  twilio_whatsapp: "chat",
};

/** Normalize a tool/toolkit slug for lookup (lowercase, trim, spaces→underscore). */
function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Resolve the communication channel type for a tool slug, or null if the tool is
 * not a personal comms channel. Consults the MCP registry first (native tools),
 * then the curated Composio map.
 */
export function channelTypeForSlug(slug: string): MCPChannelType | null {
  if (!slug) return null;
  const key = normalizeSlug(slug);

  // Native MCP-registry tools carry the tag on their definition.
  const server = MCP_SERVERS[slug] ?? MCP_SERVERS[key];
  if (server?.channelType) return server.channelType;

  return COMPOSIO_CHANNEL_TYPES[key] ?? null;
}

/** True if the tool can act as a personal communication channel. */
export function isCommunicationChannel(slug: string): boolean {
  return channelTypeForSlug(slug) !== null;
}

/** Real-time channels (chat/sms) are preferred for the MFA-relay role. */
export function isRealtimeChannel(slug: string): boolean {
  const t = channelTypeForSlug(slug);
  return t === "chat" || t === "sms";
}
