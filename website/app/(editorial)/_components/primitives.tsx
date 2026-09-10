/**
 * The small repeated pieces of the editorial pages. Each renders exactly the
 * markup the stylesheet was written against; the class names are the contract.
 */

/** A Phosphor duotone glyph from the sprite in sprites.tsx. Colour comes from CSS `color`. */
export type IconName = "arrow" | "attach" | "gate" | "gauge" | "ledger" | "portal";

export function Icon({ name, size, style }: { name: IconName; size?: number; style?: React.CSSProperties }) {
  const box = size ? { width: `${size}px`, height: `${size}px` } : undefined;
  return (
    <svg className="ic" style={style ?? box} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/**
 * One line of a headline that rises out of its own mask. `delay` staggers the
 * lines of a hero headline; below the fold the stylesheet staggers them itself.
 */
export function MaskLine({ delay, children }: { delay?: string; children: React.ReactNode }) {
  return (
    <span className="mask-line">
      <span style={delay ? { transitionDelay: delay, animationDelay: delay } : undefined}>{children}</span>
    </span>
  );
}

/** The short teal rule that draws itself in at the top of a section. */
export function RuleDraw() {
  return (
    <div className="wrap">
      <div className="rule-draw reveal" aria-hidden="true" />
    </div>
  );
}

export function FigCaption({ fig, className, children }: { fig: string; className?: string; children: React.ReactNode }) {
  return (
    <figcaption className={className}>
      <span className="fno">{`Fig. ${fig}`}</span> {children}
    </figcaption>
  );
}

export function PullQuote({ cite, style, children }: { cite: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <blockquote className="pull" style={style}>
      {children}
      <cite>{cite}</cite>
    </blockquote>
  );
}

/** A plain agent email, drawn as an artifact card rather than a mail client. */
export function MailArtifact({ subject, from, children }: { subject: string; from: string; children: React.ReactNode }) {
  return (
    <div className="artifact mail">
      <div className="mail-head">
        <div className="mail-subj">{subject}</div>
        <div className="mail-line">
          <b>From</b> {from}
        </div>
      </div>
      <div className="mail-body">{children}</div>
    </div>
  );
}

// Vendor marks, in the order the plate shows them. Each id is a symbol in the
// logo sprite (sprites.tsx): the official multicolour mark, never redrawn.
const TOOLS = [
  ["gmail", "Gmail"],
  ["googlecalendar", "Calendar"],
  ["googlesheets", "Sheets"],
  ["googledrive", "Drive"],
  ["quickbooks", "QuickBooks"],
  ["xero", "Xero"],
  ["stripe", "Stripe"],
  ["hubspot", "HubSpot"],
  ["notion", "Notion"],
  ["calendly", "Calendly"],
  ["airtable", "Airtable"],
  ["asana", "Asana"],
  ["trello", "Trello"],
  ["dropbox", "Dropbox"],
  ["zapier", "Zapier"],
  ["zoom", "Zoom"],
  ["shopify", "Shopify"],
] as const;

export function ToolPlate({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="plate" role="list" aria-label="Tools agents can connect to" style={style}>
      {TOOLS.map(([id, label]) => (
        <span key={id} className="plate-item" role="listitem">
          <svg className="brandmark" viewBox="0 0 24 24">
            <use href={`#lgc-${id}`} />
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}
