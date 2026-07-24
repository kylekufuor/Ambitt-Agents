import { Envelope, ShieldCheck, Chart, CheckDisc } from "../icons";

export function HowItWorks() {
  return (
    <section className="sec" id="how">
      <div className="wrap">
        <div style={{ maxWidth: 600 }}>
          <span className="eyebrow">
            <span className="tick" />
            How it works
          </span>
          <h2 className="disp" style={{ fontSize: "clamp(30px,3.8vw,42px)", marginTop: 16 }}>
            Three steps. Then it just&nbsp;works.
          </h2>
        </div>

        <div className="stair">
          <div className="step">
            <div className="node">1</div>
            <div>
              <h3 className="disp">Tell us the job</h3>
              <p>
                A short call or a written brief — the plain-English version of &ldquo;here&rsquo;s what I keep having to
                do.&rdquo; We set up a named agent for exactly that.
              </p>
            </div>
            <div className="step-art">
              <div className="mini">
                <div className="ml">
                  <Envelope size={15} /> The brief
                </div>
                <div className="brief">
                  &ldquo;Every day I chase the same overdue invoices and re-send the same three reports. Take it off my
                  plate.&rdquo;
                </div>
              </div>
            </div>
          </div>

          <div className="step">
            <div className="node">2</div>
            <div>
              <h3 className="disp">It works in your tools, with your logins</h3>
              <p>
                Under your direction. You approve anything big before it happens, and you can pause it any time with a
                single reply.
              </p>
            </div>
            <div className="step-art">
              <div className="mini">
                <div className="ml">
                  <ShieldCheck size={15} /> Waiting on your ok
                </div>
                <div className="approw">
                  <span style={{ fontSize: 13, color: "var(--ink)" }}>Send 12 payment reminders?</span>
                </div>
                <div className="approw" style={{ marginTop: 9 }}>
                  <span className="apbtn ok">Approve</span>
                  <span className="apbtn no">Hold</span>
                </div>
              </div>
            </div>
          </div>

          <div className="step">
            <div className="node">3</div>
            <div>
              <h3 className="disp">The finished work arrives by email or text</h3>
              <p>On a schedule you set, or the minute you ask. You review the result. Not a dashboard.</p>
            </div>
            <div className="step-art">
              <div className="mini">
                <div className="ml">
                  <Chart size={15} /> It just arrived
                </div>
                <div className="deliv">
                  <CheckDisc size={20} bg="var(--brand)" check={14} />
                  <span className="dv">Monday report &mdash; in your inbox, 6:30 AM</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="reassure">
          <ShieldCheck size={20} />
          You&rsquo;re always in control. Big actions wait for your ok. One reply pauses everything.
        </div>
      </div>
    </section>
  );
}
