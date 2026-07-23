// ---------------------------------------------------------------------------
// Communication Settings — per-agent channel routing (typed shape + safe parser)
// ---------------------------------------------------------------------------
// A ROUTING-PREFERENCE layer. It stores which channel plays each role, NOT the
// channel's credentials — those live where they already do (Client.whatsappNumber
// / Client.email for platform natives; Composio for connected tools).
//
// Persisted on Agent.communicationSettings (Json?). Null field, or a null role,
// means "use today's default behavior" — this is fully backward-compatible.
//
// Roles:
//   inbound.allowedSenders — extra email addresses allowed to email the agent and
//                            get a reply (extends the owner-client check in
//                            checkInboundAuth). Empty = owner-only, as today.
//   mfaRelay — how the agent asks the human for a verification code.
//              null = today's default (platform WhatsApp first, email fallback).
//   outbound — which identity the agent sends client-facing comms from.
//              null = today's default (platform email from Agent.email).
// ---------------------------------------------------------------------------

import { z } from "zod";

/** Where a role's channel comes from. */
export const ChannelKind = z.enum(["platform_email", "platform_whatsapp", "connected"]);
export type ChannelKind = z.infer<typeof ChannelKind>;

/**
 * Points a role at a specific channel.
 *  - platform_email    → Ambitt email (Agent.email out / Client.email for MFA)
 *  - platform_whatsapp → Ambitt Twilio WhatsApp (Client.whatsappNumber)
 *  - connected         → a channelType-tagged connected tool; `slug` is the tool
 *                        (e.g. "gmail"), `connectionId` the Composio account,
 *                        `address` the human-readable identity for display/send-as
 */
export const ChannelRef = z.object({
  kind: ChannelKind,
  slug: z.string().optional(),
  connectionId: z.string().optional(),
  address: z.string().optional(),
});
export type ChannelRef = z.infer<typeof ChannelRef>;

export const CommunicationSettings = z.object({
  inbound: z
    .object({
      // stored lowercased + de-duped by normalizeSettings()
      allowedSenders: z.array(z.string()).default([]),
    })
    .default({ allowedSenders: [] }),
  mfaRelay: ChannelRef.nullable().default(null),
  outbound: ChannelRef.nullable().default(null),

  // --- Outbound content policy (applies to agent-sent external email) ---
  // Signature block appended to outbound emails (name, title, phone, booking
  // link). Plain text. Null = the agent's own sign-off, as today.
  signature: z.string().nullable().default(null),
  // Required footer — legal/compliance boilerplate (physical address for
  // CAN-SPAM, unsubscribe line, disclaimers). Appended after the signature on
  // every external send. Null = none.
  footer: z.string().nullable().default(null),
  // Auto-BCC on every external send — e.g. a CRM email-dropbox address so each
  // outbound is logged where the client already works. Empty = no auto-BCC.
  bccAddresses: z.array(z.string()).default([]),

  // --- Outbound seatbelt overrides (per-agent circuit-breaker tuning) ---
  // Optional per-agent overrides for the outbound seatbelt caps. Absent = use
  // SEATBELT_DEFAULTS. Values are bounded by a safety floor/ceiling at resolve
  // time (see resolveSeatbeltConfig in seatbelts.ts) — a client can loosen a cap
  // to avoid false pauses but can never disable the circuit breaker. Optional so
  // existing settings (and DEFAULT_COMMUNICATION_SETTINGS) stay unchanged.
  seatbelts: z
    .object({
      shortMax: z.number().int().positive(),
      hourlyMax: z.number().int().positive(),
      repetitionMax: z.number().int().positive(),
      // Durable per-client relay-SMS (2FA) cap per hour — see seatbelts.ts.
      smsHourlyMax: z.number().int().positive(),
    })
    .partial()
    .optional(),
});
export type CommunicationSettings = z.infer<typeof CommunicationSettings>;

/** The zero-config default: behaves exactly like the platform did before. */
export const DEFAULT_COMMUNICATION_SETTINGS: CommunicationSettings = {
  inbound: { allowedSenders: [] },
  mfaRelay: null,
  outbound: null,
  signature: null,
  footer: null,
  bccAddresses: [],
};

/**
 * Parse whatever is on Agent.communicationSettings (unknown JSON) into a fully
 * populated, typed CommunicationSettings. NEVER throws — malformed or partial
 * data falls back to defaults so a bad row can't break a run.
 */
export function parseCommunicationSettings(raw: unknown): CommunicationSettings {
  if (raw == null) return structuredCloneDefaults();
  const result = CommunicationSettings.safeParse(raw);
  if (!result.success) return structuredCloneDefaults();
  return normalizeSettings(result.data);
}

/** Lowercase + de-dupe email lists; drop blanks; trim free text. */
export function normalizeSettings(s: CommunicationSettings): CommunicationSettings {
  const dedupeEmails = (list: string[] | undefined) =>
    Array.from(
      new Set((list ?? []).map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0)),
    );
  const trimOrNull = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  };
  return {
    inbound: { allowedSenders: dedupeEmails(s.inbound?.allowedSenders) },
    mfaRelay: s.mfaRelay ?? null,
    outbound: s.outbound ?? null,
    signature: trimOrNull(s.signature),
    footer: trimOrNull(s.footer),
    bccAddresses: dedupeEmails(s.bccAddresses),
    // Preserve per-agent seatbelt overrides when present; absent stays absent
    // (fully backward-compatible — old settings have no seatbelts field).
    ...(s.seatbelts ? { seatbelts: s.seatbelts } : {}),
  };
}

function structuredCloneDefaults(): CommunicationSettings {
  return { ...DEFAULT_COMMUNICATION_SETTINGS, inbound: { allowedSenders: [] }, bccAddresses: [] };
}
