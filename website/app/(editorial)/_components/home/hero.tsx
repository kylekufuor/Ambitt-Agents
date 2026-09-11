import { AgentAvatar, AGENT_LABEL, type AgentName } from "../agent-avatar";
import { Ic } from "../icons";
import { Btn, Words } from "../primitives";
import { Starfield } from "../starfield";

// One working week across four industries. Four rows, not one invoice thread,
// so the first screen reads as "this works for my business", whatever it is.
const WEEK: Array<{ agent: AgentName; industry: string; sent: string; subject: string; snippet: string }> = [
  { agent: "wade", industry: "Roofing", sent: "Tue 6:40am", subject: "Tuesday's route: 42 addresses, ranked", snippet: "1.75in hail on Meadowbrook Ct. Nobody gets knocked twice." },
  { agent: "arthur", industry: "Commercial real estate", sent: "Wed 8:15am", subject: "3 listings match this week, 1 borderline", snippet: "212 units in Cary. Built 1986, seller motivated, matches every filter." },
  { agent: "priya", industry: "Tax & accounting", sent: "Thu 7:50am", subject: "8 documents still outstanding, 3 need a call not an email", snippet: "92 of 104 requests cleared before the first extension deadline." },
  { agent: "otto", industry: "Bookkeeping", sent: "Mon 7:04am", subject: "Monday recap: two invoices worth a call", snippet: "Related Renovations: $8,400, 52 days. Full aging report attached." },
];

/**
 * Xtract's hero: a night sky, a slow orb, and a centred headline whose words
 * blur in one after another. Then Seonovu's move: the product rises into view
 * beneath it. Ours is the delivery itself, a week of finished work landing in
 * one inbox. The whole sequence is CSS keyframes, so it plays on first paint.
 */
export function Hero() {
  return (
    <section className="section hero">
      <Starfield />
      <div className="fade" aria-hidden="true" />
      <div className="wrap">
        <div className="hero-inner">
          <div className="orb enter-orb" aria-hidden="true" />
          <a href="/use-cases" className="pill enter" style={{ "--t0": ".15s" }}>
            <b>New</b> The cases: four industries, one workforce
          </a>
          <h1 className="h1 enter-words">
            <Words text={"You hired someone.\nNot a seat."} accent="seat" />
          </h1>
          <p className="dek enter" style={{ "--t0": ".8s" }}>
            Every agent has a name, an inbox, and a standing job. Roofing, real estate, tax season, the
            invoices nobody wants to chase: it's the same idea each time. Ask once, and the finished
            work comes back in the inbox you already read.
          </p>
          <div className="hero-ctas enter" style={{ "--t0": "1s" }}>
            <Btn href="#contact" size="lg" icon="arrow-up-right">
              Talk to us
            </Btn>
            <Btn href="/use-cases" kind="ghost" size="lg">
              Read the four cases
            </Btn>
          </div>
        </div>

        <div className="hero-window enter-panel">
          <div className="window inbox">
            <div className="window-bar">
              <span className="dots"><i /><i /><i /></span>
              <span className="title">Example inbox · one working week</span>
              <span className="right">
                <Ic name="magnifying-glass" size={14} />
                <Ic name="bell" size={14} />
              </span>
            </div>
            <div className="inbox-body">
              <div className="inbox-rail" aria-hidden="true">
                <span aria-current="page"><Ic name="envelope-simple" />Inbox</span>
                <span><Ic name="seal-check" />Approvals</span>
                <span><Ic name="list-checks" />Playbook</span>
                <span><Ic name="plugs-connected" />Tools</span>
                <span><Ic name="gear-six" />Settings</span>
              </div>
              <ul className="hi-list">
                {WEEK.map((row, i) => (
                  <li key={row.agent} className="hi-row" style={{ "--i": i }}>
                    <AgentAvatar agent={row.agent} uid={`hero-${row.agent}`} size="30px" />
                    <div className="hi-copy">
                      <div className="hi-top">
                        <b>{AGENT_LABEL[row.agent]}</b>
                        <span className="hi-tag" style={{ color: `var(--agent-${row.agent})` }}>{row.industry}</span>
                        <span className="hi-time">{row.sent}</span>
                      </div>
                      <p className="hi-subj">{row.subject}</p>
                      <p className="hi-snip">{row.snippet}</p>
                    </div>
                    <span className="hi-mark"><Ic name="check" />Done</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
