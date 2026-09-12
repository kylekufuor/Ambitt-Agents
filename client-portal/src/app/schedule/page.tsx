import { requirePortalContext } from "@/lib/portal-context";
import { V3Shell } from "@/components/v3-shell";
import { PageHead, Panel } from "@/components/v3-ui";
import { ScheduleEditor } from "@/app/agents/[id]/schedule-editor";
import { AgentPower } from "@/app/agent/how/agent-power";
export const dynamic = "force-dynamic";
export default async function SchedulePage() {
  const { email, client, agent } = await requirePortalContext();
  return <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Schedule" }]}><PageHead title="Working hours & schedule" sub="Decide when your agent runs, or pause the work." />{agent && <Panel><div className="flex items-center justify-between gap-5 mb-6"><div><h2 className="text-xl font-medium">{agent.name}</h2><p className="text-sm text-[color:var(--text-3)] mt-2">All times in {agent.timezone.replaceAll('_', ' ')}.</p></div><AgentPower agentId={agent.id} agentName={agent.name} status={agent.status} pausedBy={agent.pausedBy} /></div><ScheduleEditor agentId={agent.id} initial={agent.schedule} /></Panel>}</V3Shell>;
}
