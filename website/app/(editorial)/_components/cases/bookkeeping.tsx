import { AgentByline } from "../agent-avatar";
import { GmailThread } from "../gmail-thread";
import { PhotoPlate } from "../photos";
import { FigCaption, MaskLine, PullQuote, RuleDraw } from "../primitives";

/** Case 1 of 4: Otto, accounts receivable. */
export function BookkeepingCase() {
  return (
    <section className="section" id="bookkeeping" style={{ paddingTop: "clamp(24px,4vw,40px)" }}>
      <RuleDraw />
      <PhotoPlate photo="bookkeeping" style={{ "--pos": "32% 12%", "--cap-w": "280px", height: "clamp(320px,42vw,500px)" }}>
        Every shop keeps its own kind of ledger.
      </PhotoPlate>
      <div className="wrap spread">
        <div className="label-col reveal">
          <p className="kicker">Bookkeeping</p>
          <AgentByline agent="otto" uid="uc-otto" size="32px" role="Accounts receivable, standing job" style={{ marginTop: "10px" }} />
          <h3 className="h3" style={{ marginTop: "16px" }}>
            <MaskLine>The ask was simple: tell me who to call.</MaskLine>
          </h3>
          <p className="body-copy" style={{ marginTop: "12px" }}>
            The client runs a 14-person specialty contracting business and was tracking receivables in
            his head. He didn't want a system. He wanted to know, every Monday, who owed him money and
            which of them actually needed a phone call. So that's the job: I read the open invoice list,
            age every balance, and send back a short list, not the whole ledger.
          </p>
          <p className="body-copy">
            Anything inside terms, I leave alone. Anything gone quiet past 45 days, I flag. The full
            aging report goes on as an attachment for when he wants to check my work, not because he
            asked for a report.
          </p>
          <p className="stat"><b>$41,900</b> moved out of the over-90-day bucket last quarter</p>
        </div>
        <div className="reveal" style={{ transitionDelay: ".1s" }}>
          <figure>
            <GmailThread
              viewer={{ initial: "M", color: "#5b7065" }}
              subject="Monday recap: two invoices worth a call"
              label="Receivables"
              earlier={{
                name: "Dale Whitlock",
                initial: "M",
                color: "#5b7065",
                snippet: "My usual, whenever you get a sec: read the open invoice list and tell me who actually needs a call. Not the whole ledger.",
                date: "Aug 3",
              }}
              agent="otto"
              avatarUid="gm-otto1"
              from={{ name: "Otto", address: "otto@ambitt.agency" }}
              to="Marcus"
              date="Mon, Sep 7, 7:04 AM"
              attachment={{ summary: "1 attachment · 238 KB", name: "19-account-aging-report.pdf", size: "238 KB" }}
            >
              <p>
                Two worth a call this week: <b style={{ fontWeight: "500" }}>Meridian Fit-Out</b> is 48
                days past terms on $6,150, and <b style={{ fontWeight: "500" }}>Cascade Drywall</b> is
                57 days past on $2,900.
              </p>
              <p>Everyone else is inside terms or already on a payment plan, so I left them alone.</p>
              <p>Full 19-account aging report is attached if you want to check my work.</p>
              <p>Otto</p>
            </GmailThread>
            <FigCaption fig="01">
              Otto's Monday recap, in the inbox it actually lands in.
            </FigCaption>
          </figure>
          <PullQuote cite="Otto, in the Monday email" style={{ marginTop: "22px" }}>
            I chase this every Monday. You only hear from me about the two that need a call.
          </PullQuote>
        </div>
      </div>
    </section>
  );
}
