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
            <Words text={"Three steps. Then it's Monday and the work is done."} accent="done." />
          </h2>
        </div>
        <div className="steps rv-seq">
          <div className="step">
            <span className="num">01</span>
            <h3>Tell us the job</h3>
            <p>
              Describe the work the way you'd brief a new hire: what, when, and what good looks like. No form,
              no setup call you dread.
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
            <h3>It works in your tools, with your logins</h3>
            <p>
              Connected to the accounts you already have. Anything with real consequences waits for your approval
              first.
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
            <h3>The finished work arrives</h3>
            <p>
              Reports, routes, document lists, ranked shortlists: by email, on schedule, and again next week
              without being asked.
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
