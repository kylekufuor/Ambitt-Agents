import { Kicker } from "../primitives";

/** Captured from the shipping React views with a fictional, labeled workspace. */
export function PortalSection() {
  return <section className="section ruled portal-tour" id="portal">
    <div className="wrap">
      <div className="tour-heading">
        <div><Kicker>Inside your workspace</Kicker><h2 className="h2">The work comes to you.<br /><span className="accent">The controls stay with you.</span></h2></div>
        <p className="dek">A clear view of your agent's work, the decisions waiting on you, and what you're using. Take a look around.</p>
      </div>
      <figure className="tour-main">
        <div className="tour-bar"><span className="dots"><i /><i /><i /></span><span>AMBITT / CLIENT WORKSPACE</span><span>Product walkthrough · sample data</span></div>
        <video controls playsInline preload="none" poster="/demos/portal-home-dark.webp" width="1440" height="1000" aria-label="Ambitt portal walkthrough with illustrative sample data">
          <source src="/demos/portal-walkthrough.mp4" type="video/mp4" />
          <track kind="captions" src="/demos/portal-walkthrough.vtt" srcLang="en" label="English" default />
          Your browser does not support the video. The portal screenshots below show the same workspace.
        </video>
        <figcaption><span>01 / A quick look around</span><span>Recorded from the portal. Example Studio is fictional.</span></figcaption>
      </figure>
      <div className="tour-gallery">
        <figure><img src="/demos/portal-home-light.webp" alt="The portal in light mode, showing weekly work, pending decisions, leads and the agent's schedule with sample data" width="1440" height="1000" loading="lazy" /><figcaption><span>02 / Your preferred view</span><p>Switch between dark and light. Your choice stays with you.</p></figcaption></figure>
        <figure><img src="/demos/portal-billing.webp" alt="Portal billing view with an illustrative Starter plan and 640 of 1,000 included interactions used" width="1440" height="1000" loading="lazy" /><figcaption><span>03 / Nothing hidden in the numbers</span><p>Your plan, each agent's usage, and the rate for extra interactions.</p></figcaption></figure>
      </div>
      <p className="tour-summary">In this silent walkthrough: check the weekly overview, find decisions that need review, switch appearance, and view billing. All figures are illustrative.</p>
    </div>
  </section>;
}
