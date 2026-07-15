"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import BulkImageImport from "@/components/BulkImageImport";
import { parseCsv } from "@/lib/csv";

interface Product {
  id: string;
  rfidTag: string;
  brand: string | null;
  materialType: string | null;
  category: string | null;
  productCode: string | null;
  name: string;
  isActive: boolean;
  _count?: { scans: number };
}

interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

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
    setLoading(true);
    const res = await fetch(`/api/products?search=${search}&page=${page}&status=${status}`);
    const data = await res.json();
    setProducts(data.products || []);
    setTotalPages(data.totalPages || 1);
    setTotal(data.total || 0);
    setLoading(false);
  }

  useEffect(() => { fetchProducts(); }, [search, page, status]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleDelete(id: string) {
    const prod = products.find((p) => p.id === id);
    const hasHistory = (prod?._count?.scans ?? 0) > 0;
    // Tailor the confirm to what will actually happen (archive vs hard delete).
    const msg = hasHistory
      ? "This product has scan history, so it will be ARCHIVED (hidden but kept — its RFID tag is freed for reuse). You can permanently delete it later from the Archived tab. Continue?"
      : "Delete this product? This permanently removes it.";
    if (!confirm(msg)) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    fetchProducts();
  }

  async function handleRestore(id: string) {
    const res = await fetch(`/api/products/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: true }),
    });
    const body = await res.json().catch(() => ({} as { tagRecovered?: boolean; rfidTag?: string }));
    if (res.ok && body.tagRecovered === false) {
      alert(`Restored — but its original RFID tag was already taken, so it kept a placeholder tag (${body.rfidTag}). Edit the product to set a new tag.`);
    }
    fetchProducts();
  }

  async function handlePurge(id: string) {
    if (!confirm("Permanently delete this product AND its scan history? This cannot be undone.")) return;
    await fetch(`/api/products/${id}?purge=true`, { method: "DELETE" });
    fetchProducts();
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Product Management</h1>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Product Management" }]} />
        </div>
        <div className="flex items-center gap-2">
          {/* Import Button */}
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }}>
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
            style={{ background: "#726c5a", color: "#fff" }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Product
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 rounded-xl mb-4 flex items-center gap-3"
        style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl flex-1"
          style={{ background: "#f5f2ee", border: "1px solid #e6e5d8" }}>
          <svg width="14" height="14" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            placeholder="Global Search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="outline-none text-sm w-full"
            style={{ background: "transparent", color: "#4c4847" }}
          />
        </div>
        <p className="text-sm whitespace-nowrap" style={{ color: "#6f5f48" }}>Total: {total} products</p>
      </div>

      {/* Status filter: Active (default) / Archived (soft-deleted, kept for history) / All */}
      <div className="flex gap-2 mb-4">
        {([["active", "Active"], ["archived", "Archived"], ["all", "All"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setStatus(k); setPage(1); }}
            className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{
              background: status === k ? "#726c5a" : "#fff",
              color: status === k ? "#fff" : "#4c4847",
              border: "1px solid " + (status === k ? "#726c5a" : "#e6e5d8"),
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-auto" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr style={{ borderBottom: "1px solid #e6e5d8", background: "#f5f2ee" }}>
              {["Brand", "Material Type", "Category", "Product Code", "Product Name", "Actions"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: "#6f5f48" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10" style={{ color: "#8f8168" }}>Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10" style={{ color: "#8f8168" }}>No products found</td></tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} style={{ borderBottom: "1px solid #f5f2ee", background: product.isActive ? undefined : "#faf8f4", opacity: product.isActive ? 1 : 0.6 }}>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#4c4847" }}>{product.brand || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#6f5f48" }}>{product.materialType || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#6f5f48" }}>{product.category || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#6f5f48" }}>{product.productCode || "-"}</td>
                  <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: "#4c4847" }}>
                    {product.name}
                    {!product.isActive && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-semibold align-middle"
                        style={{ background: "#ece8df", color: "#6f5f48" }}>Archived</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        // The menu is position:fixed → use VIEWPORT coords (no scrollY).
                        const MENU_W = 144, MENU_H = 96; // w-36, two items
                        // Flip up when there isn't room below, so it never runs off the bottom.
                        const top = rect.bottom + MENU_H > window.innerHeight ? rect.top - MENU_H : rect.bottom;
                        // Right-align to the trigger, clamped on-screen (mobile-safe).
                        const left = Math.min(Math.max(8, rect.right - MENU_W), window.innerWidth - MENU_W - 8);
                        setMenuPosition({ top, left });
                        setOpenMenu(openMenu === product.id ? null : product.id);
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg"
                      style={{ background: openMenu === product.id ? "#f5f2ee" : "transparent" }}>
                      <svg width="16" height="16" fill="#9f886c" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid #e6e5d8" }}>
            <button onClick={() => setPage(page - 1)} disabled={page === 1}
              className="px-3 py-1 rounded-lg text-xs"
              style={{ background: "#f5f2ee", color: page === 1 ? "#8f8168" : "#726c5a" }}>Previous</button>
            <p className="text-xs" style={{ color: "#6f5f48" }}>Page {page} of {totalPages}</p>
            <button onClick={() => setPage(page + 1)} disabled={page === totalPages}
              className="px-3 py-1 rounded-lg text-xs"
              style={{ background: "#f5f2ee", color: page === totalPages ? "#8f8168" : "#726c5a" }}>Next</button>
          </div>
        )}
      </div>

      {/* Dropdown Menu — Edit + Delete/Archive for active products; Restore/Delete-forever for archived */}
      {openMenu && menuProduct && (
        <div ref={menuRef} className="fixed z-50 w-40 rounded-xl overflow-hidden"
          style={{ top: menuPosition.top, left: menuPosition.left, background: "#fff", border: "1px solid #e6e5d8", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          {menuProduct.isActive === false ? (
            <>
              <button onClick={() => { handleRestore(openMenu); setOpenMenu(null); }}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                style={{ color: "#4a7c59" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#eef6f0")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
                Restore
              </button>
              <button onClick={() => { handlePurge(openMenu); setOpenMenu(null); }}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                style={{ color: "#9f4a4a" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fff0f0")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
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
              <Link href={`/admin/products/${openMenu}/edit`} onClick={() => setOpenMenu(null)}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                style={{ color: "#4c4847" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f2ee")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </Link>
              {menuArchives ? (
                <button onClick={() => { handleDelete(openMenu); setOpenMenu(null); }}
                  className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                  style={{ color: "#6f5f48" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f2ee")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
                  </svg>
                  Archive
                </button>
              ) : (
                <button onClick={() => { handleDelete(openMenu); setOpenMenu(null); }}
                  className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                  style={{ color: "#9f4a4a" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#fff0f0")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
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
            style={{ background: "#fff", border: "1px solid #e6e5d8", maxHeight: "90vh", overflowY: "auto" }}>

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "#4c4847" }}>Import Products</h2>
                <p className="text-xs mt-0.5" style={{ color: "#6f5f48" }}>Import product data (CSV) or bulk product images</p>
              </div>
              <button onClick={handleCloseImport}
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ background: "#f5f2ee" }}>
                <svg width="14" height="14" fill="none" stroke="#4c4847" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Mode toggle: product data (CSV) vs product images (bulk photo drop) */}
            <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: "#f5f2ee" }}>
              {([["data", "Product Data"], ["images", "Product Images"]] as const).map(([m, label]) => (
                <button key={m} onClick={() => setImportMode(m)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: importMode === m ? "#fff" : "transparent",
                    color: importMode === m ? "#726c5a" : "#6f5f48",
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
                  style={{ background: "#f5f2ee" }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#4c4847" }}>ดาวน์โหลด Template</p>
                    <p className="text-xs mt-0.5" style={{ color: "#6f5f48" }}>ใช้ template นี้เป็นแนวทางในการกรอกข้อมูล</p>
                  </div>
                  <button onClick={downloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium"
                    style={{ background: "#726c5a", color: "#fff" }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Download CSV Template
                  </button>
                </div>

                {/* Column mapping guide */}
                <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid #e6e5d8" }}>
                  <p className="text-xs font-medium mb-2" style={{ color: "#4c4847" }}>Columns ที่รองรับ</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {[
                      ["rfidTag *", "RFID Tag (จำเป็น)"],
                      ["name *", "ชื่อสินค้า (จำเป็น)"],
                      ["brand", "แบรนด์"],
                      ["materialType", "ประเภทวัสดุ"],
                      ["category", "หมวดหมู่"],
                      ["productCode", "รหัสสินค้า"],
                      ["size", "ขนาด"],
                      ["colour", "สี"],
                      ["description", "รายละเอียด"],
                      ["location", "ตำแหน่งจัดเก็บ"],
                    ].map(([col, desc]) => (
                      <div key={col} className="flex items-center gap-2">
                        <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#f5f2ee", color: "#726c5a" }}>{col}</code>
                        <span className="text-xs" style={{ color: "#6f5f48" }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs mt-2" style={{ color: "#8f8168" }}>
                    * ถ้า rfidTag มีอยู่แล้วในระบบ จะทำการ <strong>update</strong> ข้อมูล ถ้าไม่มีจะ <strong>สร้างใหม่</strong>
                  </p>
                </div>

                {/* File Upload */}
                <div
                  className="border-2 border-dashed rounded-xl p-8 text-center mb-4 cursor-pointer transition-colors"
                  style={{ borderColor: importFile ? "#726c5a" : "#cdc3ad", background: importFile ? "rgba(114,108,90,0.04)" : "transparent" }}
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
                      <svg className="mx-auto mb-2" width="24" height="24" fill="none" stroke="#726c5a" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <p className="text-sm font-medium" style={{ color: "#4c4847" }}>{importFile.name}</p>
                      <p className="text-xs mt-1" style={{ color: "#6f5f48" }}>คลิกเพื่อเปลี่ยนไฟล์</p>
                    </div>
                  ) : (
                    <div>
                      <svg className="mx-auto mb-2" width="24" height="24" fill="none" stroke="#cdc3ad" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <p className="text-sm" style={{ color: "#6f5f48" }}>คลิกหรือลากไฟล์มาวางที่นี่</p>
                      <p className="text-xs mt-1" style={{ color: "#8f8168" }}>รองรับ .csv</p>
                    </div>
                  )}
                </div>

                {/* Preview */}
                {importPreview.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium mb-2" style={{ color: "#4c4847" }}>
                      Preview (5 rows แรก)
                    </p>
                    <div className="overflow-auto rounded-xl" style={{ border: "1px solid #e6e5d8" }}>
                      <table className="w-full text-xs min-w-max">
                        <thead>
                          <tr style={{ background: "#f5f2ee", borderBottom: "1px solid #e6e5d8" }}>
                            {importHeaders.map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "#6f5f48" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.map((row, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #f5f2ee" }}>
                              {importHeaders.map((h) => (
                                <td key={h} className="px-3 py-2 whitespace-nowrap" style={{ color: "#4c4847" }}>
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
                  <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>
                    {importError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button onClick={handleCloseImport}
                    className="flex-1 py-2.5 rounded-xl text-sm" style={{ background: "#f5f2ee", color: "#4c4847" }}>
                    Cancel
                  </button>
                  <button onClick={handleImport} disabled={!importFile || importing}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: "#726c5a" }}>
                    {importing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
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
                <h3 className="text-lg font-semibold mb-1" style={{ color: "#4c4847" }}>
                  {importResult.failed === 0 ? "Import สำเร็จ!" : "Import เสร็จสิ้น (มีบางรายการที่ผิดพลาด)"}
                </h3>
                <div className="flex justify-center gap-6 my-5">
                  <div className="text-center">
                    <p className="text-2xl font-bold" style={{ color: "#10b981" }}>{importResult.created}</p>
                    <p className="text-xs" style={{ color: "#6f5f48" }}>สร้างใหม่</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold" style={{ color: "#3b82f6" }}>{importResult.updated}</p>
                    <p className="text-xs" style={{ color: "#6f5f48" }}>อัปเดต</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold" style={{ color: "#ef4444" }}>{importResult.failed}</p>
                    <p className="text-xs" style={{ color: "#6f5f48" }}>ผิดพลาด</p>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="text-left p-3 rounded-xl mb-4 max-h-32 overflow-y-auto"
                    style={{ background: "#fff0f0", border: "1px solid #f5c0c0" }}>
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-xs" style={{ color: "#9f4a4a" }}>{e}</p>
                    ))}
                  </div>
                )}
                <button onClick={handleCloseImport}
                  className="px-8 py-2.5 rounded-xl text-sm font-medium text-white"
                  style={{ background: "#726c5a" }}>
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
