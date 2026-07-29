/**
 * Ambitt Agents brand marks — the friendly robot head, inline JSX so it
 * renders even when the CDN blips and recolors with brand tokens.
 *   <BrandLockup />   — ONE legible robot + wordmark, used in headers
 *   <AgentAvatar />   — single robot in a teal disc, used as a profile photo
 *
 * One head, not three (Kyle, 2026-07-23): at lockup scale three miniature
 * heads read as an unidentifiable smudge. The head IS the identity, so it has
 * to be big enough that a first-time viewer immediately clocks "that's a
 * little agent". The marketing site made this change then; the portal had been
 * left on the old three-head composition, so the two surfaces disagreed.
 */

/** The robot glyph. Body uses `body`, the eyes use `eye`. */
function Robot({
  width = 26,
  body = "#00b3b3",
  eye = "#ffffff",
}: {
  width?: number;
  body?: string;
  eye?: string;
}) {
  const height = (width * 116) / 128;
  return (
    <svg
      viewBox="0 0 128 116"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ display: "block" }}
    >
      <circle cx="64" cy="10" r="8" fill={body} />
      <rect x="60" y="16" width="8" height="18" rx="4" fill={body} />
      <rect x="6" y="58" width="13" height="30" rx="6.5" fill={body} opacity="0.8" />
      <rect x="109" y="58" width="13" height="30" rx="6.5" fill={body} opacity="0.8" />
      <rect x="16" y="32" width="96" height="74" rx="26" fill={body} />
      <circle cx="46" cy="70" r="14" fill={eye} />
      <circle cx="82" cy="70" r="14" fill={eye} />
    </svg>
  );
}

export function BrandLockup({ height = 22, className = "" }: { height?: number; className?: string }) {
  // One head, sized to the cap-height of the wordmark rather than shrunk to
  // fit three across. Same ratio the marketing site's lockup uses.
  const robotW = Math.round(height * 1.45);
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <Robot width={robotW} />
      <span
        className="font-display tracking-tight font-semibold"
        style={{ color: "var(--text)", fontSize: Math.round(height * 0.85) }}
      >
        Ambitt
        {/* Live text, so it takes the ink step — same call the agent-email
            footer makes. The robot beside it carries the logo teal itself. */}
        <span style={{ color: "var(--brand-ink)" }}> Agents</span>
      </span>
    </div>
  );
}

/** Single robot in a teal disc — the agent's profile photo. */
export function AgentAvatar({ size = 44, ring = "#00b3b3" }: { size?: number; ring?: string }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: ring,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Robot width={Math.round(size * 0.62)} body="#ffffff" eye={ring} />
    </span>
  );
}
