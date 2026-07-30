import { redirect } from "next/navigation";
import { verifyAgentOwnership } from "@/lib/agent-auth";

/**
 * The tools page lives at /agent/tools now, in the v3 shell.
 *
 * This route stays because the old path is in clients' inboxes and browser
 * histories. It keeps its ownership check — so an unauthorised id still 404s
 * here rather than being bounced somewhere that leaks whether it exists — and
 * carries the agent id across, so a link for one agent never opens another.
 */
export default async function LegacyAgentToolsPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/");
  }
  redirect(`/agent/tools?a=${encodeURIComponent(id)}`);
}
