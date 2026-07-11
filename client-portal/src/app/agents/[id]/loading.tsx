import { PortalSkeleton, Sk } from "@/components/skeleton";

export default function Loading() {
  return (
    <PortalSkeleton>
      <div className="max-w-[920px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        {/* back link + hero */}
        <Sk className="h-3 w-32 mb-6 rounded-full" />
        <Sk className="h-3 w-24 mb-3 rounded-full" />
        <Sk className="h-8 w-48 mb-3" />
        <Sk className="h-4 w-96 max-w-full mb-8" />

        {/* headline stat pair */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card p-5">
              <Sk className="h-3 w-1/3 mb-3 rounded-full" />
              <Sk className="h-8 w-1/2 mb-3" />
              <Sk className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>

        {/* configuration section */}
        <div className="card p-5 md:p-6">
          <Sk className="h-4 w-1/4 mb-5" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Sk key={i} className="h-16 rounded-[8px]" />
            ))}
          </div>
          <Sk className="h-3 w-full mb-2" />
          <Sk className="h-3 w-5/6 mb-2" />
          <Sk className="h-3 w-2/3" />
        </div>
      </div>
    </PortalSkeleton>
  );
}
