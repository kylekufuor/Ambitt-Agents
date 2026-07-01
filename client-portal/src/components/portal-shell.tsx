import Link from "next/link";
import { BrandLockup } from "./brand-mark";
import { AccountMenu } from "./account-menu";

/**
 * PortalShell — the wrapping chrome for every authenticated client surface.
 * Renders the top bar (brand lockup left, agent name center if provided,
 * account menu right) and a page-wash background underneath.
 *
 * Server component (no useState) — interactive bits (the account dropdown)
 * are isolated to <AccountMenu />.
 */
export function PortalShell({
  user,
  agentName,
  agentRole,
  agentStatus,
  children,
}: {
  user: { email: string; name?: string | null };
  agentName?: string;
  agentRole?: string;
  agentStatus?: "active" | "paused" | "pending_approval" | "killed";
  children: React.ReactNode;
}) {
  return (
    <div className="page-wash">
      <header className="border-b border-[color:var(--border)] bg-[color:var(--surface)]/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
          <Link href="/" className="shrink-0">
            <BrandLockup height={20} />
          </Link>

          {agentName && (
            <div className="hidden md:flex items-center gap-2 min-w-0">
              <div className="w-px h-5 bg-[color:var(--border)]" />
              <div className="flex items-center gap-2 min-w-0">
                <AgentStatusDot status={agentStatus ?? "active"} />
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-[color:var(--text)] truncate">{agentName}</div>
                  {agentRole && (
                    <div className="text-[11px] text-[color:var(--text-3)] truncate leading-tight">{agentRole}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <AccountMenu email={user.email} displayName={user.name ?? user.email.split("@")[0]} />
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-[color:var(--border)] mt-12 py-6 bg-[color:var(--surface)]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex items-center justify-between text-[12px] text-[color:var(--text-3)]">
          <span>Ambitt Agents · ambitt.agency</span>
          <a href="mailto:support@ambitt.agency" className="hover:text-[color:var(--text)] transition-colors">
            support@ambitt.agency
          </a>
        </div>
      </footer>
    </div>
  );
}

function AgentStatusDot({ status }: { status: "active" | "paused" | "pending_approval" | "killed" }) {
  const map = {
    active: { cls: "dot-emerald dot-pulse", title: "Active" },
    paused: { cls: "dot-muted", title: "Paused" },
    pending_approval: { cls: "dot-blue dot-pulse", title: "Building" },
    killed: { cls: "dot-red", title: "Killed" },
  } as const;
  const { cls, title } = map[status];
  return <span className={`dot ${cls}`} title={title} />;
}
