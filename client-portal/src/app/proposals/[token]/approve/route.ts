import prisma from "@/lib/db";

/**
 * Prospect clicks Approve on the hosted proposal page → lands here.
 *
 * v1 flow:
 *   1. Validate token. Bail with branded 404/410 pages on bad/closed prospects.
 *   2. Flip Prospect.status → `quote_pending` (idempotent: if already past this
 *      state, just show the confirmation page).
 *   3. Fire-and-forget POST to Oracle so it can ping Kyle on WhatsApp.
 *   4. Render a branded "thanks, drafting your quote" page.
 *
 * GET-on-approve has a tiny CSRF surface (any link click triggers it), but the
 * URL token is already secret. If we want belt-and-suspenders later we can add
 * a confirmation step before the API fires.
 */
export const dynamic = "force-dynamic";

function oracleUrl(): string {
  return process.env.ORACLE_URL
    ?? process.env.NEXT_PUBLIC_ORACLE_URL
    ?? "https://oracle-production-c0ff.up.railway.app";
}

export async function GET(
  _req: Request,
  ctx: RouteContext<"/proposals/[token]/approve">
) {
  const { token } = await ctx.params;
  const prospect = await prisma.prospect.findUnique({
    where: { token },
    select: { id: true, status: true, contactName: true, businessName: true },
  });

  if (!prospect) {
    return new Response(simplePage("Not found", "This proposal link isn't valid."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (prospect.status === "archived" || prospect.status === "ghosted") {
    return new Response(simplePage("This proposal is closed", "Get in touch if you'd like to revisit your custom agent setup."), {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const alreadyApproved =
    prospect.status === "quote_pending" ||
    prospect.status === "quote_sent" ||
    prospect.status === "accepted";

  if (!alreadyApproved) {
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { status: "quote_pending", lastActivityAt: new Date() },
    });
    // Two fire-and-forget notifications to Oracle on scope approval:
    //   1. scope_approved event — sends Kyle the "draft a quote" ops email.
    //   2. generate-prd — Atlas drafts the operator-facing build spec in the
    //      background (~2 min). When done, Atlas sends Kyle a follow-up email
    //      with a link to /prospects/:id/prd to review.
    // Both fire in parallel; Kyle gets two emails — first the heads-up, then
    // the PRD-ready notice when Atlas finishes.
    fetch(`${oracleUrl()}/onboarding/prospects/${prospect.id}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "scope_approved" }),
    }).catch((err) => {
      console.error("[proposals/approve] Oracle scope_approved notify failed", err);
    });
    fetch(`${oracleUrl()}/onboarding/prospects/${prospect.id}/generate-prd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch((err) => {
      console.error("[proposals/approve] Oracle generate-prd kickoff failed", err);
    });
  }

  return new Response(approvalPage(prospect), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function approvalPage(prospect: { contactName: string | null; businessName: string | null }): string {
  const first = (prospect.contactName ?? "").trim().split(/\s+/)[0] || "there";
  const business = prospect.businessName ?? "your agent";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scope approved · Ambitt Agents</title><style>
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#fafaf8;color:#171717;margin:0;padding:48px 24px;min-height:100vh;-webkit-font-smoothing:antialiased}
main{max-width:560px;margin:0 auto;text-align:center}
.mark{display:inline-flex;width:88px;height:88px;border-radius:22px;background:#171717;align-items:center;justify-content:center;margin-bottom:28px;position:relative}
.mark::after{content:'';position:absolute;bottom:-3px;right:-3px;width:26px;height:26px;border-radius:50%;background:#00b3b3;border:3px solid #fafaf8;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 12 12'%3E%3Cpath fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M2.5 6L5 8.5L9.5 4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:center}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:rgba(0,179,179,0.08);color:#007373;font-size:10.5px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;margin-bottom:22px}
.pill-dot{width:5px;height:5px;border-radius:50%;background:#00b3b3}
h1{font-size:40px;font-weight:700;letter-spacing:-1.2px;line-height:1.1;margin:0 0 18px}
p{font-size:15.5px;color:#404040;line-height:1.7;margin:0 0 14px;max-width:460px;margin-left:auto;margin-right:auto}
strong{color:#171717;font-weight:600}
</style></head><body><main>
<div class="mark"><svg viewBox="0 0 28 40" width="46" height="66"><rect x="5" y="19" width="18" height="18" rx="5" fill="#fff"/><circle cx="14" cy="10" r="6.5" fill="#fff"/><rect x="9.5" y="8.75" width="9" height="2.5" rx="1.25" fill="#00d4d4"/></svg></div>
<div class="pill"><span class="pill-dot"></span>Scope approved</div>
<h1>You're in motion.</h1>
<p>Thanks ${esc(first)} — we got the green light on the scope for ${esc(business)}.</p>
<p>Our team is putting together your quote now. You'll get an email from us with the timeline and price within the same business day.</p>
</main></body></html>`;
}

function simplePage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Ambitt Agents</title><style>body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#fafaf8;color:#171717;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px}main{max-width:520px;text-align:center}h1{font-size:28px;font-weight:700;letter-spacing:-0.5px;margin:0 0 16px}p{font-size:15px;color:#404040;line-height:1.65;margin:0}</style></head><body><main><h1>${esc(title)}</h1><p>${esc(body)}</p></main></body></html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
