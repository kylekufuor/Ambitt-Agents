// ---------------------------------------------------------------------------
// Checkpoint Email — T+3 check-in, T+7 capability highlight, T+14 feedback
// ---------------------------------------------------------------------------
// Single renderer for all three onboarding-checkpoint emails. Body is always
// AI-personalized by oracle/onboarding-content.ts. Template is a dumb wrapper.
//
// Each `kind` gets its own default subject line and preview line but otherwise
// shares the same shell, so the rhythm across the 14-day onboarding is one
// continuous conversation rather than three different-looking emails.
// ---------------------------------------------------------------------------

import {
  emailDocument,
  section,
  letterhead,
  paragraph,
  richText,
  divider,
  signature,
  footerRows,
  signatureRoleLine,
} from "./_shared.js";

export type CheckpointKind = "checkin_3day" | "highlight_7day" | "feedback_14day";

interface CheckpointEmailOptions {
  kind: CheckpointKind;
  agentName: string;
  agentId: string;
  preferredName: string;
  clientBusinessName: string;
  /** AI-generated body — plain text with "- " bullet lines for unordered lists. */
  body: string;
  /** Optional subject override; defaults based on kind. */
  subject?: string;
  /** Optional role, for the letterhead and sign-off. */
  agentRole?: string;
}

const DEFAULT_SUBJECTS: Record<CheckpointKind, string> = {
  checkin_3day: "Quick check-in",
  highlight_7day: "One more thing I can do",
  feedback_14day: "How's it going after two weeks?",
};

const PREHEADERS: Record<CheckpointKind, string> = {
  checkin_3day: "Three days in. Nothing needed from you unless something's off.",
  highlight_7day: "Something I can take off your plate that you haven't asked for yet.",
  feedback_14day: "Two weeks in. I'd like to know what's working and what isn't.",
};

export function buildCheckpointEmail(options: CheckpointEmailOptions): {
  subject: string;
  html: string;
} {
  const { kind, agentName, agentId, preferredName, body, agentRole } = options;
  const subject = options.subject ?? DEFAULT_SUBJECTS[kind];

  const rows = [
    section(letterhead({ agentName, roleLine: signatureRoleLine(agentRole) }), 30, 0),
    section(paragraph(`Hi ${preferredName},`) + richText(body), 24, 4),
    section(divider(22, 22) + signature(agentName, agentRole), 0, 32),
  ].join("");

  const html = emailDocument({
    preheader: PREHEADERS[kind],
    tone: "brand",
    rows,
    outerRows: footerRows(agentName, agentId, { systemEmail: true }),
  });

  return { subject, html };
}
