import type { ReactNode } from "react";
import { Paperclip } from "../icons";
import { CTA } from "../../lib/site";

/** Primary "Book a call" (teal) + secondary "Start now" (ghost), consistent sitewide. */
export function CtaPair({ size = "lg", className }: { size?: "lg" | "sm"; className?: string }) {
  const lg = size === "lg" ? " btn-lg" : "";
  return (
    <div className={className}>
      <a className={`btn btn-primary${lg}`} href={CTA.primary.href}>
        {CTA.primary.label}
      </a>
      <a className={`btn btn-ghost${lg}`} href={CTA.secondary.href}>
        {CTA.secondary.label}
      </a>
    </div>
  );
}

/** Attachment chip — a text badge (CSV/PDF) or a lead-in icon. */
export function FileChip({
  badge,
  icon,
  name,
  meta,
}: {
  badge?: { text: string; bg: string };
  icon?: ReactNode;
  name: string;
  meta: string;
}) {
  return (
    <span className="file-chip">
      <span className="fx-clip">
        <Paperclip size={15} />
      </span>
      {badge ? (
        <span className="fx-badge" style={{ background: badge.bg }}>
          {badge.text}
        </span>
      ) : null}
      {icon ? <span className="fx-ico">{icon}</span> : null}
      <span className="fx-name">{name}</span>
      <span className="fx-meta">{meta}</span>
    </span>
  );
}
