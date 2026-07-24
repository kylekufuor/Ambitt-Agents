import { AgentAvatar } from "../agent-avatar";
import { Sheet, Envelope, PaperPlane, Chart, Paperclip, CheckDisc } from "../icons";
import { FileChip } from "./shared";

/* ---------- Nadia: ranked shortlist email + CSV preview ---------- */

const RANK = [
  { addr: "1200 Harbor Industrial Blvd", price: "$4.2M", cap: "7.4%", why: "Below-market rents, lease rolls in 8 mo" },
  { addr: "480 Canal District, Bldg C", price: "$2.85M", cap: "6.9%", why: "Two units vacant — clear value-add" },
  { addr: "91 Freightway, Unit 200", price: "$1.6M", cap: "6.5%", why: "Stabilized, clean, quick close" },
];

const CSV_ROWS = [
  ["1", "1", "1200 Harbor Industrial Blvd", "4,200,000", "7.4"],
  ["2", "2", "480 Canal District, Bldg C", "2,850,000", "6.9"],
  ["3", "3", "91 Freightway, Unit 200", "1,600,000", "6.5"],
  ["4", "4", "26 Depot Row", "3,100,000", "6.2"],
];

function NadiaJob() {
  return (
    <div className="job">
      <div className="job-copy">
        <span className="eyebrow c-indigo">
          <span className="tick" />
          Nadia
        </span>
        <p className="quote">
          &ldquo;I track new listings the moment they hit the platforms your brokers already subscribe to, cross-check
          them against your buy-box, and send you a <b>ranked shortlist every morning</b>{" "}— with the comps and my
          reasoning, in one email. You skim it over coffee and tell me which ones to dig into.&rdquo;
        </p>
        <div className="job-role">
          <span className="ric" style={{ background: "#4f46e51f", color: "#4f46e5" }}>
            <Sheet size={22} />
          </span>
          <span className="rt">
            Nadia <span>· Market research &amp; sourcing</span>
          </span>
        </div>
        <div className="tool-tags">
          <span className="tt">The platforms your brokers subscribe to</span>
          <span className="tt">Google Sheets</span>
          <span className="tt">Gmail</span>
        </div>
      </div>

      <div className="job-art">
        <div className="mail">
          <div className="mail-top">
            <AgentAvatar size={38} color="#4f46e5" />
            <div className="mail-from">
              <div className="fn">Nadia</div>
              <div className="fa">nadia@ambitt.agency</div>
            </div>
            <div className="mail-date">Tue, Jul 21 · 7:02 AM</div>
          </div>
          <div className="mail-subj">Your shortlist — 6 new listings worth a look (Tue)</div>
          <div className="mail-body">
            <p>
              Morning, six new ones cleared your buy-box overnight. Ranked by fit, with comps and my notes. Pulled from
              the listing and market-data platforms your brokers already subscribe to, then cross-checked against your
              Google&nbsp;Sheet.
            </p>
            <table className="rank">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Property</th>
                  <th>Price</th>
                  <th>Cap</th>
                  <th>Why it ranks</th>
                </tr>
              </thead>
              <tbody>
                {RANK.map((r, i) => (
                  <tr key={r.addr}>
                    <td>
                      <span className="rk">{i + 1}</span>
                    </td>
                    <td className="addr">{r.addr}</td>
                    <td>{r.price}</td>
                    <td className="cap">{r.cap}</td>
                    <td className="why">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mini-note">Top 3 shown · full six in the attachment.</p>
            <FileChip
              badge={{ text: "CSV", bg: "var(--teal-deep)" }}
              name="shortlist.csv"
              meta="6 listings · updated 7:01 AM"
            />
            <div className="sign">
              <b>Nadia</b> · reply and tell me which to dig into, I&rsquo;ll pull full comps.
            </div>
          </div>
        </div>

        <div className="csv">
          <div className="csv-top">
            <Paperclip size={15} />
            <span className="nm">shortlist.csv</span>
            <span className="mt">· 6 rows · 5 columns</span>
          </div>
          <table>
            <thead>
              <tr>
                <td className="cc" />
                <td>rank</td>
                <td>property</td>
                <td>price</td>
                <td>cap_rate</td>
              </tr>
            </thead>
            <tbody>
              {CSV_ROWS.map((row) => (
                <tr key={row[0]}>
                  <td className="cc">{row[0]}</td>
                  <td className="num">{row[1]}</td>
                  <td>{row[2]}</td>
                  <td className="num">{row[3]}</td>
                  <td className="num">{row[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- Francis: text thread ---------- */

function FrancisJob() {
  return (
    <div className="job flip">
      <div className="job-copy">
        <span className="eyebrow c-violet">
          <span className="tick" />
          Francis
        </span>
        <p className="quote">
          &ldquo;Before you&rsquo;re online, I&rsquo;ve been through your inbox. I clear the noise, draft replies to the
          ones only you can answer, and tell you what actually needs you today. Text me &lsquo;what&rsquo;s on my
          plate?&rsquo; and you&rsquo;ll have it in a minute — pulled from your <b>Gmail</b> and{" "}
          <b>Google Calendar</b>.&rdquo;
        </p>
        <div className="job-role">
          <span className="ric" style={{ background: "#7c3aed1f", color: "#7c3aed" }}>
            <Envelope size={22} />
          </span>
          <span className="rt">
            Francis <span>· Executive assistant</span>
          </span>
        </div>
        <div className="tool-tags">
          <span className="tt">Gmail</span>
          <span className="tt">Google Calendar</span>
          <span className="tt">Google Docs</span>
        </div>
      </div>

      <div className="job-art">
        <div className="phone">
          <div className="thread-top">
            <AgentAvatar size={40} color="#7c3aed" />
            <div className="who">
              <div className="nm">
                Francis{" "}
                <span className="pill-live">
                  <span className="ld" />
                  Ambitt agent
                </span>
              </div>
              <div className="rl">Executive assistant</div>
            </div>
          </div>
          <div className="thread">
            <div className="bub bub-me">
              what&rsquo;s on my plate today?
              <span className="t">8:05 AM</span>
            </div>
            <div className="bub bub-ag" style={{ maxWidth: "90%" }}>
              <div className="aname">Francis</div>
              Morning. Three things really need <b>you</b> today:
              <br />
              1&nbsp;· Sign off the Q3 budget, Dana&rsquo;s waiting.
              <br />
              2&nbsp;· Call the Henderson account back before 2pm.
              <br />
              3&nbsp;· Approve the new-hire offer (expires Fri).
              <br />
              <br />
              Two replies are drafted and waiting for your ok — Marcus and the vendor. Heads up: your{" "}
              <b>11:00 and 11:30 overlap</b> — want me to move the shorter one?
              <span className="done-row">
                <CheckDisc size={18} bg="var(--violet)" /> Pulled from your Gmail &amp; Google Calendar.
              </span>
              <span className="t">8:06 AM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Reed: "Done" email + lead rows ---------- */

const LEADS = [
  { name: "Priya Nair", co: "Northwind Logistics", st: "Replied · wants a demo", cls: "st-rep" },
  { name: "Marcus Bell", co: "Cedar & Co.", st: "Replied · pricing q", cls: "st-rep" },
  { name: "Dana Osei", co: "Brightline", st: "Draft waiting for your ok", cls: "st-drf" },
];

function ReedJob() {
  return (
    <div className="job">
      <div className="job-copy">
        <span className="eyebrow c-emerald">
          <span className="tick" />
          Reed
        </span>
        <p className="quote">
          &ldquo;Every new lead gets a real follow-up within the hour — not next week when someone remembers. I write it
          in your voice, send it from your <b>Gmail</b>, and log the whole thing in your <b>CRM</b>{" "}so nothing slips.
          You just see the replies come back warm.&rdquo;
        </p>
        <div className="job-role">
          <span className="ric" style={{ background: "#00887a1f", color: "#00887a" }}>
            <PaperPlane size={22} />
          </span>
          <span className="rt">
            Reed <span>· Sales follow-up &amp; lead nurture</span>
          </span>
        </div>
        <div className="tool-tags">
          <span className="tt">HubSpot / Salesforce</span>
          <span className="tt">Gmail</span>
        </div>
      </div>

      <div className="job-art">
        <div className="mail">
          <div className="mail-top">
            <AgentAvatar size={38} color="#00887a" />
            <div className="mail-from">
              <div className="fn">Reed</div>
              <div className="fa">reed@ambitt.agency</div>
            </div>
            <div className="mail-date">Today · 1:12 PM</div>
          </div>
          <div className="mail-subj">&#10003; Done — 8 new leads followed up</div>
          <div className="mail-body">
            <p>
              Followed up with <b>8 new leads</b>. Average 22 minutes from form-fill. <b>3 already replied</b>; I moved
              them to &ldquo;Interested&rdquo; in HubSpot. Drafts for the other 5 are waiting for your ok.
            </p>
            <div style={{ marginTop: 4 }}>
              {LEADS.map((l) => (
                <div className="lead-row" key={l.name}>
                  <div>
                    <div className="lnm">{l.name}</div>
                    <div className="lco">{l.co}</div>
                  </div>
                  <span className={`st ${l.cls}`}>{l.st}</span>
                </div>
              ))}
            </div>
            <FileChip
              icon={<Sheet size={16} style={{ color: "var(--brand)" }} />}
              name="HubSpot"
              meta="8 records updated"
            />
            <div className="sign">
              Written in your voice, sent from your Gmail. — <b>Reed</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Wren: weekly digest email + KPI tiles ---------- */

const KPIS = [
  { lab: "Revenue", val: "$128.4k", dl: "6.2%", lb2: "vs last wk", cls: "up" },
  { lab: "Signups", val: "342", dl: "11%", lb2: "vs last wk", cls: "up" },
  { lab: "Churn", val: "2.1%", dl: "0.4pt", lb2: "worth a look", cls: "warn" },
];

function WrenJob() {
  return (
    <div className="job flip">
      <div className="job-copy">
        <span className="eyebrow c-amber">
          <span className="tick" />
          Wren
        </span>
        <p className="quote">
          &ldquo;Every Monday, last week&rsquo;s numbers are in your inbox before your first meeting — pulled from your
          tools, written up in plain English, with the two things that changed and why they matter. One email. No
          dashboard to open, no report to build. A copy lands in your <b>Slack</b>, too.&rdquo;
        </p>
        <div className="job-role">
          <span className="ric" style={{ background: "#b453091f", color: "#b45309" }}>
            <Chart size={22} />
          </span>
          <span className="rt">
            Wren <span>· Ops &amp; reporting</span>
          </span>
        </div>
        <div className="tool-tags">
          <span className="tt">Your analytics + spreadsheets</span>
          <span className="tt">Slack</span>
        </div>
      </div>

      <div className="job-art">
        <div className="mail">
          <div className="mail-top">
            <AgentAvatar size={38} color="#b45309" />
            <div className="mail-from">
              <div className="fn">Wren</div>
              <div className="fa">wren@ambitt.agency</div>
            </div>
            <div className="mail-date">Mon, Jul 20 · 6:30 AM</div>
          </div>
          <div className="mail-subj">Last week, in one email (Mon)</div>
          <div className="mail-body">
            <p>Last week in one read:</p>
            <div className="kpis">
              {KPIS.map((k) => (
                <div className="kpi" key={k.lab}>
                  <div className="lab">{k.lab}</div>
                  <div className="val">{k.val}</div>
                  <div className={`dl ${k.cls}`}>
                    <span className="arrow">&#9650;</span>
                    {k.dl} <span className="lb2">{k.lb2}</span>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 14 }}>
              Signups jumped after Thursday&rsquo;s launch email. That&rsquo;s most of the lift. Churn ticked up a touch,
              all from the May trial cohort; I&rsquo;d keep an eye on it. Everything else held steady.
            </p>
            <FileChip badge={{ text: "PDF", bg: "var(--rose)" }} name="weekly-report.pdf" meta="4 pages" />
            <div className="sign">
              Full breakdown attached. Anything you want pulled apart, just reply. — <b>Wren</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function JobSections() {
  return (
    <section className="sec" id="what">
      <div className="wrap">
        <div className="jobs-intro">
          <span className="eyebrow">
            <span className="tick" />
            A day with your agent
          </span>
          <h2 className="disp">It doesn&rsquo;t hand you tasks. It hands you the finished&nbsp;thing.</h2>
        </div>
        <NadiaJob />
        <FrancisJob />
        <ReedJob />
        <WrenJob />
      </div>
    </section>
  );
}
