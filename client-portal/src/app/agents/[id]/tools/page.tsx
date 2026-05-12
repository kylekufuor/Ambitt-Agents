import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { ToolsList } from "./tools-list";

export const dynamic = "force-dynamic";

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
  }>;
  personalInfo: Array<{
    itemId: string;
    title: string;
    fields: Array<{ title: string; fieldType: string; filled: boolean }>;
    allFilled: boolean;
    lastAccessedAt: string | null;
  }>;
}

export default async function AgentToolsPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    notFound();
  }

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: { id: true, name: true, purpose: true },
  });
  if (!agent) notFound();

  // Server-side fetch the derived tools list from Oracle. cache: no-store
  // so the page always reflects current 1Password / Composio state.
  let data: ToolsResponse = { tools: [], personalInfo: [] };
  let fetchError: string | null = null;
  try {
    const res = await fetch(`${oracleUrl()}/agents/${id}/tools`, { cache: "no-store" });
    if (res.ok) {
      data = (await res.json()) as ToolsResponse;
    } else {
      fetchError = `Oracle returned ${res.status}`;
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown fetch error";
  }

  const connectedCount = data.tools.filter((t) => t.status === "connected").length;
  const needsSetupCount =
    data.tools.filter((t) => t.status === "needs_setup" || t.status === "partial").length +
    data.personalInfo.filter((p) => !p.allFilled).length;

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <nav className="mb-6 text-xs text-zinc-500">
        <Link href="/" className="hover:underline">Home</Link>
        <span className="mx-2">/</span>
        <Link href={`/agents/${id}`} className="hover:underline">{agent.name}</Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-700">Tools</span>
      </nav>

      <header className="mb-7">
        <h1 className="text-2xl font-semibold text-zinc-900 mb-1">Tools &amp; credentials</h1>
        <p className="text-sm text-zinc-600 leading-relaxed">
          The tools {agent.name} uses on your behalf, with secure credential storage in 1Password.
        </p>
        <div className="flex items-center gap-3 mt-3 text-xs text-zinc-500">
          <span><span className="text-emerald-600 font-medium">{connectedCount}</span> connected</span>
          <span>·</span>
          <span><span className="text-amber-600 font-medium">{needsSetupCount}</span> needs setup</span>
        </div>
      </header>

      {fetchError && (
        <div className="mb-6 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
          Couldn&apos;t load tools: {fetchError}. Try refreshing.
        </div>
      )}

      <ToolsList agentId={id} agentName={agent.name} initialData={data} />
    </main>
  );
}
