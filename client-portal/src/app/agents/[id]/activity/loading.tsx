import { PortalSkeleton, Sk } from "@/components/skeleton";

export default function Loading() {
  return (
    <PortalSkeleton>
      <div className="max-w-[820px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        {/* back link + hero */}
        <Sk className="h-3 w-32 mb-6 rounded-full" />
        <Sk className="h-3 w-24 mb-3 rounded-full" />
        <Sk className="h-8 w-40 mb-3" />
        <Sk className="h-4 w-80 max-w-full mb-8" />

        {/* summary stat cards */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4 text-center">
              <Sk className="h-7 w-12 mx-auto mb-3" />
              <Sk className="h-2.5 w-16 mx-auto rounded-full" />
            </div>
          ))}
        </div>

        {/* recent emails — one card, hairline-divided rows */}
        <Sk className="h-5 w-36 mb-4" />
        <div className="card divide-y divide-[color:var(--border)]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <Sk className="h-4 w-2/3 mb-2" />
                <Sk className="h-3 w-2/5" />
              </div>
              <Sk className="h-5 w-16 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </PortalSkeleton>
  );
}
