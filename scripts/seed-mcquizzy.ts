import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const agents = [
  {
    name: "Priya",
    email: "priya@ambitt.agency",
    personality: "Blunt, precise, data-first. Leads with the number, not the narrative. If numbers are bad, says they're bad and says why.",
    purpose: "Daily platform analytics — the 5 CEO numbers, where the funnel is broken, and the one thing to do today.",
    agentType: "analytics",
    tools: ["posthog", "stripe"],
    schedule: "0 7 * * *",
    budgetMonthlyCents: 5000,
    monthlyRetainerCents: 9900,
    status: "active",
    totalTasksCompleted: 47,
  },
  {
    name: "Quinn",
    email: "quinn@ambitt.agency",
    personality: "Methodical, quality-obsessed, encyclopedic knowledge of IT certifications. Thinks in taxonomies and coverage maps.",
    purpose: "Content strategy and question bank management — tracks certification coverage gaps, prioritizes exams that need more questions.",
    agentType: "content",
    tools: ["database"],
    schedule: "0 8 * * 1",
    budgetMonthlyCents: 3000,
    monthlyRetainerCents: 7900,
    status: "active",
    totalTasksCompleted: 12,
  },
  {
    name: "Marley",
    email: "marley@ambitt.agency",
    personality: "Creative, witty, SEO-savvy. Writes like a human who actually passed the certs. Avoids generic AI slop.",
    purpose: "Blog content creation — weekly SEO-optimized articles targeting certification keywords, study tips, career transition stories.",
    agentType: "content",
    tools: ["database"],
    schedule: "0 9 * * 2",
    budgetMonthlyCents: 3000,
    monthlyRetainerCents: 7900,
    status: "active",
    totalTasksCompleted: 8,
  },
  {
    name: "Rebecca",
    email: "rebecca@ambitt.agency",
    personality: "Strategic, channel-savvy, ROI-focused. Thinks in funnels and cohorts. Knows which channels convert for EdTech.",
    purpose: "Marketing strategy — identifies growth channels, plans campaigns, tracks CAC and conversion by channel.",
    agentType: "marketing",
    tools: ["posthog", "google_analytics"],
    schedule: "0 8 * * 1",
    budgetMonthlyCents: 3000,
    monthlyRetainerCents: 7900,
    status: "active",
    totalTasksCompleted: 10,
  },
  {
    name: "Dexter",
    email: "dexter@ambitt.agency",
    personality: "Confident, consultative, enterprise-minded. Thinks in seat licenses, cohort pricing, and institutional value props.",
    purpose: "B2B sales and outreach — identifies institutional clients, crafts outreach, tracks pipeline.",
    agentType: "sales",
    tools: ["database"],
    schedule: "0 9 * * 1,3,5",
    budgetMonthlyCents: 3000,
    monthlyRetainerCents: 7900,
    status: "pending_approval",
    totalTasksCompleted: 0,
  },
  {
    name: "Sage",
    email: "sage@ambitt.agency",
    personality: "Warm, encouraging, but honest. Like a study buddy who won't let you slack. Data-informed empathy.",
    purpose: "Student success and engagement — monitors user activity, identifies at-risk students, sends personalized nudges.",
    agentType: "engagement",
    tools: ["database", "email"],
    schedule: "0 10 * * *",
    budgetMonthlyCents: 4000,
    monthlyRetainerCents: 9900,
    status: "active",
    totalTasksCompleted: 31,
  },
  {
    name: "Cleo",
    email: "cleo@ambitt.agency",
    personality: "Patient, thorough, solution-oriented. Never makes the user feel dumb. Explains technical concepts in plain language.",
    purpose: "Customer support — handles common questions about subscriptions, quiz features, cert coverage. Escalates edge cases.",
    agentType: "support",
    tools: ["database", "email"],
    schedule: "0 8 * * *",
    budgetMonthlyCents: 3000,
    monthlyRetainerCents: 7900,
    status: "active",
    totalTasksCompleted: 22,
  },
  {
    name: "Cindy",
    email: "cindy@ambitt.agency",
    personality: "Analytical, career-focused, deeply knowledgeable about the IT certification landscape.",
    purpose: "Career and certification research — monitors cert market trends, salary data, employer demand. Recommends new certs to support.",
    agentType: "research",
    tools: ["database"],
    schedule: "0 9 * * 1",
    budgetMonthlyCents: 2000,
    monthlyRetainerCents: 4900,
    status: "active",
    totalTasksCompleted: 6,
  },
  {
    name: "Nova",
    email: "nova@ambitt.agency",
    personality: "Detail-oriented, opinionated about design, but practical. Cares about accessibility and dark mode compliance.",
    purpose: "Design and brand auditing — weekly review of UI consistency, dark mode compliance, accessibility issues.",
    agentType: "design",
    tools: ["database"],
    schedule: "0 10 * * 1",
    budgetMonthlyCents: 2000,
    monthlyRetainerCents: 4900,
    status: "paused",
    totalTasksCompleted: 4,
  },
  {
    name: "Rex",
    email: "rex@ambitt.agency",
    personality: "Calm under pressure, systems thinker. Monitors everything, alerts only when it matters. Hates false alarms.",
    purpose: "DevOps and platform reliability — monitors uptime, API response times, error rates, deployment health.",
    agentType: "ops",
    tools: ["railway", "database"],
    schedule: "*/15 * * * *",
    budgetMonthlyCents: 2000,
    monthlyRetainerCents: 4900,
    status: "active",
    totalTasksCompleted: 89,
  },
];

async function seed() {
  console.log("Seeding McQuizzy as first client...\n");

  // Create client
  const client = await prisma.client.upsert({
    where: { email: "kyle@mcquizzy.ai" },
    update: {},
    create: {
      email: "kyle@mcquizzy.ai",
      businessName: "McQuizzy",
      industry: "EdTech",
      businessGoal: "The smartest, fastest path to your next IT career.",
      brandVoice: "Direct, no-BS, slightly playful. We respect the grind. No corporate fluff.",
      preferredChannel: "email",
      northStarMetric: "Monthly active quiz takers who complete at least one full mock exam",
      agentGoal: "Grow from pre-launch to 100 paying subscribers in 90 days",
      stripeCustomerId: "cus_mcquizzy_test",
      billingEmail: "kyle@mcquizzy.ai",
      billingStatus: "active",
    },
  });

  console.log(`  Client: ${client.businessName} (${client.id})\n`);

  // Create agents
  const now = new Date();
  for (const agent of agents) {
    const existing = await prisma.agent.findUnique({ where: { email: agent.email } });
    if (existing) {
      console.log(`  ⏭  ${agent.name} — already exists`);
      continue;
    }

    const created = await prisma.agent.create({
      data: {
        clientId: client.id,
        name: agent.name,
        email: agent.email,
        personality: agent.personality,
        purpose: agent.purpose,
        agentType: agent.agentType,
        tools: agent.tools,
        schedule: agent.schedule,
        autonomyLevel: "advisory",
        primaryModel: "claude-sonnet-4-6",
        analyticsModel: "gemini",
        creativeModel: "gpt-4o",
        status: agent.status,
        approvedAt: agent.status === "active" ? now : null,
        lastRunAt: agent.status === "active" ? new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000) : null,
        monthlyRetainerCents: agent.monthlyRetainerCents,
        setupFeeCents: 0,
        budgetMonthlyCents: agent.budgetMonthlyCents,
        historyTier: "standard",
        clientMemoryObject: JSON.stringify({}),
        totalTasksCompleted: agent.totalTasksCompleted,
      },
    });

    const icon = agent.status === "active" ? "✓" : agent.status === "pending_approval" ? "⏳" : "⏸";
    console.log(`  ${icon}  ${agent.name} (${agent.agentType}) — ${agent.status} — ${created.id}`);
  }

  // Seed some API usage so costs page has data
  const activeAgents = await prisma.agent.findMany({
    where: { clientId: client.id, status: "active" },
    select: { id: true, name: true },
  });

  console.log("\n  Seeding API usage...");
  const models = ["claude-sonnet-4-6", "gemini", "gpt-4o"];
  const taskTypes = ["analysis", "reporting", "client_conversation", "creative"];

  for (const agent of activeAgents) {
    const callCount = 5 + Math.floor(Math.random() * 20);
    for (let i = 0; i < callCount; i++) {
      const model = models[Math.floor(Math.random() * models.length)];
      const inputTokens = 500 + Math.floor(Math.random() * 3000);
      const outputTokens = 200 + Math.floor(Math.random() * 2000);

      // Rough cost calc
      let costInCents = 0;
      if (model === "claude-sonnet-4-6") {
        costInCents = Math.ceil((inputTokens * 300 + outputTokens * 1500) / 1_000_000);
      } else if (model === "gemini") {
        costInCents = Math.ceil((inputTokens * 7.5 + outputTokens * 30) / 1_000_000);
      } else {
        costInCents = Math.ceil((inputTokens * 250 + outputTokens * 1000) / 1_000_000);
      }

      await prisma.apiUsage.create({
        data: {
          agentId: agent.id,
          model,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          costInCents,
          taskType: taskTypes[Math.floor(Math.random() * taskTypes.length)],
          createdAt: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        },
      });
    }
    console.log(`    ${agent.name}: ${callCount} API calls`);
  }

  // Seed Oracle actions
  console.log("\n  Seeding Oracle actions...");
  const oracleActions = [
    { type: "scaffold_agent", desc: "Bulk import: 10 agents for McQuizzy" },
    { type: "fleet_health_check", desc: "Fleet: 8 active, 1 pending, 1 paused, 0 stale, 0 budget alerts" },
    { type: "approval_request", desc: 'Sent WhatsApp approval request for agent "Dexter"' },
    { type: "fleet_health_check", desc: "Fleet: 8 active, 1 pending, 1 paused, 0 stale, 0 budget alerts" },
    { type: "improvement_cycle", desc: "Generated 2 improvement suggestion(s)" },
  ];

  for (let i = 0; i < oracleActions.length; i++) {
    await prisma.oracleAction.create({
      data: {
        actionType: oracleActions[i].type,
        description: oracleActions[i].desc,
        clientId: client.id,
        status: "completed",
        result: oracleActions[i].type === "improvement_cycle"
          ? JSON.stringify([
              { agentType: "analytics", currentIssue: "Daily reports too long — clients skim past key metrics", suggestedChange: "Lead with a 1-line verdict before the numbers", confidence: "high" },
              { agentType: "content", currentIssue: "Blog posts not generating organic traffic", suggestedChange: "Switch from broad topics to long-tail certification-specific keywords", confidence: "medium" },
            ])
          : null,
        createdAt: new Date(now.getTime() - (oracleActions.length - i) * 3 * 60 * 60 * 1000),
      },
    });
  }

  console.log(`    ${oracleActions.length} actions created`);
  console.log("\n✅ Done. Open http://localhost:3001 to see it.\n");

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
