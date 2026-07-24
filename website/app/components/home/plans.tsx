import { CtaPair } from "./shared";

export function Plans() {
  return (
    <section className="sec plans" id="pricing">
      <div className="wrap">
        <span className="eyebrow">
          <span className="tick" />
          Simple to start
        </span>
        <h2 className="disp">Hire one agent. Add more when it&rsquo;s earning its&nbsp;keep.</h2>
        <p className="lede">
          Plans start at $499/mo for a single agent connected to your tools, with room to grow into a small team of
          them. No contracts. Pause or cancel any time with a reply.
        </p>
        <div className="price-focal">
          <div className="pl">Starts at</div>
          <div className="pv">
            <span className="cur">$</span>499<span className="per">/mo</span>
          </div>
          <div className="pl">One agent, connected to your tools</div>
          <div className="grow">
            <span className="gd" />
            Add more agents as each one earns its keep
          </div>
        </div>
        <CtaPair size="lg" className="plans-cta" />
      </div>
    </section>
  );
}
