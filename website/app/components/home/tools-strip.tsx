import { ShieldCheck } from "../icons";

const TOOLS = [
  "Gmail",
  "Google Calendar",
  "Google Sheets",
  "Slack",
  "HubSpot",
  "Salesforce",
  "Notion",
  "QuickBooks",
  "Stripe",
];

export function ToolsStrip() {
  return (
    <section className="tools-band" id="tools">
      <div className="wrap">
        <div className="tools-grid">
          <div className="tools-head">
            <span className="eyebrow">
              <span className="tick" />
              Works where you already work
            </span>
            <h2 className="disp">Your agent. Your logins. Your&nbsp;tools.</h2>
            <p className="tools-body">
              No new software to buy. No migration. Your agent signs in with your own accounts, under your direction,
              and does the work right inside the tools your team already uses every day.
            </p>
            <div className="objline">
              <ShieldCheck size={20} />
              Nothing to install. Nothing to move. Nothing new to learn.
            </div>
          </div>
          <div className="tok-row">
            {TOOLS.map((t) => (
              <span className="tok" key={t}>
                <span className="nd" />
                {t}
              </span>
            ))}
            <span className="tok tok-more">+ hundreds more</span>
          </div>
        </div>
      </div>
    </section>
  );
}
