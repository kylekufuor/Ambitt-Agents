// Lightweight loading skeletons. Rendered by each route's loading.tsx so a
// navigation paints INSTANTLY (Next.js streams these while the server component
// fetches) instead of sitting on a blank/frozen page — the "extremely delayed"
// feeling clients reported.
//
// Craft note: these are NOT generic gray blocks. Each shape uses a slow slate
// shimmer sweep (not a flat pulse) over the surface-2 tone, and containers use
// the elevation-based `.card` system — never a flat 1px gray outline, the #1
// AI-slop tell (see DESIGN.md).

/** Shared shimmer keyframes + class. Rendered once at the top of a skeleton
 *  tree; the global @keyframes then drives every <Sk /> on the page. */
export function SkStyles() {
  return (
    <style>{`
      @keyframes sk-shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .sk-shimmer {
        background: linear-gradient(
          100deg,
          var(--surface-2) 24%,
          color-mix(in srgb, var(--surface-2) 55%, #ffffff) 50%,
          var(--surface-2) 76%
        );
        background-size: 200% 100%;
        animation: sk-shimmer 1.7s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .sk-shimmer { animation: none; }
      }
    `}</style>
  );
}

export function Sk({ className = "" }: { className?: string }) {
  return <div className={`sk-shimmer rounded-[8px] ${className}`} aria-hidden />;
}

/** Full-page frame (header bar + content wash) so the skeleton doesn't shift
 *  when the real page — which renders its own header — swaps in. */
export function PortalSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-wash min-h-screen">
      <SkStyles />
      <header className="bg-[color:var(--surface)]/85 backdrop-blur sticky top-0 z-30 shadow-[0_1px_2px_rgba(45,62,80,0.06)]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Sk className="h-5 w-24" />
          <div className="ml-auto">
            <Sk className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

/** A card-shaped skeleton block on the elevation system (no flat border). */
export function CardSk({ className = "", lines = 2 }: { className?: string; lines?: number }) {
  return (
    <div className={`card p-5 ${className}`}>
      <Sk className="h-4 w-1/3 mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Sk key={i} className={`h-3 ${i === lines - 1 ? "w-1/2" : "w-3/4"} mb-2`} />
      ))}
    </div>
  );
}

/** A single skeleton row inside a shared `.card` list — rows are separated by
 *  a hairline divider (tonal), matching the populated list treatment, not a
 *  gray-outlined box per row. Use inside a `<div className="card ...">`. */
export function RowSk({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-4 px-5 py-4">{children}</div>;
}
