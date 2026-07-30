"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/* ---------------------------------------------------------------------------
   The v3 rail.

   Three groups, in the order the client cares about them:

     (unlabelled)  Home, Leads, Approvals, Activity   — the work
     ARTHUR        how he works, tools, email setup   — the agent
     ACCOUNT       billing, people, settings          — the portal

   The account group is the half v2 did not have at all: a client could not pay
   us, add a colleague, or set up their sending address from inside the portal.
   That is not a CRM missing a feature, it is a portal that is not one.

   The workspace chip at the top is the CLIENT's business, not our logo. This is
   their portal; our name belongs in the corner of an email, not at the top of
   their navigation.
   --------------------------------------------------------------------------- */

type IconName =
  | "home" | "leads" | "check" | "clock"
  | "cfg" | "tools" | "mail"
  | "card" | "team" | "gear";

function Icon({ name }: { name: IconName }) {
  // Custom duotone set: a 0.22-opacity body under a 1.7 stroke. Never Lucide,
  // never Heroicons — see client-portal/DESIGN.md.
  const paths: Record<IconName, React.ReactNode> = {
    home: (<>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="currentColor" opacity=".22" />
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </>),
    leads: (<>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="currentColor" opacity=".22" />
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.5 9h9M7.5 12.5h9M7.5 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </>),
    check: (<>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" opacity=".22" />
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8.5 12 2.4 2.4 4.6-4.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>),
    clock: (<>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" opacity=".22" />
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
    </>),
    cfg: (<>
      <path d="M5 8h14M5 16h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="10" cy="8" r="2.6" fill="currentColor" opacity=".22" />
      <circle cx="10" cy="8" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="15" cy="16" r="2.6" fill="currentColor" opacity=".22" />
      <circle cx="15" cy="16" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </>),
    tools: (<>
      <rect x="4" y="9" width="16" height="10" rx="2.4" fill="currentColor" opacity=".22" />
      <rect x="4" y="9" width="16" height="10" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 9V6.2M15 9V6.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </>),
    mail: (<>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="currentColor" opacity=".22" />
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </>),
    card: (<>
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" fill="currentColor" opacity=".22" />
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.7" />
    </>),
    team: (<>
      <circle cx="9" cy="9" r="3.2" fill="currentColor" opacity=".22" />
      <circle cx="9" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.6 19c.5-3 2.7-4.6 5.4-4.6s4.9 1.6 5.4 4.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 7.2a3 3 0 0 1 0 5.6M17.6 19c-.2-1.6-.7-2.9-1.5-3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </>),
    gear: (<>
      <circle cx="12" cy="12" r="7.6" fill="currentColor" opacity=".22" />
      <circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </>),
  };
  return <svg className="v3-ic" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export interface RailAgent {
  id: string;
  name: string;
  status: string;
  nextScheduledRun: string | null;
  pausedBy: string | null;
}

export interface RailProps {
  businessName: string;
  planLabel: string;
  agent: RailAgent | null;
  counts: { leads: number; approvals: number };
  toolsNeedSetup: boolean;
}

/**
 * The agent's line in the rail. The status WORD and the status COLOUR always
 * move together: an earlier design rewrote the text and left the dot emerald,
 * so a stopped agent read as working on every screen.
 */
function agentLine(a: RailAgent): { dot: string; line: string } {
  switch (a.status) {
    case "active": {
      const next = a.nextScheduledRun
        ? new Date(a.nextScheduledRun).toLocaleString("en-GB", {
            weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
          })
        : null;
      return { dot: "var(--emerald)", line: next ? `Working. Next run ${next}` : "Working" };
    }
    case "paused":
      // Who paused decides what the client can do about it, so it is in the words.
      return {
        dot: "var(--text-4)",
        line: a.pausedBy === "client" ? "Paused by you" : "Stopped by us",
      };
    case "building":
    case "pending_approval":
      return { dot: "var(--blue)", line: "Getting set up" };
    case "killed":
      return { dot: "var(--text-4)", line: "Finished" };
    default:
      return { dot: "var(--text-4)", line: a.status };
  }
}

/**
 * Destinations that do not exist yet are NOT links.
 *
 * The rail is built from the approved design, which has more rooms than the
 * house currently has. A nav item that 404s is worse than one that says it is
 * not ready: the client clicks Billing, lands on nothing, and now doubts the
 * rest of the nav. Each route flips to a real link the day its page lands, and
 * nothing else about the rail changes.
 */
const BUILT = new Set<string>(["/", "/leads"]);

function NavItem({
  href, label, icon, count, dot, active,
}: {
  href: string; label: string; icon: IconName;
  count?: number; dot?: boolean; active: boolean;
}) {
  if (!BUILT.has(href)) {
    return (
      <span className="v3-ni cursor-default opacity-55" aria-disabled="true" title="Not ready yet">
        <Icon name={icon} />
        {label}
        <span className="ml-auto text-[10.5px] text-[color:var(--text-3)] font-mono">soon</span>
      </span>
    );
  }
  return (
    <Link href={href} className="v3-ni" data-active={active} aria-current={active ? "page" : undefined}>
      <Icon name={icon} />
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-auto font-mono text-[11px] text-[color:var(--text-3)]">{count}</span>
      )}
      {dot && (
        <span
          className="ml-auto w-[6px] h-[6px] rounded-full bg-[color:var(--amber)] shrink-0"
          role="img"
          aria-label="needs setup"
        />
      )}
    </Link>
  );
}

export function RailNav({ businessName, planLabel, agent, counts, toolsNeedSetup }: RailProps) {
  const pathname = usePathname();
  const is = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const initials = businessName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const a = agent ? agentLine(agent) : null;

  return (
    <>
      <Link href="/" className="flex items-center gap-[9px] px-3 py-[7px] mx-2 mb-[10px] rounded-[5px] hover:bg-[rgba(27,49,57,0.045)] transition-colors no-underline">
        <span className="w-[26px] h-[26px] rounded-[5px] bg-[color:var(--brand-solid)] text-white text-[10.5px] font-semibold grid place-items-center shrink-0">
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-medium leading-tight truncate">{businessName}</span>
          <span className="block text-[11px] text-[color:var(--text-3)]">{planLabel}</span>
        </span>
      </Link>

      <nav className="px-2 flex flex-col gap-px" aria-label="Portal">
        <NavItem href="/" label="Home" icon="home" active={pathname === "/"} />
        <NavItem href="/leads" label="Leads" icon="leads" count={counts.leads} active={is("/leads")} />
        <NavItem href="/approvals" label="Approvals" icon="check" count={counts.approvals} active={is("/approvals")} />
        <NavItem href="/activity" label="Activity" icon="clock" active={is("/activity")} />

        {agent && (
          <>
            <p className="v3-navs">{agent.name}</p>
            <NavItem href="/agent/how" label="How he works" icon="cfg" active={is("/agent/how")} />
            <NavItem href="/agent/tools" label="Tools" icon="tools" dot={toolsNeedSetup} active={is("/agent/tools")} />
            <NavItem href="/agent/email" label="Email setup" icon="mail" active={is("/agent/email")} />
          </>
        )}

        <p className="v3-navs">Account</p>
        <NavItem href="/billing" label="Billing" icon="card" active={is("/billing")} />
        <NavItem href="/people" label="People" icon="team" active={is("/people")} />
        <NavItem href="/settings" label="Settings" icon="gear" active={is("/settings")} />
      </nav>

      {agent && a && (
        <div className="mt-auto mx-2 pt-3 pb-1.5 px-4 border-t border-[color:var(--border)]">
          <div className="flex items-center gap-2">
            <span
              className="w-[7px] h-[7px] rounded-full shrink-0"
              style={{ background: a.dot, boxShadow: `0 0 0 3px color-mix(in srgb, ${a.dot} 12%, transparent)` }}
            />
            <span className="text-[14px] font-medium">{agent.name}</span>
          </div>
          <p className="text-[11px] text-[color:var(--text-3)] mt-0.5 leading-snug">{a.line}</p>
        </div>
      )}
    </>
  );
}

/** Mobile: the rail becomes a drawer behind a hamburger. Same items, same URLs. */
export function MobileRail(props: RailProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden h-9 w-9 grid place-items-center rounded-[5px] border border-[color:var(--border)] bg-[color:var(--surface)]"
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-[rgba(27,49,57,0.4)]" onClick={() => setOpen(false)} />
          <aside className="v3-rail relative w-[268px] max-w-[86vw] h-full flex flex-col py-2.5 overflow-y-auto">
            <RailNav {...props} />
          </aside>
        </div>
      )}
    </>
  );
}
