/**
 * Ambitt Agents — Quote Data Contract
 *
 * Atlas drafts this after Kyle approves the PRD. Kyle edits in the dashboard
 * (numbers, terms, anything that needs polish), then clicks Send → the
 * prospect gets a teaser email linking to /quotes/[token] where they Approve
 * or Deny. Same single-source-of-truth pattern as the proposal.
 *
 * Atlas pulls structure from the approved PRD: the scope-of-work list is
 * built from PRD.buildPlan + PRD.tools; pricing is seeded from
 * PRD.pricing.suggestedMonthlyCents / suggestedSetupCents but Kyle can edit
 * before sending.
 *
 * Visual treatment matches the proposal email (warm whites, teal accent,
 * Ambitt brand). This is CLIENT-facing, not dashboard-themed.
 */

export interface QuoteData {
  /** Email subject for the slim teaser. e.g., "Your custom agent — quote inside" */
  subject: string;

  /** Salutation paragraph for the hosted page. */
  greeting: {
    /** First name of the prospect. */
    name: string;
    /** 1-2 sentence opener. Plain text, no HTML. */
    body: string;
  };

  /**
   * Hero block — the headline number framing for the agent we're building.
   * Names the agent + the business.
   */
  hero: {
    /** Label above the title. e.g., "YOUR CUSTOM AGENT QUOTE" */
    label: string;
    /** Main title. e.g., "Hawk for Cedar Ridge Commercial." Supports <br>. */
    title: string;
    /** Sub-line. e.g., "Industrial-listing scout · supervised mode · daily mornings" */
    subtitle: string;
  };

  /** The "what you're paying" block. */
  pricing: {
    /** Setup fee in CENTS (integer). Display: $X,XXX one-time. */
    setupCents: number;
    /** Monthly retainer in CENTS (integer). Display: $X,XXX/month. */
    monthlyCents: number;
    /** Pricing tier label for the badge. e.g., "Growth tier". */
    tierLabel: string;
    /** 1-3 sentences explaining what the tier covers + why this number. References market findings naturally. */
    summary: string;
  };

  /**
   * Scope of work — every concrete piece of work the prospect is paying for.
   * Built from PRD.buildPlan + PRD.tools. This is the "for technical readers"
   * section Kyle asked for.
   */
  scopeOfWork: {
    /** Optional intro sentence. e.g., "Here's everything that's included." */
    intro?: string;
    items: ScopeItem[];
  };

  /** What's included in the monthly retainer, after launch. 3-6 bullets. */
  monthlyIncludes: string[];

  /** What this quote does NOT include. Sets expectations. 2-5 bullets. e.g., third-party API costs they pay directly, custom tools beyond the listed scope, scope changes mid-build. */
  notIncluded: string[];

  /** Timeline section — build duration + launch handoff. */
  timeline: {
    /** Build duration range. e.g., "3-4 weeks" — picked by Atlas based on buildPlan day-sum. */
    buildWindow: string;
    /** 1-2 sentence description of what happens after quote acceptance. */
    description: string;
  };

  /** Terms / fine print. */
  terms: {
    /** When the quote expires. e.g., "30 days from send". Sets urgency without being pushy. */
    validity: string;
    /** Payment structure plain English. e.g., "Setup fee due at signature; monthly retainer billed first of each month starting at launch." */
    paymentTerms: string;
    /** Cancellation terms plain English. e.g., "Cancel anytime with 30 days notice; setup fee is non-refundable once build starts." */
    cancellation: string;
  };

  /** Call-to-action block. */
  cta: {
    /** Big headline above the buttons. e.g., "Ready to build this?" */
    headline: string;
    /** 1-2 sentence subtext above the buttons. */
    subtext: string;
    /** Primary button label. e.g., "Approve and start" */
    approveLabel: string;
    /** Primary button URL — full hosted /quotes/[token]/approve URL. */
    approveUrl: string;
    /** Secondary button label. e.g., "Not right now" */
    denyLabel: string;
    /** Secondary button URL — full hosted /quotes/[token]/deny URL. */
    denyUrl: string;
  };

  /** Footer with the brand fact-sheet. */
  footer: {
    /** Public domain. e.g., "ambitt.agency" */
    domain: string;
    /** Location. e.g., "Dallas, TX" */
    location: string;
    /** Optional one-line "why you're getting this" note. */
    note?: string;
  };
}

export interface ScopeItem {
  /** Short title. e.g., "Custom outreach scoring function" or "Gmail integration". */
  title: string;
  /** 1-2 sentence description that's understandable to non-technical readers. */
  description: string;
  /**
   * Visual category for the icon/pill:
   *  - "integration"  — wiring a third-party tool (Composio OAuth)
   *  - "custom_code"  — writing a custom platform tool
   *  - "automation"   — a browse flow or scraping flow
   *  - "prompt"       — prompt engineering / tuning
   *  - "testing"      — internal QA, dry runs
   *  - "launch"       — handoff, training, go-live
   */
  kind: "integration" | "custom_code" | "automation" | "prompt" | "testing" | "launch";
}
