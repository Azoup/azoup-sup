import { Skeleton } from '@/components/ui/skeleton';

export function KanbanSkeleton({ columns = 4, cardsPerColumn = 3 }: { columns?: number; cardsPerColumn?: number }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns }).map((_, ci) => (
        <div key={ci} className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          {Array.from({ length: cardsPerColumn }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2 bg-card">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
