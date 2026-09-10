import { AgentAvatar, AGENT_LABEL, type AgentName } from "../agent-avatar";
import { Icon, MaskLine, RuleDraw } from "../primitives";

const ROSTER: Array<[AgentName, string]> = [
  ["otto", "bookkeeping"],
  ["arthur", "commercial real estate"],
  ["wade", "roofing, storm response"],
  ["priya", "tax & accounting"],
];

/** The close: how to reach us, and the roster so far. */
export function Contact() {
  return (
    <section className="section tone-ink" id="contact" style={{ paddingBottom: "clamp(72px,10vw,132px)" }}>
      <RuleDraw />
      <div className="wrap">
        <div className="spread reveal">
          <div>
            <p className="kicker">Get in touch</p>
            <h2 className="h2">
              <MaskLine>Tell us what's eating your Monday.</MaskLine>
            </h2>
            <p className="dek" style={{ marginTop: "14px", maxWidth: "52ch" }}>
              We'll tell you, honestly, whether an agent can take it off your plate, and what it would
              look like in your inbox before you pay for anything.
            </p>
            <div style={{ display: "flex", gap: "14px", marginTop: "24px", flexWrap: "wrap" }}>
              <a href="mailto:hello@ambitt.agency" className="btn btn-primary">Email us</a>
              <a href="/use-cases" className="btn btn-ghost">See the four cases<Icon name="arrow" size={15} /></a>
            </div>
          </div>
          <div>
            <p className="kicker" style={{ marginBottom: "14px" }}>The roster so far</p>
            <div style={{ display: "grid", gap: "14px" }}>
              {ROSTER.map(([agent, job]) => (
                <div key={agent} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <AgentAvatar agent={agent} uid={`roster-${agent}`} size="34px" />
                  <div>
                    <b style={{ fontWeight: "500" }}>{AGENT_LABEL[agent]}</b> · <span className="meta">{job}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
