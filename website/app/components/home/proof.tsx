import { AgentAvatar } from "../agent-avatar";

const ROWS = [
  { nm: "Triaged", co: "Sorted, labelled, nothing missed", st: "214 messages", cls: "st-rep" },
  { nm: "Drafted", co: "Replies ready for your ok", st: "39 replies", cls: "st-rep" },
  { nm: "Flagged for you", co: "The ones that actually need a human", st: "6 threads", cls: "st-drf" },
];

export function Proof() {
  return (
    <section className="sec" style={{ background: "var(--surface)" }}>
      <div className="wrap">
        <div className="proof-grid">
          <div className="proof-copy">
            <span className="eyebrow">
              <span className="tick" />
              Proof, not promises
            </span>
            <h2 className="disp">Here&rsquo;s one that&rsquo;s actually running.</h2>
            <p>
              Since March 2026, <b>Francis</b>{" "}has run our own inbox — the same one you&rsquo;d reach us at. Last week:
              triaged <b>214 messages</b>, drafted <b>39 replies</b>, flagged <b>6</b> that actually needed a human, and
              gave back about <b>five hours</b>. Here&rsquo;s the note it sent Monday morning.
            </p>
            <span className="proof-label">
              <span className="pd" />
              Our own team · we run this on ourselves
            </span>
            <div className="proof-stat">
              <div className="ps">
                <div className="n">214</div>
                <div className="l">messages triaged</div>
              </div>
              <div className="ps">
                <div className="n">39</div>
                <div className="l">replies drafted</div>
              </div>
              <div className="ps">
                <div className="n">~5 hrs</div>
                <div className="l">given back</div>
              </div>
            </div>
          </div>

          <div className="proof-art">
            <div className="mail">
              <div className="mail-top">
                <AgentAvatar size={38} color="#7c3aed" />
                <div className="mail-from">
                  <div className="fn">Francis</div>
                  <div className="fa">francis@ambitt.agency</div>
                </div>
                <div className="mail-date">Mon, Jul 20 · 7:14 AM</div>
              </div>
              <div className="mail-subj">Your inbox over the weekend (Mon)</div>
              <div className="mail-body">
                <p>Morning. Here&rsquo;s where the inbox landed over the weekend:</p>
                <div style={{ marginTop: 12 }}>
                  {ROWS.map((r) => (
                    <div className="lead-row" key={r.nm}>
                      <div>
                        <div className="lnm">{r.nm}</div>
                        <div className="lco">{r.co}</div>
                      </div>
                      <span className={`st ${r.cls}`}>{r.st}</span>
                    </div>
                  ))}
                </div>
                <div className="sign" style={{ marginTop: 14 }}>
                  That&rsquo;s about five hours you don&rsquo;t have to spend. — <b>Francis</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
