import prisma from "../shared/db.js";

async function main(): Promise<void> {
  const agents = await prisma.agent.findMany({
    select: {
      id: true, name: true, status: true, clientId: true,
      tone: true, emailFrequency: true,
      client: { select: { businessName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log(JSON.stringify(agents, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
