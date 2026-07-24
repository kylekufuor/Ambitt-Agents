import { AmbittLogo } from "./logo";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="ft">
      <div className="wrap">
        <div className="ft-top">
          <div className="ft-brand">
            <AmbittLogo variant="reverse" />
            <p className="ft-tag">
              Named AI agents that do the work in the tools you already use, and deliver it to your inbox.
            </p>
          </div>
          <div className="ft-col">
            <h4>Product</h4>
            <a href="/#what">What it does</a>
            <a href="/#agents">Agents</a>
            <a href="/#how">How it works</a>
            <a href="/#pricing">Pricing</a>
          </div>
          <div className="ft-col">
            <h4>Company</h4>
            <a href="/contact">Contact</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="mailto:support@ambitt.agency">Support</a>
          </div>
        </div>
        <div className="ft-bot">
          <div className="ft-copy">&copy; {year} Kufgroup LLC (d/b/a Ambitt Agents).</div>
          <div className="ft-disc">
            <span className="flag">Trademark note (counsel to finalize):</span> Product and company names are
            trademarks of their respective owners. Ambitt Agents isn&rsquo;t affiliated with or sponsored by any
            third-party platform our agents work in on your behalf.
          </div>
        </div>
      </div>
    </footer>
  );
}
