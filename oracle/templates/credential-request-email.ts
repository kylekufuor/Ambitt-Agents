import {
  T,
  emailDocument,
  section,
  letterhead,
  h1,
  paragraph,
  steps,
  button,
  optionPair,
  divider,
  signature,
  footerRows,
  signatureRoleLine,
} from "./_shared.js";

// ---------------------------------------------------------------------------
// Credential Request — "I need a login to do the job"
// ---------------------------------------------------------------------------
// This template used to run its own design system entirely: warm beige page,
// light-blue avatar, navy text, black buttons. It was the leftover of the
// retired warm-paper direction and it made the highest-trust email we send
// look like it came from a different company than the portal it links to.
// It now composes from _shared.ts like everything else.
//
// Asking for a password is the most sensitive thing an agent ever does, so the
// copy earns it: what it's for, how it's stored, how to take it back. The
// headline and body are still props (dumb renderer), only the mechanics are
// ours.
// ---------------------------------------------------------------------------

export interface CredentialRequestEmailProps {
  agentName: string;
  agentId: string;
  /** One-sentence headline — what the agent needs and why, e.g. "I need your LinkedIn login". */
  headline: string;
  /** Conversational body paragraph following the headline. */
  body: string;
  /** Direct 1Password URL the primary CTA opens. */
  openUrl: string;
  /** Recommendation row id — used by the mailto Skip reply. */
  approveActionId: string;
  /** Optional 3-step "how this works" override; defaults to a sensible standard. */
  steps?: string[];
  /** Optional role, for the letterhead and sign-off. */
  agentRole?: string;
}

export function buildCredentialRequestEmail(props: CredentialRequestEmailProps): string {
  const { agentName, agentId, headline, body, openUrl, approveActionId, agentRole } = props;
  const howItWorks = props.steps ?? [
    "The button opens an item we've already set up in your own 1Password vault.",
    "Fill it in and save. It stays in your vault, on your account.",
    "I'll pick it up on the next task. Delete the item any time and I lose access immediately.",
  ];

  const reply = (subject: string) =>
    `mailto:reply-${agentId}@ambitt.agency?subject=${encodeURIComponent(subject)}`;

  const rows = [
    section(
      letterhead({
        agentName,
        roleLine: signatureRoleLine(agentRole),
        chipLabel: "Your call",
        tone: "attention",
      }),
      30,
      0
    ),

    section(h1(headline) + paragraph(body), 26, 2),

    section(
      `<p class="dm-ink" style="margin:0 0 12px 0;font-size:16px;font-weight:600;color:${T.ink};">How this works</p>` +
        steps(howItWorks),
      12,
      4
    ),

    section(
      button("Open 1Password", openUrl) +
        `<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>` +
        optionPair(
          { label: `Ask ${agentName} first`, url: reply(`Question for ${agentName}`) },
          { label: "Not right now", url: reply(`DISMISS ${approveActionId}`) }
        ),
      16,
      0
    ),

    section(
      `<p class="dm-mute" style="margin:0;font-size:13.5px;line-height:1.6;color:${T.mute};">Nobody on our team can read what you put in there, and neither can anyone else. If you'd rather not, say so and I'll work around it.</p>`,
      18,
      0
    ),

    section(divider(24, 22) + signature(agentName, agentRole), 0, 32),
  ].join("");

  return emailDocument({
    preheader: headline,
    tone: "attention",
    rows,
    outerRows: footerRows(agentName, agentId),
  });
}
