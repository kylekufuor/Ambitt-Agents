import { AgentAvatar } from "../agent-avatar";
import { CheckDisc } from "../icons";
import { CtaPair, FileChip } from "./shared";

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="wrap">
        <div className="hero-grid">
          <div className="hero-left">
            <div className="hero-quote">
              <span className="qb" />
              You ask in plain English
            </div>
            <h1 className="hero-h1">
              <span className="q">&ldquo;Chase down my unpaid&nbsp;invoices.&rdquo;</span>
              <span className="a">Handled before your coffee&rsquo;s cold.</span>
            </h1>
            <p className="hero-sub">
              Hire a named AI agent that works inside the tools you already use and emails you the finished work —{" "}
              <b>not a to-do list</b>. You ask in plain English. It does the job. You never touch a dashboard.
            </p>
            <CtaPair size="lg" className="hero-cta" />
            <div className="hero-micro">
              <b>No dashboard.</b>
              <span className="dot" />
              <b>No busywork.</b>
              <span className="dot" />
              The work just shows up.
            </div>
            <a className="hero-see" href="#what">
              See what a day with one looks like{" "}
              <span className="dn">&darr;</span>
            </a>
          </div>

          <div className="hero-art">
            <div className="phone">
              <div className="thread-top">
                <AgentAvatar size={40} color="#00b3b3" />
                <div className="who">
                  <div className="nm">
                    Otto{" "}
                    <span className="pill-live">
                      <span className="ld" />
                      Ambitt agent
                    </span>
                  </div>
                  <div className="rl">Accounts receivable</div>
                </div>
              </div>
              <div className="thread">
                <div className="bub bub-me anim a1">
                  Chase down everyone who hasn&rsquo;t paid last month&rsquo;s invoice.
                  <span className="t">8:41 AM</span>
                </div>
                <div className="bub bub-ag anim a2">
                  <div className="aname">Otto</div>
                  On it.
                  <span className="t">8:41 AM</span>
                </div>
                <div className="typing anim a3">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="bub bub-ag anim a4">
                  <div className="aname">Otto</div>
                  Done. Sent friendly reminders to <b>12 clients</b> (<b>$18,400</b> outstanding), logged each in your
                  books, and flagged <b>2</b> that need a call. Summary + list attached.
                  <FileChip
                    badge={{ text: "CSV", bg: "var(--teal-deep)" }}
                    name="unpaid-invoices.csv"
                    meta="12 rows"
                  />
                  <span className="done-row">
                    <CheckDisc size={18} bg="var(--brand)" /> Handled — nothing left for you to do.
                  </span>
                  <span className="t">8:47 AM</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
