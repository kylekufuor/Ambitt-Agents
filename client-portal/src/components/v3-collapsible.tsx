"use client";

import { useState } from "react";
import type { IconName } from "./v3-section-icon";
import { SectionIcon } from "./v3-section-icon";

/* ---------------------------------------------------------------------------
   A portal section that can be folded away, and says when it cannot be.

   Two problems on one page. The first is length: Email setup is four blocks of
   settled configuration, and a client scrolling past all of it to reach the one
   thing that needs them is reading three answers to questions they did not ask.
   The second is that nothing distinguished "this is set" from "this is empty
   and something depends on it" — the mobile number field looked exactly like
   every other row, which is a large part of why it has sat unset since the
   toll-free number was approved.

   So: sections that are DONE collapse by default. A section that NEEDS YOU
   stays open, cannot be collapsed shut and forgotten, and carries a red dot in
   both states. Collapsing everything by default would hide precisely the thing
   this exists to surface.

   The marker is a dot AND the words "Needs you". Colour alone fails for the
   ~8% of men with a colour vision deficiency, and again for anyone who has
   turned contrast up — the same rule the operator digest follows.
   --------------------------------------------------------------------------- */

export function CollapsibleSection({
  title,
  icon,
  needsYou = false,
  /** Short line shown beside the title when collapsed, so folding loses nothing. */
  summary,
  defaultOpen,
  children,
}: {
  title: string;
  icon: IconName;
  needsYou?: boolean;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  // A section that needs the client is open, full stop. Anything else follows
  // the caller, and settles closed when the caller has no opinion.
  const [open, setOpen] = useState(needsYou ? true : (defaultOpen ?? false));

  return (
    <section
      className="card overflow-hidden"
      style={
        needsYou
          ? // A hairline of red down the edge, not a red box. The section is
            // incomplete, not broken, and a full red panel reads as an error
            // the client has caused.
            { boxShadow: "inset 3px 0 0 0 var(--red)" }
          : undefined
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 text-left px-5 py-4 hover:bg-[color:var(--surface-2)] transition-colors"
      >
        <SectionIcon name={icon} tone={needsYou ? "alert" : "quiet"} />

        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2.5">
            <span className="text-[14.5px] font-semibold text-[color:var(--text)]">{title}</span>
            {needsYou && (
              <span className="inline-flex items-center gap-1.5 shrink-0">
                <span
                  aria-hidden
                  className="w-[7px] h-[7px] rounded-full"
                  style={{ background: "var(--red)" }}
                />
                <span className="text-[12px] font-semibold" style={{ color: "var(--red)" }}>
                  Needs you
                </span>
              </span>
            )}
          </span>
          {/* Folding must not cost information. When shut, the summary is the
              section: "Set to (918) 555 0142" or "Not set yet". */}
          {!open && summary && (
            <span className="block text-[12.5px] text-[color:var(--text-3)] mt-0.5 truncate">
              {summary}
            </span>
          )}
        </span>

        <Chevron open={open} />
      </button>

      {open && <div className="px-5 pb-5 -mt-1">{children}</div>}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0 text-[color:var(--text-3)]"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.16s ease" }}
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
