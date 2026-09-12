import { Ic, type IconName } from "../icons";
import { Kicker, Words } from "../primitives";

const CARDS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: "envelope-simple",
    title: "Work arrives by email",
    body: "Ask in plain English. The finished job comes back in the inbox you already read, with the file attached.",
  },
  {
    icon: "lock-key",
    title: "Your logins. Your tools.",
    body: "It signs in with your own accounts, under your direction. Encrypted, and revocable the moment you want it gone.",
  },
  {
    icon: "list-checks",
    title: "Rules you can direct",
    body: "Set the job, tone and boundaries together. Review how your agent works in the portal and send changes by email.",
  },
  {
    icon: "gauge",
    title: "Clear usage and controls",
    body: "Check included interactions and extra charges in Billing. Set the working schedule and pause your agent from the portal.",
  },
];

/** Four concrete capabilities beside the introduction, stacked on mobile. */
export function Features() {
  return (
    <section className="section ruled capabilities" id="what">
      <div className="wrap capabilities-grid">
        <div className="section-head">
          <Kicker>What you get</Kicker>
          <h2 className="h2 rv-words">
            <Words text={"A hire that shows its work."} accent="shows" />
          </h2>
          <p className="dek rv">
            Every agent has a name, an inbox, a standing job and a set of rules you wrote. Here is what that
            gets you, whatever the business.
          </p>
        </div>
        <div className="bento rv-seq">
          {CARDS.map((c) => (
            <div key={c.title}>
              <Ic name={c.icon} />
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
