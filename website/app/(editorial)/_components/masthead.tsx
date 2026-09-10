"use client";

import { useEffect, useState } from "react";
import { BrandLockup } from "./brand-mark";
import { THEME_KEY } from "./theme-key";

type Page = "home" | "cases";

/** Flips the theme and remembers it. The button's label is CSS, keyed off the same attribute. */
function toggleTheme() {
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const next = (root.getAttribute("data-theme") || system) === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage blocked (private mode, site data off): the switch still works for this visit.
  }
}

/**
 * The top bar. Once the page has moved past the top it tightens (the logo
 * steps down a size): one discrete state change, read at most once a frame,
 * never a value scrubbed per scroll event.
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
      <div className="wrap">
        <BrandLockup href={page === "home" ? "#top" : "/"} />
        <nav className="navlinks" aria-label="Primary">
          <a href={`${home}#how`} className="hide-mobile" aria-current={page === "home" ? "page" : undefined}>
            How it works
          </a>
          <a href="/use-cases" aria-current={page === "cases" ? "page" : undefined}>
            The cases
          </a>
          <a href={`${home}#pricing`} className="hide-mobile">
            Pricing
          </a>
          <span className="navspacer" />
          <button className="themebtn" type="button" aria-label="Toggle colour theme" onClick={toggleTheme}>
            <span className="to-dark">Dark</span>
            <span className="to-light">Light</span>
          </button>
          <a href="https://portal.ambitt.agency" className="hide-mobile">
            Log in
          </a>
          <a href={`${home}#contact`} className="btn btn-primary">
            Talk to us
          </a>
        </nav>
      </div>
    </header>
  );
}
