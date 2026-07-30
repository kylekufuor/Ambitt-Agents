import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { oracleUrl } from "@/lib/agent-auth";
import { V3Shell } from "@/components/v3-shell";
import { PageHead, Panel } from "@/components/v3-ui";
import { requirePortalContext } from "@/lib/portal-context";
import { ToolsList } from "@/app/agents/[id]/tools/tools-list";
import { WhatsAppCard } from "@/app/agents/[id]/tools/whatsapp-card";

export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------------------
   /agent/tools — the last page still rendering in the old shell.

   ToolsList and WhatsAppCard are reused exactly as they are. They take plain
   props and already own the whole connect / disconnect / credential flow
   against Oracle, so rebuilding them would have meant a second copy of that
   contract to keep in step for no gain. Only the page around them is new.

   Both Oracle fetches are the same calls the old page made, for the same
   reason: the list has to reflect live Composio and vault state, and there is
   exactly one endpoint that knows it.

   `?a=<agentId>` exists so the OLD /agents/[id]/tools links — which are sitting
   in clients' inboxes — can redirect here without changing which agent they
   were about. Without it the redirect would silently resolve to the rail's
   primary agent, and a client with two agents would open a link for one and be
   shown the other. Ownership is re-checked here; the id in the URL only ever
   narrows to an agent the session already owns.
   --------------------------------------------------------------------------- */

interface ToolsResponse {
  tools: Array<{
    id: string;
    name: string;
    logoUrl: string | null;
    category: string | null;
    authMethods: Array<"oauth" | "credentials">;
    status: "connected" | "needs_setup" | "partial";
    oauth: { connectionId: string; connectedAt: string | null } | null;
    credentials: {
      itemId: string;
      fields: Array<{ title: string; fieldType: string; filled: boolean }>;
      allFilled: boolean;
      lastAccessedAt: string | null;
    } | null;
    source?: "composio" | "custom";
    siteUrl?: string | null;
    vaultPending?: boolean;
    accountEmail?: string | null;
    appSlug?: string | null;
    loginStatus?: "ok" | "failed" | null;
    loginError?: string | null;
  }>;
  personalInfo: Array<{
    itemId: string;
    title: string;
    fields: Array<{ title: string; fieldType: string; filled: boolean }>;
    allFilled: boolean;
    lastAccessedAt: string | null;
  }>;
}

export default async function AgentToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>;
}) {
  const { a: requested } = await searchParams;
  const { email, client, agent: primary } = await requirePortalContext();

  // A requested agent must belong to THIS client, or it does not exist to them.
  const agent = requested
    ? await prisma.agent.findFirst({
        where: { id: requested, clientId: client.id, status: { not: "killed" } },
        select: { id: true, name: true },
      })
    : primary;
  if (!agent) notFound();

  let data: ToolsResponse = { tools: [], personalInfo: [] };
  let fetchError: string | null = null;
  try {
    const res = await fetch(`${oracleUrl()}/agents/${agent.id}/tools`, { cache: "no-store" });
    if (res.ok) data = (await res.json()) as ToolsResponse;
    else fetchError = `Oracle returned ${res.status}`;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown fetch error";
  }

  // WhatsApp MFA-relay state (the platform's own Twilio channel).
  let waState = {
    connected: false,
    whatsappNumber: null as string | null,
    sandboxNumber: "+14155238886",
    sandboxJoinCode: null as string | null,
  };
  try {
    const waRes = await fetch(`${oracleUrl()}/agents/${agent.id}/whatsapp`, { cache: "no-store" });
    if (waRes.ok) waState = { ...waState, ...(await waRes.json()) };
  } catch {
    // Non-fatal. The card renders with defaults rather than taking the page down.
  }

  const connected = data.tools.filter((t) => t.status === "connected").length;
  const needsYou =
    data.tools.filter((t) => t.status === "needs_setup" || t.status === "partial").length +
    data.personalInfo.filter((p) => !p.allFilled).length;

  return (
    <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Tools" }]}>
      <PageHead
        title={`What ${agent.name} works with`}
        sub={`The accounts ${agent.name} uses on your behalf. Your passwords sit in an encrypted vault, and we never see or store the values ourselves.`}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 -mt-1 mb-4">
        <span className="inline-flex items-center gap-2 text-[13px] text-[color:var(--text-2)]">
          <span className="dot dot-emerald" />
          <span className="font-semibold text-[color:var(--text)]">{connected}</span>
          connected
        </span>
        <span className="inline-flex items-center gap-2 text-[13px] text-[color:var(--text-2)]">
          <span className={`dot ${needsYou > 0 ? "dot-amber" : "dot-muted"}`} />
          <span className="font-semibold text-[color:var(--text)]">{needsYou}</span>
          {needsYou === 1 ? "still needs you" : "still need you"}
        </span>
      </div>

      {/* An Oracle outage is ours, not the client's. Say so plainly, keep the
          page usable, and put the technical string last for forwarding. */}
      {fetchError && (
        <Panel className="mb-4">
          <div className="flex items-start gap-3">
            <span className="dot dot-red mt-[7px] shrink-0" />
            <div className="text-[13.5px] leading-relaxed">
              <p className="font-medium text-[color:var(--text)]">We could not load your tools just now</p>
              <p className="text-[color:var(--text-2)] mt-0.5">
                This is on our side, not yours. Refresh and it should come back. If it keeps
                happening, reply to any of {agent.name}&apos;s emails and we will jump on it.
              </p>
              <p className="text-[12px] text-[color:var(--text-3)] mt-1.5 font-mono">{fetchError}</p>
            </div>
          </div>
        </Panel>
      )}

      <WhatsAppCard agentId={agent.id} agentName={agent.name} initial={waState} />
      <ToolsList agentId={agent.id} agentName={agent.name} initialData={data} />
    </V3Shell>
  );
}
