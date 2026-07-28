import {
  T,
  type BaseEmailProps,
  emailDocument,
  section,
  letterhead,
  h2,
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
// Permission — the agent is asking for access to one of the client's systems
// ---------------------------------------------------------------------------
// Access requests are where trust is won or lost, so the scope has to be
// unmistakable: what, how much, and what it's for. Each permission is a row
// with the access level called out on the right, and the closing line commits
// to the limits in words rather than in a legal footer.
// ---------------------------------------------------------------------------

interface PermissionItem {
  toolName: string;
  accessLevel: string;
  description: string;
}

export interface PermissionEmailProps extends BaseEmailProps {
  summary: string;
  permissions: PermissionItem[];
  intentSteps: Array<{ step: string }>;
  approveActionId: string;
  ctaUrl: string;
  agentRole?: string;
}

/** One system, its scope, and what it's for. */
function permissionRow(p: PermissionItem): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="dm-wash" style="width:100%;background-color:${T.wash};border-radius:10px;margin:0 0 8px 0;">
<tr><td style="padding:16px 18px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
    <tr>
      <td valign="top" style="vertical-align:top;">
        <p class="dm-ink" style="margin:0;font-size:15px;font-weight:600;color:${T.ink};">${p.toolName}</p>
      </td>
      <td align="right" valign="top" style="text-align:right;vertical-align:top;">
        <span style="display:inline-block;font-size:12.5px;font-weight:600;color:${T.tealText};background-color:${T.washBrand};padding:4px 10px;border-radius:20px;white-space:nowrap;">${p.accessLevel}</span>
      </td>
    </tr>
  </table>
  <p class="dm-body" style="margin:6px 0 0 0;font-size:14.5px;line-height:1.55;color:${T.body};">${p.description}</p>
</td></tr></table>`;
}

export function buildPermissionEmail(props: PermissionEmailProps): string {
  const { agentName, agentId, summary, permissions, intentSteps, approveActionId, ctaUrl, agentRole } =
    props;

  const reply = (subject: string) =>
    `mailto:reply-${agentId}@ambitt.agency?subject=${encodeURIComponent(subject)}`;

  const rows = [
    section(
      letterhead({
        agentName,
        roleLine: signatureRoleLine(agentRole),
        chipLabel: "Access request",
        tone: "attention",
      }),
      30,
      0
    ),

    section(paragraph(summary), 22, 0),

    permissions.length > 0
      ? section(h2("What I'm asking for") + permissions.map(permissionRow).join(""), 10, 0)
      : "",

    intentSteps.length > 0
      ? section(h2("What I'd use it for") + steps(intentSteps.map((s) => s.step)), 18, 4)
      : "",

    section(
      button("Grant access", ctaUrl || reply(`APPROVE ${approveActionId}`)) +
        `<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>` +
        optionPair(
          { label: "I've got a question", url: reply(`Question about ${approveActionId}`) },
          { label: "No thanks", url: reply(`DISMISS ${approveActionId}`) }
        ),
      18,
      0
    ),

    section(
      `<p class="dm-mute" style="margin:0;font-size:13.5px;line-height:1.6;color:${T.mute};">You can take this back at any time and I'll carry on without it. I'll never ask for more than what's listed here without asking you again.</p>`,
      18,
      0
    ),

    section(divider(24, 22) + signature(agentName, agentRole), 0, 32),
  ].join("");

  return emailDocument({
    preheader: summary.length > 140 ? `${summary.slice(0, 137).trimEnd()}...` : summary,
    tone: "attention",
    rows,
    outerRows: footerRows(agentName, agentId),
  });
}
