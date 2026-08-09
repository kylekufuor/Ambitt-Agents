/* ---------------------------------------------------------------------------
   Section icons — our own duotone set, never a stroke-icon library.

   Same recipe as the rail: a soft filled body at 0.22 under a 1.7 crisp
   stroke, so the glyph reads as an object with weight rather than a wireframe.
   Lucide / Heroicons / Feather are the single most recognisable tell of a
   template, and DESIGN.md rules them out for exactly that reason.

   The icon sits in a tinted disc. Tone follows the section: quiet when the
   section is settled, alert when it is waiting on the client, so the icon
   carries the same signal as the dot and the words rather than being
   decoration beside them.
   --------------------------------------------------------------------------- */

export type IconName = "mail" | "inbox" | "shield" | "signature";

const PATHS: Record<IconName, React.ReactNode> = {
  // His address — an envelope.
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="currentColor" opacity=".22" />
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </>
  ),
  // Who he answers — a tray with mail dropping in, i.e. who gets through.
  inbox: (
    <>
      <path d="M4 13h4l1.2 2.4h5.6L16 13h4v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="currentColor" opacity=".22" />
      <path d="M4 13h4l1.2 2.4h5.6L16 13h4v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 4v6M9.4 7.6 12 10.2l2.6-2.6" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Where login codes go — a shield. This is a security setting, and the glyph
  // should say so before the copy does.
  shield: (
    <>
      <path d="M12 3.5 19 6v5.4c0 4.1-2.8 7.4-7 9.1-4.2-1.7-7-5-7-9.1V6z" fill="currentColor" opacity=".22" />
      <path d="M12 3.5 19 6v5.4c0 4.1-2.8 7.4-7 9.1-4.2-1.7-7-5-7-9.1V6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m9 12 2.1 2.1L15 10.3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // What goes out in your name — a signed line.
  signature: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="currentColor" opacity=".22" />
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 15.2c1.6 0 2-3.4 3.3-3.4 1 0 .9 2.2 2 2.2.9 0 1.2-1.6 2.2-1.6.7 0 .9.9 1.5.9" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <path d="M7.5 8.6h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity=".55" />
    </>
  ),
};

export function SectionIcon({ name, tone = "quiet" }: { name: IconName; tone?: "quiet" | "alert" }) {
  const alert = tone === "alert";
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-[9px]"
      style={{
        width: 34,
        height: 34,
        // The alert disc is a red wash, not a red fill. A saturated red block
        // beside a heading shouts; a tint says "look here" and lets the dot and
        // the label do the telling. --red-tint is the system's own 10% value,
        // already paired with --red for contrast.
        background: alert ? "var(--red-tint)" : "var(--surface-2)",
        color: alert ? "var(--red)" : "var(--text-3)",
      }}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
        {PATHS[name]}
      </svg>
    </span>
  );
}
