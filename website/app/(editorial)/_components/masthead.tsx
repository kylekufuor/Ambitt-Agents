"use client";

import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "./brand-mark";
import { Btn } from "./primitives";

type Page = "home" | "cases" | "docs" | "other";

/**
 * Nuera's floating pill bar, in dark glass. Fixed 16px from the top, drops in
 * on Xtract's spring at load (CSS), and firms up its glass once the page has
 * moved: one discrete state, read at most once a frame.
 */
export function Masthead({ page }: { page: Page }) {
  const [scrolled, setScrolled] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) {
        menu.current.open = false;
      }
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      setScrolled(window.scrollY > 28);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // On the homepage the section links are same-page anchors; from the cases page they lead home.
  const home = page === "home" ? "" : "/";
  return (
    <header className={scrolled ? "masthead is-scrolled" : "masthead"} id="top">
      <div className="bar">
        <BrandLockup href={page === "home" ? "#top" : "/"} />
        <nav className="navlinks" aria-label="Primary">
          <a href={`${home}#how`} className="hide-mobile">
            How it works
          </a>
          <a href="/use-cases" aria-current={page === "cases" ? "page" : undefined}>
            Use cases
          </a>
          <a href={`${home}#portal`} className="hide-mobile">The portal</a>
          <a href={`${home}#pricing`} className="hide-mobile">
            Pricing
          </a>
          <a href="/docs" aria-current={page === "docs" ? "page" : undefined} className="hide-mobile">Help</a>
          <span className="navspacer" />
          <span className="nav-cta">
            <a href="https://portal.ambitt.agency" className="hide-mobile">
              Open portal
            </a>
            <Btn href={`${home}#contact`} size="sm">
              Talk to us
            </Btn>
          </span>
        </nav>
        <details className="mobile-menu" ref={menu}>
          <summary aria-label="Navigation menu">Menu <span aria-hidden="true">☰</span></summary>
          <nav aria-label="Mobile navigation" onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a") && menu.current) menu.current.open = false;
          }}>
            <a href={`${home}#how`}>How it works</a>
            <a href="/use-cases" aria-current={page === "cases" ? "page" : undefined}>Use cases</a>
            <a href={`${home}#portal`}>The portal</a>
            <a href={`${home}#pricing`}>Pricing</a>
            <a href="/docs" aria-current={page === "docs" ? "page" : undefined}>Help</a>
            <a href={`${home}#faq`}>FAQ</a>
            <a href="https://portal.ambitt.agency">Open portal</a>
            <a href={`${home}#contact`}>Talk to us</a>
          </nav>
        </details>
      </div>
    </header>
  );
}
