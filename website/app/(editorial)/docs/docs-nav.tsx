"use client";

import { useEffect, useState } from "react";
import { DOC_GROUPS, DOC_SECTIONS, pickActiveSection } from "./sections";

function useActiveSection(): string {
  const [active, setActive] = useState<string>(DOC_SECTIONS[0]?.id ?? "");

  useEffect(() => {
    const targets = DOC_SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (targets.length === 0) return;

    const visible = new Set<string>();
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      visible.clear();
      // Percent root margins resolve against viewport width, even vertically.
      // Use pixels to keep a reading line below the header at every aspect ratio.
      const line = Math.min(120, window.innerHeight - 1);
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target.id);
            else visible.delete(entry.target.id);
          }
          setActive((previous) => pickActiveSection(visible, previous));
        },
        { rootMargin: `-${line}px 0px -${window.innerHeight - line - 1}px 0px`, threshold: 0 }
      );
      targets.forEach((target) => observer.observe(target));
    };

    observe();
    window.addEventListener("resize", observe);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", observe);
    };
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
