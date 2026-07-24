import { Chevron } from "../icons";

const QA: { q: string; a: React.ReactNode }[] = [
  {
    q: "What does an agent actually do all day?",
    a: "It works inside the tools you already use — your inbox, your CRM, your spreadsheets — and does the recurring work you'd otherwise do by hand or hire for: research, follow-ups, reports, chasing things down. It runs on a schedule or whenever you ask, and emails or texts you the finished result.",
  },
  {
    q: "Do I have to log into anything?",
    a: "No. There's no dashboard to check. You talk to your agent by email or text, and the work comes to you. If you can reply to an email, you can work with an agent.",
  },
  {
    q: "Which of my tools can it work in?",
    a: "The ones you already use — Gmail, Google Calendar and Sheets, Slack, your CRM (HubSpot or Salesforce), QuickBooks, and hundreds more. For specialized work like commercial real estate, it works in the listing and market-data platforms your brokers already subscribe to.",
  },
  {
    q: "Whose account does it use?",
    a: "Yours. Your agent. Your logins. Your tools. It signs in with your own credentials, under your direction, and does the work the way a member of your team would — nothing it couldn't already do with your permission.",
  },
  {
    q: "What if it gets something wrong?",
    a: "You approve anything with real consequences before it happens, it shows its work, and one reply pauses it instantly. It's a teammate you can direct, not a black box.",
  },
  {
    q: "How is my data handled?",
    a: "Credentials are encrypted at rest, and every agent is isolated to your business — your data, memory, and history are never shared with anyone else.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes. No contracts, no lock-in. Pause or cancel with a reply and your agent stops.",
  },
];

export function Faq() {
  return (
    <section className="sec" id="faq" style={{ background: "var(--surface)" }}>
      <div className="wrap faq">
        <h2 className="disp">The questions everyone asks.</h2>
        <div className="faq-list">
          {QA.map((item, i) => (
            <details className="qa" key={item.q} open={i === 0}>
              <summary>
                <span className="qn">{i + 1}</span>
                {item.q}
                <Chevron size={20} className="chev" />
              </summary>
              <div className="ans">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
