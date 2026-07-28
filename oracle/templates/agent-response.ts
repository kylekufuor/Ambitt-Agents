import type { RuntimeOutput } from "../../shared/runtime/index.js";
import {
  T,
  emailDocument,
  section,
  letterhead,
  h2Flow,
  h3Flow,
  divider,
  statStrip,
  dataTable,
  panel,
  decisionCard,
  portalInvite,
  sourceLinksBlock,
  signature,
  footerRows,
  signatureRoleLine,
} from "./_shared.js";
import { portalLink } from "../../shared/portal-links.js";

// ---------------------------------------------------------------------------
// Agent Response — the email a client sees most
// ---------------------------------------------------------------------------
// The reply to an inbound message, and the output of a scheduled run. If only
// one template is right, it's this one.
//
// It reads as a letter from a colleague: letterhead, prose, the evidence, one
// ask, a signature. Everything visual comes from _shared.ts, so this file is
// almost entirely about turning the agent's markdown into type.
//
// Dumb renderer (CLAUDE.md rule 12). Every word here is either the agent's or
// fixed platform chrome. Nothing is generated, only formatted.
// ---------------------------------------------------------------------------

interface AgentResponseOptions {
  agentName: string;
  agentId: string;
  agentRole: string;
  clientBusinessName: string;
  responseBody: string;
  toolsUsed: RuntimeOutput["toolsUsed"];
  stats?: Array<{ value: string; label: string; delta: string; deltaType: "up" | "down" }>;
  tableHeaders?: string[];
  tableRows?: Array<{ columns: string[] }>;
  sourceLinks?: Array<{ label: string; url: string; color: string }>;
  recommendations?: Array<{
    title: string;
    description: string;
    reasoning: string;
    approveLabel: string;
    approveActionId: string;
  }>;
  proactiveInsights?: string[];
}

const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,monospace";

// ---------------------------------------------------------------------------
// Markdown, rendered as type
// ---------------------------------------------------------------------------

/** Inline markdown: `code`, **bold**, [text](url). */
function inlineMd(s: string): string {
  return s
    .replace(
      /`([^`]+)`/g,
      `<code style="font-family:${MONO};font-size:13px;background:${T.wash};color:${T.tealText};padding:2px 6px;border-radius:5px;white-space:nowrap;">$1</code>`
    )
    .replace(/\*\*([^*]+)\*\*/g, `<strong style="font-weight:600;color:${T.ink};">$1</strong>`)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      `<a href="$2" style="color:${T.tealText};text-decoration:underline;text-underline-offset:2px;">$1</a>`
    );
}

/**
 * Headings arrive from the model and sometimes carry a leading emoji. Emoji as
 * a section header is on the anti-slop list and it undercuts the whole tone, so
 * we strip it at the render layer. That enforces house style without the
 * template generating any copy of its own.
 */
function stripLeadingEmoji(text: string): string {
  return text.replace(/^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s+/u, "");
}

/** The agent's markdown body, rendered into the shared type scale. */
function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^###\s+(.*)/))) {
      closeList();
      out.push(h3Flow(inlineMd(stripLeadingEmoji(m[1]))));
    } else if ((m = line.match(/^##\s+(.*)/))) {
      closeList();
      out.push(h2Flow(inlineMd(stripLeadingEmoji(m[1]))));
    } else if (/^(---|___|\*\*\*)\s*$/.test(line)) {
      closeList();
      out.push(divider(22, 22));
    } else if ((m = line.match(/^[-•]\s+(.*)/))) {
      if (list !== "ul") {
        closeList();
        out.push(`<ul style="margin:0 0 16px 0;padding-left:22px;">`);
        list = "ul";
      }
      out.push(`<li style="margin:0 0 8px 0;padding-left:2px;">${inlineMd(m[1])}</li>`);
    } else if ((m = line.match(/^\d+\.\s+(.*)/))) {
      if (list !== "ol") {
        closeList();
        out.push(`<ol style="margin:0 0 16px 0;padding-left:24px;">`);
        list = "ol";
      }
      out.push(`<li style="margin:0 0 8px 0;padding-left:2px;">${inlineMd(m[1])}</li>`);
    } else {
      closeList();
      out.push(`<p style="margin:0 0 16px 0;">${inlineMd(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

// ---------------------------------------------------------------------------
// Tools touched
// ---------------------------------------------------------------------------
// The old version printed raw function names at the client: "google sheets
// append row", "costar pull comps". That's our plumbing on their desk. What a
// client wants to know is which of their systems we were in, so we dedupe to
// the system and show that. Normalising a name is formatting, not authoring.

const BRAND_CASING: Record<string, string> = {
  costar: "CoStar",
  loopnet: "LoopNet",
  linkedin: "LinkedIn",
  github: "GitHub",
  hubspot: "HubSpot",
  postgresql: "PostgreSQL",
  powerbi: "Power BI",
  quickbooks: "QuickBooks",
  zoominfo: "ZoomInfo",
  google_sheets: "Google Sheets",
  googlesheets: "Google Sheets",
  sheets: "Google Sheets",
  google_analytics: "Google Analytics",
  gmail: "Gmail",
  web: "Web search",
  websearch: "Web search",
  web_search: "Web search",
};

function systemName(serverId: string, toolName: string): string {
  const key = (serverId || toolName.split("_")[0] || "").toLowerCase();
  if (BRAND_CASING[key]) return BRAND_CASING[key];
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function toolsLine(toolsUsed: AgentResponseOptions["toolsUsed"]): string {
  if (toolsUsed.length === 0) return "";
  const seen = new Map<string, boolean>();
  for (const t of toolsUsed) {
    const name = systemName(t.serverId, t.toolName);
    if (!name) continue;
    seen.set(name, (seen.get(name) ?? true) && t.success);
  }
  if (seen.size === 0) return "";
  const parts = [...seen.entries()].map(([name, ok]) =>
    ok
      ? `<span style="color:${T.body};">${name}</span>`
      : `<span class="dm-warn" style="color:${T.attention};">${name} (couldn't reach)</span>`
  );
  return `<p style="margin:0;font-size:13.5px;line-height:1.6;color:${T.mute};">
    <span style="color:${T.tealText};font-weight:600;">&#10003;</span>&nbsp; Worked in ${parts.join(", ")}
  </p>`;
}

// ---------------------------------------------------------------------------

/** First sentence of the body, for the inbox preview line. */
function previewFrom(body: string): string {
  const firstProse = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith("-"));
  const text = (firstProse ?? "").replace(/[*`_[\]]/g, "");
  return text.length > 140 ? `${text.slice(0, 137).trimEnd()}...` : text;
}

export function buildAgentResponseEmail(options: AgentResponseOptions): string {
  const {
    agentName,
    agentId,
    agentRole,
    responseBody,
    toolsUsed,
    stats,
    tableHeaders,
    tableRows,
    sourceLinks,
    recommendations,
    proactiveInsights,
  } = options;

  const tools = toolsLine(toolsUsed);
  const hasStats = !!stats && stats.length > 0;
  const hasTable = !!tableHeaders && !!tableRows && tableRows.length > 0;
  const hasRecs = !!recommendations && recommendations.length > 0;
  const hasInsights = !!proactiveInsights && proactiveInsights.length > 0;
  const hasSources = !!sourceLinks && sourceLinks.length > 0;

  const rows = [
    section(letterhead({ agentName, roleLine: signatureRoleLine(agentRole) }), 30, 0),

    // The letter itself.
    section(
      `<div style="font-size:16px;line-height:1.62;color:${T.body};" class="dm-body">${renderMarkdown(responseBody)}</div>`,
      22,
      6
    ),

    hasStats ? section(statStrip(stats!), 6, 4) : "",
    hasTable ? section(dataTable(tableHeaders!, tableRows!), 18, 6) : "",

    // The one ask.
    hasRecs
      ? recommendations!
          .map((rec) =>
            section(
              decisionCard({
                title: rec.title,
                description: rec.description,
                reasoning: rec.reasoning,
                primaryLabel: rec.approveLabel,
                primaryUrl: `mailto:reply-${agentId}@ambitt.agency?subject=APPROVE ${rec.approveActionId}`,
              }),
              18,
              0
            )
          )
          .join("")
      : "",

    hasInsights
      ? section(
          panel(
            `<p class="dm-ink" style="margin:0 0 8px 0;font-size:15px;font-weight:600;color:${T.ink};">Worth knowing</p>` +
              proactiveInsights!
                .map(
                  (i) =>
                    `<p class="dm-body" style="margin:0 0 7px 0;font-size:14.5px;line-height:1.55;color:${T.body};">${i}</p>`
                )
                .join(""),
            "attention"
          ),
          18,
          0
        )
      : "",

    hasSources ? section(sourceLinksBlock(sourceLinks!), 18, 0) : "",

    // The portal, offered. Only when there's something there worth seeing.
    hasTable || hasStats
      ? section(
          portalInvite(
            "Everything above is saved in your portal, with the working behind it.",
            "Take a look",
            portalLink(agentId, "overview")
          ),
          20,
          0
        )
      : "",

    // The receipt: which of their systems we were in. Quiet, near the sign-off,
    // the way a colleague mentions where they looked rather than leading with it.
    section(divider(26, 18) + (tools ? `${tools}<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>` : "") + signature(agentName, agentRole), 0, 32),
  ].join("");

  return emailDocument({
    preheader: previewFrom(responseBody),
    tone: "brand",
    rows,
    outerRows: footerRows(agentName, agentId),
  });
}
