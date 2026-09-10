import { AgentAvatar, type AgentName } from "./agent-avatar";

/**
 * An agent's reply as it actually lands: a Gmail thread view, drawn with
 * Google's own Material Symbols paths (the gm-* sprite) and the real Gmail mark.
 *
 * Two load-bearing details, both deliberate:
 *  - The open message stays on a light card in dark mode (the --gm-msg-* tokens
 *    never change with theme). Real Gmail darkens its chrome but never the mail
 *    itself. A fully dark card is the one detail that gives a fake away.
 *  - Icons render through `fill: currentColor`, and their <svg> wrappers carry no
 *    viewBox. Chromium paints a <use> blank when the wrapper repeats a viewBox
 *    with a negative min-y, which is Material Symbols' `0 -960 960 960`.
 */

interface Person {
  initial: string;
  /** Avatar fill, a muted Gmail-style tone. */
  color: string;
}

export interface GmailThreadProps {
  /** Whose inbox this is: the avatar at the top right of the window. */
  viewer: Person;
  subject: string;
  /** The label chip beside the subject. */
  label: string;
  /** The client's earlier message, collapsed above the agent's reply. */
  earlier: Person & { name: string; snippet: string; date: string };
  agent: AgentName;
  /** Unique within the page; see AgentAvatar. */
  avatarUid: string;
  from: { name: string; address: string };
  /** First name, as Gmail shows "to Beau". */
  to: string;
  date: string;
  attachment: { summary: string; name: string; size: string };
  /** The message body: one <p> per paragraph, signed by the agent. */
  children: React.ReactNode;
}

function IconButton({ symbol, className = "gmail-iconbtn", iconClass }: { symbol: string; className?: string; iconClass?: string }) {
  return (
    <span className={className}>
      <svg className={iconClass}>
        <use href={`#gm-${symbol}`} />
      </svg>
    </span>
  );
}

export function GmailThread({ viewer, subject, label, earlier, agent, avatarUid, from, to, date, attachment, children }: GmailThreadProps) {
  return (
    <div className="gmail-embed">
      <div className="gmail-panel">
        <div className="gmail-window">
          <div className="gmail-window__brand">
            <svg viewBox="0 0 256 204">
              <use href="#lgc-gmail" />
            </svg>
            <span>Gmail</span>
          </div>
          <div className="gmail-window__search">
            <svg className="gm-icon">
              <use href="#gm-search" />
            </svg>
            <span>Search in mail</span>
          </div>
          <div className="gmail-window__icons">
            <div className="gmail-window__iconbtn">
              <svg>
                <use href="#gm-settings" />
              </svg>
            </div>
            <div className="gmail-window__iconbtn">
              <svg>
                <use href="#gm-apps" />
              </svg>
            </div>
            <span className="gmail-avatar gmail-avatar--md" style={{ "--gm-av-bg": viewer.color }}>
              {viewer.initial}
            </span>
          </div>
        </div>
        <div className="gmail-thread">
          <div className="gmail-thread__toolbar">
            {["back", "archive", "delete", "mail", "more"].map((s) => (
              <IconButton key={s} symbol={s} iconClass="gm-icon" />
            ))}
          </div>
          <div className="gmail-thread__subject">
            <h3>{subject}</h3>
            <span className="gmail-chip">{label}</span>
          </div>
          <div className="gmail-message--collapsed">
            <span className="gmail-avatar gmail-avatar--sm" style={{ "--gm-av-bg": earlier.color }}>
              {earlier.initial}
            </span>
            <span className="gmail-message__name">{earlier.name}</span>
            <span className="gmail-message__snippet">{earlier.snippet}</span>
            <time>{earlier.date}</time>
          </div>
          <div className="gmail-message--open">
            <div className="gmail-message__card">
              <div className="gmail-message__header">
                <div className="gmail-message__avatar">
                  <AgentAvatar agent={agent} uid={avatarUid} />
                </div>
                <div className="gmail-message__who">
                  <div className="gmail-message__name">
                    {from.name}
                    <span className="addr">{`<${from.address}>`}</span>
                  </div>
                  <button className="gmail-message__to">
                    {`to ${to}`}
                    <svg>
                      <use href="#gm-expand" />
                    </svg>
                  </button>
                </div>
                <div className="gmail-message__meta">
                  <time>{date}</time>
                  <IconButton symbol="star" />
                  <IconButton symbol="reply" />
                  <IconButton symbol="more" />
                </div>
              </div>
              <div className="gmail-message__body">{children}</div>
              <div className="gmail-message__attachments">
                <div className="gmail-attach-label">
                  <svg>
                    <use href="#gm-attach" />
                  </svg>
                  {attachment.summary}
                </div>
                <div className="gmail-attach-row">
                  <div className="gmail-attach-card">
                    <div className="gmail-attach-card__thumb" style={{ "--thumb-bg": "#fce8e6" }}>
                      <svg viewBox="0 0 48 48">
                        <use href="#gm-file-pdf" />
                      </svg>
                    </div>
                    <div className="gmail-attach-card__actions">
                      <button>
                        <svg>
                          <use href="#gm-download" />
                        </svg>
                      </button>
                      <button>
                        <svg viewBox="0 0 256 238">
                          <use href="#lgc-googledrive" />
                        </svg>
                      </button>
                    </div>
                    <div className="gmail-attach-card__info">
                      <div className="gmail-attach-card__name">{attachment.name}</div>
                      <div className="gmail-attach-card__size">{attachment.size}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="gmail-thread__actions">
            <button className="gmail-pill">
              <svg>
                <use href="#gm-reply" />
              </svg>
              Reply
            </button>
            <button className="gmail-pill">
              <svg>
                <use href="#gm-forward" />
              </svg>
              Forward
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
