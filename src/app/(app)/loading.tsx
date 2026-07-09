import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-8">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2.5 h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="size-10" />
            <Skeleton className="mt-4 h-4 w-24" />
            <Skeleton className="mt-2 h-7 w-16" />
          </Card>
        ))}
      </div>
      <Card className="mt-8 overflow-hidden">
        <div className="border-b border-edge px-5 py-4">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
