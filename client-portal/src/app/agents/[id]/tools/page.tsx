import { verifyAgentOwnership, oracleUrl } from "@/lib/agent-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { ToolsList } from "./tools-list";
import { WhatsAppCard } from "./whatsapp-card";
import { ToolsIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

// Small local duotone glyph for the load-error notice — soft base + crisp mark
// + lit highlight, matching the house icon language (not a flat stroke icon).
function AlertGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.3 4.2 3.6 16a2 2 0 0 0 1.7 3h13.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" fill="currentColor" opacity="0.2" />
      <path d="M10.3 4.2 3.6 16a2 2 0 0 0 1.7 3h13.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M12 9v4.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.4" r="1.15" fill="currentColor" />
      <path d="M10.8 5.6 7 12.4a.6.6 0 0 1-1-.6l3.6-6.7a.7.7 0 0 1 1.2.5Z" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}

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

  // WhatsApp MFA-relay setup state (native — the platform's own Twilio channel).
  let waState = {
    connected: false,
    whatsappNumber: null as string | null,
    sandboxNumber: "+14155238886",
    sandboxJoinCode: null as string | null,
  };
  try {
    const waRes = await fetch(`${oracleUrl()}/agents/${id}/whatsapp`, { cache: "no-store" });
    if (waRes.ok) waState = { ...waState, ...(await waRes.json()) };
  } catch {
    // non-fatal — the card renders with defaults
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <nav className="mb-6 flex items-center gap-2 text-[12.5px] text-[color:var(--text-3)]">
        <Link href="/" className="hover:text-[color:var(--text)] transition-colors">Home</Link>
        <span className="text-[color:var(--text-4)]">/</span>
        <Link href={`/agents/${id}`} className="hover:text-[color:var(--text)] transition-colors">{agent.name}</Link>
        <span className="text-[color:var(--text-4)]">/</span>
        <span className="text-[color:var(--text-2)] font-medium">Tools</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-start gap-4">
          <span className="chip-icon chip-teal shrink-0 mt-0.5">
            <ToolsIcon size={20} />
          </span>
          <div className="min-w-0">
            <p className="eyebrow mb-2">Tools &amp; access</p>
            <h1 className="font-display text-[26px] leading-tight text-[color:var(--text)]">
              What {agent.name}{" "}works with
            </h1>
            <p className="text-[14.5px] text-[color:var(--text-3)] leading-relaxed mt-2 max-w-[560px]">
              These are the accounts {agent.name}{" "}uses on your behalf. Your passwords are
              held in an encrypted vault — we never see or store the values ourselves.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5">
          <span className="inline-flex items-center gap-2 text-[13px] text-[color:var(--text-2)]">
            <span className="dot dot-emerald" />
            <span className="font-semibold text-[color:var(--text)]">{connectedCount}</span>
            connected
          </span>
          <span className="inline-flex items-center gap-2 text-[13px] text-[color:var(--text-2)]">
            <span className={`dot ${needsSetupCount > 0 ? "dot-amber" : "dot-muted"}`} />
            <span className="font-semibold text-[color:var(--text)]">{needsSetupCount}</span>
            {needsSetupCount === 1 ? "still needs you" : "still need you"}
          </span>
        </div>
      </header>

      {fetchError && (
        <div className="card mb-6 p-4 flex items-start gap-3" style={{ background: "var(--red-tint)" }}>
          <span className="text-[color:var(--red)] shrink-0 mt-0.5"><AlertGlyph /></span>
          <div className="text-[13.5px] leading-relaxed">
            <p className="font-semibold text-[color:var(--text)]">We couldn&apos;t load your tools just now</p>
            <p className="text-[color:var(--text-2)] mt-0.5">
              This is on our side, not yours — give the page a refresh and it should come right
              back. If it keeps happening, reply to any agent email and we&apos;ll jump on it.
            </p>
            <p className="text-[12px] text-[color:var(--text-3)] mt-1.5 font-mono">{fetchError}</p>
          </div>
        </div>
      )}

      <WhatsAppCard agentId={id} agentName={agent.name} initial={waState} />

      <ToolsList agentId={id} agentName={agent.name} initialData={data} />
    </main>
  );
}
