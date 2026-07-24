"use client";

import { useState } from "react";
import { AmbittLogo } from "./logo";
import { Menu, Close } from "./icons";
import { NAV_LINKS, CTA } from "../lib/site";

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="nav">
      <div className="wrap">
        <nav className="nav-in">
          <a href="#top" aria-label="Ambitt Agents home">
            <AmbittLogo variant="light" />
          </a>

          <div className="nav-links">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </div>

          <div className="nav-cta">
            <a className="btn btn-ghost" href={CTA.secondary.href}>
              {CTA.secondary.label}
            </a>
            <a className="btn btn-primary" href={CTA.primary.href}>
              {CTA.primary.label}
            </a>
            <button
              type="button"
              className="nav-toggle"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="nav-panel"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <Close /> : <Menu />}
            </button>
          </div>

          <div id="nav-panel" className={`nav-panel${open ? " open" : ""}`} hidden={!open}>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
            <a className="btn btn-ghost" href={CTA.secondary.href} onClick={() => setOpen(false)}>
              {CTA.secondary.label}
            </a>
            <a className="btn btn-primary" href={CTA.primary.href} onClick={() => setOpen(false)}>
              {CTA.primary.label}
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
