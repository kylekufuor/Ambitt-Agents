"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ClientTodo } from "@/lib/client-todos";

/* ---------------------------------------------------------------------------
   The bell: what needs you, and the door to each thing.

   Every item is a link to the control that resolves it. A notification that
   reports a problem and leaves you to find the fix is half a notification, and
   the hunt is where people give up — which is exactly what happened with the
   mobile number, sitting unset for days behind a page nobody had reason to
   open.

   The badge counts REQUIRED items only. A badge that also counts suggestions
   never reaches zero, and a number that never clears stops being read.

   Empty is a real state with real copy, not a blank panel. "You are all caught
   up" is the most reassuring thing this component can ever say, so it is
   written properly rather than left as an afterthought.
   --------------------------------------------------------------------------- */

export function NotificationBell({
  items,
  requiredCount,
}: {
  items: ClientTodo[];
  requiredCount: number;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Click-away and Escape. A panel you can only shut by clicking the same
  // small target again is a panel people leave open by accident.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label =
    requiredCount === 0
      ? "Notifications, nothing needs you"
      : `Notifications, ${requiredCount} ${requiredCount === 1 ? "thing needs" : "things need"} you`;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-[8px] hover:bg-[color:var(--surface-2)] transition-colors"
      >
        <BellGlyph active={requiredCount > 0} />
        {requiredCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-[16px] px-[4px] rounded-full text-[10px] font-semibold flex items-center justify-center"
            style={{ background: "var(--red)", color: "#fffdfb" }}
          >
            {requiredCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[330px] card z-50 overflow-hidden"
          style={{ boxShadow: "var(--sh-3, 0 12px 28px rgba(27,49,57,0.14))" }}
        >
          <div className="px-4 py-3 border-b border-[color:var(--border)]">
            <p className="text-[13px] font-semibold text-[color:var(--text)]">
              {requiredCount === 0 ? "Nothing needs you" : "Waiting on you"}
            </p>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-5">
              <p className="text-[13px] text-[color:var(--text-2)] leading-relaxed">
                You are all caught up. We will put anything that needs a decision here, and your
                agent will email you as well.
              </p>
            </div>
          ) : (
            <ul className="max-h-[380px] overflow-y-auto">
              {items.map((t) => (
                <li key={t.id} className="border-b border-[color:var(--border)] last:border-0">
                  <Link
                    href={t.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 no-underline hover:bg-[color:var(--surface-2)] transition-colors"
                  >
                    <span className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className="w-[7px] h-[7px] rounded-full mt-[6px] shrink-0"
                        style={{
                          background:
                            t.urgency === "required" ? "var(--red)" : "var(--amber)",
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-[color:var(--text)]">
                          {t.label}
                        </span>
                        <span className="block text-[12.5px] text-[color:var(--text-2)] mt-0.5 leading-relaxed">
                          {t.why}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Our own duotone bell — never a stroke-icon library. See DESIGN.md. */
function BellGlyph({ active }: { active: boolean }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ color: active ? "var(--text)" : "var(--text-3)" }}
    >
      <path
        d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3 .7 4.6 1.4 5.5.3.4 0 1-.5 1H5.6c-.5 0-.8-.6-.5-1 .7-.9 1.4-2.5 1.4-5.5Z"
        fill="currentColor"
        opacity=".22"
      />
      <path
        d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3 .7 4.6 1.4 5.5.3.4 0 1-.5 1H5.6c-.5 0-.8-.6-.5-1 .7-.9 1.4-2.5 1.4-5.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 19a2 2 0 0 0 3.6 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
