import { Ic } from "../icons";
import { Kicker, Words } from "../primitives";

/** Nuera's 01 / 02 / 03, each with a small piece of the real artifact. */
export function How() {
  return (
    <section className="section ruled" id="how">
      <div className="wrap">
        <div className="section-head">
          <Kicker>How it works</Kicker>
          <h2 className="h2 rv-words">
            <Words text={"From the first brief to the next decision."} accent="done." />
          </h2>
        </div>
        <div className="steps rv-seq">
          <div className="step">
            <span className="num">01</span>
            <h3>Tell us the job</h3>
            <p>
              Describe the job, the tools it involves, and what a good result looks like. For a custom build, we agree the scope and set it up with you.
            </p>
            <div className="mini">
              <div className="ml"><i />From you · Sunday 9:12pm</div>
              <div className="brief">
                Every Monday, go through the open invoices and tell me who actually needs a call. Not the whole
                ledger.
              </div>
            </div>
          </div>
          <div className="step">
            <span className="num">02</span>
            <h3>Connect your tools. Set the boundaries.</h3>
            <p>
              We connect your accounts and review the setup before your agent goes live. Your agreed rules decide what it can do and when it needs a yes.
            </p>
            <div className="mini">
              <div className="ml"><i />Otto · needs a yes</div>
              <div className="brief">Send 12 payment reminders in your name?</div>
              <div className="approw">
                <span className="apbtn ok"><Ic name="check" size={12} />Approve</span>
                <span className="apbtn">Hold</span>
              </div>
            </div>
          </div>
          <div className="step">
            <span className="num">03</span>
            <h3>Follow the work in your portal</h3>
            <p>
              Results arrive by email. In the portal, review the weekly overview, open leads, check decisions, and see the work log. Send the next brief when you are ready.
            </p>
            <div className="mini">
              <div className="ml"><i />Monday · 7:04am</div>
              <div className="deliv">
                <Ic name="seal-check" />
                <span>Monday recap: two invoices worth a call</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
