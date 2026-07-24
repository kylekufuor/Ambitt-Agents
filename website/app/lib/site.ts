/**
 * Site-wide constants.
 *
 * Two CTAs, consistent everywhere (decided by Kyle 2026-07-23):
 *   Primary   = "Book a call"  → BOOKING_URL   (teal fill)
 *   Secondary = "Start now"    → ONBOARD_URL   (ghost)
 */

// TODO(Kyle): drop the real booking link here. We don't have the Calendly/Cal.com
// URL yet — this single constant is the only place to change it.
export const BOOKING_URL = "https://calendly.com/ambitt/intro-call";

// Self-serve onboarding (Atlas funnel). Confirmed live domain per ops memory:
// portal.ambitt.agency serves /onboard.
export const ONBOARD_URL = "https://portal.ambitt.agency/onboard";

export const NAV_LINKS = [
  { href: "#what", label: "What it does" },
  { href: "#agents", label: "Agents" },
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export const CTA = {
  primary: { label: "Book a call", href: BOOKING_URL },
  secondary: { label: "Start now", href: ONBOARD_URL },
} as const;
