import { PortalSkeleton, Sk } from "@/components/skeleton";

export default function Loading() {
  return (
    <PortalSkeleton>
      <div className="max-w-[1080px] mx-auto px-6 lg:px-10 pt-9 pb-16">
        {/* hero */}
        <Sk className="h-3 w-28 mb-4 rounded-full" />
        <Sk className="h-7 w-64 max-w-full mb-3" />
        <Sk className="h-4 w-96 max-w-full mb-10" />

        {/* nav hub */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-12">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4 flex flex-col gap-2.5">
              <Sk className="h-[38px] w-[38px] rounded-[11px]" />
              <div>
                <Sk className="h-4 w-2/3 mb-2" />
                <Sk className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>

        {/* this-month summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-12">
          <div className="card lg:col-span-2 p-6">
            <div className="flex items-start justify-between gap-6 mb-4">
              <div>
                <Sk className="h-3 w-24 mb-3 rounded-full" />
                <Sk className="h-6 w-40" />
              </div>
              <Sk className="h-8 w-24" />
            </div>
            <Sk className="h-3 w-full mb-2" />
            <Sk className="h-3 w-2/3" />
          </div>
          <div className="card p-6">
            <Sk className="h-3 w-24 mb-3 rounded-full" />
            <Sk className="h-9 w-1/2 mb-3" />
            <Sk className="h-3 w-2/3" />
          </div>
        </div>

        {/* roster */}
        <div className="flex items-baseline justify-between mb-5">
          <Sk className="h-6 w-32" />
          <Sk className="h-3 w-16" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card p-5 pl-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1">
                  <Sk className="h-5 w-1/2 mb-2" />
                  <Sk className="h-3 w-3/4" />
                </div>
                <Sk className="h-5 w-16 rounded-full" />
              </div>
              <Sk className="h-2 w-full rounded-full mb-4" />
              <Sk className="h-3 w-2/5" />
            </div>
          ))}
        </div>
      </div>
    </PortalSkeleton>
  );
}
