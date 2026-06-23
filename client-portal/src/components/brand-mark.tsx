/**
 * Ambitt Agents brand marks — the friendly robot head, inline JSX so it
 * renders even when the CDN blips and recolors with brand tokens.
 *   <BrandLockup />   — three robots + wordmark, used in headers
 *   <AgentAvatar />   — single robot in a teal disc, used as a profile photo
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
  const robotW = Math.round(height * 1.18);
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="inline-flex items-end" style={{ gap: Math.max(1, Math.round(height * 0.06)) }}>
        <Robot width={robotW} />
        <Robot width={robotW} />
        <Robot width={robotW} />
      </span>
      <span
        className="font-display tracking-tight font-semibold"
        style={{ color: "var(--text)", fontSize: Math.round(height * 0.75) }}
      >
        Ambitt
        <span style={{ color: "var(--brand)" }}> Agents</span>
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
