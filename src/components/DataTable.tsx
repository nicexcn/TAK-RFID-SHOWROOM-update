"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
} from "@tanstack/react-table";
import { SkeletonRows } from "@/components/Skeleton";

// Shared, token-styled admin table built on TanStack Table (headless) in server mode:
// sorting and pagination are MANUAL — the table only reflects state and reports changes
// via callbacks; the parent turns them into ?sort=&dir=&page= and refetches. All markup +
// styling stays here (matching the app's existing tables), so column defs carry only the
// cell JSX. Handles loading (skeleton rows), error (retry), and empty states.
export interface DataTableProps<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  errorMessage?: string;
  emptyMessage?: string;
  skeletonRows?: number;
  // Controlled server-side sorting.
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  // 1-based pagination (matches the app's APIs); footer hidden when totalPages <= 1.
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  // Per-row visual state (e.g. archived rows dimmed).
  rowStyle?: (row: T) => React.CSSProperties | undefined;
  getRowId?: (row: T) => string;
}

function SortIndicator({ dir }: { dir: false | "asc" | "desc" }) {
  // ▲ asc / ▼ desc when sorted; a faint ⇅ signals "sortable but not sorted".
  return (
    <span aria-hidden className="inline-flex flex-col leading-[0.5] text-[8px]" style={{ opacity: dir ? 1 : 0.35 }}>
      <span style={{ color: dir === "asc" ? "var(--color-primary)" : "var(--color-text-subtle)" }}>▲</span>
      <span style={{ color: dir === "desc" ? "var(--color-primary)" : "var(--color-text-subtle)" }}>▼</span>
    </span>
  );
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  error = false,
  onRetry,
  errorMessage = "Couldn't load data. Please check your connection and try again.",
  emptyMessage = "No results",
  skeletonRows = 8,
  sorting,
  onSortingChange,
  page = 1,
  totalPages = 1,
  onPageChange,
  rowStyle,
  getRowId,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  const cols = columns.length;

  return (
    <div className="rounded-xl overflow-auto" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <table className="w-full text-sm min-w-max">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const label = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <th key={header.id} className="text-left px-4 py-3 font-medium whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {canSort ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1.5 font-medium hover:opacity-80"
                        title="Sort">
                        {label}
                        <SortIndicator dir={header.column.getIsSorted()} />
                      </button>
                    ) : label}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows rows={skeletonRows} cols={cols} />
          ) : error ? (
            <tr>
              <td colSpan={cols} className="text-center py-10">
                <p className="text-sm mb-3" style={{ color: "var(--color-danger)" }}>{errorMessage}</p>
                {onRetry && (
                  <button onClick={onRetry} className="px-4 py-2 rounded-xl text-sm font-medium"
                    style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>Retry</button>
                )}
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr><td colSpan={cols} className="text-center py-10" style={{ color: "var(--color-text-subtle)" }}>{emptyMessage}</td></tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid var(--color-bg)", ...(rowStyle?.(row.original) ?? {}) }}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 whitespace-nowrap align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
            className="px-3 py-1 rounded-lg text-xs disabled:cursor-default"
            style={{ background: "var(--color-bg)", color: page <= 1 ? "var(--color-text-subtle)" : "var(--color-primary)" }}>Previous</button>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Page {page} of {totalPages}</p>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
            className="px-3 py-1 rounded-lg text-xs disabled:cursor-default"
            style={{ background: "var(--color-bg)", color: page >= totalPages ? "var(--color-text-subtle)" : "var(--color-primary)" }}>Next</button>
        </div>
      )}
    </div>
  );
}
