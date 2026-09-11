import { AgentByline } from "../agent-avatar";
import { PhotoPlate } from "../photos";
import { FigCaption, Icon, MailArtifact, MaskLine, PullQuote } from "../primitives";

/** Case 3 of 4: Wade, storm response. */
export function HomeServicesCase() {
  return (
    <section className="section ruled" id="home-services">
      <PhotoPlate photo="homeServices" style={{ "--pos": "center 55%", "--cap-w": "300px" }}>
        Storm season doesn't wait for the office to open.
      </PhotoPlate>
      <div className="wrap spread">
        <div className="label-col reveal">
          <p className="kicker">Home services · roofing</p>
          <AgentByline agent="wade" uid="uc-wade" size="32px" role="Storm response coordinator" style={{ marginTop: "10px" }} />
          <h3 className="h3" style={{ marginTop: "16px" }}>
            <MaskLine>A hail map by breakfast. A street list before lunch.</MaskLine>
          </h3>
          <p className="body-copy" style={{ marginTop: "12px" }}>
            The client works hail events across North Texas, and speed is the whole business: the first
            credible contractor at the door usually wins the job. When a storm swath posts, I work out
            which neighbourhoods are actually worth a knock: hail size, roof age, a crew that isn't
            already booked two streets over. Then I turn it into a route the crew can run that morning.
          </p>
          <p className="body-copy">
            I keep the list clean so nobody gets knocked twice, and I never reach a homeowner who hasn't
            already opened the door to us. No cold texts, no purchased lists, ever. The “come back
            later” homeowners are where most jobs quietly die, so I follow up with them on the cadence
            the client sets, instead of letting the list go cold.
          </p>
          <p className="stat"><b>11 inspections</b> recovered off the follow-up list last month</p>
        </div>
        <div className="reveal" style={{ transitionDelay: ".1s" }}>
          <figure>
            <MailArtifact subject="Tuesday's route: 42 addresses, ranked" from="Wade <wade@ambitt.agency>">
              <p><b style={{ color: "var(--ink)" }}>1. Meadowbrook Ct:</b> 1.75in hail, roof ~14 yrs</p>
              <p><b style={{ color: "var(--ink)" }}>2. Ashford Ln:</b> 1.5in hail, adjacent block already booked</p>
              <p>
                <b style={{ color: "var(--ink)" }}>3. Brookhollow Dr:</b> 1.5in hail, engaged homeowner
                from last swath
              </p>
              <div className="attach">
                <Icon name="attach" />
                <div><b>Route + measurement packet.pdf</b><span>42 addresses</span></div>
              </div>
            </MailArtifact>
            <FigCaption fig="04">
              Wade's route for a North Texas storm crew.
            </FigCaption>
          </figure>
          <PullQuote cite="Wade, on file" style={{ marginTop: "22px" }}>
            I never knock on a door that hasn't already opened one to us.
          </PullQuote>
        </div>
      </div>
    </section>
  );
}
