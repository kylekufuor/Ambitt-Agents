import { AgentAvatar } from "../agent-avatar";
import { Ic } from "../icons";
import { Btn } from "../primitives";

/** Finished work is visible on the first screen, with its example status at the source. */
export function Hero() {
  return <section className="section work-hero">
    <div className="wrap">
      <div className="work-hero-grid">
        <div className="work-hero-copy">
          <span className="kicker">An AI workforce. Built around your business.</span>
          <h1 className="h1">You hired{" "}<br />someone.<br /><span className="accent">Not a seat.</span></h1>
          <p className="dek">A name. An inbox. A standing job. Your agent works in your tools and sends back the finished work. Follow it in your portal, or reply by email.</p>
          <div className="work-hero-actions"><Btn href="#contact" size="lg" icon="arrow-up-right">Talk to us</Btn><a href="#portal" className="hero-watch"><span aria-hidden="true">▷</span> See the portal</a></div>
          <p className="work-hero-note">Built for your workflow. Delivered to your inbox.</p>
        </div>
        <figure className="work-delivery">
          <figcaption className="delivery-caption"><span>ONE MONDAY, LESS ON YOUR PLATE</span><span>Illustrative example</span></figcaption>
          <div className="delivery-mail">
            <div className="delivery-sender"><AgentAvatar agent="otto" uid="hero-otto" size="42px" /><div><b>Otto</b><span>Your bookkeeping agent</span></div><time>Mon, 7:04 AM</time></div>
            <h2>Two invoices worth a call.<br />The rest are ready.</h2>
            <p>I went through the open invoices. These two need a conversation. I've drafted the other reminders for your approval.</p>
            <div className="delivery-ledger"><div><span>Related Renovations<small>52 days overdue</small></span><b>$8,400</b></div><div><span>Cedar & Co.<small>Promised payment last Friday</small></span><b>$3,250</b></div></div>
            <div className="delivery-attachment"><Ic name="files" size={23} /><span><b>Monday aging report.pdf</b><small>The details, with next steps</small></span><Ic name="paperclip" size={18} /></div>
            <p className="delivery-signoff">Reply when you're ready. I'll take it from there.<br /><b>Otto</b></p>
          </div>
          <div className="delivery-footer"><Ic name="seal-check" size={18} /><span>The report is ready.</span><span>Reminders await your approval.</span></div>
        </figure>
      </div>
      <div className="work-industries"><span>ONE IDEA. DIFFERENT KINDS OF WORK.</span><a href="/use-cases#home-services">Roofing <Ic name="arrow-up-right" size={14} /></a><a href="/use-cases#commercial-real-estate">Real estate <Ic name="arrow-up-right" size={14} /></a><a href="/use-cases#tax-and-accounting">Tax & accounting <Ic name="arrow-up-right" size={14} /></a><a href="/use-cases#bookkeeping">Bookkeeping <Ic name="arrow-up-right" size={14} /></a></div>
    </div>
  </section>;
}
