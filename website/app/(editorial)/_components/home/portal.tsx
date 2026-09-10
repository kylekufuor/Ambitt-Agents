import { PortalShot } from "../photos";
import { FigCaption, Icon, MaskLine, RuleDraw } from "../primitives";

/** The portal is real, shown with real screenshots, and optional. */
export function PortalSection() {
  return (
    <section className="section">
      <RuleDraw />
      <div className="wrap">
        <div className="section-head reveal" style={{ maxWidth: "640px" }}>
          <p className="kicker">You never have to log in</p>
          <h2 className="h2">
            <MaskLine>The portal is real.</MaskLine>
            <MaskLine>You just won't need it much.</MaskLine>
          </h2>
          <p className="dek" style={{ marginTop: "14px" }}>
            Every agent keeps a work log, a list of connected tools, and settings you can change any
            time. Most weeks, the work just arrives and you never open the tab.
          </p>
        </div>
        <div className="reveal" style={{ transitionDelay: ".1s", marginTop: "clamp(28px,4vw,44px)" }}>
          <figure style={{ maxWidth: "920px" }}>
            <PortalShot shot="homeFunnel" className="shot-wide" style={{ aspectRatio: "1350/609" }} />
            <PortalShot shot="homeLeads" className="shot-narrow" style={{ aspectRatio: "950/448" }} />
            <FigCaption fig="04" className="shot-wide">
              The funnel, straight from the portal you don't have to open: 612 reviewed down to 47 replied, with the drop-off named at every stage.
            </FigCaption>
            <FigCaption fig="04" className="shot-narrow">
              This week's replies, straight from the portal you don't have to open.
            </FigCaption>
          </figure>
        </div>
        <ul className="callouts reveal" style={{ marginTop: "clamp(28px,4vw,44px)", maxWidth: "640px", transitionDelay: ".18s" }}>
          <li>
            <span className="num" style={{ borderRadius: "7px" }}><Icon name="portal" size={16} /></span>
            <span className="txt"><b>A real portal.</b> Work log, tools, settings. Open it whenever you want to.</span>
          </li>
          <li>
            <span className="num" style={{ borderRadius: "7px" }}><Icon name="ledger" size={16} /></span>
            <span className="txt"><b>Permanent memory.</b> Tell it once. It doesn't ask again.</span>
          </li>
          <li>
            <span className="num" style={{ borderRadius: "7px" }}><Icon name="gauge" size={16} /></span>
            <span className="txt"><b>A ceiling you set.</b> It asks before it goes over.</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
