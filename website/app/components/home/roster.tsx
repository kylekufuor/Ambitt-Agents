import type { ReactNode } from "react";
import { AgentAvatar } from "../agent-avatar";
import { Sheet, Envelope, PaperPlane, Chart, Journal, CheckDisc } from "../icons";
import { ONBOARD_URL } from "../../lib/site";

type Agent = {
  name: string;
  color: string;
  role: string;
  desc: string;
  tools: string[];
  get: ReactNode;
  badge: ReactNode;
};

const AGENTS: Agent[] = [
  {
    name: "Nadia",
    color: "#4f46e5",
    role: "Market research & sourcing",
    desc: "Tracks new listings on the platforms your brokers already use; sends a ranked shortlist every morning.",
    tools: ["Google Sheets", "Gmail"],
    get: "A ranked shortlist + a CSV, daily",
    badge: <Sheet size={15} />,
  },
  {
    name: "Francis",
    color: "#7c3aed",
    role: "Executive assistant",
    desc: "Clears your inbox, guards your calendar, drafts what only you can answer.",
    tools: ["Gmail", "Google Calendar", "Google Docs"],
    get: <>&ldquo;Here&rsquo;s your day,&rdquo; on request</>,
    badge: <Envelope size={15} />,
  },
  {
    name: "Reed",
    color: "#00887a",
    role: "Sales follow-up",
    desc: "Follows up with every lead within the hour and logs it in your CRM.",
    tools: ["HubSpot / Salesforce", "Gmail"],
    get: "Every lead nurtured, nothing slips",
    badge: <PaperPlane size={15} />,
  },
  {
    name: "Wren",
    color: "#b45309",
    role: "Ops & reporting",
    desc: "Turns your tools into one plain-English Monday email.",
    tools: ["Analytics", "Slack"],
    get: "One report email every Monday + PDF",
    badge: <Chart size={15} />,
  },
  {
    name: "Otto",
    color: "#00b3b3",
    role: "Accounts receivable",
    desc: "Chases unpaid invoices and keeps your books current.",
    tools: ["QuickBooks", "Gmail"],
    get: "Invoices chased and logged for you",
    badge: <Journal size={15} />,
  },
];

export function Roster() {
  return (
    <section className="sec" id="agents" style={{ background: "var(--surface)" }}>
      <div className="wrap">
        <div style={{ maxWidth: 680 }}>
          <span className="eyebrow">
            <span className="tick" />
            Meet a few of the team
          </span>
          <h2 className="disp" style={{ fontSize: "clamp(30px,3.8vw,42px)", marginTop: 16 }}>
            Every agent has a name, a job, and answers to&nbsp;you.
          </h2>
          <p className="h-sub">
            These are examples. Yours is built for your business, learns your voice, and works the way you&rsquo;d want a
            great new hire to.
          </p>
        </div>

        <div className="roster">
          {AGENTS.map((a) => (
            <div className="rcard" key={a.name}>
              <div className="rc-av">
                <AgentAvatar size={54} color={a.color} />
                <span className="rc-badge" style={{ color: a.color }}>
                  {a.badge}
                </span>
              </div>
              <div className="rc-body">
                <div className="rc-name">
                  {a.name} <span className="rc-role">{a.role}</span>
                </div>
                <p className="rc-desc">{a.desc}</p>
                <div className="rc-tools">
                  {a.tools.map((t) => (
                    <span className="tt" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
                <div className="rc-get">
                  <CheckDisc size={16} bg={a.color} check={11} />
                  {a.get}
                </div>
              </div>
            </div>
          ))}

          <div className="rcard build">
            <div className="build-mark">
              <AgentAvatar size={40} color="#00b3b3" />
            </div>
            <div className="rc-body">
              <div className="bh">The next one is yours.</div>
              <p className="bp">
                These are examples. Yours is built for your business, learns your voice, and answers to you.
              </p>
              <a className="bl" href={ONBOARD_URL}>
                Start now <PaperPlane size={15} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
