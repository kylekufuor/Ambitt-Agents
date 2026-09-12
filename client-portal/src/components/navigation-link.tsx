"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useState, type ComponentProps } from "react";

function NavigationFeedback() {
  const { pending } = useLinkStatus();
  // Outside the link so closing the mobile drawer does not hide the feedback.
  return pending ? createPortal(
    <div className="portal-navigation-progress" role="status" aria-live="polite">
      <span className="sr-only">Opening page…</span>
    </div>,
    document.body,
  ) : null;
}

/** Keep Next's native link/history behavior; warm only the intended tab. */
export function NavigationLink({
  href, children, onMouseEnter, onFocus, onTouchStart, ...props
}: Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string }) {
  const pathname = usePathname();
  const [warmHref, setWarmHref] = useState("");
  const warm = () => {
    if (href.startsWith("/") && !href.startsWith("//") && href !== pathname) {
      setWarmHref(href);
    }
  };

  return (
    <Link {...props} href={href} prefetch={warmHref === href && href !== pathname}
      onMouseEnter={(event) => { onMouseEnter?.(event); warm(); }}
      onFocus={(event) => { onFocus?.(event); warm(); }}
      onTouchStart={(event) => { onTouchStart?.(event); warm(); }}>
      {children}
      <NavigationFeedback />
    </Link>
  );
}
