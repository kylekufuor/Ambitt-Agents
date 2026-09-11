import { MaskLine } from "../primitives";

/** The cases page opening, on the same load sequence as the homepage hero. */
export function CasesIntro() {
  return (
    <section className="section case-head" style={{ paddingBottom: "clamp(24px,4vw,40px)" }}>
      <div className="wrap">
        {/* load sequence [POLISH]: same rhythm as the homepage hero -- kicker, masked
           headline, dek -- so both pages open with the same one deliberate movement. */}
        <div style={{ maxWidth: "760px" }}>
          <p className="kicker enter" style={{ animationDelay: ".02s" }}>The cases</p>
          <h1 className="h1 enter" style={{ animationDelay: ".10s" }}>
            <MaskLine delay=".11s">Four jobs. Four industries.</MaskLine>
            <MaskLine delay=".19s">One <em className="accent">workforce</em>.</MaskLine>
          </h1>
          <p className="dek enter" style={{ marginTop: "18px", maxWidth: "56ch", animationDelay: ".19s" }}>
            Illustrative examples of the jobs an agent can take on and the work it can deliver.
            Names, messages and results are composites, not customer testimonials or promised outcomes.
          </p>
        </div>
      </div>
    </section>
  );
}
