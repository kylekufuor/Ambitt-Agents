import { PortalSkeleton, Sk } from "@/components/skeleton";

export default function Loading() {
  return (
    <PortalSkeleton>
      <div className="max-w-[920px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        <Sk className="h-7 w-32 mb-3" />
        <Sk className="h-4 w-72 max-w-full mb-8" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-[color:var(--border)] bg-white px-4 py-3 flex items-center gap-4">
              <Sk className="h-4 w-40" />
              <Sk className="h-4 w-24 ml-auto" />
              <Sk className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </PortalSkeleton>
  );
}
