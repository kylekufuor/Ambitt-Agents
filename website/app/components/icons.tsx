/**
 * Custom duotone icon set — transcribed verbatim from the approved mockup.
 * Never Lucide/Heroicons/Feather, never emoji. Color follows `currentColor`.
 */
import type { CSSProperties } from "react";

type IconProps = { size?: number; className?: string; style?: CSSProperties };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  "aria-hidden": true,
  focusable: false as const,
});

export function Paperclip({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path
        d="M18 9.3 10.3 17a3.3 3.3 0 0 1-4.7-4.7l7.5-7.5a2.1 2.1 0 0 1 3 3l-7.2 7.2a.9.9 0 0 1-1.3-1.3l6.5-6.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sheet({ size = 22, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <rect x="3.5" y="5" width="17" height="14" rx="3" fill="currentColor" opacity="0.2" />
      <rect x="3.5" y="5" width="17" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M4 9.5h16" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 9.5V19" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10" y="11.5" width="7.5" height="1.8" rx="0.9" fill="currentColor" />
      <rect x="10" y="15" width="5" height="1.8" rx="0.9" fill="currentColor" opacity="0.6" />
      <path d="M6 7.4h3a.7.7 0 0 1 0 1.4H6a.7.7 0 0 1 0-1.4Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function Envelope({ size = 22, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <rect x="3.2" y="5.5" width="17.6" height="13" rx="3.2" fill="currentColor" opacity="0.2" />
      <rect x="3.2" y="5.5" width="17.6" height="13" rx="3.2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M4.5 7.8 12 13l7.5-5.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M6 7.3h3.4a.7.7 0 0 1 0 1.4H6a.7.7 0 0 1 0-1.4Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function PaperPlane({ size = 22, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path
        d="M4.2 11.4 19 5.2a.9.9 0 0 1 1.2 1.1l-3.5 12.4a1 1 0 0 1-1.75.33L12.5 15l-2.9 2.3a.6.6 0 0 1-.97-.47v-3.1L18 6.9 8.9 12.6l-4.5-1.2Z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M20.5 5.1a.95.95 0 0 0-1-.2L3.9 10.6a.9.9 0 0 0 .06 1.7l4.4 1.28 1.5 4.35a.9.9 0 0 0 1.6.2l2.1-2.85 3.2 2.32a.95.95 0 0 0 1.5-.55l2.5-11.2a.95.95 0 0 0-.26-.9ZM9.7 12.9l7.3-4.9-5.9 6.1-.1 2-1.3-3.2Z"
        fill="currentColor"
      />
      <path d="M16.5 6.2 8.6 11.5l-1.2-.35L16 5.9a.6.6 0 0 1 .5.3Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function Chart({ size = 22, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="4" fill="currentColor" opacity="0.2" />
      <path d="M5.5 12.5h2.2l2-5.2 3 9.4 2.2-6.1 1.3 1.9h2.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M6 6.6h3.4a.7.7 0 0 1 0 1.4H6a.7.7 0 0 1 0-1.4Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function ShieldCheck({ size = 20, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M12 3.4 5.6 5.9v5.3c0 4 2.7 7 6.4 8.4 3.7-1.4 6.4-4.4 6.4-8.4V5.9L12 3.4Z" fill="currentColor" opacity="0.2" />
      <path
        d="M11.64 3.47 5.24 5.97A1 1 0 0 0 4.6 6.9v4.3c0 4.5 3.05 7.86 7.05 9.4a1 1 0 0 0 .7 0c4-1.54 7.05-4.9 7.05-9.4V6.9a1 1 0 0 0-.64-.93l-6.4-2.5a1 1 0 0 0-.72 0Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
      <path d="m9.2 11.8 2 2 3.6-3.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M7.5 6.6 10 5.6a.7.7 0 0 1 .5 1.3l-2.5 1a.7.7 0 0 1-.5-1.3Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function SearchShine({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <circle cx="8.4" cy="8.6" r="4.8" fill="currentColor" opacity="0.2" />
      <circle cx="8.4" cy="8.6" r="3.4" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M11 11.1 18.3 18.4M15.6 15.7l1.5-1.5M17.5 17.6l1.6-1.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.6 6.3a1.9 1.9 0 0 1 2-.46.7.7 0 0 1-.5 1.3 1 1 0 0 0-1.05.24.7.7 0 0 1-1-.98l.55-.1Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function Lock({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <rect x="4.8" y="10.2" width="14.4" height="9.2" rx="3" fill="currentColor" opacity="0.2" />
      <path d="M8 10.2V8.2a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="2" fill="none" />
      <rect x="4.8" y="10.2" width="14.4" height="9.2" rx="3" fill="currentColor" />
      <circle cx="12" cy="14" r="1.7" fill="#fff" />
      <rect x="11.2" y="14.4" width="1.6" height="3" rx="0.8" fill="#fff" />
      <path d="M7 11.4h3a.7.7 0 0 1 0 1.4H7a.7.7 0 0 1 0-1.4Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function Journal({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M6 4.6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v14.7a.5.5 0 0 1-.74.44L16 18.8l-1.6.9-1.6-.9-1.6.9-1.6-.9-1.86 1.04A.5.5 0 0 1 6 19.3V4.6Z" fill="currentColor" opacity="0.2" />
      <path
        d="M7.5 3.2A1.8 1.8 0 0 0 5.7 5v14.4a1.1 1.1 0 0 0 1.63.96l1.6-.88 1.57.86a1 1 0 0 0 .96 0l1.44-.79 1.44.79a1 1 0 0 0 .96 0l1.6-.87 1.5.82A1.1 1.1 0 0 0 20 18.4V5a1.8 1.8 0 0 0-1.8-1.8H7.5Zm0 1.8h10.7a.1.1 0 0 1 .1.1v12.7l-.9-.49a1 1 0 0 0-.96 0l-1.6.87-1.44-.79a1 1 0 0 0-.96 0l-1.44.79-1.57-.86a1 1 0 0 0-.96 0l-.98.54V5.1a.1.1 0 0 1 .1-.1Z"
        fill="currentColor"
      />
      <rect x="8.6" y="7.4" width="6.8" height="1.7" rx="0.85" fill="currentColor" />
      <rect x="8.6" y="10.6" width="4.6" height="1.7" rx="0.85" fill="currentColor" opacity="0.6" />
      <path d="M8 5.6h3a.7.7 0 0 1 0 1.4H8a.7.7 0 0 1 0-1.4Z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function Chevron({ size = 20, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M6 9.5 12 15l6-5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Menu({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Close({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Colored disc with a white check inside. */
export function CheckDisc({ size = 18, bg = "var(--brand)", check = 12 }: { size?: number; bg?: string; check?: number }) {
  return (
    <span className="ckdisc" style={{ width: size, height: size, background: bg }}>
      <svg viewBox="0 0 24 24" width={check} height={check} aria-hidden focusable={false}>
        <path d="M5 12.5l4 4 10-10.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
