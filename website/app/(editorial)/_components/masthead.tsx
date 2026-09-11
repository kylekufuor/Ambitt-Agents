"use client";

import { useEffect, useState } from "react";
import { BrandLockup } from "./brand-mark";
import { Btn } from "./primitives";

type Page = "home" | "cases";

/**
 * Nuera's floating pill bar, in dark glass. Fixed 16px from the top, drops in
 * on Xtract's spring at load (CSS), and firms up its glass once the page has
 * moved: one discrete state, read at most once a frame.
 */
export function Masthead({ page }: { page: Page }) {
  const [scrolled, setScrolled] = useState(false);

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
            The cases
          </a>
          <a href={`${home}#pricing`} className="hide-mobile">
            Pricing
          </a>
          <a href={`${home}#faq`} className="hide-mobile">
            FAQ
          </a>
          <span className="navspacer" />
          <span className="nav-cta">
            <a href="https://portal.ambitt.agency" className="hide-mobile">
              Log in
            </a>
            <Btn href={`${home}#contact`} size="sm">
              Talk to us
            </Btn>
          </span>
        </nav>
      </div>
    </header>
  );
}
