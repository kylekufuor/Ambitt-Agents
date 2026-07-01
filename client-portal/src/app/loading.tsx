import { PortalSkeleton, Sk } from "@/components/skeleton";

export default function Loading() {
  return (
    <PortalSkeleton>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        <Sk className="h-7 w-56 mb-3" />
        <Sk className="h-4 w-96 max-w-full mb-10" />
        {/* nav cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4">
              <Sk className="h-9 w-9 rounded-[10px] mb-3" />
              <Sk className="h-4 w-2/3 mb-2" />
              <Sk className="h-3 w-full" />
            </div>
          ))}
        </div>
        {/* agent roster */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-5">
              <Sk className="h-5 w-1/2 mb-2" />
              <Sk className="h-3 w-3/4 mb-6" />
              <Sk className="h-2 w-full mb-3" />
              <Sk className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    </PortalSkeleton>
  );
}
