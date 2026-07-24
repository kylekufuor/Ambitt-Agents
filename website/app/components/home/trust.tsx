import { ShieldCheck, SearchShine, Lock } from "../icons";

export function Trust() {
  return (
    <section className="sec trust">
      <div className="wrap">
        <span className="eyebrow">
          <span className="tick" />
          Built to be trusted
        </span>
        <h2 className="disp" style={{ marginTop: 16 }}>
          An agent earns its place by making the business better — or it doesn&rsquo;t&nbsp;ship.
        </h2>
        <div className="trust-rows">
          <div className="trust-item">
            <span className="tic">
              <ShieldCheck size={24} />
            </span>
            <h3 className="disp">You approve the big stuff.</h3>
            <p>Anything with real consequences waits for your ok.</p>
          </div>
          <div className="trust-item">
            <span className="tic">
              <SearchShine size={24} />
            </span>
            <h3 className="disp">It works in your accounts, never around them.</h3>
            <p>Your logins, your permissions, your data.</p>
          </div>
          <div className="trust-item">
            <span className="tic">
              <Lock size={24} />
            </span>
            <h3 className="disp">Your data stays yours.</h3>
            <p>Encrypted at rest, isolated to your business, never shared between clients.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
