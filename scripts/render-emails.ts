// ---------------------------------------------------------------------------
// Email preview renderer
// ---------------------------------------------------------------------------
// Renders every client-facing template to standalone HTML with realistic props
// so a human can look at them side by side.
//
//   npx tsx scripts/render-emails.ts docs/email-review/before
//   npx tsx scripts/render-emails.ts docs/email-review/after
//
// Also writes index.html — a contact sheet linking every render.
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildAgentResponseEmail } from "../oracle/templates/agent-response.js";
import { buildWelcomeEmail } from "../oracle/templates/welcome-email.js";
import { buildOnboardingEmail } from "../oracle/templates/onboarding-email.js";
import { buildCheckpointEmail } from "../oracle/templates/checkpoint-email.js";
import { buildDigestEmail } from "../oracle/templates/digest-email.js";
import { buildActionRequiredEmail } from "../oracle/templates/action-required-email.js";
import { buildAlertEmail } from "../oracle/templates/alert-email.js";
import { buildErrorEmail } from "../oracle/templates/error-email.js";
import { buildPermissionEmail } from "../oracle/templates/permission-email.js";
import { buildMilestoneEmail } from "../oracle/templates/milestone-email.js";
import { buildProgressEmail } from "../oracle/templates/progress-email.js";
import { buildCredentialRequestEmail } from "../oracle/templates/credential-request-email.js";

import * as fx from "./email-fixtures.js";

const outDir = resolve(process.cwd(), process.argv[2] ?? "docs/email-review/out");
mkdirSync(outDir, { recursive: true });

const renders: Array<{ file: string; title: string; html: string }> = [];

function add(file: string, title: string, html: string) {
  renders.push({ file, title, html });
  writeFileSync(resolve(outDir, `${file}.html`), html, "utf8");
}

// The four Kyle reviews first.
add("agent-response", "Agent response (the one clients see most)", buildAgentResponseEmail(fx.AGENT_RESPONSE as never));
add("welcome", "Welcome", buildWelcomeEmail(fx.WELCOME as never).html);
add("action-required", "Approval request", buildActionRequiredEmail(fx.ACTION_REQUIRED as never));
add("digest", "Weekly digest", buildDigestEmail(fx.DIGEST as never));

// The rest of the family.
add("onboarding", "How to work with me (T+5min)", buildOnboardingEmail({ ...fx.AGENT, body: fx.ONBOARDING_BODY } as never).html);
add("checkpoint", "Check-in (T+3)", buildCheckpointEmail({ ...fx.AGENT, kind: "checkin_3day", body: fx.CHECKPOINT_BODY } as never).html);
add("alert", "Alert", buildAlertEmail(fx.ALERT as never));
add("error", "Error", buildErrorEmail(fx.ERROR as never));
add("permission", "Permission request", buildPermissionEmail(fx.PERMISSION as never));
add("milestone", "Milestone", buildMilestoneEmail(fx.MILESTONE as never));
add("progress", "Progress", buildProgressEmail(fx.PROGRESS as never));
add("credential-request", "Credential request", buildCredentialRequestEmail(fx.CREDENTIAL as never));

// Contact sheet.
const label = outDir.split("/").pop();
const index = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ambitt email renders — ${label}</title>
<style>
 body{margin:0;background:#eef2f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#33475b;padding:32px}
 h1{font-size:20px;font-weight:600;margin:0 0 4px}
 p.sub{margin:0 0 24px;color:#6b7f92;font-size:13px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}
 .cell{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(29,47,64,.06),0 8px 24px rgba(29,47,64,.06)}
 .cell h2{font-size:13px;font-weight:600;margin:0;padding:12px 14px;border-bottom:1px solid #eef2f6}
 iframe{width:100%;height:420px;border:0;display:block;background:#fff}
 a{color:#007a7a;font-size:12px;text-decoration:none;display:block;padding:10px 14px}
</style></head><body>
<h1>Ambitt agent emails — ${label}</h1>
<p class="sub">${renders.length} templates, rendered with real content (Arthur, a CRE sourcing agent, working a Dallas industrial shortlist).</p>
<div class="grid">
${renders.map((r) => `<div class="cell"><h2>${r.title}</h2><iframe src="${r.file}.html"></iframe><a href="${r.file}.html">Open full &rsaquo;</a></div>`).join("\n")}
</div></body></html>`;
writeFileSync(resolve(outDir, "index.html"), index, "utf8");

console.log(`Rendered ${renders.length} templates to ${outDir}`);
for (const r of renders) console.log(`  ${r.file}.html  ${(r.html.length / 1024).toFixed(1)} KB`);
