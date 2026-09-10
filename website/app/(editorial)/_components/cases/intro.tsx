import { MaskLine } from "../primitives";

/** The cases page opening, on the same load sequence as the homepage hero. */
export function CasesIntro() {
  return (
    <section className="section" style={{ paddingTop: "clamp(40px,7vw,84px)", paddingBottom: "clamp(24px,4vw,40px)" }}>
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
            What the client asked for, in plain English. What the agent actually does about it. What
            lands in the inbox, with the kind of numbers you'd see on an ordinary week, not a best one.
          </p>
        </div>
      </div>
    </section>
  );
}
