// Lightweight loading skeletons. Rendered by each route's loading.tsx so a
// navigation paints INSTANTLY (Next.js streams these while the server component
// fetches) instead of sitting on a blank/frozen page — the "extremely delayed"
// feeling clients reported. Pure Tailwind (animate-pulse), on-brand tokens.

export function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[8px] bg-[color:var(--surface-2)] ${className}`} aria-hidden />;
}

/** Full-page frame (header bar + content wash) so the skeleton doesn't shift
 *  when the real page — which renders its own header — swaps in. */
export function PortalSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-wash min-h-screen">
      <header className="border-b border-[color:var(--border)] bg-[color:var(--surface)]/80 backdrop-blur sticky top-0 z-30">
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

/** A card-shaped skeleton block. */
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
