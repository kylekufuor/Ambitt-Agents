import prisma from "../../shared/db.js";
async function main() {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      agents: {
        where: { status: { not: "killed" } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, customTools: true },
      },
    },
  });
  let added = 0;
  for (const client of clients) {
    const agent = client.agents[0];
    if (!agent || !Array.isArray(agent.customTools)) continue;
    for (const raw of agent.customTools) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const item = raw as Record<string, unknown>;
      if (typeof item.siteUrl !== "string" || typeof item.name !== "string")
        continue;
      let url: URL;
      try {
        url = new URL(item.siteUrl);
      } catch {
        continue;
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        continue;
      url.hash = "";
      url.search = "";
      if (
        await prisma.workspaceTool.findFirst({
          where: { clientId: client.id, url: url.toString() },
        })
      )
        continue;
      await prisma.workspaceTool.create({
        data: {
          clientId: client.id,
          agentId: agent.id,
          kind: "web",
          name: item.name.slice(0, 80),
          url: url.toString(),
        },
      });
      added++;
    }
  }
  console.log(
    `Added ${added} existing web tools to client workspaces. No credentials or browser sessions changed.`,
  );
  await prisma.$disconnect();
}
main().catch(() => {
  console.error("Tool backfill failed. No client data printed.");
  process.exit(1);
});
