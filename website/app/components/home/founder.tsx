import { AgentAvatar } from "../agent-avatar";

export function Founder() {
  return (
    <section className="sec founder">
      <div className="wrap">
        <div className="founder-card">
          <div className="mk">
            <AgentAvatar size={60} color="#00b3b3" />
          </div>
          <p className="founder-note">
            We started Ambitt with one rule: an agent only earns its place if it makes your business{" "}
            <b>genuinely better</b>. Not busier. Not more &ldquo;automated.&rdquo; Better — measured in work that&rsquo;s
            actually done and hours you get back. Every agent we build has a name, learns your business, and answers to
            you. If one isn&rsquo;t pulling its weight, you tell it, or you let it go. That&rsquo;s the whole deal.
          </p>
          <div className="sig-wrap">
            <span className="sig-mark" aria-hidden />
            <span className="sig-name">The Ambitt team</span>
          </div>
        </div>
      </div>
    </section>
  );
}
