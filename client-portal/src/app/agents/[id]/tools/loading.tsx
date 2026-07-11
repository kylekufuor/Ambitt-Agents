import { PortalSkeleton, Sk } from "@/components/skeleton";

export default function Loading() {
  return (
    <PortalSkeleton>
      <div className="max-w-[920px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        {/* back link + hero */}
        <Sk className="h-3 w-32 mb-6 rounded-full" />
        <Sk className="h-3 w-24 mb-3 rounded-full" />
        <Sk className="h-8 w-40 mb-3" />
        <Sk className="h-4 w-80 max-w-full mb-8" />

        {/* tools — one card, hairline-divided rows */}
        <div className="card divide-y divide-[color:var(--border)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Sk className="h-[38px] w-[38px] rounded-[11px] shrink-0" />
              <div className="flex-1">
                <Sk className="h-4 w-32 mb-2" />
                <Sk className="h-3 w-48 max-w-full" />
              </div>
              <Sk className="h-8 w-24 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </PortalSkeleton>
  );
}
