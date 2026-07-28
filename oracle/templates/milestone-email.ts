import {
  T,
  type BaseEmailProps,
  type StatItem,
  type RecommendationItem,
  emailDocument,
  section,
  letterhead,
  h2,
  paragraph,
  statStrip,
  progressBar,
  formatDate,
  decisionCard,
  portalInvite,
  divider,
  signature,
  footerRows,
  signatureRoleLine,
} from "./_shared.js";
import { portalLink } from "../../shared/portal-links.js";

// ---------------------------------------------------------------------------
// Milestone — something the client has been working toward actually happened
// ---------------------------------------------------------------------------
// The temptation is confetti. The better move is understatement: state the
// thing, put the number next to it, and get out. Quiet confidence is what
// makes a win read as real rather than as gamification.
// ---------------------------------------------------------------------------

export interface MilestoneEmailProps extends BaseEmailProps {
  summary: string;
  milestoneValue: string;
  milestoneLabel: string;
  milestoneDate: string;
  currentProgress: number;
  nextMilestone: string;
  stats: StatItem[];
  recommendations: RecommendationItem[];
  ctaUrl: string;
  agentRole?: string;
}

export function buildMilestoneEmail(props: MilestoneEmailProps): string {
  const {
    agentName,
    agentId,
    summary,
    milestoneValue,
    milestoneLabel,
    milestoneDate,
    currentProgress,
    nextMilestone,
    stats,
    recommendations,
    ctaUrl,
    agentRole,
  } = props;

  const dateFormatted = formatDate(milestoneDate);

  const rows = [
    section(
      letterhead({
        agentName,
        roleLine: signatureRoleLine(agentRole),
        chipLabel: "Milestone",
        tone: "good",
      }),
      30,
      0
    ),

    section(
      `<p class="h1 dm-ink" style="margin:0;font-size:40px;line-height:1.05;font-weight:600;color:${T.ink};letter-spacing:-0.028em;font-variant-numeric:tabular-nums;">${milestoneValue}</p>
<p class="dm-body" style="margin:8px 0 0 0;font-size:16px;line-height:1.45;color:${T.body};">${milestoneLabel}</p>
<p class="dm-mute" style="margin:4px 0 0 0;font-size:13.5px;color:${T.mute};">${dateFormatted}</p>`,
      26,
      0
    ),

    section(paragraph(summary), 22, 0),

    stats.length > 0 ? section(statStrip(stats), 4, 4) : "",

    nextMilestone
      ? section(
          h2("What's next") +
            `<p class="dm-body" style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:${T.body};">${nextMilestone}</p>` +
            progressBar(currentProgress) +
            `<p class="dm-mute" style="margin:8px 0 0 0;font-size:13.5px;color:${T.mute};">${Math.round(currentProgress)}% of the way there</p>`,
          24,
          0
        )
      : "",

    recommendations.length > 0
      ? recommendations
          .map((rec) =>
            section(
              decisionCard({
                title: rec.title,
                description: rec.description,
                reasoning: rec.reasoning,
                primaryLabel: rec.approveLabel,
                primaryUrl: `mailto:reply-${agentId}@ambitt.agency?subject=APPROVE ${rec.approveActionId}`,
              }),
              22,
              0
            )
          )
          .join("")
      : "",

    section(
      portalInvite(
        "The whole story of how this one came together is in your portal.",
        "Look back over it",
        ctaUrl || portalLink(agentId, "overview")
      ),
      20,
      0
    ),

    section(divider(26, 22) + signature(agentName, agentRole), 0, 32),
  ].join("");

  return emailDocument({
    preheader: `${milestoneLabel}. ${milestoneValue}.`,
    tone: "good",
    rows,
    outerRows: footerRows(agentName, agentId),
  });
}
