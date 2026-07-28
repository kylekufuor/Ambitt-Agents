import {
  T,
  type BaseEmailProps,
  type SourceLink,
  emailDocument,
  section,
  letterhead,
  h2,
  paragraph,
  steps,
  panel,
  button,
  optionPair,
  sourceLinksBlock,
  divider,
  signature,
  footerRows,
  signatureRoleLine,
} from "./_shared.js";

// ---------------------------------------------------------------------------
// Error — something we do stopped working
// ---------------------------------------------------------------------------
// The one email where tone matters more than layout. It leads with plain
// language about what the client actually lost, puts the technical detail in a
// quiet mono block underneath for anyone who wants it, and says what happens
// next without making the client feel it's their mess to clean up.
//
// No red banner. A red rule and a chip is enough; shouting about an expired
// login makes us look fragile.
// ---------------------------------------------------------------------------

export interface ErrorEmailProps extends BaseEmailProps {
  summary: string;
  errorCode: string;
  errorMessage: string;
  errorTime: string;
  recoverySteps: Array<{ step: string }>;
  sourceLinks: SourceLink[];
  retryActionId: string;
  ctaUrl: string;
  agentRole?: string;
}

const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,monospace";

export function buildErrorEmail(props: ErrorEmailProps): string {
  const {
    agentName,
    agentId,
    summary,
    errorCode,
    errorMessage,
    errorTime,
    recoverySteps,
    sourceLinks,
    retryActionId,
    ctaUrl,
    agentRole,
  } = props;

  const when = new Date(errorTime).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const reply = (subject: string) =>
    `mailto:reply-${agentId}@ambitt.agency?subject=${encodeURIComponent(subject)}`;

  const rows = [
    section(
      letterhead({
        agentName,
        roleLine: signatureRoleLine(agentRole),
        chipLabel: "Something broke",
        tone: "problem",
      }),
      30,
      0
    ),

    section(paragraph(summary), 22, 0),

    recoverySteps.length > 0
      ? section(h2("How we get it back") + steps(recoverySteps.map((s) => s.step)), 10, 4)
      : "",

    section(
      button("Try it again now", reply(`RETRY ${retryActionId}`)) +
        `<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>` +
        optionPair(
          { label: "Fix the connection", url: ctaUrl },
          { label: "Leave it for now", url: reply(`DISMISS ${retryActionId}`) }
        ),
      16,
      0
    ),

    // Technical detail, deliberately quiet and last. Present for whoever wants
    // it, never the first thing a client reads about their own business.
    section(
      panel(
        `<p class="dm-mute" style="margin:0 0 6px 0;font-size:12.5px;color:${T.mute};">Technical detail, if it's useful</p>
<p style="margin:0;font-family:${MONO};font-size:12.5px;line-height:1.6;color:${T.body};">${errorCode}: ${errorMessage}</p>
<p class="dm-mute" style="margin:6px 0 0 0;font-size:12.5px;color:${T.mute};">${when}</p>`
      ),
      22,
      0
    ),

    sourceLinks.length > 0 ? section(sourceLinksBlock(sourceLinks), 16, 0) : "",

    section(divider(24, 22) + signature(agentName, agentRole), 0, 32),
  ].join("");

  return emailDocument({
    preheader: summary.length > 140 ? `${summary.slice(0, 137).trimEnd()}...` : summary,
    tone: "problem",
    rows,
    outerRows: footerRows(agentName, agentId),
  });
}
