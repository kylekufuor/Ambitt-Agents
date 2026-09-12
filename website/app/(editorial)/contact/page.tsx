import { Nav } from "../../components/nav";
import { Footer } from "../../components/footer";
import { pageMetadata } from "../_components/metadata";
import { Btn, Kicker } from "../_components/primitives";

export const metadata = pageMetadata({ path: "/contact", title: "Talk to Ambitt: a workflow, a question, a next step", description: "Tell us about a custom agent, ask about upcoming plans, or get help with your Ambitt portal." });

export default function ContactPage() {
  return <><Nav /><main id="main" className="support-page">
    <section className="support-hero wrap">
      <Kicker>Get in touch</Kicker>
      <h1 className="h1">Start with the work.<br /><span className="accent">We'll take it from there.</span></h1>
      <p className="dek">Tell us what keeps landing on your desk, which tools you use, and what a good result looks like.</p>
    </section>
    <section className="wrap contact-options" aria-label="Ways to reach us">
      <article className="contact-option"><span className="support-number">01 / LET'S BUILD</span><h2>A job for an agent.</h2><p>Talk through a custom build or ask about the upcoming Free, Pro, Max and Business plans. We will help you work out the fit.</p><a className="contact-address" href="mailto:hello@ambitt.agency">hello@ambitt.agency ↗</a><a href="/#pricing" className="text-link">See plans and custom builds</a></article>
      <article className="contact-option"><span className="support-number">02 / ALREADY WITH US</span><h2>A hand with your workspace.</h2><p>Tell us what you were trying to do and what happened. For work requests, you can reply directly to your agent's email.</p><a className="contact-address" href="mailto:support@ambitt.agency">support@ambitt.agency ↗</a><a href="/docs" className="text-link">Find an answer in the portal guide</a></article>
    </section>
    <section className="support-next wrap"><div><Kicker>Take a look first</Kicker><h2 className="h2">A few minutes inside the app.</h2><p className="dek">Watch a sample workflow, or open your own workspace if you already have an account.</p></div><div className="support-actions"><Btn href="/use-cases" icon="arrow-up-right">Watch the workflows</Btn><Btn href="https://portal.ambitt.agency" kind="ghost">Open portal</Btn></div></section>
  </main><Footer /></>;
}
