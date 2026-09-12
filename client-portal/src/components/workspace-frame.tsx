import { NavigationLink as Link } from "./navigation-link";
import { NotificationBell } from "./v3-bell";
import { RailNav, MobileRail, type RailProps } from "./v3-rail";
import { ThemeToggle } from "./theme-toggle";
import type { Crumb } from "./v3-shell";

export function WorkspaceFrame({ user, crumbs, rail, notifications, children }: {
  user: { email: string; name?: string | null };
  crumbs: Crumb[];
  rail: RailProps;
  notifications: React.ComponentProps<typeof NotificationBell>;
  children: React.ReactNode;
}) {
  const initials =
    (user.name ?? user.email).split(/[\s@.]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="min-h-screen grid lg:grid-cols-[224px_1fr] portal-frame bg-[color:var(--bg)]">
      <aside className="v3-rail hidden lg:flex flex-col py-2.5">
        <RailNav {...rail} />
      </aside>

      <div className="v3-main min-w-0 flex flex-col">
        <header className="v3-top h-[60px] flex items-center gap-3 px-4 lg:px-5 shrink-0">
          <div className="lg:hidden"><MobileRail {...rail} /></div>
          <nav className="text-[14px] text-[color:var(--text-3)] min-w-0 truncate" aria-label="Breadcrumb">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <span key={`${c.label}-${i}`}>
                  {i > 0 && <span className="px-1.5 text-[color:var(--text-4)]">/</span>}
                  {last || !c.href ? (
                    <span className="text-[color:var(--text)] font-medium" aria-current="page">{c.label}</span>
                  ) : (
                    <Link href={c.href} className="hover:text-[color:var(--text)] transition-colors">{c.label}</Link>
                  )}
                </span>
              );
            })}
          </nav>
          <span className="flex-1" />
          <ThemeToggle /><NotificationBell {...notifications} />
          <Link
            href="/settings"
            className="w-[26px] h-[26px] rounded-full bg-[color:var(--brand-solid)] text-white text-[10.5px] font-semibold grid place-items-center shrink-0"
            aria-label="Your account"
          >
            {initials}
          </Link>
        </header>

        <main className="portal-content flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
