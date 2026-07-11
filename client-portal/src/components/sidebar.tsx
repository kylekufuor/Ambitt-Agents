"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "./brand-mark";
import { HomeIcon } from "./icons";
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
 * SidebarBody — the shared nav content (brand + agents + account), used by both
 * the desktop sidebar and the mobile drawer. `onNavigate` lets the mobile drawer
 * close itself when a link is tapped.
 */
function SidebarBody({
  agents,
  email,
  displayName,
  onNavigate,
}: {
  agents: Agent[];
  email: string;
  displayName: string;
  onNavigate?: () => void;
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
    <>
      {/* Brand */}
      <div className="h-14 flex items-center px-5 border-b border-[color:var(--border)]">
        <Link href="/" onClick={onNavigate}>
          <BrandLockup height={19} />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavLink href="/" label="Home" active={pathname === "/"} icon={<HomeIcon size={18} />} onNavigate={onNavigate} />

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
                  onClick={onNavigate}
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
                    <SubItem href={base} label="Overview" active={pathname === base} onNavigate={onNavigate} />
                    <SubItem href={`${base}#communication`} label="Communication" onNavigate={onNavigate} />
                    <SubItem href={`${base}/tools`} label="Tools" active={pathname === `${base}/tools`} onNavigate={onNavigate} />
                    <SubItem href={`${base}/activity`} label="Activity" active={pathname === `${base}/activity`} onNavigate={onNavigate} />
                    <SubItem href={`${base}/leads`} label="Leads" active={pathname === `${base}/leads`} onNavigate={onNavigate} />
                    <SubItem href={`${base}#settings`} label="Configure" onNavigate={onNavigate} />
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
    </>
  );
}

/** Desktop sidebar — fixed, always visible from lg up. */
export function Sidebar({ agents, email, displayName }: { agents: Agent[]; email: string; displayName: string }) {
  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 h-screen sticky top-0 bg-[color:var(--surface)] border-r border-[color:var(--border)]">
      <SidebarBody agents={agents} email={email} displayName={displayName} />
    </aside>
  );
}

/** Mobile — a hamburger that opens the same nav as a slide-in drawer. */
export function MobileNav({ agents, email, displayName }: { agents: Agent[]; email: string; displayName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change + lock body scroll while open + close on Esc.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="w-9 h-9 -ml-1.5 grid place-items-center rounded-[var(--radius)] text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)] transition"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-[rgba(45,62,80,0.35)]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-[80%] max-w-[300px] flex flex-col bg-[color:var(--surface)] shadow-[0_20px_60px_rgba(45,62,80,0.35)] animate-[drawer_0.22s_ease]">
            <SidebarBody agents={agents} email={email} displayName={displayName} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}

function NavLink({
  href,
  label,
  active,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
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

function SubItem({
  href,
  label,
  active = false,
  onNavigate,
}: {
  href: string;
  label: string;
  active?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
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
