import { SiteLink } from "./site-link";
import { BrandLockup } from "./brand-mark";

export function Footer({ page }: { page: "home" | "cases" | "other" }) {
  const home = page === "home" ? "" : "/";
  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <BrandLockup href={page === "home" ? "#top" : "/"} style={{ "--logo-size": "30px" }} />
            <p className="meta" style={{ marginTop: "12px", maxWidth: "36ch" }}>
              An AI workforce. Hired like a person, not licensed like software.
            </p>
          </div>
          <nav className="foot-links" aria-label="Footer">
            <SiteLink href={`${home}#how`}>How it works</SiteLink>
            <SiteLink href="/use-cases">Use cases</SiteLink>
            <SiteLink href={`${home}#portal`}>The portal</SiteLink>
            <SiteLink href={`${home}#pricing`}>Pricing</SiteLink>
            <SiteLink href={`${home}#faq`}>FAQ</SiteLink>
            <SiteLink href="/docs">Help</SiteLink>
            <SiteLink href="/contact">Contact</SiteLink>
            <SiteLink href="https://portal.ambitt.agency">Open portal</SiteLink>
            <SiteLink href="mailto:hello@ambitt.agency">hello@ambitt.agency</SiteLink>
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
          <SiteLink href="/privacy">Privacy</SiteLink>
          <SiteLink href="/terms">Terms</SiteLink>
        </nav>
      </div>
    </footer>
  );
}
