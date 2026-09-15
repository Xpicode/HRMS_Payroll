/**
 * Route-level loading state: the shape of a typical screen (header, a row of stat cards, a
 * table) with a soft shimmer, so navigation feels instant and nothing jumps when data lands.
 */
export function PageSkeleton({ cards = 4 }: { cards?: number }) {
  const widths = [6, 4, 5, 3.5, 3];
  return (
    <div className="animate-fade-in" aria-busy="true" aria-label="Loading">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="shimmer h-3 w-16 rounded" />
          <div className="shimmer h-7 w-56 rounded-md" />
          <div className="shimmer h-3.5 w-80 max-w-full rounded" />
        </div>
        <div className="shimmer h-8 w-28 rounded-lg" />
      </div>
      {cards > 0 ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="shimmer h-3 w-20 rounded" />
              <div className="shimmer mt-2 h-6 w-24 rounded-md" />
              <div className="shimmer mt-2 h-3 w-32 rounded" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="flex gap-6 border-b px-4 py-3">
          {widths.map((w, i) => (
            <div key={i} className="shimmer h-3 rounded" style={{ width: `${w}rem` }} />
          ))}
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-6 border-b px-4 py-3.5 last:border-0">
            {widths.map((w, j) => (
              <div
                key={j}
                className="shimmer h-3 rounded"
                style={{ width: `${w}rem`, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
