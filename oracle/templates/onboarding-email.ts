// ---------------------------------------------------------------------------
// Onboarding Email — "How to work with me"
// ---------------------------------------------------------------------------
// Sent 5 minutes after the welcome email. Teaches the client how to operate
// with their agent day-to-day: how to send tasks, how to share more docs,
// when scheduled runs fire, how to escalate.
//
// Body is AI-personalized by oracle/onboarding-content.ts using what the
// agent learned about the business. Template is a dumb renderer, it just wraps
// the body in the house shell.
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

interface OnboardingEmailOptions {
  agentName: string;
  agentId: string;
  preferredName: string;
  clientBusinessName: string;
  /** AI-generated body — plain text with "- " bullet lines for unordered lists. */
  body: string;
  /** Optional role, for the letterhead and sign-off. */
  agentRole?: string;
}

export function buildOnboardingEmail(options: OnboardingEmailOptions): {
  subject: string;
  html: string;
} {
  const { agentName, agentId, preferredName, body, agentRole } = options;

  const subject = `How to work with ${agentName}`;

  const rows = [
    section(letterhead({ agentName, roleLine: signatureRoleLine(agentRole) }), 30, 0),
    section(paragraph(`Hi ${preferredName},`) + richText(body), 24, 4),
    section(divider(22, 22) + signature(agentName, agentRole), 0, 32),
  ].join("");

  const html = emailDocument({
    preheader: "A quick note on how we'll work together day to day.",
    tone: "brand",
    rows,
    outerRows: footerRows(agentName, agentId, { systemEmail: true }),
  });

  return { subject, html };
}
