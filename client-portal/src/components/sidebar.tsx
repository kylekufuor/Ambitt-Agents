"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "./brand-mark";
import { signOut } from "@/app/actions";

type Agent = { id: string; name: string; status: string };

const DOT: Record<string, string> = {
  active: "dot-emerald",
  paused: "dot-muted",
  pending_approval: "dot-blue",
  building: "dot-blue",
  killed: "dot-red",
};

/**
 * Left navigation — the portal's primary wayfinding (HubSpot-style). Global
 * items up top, the client's agents listed with their sub-pages expanding when
 * active, account + sign-out pinned to the bottom. Client component so it can
 * highlight the active route via usePathname.
 */
export function Sidebar({
  agents,
  email,
  displayName,
}: {
  agents: Agent[];
  email: string;
  displayName: string;
}) {
  const pathname = usePathname();
  const activeAgentId = pathname.match(/^\/agents\/([^/]+)/)?.[1] ?? null;
  const initials =
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "A";

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 h-screen sticky top-0 bg-[color:var(--surface)] border-r border-[color:var(--border)]">
      {/* Brand */}
      <div className="h-14 flex items-center px-5 border-b border-[color:var(--border)]">
        <Link href="/">
          <BrandLockup height={19} />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavItem href="/" label="Home" active={pathname === "/"} icon={<HomeIcon />} />

        <p className="eyebrow px-3 mt-5 mb-1.5">Your agents</p>
        {agents.length === 0 ? (
          <p className="px-3 py-1.5 text-[12.5px] text-[color:var(--text-4)]">No agents yet</p>
        ) : (
          agents.map((a) => {
            const isActive = activeAgentId === a.id;
            const base = `/agents/${a.id}`;
            return (
              <div key={a.id} className="mb-0.5">
                <Link
                  href={base}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius)] text-[13.5px] transition ${
                    isActive
                      ? "bg-[color:var(--brand-tint)] text-[color:var(--brand-hover)] font-medium"
                      : "text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)]"
                  }`}
                >
                  <span className={`dot ${DOT[a.status] ?? "dot-muted"} shrink-0`} />
                  <span className="truncate">{a.name}</span>
                </Link>
                {isActive && (
                  <div className="mt-0.5 mb-1.5 ml-[19px] pl-3 border-l border-[color:var(--border)] flex flex-col">
                    <SubItem href={base} label="Overview" active={pathname === base} />
                    <SubItem href={`${base}#communication`} label="Communication" />
                    <SubItem href={`${base}/tools`} label="Tools" active={pathname === `${base}/tools`} />
                    <SubItem href={`${base}/activity`} label="Activity" active={pathname === `${base}/activity`} />
                    <SubItem href={`${base}/leads`} label="Leads" active={pathname === `${base}/leads`} />
                    <SubItem href={`${base}#settings`} label="Configure" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>

      {/* Account */}
      <div className="border-t border-[color:var(--border)] p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="w-8 h-8 rounded-full bg-[color:var(--text)] text-white font-medium text-[11px] flex items-center justify-center shrink-0">
            {initials}
          </span>
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-[color:var(--text)] truncate">{displayName}</div>
            <div className="text-[11px] text-[color:var(--text-3)] truncate">{email}</div>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full text-left px-2 py-1.5 mt-0.5 rounded-[var(--radius)] text-[12.5px] text-[color:var(--text-3)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)] transition"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius)] text-[13.5px] transition ${
        active
          ? "bg-[color:var(--brand-tint)] text-[color:var(--brand-hover)] font-medium"
          : "text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)]"
      }`}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      {label}
    </Link>
  );
}

function SubItem({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-[var(--radius)] text-[12.5px] transition ${
        active
          ? "text-[color:var(--brand-hover)] font-medium"
          : "text-[color:var(--text-3)] hover:text-[color:var(--text)] hover:bg-[color:var(--surface-2)]"
      }`}
    >
      {label}
    </Link>
  );
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}
