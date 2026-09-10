import { Icon, MaskLine, RuleDraw, ToolPlate } from "../primitives";

/** The client's own logins and tools, and what an agent won't do with them. */
export function ToolsSection() {
  return (
    <section className="section">
      <RuleDraw />
      <div className="wrap">
        <div className="section-head reveal">
          <p className="kicker">Your logins. Your tools.</p>
          <h2 className="h2">
            <MaskLine>It works inside the accounts</MaskLine>
            <MaskLine>you already <em className="accent">pay</em> for.</MaskLine>
          </h2>
        </div>
        <div className="spread reveal" style={{ transitionDelay: ".06s" }}>
          <div className="label-col">
            <p className="body-copy">
              Every agent connects to your accounts the way your bank asks you to log in through a
              browser: encrypted, and revocable the moment you want it gone. We never ask for a password
              we don't need.
            </p>
            <p className="body-copy">
              There are always a couple of platforms nobody formally integrates with: the listing and
              market-data sites your team already has a login for. An agent can work inside those
              directly, the same way you would: reading the screen, clicking the same buttons, under
              your own account.
            </p>
            <ToolPlate style={{ marginTop: "6px" }} />
          </div>
          <div className="reveal" style={{ transitionDelay: ".14s" }}>
            <div className="aside">
              <h4><Icon name="gate" />What we won't do</h4>
              <ul>
                <li>Contact your customers without you asking first.</li>
                <li>Send anything before you've approved it, until you tell us otherwise.</li>
                <li>Touch a tool you haven't connected. Your logins, not ours.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
