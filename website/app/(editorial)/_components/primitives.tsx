import { SiteLink } from "./site-link";
/**
 * The small repeated pieces of the site. Each renders exactly the markup the
 * stylesheet was written against; the class names are the contract.
 */
import { Ic, type IconName as PhName } from "./icons";

/** A Phosphor duotone glyph from the older sprite in sprites.tsx (the cases page still uses these). */
export type IconName = "arrow" | "attach" | "gate" | "gauge" | "ledger" | "portal";

export function Icon({ name, size, style }: { name: IconName; size?: number; style?: React.CSSProperties }) {
  const box = size ? { width: `${size}px`, height: `${size}px` } : undefined;
  return (
    <svg className="ic" style={style ?? box} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** A mono, uppercase section label with the teal dot. */
export function Kicker({ children, plain, className }: { children: React.ReactNode; plain?: boolean; className?: string }) {
  return <p className={["kicker", plain ? "plain" : "", className ?? ""].join(" ").trim()}>{children}</p>;
}

/**
 * A headline split into words so each can blur in on its own (Xtract's hero,
 * Seonovu's scroll reveals). `text` may contain "\n" for a forced line break;
 * `accent` names one word to set in teal. Index `--i` drives the stagger.
 */
export function Words({ text, accent, className, t0 }: { text: string; accent?: string; className?: string; t0?: string }) {
  const lines = text.split("\n");
  let i = 0;
  return (
    <span className={className} style={t0 ? { "--t0": t0 } : undefined}>
      {lines.map((line, li) => (
        <span key={li} style={{ display: "contents" }}>
          {line.split(" ").map((w, wi) => {
            const idx = i++;
            const isAccent = accent !== undefined && w.replace(/[.,!?:;]/g, "") === accent;
            return (
              <span key={wi} style={{ display: "contents" }}>
                {wi > 0 ? " " : ""}
                <span className="w" style={{ "--i": idx }}>
                  <span className={isAccent ? "accent" : undefined}>{w}</span>
                </span>
              </span>
            );
          })}
          {li < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </span>
  );
}

/** A button whose label rolls up on hover (Xtract). */
export function Btn({
  href,
  children,
  kind = "primary",
  size,
  icon,
  className,
}: {
  href: string;
  children: string;
  kind?: "primary" | "ghost";
  size?: "lg" | "sm";
  icon?: PhName;
  className?: string;
}) {
  return (
    <SiteLink href={href} className={["btn", `btn-${kind}`, size ? `btn-${size}` : "", className ?? ""].join(" ").trim()}>
      <span className="roll">
        <span>{children}</span>
        <span aria-hidden="true">{children}</span>
      </span>
      {icon ? <Ic name={icon} /> : null}
    </SiteLink>
  );
}

/** One line of a headline. Kept for the cases page; the mask is gone, the line stays. */
export function MaskLine({ delay, children }: { delay?: string; children: React.ReactNode }) {
  return (
    <span className="mask-line">
      <span style={delay ? { animationDelay: delay } : undefined}>{children}</span>
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

// Vendor marks, in the order the site shows them. Each id is a symbol in the
// logo sprite (sprites.tsx): the official multicolour mark, never redrawn.
export const TOOLS = [
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

export function BrandMark({ id }: { id: (typeof TOOLS)[number][0] }) {
  return (
    <svg className="brandmark" viewBox="0 0 24 24">
      <use href={`#lgc-${id}`} />
    </svg>
  );
}

/** Seonovu's integration grid: one tile per vendor. */
export function ToolTiles() {
  return (
    <div className="tiles" role="list" aria-label="Tools agents can connect to">
      {TOOLS.map(([id, label]) => (
        <div key={id} className="tile" role="listitem">
          <BrandMark id={id} />
          {label}
        </div>
      ))}
    </div>
  );
}
