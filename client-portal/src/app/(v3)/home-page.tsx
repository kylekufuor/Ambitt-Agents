import prisma from "@/lib/db";
import { V3Shell } from "@/components/v3-shell";
import { HomeOverview } from "@/components/home-overview";
import { requirePortalContext } from "@/lib/portal-context";

export async function HomePage() {
  const { email, client, agent } = await requirePortalContext();
  const greeting = client.preferredName ?? client.contactName ?? client.businessName;
  if (!agent) return <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Home" }]}>
    <HomeOverview greeting={greeting} agent={null} leadsTotal={0} leadsThisWeek={0} sentThisWeek={0} pendingApprovals={0} hotLeads={[]} />
  </V3Shell>;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [leadsTotal, leadsThisWeek, sentThisWeek, pendingApprovals, hotLeads] = await Promise.all([
    prisma.lead.count({ where: { clientId: client.id } }),
    prisma.lead.count({ where: { clientId: client.id, createdAt: { gte: since } } }),
    prisma.emailSend.count({ where: { agentId: agent.id, acceptedAt: { gte: since } } }),
    prisma.recommendation.count({ where: { agentId: agent.id, status: "pending" } }),
    prisma.lead.findMany({
      where: { clientId: client.id, temperature: "hot" },
      orderBy: { temperatureSetAt: "desc" },
      take: 3,
      select: {
        id: true, name: true, company: true, status: true,
        temperature: true, temperatureReason: true, temperatureSetBy: true,
      },
    }),
  ]);

  return <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Home" }]}>
    <HomeOverview greeting={greeting} agent={agent} leadsTotal={leadsTotal} leadsThisWeek={leadsThisWeek}
      sentThisWeek={sentThisWeek} pendingApprovals={pendingApprovals} hotLeads={hotLeads} />
  </V3Shell>;
}
