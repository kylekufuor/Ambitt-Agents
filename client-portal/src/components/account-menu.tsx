"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions";

/**
 * Account dropdown — initials avatar that opens a small menu with the
 * client's email, links to Billing / Account settings, and a Sign-out
 * action. Closes on outside-click + Esc.
 */
export function AccountMenu({ email, displayName }: { email: string; displayName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = displayName
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "A";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full bg-[color:var(--text)] text-white font-medium text-[12px] flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 bg-[color:var(--surface)] border border-[color:var(--border)] rounded-[var(--radius-lg)] shadow-[0_10px_40px_rgba(23,23,23,0.08)] overflow-hidden z-40"
        >
          <div className="px-4 py-3 border-b border-[color:var(--border)]">
            <div className="text-[13px] font-medium text-[color:var(--text)]">{displayName}</div>
            <div className="text-[12px] text-[color:var(--text-3)] truncate">{email}</div>
          </div>
          <div className="py-1">
            <Link
              href="/billing"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-[13px] text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)] transition-colors"
            >
              Billing &amp; usage
            </Link>
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-[13px] text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text)] transition-colors"
            >
              Account settings
            </Link>
          </div>
          <div className="border-t border-[color:var(--border)] py-1">
            <form action={signOut}>
              <button
                type="submit"
                className="w-full text-left px-4 py-2 text-[13px] text-[color:var(--text-3)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--red)] transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
