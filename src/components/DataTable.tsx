"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type Header,
  type OnChangeFn,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SkeletonRows } from "@/components/Skeleton";

// Shared, token-styled admin table on TanStack Table (headless) in server mode: sorting +
// pagination are MANUAL (parent turns state into ?sort=&dir=&page= and refetches). Column
// show/hide AND drag-to-reorder are presentational, owned here, and persisted per-table in
// localStorage. Reorder works two ways (both @dnd-kit, touch + mouse + keyboard): drag a
// column header, or drag rows in the "Columns" panel. The Actions column is pinned last.
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
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  // Server-side (manual) filtering: the table holds the filter values; the parent reads
  // them to build the query. globalFilter = the search box; columnFilters = per-column
  // filters keyed by column id (e.g. { id: "title", value: "Architect" }).
  globalFilter?: string;
  onGlobalFilterChange?: OnChangeFn<string>;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  rowStyle?: (row: T) => React.CSSProperties | undefined;
  getRowId?: (row: T) => string;
  enableColumnHiding?: boolean;
  enableColumnReorder?: boolean;
  tableId?: string;
  // Page-owned filters (search, tabs, selects) rendered on the LEFT of the table's single
  // toolbar row; the Columns control sits on the right. Unifies page + table controls.
  toolbar?: React.ReactNode;
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

function GripIcon() {
  return (
    <svg aria-hidden width="12" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

// The sort control + label shared by draggable and pinned headers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HeaderInner<T>({ header }: { header: Header<T, any> }) {
  const label = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
  if (!header.column.getCanSort()) return <>{label}</>;
  return (
    <button type="button" onClick={header.column.getToggleSortingHandler()}
      className="group inline-flex items-center gap-1.5 font-medium select-none hover:text-[var(--color-text)] transition-colors" title="Sort">
      {label}
      <SortIndicator dir={header.column.getIsSorted()} />
    </button>
  );
}

// A header cell that can be dragged (by its grip) to reorder its column.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DraggableHeader<T>({ header }: { header: Header<T, any> }) {
  const { attributes, isDragging, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: header.column.id });
  return (
    <th ref={setNodeRef} className="text-left px-4 py-3 font-medium whitespace-nowrap text-xs"
      style={{ color: "var(--color-text-muted)", transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.7 : 1, position: "relative", zIndex: isDragging ? 2 : 0 }}>
      <div className="inline-flex items-center gap-1">
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none opacity-40 hover:opacity-80" title="Drag to reorder" aria-label="Drag to reorder column"
          style={{ color: "var(--color-text-muted)" }}>
          <GripIcon />
        </button>
        <HeaderInner header={header} />
      </div>
    </th>
  );
}

// A row in the Columns panel: checkbox to show/hide + grip to reorder (vertical).
function PanelRow<T>({ col }: { col: Column<T, unknown> }) {
  const { attributes, isDragging, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: col.id });
  return (
    <div ref={setNodeRef} className="flex items-center gap-2 px-2 py-1.5 text-xs"
      style={{ color: "var(--color-text)", background: isDragging ? "var(--color-hover)" : undefined, transform: CSS.Translate.toString(transform), transition }}>
      <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none opacity-40 hover:opacity-80" title="Drag to reorder" aria-label="Drag to reorder column"
        style={{ color: "var(--color-text-muted)" }}>
        <GripIcon />
      </button>
      <label className="flex items-center gap-2 cursor-pointer flex-1">
        <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} style={{ accentColor: "var(--color-primary)" }} />
        {colLabel(col)}
      </label>
    </div>
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
  globalFilter,
  onGlobalFilterChange,
  columnFilters,
  onColumnFiltersChange,
  page = 1,
  totalPages = 1,
  onPageChange,
  rowStyle,
  getRowId,
  enableColumnHiding = true,
  enableColumnReorder = true,
  tableId,
  toolbar,
}: DataTableProps<T>) {
  const visKey = tableId ? `tak-cols-${tableId}` : null;
  const orderKey = tableId ? `tak-order-${tableId}` : null;

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (typeof window === "undefined" || !visKey) return {};
    try { return JSON.parse(window.localStorage.getItem(visKey) || "{}"); } catch { return {}; }
  });
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (typeof window === "undefined" || !orderKey) return [];
    try { return JSON.parse(window.localStorage.getItem(orderKey) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    if (visKey) try { window.localStorage.setItem(visKey, JSON.stringify(columnVisibility)); } catch { /* ignore */ }
  }, [columnVisibility, visKey]);
  useEffect(() => {
    if (orderKey && columnOrder.length) try { window.localStorage.setItem(orderKey, JSON.stringify(columnOrder)); } catch { /* ignore */ }
  }, [columnOrder, orderKey]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, columnOrder, globalFilter, columnFilters },
    onSortingChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    manualSorting: true,
    manualFiltering: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  // Seed/reconcile the persisted order against the real leaf-column ids (once): drop
  // unknown ids (a column removed in code) and append newly-added ones in natural order.
  useEffect(() => {
    const ids = table.getAllLeafColumns().map((c) => c.id);
    setColumnOrder((prev) => {
      const valid = prev.filter((id) => ids.includes(id));
      const merged = [...valid, ...ids.filter((id) => !valid.includes(id))];
      return merged.length === prev.length && merged.every((v, i) => v === prev[i]) ? prev : merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleCols = table.getVisibleLeafColumns().length;

  // Reorderable = hideable leaf columns (the Actions column is pinned via enableHiding:false).
  const orderedLeaf = useMemo(() => {
    const all = table.getAllLeafColumns();
    if (!columnOrder.length) return all;
    const byId = new Map(all.map((c) => [c.id, c]));
    return columnOrder.map((id) => byId.get(id)).filter(Boolean) as Column<T, unknown>[];
  }, [table, columnOrder]);
  const panelCols = useMemo(() => orderedLeaf.filter((c) => c.getCanHide()), [orderedLeaf]);
  const canReorder = enableColumnReorder && panelCols.length > 1;

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onReorder = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setColumnOrder((prev) => {
      const from = prev.indexOf(active.id as string);
      const to = prev.indexOf(over.id as string);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  };

  // Columns dropdown open/close (close on outside click / Esc).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (ev: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenuOpen(false); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const showColMenu = enableColumnHiding && panelCols.length > 0;
  const reorderableHeaderIds = useMemo(
    () => table.getVisibleLeafColumns().filter((c) => c.getCanHide()).map((c) => c.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, columnOrder, columnVisibility],
  );
  const panelIds = useMemo(() => panelCols.map((c) => c.id), [panelCols]);

  return (
    <div className="rounded-xl overflow-visible" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      {(toolbar || showColMenu) && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{toolbar}</div>
          {showColMenu && (
            <div ref={menuRef} className="relative flex-shrink-0">
              <button type="button" onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="true" aria-expanded={menuOpen} aria-label="Show or hide columns"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                Columns
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-xl overflow-hidden py-1"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
                  {canReorder && (
                    <p className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Show / drag to reorder</p>
                  )}
                  {canReorder ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onReorder}>
                      <SortableContext items={panelIds} strategy={verticalListSortingStrategy}>
                        {panelCols.map((col) => <PanelRow key={col.id} col={col} />)}
                      </SortableContext>
                    </DndContext>
                  ) : (
                    panelCols.map((col) => (
                      <label key={col.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--color-hover)]" style={{ color: "var(--color-text)" }}>
                        <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} style={{ accentColor: "var(--color-primary)" }} />
                        {colLabel(col)}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="overflow-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToHorizontalAxis]} onDragEnd={onReorder}>
          <table className="w-full text-sm min-w-max">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
                  <SortableContext items={reorderableHeaderIds} strategy={horizontalListSortingStrategy}>
                    {hg.headers.map((header) =>
                      canReorder && header.column.getCanHide() ? (
                        <DraggableHeader key={header.id} header={header} />
                      ) : (
                        <th key={header.id} className="text-left px-4 py-3 font-medium whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                          <HeaderInner header={header} />
                        </th>
                      ),
                    )}
                  </SortableContext>
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
        </DndContext>
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
