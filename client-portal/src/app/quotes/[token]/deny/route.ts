import prisma from "@/lib/db";

/**
 * Prospect clicks Deny on the hosted quote page → lands here.
 *
 * GET: shows a confirmation form with an optional "tell us why" textarea.
 *      No friction beyond clicking Confirm — we want the deny decision to
 *      be easy so they don't ghost instead.
 * POST: writes status → quote_denied + optional quoteDeniedReason,
 *       fires Oracle notify, renders confirmation page.
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
      businessName: true,
      quoteAcceptedAt: true,
      quoteDeniedAt: true,
      quoteSentAt: true,
    },
  });

  if (!prospect) {
    return new Response(simplePage("Not found", "This quote link isn't valid."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (prospect.quoteAcceptedAt) {
    return new Response(
      simplePage("This quote is already accepted", "Reach out if you want to change anything."),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  if (prospect.quoteDeniedAt) {
    return new Response(
      simplePage("Got it — no worries", "We've recorded your decision. If anything changes, we're here."),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  if (!prospect.quoteSentAt) {
    return new Response(
      simplePage("Quote not sent yet", "There's nothing to decline yet — we'll email when the quote is ready."),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return new Response(denyFormPage(prospect, token), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const formData = await req.formData();
  const reason = (formData.get("reason") || "").toString().trim().slice(0, 2000);

  const prospect = await prisma.prospect.findUnique({
    where: { token },
    select: { id: true, status: true, contactName: true, businessName: true, quoteSentAt: true, quoteAcceptedAt: true, quoteDeniedAt: true },
  });

  if (!prospect || prospect.quoteAcceptedAt) {
    return new Response(simplePage("Not available", "This action isn't available right now."), {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (!prospect.quoteDeniedAt) {
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        status: "quote_denied",
        quoteDeniedAt: new Date(),
        quoteDeniedReason: reason || null,
        lastActivityAt: new Date(),
      },
    });
    fetch(`${oracleUrl()}/onboarding/prospects/${prospect.id}/quote-decided`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "denied", reason: reason || undefined }),
    }).catch((err) => {
      console.error("[quotes/deny] Oracle notify failed", err);
    });
  }

  return new Response(deniedPage(prospect), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function denyFormPage(
  prospect: { contactName: string | null },
  token: string
): string {
  const first = (prospect.contactName ?? "").trim().split(/\s+/)[0] || "there";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Decline · Ambitt Agents</title><style>
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#fafaf8;color:#171717;margin:0;padding:48px 24px;min-height:100vh;-webkit-font-smoothing:antialiased}
main{max-width:520px;margin:0 auto}
h1{font-size:32px;font-weight:700;letter-spacing:-0.8px;line-height:1.15;margin:0 0 14px}
p{font-size:15px;color:#404040;line-height:1.65;margin:0 0 24px}
label{display:block;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#737373;margin:0 0 8px}
textarea{width:100%;min-height:120px;padding:14px 16px;border:1px solid #d4d4d4;border-radius:10px;font-size:14.5px;color:#171717;background:#ffffff;font-family:inherit;line-height:1.55;resize:vertical;outline:none;transition:border-color .15s,box-shadow .15s}
textarea:focus{border-color:#00b3b3;box-shadow:0 0 0 3px rgba(0,179,179,0.14)}
.buttons{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
.btn-confirm{background:#171717;color:#fff;border:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer}
.btn-confirm:hover{background:#404040}
.btn-cancel{display:inline-block;padding:14px 28px;border:1px solid #d4d4d4;color:#404040;border-radius:10px;font-size:15px;font-weight:500;text-decoration:none}
.helper{font-size:13px;color:#737373;margin-top:8px}
</style></head><body><main>
<h1>Decline this quote?</h1>
<p>No pressure ${esc(first)} — we'd rather you say no than say nothing. If you have a second to share why, it helps us get sharper for next time.</p>
<form method="POST" action="/quotes/${token}/deny">
  <label for="reason">Anything you'd like us to know? (optional)</label>
  <textarea id="reason" name="reason" placeholder="e.g., price was higher than expected, scope didn't fit, timing isn't right, going with someone else…"></textarea>
  <p class="helper">Skip if you'd rather not say.</p>
  <div class="buttons">
    <button type="submit" class="btn-confirm">Confirm decline</button>
    <a class="btn-cancel" href="/quotes/${token}">Back to quote</a>
  </div>
</form>
</main></body></html>`;
}

function deniedPage(prospect: { contactName: string | null }): string {
  const first = (prospect.contactName ?? "").trim().split(/\s+/)[0] || "there";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Got it · Ambitt Agents</title><style>
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#fafaf8;color:#171717;margin:0;padding:48px 24px;min-height:100vh;-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center}
main{max-width:520px;text-align:center}
h1{font-size:32px;font-weight:700;letter-spacing:-0.8px;line-height:1.15;margin:0 0 14px}
p{font-size:15px;color:#404040;line-height:1.65;margin:0 0 12px}
</style></head><body><main>
<h1>Got it — thanks ${esc(first)}.</h1>
<p>We've recorded your decision. No follow-up unless you want one.</p>
<p>If anything changes, you know where to find us.</p>
</main></body></html>`;
}

function simplePage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Ambitt Agents</title><style>body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#fafaf8;color:#171717;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px}main{max-width:520px;text-align:center}h1{font-size:28px;font-weight:700;letter-spacing:-0.5px;margin:0 0 16px}p{font-size:15px;color:#404040;line-height:1.65;margin:0}</style></head><body><main><h1>${esc(title)}</h1><p>${esc(body)}</p></main></body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
