import type { StaticImageData } from "next/image";
import bookkeeping from "../_assets/photos/bookkeeping.webp";
import commercialRealEstate from "../_assets/photos/commercial-real-estate.webp";
import hero from "../_assets/photos/hero.webp";
import homeServices from "../_assets/photos/home-services.webp";
import taxAccounting from "../_assets/photos/tax-accounting.webp";
import firstrun from "../_assets/portal/firstrun.webp";
import homeFunnel from "../_assets/portal/home-funnel.webp";
import homeLeads from "../_assets/portal/home-leads.webp";

/*
 * Imported rather than served from public/, so each file ships under a
 * content-hashed URL with an immutable cache header, and a missing file fails
 * the build instead of a visitor's page. See PHOTOS.md and PORTAL.md in the
 * design notes for where each came from and why it was chosen.
 */
export const PHOTOS = { hero, homeServices, commercialRealEstate, taxAccounting, bookkeeping } satisfies Record<string, StaticImageData>;
export type PhotoName = keyof typeof PHOTOS;

/** Real portal screenshots. The client in them is fictional; never caption them as a customer. */
export const SHOTS = { homeFunnel, homeLeads, firstrun } satisfies Record<string, StaticImageData>;
export type ShotName = keyof typeof SHOTS;

/**
 * A full-bleed photograph settled into the background of a section, with a
 * short caption. Atmosphere only: no photo is ever captioned as a client.
 * Position, caption width, opacity and blur are tuned per plate through the
 * stylesheet's custom properties (--pos, --cap-w, --photo-op, --photo-blur).
 */
export function PhotoPlate({
  photo,
  breakout,
  style,
  children,
}: {
  photo: PhotoName;
  /** Escape the .wrap it sits in and run the full width of the viewport. */
  breakout?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={breakout ? "photo-plate breakout" : "photo-plate"}
      style={{ "--photo-src": `url(${PHOTOS[photo].src})`, ...style }}
    >
      <div className="wrap">
        <p className="photo-cap">{children}</p>
      </div>
    </div>
  );
}

/** A real portal screenshot: evidence, so crisp and full colour, never run through the photo treatment. */
export function PortalShot({ shot, className, style }: { shot: ShotName; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className ? `shot ${className}` : "shot"}
      style={{ "--shot-src": `url(${SHOTS[shot].src})`, ...style }}
    />
  );
}
