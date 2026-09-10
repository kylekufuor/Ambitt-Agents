import { AgentByline } from "../agent-avatar";
import { PhotoPlate, PortalShot } from "../photos";
import { FigCaption, Icon, MailArtifact, MaskLine, PullQuote } from "../primitives";

/** Case 2 of 4: Arthur, acquisitions screening. */
export function CommercialRealEstateCase() {
  return (
    <section className="section" id="commercial-real-estate">
      <PhotoPlate photo="commercialRealEstate" style={{ "--pos": "center 38%", "--cap-w": "380px" }}>
        Comparing notes on the sidewalk, phone in hand.
      </PhotoPlate>
      <div className="wrap spread rev">
        <div className="reveal">
          <figure>
            <MailArtifact subject="3 listings match this week, 1 borderline" from="Arthur <arthur@ambitt.agency>">
              <p>
                <b style={{ color: "var(--ink)" }}>212 units, Cary submarket.</b> Built 1986, roof
                replaced 2019, seller motivated.
              </p>
              <p>
                <b style={{ color: "var(--ink)" }}>164 units, Garner.</b> Built 1991, light value-add,
                comps support a rent bump.
              </p>
              <p>
                <b style={{ color: "var(--ink)" }}>98 units, Wake Forest:</b> borderline, under the
                100-unit floor, flagged in case you want it anyway.
              </p>
              <span className="chip"><Icon name="gate" size={15} />Outreach drafted · held for your approval</span>
            </MailArtifact>
            <FigCaption fig="02">
              Arthur's Wednesday digest to a Raleigh area broker.
            </FigCaption>
          </figure>
          <PullQuote cite="Arthur, on file" style={{ marginTop: "22px" }}>
            I draft the note. I don't send it until you say go.
          </PullQuote>
        </div>
        <div className="label-col reveal" style={{ transitionDelay: ".1s" }}>
          <p className="kicker">Commercial real estate</p>
          <AgentByline agent="arthur" uid="uc-arthur" size="32px" role="Acquisitions screening, multifamily" style={{ marginTop: "10px" }} />
          <h3 className="h3" style={{ marginTop: "16px" }}>
            <MaskLine>Fifty-one listings. Four worth his time.</MaskLine>
          </h3>
          <p className="body-copy" style={{ marginTop: "12px" }}>
            The client buys value-add multifamily around Raleigh and Durham: 100 units and up, built
            1980 or later, the kind of property where a new roof and a rent bump pencil out. He didn't
            need another database. He needed someone to sit inside the listing and market-data platforms
            he already subscribes to every morning and tell him what actually matched.
          </p>
          <p className="body-copy">
            I check new listings against the buy box, pull the comps that matter, and rule out the ones
            that don't: wrong submarket, wrong unit count, already under contract. What's left gets a
            draft outreach note. I don't send it. He does, or he tells me to.
          </p>
          <p className="stat"><b>4 of 51</b> new listings matched the buy box this week</p>
        </div>
      </div>
      <div className="wrap reveal" style={{ marginTop: "clamp(36px,5vw,56px)", transitionDelay: ".08s" }}>
        <figure style={{ maxWidth: "860px", marginInline: "auto" }}>
          <PortalShot shot="firstrun" style={{ aspectRatio: "1200/700" }} />
          <FigCaption fig="03">
            The browser Arthur is actually driving, mid-search on the listing platform: one row skipped, and the rule that skipped it.
          </FigCaption>
        </figure>
      </div>
    </section>
  );
}
