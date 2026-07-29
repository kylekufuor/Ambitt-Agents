// ---------------------------------------------------------------------------
// Pre-sale funnel preview renderer
// ---------------------------------------------------------------------------
// The funnel is five client-facing surfaces, and until now nothing rendered
// them together, which is how they drifted into four different design systems.
//
//   npx tsx scripts/render-funnel.ts docs/email-review/funnel-after
//   npx tsx scripts/shoot-emails.ts docs/email-review/funnel-after
//
// Order below is the order a prospect meets them.
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

import { renderProposalEmail } from "../oracle/templates/proposal-email/render.js";
import { renderQuote } from "../oracle/templates/quote/render.js";
import {
  buildThanksEmail,
  buildProposalTeaserEmail,
  buildQuoteTeaserEmail,
} from "../oracle/templates/funnel-emails.js";

const outDir = resolve(process.cwd(), process.argv[2] ?? "docs/email-review/funnel-after");
mkdirSync(outDir, { recursive: true });

const templates = resolve(process.cwd(), "oracle/templates");
const proposalFx = JSON.parse(
  readFileSync(join(templates, "proposal-email/example.json"), "utf-8")
);
const quoteFx = JSON.parse(readFileSync(join(templates, "quote/example.json"), "utf-8"));

/** One prospect all the way through, so the set reads as a single story. */
const prospect = {
  contactName: "Kyle Kufuor",
  businessName: "Ambitt Media",
  formData: { preferredName: "Kyle" },
};
const PORTAL = "https://portal.ambitt.agency";

/**
 * Mirror of the simplePage() helper in the portal's /quotes and /proposals
 * route handlers. Duplicated for preview only: Railway builds the portal from
 * its own rootDirectory, so it cannot be imported from here. If you change the
 * real one, change this.
 */
function statusPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${title} · Ambitt Agents</title><style>
:root{--page:#eef2f6;--card:#fff;--ink:#1d2f40;--body:#33475b;--mute:#56697c;--teal:#00b3b3;--teal-text:#00706f}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI Variable Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;background:var(--page);color:var(--body);-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;line-height:1.62}
main{max-width:520px;width:100%;background:var(--card);border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(29,47,64,.04),0 8px 20px rgba(29,47,64,.05),0 24px 48px rgba(29,47,64,.05)}
main::before{content:"";display:block;height:3px;background:var(--teal)}
.in{padding:40px 44px 36px}
.lk{display:flex;align-items:center;gap:9px;margin-bottom:26px}
.wm{font-size:14px;font-weight:600;color:var(--ink)}
.wm span{color:var(--teal-text)}
h1{font-size:25px;line-height:1.2;font-weight:600;letter-spacing:-.016em;color:var(--ink);margin-bottom:12px}
p{font-size:16px;color:var(--body);margin-bottom:14px}
p.q{font-size:14px;color:var(--mute);margin:0}
a{color:var(--teal-text);text-decoration:none;font-weight:600}
a:hover{text-decoration:underline}
@media(max-width:560px){.in{padding:30px 24px 28px}h1{font-size:22px}}
</style></head><body><main><div class="in">
<div class="lk"><svg viewBox="0 0 86 42" width="46" height="22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g transform="translate(43,22)"><g transform="translate(-28,0)"><rect x="-9" y="-2" width="18" height="18" rx="5" fill="#1d2f40"/><circle cx="0" cy="-11" r="6.5" fill="#1d2f40"/><rect x="-4" y="-12.25" width="8" height="2.5" rx="1.25" fill="#00b3b3"/></g><g><rect x="-9" y="-2" width="18" height="18" rx="5" fill="#1d2f40"/><circle cx="0" cy="-11" r="6.5" fill="#1d2f40"/><rect x="-4" y="-12.25" width="8" height="2.5" rx="1.25" fill="#00b3b3"/></g><g transform="translate(28,0)"><rect x="-9" y="-2" width="18" height="18" rx="5" fill="#1d2f40"/><circle cx="0" cy="-11" r="6.5" fill="#1d2f40"/><rect x="-4" y="-12.25" width="8" height="2.5" rx="1.25" fill="#00b3b3"/></g></g></svg><div class="wm">Ambitt <span>Agents</span></div></div>
<h1>${title}</h1><p>${body}</p>
<p class="q">Questions? <a href="mailto:team@ambitt.agency">team@ambitt.agency</a></p>
</div></main></body></html>`;
}

const renders: Array<{ file: string; title: string; html: string }> = [];
function add(file: string, title: string, html: string) {
  renders.push({ file, title, html });
  writeFileSync(resolve(outDir, `${file}.html`), html, "utf8");
}

add("email-thanks", "1. Thanks (email, on form submit)", buildThanksEmail(prospect));
add(
  "email-proposal-teaser",
  "2. Proposal is ready (email)",
  buildProposalTeaserEmail({
    prospect,
    proposalUrl: `${PORTAL}/proposals/kwame-12af`,
    heroTitle: proposalFx.hero.title,
  })
);
add("proposal-doc", "3. The proposal (hosted page)", renderProposalEmail(proposalFx));
add(
  "email-quote-teaser",
  "4. Quote is ready (email)",
  buildQuoteTeaserEmail({ prospect, quoteUrl: `${PORTAL}/quotes/kwame-12af` })
);
add("quote-doc", "5. The quote (hosted page)", renderQuote(quoteFx));
add(
  "status-page",
  "6. Status page (hosted, after they decide)",
  // Copy kept verbatim from the real route handler so the screenshot is honest.
  statusPage(
    "Quote accepted",
    "Thanks Kyle, your acceptance is on file. Next up is payment and kickoff, and you'll hear from us shortly."
  )
);

const label = outDir.split("/").pop();
const index = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ambitt funnel renders: ${label}</title>
<style>
 body{margin:0;background:#eef2f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#33475b;padding:32px}
 h1{font-size:20px;font-weight:600;margin:0 0 4px;color:#1d2f40}
 p.sub{margin:0 0 24px;color:#56697c;font-size:13px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}
 .cell{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(29,47,64,.06),0 8px 24px rgba(29,47,64,.06)}
 .cell h2{font-size:13px;font-weight:600;margin:0;padding:12px 14px;border-bottom:1px solid #eef2f6;color:#1d2f40}
 iframe{width:100%;height:420px;border:0;display:block;background:#fff}
 a{color:#00706f;font-size:12px;text-decoration:none;display:block;padding:10px 14px;font-weight:600}
</style></head><body>
<h1>Ambitt pre-sale funnel: ${label}</h1>
<p class="sub">${renders.length} surfaces, in the order a prospect meets them. Kwame, an outbound agent for Ambitt Media.</p>
<div class="grid">
${renders.map((r) => `<div class="cell"><h2>${r.title}</h2><iframe src="${r.file}.html"></iframe><a href="${r.file}.html">Open full &rsaquo;</a></div>`).join("\n")}
</div></body></html>`;
writeFileSync(resolve(outDir, "index.html"), index, "utf8");

console.log(`Rendered ${renders.length} funnel surfaces to ${outDir}`);
for (const r of renders) console.log(`  ${r.file}.html  ${(r.html.length / 1024).toFixed(1)} KB`);
