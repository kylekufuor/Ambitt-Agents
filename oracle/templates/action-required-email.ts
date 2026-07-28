import {
  T,
  type BaseEmailProps,
  emailDocument,
  section,
  letterhead,
  h2,
  paragraph,
  steps,
  panel,
  button,
  optionPair,
  divider,
  signature,
  footerRows,
  signatureRoleLine,
} from "./_shared.js";

// ---------------------------------------------------------------------------
// Action Required — the agent wants a yes before it does something
// ---------------------------------------------------------------------------
// This is the highest-stakes email we send: the client is being asked to
// authorise something that happens under their name. So it has to be legible
// in five seconds and completely honest about the consequence.
//
// Structure: what I want to do, the exact steps, why, what it costs you if
// you say yes, then one button. Amber tone on the rule and chip, never a
// full-bleed warning band. A colleague asking permission, not a system alarm.
// ---------------------------------------------------------------------------

export interface ActionRequiredEmailProps extends BaseEmailProps {
  summary: string;
  actionSteps: Array<{ step: string }>;
  reasoning: string;
  impactStatement: string;
  approveActionId: string;
  ctaUrl: string;
  agentRole?: string;
}

export function buildActionRequiredEmail(props: ActionRequiredEmailProps): string {
  const { agentName, agentId, summary, actionSteps, reasoning, impactStatement, approveActionId, agentRole } =
    props;

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

    section(paragraph(summary), 22, 0),

    actionSteps.length > 0
      ? section(h2("Exactly what I'd do") + steps(actionSteps.map((s) => s.step)), 10, 4)
      : "",

    section(h2("Why now") + paragraph(reasoning), 14, 0),

    // The consequence, stated plainly. This is the sentence that earns trust.
    section(
      panel(
        `<p class="dm-ink" style="margin:0;font-size:15px;line-height:1.6;font-weight:600;color:${T.attention};">Before you say yes</p>
<p class="dm-body" style="margin:6px 0 0 0;font-size:15px;line-height:1.6;color:${T.body};">${impactStatement}</p>`,
        "attention"
      ),
      14,
      0
    ),

    section(
      button("Yes, go ahead", reply(`APPROVE ${approveActionId}`)) +
        `<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>` +
        optionPair(
          { label: "I've got a question", url: reply(`Question about ${approveActionId}`) },
          { label: "Not this one", url: reply(`DISMISS ${approveActionId}`) }
        ),
      22,
      0
    ),

    section(
      `<p class="dm-mute" style="margin:0;font-size:13.5px;line-height:1.6;color:${T.mute};">Nothing happens until you reply. If you'd rather talk it through first, just say so.</p>`,
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
