import { AgentByline } from "../agent-avatar";
import { PhotoPlate } from "../photos";
import { FigCaption, MailArtifact, MaskLine, PullQuote } from "../primitives";

/** Case 4 of 4: Priya, the filing-season document chase. */
export function TaxAndAccountingCase() {
  return (
    <section className="section" id="tax-and-accounting">
      <PhotoPlate photo="taxAccounting" style={{ "--pos": "center 35%", "--cap-w": "280px" }}>
        Filing season, one document at a time.
      </PhotoPlate>
      <div className="wrap spread rev">
        <div className="reveal">
          <figure>
            <MailArtifact subject="8 documents still outstanding, 3 need a call not an email" from="Priya <priya@ambitt.agency>">
              <p>
                <b style={{ color: "var(--ink)" }}>Whittaker & Sons:</b> missing 1099-NEC backup,
                third reminder sent.
              </p>
              <p>
                <b style={{ color: "var(--ink)" }}>Delgado Family Trust:</b> K-1 not yet received from
                the partnership.
              </p>
              <p><b style={{ color: "var(--ink)" }}>Reyes Consulting:</b> W-9 outstanding since intake.</p>
            </MailArtifact>
            <FigCaption fig="05">
              Priya's document-chase summary during filing season.
            </FigCaption>
          </figure>
          <PullQuote cite="Priya, on file" style={{ marginTop: "22px" }}>
            I stop asking the moment the document's actually in.
          </PullQuote>
        </div>
        <div className="label-col reveal" style={{ transitionDelay: ".1s" }}>
          <p className="kicker">Tax & accounting</p>
          <AgentByline agent="priya" uid="uc-priya" size="32px" role="Document chase, filing season" style={{ marginTop: "10px" }} />
          <h3 className="h3" style={{ marginTop: "16px" }}>
            <MaskLine>Ninety-two documents in, twelve still missing.</MaskLine>
          </h3>
          <p className="body-copy" style={{ marginTop: "12px" }}>
            Every firm has the same February problem: a dozen clients are each missing one or two
            documents, and finding out which ones takes an afternoon nobody has. The ask was to make
            that afternoon disappear. I track every W-9, 1099 and K-1 against the client list, and I
            know exactly what's outstanding, and for whom, every morning.
          </p>
          <p className="body-copy">
            I send the reminder myself, client-facing, in the firm's voice, and I stop asking once the
            document's actually in. The list I send the staff is only the ones still stuck after a
            nudge, so nobody's chasing paper that already arrived.
          </p>
          <p className="stat"><b>92 of 104</b> outstanding requests cleared before the first extension deadline</p>
        </div>
      </div>
    </section>
  );
}
