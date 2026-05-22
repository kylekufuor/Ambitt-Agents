/**
 * Ambitt Agents — Agent PRD Data Contract
 *
 * Atlas produces this AFTER the prospect approves scope (status: quote_pending),
 * BEFORE Kyle drafts the quote. It's the operator-facing "build spec" — the
 * technical equivalent of the prospect-facing ProposalEmailData.
 *
 * Two consumers:
 *   1. Kyle reads it in the dashboard to refine + draft the quote off it.
 *   2. On Client conversion (payment), Oracle reads it to auto-scaffold an
 *      Agent row in pending_approval — name, prompt, schedule, tools list,
 *      autonomy, memory all seeded from here.
 *
 * The template renders this as a single internal-review page; no client ever
 * sees the PRD.
 */

export interface AgentPRDData {
  /** One-line headline of what we're building. e.g., "Hawk — daily LoopNet outreach for industrial brokers" */
  summary: string;

  /** The agent + owner. Used to seed the Agent + Client rows on conversion. */
  identity: {
    /** Agent's name. e.g., "Hawk" */
    agentName: string;
    /** Lowercase slug, no spaces. Drives email local-part: <slug>@ambitt.agency. */
    agentEmailSlug: string;
    /** Short role description. e.g., "Lead generation for industrial real estate" */
    agentRole: string;
    /** Owner business name. e.g., "Cedar Ridge Commercial" */
    ownerBusinessName: string;
    /** Owner contact's name. e.g., "Sarah Chen" */
    ownerContactName: string;
    /** Owner contact's email — the prospect's email. */
    ownerEmail: string;
    /** Industry/sector — used in the Client row. */
    ownerIndustry: string;
  };

  /**
   * The drafted system prompt for the agent. ~400-800 words, encoding the
   * client's playbook + brand voice + hard limits. Markdown-friendly but no
   * code fences. This becomes Agent.personality + Agent.purpose seeds on
   * scaffold (Atlas decides how to split; we copy verbatim and Kyle refines).
   */
  systemPrompt: string;

  /**
   * Structured tools list. Each entry has source:
   *   - "composio" — wired via Composio OAuth, client connects in portal.
   *     Has a `slug` (the Composio app key, e.g. "gmail").
   *   - "custom_browse" — uses the `browse` platform tool against a site
   *     Composio doesn't cover. Has a `siteUrl` + a one-paragraph approach.
   *   - "custom_platform_tool" — needs a new TypeScript function written
   *     in shared/platform-tools/. Estimate `buildDays` honestly.
   */
  tools: ToolEntry[];

  /** How and when the agent runs. */
  schedule: {
    mode: "scheduled" | "triggered";
    /** Cron expression in the agent's timezone. Only set when mode is "scheduled". */
    cron?: string;
    timezone: string;
    /** Plain-English description of the trigger. Only set when mode is "triggered". */
    triggerSpec?: string;
  };

  /** Primary client comms channel. */
  channel: "email" | "slack" | "whatsapp";

  /** Default autonomy mode for the agent. */
  autonomy: "supervised" | "semi" | "autonomous";

  /** How we know it's working. 2-5 concrete metrics. */
  successMetrics: string[];

  /** Things the agent must never do. Distinct from soft guidance — these become hard guardrails in the prompt. */
  hardLimits: string[];

  /**
   * Persistent client context for the agent's clientMemoryObject. Compact
   * paragraph form (~100-300 words) — facts about the business, customers,
   * tone, history, anything that should always be in working memory.
   */
  memoryNotes: string;

  /** Commercial recommendation feeding into the quote draft. */
  pricing: {
    suggestedTier: "starter" | "growth" | "scale" | "enterprise";
    suggestedMonthlyCents: number;
    suggestedSetupCents: number;
    /** 1-3 sentence rationale. e.g., "Growth tier — daily 15-prospect volume + 1 custom platform tool." */
    reasoning: string;
    /**
     * Market research backing the pricing recommendation. Atlas runs
     * web_search before drafting numbers — at least one search for
     * competing agencies/platforms in this niche, one for the replacement
     * role cost (what a human contractor would charge), one for category
     * benchmarks. Renders as a separate "Receipts" section on the PRD
     * page so the operator can sanity-check the numbers before quoting.
     */
    marketResearch: {
      /** 2-4 sentence summary of what the market looks like for this kind of agent. */
      summary: string;
      /** 3-8 concrete data points Atlas pulled from web_search results. */
      findings: MarketFinding[];
      /**
       * What it would cost the prospect to hire a human instead. Use the
       * loaded monthly cost (salary + overhead). null if not applicable
       * (e.g., a research agent with no clear human equivalent).
       * Example: "Junior SDR ~$3-5k/mo loaded cost (US small business)"
       */
      replacementCost: string | null;
    };
  };

  /**
   * Things Kyle should call out, resolve, or flag to the client BEFORE
   * committing. Empty array is fine.
   */
  risks: string[];

  /**
   * Ordered build steps with owner + day estimate. The basis for the quote's
   * "Scope of Work" section AND the operator's build punch-list.
   */
  buildPlan: BuildStep[];
}

export interface ToolEntry {
  name: string;
  source: "composio" | "custom_browse" | "custom_platform_tool";
  /** Composio app slug. Required when source === "composio". */
  slug?: string;
  /** Target URL the browse flow operates against. Required when source === "custom_browse". */
  siteUrl?: string;
  /** Function name suggestion. Required when source === "custom_platform_tool". e.g., "score_listing_staleness" */
  functionName?: string;
  /** 1-2 sentence rationale: what this tool does for the agent. */
  rationale: string;
  /** Honest day estimate (decimal allowed). Only set for custom_* sources. */
  buildDays?: number;
}

export interface MarketFinding {
  /** What the data point is, in plain English. e.g., "Reply.io Sales Engagement plan", "Junior SDR contractor (US)", "Lindy AI agent platform — starter tier" */
  source: string;
  /** Price as displayed (range or single, with units). e.g., "$99/mo per seat", "$1,500-2,500/mo", "$25-40/hr" */
  priceRange: string;
  /** 1-2 sentence note: how this point compares to what we're proposing, or what's distinctive about it. */
  note: string;
}

export interface BuildStep {
  /** 1-based step number. */
  number: number;
  /** Short title. e.g., "Wire Gmail OAuth", "Write score_listing_staleness()". */
  title: string;
  /** 1-3 sentences describing the work. */
  description: string;
  /** Who does this step. */
  owner: "ambitt" | "client";
  /** Honest day estimate. */
  estimatedDays: number;
}
