import { Icon, MaskLine } from "../primitives";

/** The close of the cases page. */
export function CasesClosing() {
  return (
    <section className="section tone-ink" style={{ paddingBottom: "clamp(72px,10vw,132px)" }}>
      <div className="wrap reveal">
        <div className="rule-draw" aria-hidden="true" style={{ marginBottom: "clamp(28px,4vw,44px)", transform: "none" }} />
        <div style={{ maxWidth: "640px" }}>
          <p className="kicker">However Monday breaks for you</p>
          <h2 className="h2"><MaskLine>There's probably a job here.</MaskLine></h2>
          <p className="dek" style={{ marginTop: "14px" }}>
            These four are what we've built so far. If your Monday looks different, tell us what's
            actually eating it. That's usually enough to know if an agent can take it.
          </p>
          <div style={{ display: "flex", gap: "14px", marginTop: "24px", flexWrap: "wrap" }}>
            <a href="mailto:hello@ambitt.agency" className="btn btn-primary">Email us</a>
            <a href="/" className="btn btn-ghost">Back to the workforce<Icon name="arrow" size={15} /></a>
          </div>
        </div>
      </div>
    </section>
  );
}
