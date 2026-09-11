import { Btn, Kicker, Words } from "../primitives";

/** Nuera's close: a light room, one line, two buttons. */
export function Cta() {
  return (
    <section className="section room-light close" id="contact" style={{ borderTop: "1px solid var(--rule)" }}>
      <div className="wrap">
        <Kicker plain>Get in touch</Kicker>
        <h2 className="h2 rv-words">
          <Words text={"Tell us what's eating your Monday."} accent="Monday." />
        </h2>
        <p className="dek rv">
          We'll tell you, honestly, whether an agent can take it off your plate, and what it would look like in your
          inbox before you pay for anything.
        </p>
        <div className="ctas rv" style={{ "--d": ".45s" }}>
          <Btn href="mailto:hello@ambitt.agency" size="lg" icon="arrow-up-right">
            Email us
          </Btn>
          <Btn href="/use-cases" kind="ghost" size="lg">
            See the four cases
          </Btn>
        </div>
      </div>
    </section>
  );
}
