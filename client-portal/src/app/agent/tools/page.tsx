import { notFound, redirect } from "next/navigation";
import { requirePortalContext } from "@/lib/portal-context";

/**
 * The tools page already exists, is well built, and talks to Oracle for live
 * Composio and credential state. Re-implementing it against the same endpoint
 * would be a second copy of that contract to keep in step, so this resolves
 * "the agent in the rail" to a real id and hands off.
 *
 * It renders in the OLD shell today, which is a visible seam. Porting it into
 * V3Shell is a contained follow-up: it is one page and the client components
 * (ToolsList, WhatsappCard) already take plain props.
 */
export default async function AgentToolsRedirect() {
  const { agent } = await requirePortalContext();
  if (!agent) notFound();
  redirect(`/agents/${agent.id}/tools`);
}
