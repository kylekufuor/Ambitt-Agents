import { AgentByline } from "../agent-avatar";
import { GmailThread } from "../gmail-thread";
import { FigCaption, Icon, Kicker, MailArtifact, PullQuote, Words } from "../primitives";

/** Two jobs in the agents' own words, each beside what it actually sent (Seonovu's two-panel rhythm). */
export function HowWeWork() {
  return (
    <section className="section ruled" id="work">
      <div className="wrap">
        <div className="section-head">
          <Kicker>The work, illustrated</Kicker>
          <h2 className="h2 rv-words">
            <Words text={"Each agent tells you what it did, not what it can do."} accent="did," />
          </h2>
          <p className="dek rv">Two examples of what an agent can deliver. Explore all four industries on the cases page. The names, messages and results shown here are illustrative.</p>
        </div>

        <div className="spread">
          <div className="label-col rv">
            <div className="vignette">
              <AgentByline agent="arthur" uid="how-arthur" size="32px" role="Commercial real estate, Raleigh-Durham" />
              <h3 className="h3">I only bring you the ones worth a look.</h3>
              <p className="body-copy">
                Every morning I go through the listing and market-data platforms your team already subscribes
                to and check new multifamily listings against the buy box: 100-plus units, 1980s or newer,
                value-add. Most weeks that's forty or fifty new listings. I bring you three or four.
              </p>
              <p className="stat">
                <b>4 of 51</b> listings matched the buy box this week
              </p>
            </div>
          </div>
          <div className="rv" style={{ "--d": ".45s" }}>
            <figure>
              <MailArtifact subject="3 listings match this week, 1 borderline" from="Arthur <arthur@ambitt.agency>">
                <p>
                  <b style={{ color: "var(--ink)" }}>212 units, Cary submarket.</b> Built 1986, roof replaced 2019,
                  seller motivated. Matches on every filter.
                </p>
                <p>
                  <b style={{ color: "var(--ink)" }}>164 units, Garner.</b> Built 1991, light value-add story, comps
                  support a rent bump.
                </p>
                <span className="chip">
                  <Icon name="gate" size={15} />
                  Outreach drafted · held for your approval
                </span>
              </MailArtifact>
              <FigCaption fig="01">Example: Arthur's Wednesday digest for a Raleigh-area broker.</FigCaption>
            </figure>
            <PullQuote cite="Arthur, example brief" style={{ marginTop: "22px" }}>
              I draft the note. I don't send it until you say go.
            </PullQuote>
          </div>
        </div>

        <div className="spread rev">
          <div className="label-col rv">
            <div className="vignette">
              <AgentByline agent="wade" uid="how-wade" size="32px" role="Storm response, roofing" />
              <h3 className="h3">I turn a hail map into a street list before lunch.</h3>
              <p className="body-copy">
                When a storm swath posts for the service area, I work out which streets are actually worth a
                knock: hail size, roof age, a crew that isn't already booked two streets over. Then I rank the
                list so nobody gets knocked twice. Anyone who says "call me later" stays on a list I follow up
                on my own, because that's usually where the job was going to get lost.
              </p>
              <p className="stat">
                <b>11 inspections</b> recovered off the follow-up list last month
              </p>
            </div>
          </div>
          <div className="rv" style={{ "--d": ".45s" }}>
            <figure>
              <GmailThread
                viewer={{ initial: "B", color: "#516b7a" }}
                subject="Tuesday's route: 42 addresses, ranked"
                label="Storm response"
                earlier={{
                  name: "Beau Tanner",
                  initial: "B",
                  color: "#516b7a",
                  snippet: "Whenever a swath posts, just send me the addresses worth a knock. I don't need the raw map, just the list, ranked.",
                  date: "Jul 14",
                }}
                agent="wade"
                avatarUid="gm-wade1"
                from={{ name: "Wade", address: "wade@ambitt.agency" }}
                to="Beau"
                date="Tue, Sep 8, 6:40 AM"
                attachment={{ summary: "1 attachment · 612 KB", name: "route-and-measurement-packet.pdf", size: "42 addresses · 612 KB" }}
              >
                <p>
                  Top three worth a knock this morning: <b style={{ fontWeight: "500" }}>Meadowbrook Ct</b> at
                  1.75in hail on a roof about 14 years old, <b style={{ fontWeight: "500" }}>Ashford Ln</b> at
                  1.5in but the adjacent block's already booked, and <b style={{ fontWeight: "500" }}>Brookhollow
                  Dr</b> at 1.5in with an engaged homeowner from the last swath.
                </p>
                <p>Full 42-address route is attached, ranked the same way.</p>
                <p>Wade</p>
              </GmailThread>
              <FigCaption fig="02">Example: Wade's route for a North Texas storm crew, shown in Gmail.</FigCaption>
            </figure>
            <PullQuote cite="Wade, example brief" style={{ marginTop: "22px" }}>
              I never knock on a door that hasn't already opened one to us.
            </PullQuote>
          </div>
        </div>
      </div>
    </section>
  );
}
