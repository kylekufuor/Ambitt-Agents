/**
 * Ambitt icon set — bespoke DUOTONE icons with depth (not Lucide/Heroicons).
 *
 * Each icon layers: a soft filled "body" (currentColor @ low opacity) + crisp
 * foreground detail (currentColor) + a white highlight for a lit, dimensional
 * feel. Color is driven by `currentColor`, so the parent chip's accent flows
 * through. Rounded, friendly geometry to echo the Ambitt robot mark.
 *
 * Server-safe (no hooks, no gradient-id collisions).
 */

import type { SVGProps } from "react";

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, "width" | "height">;

function Svg({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      {children}
    </svg>
  );
}

// A small top-left "lit" highlight shared by every icon for consistent depth.
function Hi({ d }: { d: string }) {
  return <path d={d} fill="#ffffff" opacity="0.55" />;
}

export function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 11.2 12 4.5l8 6.7V19a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19v-7.8Z" fill="currentColor" opacity="0.2" />
      <path d="M3.3 11.4a1 1 0 0 1 .35-.77l7.7-6.45a1 1 0 0 1 1.3 0l7.7 6.45a1 1 0 0 1-1.3 1.53L12 6.3l-6.75 5.86a1 1 0 0 1-1.95-.76Z" fill="currentColor" />
      <rect x="10" y="14" width="4" height="6.4" rx="1" fill="currentColor" />
      <Hi d="M6.4 11.2 12 6.5l1.2 1-5.4 4.6a1 1 0 0 1-1.4-.9Z" />
    </Svg>
  );
}

export function ToolsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6" y="9" width="12" height="9" rx="3.4" fill="currentColor" opacity="0.2" />
      <path d="M9 4.5v4M15 4.5v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.2 9.2A3 3 0 0 1 9 7.5h6a3 3 0 0 1 2.8 1.7 1 1 0 0 1-.9 1.4H7.1a1 1 0 0 1-.9-1.4Z" fill="currentColor" />
      <path d="M9 11v3.2a3 3 0 0 0 6 0V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M12 17.2v2.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <Hi d="M9 5v3a.7.7 0 0 1-1.4 0V5a.7.7 0 0 1 1.4 0Z" />
    </Svg>
  );
}

export function LeadsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="14" rx="3" fill="currentColor" opacity="0.2" />
      <rect x="3.5" y="5" width="17" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M4 9.5h16" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 9.5V19" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10" y="11.5" width="7.5" height="1.8" rx="0.9" fill="currentColor" />
      <rect x="10" y="15" width="5" height="1.8" rx="0.9" fill="currentColor" opacity="0.6" />
      <Hi d="M6 7.4h3a.7.7 0 0 1 0 1.4H6a.7.7 0 0 1 0-1.4Z" />
    </Svg>
  );
}

export function ActivityIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="4" fill="currentColor" opacity="0.2" />
      <path d="M5.5 12.5h2.2l2-5.2 3 9.4 2.2-6.1 1.3 1.9h2.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Hi d="M6 6.6h3.4a.7.7 0 0 1 0 1.4H6a.7.7 0 0 1 0-1.4Z" />
    </Svg>
  );
}

export function ConfigureIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="4" fill="currentColor" opacity="0.2" />
      <path d="M6 8.5h12M6 15.5h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9.5" cy="8.5" r="2.6" fill="currentColor" />
      <circle cx="9.5" cy="8.5" r="1.05" fill="#fff" />
      <circle cx="15" cy="15.5" r="2.6" fill="currentColor" />
      <circle cx="15" cy="15.5" r="1.05" fill="#fff" />
      <Hi d="M9.5 6.4a.8.8 0 0 1 .55 1.37.8.8 0 0 1-1.32-.6.8.8 0 0 1 .77-.77Z" />
    </Svg>
  );
}

export function ChatIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9.2A4.2 4.2 0 0 1 8.2 5h7.6A4.2 4.2 0 0 1 20 9.2v3.4a4.2 4.2 0 0 1-4.2 4.2H10l-3.4 2.7A1 1 0 0 1 5 18.7v-2a4.2 4.2 0 0 1-1-2.7V9.2Z" fill="currentColor" opacity="0.2" />
      <path d="M4 9.2A4.2 4.2 0 0 1 8.2 5h7.6A4.2 4.2 0 0 1 20 9.2v3.4a4.2 4.2 0 0 1-4.2 4.2H10l-3.4 2.7A1 1 0 0 1 5 18.7v-2a4.2 4.2 0 0 1-1-2.7V9.2Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <circle cx="9" cy="11" r="1.15" fill="currentColor" />
      <circle cx="12" cy="11" r="1.15" fill="currentColor" />
      <circle cx="15" cy="11" r="1.15" fill="currentColor" />
      <Hi d="M8.2 6.4h3a.7.7 0 0 1 0 1.4h-3a.7.7 0 0 1 0-1.4Z" />
    </Svg>
  );
}

export function CommunicationIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.2 11.4 19 5.2a.9.9 0 0 1 1.2 1.1l-3.5 12.4a1 1 0 0 1-1.75.33L12.5 15l-2.9 2.3a.6.6 0 0 1-.97-.47v-3.1L18 6.9 8.9 12.6l-4.5-1.2Z" fill="currentColor" opacity="0.2" />
      <path d="M20.5 5.1a.95.95 0 0 0-1-.2L3.9 10.6a.9.9 0 0 0 .06 1.7l4.4 1.28 1.5 4.35a.9.9 0 0 0 1.6.2l2.1-2.85 3.2 2.32a.95.95 0 0 0 1.5-.55l2.5-11.2a.95.95 0 0 0-.26-.9ZM9.7 12.9l7.3-4.9-5.9 6.1-.1 2-1.3-3.2Z" fill="currentColor" />
      <Hi d="M16.5 6.2 8.6 11.5l-1.2-.35L16 5.9a.6.6 0 0 1 .5.3Z" />
    </Svg>
  );
}

export function KnowledgeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H16a3 3 0 0 1 3 3v11a1.5 1.5 0 0 1-1.5 1.5H7a2 2 0 0 1-2-2V5.5Z" fill="currentColor" opacity="0.2" />
      <path d="M7 4.6A2 2 0 0 0 5 6.6V18a2 2 0 0 0 2 2h10.2a1 1 0 0 0 1-1V7a3 3 0 0 0-3-3H7Zm0 2h8a1 1 0 0 1 1 1v11H7a.8.8 0 0 1 0-1.6h7.2a1 1 0 0 0 0-2H7a2.6 2.6 0 0 0-.9.16V7a.4.4 0 0 1 .4-.4Z" fill="currentColor" />
      <rect x="8.4" y="8.4" width="6" height="1.7" rx="0.85" fill="currentColor" />
      <rect x="8.4" y="11.3" width="4.4" height="1.7" rx="0.85" fill="currentColor" opacity="0.6" />
      <Hi d="M7.2 6.7H10a.7.7 0 0 1 0 1.4H7.2a.7.7 0 0 1 0-1.4Z" />
    </Svg>
  );
}

export function MailIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.2" y="5.5" width="17.6" height="13" rx="3.2" fill="currentColor" opacity="0.2" />
      <rect x="3.2" y="5.5" width="17.6" height="13" rx="3.2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M4.5 7.8 12 13l7.5-5.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Hi d="M6 7.3h3.4a.7.7 0 0 1 0 1.4H6a.7.7 0 0 1 0-1.4Z" />
    </Svg>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.4 5.6 5.9v5.3c0 4 2.7 7 6.4 8.4 3.7-1.4 6.4-4.4 6.4-8.4V5.9L12 3.4Z" fill="currentColor" opacity="0.2" />
      <path d="M11.64 3.47 5.24 5.97A1 1 0 0 0 4.6 6.9v4.3c0 4.5 3.05 7.86 7.05 9.4a1 1 0 0 0 .7 0c4-1.54 7.05-4.9 7.05-9.4V6.9a1 1 0 0 0-.64-.93l-6.4-2.5a1 1 0 0 0-.72 0Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="m9.2 11.8 2 2 3.6-3.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Hi d="M7.5 6.6 10 5.6a.7.7 0 0 1 .5 1.3l-2.5 1a.7.7 0 0 1-.5-1.3Z" />
    </Svg>
  );
}

export function SparkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5c.6 3.7 1.8 5 5.5 5.6-3.7.6-4.9 1.9-5.5 5.6-.6-3.7-1.8-5-5.5-5.6 3.7-.6 4.9-1.9 5.5-5.6Z" fill="currentColor" opacity="0.25" />
      <path d="M12 3c.7 4 2 5.3 6 6-4 .7-5.3 2-6 6-.7-4-2-5.3-6-6 4-.7 5.3-2 6-6Z" fill="currentColor" />
      <path d="M18 14.5c.3 1.7.8 2.2 2.5 2.5-1.7.3-2.2.8-2.5 2.5-.3-1.7-.8-2.2-2.5-2.5 1.7-.3 2.2-.8 2.5-2.5Z" fill="currentColor" opacity="0.7" />
      <Hi d="M11 5.5c.3.9.6 1.4 1.3 1.8-.9.3-1.4.7-1.8 1.5-.2-1-.4-1.6-1-2 .6-.3 1.1-.7 1.5-1.3Z" />
    </Svg>
  );
}
