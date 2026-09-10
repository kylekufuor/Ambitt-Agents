import { AgentAvatar, AGENT_LABEL, type AgentName } from "../agent-avatar";
import { PhotoPlate } from "../photos";
import { FigCaption, Icon, MaskLine } from "../primitives";

// One working week across four industries. Four rows, not one invoice thread,
// so the first screen reads as "this works for my business", whatever it is.
const WEEK: Array<{ agent: AgentName; industry: string; sent: string; subject: string; snippet: string }> = [
  { agent: "wade", industry: "Roofing", sent: "Tue 6:40am", subject: "Tuesday's route: 42 addresses, ranked", snippet: "1.75in hail on Meadowbrook Ct. Nobody gets knocked twice." },
  { agent: "arthur", industry: "Commercial real estate", sent: "Wed 8:15am", subject: "3 listings match this week, 1 borderline", snippet: "212 units in Cary. Built 1986, seller motivated, matches every filter." },
  { agent: "priya", industry: "Tax & accounting", sent: "Thu 7:50am", subject: "8 documents still outstanding, 3 need a call not an email", snippet: "92 of 104 requests cleared before the first extension deadline." },
  { agent: "otto", industry: "Bookkeeping", sent: "Mon 7:04am", subject: "Monday recap: two invoices worth a call", snippet: "Related Renovations: $8,400, 52 days. Full aging report attached." },
];

const CALLOUTS: Array<[lead: string, rest: string]> = [
  ["The ask, in plain English.", "No form to fill in, whatever the business."],
  ["The specific thing that needs you.", "Not the whole spreadsheet, not a queue to sort through."],
  ["Real work, attached.", "A report, a route, a document list: whatever the job calls for."],
  ["Nothing left to do.", "Each agent runs it again on its own, on schedule."],
];

/** The opening: four agents' work landing in one inbox, so the first screen reads as every industry, not one. */
export function Hero() {
  return (
    <section className="section hero">
      {/* On two-column screens the photograph sits BEHIND the headline (see .hero-top in
          editorial.css); on phones it stays a band above it. Either way the headline is on
          the first screen. */}
      <div className="hero-top">
        <PhotoPlate photo="hero" style={{ "--pos": "center 30%", "--cap-w": "400px", "--photo-op": ".44", "--photo-blur": ".7px" }}>
          Four different businesses. The same idea, every time.
        </PhotoPlate>
        {/* The load sequence, the one moment the page performs: kicker, masked headline (two
            lines), dek, calls to action, then the artifact and its callouts, each ~80-90ms after
            the last on one curve (--ease-out-expo). CSS keyframes (.enter), so it plays on first
            paint; everything below the fold uses .reveal and fires on scroll instead. */}
        <div className="wrap hero-head">
          <p className="kicker enter" style={{ animationDelay: ".02s" }}>An AI workforce</p>
          <h1 className="h1 enter" style={{ animationDelay: ".10s" }}>
            <MaskLine delay=".11s">You hired someone.</MaskLine>
            <MaskLine delay=".19s">Not a <em className="accent">seat</em>.</MaskLine>
          </h1>
        </div>
      </div>
      <div className="wrap spread hero-body">
        <div className="label-col">
          <p className="dek enter" style={{ animationDelay: ".19s" }}>
            Every agent has a name, an inbox, and a standing job. Roofing, real estate, tax season, the
            invoices nobody wants to chase: it's the same idea each time. Ask once, and the finished
            work comes back in the inbox you already read.
          </p>
          <div className="enter" style={{ display: "flex", gap: "14px", marginTop: "26px", flexWrap: "wrap", animationDelay: ".27s" }}>
            <a href="#contact" className="btn btn-primary">Talk to us</a>
            <a href="/use-cases" className="btn btn-ghost">Read the four cases<Icon name="arrow" size={15} /></a>
          </div>
        </div>
        <div>
          <figure className="enter" style={{ animationDelay: ".35s" }}>
            <div className="artifact hero-inbox">
              <div className="mail-head">
                <div className="mail-subj">This week, four different industries</div>
                <div className="mail-line">One ask in. Finished work back. Never the same business twice.</div>
              </div>
              <ul className="hi-list">
                {WEEK.map((row) => (
                  <li key={row.agent} className="hi-row">
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
                  </li>
                ))}
              </ul>
            </div>
            <FigCaption fig="01">Four agents, four industries, one working week.</FigCaption>
          </figure>
          <ul className="callouts enter" style={{ animationDelay: ".43s" }}>
            {CALLOUTS.map(([lead, rest], i) => (
              <li key={lead}>
                <span className="num">{i + 1}</span>
                <span className="txt">
                  <b>{lead}</b> {rest}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
