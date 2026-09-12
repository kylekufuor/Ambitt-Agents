"use client";

import { useState } from "react";
import { Kicker, Words } from "../primitives";

export const QA: Array<{ q: string; a: string }> = [
  {
    q: "What does an agent actually do all day?",
    a: "It works inside the tools you already use: your inbox, your CRM, your spreadsheets. It does the recurring work you'd otherwise do by hand or hire for: research, follow-ups, reports, chasing things down. It runs on a schedule or whenever you ask, and emails you the finished result.",
  },
  {
    q: "What can I do in the portal?",
    a: "Home gives you a weekly overview. Leads lets you follow opportunities, Approvals collects decisions, and Activity shows the work log. You can also manage connections, review how your agent works, and check billing. You can keep asking for work by email.",
  },
  {
    q: "Which of my tools can it work in?",
    a: "The ones you already use: Gmail, Google Calendar and Sheets, Slack, your CRM (HubSpot or Salesforce), QuickBooks, and hundreds more. For specialized work like commercial real estate, it works in the listing and market-data platforms your brokers already subscribe to.",
  },
  {
    q: "Can I start on the Free plan today?",
    a: "Self-serve Free, Pro, Max and Business plans are coming soon. Credit billing and browser watching are still in development. You can ask about early access or talk to us now about a custom build.",
  },
  {
    q: "Whose account does it use?",
    a: "Yours. Your agent, your logins, your tools. It signs in with your own credentials, under your direction, and does the work the way a member of your team would. Nothing it couldn't already do with your permission.",
  },
  {
    q: "What if it gets something wrong?",
    a: "You approve anything with real consequences before it happens, it shows its work, and you can pause it from the portal. It's a teammate you can direct, not a black box.",
  },
  {
    q: "How is my data handled?",
    a: "Credentials are encrypted at rest, and every agent is isolated to your business. Your data, memory and history are never shared with anyone else.",
  },
  {
    q: "Can I cancel any time?",
    a: "You can request cancellation through support. Your subscription terms determine when billing and service end. If you need the agent to stop working now, use the pause control in your portal.",
  },
];

/** Nuera's FAQ: a light room, plus/minus accordion, the answer's height eased open. */
export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="section room-light" id="faq">
      <div className="wrap">
        <div className="section-head">
          <Kicker plain>FAQ</Kicker>
          <h2 className="h2 rv-words">
            <Words text={"The questions everyone asks."} />
          </h2>
        </div>
        <div className="faq-list rv">
          {QA.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="qa" data-open={isOpen}>
                <button type="button" aria-expanded={isOpen} aria-controls={`faq-a-${i}`} id={`faq-q-${i}`} onClick={() => setOpen(isOpen ? -1 : i)}>
                  <span>{item.q}</span>
                  <span className="pm" aria-hidden="true" />
                </button>
                <div className="ans" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} aria-hidden={!isOpen}>
                  <div>
                    <p>{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
