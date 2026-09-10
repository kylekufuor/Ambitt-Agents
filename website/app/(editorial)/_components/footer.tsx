import { BrandLockup } from "./brand-mark";

export function Footer({ page }: { page: "home" | "cases" }) {
  const home = page === "home" ? "" : "/";
  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <BrandLockup href="#top" style={{ "--logo-size": "34px" }} wordStyle={{ color: "var(--ink)" }} />
            <p className="meta" style={{ marginTop: "12px", maxWidth: "34ch" }}>
              An AI workforce. Hired like a person, not licensed like software.
            </p>
          </div>
          <nav className="foot-links" aria-label="Footer">
            <a href={`${home}#how`}>How it works</a>
            <a href="/use-cases">The cases</a>
            <a href={`${home}#pricing`}>Pricing</a>
            <a href="/docs">Docs</a>
            <a href="/contact">Contact</a>
            <a href="https://portal.ambitt.agency">Log in</a>
            <a href="mailto:hello@ambitt.agency">hello@ambitt.agency</a>
          </nav>
        </div>
        <p className="legal">
          Ambitt Agents is a product of AmbittMedia, a Kufgroup LLC company. Gmail, Google Calendar, Google
          Sheets, Google Drive, HubSpot, Notion, QuickBooks, Stripe, Asana, Airtable, Zoom, Xero, Shopify,
          Zendesk, Calendly, Dropbox, Trello, Zapier, Linear and Intercom are trademarks of their respective
          owners. They're named here because agents can connect to them, not because of any affiliation
          with Ambitt Agents. Agent names, artifacts and figures shown on this site are illustrative
          composites built from typical work, not verbatim client correspondence. © 2026 Kufgroup LLC.
          All rights reserved.
        </p>
        <nav className="foot-links" aria-label="Legal" style={{ marginTop: "14px", fontSize: ".75rem" }}>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </div>
    </footer>
  );
}
