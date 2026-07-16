"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { SkeletonRows } from "@/components/Skeleton";

// Shared, token-styled admin table built on TanStack Table (headless) in server mode:
// sorting and pagination are MANUAL — the table only reflects state and reports changes
// via callbacks; the parent turns them into ?sort=&dir=&page= and refetches. All markup +
// styling stays here (matching the app's existing tables), so column defs carry only the
// cell JSX. Handles loading (skeleton rows), error (retry), and empty states. Column
// show/hide is presentational, owned here, and persisted per-table in localStorage.
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
  // Column show/hide: enabled by default; tableId persists the choice across visits.
  enableColumnHiding?: boolean;
  tableId?: string;
}

function colLabel<T>(col: Column<T, unknown>): string {
  const h = col.columnDef.header;
  return typeof h === "string" ? h : col.id;
}

// A crisp single sort caret: primary ▲/▼ when sorted, and a faint double-chevron that
// only appears on hover for sortable-but-unsorted columns (discoverable, not noisy).
function SortIndicator({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir) {
    return (
      <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {dir === "asc" ? <path d="m6 15 6-6 6 6" /> : <path d="m6 9 6 6 6-6" />}
      </svg>
    );
  }
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: "var(--color-text-muted)" }}>
      <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
    </svg>
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
  enableColumnHiding = true,
  tableId,
}: DataTableProps<T>) {
  const storageKey = tableId ? `tak-cols-${tableId}` : null;
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (typeof window === "undefined" || !storageKey) return {};
    try { return JSON.parse(window.localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    if (storageKey) try { window.localStorage.setItem(storageKey, JSON.stringify(columnVisibility)); } catch { /* ignore */ }
  }, [columnVisibility, storageKey]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  const visibleCols = table.getVisibleLeafColumns().length;
  const hideableCols = useMemo(() => table.getAllLeafColumns().filter((c) => c.getCanHide()), [table, columnVisibility]);

  // Columns dropdown open/close (close on outside click / Esc).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const showColMenu = enableColumnHiding && hideableCols.length > 0;

  return (
    <div className="rounded-xl overflow-visible" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {showColMenu && (
        <div ref={menuRef} className="relative flex justify-end px-3 py-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <button type="button" onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Columns
          </button>
          {menuOpen && (
            <div className="absolute right-3 top-full mt-1 z-30 w-48 rounded-xl overflow-hidden py-1"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
              {hideableCols.map((col) => (
                <label key={col.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--color-hover)]" style={{ color: "var(--color-text)" }}>
                  <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()}
                    style={{ accentColor: "var(--color-primary)" }} />
                  {colLabel(col)}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="overflow-auto">
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
                          className="group inline-flex items-center gap-1.5 font-medium select-none hover:text-[var(--color-text)] transition-colors"
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
              <SkeletonRows rows={skeletonRows} cols={visibleCols} />
            ) : error ? (
              <tr>
                <td colSpan={visibleCols} className="text-center py-10">
                  <p className="text-sm mb-3" style={{ color: "var(--color-danger)" }}>{errorMessage}</p>
                  {onRetry && (
                    <button onClick={onRetry} className="px-4 py-2 rounded-xl text-sm font-medium"
                      style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>Retry</button>
                  )}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={visibleCols} className="text-center py-10" style={{ color: "var(--color-text-subtle)" }}>{emptyMessage}</td></tr>
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
      </div>

      {onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[var(--color-hover)]"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Previous
          </button>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Page {page} of {totalPages}</p>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[var(--color-hover)]"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
            Next
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
