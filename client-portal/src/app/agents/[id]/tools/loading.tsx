import { PortalSkeleton, Sk } from "@/components/skeleton";

export default function Loading() {
  return (
    <PortalSkeleton>
      <div className="max-w-[920px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        <Sk className="h-7 w-40 mb-3" />
        <Sk className="h-4 w-80 max-w-full mb-8" />
        <ul className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rounded-lg border border-[color:var(--border)] bg-white px-4 py-3 flex items-center gap-3">
              <Sk className="h-9 w-9 rounded-[10px]" />
              <div className="flex-1">
                <Sk className="h-4 w-32 mb-2" />
                <Sk className="h-3 w-48" />
              </div>
              <Sk className="h-7 w-20 rounded-md" />
            </li>
          ))}
        </ul>
      </div>
    </PortalSkeleton>
  );
}
