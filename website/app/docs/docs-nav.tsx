"use client";

import { useEffect, useState } from "react";
import { DOC_GROUPS, DOC_SECTIONS, pickActiveSection } from "./sections";

/* ---------------------------------------------------------------------------
   The two rails, and the one piece of state they share.

   A docs page without a "you are here" is a wall. Both rails highlight the
   section currently being read, which is the difference between a nav that
   lists the page and a nav that tracks it.

   Tracked with IntersectionObserver rather than a scroll handler: the browser
   does the work off the main thread, and there is no listener firing on every
   pixel of a long page. The rootMargin pins the trigger line near the top of
   the viewport so a heading becomes "current" as it arrives rather than when
   it happens to be centred.
   --------------------------------------------------------------------------- */

function useActiveSection(): string {
  const [active, setActive] = useState<string>(DOC_SECTIONS[0]?.id ?? "");

  useEffect(() => {
    const targets = DOC_SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (targets.length === 0) return;

    // Which of the on-screen sections wins is decided by pickActiveSection,
    // which is pure and unit-tested — see sections.test.ts.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        setActive((prev) => pickActiveSection(visible, prev));
      },
      // Top ~12% of the viewport is the reading line; the negative bottom margin
      // stops a section far below from claiming focus.
      { rootMargin: "-12% 0px -70% 0px", threshold: 0 }
    );

    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return active;
}

/** Left sidebar: every section, grouped. Sticky beside the content. */
export function DocsSidebar() {
  const active = useActiveSection();

  return (
    <nav aria-label="Documentation sections" className="docs-side">
      {DOC_GROUPS.map((g) => (
        <div key={g.label} className="docs-side-group">
          <p className="docs-side-label">{g.label}</p>
          <ul>
            {g.sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={s.id === active ? "is-here" : undefined}
                  aria-current={s.id === active ? "location" : undefined}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Right rail: the same list, flat, the way docs readers expect it. */
export function DocsOnThisPage() {
  const active = useActiveSection();

  return (
    <nav aria-label="On this page" className="docs-toc">
      <p className="docs-side-label">On this page</p>
      <ul>
        {DOC_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={s.id === active ? "is-here" : undefined}
              aria-current={s.id === active ? "location" : undefined}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
