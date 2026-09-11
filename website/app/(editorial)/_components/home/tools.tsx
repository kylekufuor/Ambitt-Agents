import { Ic } from "../icons";
import { Kicker, ToolTiles, Words } from "../primitives";

/** The client's own logins and tools (Seonovu's integration tiles), and what an agent won't do with them. */
export function ToolsSection() {
  return (
    <section className="section ruled" id="tools">
      <div className="wrap">
        <div className="spread">
          <div className="label-col">
            <Kicker>Your logins. Your tools.</Kicker>
            <h2 className="h2 rv-words">
              <Words text={"It works inside the accounts you already pay for."} accent="pay" />
            </h2>
            <p className="body-copy rv">
              Every agent connects to your accounts the way your bank asks you to log in through a browser:
              encrypted, and revocable the moment you want it gone. We never ask for a password we don't need.
            </p>
            <p className="body-copy rv" style={{ "--d": ".4s" }}>
              There are always a couple of platforms nobody formally integrates with: the listing and
              market-data sites your team already has a login for. An agent can work inside those directly, the
              same way you would: reading the screen, clicking the same buttons, under your own account.
            </p>
            <div className="aside rv" style={{ "--d": ".5s" }}>
              <h4>
                <Ic name="shield-check" />
                What we won't do
              </h4>
              <ul>
                <li>Contact your customers without you asking first.</li>
                <li>Send anything before you've approved it, until you tell us otherwise.</li>
                <li>Touch a tool you haven't connected. Your logins, not ours.</li>
              </ul>
            </div>
          </div>
          <div className="rv" style={{ "--d": ".4s" }}>
            <div className="glow-panel">
              <ToolTiles />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
