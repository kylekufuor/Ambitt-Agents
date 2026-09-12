import Link from "next/link";
import type { ComponentProps } from "react";

/** Public routes share their layout; preserve it when moving between pages. */
export function SiteLink({ href, ...props }: ComponentProps<"a"> & { href: string }) {
  return href.startsWith("/") && !href.startsWith("//")
    ? <Link {...props} href={href} />
    : <a {...props} href={href} />;
}
