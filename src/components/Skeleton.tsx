// Shimmer placeholders for content that's loading, so a page/list/table shows its
// eventual shape instead of a bare "Loading…" or a lone spinner. Use for INITIAL data
// loads (the content's layout is known); keep spinners for action/button busy states.

const base: React.CSSProperties = { background: "var(--color-bg)", borderRadius: "0.5rem" };

/** A single shimmer block. Size it with className (h-*, w-*) or style. */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={`animate-pulse ${className}`} style={{ ...base, ...style }} />;
}

/** N shimmer table rows spanning `cols` columns — drop into a <tbody> while a table loads. */
export function SkeletonRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} style={{ borderBottom: "1px solid var(--color-bg)" }}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-4 py-3.5">
              <Skeleton className="h-4" style={{ width: c === 0 ? "70%" : `${55 + ((r + c) % 3) * 12}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A shimmer card (rounded surface with a couple of lines) for list/grid loading states. */
export function SkeletonCard({ className = "", lines = 2 }: { className?: string; lines?: number }) {
  return (
    <div className={`rounded-xl p-5 ${className}`} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <Skeleton className="h-4 mb-3" style={{ width: "40%" }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 mb-2" style={{ width: i === lines - 1 ? "60%" : "85%" }} />
      ))}
    </div>
  );
}
