import { SiteLink } from "./site-link";
/** The Ambitt Agents mark and wordmark, as the masthead and footer carry it. */
export function BrandLockup({
  href,
  style,
  wordStyle,
}: {
  href: string;
  style?: React.CSSProperties;
  wordStyle?: React.CSSProperties;
}) {
  return (
    <SiteLink className="brand" href={href} aria-label="Ambitt Agents, home" style={style}>
      <svg viewBox="0 0 128 116" fill="none" aria-hidden="true" focusable="false">
        <circle cx="64" cy="10" r="8" fill="#00b3b3" />
        <rect x="60" y="16" width="8" height="18" rx="4" fill="#00b3b3" />
        <rect x="6" y="58" width="13" height="30" rx="6.5" fill="#00b3b3" opacity=".8" />
        <rect x="109" y="58" width="13" height="30" rx="6.5" fill="#00b3b3" opacity=".8" />
        <rect x="16" y="32" width="96" height="74" rx="26" fill="#00b3b3" />
        <circle cx="46" cy="70" r="14" fill="var(--card-2)" />
        <circle cx="82" cy="70" r="14" fill="var(--card-2)" />
      </svg>
      <span className="brand-word" style={wordStyle}>
        Ambitt&nbsp;<b>Agents</b>
      </span>
    </SiteLink>
  );
}
