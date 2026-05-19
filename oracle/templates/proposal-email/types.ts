/**
 * Ambitt Agents — Proposal Email Data Contract
 *
 * Atlas produces this from a client's form responses and passes it to
 * the email template renderer (proposal-email.template.html).
 *
 * The template uses vanilla Handlebars syntax — no custom helpers required.
 * See AGENT_EMAIL_SPEC.md for the design system and field-level guidance.
 */

export interface ProposalEmailData {
  /** Email subject line. e.g., "Your custom agent — proposal from Atlas" */
  subject: string;

  /** Salutation block at the very top of the email body */
  greeting: {
    /** First name only. e.g., "Kyle" */
    name: string;
    /** Lead-in paragraph. 2–3 sentences, plain text, no HTML. */
    body: string;
  };

  /** The agent's "trading card" — visual identity + specs */
  hero: {
    /** Section label above the title. e.g., "YOUR CUSTOM AGENT" */
    label: string;
    /** Title. Supports <br> for line breaks. */
    title: string;
    /** Optional status indicator (top-right of hero) */
    status?: {
      text: string;
      tone: "info" | "warn" | "success" | "neutral";
    };
    /** 3–7 spec rows. Each value supports inline <span class="accent">…</span> for cyan emphasis. */
    specs: SpecRow[];
  };

  /** Optional pull-quote with teal left border */
  introQuote?: {
    /** Quote text. Supports <em>…</em> for inline cyan-italic emphasis. */
    text: string;
  };

  /** Section 01 — what the agent does */
  whatWeBuild: {
    /** Defaults to "01 — WHAT WE'D BUILD" if omitted. */
    label?: string;
    /** Headline (H2). e.g., "The Prospect Hunter" */
    headline: string;
    /** 1–3 paragraphs describing the agent's purpose. Plain text, no HTML. */
    paragraphs: string[];
  };

  /** Section 02 — numbered list of how the agent operates */
  flow: {
    /** Defaults to "02 — HOW IT WORKS". */
    label?: string;
    /** Headline. e.g., "The daily flow" */
    headline: string;
    /** 3–7 ordered steps */
    steps: FlowStep[];
  };

  /** Section 03 — sample artifact the agent would produce (optional) */
  sample?: {
    /** Defaults to "03 — SAMPLE OUTPUT". */
    label?: string;
    /** Headline. e.g., "What an email looks like" */
    headline: string;
    /** Lead-in paragraph (plain text) */
    introText: string;
    /** The sample artifact card */
    card: {
      /** Optional metadata rows (From/To/Subject for emails, Ticket/Customer for support, etc.) */
      headerRows?: SampleHeaderRow[];
      /** Body content. Supports <p>, <strong>, <em>, <a>. Wrap each paragraph in <p>…</p>. */
      body: string;
      /** Optional signature appended below body. Supports inline HTML. */
      signature?: string;
    };
  };

  /** Section 04 — the recurring digest preview (optional) */
  digest?: {
    /** Defaults to "04 — YOUR MORNING DIGEST". */
    label?: string;
    /** Headline. e.g., "What you'd see before approving" */
    headline: string;
    /** Lead-in paragraph (plain text) */
    introText: string;
    /** The digest card title. e.g., "Kwame's Daily Report" */
    cardTitle: string;
    /** The meta string. Supports <span class="accent">…</span> for cyan emphasis. */
    cardMeta: string;
    /** Table columns. 3–5 recommended. */
    columns: DigestColumn[];
    /** Table rows. Each row is an array of cells in column order. */
    rows: DigestRow[];
  };

  /** Primary call-to-action block */
  cta: {
    /** Large headline. e.g., "If this feels right, approve it." */
    headline: string;
    /** Supporting sentence below headline */
    subtext: string;
    /** Primary button text. e.g., "Approve" */
    primaryLabel: string;
    /** Primary button URL */
    primaryUrl: string;
    /** Secondary button text. e.g., "Make changes" */
    secondaryLabel: string;
    /** Secondary button URL */
    secondaryUrl: string;
    /** Optional tertiary link below buttons. e.g., "Talk to a human" */
    tertiaryLabel?: string;
    tertiaryUrl?: string;
  };

  /** Email footer */
  footer: {
    /** Public domain. e.g., "ambitt.agency" */
    domain: string;
    /** Location. e.g., "Dallas, TX" */
    location: string;
    /** Optional one-line "why you're getting this" note */
    note?: string;
  };
}

export interface SpecRow {
  /** Short label, rendered uppercase. e.g., "Targets" */
  label: string;
  /** Value text. Supports inline <span class="accent">…</span> for cyan highlight. */
  value: string;
}

export interface FlowStep {
  /** 1-based step number. Atlas should set this to match the step's position. */
  number: number;
  /** 1–2 word title. e.g., "Hunt" */
  title: string;
  /** 1–3 sentence description. Plain text. */
  description: string;
}

export interface SampleHeaderRow {
  /** Field label. e.g., "From", "To", "Ticket", "Customer", "Channel" */
  label: string;
  /** Field value */
  value: string;
  /**
   * Visual treatment:
   * - "link" — teal styled, for emails/URLs
   * - "subject" — bold dark, for email subject lines
   * - "text" — default plain text (this is the default if omitted)
   */
  type?: "link" | "subject" | "text";
}

export interface DigestColumn {
  /** Internal key (not displayed; useful for sorting/keying) */
  key: string;
  /** Column header text */
  label: string;
}

/** Each row is an array of cells in column order */
export type DigestRow = DigestCell[];

export interface DigestCell {
  /** Display value */
  value: string;
  /**
   * Visual treatment:
   * - "pill" — renders as a teal pill (for status columns)
   * - undefined — plain text (default)
   */
  type?: "pill";
}
