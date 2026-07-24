import { CtaPair } from "./shared";

export function MissionCta() {
  return (
    <section className="sec mission on-dark" id="contact">
      <div className="wrap">
        <h2 className="disp">Give one job to an agent that&rsquo;s built to do it&nbsp;well.</h2>
        <p>
          Tell us the thing you keep having to do. We&rsquo;ll build you a named agent that takes it off your plate — and
          only keeps its seat if it&rsquo;s genuinely making your business better.
        </p>
        <CtaPair size="lg" className="mission-cta" />
      </div>
    </section>
  );
}
