import { Ic } from "../icons";
import { PortalShot } from "../photos";
import { FigCaption, Kicker, Words } from "../primitives";

// The kind of number that lands in a client's inbox each week. Illustrative
// composites, as the footer says; never captioned as a named customer.
const METRICS: Array<{ k: string; from?: string; to: string }> = [
  { k: "Listings reviewed → replied", from: "612", to: "47" },
  { k: "Matched the buy box", from: "51", to: "4" },
  { k: "Inspections recovered", to: "11" },
  { k: "Out of the 90-day bucket", to: "$41,900" },
];

/** Seonovu's dashboard section: the real portal in a window, with the numbers cycling beside it. */
export function PortalSection() {
  return (
    <section className="section ruled" id="portal">
      <div className="wrap">
        <div className="spread">
          <div className="label-col">
            <Kicker>You never have to log in</Kicker>
            <h2 className="h2 rv-words">
              <Words text={"The portal is real.\nYou just won't need it much."} accent="real." />
            </h2>
            <p className="dek rv">
              Every agent keeps a work log, a list of connected tools, and settings you can change any time.
              Most weeks, the work just arrives and you never open the tab.
            </p>
            <ul className="callouts rv-seq">
              <li>
                <span className="num"><Ic name="browser" /></span>
                <span className="txt"><b>A real portal.</b> Work log, tools, settings. Open it whenever you want to.</span>
              </li>
              <li>
                <span className="num"><Ic name="brain" /></span>
                <span className="txt"><b>Permanent memory.</b> Tell it once. It doesn't ask again.</span>
              </li>
              <li>
                <span className="num"><Ic name="gauge" /></span>
                <span className="txt"><b>Usage you can see.</b> Included interactions and extra charges, explained in Billing.</span>
              </li>
            </ul>
            <div className="stack-wrap rv" style={{ "--d": ".5s" }}>
              <Kicker plain>Illustrative weekly results</Kicker>
              <div className="stack" aria-label="Examples of the figures an agent reports each week">
                {METRICS.map((m, i) => (
                  <div key={m.k} className="m" style={{ "--i": i }}>
                    <span className="k">{m.k}</span>
                    <span className="v">
                      {m.from ? <span className="from">{m.from}</span> : null}
                      {m.from ? <Ic name="arrow-right" /> : null}
                      {m.to}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="rv" style={{ "--d": ".4s" }}>
            <figure>
              <div className="window">
                <div className="window-bar">
                  <span className="dots"><i /><i /><i /></span>
                  <span className="title">portal.ambitt.agency</span>
                </div>
                <PortalShot shot="homeFunnel" className="shot-wide" style={{ aspectRatio: "1350/609", borderRadius: 0, boxShadow: "none" }} />
                <PortalShot shot="homeLeads" className="shot-narrow" style={{ aspectRatio: "950/448", borderRadius: 0, boxShadow: "none" }} />
              </div>
              <FigCaption fig="03" className="shot-wide">
                An example portal view with sample data: 612 reviewed down to 47 replied, with the
                drop-off named at every stage.
              </FigCaption>
              <FigCaption fig="03" className="shot-narrow">
                An example portal view showing replies, using sample data.
              </FigCaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
