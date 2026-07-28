// Run: node_modules/.bin/tsx oracle/templates/emdash.test.ts
//
// Pure render test for the em-dash ban on PLATFORM-AUTHORED copy. No server, no
// DB, no network: every template here is a dumb renderer, so we can just call it.
//
// WHY THIS EXISTS: shared/scrub-emdash.ts rewrites U+2014 out of client-facing
// copy at send time. That net is for MODEL output. Every dash it rewrites in
// copy WE wrote is a double failure: the rewrite reads worse than a sentence
// written without the dash in the first place ("This one is on us, it doesn't
// count" instead of "This one is on us. It doesn't count"), and at a line edge
// the scrub DELETES the dash outright, which is how "— Arthur" shipped as a
// bare name with no sign-off shape at all. It also drowns the scrub's warn log,
// which is the only signal we have that a model drifted off the rule.
//
// So: feed every template props that contain no em dash, and assert the
// rendered HTML contains none either. A dash in the output can then only have
// come from our own chrome. (A dash a model puts in `body` / `summary` / a
// recommendation is the scrub's job, not this test's.)
import { buildWelcomeEmail } from "./welcome-email.js";
import { buildOnboardingEmail } from "./onboarding-email.js";
import { buildCheckpointEmail, type CheckpointKind } from "./checkpoint-email.js";
import { buildAgentResponseEmail } from "./agent-response.js";
import { buildActionRequiredEmail } from "./action-required-email.js";
import { buildAlertEmail } from "./alert-email.js";
import { buildDigestEmail } from "./digest-email.js";
import { buildErrorEmail } from "./error-email.js";
import { buildMilestoneEmail } from "./milestone-email.js";
import { buildPermissionEmail } from "./permission-email.js";
import { buildProgressEmail } from "./progress-email.js";
import { buildCredentialRequestEmail } from "./credential-request-email.js";
import { renderProposalEmail } from "./proposal-email/render.js";
import { signatureRoleLine, footerBlock } from "./_shared.js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const EM_DASH = "—";
// The entity spellings render as an em dash in an email client, so they are the
// same offence written differently.
const EM_DASH_ENTITY = /&mdash;|&#8212;|&#x2014;/i;

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
}

/** Every line of the render that still carries a dash, for a useful failure. */
function offendingLines(html: string): string[] {
  return html
    .split("\n")
    .filter((l) => l.includes(EM_DASH) || EM_DASH_ENTITY.test(l))
    .map((l) => l.trim().slice(0, 160));
}

function noEmDash(name: string, html: string): void {
  const hits = offendingLines(html);
  ok(`${name}: renders zero em dashes`, hits.length === 0, hits.join("\n        "));
}

// --- Shared props. Deliberately dash-free: anything in the output is ours. ---
const base = {
  agentName: "Arthur",
  agentId: "agent_1",
  clientId: "client_1",
  clientName: "Casey",
  productName: "Acme Realty",
};
const CTA = "https://portal.ambitt.agency/agents/agent_1";

// --- 1. The three templates whose sign-off carried the dash ----------------

{
  const { html } = buildWelcomeEmail({
    agentName: base.agentName,
    agentId: base.agentId,
    agentPurpose: "CRE sourcing agent. Never price a deal without approval.",
    clientFirstName: "Casey",
    clientBusinessName: "Acme Realty",
    tools: ["Gmail", "HubSpot"],
    capabilities: ["Pull weekly comps", "Draft owner outreach"],
    briefText: "Acme has 14 listings live.\n- 3 went under contract this month",
    briefHasPdf: true,
  });
  noEmDash("welcome", html);
  ok(
    "welcome: sign-off is name then role, no leading dash",
    html.includes(">Arthur</p>") && html.includes(">CRE sourcing agent at Ambitt Agents</p>"),
    "sign-off block not found in the render",
  );
}

{
  const { html } = buildOnboardingEmail({
    agentName: base.agentName,
    agentId: base.agentId,
    preferredName: "Casey",
    clientBusinessName: "Acme Realty",
    body: "Reply to any email and I'll pick it up.\n- Send DOCS to share files",
  });
  noEmDash("onboarding", html);
  ok(
    "onboarding: sign-off is name then neutral role, no leading dash",
    html.includes(">Arthur</p>") && html.includes(">Your agent at Ambitt Agents</p>"),
    "sign-off block not found in the render",
  );
  ok(
    "onboarding: the on-us line reads as two sentences",
    html.includes("This one is on us. It doesn't count toward your monthly interactions."),
  );
}

for (const kind of ["checkin_3day", "highlight_7day", "feedback_14day"] as CheckpointKind[]) {
  const { html } = buildCheckpointEmail({
    kind,
    agentName: base.agentName,
    agentId: base.agentId,
    preferredName: "Casey",
    clientBusinessName: "Acme Realty",
    body: "Three days in, here's where we are.\n- 12 owners contacted",
  });
  noEmDash(`checkpoint (${kind})`, html);
  ok(
    `checkpoint (${kind}): sign-off is name then neutral role, no leading dash`,
    html.includes(">Arthur</p>") && html.includes(">Your agent at Ambitt Agents</p>"),
  );
}

// --- 2. Every other client-facing email template ---------------------------

noEmDash(
  "agent-response",
  buildAgentResponseEmail({
    agentName: base.agentName,
    agentId: base.agentId,
    agentRole: "CRE sourcing",
    clientBusinessName: "Acme Realty",
    responseBody: "Here are the three comps you asked for.\n\n## Proactive insights\n- Rents are up 4%",
    toolsUsed: [{ serverId: "composio", toolName: "gmail_send", success: true }],
  }),
);

noEmDash(
  "action-required",
  buildActionRequiredEmail({
    ...base,
    summary: "I'd like to send the outreach list to 12 owners.",
    actionSteps: [{ step: "Email 12 owners" }],
    reasoning: "They all match the brief.",
    impactStatement: "These changes will be made on your behalf once you approve.",
    approveActionId: "act_1",
    ctaUrl: CTA,
  }),
);

noEmDash(
  "alert",
  buildAlertEmail({
    ...base,
    summary: "Outbound volume spiked.",
    metricValue: "31",
    metricLabel: "Emails sent",
    metricDelta: "+310%",
    detectedAt: new Date("2026-07-28T14:00:00Z").toISOString(),
    checksTable: [{ signal: "Sends per hour", status: "Over cap", statusType: "critical" }],
    sourceLinks: [{ label: "Portal", url: CTA, color: "#00b3b3" }],
    ctaUrl: CTA,
  }),
);

noEmDash(
  "digest",
  buildDigestEmail({
    ...base,
    periodLabel: "This week",
    summary: "Twelve owners contacted, three replies.",
    stats: [{ value: "12", label: "Owners", delta: "+4", deltaType: "up" }],
    tasksTable: [{ task: "Owner outreach", output: "12 sent", status: "Done", statusType: "done" }],
    sourceLinks: [{ label: "Portal", url: CTA, color: "#00b3b3" }],
    recommendations: [
      {
        title: "Widen the radius",
        description: "Five more submarkets fit the brief.",
        reasoning: "Same profile, no extra cost.",
        approveLabel: "Do it",
        approveActionId: "rec_1",
      },
    ],
    ctaUrl: CTA,
  }),
);

noEmDash(
  "error",
  buildErrorEmail({
    ...base,
    summary: "A tool call failed and I couldn't finish the run.",
    errorCode: "TOOL_TIMEOUT",
    errorMessage: "CoStar export timed out",
    errorTime: new Date("2026-07-28T14:00:00Z").toISOString(),
    recoverySteps: [{ step: "Retry the run" }],
    sourceLinks: [],
    retryActionId: "err_1",
    ctaUrl: CTA,
  }),
);

noEmDash(
  "milestone",
  buildMilestoneEmail({
    ...base,
    summary: "You crossed 100 owners contacted.",
    milestoneValue: "100",
    milestoneLabel: "Owners contacted",
    milestoneDate: new Date("2026-07-28T14:00:00Z").toISOString(),
    currentProgress: 62,
    nextMilestone: "250 owners",
    stats: [{ value: "100", label: "Owners", delta: "+18", deltaType: "up" }],
    recommendations: [],
    ctaUrl: CTA,
  }),
);

noEmDash(
  "permission",
  buildPermissionEmail({
    ...base,
    summary: "I need access to your HubSpot account to log the calls.",
    permissions: [{ toolName: "HubSpot", accessLevel: "OAuth", description: "Read and write contacts." }],
    intentSteps: [{ step: "Log every call against the right contact" }],
    approveActionId: "perm_1",
    ctaUrl: CTA,
  }),
);

noEmDash(
  "progress",
  buildProgressEmail({
    ...base,
    dayNumber: 3,
    totalDays: 7,
    summary: "Setup is on track.",
    progressItems: [{ label: "Tools connected", pct: 60 }],
    needsFromClient: [{ item: "Connect HubSpot" }],
    ctaUrl: CTA,
  }),
);

noEmDash(
  "credential-request",
  buildCredentialRequestEmail({
    agentName: base.agentName,
    agentId: base.agentId,
    headline: "I need your CoStar login",
    body: "It's the last thing standing between me and the comps.",
    openUrl: CTA,
    approveActionId: "cred_1",
  }),
);

// --- 3. The shared footer (rides on every template) ------------------------

noEmDash("footerBlock (billable)", footerBlock("Arthur", "agent_1"));
noEmDash("footerBlock (non-billable)", footerBlock("Arthur", "agent_1", { systemEmail: true }));
ok(
  "footerBlock: the on-us line reads as two sentences",
  footerBlock("Arthur", "agent_1", { systemEmail: true }).includes(
    "This one is on us. It doesn't count toward your monthly interactions.",
  ),
);

// --- 4. The Atlas proposal: template chrome AND the canonical exemplar ------
// example.json is the fixture scripts/test-vera.ts feeds Vera as the "clean"
// case, so a dash in it teaches the reviewer the wrong bar.

{
  const example = JSON.parse(
    readFileSync(join(__dirname, "proposal-email", "example.json"), "utf-8"),
  );
  noEmDash("proposal example.json (raw exemplar)", JSON.stringify(example, null, 2));
  noEmDash("proposal email (rendered from example.json)", renderProposalEmail(example));
}

// --- 5. signatureRoleLine --------------------------------------------------

{
  const eq = (name: string, got: string, want: string) =>
    ok(name, got === want, `got  "${got}"\n        want "${want}"`);

  eq("role line appends 'at Ambitt Agents'", signatureRoleLine("Sourcing agent"), "Sourcing agent at Ambitt Agents");
  eq(
    "only the first sentence of purpose is used (the rest is the internal brief)",
    signatureRoleLine("CRE sourcing agent. NEVER price a deal autonomously."),
    "CRE sourcing agent at Ambitt Agents",
  );
  eq(
    "a multi-line purpose stops at the first line",
    signatureRoleLine("Lead-gen agent\nRuns every morning at 8."),
    "Lead-gen agent at Ambitt Agents",
  );
  eq("no role falls back to a neutral true line", signatureRoleLine(), "Your agent at Ambitt Agents");
  eq("empty role falls back too", signatureRoleLine("   "), "Your agent at Ambitt Agents");
  eq("null role falls back too", signatureRoleLine(null), "Your agent at Ambitt Agents");
  ok(
    "an over-long purpose is capped rather than dumped into the signature",
    signatureRoleLine(`${"a".repeat(200)}`).length <= 60 + " at Ambitt Agents".length,
    `got length ${signatureRoleLine("a".repeat(200)).length}`,
  );
  ok(
    "no fallback or clip ever introduces a dash",
    ![signatureRoleLine(), signatureRoleLine("Sourcing agent"), signatureRoleLine("x".repeat(200))].some(
      (s) => s.includes(EM_DASH),
    ),
  );
}

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
