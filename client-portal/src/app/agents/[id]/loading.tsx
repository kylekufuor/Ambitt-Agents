import { PortalSkeleton, Sk } from "@/components/skeleton";

export default function Loading() {
  return (
    <PortalSkeleton>
      <div className="max-w-[920px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        <Sk className="h-7 w-48 mb-3" />
        <Sk className="h-4 w-80 max-w-full mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="card p-5">
            <Sk className="h-4 w-1/3 mb-3" />
            <Sk className="h-8 w-1/2" />
          </div>
          <div className="card p-5">
            <Sk className="h-4 w-1/3 mb-3" />
            <Sk className="h-8 w-1/2" />
          </div>
        </div>
        <div className="card p-5 md:p-6">
          <Sk className="h-4 w-1/4 mb-4" />
          <Sk className="h-3 w-full mb-2" />
          <Sk className="h-3 w-5/6 mb-2" />
          <Sk className="h-3 w-2/3" />
        </div>
      </div>
    </PortalSkeleton>
  );
}
