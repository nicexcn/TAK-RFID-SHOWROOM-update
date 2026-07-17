"use client";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/Spinner";
import { DataTable } from "@/components/DataTable";
import { createColumnHelper, type SortingState } from "@tanstack/react-table";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

import { useEffect, useState, useRef, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import BulkImageImport from "@/components/BulkImageImport";
import { parseCsv } from "@/lib/csv";
import { useConfirm } from "@/components/ConfirmDialog";
import { toast } from "sonner";

interface Product {
  id: string;
  rfidTag: string;
  brand: string | null;
  materialType: string | null;
  category: string | null;
  productCode: string | null;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  _count?: { scans: number };
}

const columnHelper = createColumnHelper<Product>();

interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchInput, setSearchInput] = useState(""); // instant input value (responsive)
  const globalFilter = useDebouncedValue(searchInput, 300); // debounced → drives the fetch
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null); // row with a delete/archive/restore/purge in flight
  const [fetchError, setFetchError] = useState(false);
  const reqSeq = useRef(0); // drop out-of-order responses (a slow early request landing late)
  const confirm = useConfirm();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null); // the ⋯ button that opened the menu, so Esc/close can restore focus

  // Close the actions menu and (for keyboard users) return focus to the ⋯ button that opened it.
  function closeMenu() { setOpenMenu(null); menuTriggerRef.current?.focus(); }
  // Move focus into the menu when it opens so a keyboard user lands on the first item.
  useEffect(() => {
    if (openMenu && menuRef.current) menuRef.current.querySelector<HTMLElement>("[data-menuitem]")?.focus();
  }, [openMenu]);

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<"data" | "images">("data");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchProducts() {
    const seq = ++reqSeq.current;
    setLoading(true);
    setFetchError(false);
    try {
      const s = sorting[0];
      const sortQ = s ? `&sort=${s.id}&dir=${s.desc ? "desc" : "asc"}` : "";
      const res = await fetch(`/api/products?search=${encodeURIComponent(globalFilter)}&page=${page}&status=${status}${sortQ}`);
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      if (seq !== reqSeq.current) return; // a newer request superseded this one → ignore
      setProducts(data.products || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch {
      if (seq === reqSeq.current) setFetchError(true);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }

  useEffect(() => { fetchProducts(); }, [globalFilter, page, status, sorting]);
  // Any filter/sort change resets to page 1 (page changes alone must NOT reset).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [globalFilter, status, sorting]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // The row-actions menu is position:fixed placed via getBoundingClientRect — close it on
  // scroll so it can't strand away from its trigger.
  useEffect(() => {
    if (!openMenu) return;
    function handleScroll() { setOpenMenu(null); }
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [openMenu]);

  async function handleDelete(id: string) {
    const prod = products.find((p) => p.id === id);
    const hasHistory = (prod?._count?.scans ?? 0) > 0;
    // Tailor the confirm to what will actually happen (archive vs hard delete).
    const message = hasHistory
      ? "This product has scan history, so it will be ARCHIVED (hidden but kept — its RFID tag is freed for reuse). You can permanently delete it later from the Archived tab. Continue?"
      : "Delete this product? This permanently removes it.";
    if (!(await confirm({ title: hasHistory ? "Archive product" : "Delete product", message, danger: true }))) return;
    setBusyId(id); // dim the row while the delete/archive is in flight
    try {
      await fetch(`/api/products/${id}`, { method: "DELETE" });
      await fetchProducts();
    } finally { setBusyId(null); }
  }

  async function handleRestore(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: true }),
      });
      const body = await res.json().catch(() => ({} as { tagRecovered?: boolean; rfidTag?: string }));
      if (res.ok && body.tagRecovered === false) {
        toast(`Restored — but its original RFID tag was already taken, so it kept a placeholder tag (${body.rfidTag}). Edit the product to set a new tag.`);
      }
      await fetchProducts();
    } finally { setBusyId(null); }
  }

  async function handlePurge(id: string) {
    if (!(await confirm({ title: "Delete forever", message: "Permanently delete this product AND its scan history? This cannot be undone.", danger: true }))) return;
    setBusyId(id);
    try {
      await fetch(`/api/products/${id}?purge=true`, { method: "DELETE" });
      await fetchProducts();
    } finally { setBusyId(null); }
  }

  // ── Import handlers ────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportResult(null);
    setImportError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      setImportPreview(rows.slice(0, 5)); // preview 5 rows
    };
    reader.readAsText(file, "UTF-8");
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportError("");

    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target?.result as string;
        const products = parseCsv(text);

        const res = await fetch("/api/products/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products }),
        });

        const result = await res.json();
        if (!res.ok) {
          setImportError(result.error || "Import failed");
        } else {
          setImportResult(result);
          fetchProducts();
        }
        setImporting(false);
      };
      reader.readAsText(importFile, "UTF-8");
    } catch (err) {
      setImportError(String(err));
      setImporting(false);
    }
  }

  function handleCloseImport() {
    setShowImport(false);
    setImportMode("data");
    setImportFile(null);
    setImportPreview([]);
    setImportResult(null);
    setImportError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function downloadTemplate() {
    const headers = ["rfidTag", "name", "brand", "materialType", "category", "productCode", "size", "colour", "description", "location"];
    const example = ["RFID-001", "Sample Product", "BrandX", "Laminate", "Floor", "PC-001", "60x60", "White", "Sample description", "Rack A-01"];
    const csv = [headers.join(","), example.join(",")].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "product_import_template.csv"; a.click();
  }

  const importHeaders = importPreview[0] ? Object.keys(importPreview[0]) : [];
  const menuProduct = openMenu ? products.find((p) => p.id === openMenu) || null : null;
  // A scanned product can't be hard-deleted (history is kept) → the action archives instead.
  const menuArchives = (menuProduct?._count?.scans ?? 0) > 0;

  // Column defs (same cell JSX as before, relocated). accessor `id` defaults to the field
  // name → matches the server's sort allowlist; the Actions column is display-only (no sort).
  const columns = useMemo(() => [
    columnHelper.display({ id: "image", header: "Image", cell: ({ row }) => {
      const p = row.original;
      return p.imageUrl ? (
        <Image src={p.imageUrl} alt={p.name} width={48} height={40} className="w-12 h-10 object-cover rounded-lg" style={{ border: "1px solid var(--color-border)" }} />
      ) : (
        <div className="w-12 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
          <svg width="14" height="14" fill="none" stroke="var(--color-icon-muted)" strokeWidth="1.5" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
          </svg>
        </div>
      );
    } }),
    columnHelper.accessor("brand", { header: "Brand", cell: (i) => <span style={{ color: "var(--color-text)" }}>{i.getValue() || "-"}</span> }),
    columnHelper.accessor("materialType", { header: "Material Type", cell: (i) => <span style={{ color: "var(--color-text-muted)" }}>{i.getValue() || "-"}</span> }),
    columnHelper.accessor("category", { header: "Category", cell: (i) => <span style={{ color: "var(--color-text-muted)" }}>{i.getValue() || "-"}</span> }),
    columnHelper.accessor("productCode", { header: "Product Code", cell: (i) => <span style={{ color: "var(--color-text-muted)" }}>{i.getValue() || "-"}</span> }),
    columnHelper.accessor("name", { header: "Product Name", cell: (i) => (
      <span className="font-medium" style={{ color: "var(--color-text)" }}>
        {i.getValue()}
        {!i.row.original.isActive && (
          <span className="ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-semibold align-middle"
            style={{ background: "var(--color-border)", color: "var(--color-text-muted)" }}>Archived</span>
        )}
      </span>
    ) }),
    columnHelper.display({ id: "actions", header: "Actions", enableHiding: false, cell: ({ row }) => {
      const product = row.original;
      return (
        <button
          aria-label={`Actions for ${product.name}`}
          aria-haspopup="true"
          aria-expanded={openMenu === product.id}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const MENU_W = 144, MENU_H = 96;
            const top = rect.bottom + MENU_H > window.innerHeight ? rect.top - MENU_H : rect.bottom;
            const left = Math.min(Math.max(8, rect.right - MENU_W), window.innerWidth - MENU_W - 8);
            setMenuPosition({ top, left });
            menuTriggerRef.current = e.currentTarget;
            setOpenMenu(openMenu === product.id ? null : product.id);
          }}
          className="w-8 h-8 flex items-center justify-center rounded-lg"
          style={{ background: openMenu === product.id ? "var(--color-bg)" : "transparent" }}>
          <svg aria-hidden="true" width="16" height="16" fill="var(--color-icon-muted)" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      );
    } }),
  ], [openMenu]);

  return (
    <div>
      <PageHeader
        title="Product Management"
        crumbs={[{ label: "Home", href: "/admin" }, { label: "Product Management" }]}
        actions={
          <>
            {/* Import Button */}
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Import
            </button>
            {/* Add Product Button */}
            <Link
              href="/admin/products/new"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Product
            </Link>
          </>
        }
      />

      {/* Table (shared DataTable — TanStack headless, server-side sort + pagination).
          Page filters (search + status tabs + count) live in the table's unified toolbar. */}
      <DataTable
        tableId="products"
        columns={columns}
        data={products}
        loading={loading}
        error={fetchError}
        onRetry={fetchProducts}
        errorMessage="Could not load products. Please check your connection and try again."
        emptyMessage="No products found"
        sorting={sorting}
        onSortingChange={setSorting}
        globalFilter={globalFilter}
        onGlobalFilterChange={setSearchInput}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        getRowId={(p) => p.id}
        rowStyle={(p) => {
          const base = p.isActive ? undefined : { background: "var(--color-hover)", opacity: 0.6 };
          return busyId === p.id ? { ...base, opacity: 0.4, pointerEvents: "none" as const } : base;
        }}
        toolbar={
          <>
            {/* Search — fills the row on mobile, fixed width on larger screens */}
            <div className="w-full sm:w-56 flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
              <svg width="14" height="14" fill="none" stroke="var(--color-icon-muted)" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input placeholder="Search products" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                className="outline-none text-sm bg-transparent w-full" style={{ color: "var(--color-text)" }} />
            </div>
            {/* Filters — a horizontal-scroll strip so many tabs never wrap or overflow on narrow screens */}
            <div className="w-full sm:w-auto min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {([["active", "Active"], ["archived", "Archived"], ["all", "All"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setStatus(k)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-shrink-0"
                  style={{
                    background: status === k ? "var(--color-primary)" : "var(--color-surface)",
                    color: status === k ? "var(--color-surface)" : "var(--color-text)",
                    border: "1px solid " + (status === k ? "var(--color-primary)" : "var(--color-border)"),
                  }}>
                  {label}
                </button>
              ))}
              <span className="text-xs whitespace-nowrap ml-0.5 flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>{total} products</span>
            </div>
          </>
        }
      />

      {/* Dropdown Menu — Edit + Delete/Archive for active products; Restore/Delete-forever for archived */}
      {openMenu && menuProduct && (
        <div ref={menuRef} aria-label="Product actions" className="fixed z-50 w-40 rounded-xl overflow-hidden"
          onKeyDown={(e) => {
            const items = menuRef.current ? Array.from(menuRef.current.querySelectorAll<HTMLElement>("[data-menuitem]")) : [];
            if (!items.length) return;
            const i = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
            else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
            else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
            else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
          }}
          style={{ top: menuPosition.top, left: menuPosition.left, background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          {menuProduct.isActive === false ? (
            <>
              <button data-menuitem onClick={() => { handleRestore(openMenu); setOpenMenu(null); }}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                style={{ color: "var(--color-success-soft)", "--mi-hover": "#eef6f0" } as CSSProperties}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
                Restore
              </button>
              <button data-menuitem onClick={() => { handlePurge(openMenu); setOpenMenu(null); }}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                style={{ color: "var(--color-danger-soft)", "--mi-hover": "var(--color-danger-bg)" } as CSSProperties}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                Delete forever
              </button>
            </>
          ) : (
            <>
              <Link data-menuitem href={`/admin/products/${openMenu}/edit`} onClick={() => setOpenMenu(null)}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                style={{ color: "var(--color-text)" }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </Link>
              {menuArchives ? (
                <button data-menuitem onClick={() => { handleDelete(openMenu); setOpenMenu(null); }}
                  className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                  style={{ color: "var(--color-text-muted)" }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
                  </svg>
                  Archive
                </button>
              ) : (
                <button data-menuitem onClick={() => { handleDelete(openMenu); setOpenMenu(null); }}
                  className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                  style={{ color: "var(--color-danger-soft)", "--mi-hover": "var(--color-danger-bg)" } as CSSProperties}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Import Modal ─────────────────────────────────────────────────────── */}
      {showImport && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.3)" }} onClick={handleCloseImport} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl rounded-2xl p-6"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", maxHeight: "90vh", overflowY: "auto" }}>

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Import Products</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Import product data (CSV) or bulk product images</p>
              </div>
              <button onClick={handleCloseImport}
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ background: "var(--color-bg)" }}>
                <svg width="14" height="14" fill="none" stroke="var(--color-text)" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Mode toggle: product data (CSV) vs product images (bulk photo drop) */}
            <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: "var(--color-bg)" }}>
              {([["data", "Product Data"], ["images", "Product Images"]] as const).map(([m, label]) => (
                <button key={m} onClick={() => setImportMode(m)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: importMode === m ? "var(--color-surface)" : "transparent",
                    color: importMode === m ? "var(--color-primary)" : "var(--color-text-muted)",
                    boxShadow: importMode === m ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {importMode === "images" ? (
              <BulkImageImport onDone={fetchProducts} />
            ) : !importResult ? (
              <>
                {/* Download Template */}
                <div className="flex items-center justify-between p-4 rounded-xl mb-4"
                  style={{ background: "var(--color-bg)" }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Download Template</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Use this template as a guide for filling in your data</p>
                  </div>
                  <button onClick={downloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium"
                    style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Download CSV Template
                  </button>
                </div>

                {/* Column mapping guide */}
                <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text)" }}>Supported columns</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {[
                      ["rfidTag *", "RFID Tag (required)"],
                      ["name *", "Product name (required)"],
                      ["brand", "Brand"],
                      ["materialType", "Material type"],
                      ["category", "Category"],
                      ["productCode", "Product code"],
                      ["size", "Size"],
                      ["colour", "Colour"],
                      ["description", "Description"],
                      ["location", "Storage location"],
                    ].map(([col, desc]) => (
                      <div key={col} className="flex items-center gap-2">
                        <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}>{col}</code>
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs mt-2" style={{ color: "var(--color-text-subtle)" }}>
                    * If the rfidTag already exists, the record is <strong>updated</strong>; otherwise a <strong>new one is created</strong>.
                  </p>
                </div>

                {/* File Upload */}
                <div
                  className="border-2 border-dashed rounded-xl p-8 text-center mb-4 cursor-pointer transition-colors"
                  style={{ borderColor: importFile ? "var(--color-primary)" : "var(--color-sidebar)", background: importFile ? "rgba(114,108,90,0.04)" : "transparent" }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) { const input = fileInputRef.current; if (input) { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; handleFileChange({ target: input } as any); } }
                  }}>
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                  {importFile ? (
                    <div>
                      <svg className="mx-auto mb-2" width="24" height="24" fill="none" stroke="var(--color-primary)" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{importFile.name}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Click to change file</p>
                    </div>
                  ) : (
                    <div>
                      <svg className="mx-auto mb-2" width="24" height="24" fill="none" stroke="var(--color-sidebar)" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Click or drag a file here</p>
                      <p className="text-xs mt-1" style={{ color: "var(--color-text-subtle)" }}>Supports .csv</p>
                    </div>
                  )}
                </div>

                {/* Preview */}
                {importPreview.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text)" }}>
                      Preview (first 5 rows)
                    </p>
                    <div className="overflow-auto rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
                      <table className="w-full text-xs min-w-max">
                        <thead>
                          <tr style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-border)" }}>
                            {importHeaders.map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.map((row, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid var(--color-bg)" }}>
                              {importHeaders.map((h) => (
                                <td key={h} className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--color-text)" }}>
                                  {row[h] || "-"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importError && (
                  <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-soft)", border: "1px solid var(--color-danger-border)" }}>
                    {importError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button onClick={handleCloseImport}
                    className="flex-1 py-2.5 rounded-xl text-sm" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
                    Cancel
                  </button>
                  <button onClick={handleImport} disabled={!importFile || importing}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: "var(--color-primary)" }}>
                    {importing && <Spinner size="sm" color="#fff" />}
                    {importing ? "Importing..." : "Import Products"}
                  </button>
                </div>
              </>
            ) : (
              /* Result Screen */
              <div className="text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: importResult.failed === 0 ? "#d1fae5" : "#fef3c7" }}>
                  <svg width="28" height="28" fill="none" stroke={importResult.failed === 0 ? "#10b981" : "#f59e0b"} strokeWidth="2" viewBox="0 0 24 24">
                    {importResult.failed === 0
                      ? <polyline points="20 6 9 17 4 12"/>
                      : <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>
                    }
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--color-text)" }}>
                  {importResult.failed === 0 ? "Import complete!" : "Import finished (some rows failed)"}
                </h3>
                <div className="flex justify-center gap-6 my-5">
                  <div className="text-center">
                    <p className="text-2xl font-bold" style={{ color: "var(--color-success)" }}>{importResult.created}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Created</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold" style={{ color: "var(--color-info)" }}>{importResult.updated}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Updated</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold" style={{ color: "var(--color-danger)" }}>{importResult.failed}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Failed</p>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="text-left p-3 rounded-xl mb-4 max-h-32 overflow-y-auto"
                    style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-xs" style={{ color: "var(--color-danger-soft)" }}>{e}</p>
                    ))}
                  </div>
                )}
                <button onClick={handleCloseImport}
                  className="px-8 py-2.5 rounded-xl text-sm font-medium text-white"
                  style={{ background: "var(--color-primary)" }}>
                  Done
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
