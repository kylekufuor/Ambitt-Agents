// ---------------------------------------------------------------------------
// Ambitt Agents — the three pre-sale emails
// ---------------------------------------------------------------------------
// These are the ONLY emails a prospect receives before they become a client:
//
//   1. thanks        — fires the second the intake form is submitted. The first
//                      thing anyone ever receives from us.
//   2. proposalTeaser — announces the hosted proposal at /proposals/[token].
//   3. quoteTeaser    — announces the hosted quote at /quotes/[token].
//
// The proposal and the quote themselves are hosted DOCUMENTS, not emails (see
// proposal-email/template.html and quote/template.html). These three are the
// envelopes that carry the link, so they are the surface that has to survive
// Gmail, Outlook and a blocked-image inbox.
//
// They used to live inline in oracle/index.ts as string literals running their
// own design system: a webfont NAME with no webfont behind it ('Inter', which
// silently resolved to whatever the client felt like), warm #171717/#a3a3a3
// neutrals belonging to no palette we ship, and a #00b3b3 button fill under
// white text at 2.59:1, which fails WCAG AA. Now they are built from the same
// primitives as every other Ambitt email.
//
// WHY NOT footerRows(): that footer offers the portal, billing, tools and a
// pause-agent mailto. A prospect has no agent, no portal account and nothing to
// pause. They get a footer that is true for them instead.
// ---------------------------------------------------------------------------

import {
  T,
  emailDocument,
  section,
  letterhead,
  h1,
  paragraph,
  button,
  panel,
} from "./_shared.js";

/** The shape both teasers need. Matches the Prospect fields the callers hold. */
export interface ProspectLike {
  contactName: string | null;
  businessName: string | null;
}

/** Atlas signs these, and Atlas is what the prospect is talking to. */
const FROM_NAME = "Atlas";
const FROM_ROLE = "Onboarding agent at Ambitt Agents";

function firstNameOf(p: { contactName: string | null }, fallback = ""): string {
  return (p.contactName ?? "").trim().split(/\s+/)[0] || fallback || "there";
}

/** " for Acme Realty", or nothing at all. Never a bare trailing preposition. */
function forBusiness(p: ProspectLike): string {
  return p.businessName ? ` for ${escapeHtml(p.businessName)}` : "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Prospect-appropriate footer. No portal nav, because they have no portal yet.
 * Reply is the only channel that is true at this stage, so it is the only one
 * offered.
 */
function prospectFooter(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center" style="width:100%;max-width:600px;margin:0 auto;">
<tr><td class="px" style="padding:22px 40px 0 40px;text-align:center;">
  <p class="dm-body" style="margin:0;font-size:14px;line-height:1.6;color:${T.body};">Just reply to this email. A person reads every one.</p>
</td></tr>
<tr><td style="padding:16px 24px 0 24px;text-align:center;">
  <p style="margin:0;font-size:12.5px;">
    <span class="dm-mute" style="font-weight:600;color:${T.mute};">Ambitt</span><span class="dm-teal" style="font-weight:600;color:${T.tealText};"> Agents</span>
    <span class="dm-mute" style="color:${T.faint};"> &middot; </span><span class="dm-mute" style="color:${T.mute};">Dallas, TX</span>
  </p>
</td></tr>
</table>`;
}

// ---------------------------------------------------------------------------
// 1. Thanks. Sent synchronously on form submit, before Atlas even starts.
// ---------------------------------------------------------------------------

export function buildThanksEmail(prospect: {
  contactName: string | null;
  businessName: string | null;
  formData: unknown;
}): string {
  const fd = (prospect.formData ?? {}) as Record<string, unknown>;
  const preferred = typeof fd.preferredName === "string" ? fd.preferredName : "";
  const name = escapeHtml(firstNameOf(prospect, preferred));
  const business = forBusiness(prospect);

  return emailDocument({
    preheader: "Your proposal lands in this inbox within 30 minutes.",
    tone: "brand",
    rows: [
      section(letterhead({ agentName: FROM_NAME, roleLine: FROM_ROLE }), 28, 24),
      section(
        h1(`Got your brief, ${name}`) +
          paragraph(`Thanks for laying it all out${business}. We're reading through your answers now.`) +
          paragraph(
            `Your proposal will land in this inbox within <strong style="color:${T.ink};font-weight:600;">30 minutes</strong>. When it does, you can approve the scope or ask for changes. Pricing comes after that, once we both agree on what we're building.`
          ),
        0,
        4
      ),
      section(
        panel(
          `<p class="dm-body" style="margin:0;font-size:15px;line-height:1.55;color:${T.body};">Nothing to do in the meantime. If you remembered something you left out, just reply here and we'll fold it in.</p>`
        ),
        0,
        28
      ),
    ].join(""),
    outerRows: prospectFooter(),
  });
}

// ---------------------------------------------------------------------------
// 2. Proposal teaser. The full proposal is the hosted document.
// ---------------------------------------------------------------------------

export function buildProposalTeaserEmail(opts: {
  prospect: ProspectLike;
  proposalUrl: string;
  /** hero.title from the generated proposal. May contain <br> and markup. */
  heroTitle: string;
}): string {
  const name = escapeHtml(firstNameOf(opts.prospect));
  const business = forBusiness(opts.prospect);
  // hero.title carries <br> and the odd inline tag. Flatten it for a one-line
  // preview, then re-escape: it reached us as HTML, not as text.
  const preview = escapeHtml(
    opts.heroTitle
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );

  return emailDocument({
    preheader: preview || "Your custom agent proposal is ready to read.",
    tone: "brand",
    rows: [
      section(letterhead({ agentName: FROM_NAME, roleLine: FROM_ROLE }), 28, 24),
      section(
        h1(`Your proposal is ready`) +
          paragraph(
            `Hi ${name}, here's the agent we'd build${business}.${preview ? ` <strong style="color:${T.ink};font-weight:600;">${preview}</strong>` : ""}`
          ) +
          paragraph(
            `It's a few minutes' read: what it does, how it works day to day, and a sample of what it would produce for you. If it feels right you can approve it on the page. If anything's off, hit Make changes and update your answers.`
          ),
        0,
        20
      ),
      section(button("Read the proposal", opts.proposalUrl), 0, 24),
      section(
        `<p class="dm-mute" style="margin:0;font-size:14px;line-height:1.6;color:${T.mute};">No pricing in there yet. We quote once you're happy with the scope, so we're both costing the same thing.</p>`,
        0,
        28
      ),
    ].join(""),
    outerRows: prospectFooter(),
  });
}

// ---------------------------------------------------------------------------
// 3. Quote teaser. The full quote is the hosted document.
// ---------------------------------------------------------------------------

export function buildQuoteTeaserEmail(opts: { prospect: ProspectLike; quoteUrl: string }): string {
  const name = escapeHtml(firstNameOf(opts.prospect));
  const business = forBusiness(opts.prospect);

  return emailDocument({
    preheader: "Scope, price, timeline and terms, on one page.",
    tone: "brand",
    rows: [
      section(letterhead({ agentName: FROM_NAME, roleLine: FROM_ROLE }), 28, 24),
      section(
        h1("Your quote is ready") +
          paragraph(
            `Hi ${name}, the quote${business} is up. It covers everything we're building, what the monthly retainer includes and what it doesn't, how long the build takes, and the terms.`
          ) +
          paragraph(
            `Read it properly. If it works, approve it and we'll start. If the timing isn't right, say "Not right now" and we'll close it out cleanly with no follow-up sequence.`
          ),
        0,
        20
      ),
      section(button("Read the quote", opts.quoteUrl), 0, 24),
      section(
        `<p class="dm-mute" style="margin:0;font-size:14px;line-height:1.6;color:${T.mute};">Questions before you decide are welcome. Reply here and we'll answer them straight.</p>`,
        0,
        28
      ),
    ].join(""),
    outerRows: prospectFooter(),
  });
}
