/**
 * Ambitt lockup — a single, legibly-sized agent head + wordmark.
 *
 * Design note (Kyle, 2026-07-23): the mockup's three miniature heads read as an
 * unidentifiable smudge at nav scale. Recomposited to ONE larger agent head (the
 * brand mark) next to the wordmark so a first-time visitor immediately clocks
 * "that's a little agent." Used in the header and the footer.
 */

function AgentHead({ size = 30, body, eye }: { size?: number; body: string; eye: string }) {
  const w = Math.round((size * 128) / 116);
  return (
    <svg
      className="lockup-mark"
      width={w}
      height={size}
      viewBox="0 0 128 116"
      fill="none"
      aria-hidden
      focusable={false}
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

export function AmbittLogo({
  variant = "light",
  size = 30,
}: {
  variant?: "light" | "reverse";
  size?: number;
}) {
  const light = variant === "light";
  return (
    <span className="lockup">
      <AgentHead
        size={size}
        body={light ? "#00b3b3" : "#ffffff"}
        eye={light ? "#ffffff" : "#0e2233"}
      />
      <span
        className="lockup-word"
        style={
          light
            ? ({ "--am": "#1b2e40", "--ag": "#00b3b3" } as React.CSSProperties)
            : ({ "--am": "#ffffff", "--ag": "#00d4d4" } as React.CSSProperties)
        }
      >
        Ambitt&nbsp;<b>Agents</b>
      </span>
    </span>
  );
}
