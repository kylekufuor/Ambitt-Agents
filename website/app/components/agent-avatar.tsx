/**
 * Circular agent avatar — a filled disc in the agent's accent color with the
 * little robot head knocked out in white. Transcribed from the mockup.
 * Reused across the hero, deliverable emails, the roster, proof + founder.
 */
export function AgentAvatar({ size = 40, color = "#00b3b3" }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} style={{ color }} aria-hidden focusable={false}>
      <circle cx="128" cy="128" r="128" fill="currentColor" />
      <g transform="translate(48,52) scale(1.25)">
        <circle cx="64" cy="10" r="8" fill="#fff" />
        <rect x="60" y="16" width="8" height="18" rx="4" fill="#fff" />
        <rect x="6" y="58" width="13" height="30" rx="6.5" fill="#fff" opacity="0.85" />
        <rect x="109" y="58" width="13" height="30" rx="6.5" fill="#fff" opacity="0.85" />
        <rect x="16" y="32" width="96" height="74" rx="26" fill="#fff" />
        <circle cx="46" cy="70" r="14" fill="currentColor" />
        <circle cx="82" cy="70" r="14" fill="currentColor" />
      </g>
    </svg>
  );
}
