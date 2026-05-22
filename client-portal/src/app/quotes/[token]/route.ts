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
        `Hey ${first} — we're putting the final touches on your quote. You'll get an email the moment it's ready.`
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
        `Thanks ${(prospect.contactName ?? "").trim().split(/\s+/)[0] || "there"} — your acceptance is on file. Next step is payment and kickoff; you'll hear from us shortly.`
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  if (prospect.quoteDeniedAt) {
    return new Response(
      simplePage(
        "Got it — no worries",
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

function simplePage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Ambitt Agents</title><style>body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#fafaf8;color:#171717;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px}main{max-width:520px;text-align:center}h1{font-size:28px;font-weight:700;letter-spacing:-0.5px;margin:0 0 16px}p{font-size:15px;color:#404040;line-height:1.65;margin:0 0 12px}a{color:#00b3b3;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><p><a href="mailto:team@ambitt.agency">team@ambitt.agency</a></p></main></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
