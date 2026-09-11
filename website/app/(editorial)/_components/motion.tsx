"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * The page's motion runtime, mounted once per document. Renders nothing.
 *
 * 1. Lenis smooth scroll (Nuera uses it): wraps native scroll, so anchors,
 *    sticky and accessibility keep working. Skipped for reduced motion.
 * 2. Entrance reveals: `.rv` (rise + settle + unblur), `.rv-words` (each word
 *    blurs in on a stagger), `.rv-seq` (children in turn) and the older
 *    `.reveal`. All render visible; only here, once we know the observer
 *    exists and motion isn't reduced, does <html> keep .js-anim (set before
 *    first paint by motion-boot.tsx, confirmed here with .js-ok), which
 *    pre-hides what is still below the fold. Anything already on screen is
 *    marked .in first, so it fades in once rather than blinking. The hero is
 *    pure CSS keyframes and is not in this pass at all.
 *
 * Keyed on the pathname so a soft navigation, if one is ever added, re-arms.
 */
export function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanup: Array<() => void> = [];

    if (!reduced) {
      const lenis = new Lenis({ autoRaf: true, anchors: true, lerp: 0.1 });
      cleanup.push(() => lenis.destroy());
    }

    const items = Array.from(document.querySelectorAll<HTMLElement>(".rv, .rv-words, .rv-seq, .reveal"));
    if (!reduced && "IntersectionObserver" in window && items.length) {
      const vh = window.innerHeight;
      const pending = items.filter((el) => {
        if (el.classList.contains("in")) return false;
        const box = el.getBoundingClientRect();
        const onScreen = box.bottom > 0 && box.top < vh;
        if (onScreen) el.classList.add("in");
        return !onScreen;
      });
      // motion-boot.tsx normally set this before first paint; this is the fallback.
      root.classList.add("js-anim");
      root.classList.add("js-ok");
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              io.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
      );
      pending.forEach((el) => io.observe(el));
      cleanup.push(() => io.disconnect());
    } else {
      // Reduced motion, or no observer: the page is simply composed.
      root.classList.remove("js-anim");
    }

    return () => cleanup.forEach((fn) => fn());
  }, [pathname]);

  return null;
}
