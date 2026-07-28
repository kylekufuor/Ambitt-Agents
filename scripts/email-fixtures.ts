// ---------------------------------------------------------------------------
// Email preview fixtures — realistic props for every template
// ---------------------------------------------------------------------------
// Used by scripts/render-emails.ts to render before/after comparisons.
// Content here is deliberately real-looking (a CRE sourcing agent working a
// Dallas industrial shortlist) so design review happens against the kind of
// email a client actually receives, never lorem.
// ---------------------------------------------------------------------------

export const AGENT = {
  agentName: "Arthur",
  agentId: "agt_7f3c9a21",
  agentRole: "Sourcing agent",
  agentPurpose: "Sourcing agent. Screens CoStar and LoopNet daily for infill industrial in DFW, underwrites to Casey's box, and sends a ranked shortlist.",
  clientName: "Casey",
  preferredName: "Casey",
  clientFirstName: "Casey",
  clientBusinessName: "Litsey Creek Partners",
  productName: "Litsey Creek Partners",
  clientId: "cli_2b8e40",
};

// --- Agent response: the email clients see most ---------------------------

export const AGENT_RESPONSE_BODY = `Four new listings cleared your box this week. The Garland one is the only one I'd move on quickly.

## The shortlist

**2411 Forest Lane, Garland** is the standout. 48,000 SF on 3.1 acres, 24' clear, eight dock-high doors, priced at $6.4M or $133/SF. It's been sitting 61 days and the broker cut $400K off the ask on Tuesday. Comps in that submarket closed at $147 to $161/SF over the last two quarters, so even underwriting conservatively you're buying 12% under the band.

**1890 Valwood Parkway, Farmers Branch** is the safer trade. 62,000 SF, 28' clear, fully leased to a logistics tenant with 4.2 years left at $8.90 NNN. Ask is $9.1M, a 6.4 cap. Nothing exciting, but it pencils.

The other two I'd pass on. **East Trinity Mills** has a rail spur you'd never use and the seller wants replacement-cost pricing. **Great Southwest Parkway** is in a flood zone that would cost you on insurance for as long as you own it.

## What I'd do next

I can pull the full CoStar comp set on Forest Lane and put a one-page underwrite in front of you tomorrow morning. Just say the word.

One thing worth knowing: the Garland broker is Nick Alvarez at Stream, and he's listed two of the last three deals you looked at. Worth a direct call rather than going through the listing portal.`;

export const AGENT_RESPONSE = {
  ...AGENT,
  responseBody: AGENT_RESPONSE_BODY,
  toolsUsed: [
    { serverId: "costar", toolName: "COSTAR_SEARCH_LISTINGS", success: true },
    { serverId: "costar", toolName: "COSTAR_PULL_COMPS", success: true },
    { serverId: "web", toolName: "WEB_SEARCH", success: true },
    { serverId: "sheets", toolName: "GOOGLE_SHEETS_APPEND_ROW", success: true },
  ],
  stats: [
    { value: "4", label: "Cleared your box", delta: "+2 vs last week", deltaType: "up" as const },
    { value: "$133", label: "Best $/SF", delta: "12% under comps", deltaType: "up" as const },
    { value: "61", label: "Days on market", delta: "Ask cut Tuesday", deltaType: "up" as const },
  ],
  tableHeaders: ["Property", "SF", "Ask", "$/SF", "Verdict"],
  tableRows: [
    { columns: ["2411 Forest Lane, Garland", "48,000", "$6.4M", "$133", "Move"] },
    { columns: ["1890 Valwood Pkwy, Farmers Branch", "62,000", "$9.1M", "$147", "Pencils"] },
    { columns: ["3100 E Trinity Mills, Carrollton", "51,500", "$8.2M", "$159", "Pass"] },
    { columns: ["2020 Great Southwest Pkwy, Grand Prairie", "44,200", "$6.9M", "$156", "Pass"] },
  ],
  sourceLinks: [
    { label: "CoStar listing 2411 Forest Ln", url: "https://example.com/costar/2411", color: "#0f7a74" },
    { label: "Garland submarket comps Q2", url: "https://example.com/comps", color: "#0f7a74" },
  ],
  recommendations: [
    {
      title: "Underwrite Forest Lane tonight",
      description: "I'll pull the full comp set, run it at 65% LTV, and have a one-page underwrite in your inbox before 8am.",
      reasoning: "The ask dropped Tuesday and it's already 61 days on market. Deals in that band get picked up inside a week.",
      approveLabel: "Do it",
      approveActionId: "rec_84a1f",
    },
  ],
  proactiveInsights: [
    "Nick Alvarez at Stream has listed two of the last three deals you looked at. A direct call beats the listing portal.",
    "Your saved search still excludes anything above 30' clear. Two deals this month would have qualified otherwise.",
  ],
};

// --- Welcome --------------------------------------------------------------

export const WELCOME = {
  ...AGENT,
  tools: ["CoStar", "Google Sheets", "Gmail", "Web search"],
  capabilities: [
    "Screen CoStar and LoopNet every morning against your buy box",
    "Underwrite anything that clears and rank it by spread to comps",
    "Track days-on-market and flag price cuts the day they happen",
    "Keep the deal log in your Sheet current without you touching it",
    "Research brokers and owners before you make the call",
  ],
  hasDocuments: false,
  portalUrl: "https://portal.ambitt.agency/agents/agt_7f3c9a21",
  briefText: `Litsey Creek buys infill industrial in DFW, generally 40,000 to 80,000 SF, and holds. Your last four closings were all inside Loop 12.
- The submarket you buy in has tightened: Garland and Farmers Branch industrial vacancy is 4.1%, down from 6.8% two years ago.
- Asking rents in your band are $9.20 to $10.40 NNN. Two of your four assets are 15% under market on renewal.
- Seven owners in your target radius have held past their typical 7-year window. Those are the calls worth making.
- CoStar shows 23 listings live in your size band right now. Four are priced under the comp set.`,
  briefHasPdf: true,
};

// --- Onboarding / checkpoint ---------------------------------------------

export const ONBOARDING_BODY = `Now that I'm live, here's how we'll actually work together.

Send me anything by replying to this email. Write it the way you'd text a colleague. "Anything new in Garland under $140 a foot?" works fine. So does "underwrite that Valwood deal at 70% LTV."

- I screen CoStar every weekday at 6am Central and only email you when something clears your box. Quiet weeks mean quiet inbox.
- If you want me to know something permanently, reply with DOCS in the subject and attach it. Buy box, lender terms, a past LOI, anything. It sticks.
- If I get something wrong, just tell me in the reply. I'll adjust and it holds from then on.
- If I need a login or a decision from you, I'll ask directly and tell you exactly why.

You can always see what I've been doing in your portal, but you shouldn't need to open it. That's the point.`;

export const CHECKPOINT_BODY = `Three days in, so a quick pulse check.

I've screened 61 listings and sent you two shortlists. You moved on Forest Lane, which is the one I'd have picked too.

- I noticed you passed on both Grand Prairie deals without asking me anything. If it's the flood zone, I can filter those out permanently.
- Your buy box says 40,000 SF minimum, but you opened the 38,500 SF Irving listing twice. Want me to loosen the floor?

Nothing needed from you unless one of those lands.`;

// --- Digest ---------------------------------------------------------------

export const DIGEST = {
  ...AGENT,
  periodLabel: "Week of Jul 21",
  summary:
    "Quiet week on new supply, busy week on price cuts. I screened 143 listings, four cleared your box, and three sellers moved on price. The Garland deal is still the best thing on the board.",
  stats: [
    { value: "143", label: "Screened", delta: "+18 vs last week", deltaType: "up" as const },
    { value: "4", label: "Cleared box", delta: "+2", deltaType: "up" as const },
    { value: "3", label: "Price cuts", delta: "Two in your band", deltaType: "up" as const },
  ],
  tasksTable: [
    { task: "Daily CoStar screen", output: "143 listings, 4 shortlisted", status: "Done", statusType: "done" as const },
    { task: "Forest Lane underwrite", output: "One-pager sent Wednesday", status: "Done", statusType: "done" as const },
    { task: "Owner research, 7 long-holds", output: "5 of 7 contacts found", status: "In progress", statusType: "progress" as const },
    { task: "LoopNet cross-check", output: "Login expired Thursday", status: "Needs you", statusType: "warn" as const },
  ],
  sourceLinks: [
    { label: "This week's shortlist", url: "https://example.com/shortlist", color: "#0f7a74" },
    { label: "Deal log", url: "https://example.com/log", color: "#0f7a74" },
  ],
  recommendations: [
    {
      title: "Call the seven long-hold owners",
      description: "I found direct contacts for five of the seven owners past their hold window. I can draft the outreach and you approve each one before it goes.",
      reasoning: "Off-market is where your last two deals came from, and these owners are all past year eight.",
      approveLabel: "Draft them",
      approveActionId: "rec_91c2d",
    },
  ],
  ctaUrl: "https://portal.ambitt.agency/agents/agt_7f3c9a21",
};

// --- Action required ------------------------------------------------------

export const ACTION_REQUIRED = {
  ...AGENT,
  summary:
    "I want to email Nick Alvarez at Stream about the Forest Lane listing and ask for the rent roll and the last two years of opex. It goes out under your name, so I'd rather you see it first.",
  actionSteps: [
    { step: "Email Nick Alvarez asking for the rent roll, T-12 opex, and whether the seller will look at a 45-day close." },
    { step: "Log his reply against the deal in your Sheet." },
    { step: "If he sends the numbers, underwrite it and put a one-pager in front of you the same day." },
  ],
  reasoning:
    "He's listed two of the last three deals you looked at, so a direct ask is normal here. The ask dropped Tuesday and 61 days on market means other buyers are already circling.",
  impactStatement: "This sends an email from your address to an outside broker.",
  approveActionId: "act_5d2b8",
  ctaUrl: "https://portal.ambitt.agency/agents/agt_7f3c9a21",
};

// --- Alert ----------------------------------------------------------------

export const ALERT = {
  ...AGENT,
  summary:
    "The Forest Lane ask just dropped again, second cut in nine days. It's now $122/SF against a comp band of $147 to $161. If you want it, this is the week.",
  metricValue: "$122/SF",
  metricLabel: "2411 Forest Lane, Garland",
  metricDelta: "Down 8.3% since Tuesday",
  detectedAt: "2026-07-28T13:42:00Z",
  checksTable: [
    { signal: "Listing still active", status: "Active", statusType: "ok" as const },
    { signal: "Comp band Q2 Garland", status: "$147 to $161", statusType: "ok" as const },
    { signal: "Days on market", status: "68 days", statusType: "warn" as const },
    { signal: "Competing offers", status: "Unknown", statusType: "warn" as const },
  ],
  sourceLinks: [{ label: "CoStar listing", url: "https://example.com/costar/2411", color: "#0f7a74" }],
  ctaUrl: "https://portal.ambitt.agency/agents/agt_7f3c9a21",
};

// --- Error ----------------------------------------------------------------

export const ERROR = {
  ...AGENT,
  summary:
    "I couldn't run this morning's LoopNet screen. Your login stopped working on Thursday, most likely a password change on their end. CoStar ran fine, so you still got today's shortlist, just without the LoopNet cross-check.",
  errorCode: "AUTH_EXPIRED",
  errorMessage: "LoopNet rejected the saved credentials (HTTP 401). Three retries over 40 minutes, same result.",
  errorTime: "2026-07-28T11:05:00Z",
  recoverySteps: [
    { step: "Update the LoopNet login in your portal. Takes about a minute." },
    { step: "I'll retry automatically on the next run and backfill the two days I missed." },
    { step: "If the account itself is locked, tell me and I'll work CoStar-only until it's sorted." },
  ],
  sourceLinks: [],
  retryActionId: "err_3a7c1",
  ctaUrl: "https://portal.ambitt.agency/agents/agt_7f3c9a21/tools",
};

// --- Permission -----------------------------------------------------------

export const PERMISSION = {
  ...AGENT,
  summary:
    "To keep the deal log current without pinging you, I need access to the Sheet you already use. Read and write on that one file, nothing else in your Drive.",
  permissions: [
    { toolName: "Google Sheets", accessLevel: "Read and write", description: "The DFW Deal Log sheet only. I add rows and update status, I never delete." },
    { toolName: "Google Drive", accessLevel: "Read only", description: "So I can find the file. I don't open anything else." },
  ],
  intentSteps: [
    { step: "Add every listing that clears your box as a new row, with the underwrite attached." },
    { step: "Update status when you move, pass, or a deal goes under contract." },
    { step: "Flag anything that's been sitting in 'reviewing' for more than two weeks." },
  ],
  approveActionId: "perm_6f8e2",
  ctaUrl: "https://portal.ambitt.agency/agents/agt_7f3c9a21/tools",
};

// --- Milestone ------------------------------------------------------------

export const MILESTONE = {
  ...AGENT,
  summary:
    "Forest Lane closed this morning. That's the first deal we sourced end to end, from the daily screen through to the underwrite you took to your lender.",
  milestoneValue: "$6.0M",
  milestoneLabel: "2411 Forest Lane closed",
  milestoneDate: "2026-07-28",
  currentProgress: 34,
  nextMilestone: "Three more closings to hit your 2026 target",
  stats: [
    { value: "$400K", label: "Under ask", delta: "vs original list", deltaType: "up" as const },
    { value: "$14/SF", label: "Under comps", delta: "$133 vs $147", deltaType: "up" as const },
    { value: "31", label: "Days screen to close", delta: "First sourced deal", deltaType: "up" as const },
  ],
  recommendations: [],
  ctaUrl: "https://portal.ambitt.agency/agents/agt_7f3c9a21",
};

// --- Progress -------------------------------------------------------------

export const PROGRESS = {
  ...AGENT,
  dayNumber: 4,
  totalDays: 10,
  summary:
    "Setup's mostly done. CoStar and Sheets are connected and I've run three clean screens. LoopNet is the only thing still open, and it needs a login from you.",
  progressItems: [
    { label: "Buy box loaded and tested", pct: 100 },
    { label: "CoStar screen running daily", pct: 100 },
    { label: "Deal log wired to your Sheet", pct: 100 },
    { label: "LoopNet cross-check", pct: 30 },
    { label: "Off-market owner research", pct: 55 },
  ],
  needsFromClient: [
    { item: "A LoopNet login, so I can cross-check listings CoStar misses" },
    { item: "Your lender's current terms, so my underwrites match what you'd actually get" },
  ],
  ctaUrl: "https://portal.ambitt.agency/agents/agt_7f3c9a21",
};

// --- Credential request ---------------------------------------------------

export const CREDENTIAL = {
  ...AGENT,
  headline: "I need your LoopNet login",
  body: "CoStar covers most of what you buy, but LoopNet carries the smaller owner-listed deals that never make it to CoStar. Two of your last four closings started there. I've set up a spot in your 1Password vault so I can use it without anyone seeing it, including our team.",
  openUrl: "https://start.1password.com/open/i?a=ABC&v=DEF&i=GHI",
  approveActionId: "cred_9b4d3",
  itemTitle: "LoopNet",
  fieldTitles: ["username", "password"],
};
