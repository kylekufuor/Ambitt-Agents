"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * The page's scroll motion, run once for the whole document. Renders nothing.
 *
 * Entrance reveals: restrained and one-shot. An 8px rise and fade as each
 * .reveal block enters (threshold 0.15), never repeated, no scroll-scrubbed
 * transforms. It is progressive enhancement throughout: the server renders
 * every block visible, and only here, once we know IntersectionObserver
 * exists and motion isn't reduced, does <html> get .js-anim, which pre-hides
 * what is still below the fold. Anything already on screen was painted in its
 * final state before this ran, so it is marked .in first and never blinks.
 * The hero is not in this pass at all: its load sequence is CSS (.enter in
 * editorial.css) so it plays on first paint rather than after hydration.
 *
 * Keyed on the pathname: links between the editorial pages are plain anchors
 * (full page loads), but if one ever becomes a next/link, a soft navigation
 * would otherwise leave the new page's .reveal blocks hidden and unobserved.
 *
 * Settled photo parallax: transform only, above 900px only, where it reads as
 * depth rather than motion for its own sake. Reduced-motion visitors never run
 * the loop; --parallax stays at its CSS default of 0.
 */
export function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanup: Array<() => void> = [];

    const items = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!reduced && "IntersectionObserver" in window && items.length) {
      const vh = window.innerHeight;
      const pending = items.filter((el) => {
        if (el.classList.contains("in")) return false;
        const box = el.getBoundingClientRect();
        const onScreen = box.bottom > 0 && box.top < vh;
        if (onScreen) el.classList.add("in");
        return !onScreen;
      });
      root.classList.add("js-anim");
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              io.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
      );
      pending.forEach((el) => io.observe(el));
      cleanup.push(() => io.disconnect());
    }

    const plates = Array.from(document.querySelectorAll<HTMLElement>(".photo-plate"));
    const wide = window.matchMedia("(min-width: 900px)");
    if (!reduced && plates.length && wide.matches) {
      let ticking = false;
      const setParallax = () => {
        const vh = window.innerHeight;
        for (const el of plates) {
          const box = el.getBoundingClientRect();
          const fromCenter = (box.top + box.height / 2 - vh / 2) / vh; // -0.5..0.5 across the viewport
          const shift = Math.max(-1, Math.min(1, fromCenter)) * (box.height * 0.08);
          el.style.setProperty("--parallax", `${shift.toFixed(1)}px`);
        }
        ticking = false;
      };
      const onScroll = () => {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(setParallax);
        }
      };
      const onResize = () => {
        if (!wide.matches) plates.forEach((el) => el.style.setProperty("--parallax", "0px"));
        else setParallax();
      };
      setParallax();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
      cleanup.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
      });
    }

    return () => cleanup.forEach((fn) => fn());
  }, [pathname]);

  return null;
}
