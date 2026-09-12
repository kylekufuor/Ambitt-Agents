import { Kicker } from "../primitives";

/** Captured from the shipping React views with a fictional, labeled workspace. */
export function PortalSection() {
  return <section className="section ruled portal-tour" id="portal">
    <div className="wrap">
      <div className="tour-heading">
        <div><Kicker>Inside your workspace</Kicker><h2 className="h2">The work comes to you.<br /><span className="accent">The controls stay with you.</span></h2></div>
        <p className="dek">Open your web tools, work alongside your agent, and turn the way you work into instructions you approve. Your chat, files, and Playbook live together.</p>
      </div>
      <figure className="tour-main">
        <div className="tour-bar"><span className="dots"><i /><i /><i /></span><span>AMBITT / BROWSER WORKSPACE</span><span>Real portal · fictional scenario</span></div>
        <img src="/demos/portal-workspace-dark.webp" alt="The Ambitt workspace with a fictional estimates tool, a visible watching indicator, agent questions, and an instruction awaiting confirmation" width="1440" height="1030" loading="lazy" style={{ width: "100%", height: "auto", display: "block" }} />
        <figcaption><span>01 / Show your agent how you work</span><span>Choose when watching starts. Confirm what becomes an instruction.</span></figcaption>
      </figure>
      <figure className="tour-main">
        <div className="tour-bar"><span className="dots"><i /><i /><i /></span><span>AMBITT / WORK OVERVIEW</span><span>Narrated walkthrough · sample data</span></div>
        <video controls playsInline preload="none" poster="/demos/portal-home-dark.webp" width="1440" height="1000" aria-label="Ambitt portal walkthrough with illustrative sample data">
          <source src="/demos/portal-walkthrough-narrated.mp4" type="video/mp4" />
          <track kind="captions" src="/demos/portal-walkthrough-narrated.vtt" srcLang="en" label="English" default />
          Your browser does not support the video. The portal screenshots below show the same workspace.
        </video>
        <figcaption><span>02 / The weekly work overview</span><span>Recorded from the portal. Example Studio is fictional.</span></figcaption>
      </figure>
      <div className="tour-gallery tour-gallery-single">
        <figure><img src="/demos/portal-workspace-light.webp" alt="The Ambitt browser and agent chat workspace in light mode with fictional Northgale estimates" width="1440" height="1030" loading="lazy" /><figcaption><span>03 / Your preferred view</span><p>Switch between dark and light. Your choice stays with you.</p></figcaption></figure>
      </div>
      <p className="tour-summary">Play with sound for a guided look at the weekly overview. Captions follow the narration. Workspace screenshots show the real portal with a fictional Northgale business, sample conversation, and illustrative data. Watching saves learning notes, not a video recording.</p>
    </div>
  </section>;
}
