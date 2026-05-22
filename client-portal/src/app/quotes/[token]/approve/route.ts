import prisma from "@/lib/db";

/**
 * Prospect clicks Approve on the hosted quote page → lands here.
 *
 * v1 flow:
 *   1. Validate token.
 *   2. Flip status → "accepted", set quoteAcceptedAt (idempotent: if already
 *      accepted, just show the confirmation page).
 *   3. Fire-and-forget Oracle quote-decided event for ops notification.
 *   4. Render a branded confirmation page.
 *
 * Phase C will wire Stripe checkout in this handler — for v1 it's a
 * "we'll invoice you" handshake.
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
  if (prospect.status === "archived" || prospect.status === "ghosted") {
    return new Response(
      simplePage("This quote is closed", "Get in touch if you'd like to revisit your custom agent setup."),
      { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  if (!prospect.quoteSentAt) {
    return new Response(
      simplePage("Quote not sent yet", "We're still putting the final touches on your quote — it'll land in your inbox shortly."),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  if (prospect.quoteDeniedAt) {
    return new Response(
      simplePage("This quote was declined", "Reach out if you'd like to revisit it — we're happy to talk."),
      { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const alreadyAccepted = Boolean(prospect.quoteAcceptedAt);

  if (!alreadyAccepted) {
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        status: "accepted",
        quoteAcceptedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });
    // Fire-and-forget ops notification.
    fetch(`${oracleUrl()}/onboarding/prospects/${prospect.id}/quote-decided`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    }).catch((err) => {
      console.error("[quotes/approve] Oracle notify failed", err);
    });
  }

  return new Response(acceptedPage(prospect), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function acceptedPage(prospect: { contactName: string | null; businessName: string | null }): string {
  const first = (prospect.contactName ?? "").trim().split(/\s+/)[0] || "there";
  const business = prospect.businessName ?? "your agent";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accepted · Ambitt Agents</title><style>
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#fafaf8;color:#171717;margin:0;padding:48px 24px;min-height:100vh;-webkit-font-smoothing:antialiased}
main{max-width:560px;margin:0 auto;text-align:center}
.mark{display:inline-flex;width:88px;height:88px;border-radius:22px;background:#171717;align-items:center;justify-content:center;margin-bottom:28px;position:relative}
.mark::after{content:'';position:absolute;bottom:-3px;right:-3px;width:26px;height:26px;border-radius:50%;background:#00b3b3;border:3px solid #fafaf8;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 12 12'%3E%3Cpath fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M2.5 6L5 8.5L9.5 4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:center}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:rgba(16,185,129,0.1);color:#047857;font-size:10.5px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;margin-bottom:22px}
.pill-dot{width:5px;height:5px;border-radius:50%;background:#10b981}
h1{font-size:40px;font-weight:700;letter-spacing:-1.2px;line-height:1.1;margin:0 0 18px}
p{font-size:15.5px;color:#404040;line-height:1.7;margin:0 0 14px;max-width:460px;margin-left:auto;margin-right:auto}
strong{color:#171717;font-weight:600}
</style></head><body><main>
<div class="mark"><svg viewBox="0 0 28 40" width="46" height="66"><rect x="5" y="19" width="18" height="18" rx="5" fill="#fff"/><circle cx="14" cy="10" r="6.5" fill="#fff"/><rect x="9.5" y="8.75" width="9" height="2.5" rx="1.25" fill="#00d4d4"/></svg></div>
<div class="pill"><span class="pill-dot"></span>Accepted</div>
<h1>Let's build it.</h1>
<p>Thanks ${esc(first)} — quote accepted for ${esc(business)}.</p>
<p>We'll send the invoice and kickoff details within the next business day. Once payment lands, we start building.</p>
</main></body></html>`;
}

function simplePage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Ambitt Agents</title><style>body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#fafaf8;color:#171717;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px}main{max-width:520px;text-align:center}h1{font-size:28px;font-weight:700;letter-spacing:-0.5px;margin:0 0 16px}p{font-size:15px;color:#404040;line-height:1.65;margin:0}</style></head><body><main><h1>${esc(title)}</h1><p>${esc(body)}</p></main></body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
