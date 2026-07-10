import Link from "next/link";
import prisma from "@/lib/db";
import { BrandLockup } from "./brand-mark";
import { AccountMenu } from "./account-menu";
import { Sidebar } from "./sidebar";

/**
 * PortalShell — the wrapping chrome for every authenticated client surface.
 * HubSpot-style: a persistent left sidebar (global nav + the client's agents
 * and their sub-pages) with the page content to its right. On small screens the
 * sidebar is hidden and a slim top bar takes over.
 *
 * Async server component: fetches the client's agents for the sidebar nav.
 * Interactive bits (sidebar active states, account dropdown) are isolated to
 * their own client components.
 */
export async function PortalShell({
  user,
  children,
}: {
  user: { email: string; name?: string | null };
  // Legacy per-agent props are still accepted by callers but no longer render a
  // top-bar chip — the sidebar now carries agent context.
  agentName?: string;
  agentRole?: string;
  agentStatus?: "active" | "paused" | "pending_approval" | "killed";
  children: React.ReactNode;
}) {
  const client = await prisma.client.findUnique({
    where: { email: user.email },
    select: { agents: { select: { id: true, name: true, status: true }, orderBy: { createdAt: "asc" } } },
  });
  const agents = client?.agents ?? [];
  const displayName = user.name ?? user.email.split("@")[0];

  return (
    <div className="min-h-screen flex bg-[color:var(--bg)]">
      <Sidebar agents={agents} email={user.email} displayName={displayName} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar — sidebar is hidden under lg */}
        <header className="lg:hidden border-b border-[color:var(--border)] bg-[color:var(--surface)] sticky top-0 z-30">
          <div className="px-4 h-14 flex items-center justify-between">
            <Link href="/">
              <BrandLockup height={19} />
            </Link>
            <AccountMenu email={user.email} displayName={displayName} />
          </div>
        </header>

        <main className="flex-1 min-w-0">{children}</main>

        <footer className="border-t border-[color:var(--border)] py-5 bg-[color:var(--surface)]">
          <div className="max-w-[1000px] mx-auto px-6 flex items-center justify-between text-[12px] text-[color:var(--text-3)]">
            <span>Ambitt Agents · ambitt.agency</span>
            <a href="mailto:support@ambitt.agency" className="hover:text-[color:var(--text)] transition-colors">
              support@ambitt.agency
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
