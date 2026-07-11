import { PortalSkeleton, Sk } from "@/components/skeleton";

export default function Loading() {
  return (
    <PortalSkeleton>
      <div className="max-w-[920px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        {/* back link + hero */}
        <Sk className="h-3 w-32 mb-6 rounded-full" />
        <Sk className="h-3 w-24 mb-3 rounded-full" />
        <Sk className="h-8 w-32 mb-3" />
        <Sk className="h-4 w-80 max-w-full mb-7" />

        {/* status summary chips */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Sk key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>

        {/* lead cards */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <Sk className="h-4 w-40 mb-2" />
                  <Sk className="h-3 w-28" />
                </div>
                <Sk className="h-6 w-16 rounded-full" />
              </div>
              <Sk className="h-3 w-2/3 mb-3" />
              <div className="flex gap-1.5 pt-3 border-t border-[color:var(--border)]">
                <Sk className="h-3 w-20" />
                <Sk className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PortalSkeleton>
  );
}
