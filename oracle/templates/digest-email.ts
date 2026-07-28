import {
  T,
  type BaseEmailProps,
  type StatItem,
  type SourceLink,
  type RecommendationItem,
  emailDocument,
  section,
  letterhead,
  h2,
  paragraph,
  statStrip,
  dataTable,
  decisionCard,
  portalInvite,
  sourceLinksBlock,
  divider,
  signature,
  footerRows,
  signatureRoleLine,
} from "./_shared.js";
import { portalLink } from "../../shared/portal-links.js";

// ---------------------------------------------------------------------------
// Digest — the periodic round-up
// ---------------------------------------------------------------------------
// Reads as a note from someone reporting in, not as a generated report. The
// summary leads, the numbers back it up, the task table is the receipt, and
// there's at most one thing to decide.
// ---------------------------------------------------------------------------

interface TaskRow {
  task: string;
  output: string;
  status: string;
  statusType: "done" | "progress" | "warn";
}

export interface DigestEmailProps extends BaseEmailProps {
  periodLabel: string;
  summary: string;
  stats: StatItem[];
  tasksTable: TaskRow[];
  sourceLinks: SourceLink[];
  recommendations: RecommendationItem[];
  ctaUrl: string;
  agentRole?: string;
}

/** Status as a coloured word, not an icon. Icons in a table row read as chrome. */
function statusCell(t: TaskRow): string {
  const color =
    t.statusType === "done" ? T.tealText : t.statusType === "warn" ? T.attention : T.mute;
  // The dark-mode class has to ride along, or the blanket .dm-body descendant
  // rule repaints every status the same grey and the column stops meaning anything.
  const cls = t.statusType === "done" ? "dm-ok" : t.statusType === "warn" ? "dm-warn" : "dm-mute";
  return `<span class="${cls}" style="color:${color};font-weight:500;white-space:nowrap;">${t.status}</span>`;
}

export function buildDigestEmail(props: DigestEmailProps): string {
  const {
    agentName,
    agentId,
    periodLabel,
    summary,
    stats,
    tasksTable,
    sourceLinks,
    recommendations,
    ctaUrl,
    agentRole,
  } = props;

  const rows = [
    section(
      letterhead({
        agentName,
        roleLine: signatureRoleLine(agentRole),
        chipLabel: periodLabel,
      }),
      30,
      0
    ),

    section(paragraph(summary), 24, 2),

    stats.length > 0 ? section(statStrip(stats), 4, 4) : "",

    tasksTable.length > 0
      ? section(
          h2("What I worked on") +
            dataTable(
              ["Task", "Result", "Status"],
              tasksTable.map((t) => ({ columns: [t.task, t.output, statusCell(t)] }))
            ),
          26,
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

    sourceLinks.length > 0 ? section(sourceLinksBlock(sourceLinks), 20, 0) : "",

    section(
      portalInvite(
        "The full detail behind all of this is in your portal, whenever you want it.",
        "Open the detail",
        ctaUrl || portalLink(agentId, "overview")
      ),
      20,
      0
    ),

    section(divider(26, 22) + signature(agentName, agentRole), 0, 32),
  ].join("");

  return emailDocument({
    preheader: summary.length > 140 ? `${summary.slice(0, 137).trimEnd()}...` : summary,
    tone: "brand",
    rows,
    outerRows: footerRows(agentName, agentId),
  });
}
