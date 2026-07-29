import prisma from "@/lib/db";

/**
 * Hosted quote page. Token-gated (the URL token is the auth). Streams the
 * HTML rendered by Oracle's /onboarding/prospects/:id/quote-html endpoint so
 * the visual treatment matches what Atlas drafts and Kyle previews.
 *
 * Why proxy through Oracle (vs. importing the render helper here): the
 * Handlebars template lives in oracle/templates/quote/. Railway's
 * rootDirectory builds each service in isolation, so cross-service imports
 * mean mirroring files. Proxying keeps render logic single-sourced.
 */
export const dynamic = "force-dynamic";

function oracleUrl(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;

  const prospect = await prisma.prospect.findUnique({
    where: { token },
    select: {
      id: true,
      status: true,
      contactName: true,
      quoteSentAt: true,
      quoteAcceptedAt: true,
      quoteDeniedAt: true,
    },
  });

  if (!prospect) {
    return new Response(
      simplePage("Not found", "This quote link isn't valid. Reach out if you think this is a mistake."),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (prospect.status === "archived" || prospect.status === "ghosted") {
    return new Response(
      simplePage("This quote is closed", "Get in touch if you'd like to revisit your custom agent setup."),
      { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Quote not yet sent (or no draft exists) — show a friendly waiting page.
  if (!prospect.quoteSentAt) {
    const first = (prospect.contactName ?? "").trim().split(/\s+/)[0] || "there";
    return new Response(
      simplePage(
        "Your quote is being prepared",
        `Hey ${first}, we're putting the final touches on your quote. You'll get an email the moment it's ready.`
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Already accepted/denied — show a status page instead of the live quote
  // so they don't accidentally double-click.
  if (prospect.quoteAcceptedAt) {
    return new Response(
      simplePage(
        "Quote accepted",
        `Thanks ${(prospect.contactName ?? "").trim().split(/\s+/)[0] || "there"}, your acceptance is on file. Next up is payment and kickoff, and you'll hear from us shortly.`
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  if (prospect.quoteDeniedAt) {
    return new Response(
      simplePage(
        "Got it, no worries",
        "We've recorded your decision. If anything changes, we're here."
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Stream Oracle's rendered HTML through. Same caching strategy as
  // /proposals/[token] — no-store so each visit reflects the latest edits.
  const upstream = await fetch(`${oracleUrl()}/onboarding/prospects/${prospect.id}/quote-html`, {
    cache: "no-store",
  }).catch((err) => {
    console.error("[quotes/route] Oracle fetch failed", err);
    return null;
  });
  if (!upstream || !upstream.ok) {
    return new Response(
      simplePage(
        "Hmm, something's off",
        "We're having trouble loading your quote. Try again in a moment, or reach out and we'll send it directly."
      ),
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  const html = await upstream.text();
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * The waiting / accepted / closed states a prospect can land on instead of the
 * quote itself. Same design language as the quote document it stands in for
 * (oracle/templates/quote/template.html): system font stack with no webfont,
 * a card lifted by elevation under a 3px teal letterhead rule, and the
 * two-step teal. The previous version named 'Inter' without loading it and
 * linked in #00b3b3, which is 2.59:1 on white and fails WCAG AA.
 *
 * Kept inline rather than shared with /proposals: Railway builds each service
 * from its own rootDirectory, so a cross-service import would mean mirroring
 * the file anyway. The two copies are byte-identical on purpose.
 */
function simplePage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(title)} · Ambitt Agents</title><style>
:root{--page:#efeae2;--card:#fffdfb;--ink:#1b3139;--body:#3d545c;--mute:#52676f;--teal:#00b3b3;--teal-text:#00706f}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI Variable Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;background:var(--page);color:var(--body);-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;line-height:1.62}
main{max-width:520px;width:100%;background:var(--card);border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(27,49,57,.04),0 8px 20px rgba(27,49,57,.05),0 24px 48px rgba(27,49,57,.05)}
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
<div class="lk"><svg viewBox="0 0 86 42" width="46" height="22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g transform="translate(43,22)"><g transform="translate(-28,0)"><rect x="-9" y="-2" width="18" height="18" rx="5" fill="#1b3139"/><circle cx="0" cy="-11" r="6.5" fill="#1b3139"/><rect x="-4" y="-12.25" width="8" height="2.5" rx="1.25" fill="#00b3b3"/></g><g><rect x="-9" y="-2" width="18" height="18" rx="5" fill="#1b3139"/><circle cx="0" cy="-11" r="6.5" fill="#1b3139"/><rect x="-4" y="-12.25" width="8" height="2.5" rx="1.25" fill="#00b3b3"/></g><g transform="translate(28,0)"><rect x="-9" y="-2" width="18" height="18" rx="5" fill="#1b3139"/><circle cx="0" cy="-11" r="6.5" fill="#1b3139"/><rect x="-4" y="-12.25" width="8" height="2.5" rx="1.25" fill="#00b3b3"/></g></g></svg><div class="wm">Ambitt <span>Agents</span></div></div>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>
<p class="q">Questions? <a href="mailto:team@ambitt.agency">team@ambitt.agency</a></p>
</div></main></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
