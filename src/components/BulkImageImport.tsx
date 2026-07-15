"use client";

import { useEffect, useRef, useState } from "react";
import { uploadImage } from "@/lib/uploadImage";

interface Prod {
  id: string;
  name: string;
  productCode: string | null;
  rfidTag: string;
}

interface Matched {
  file: File;
  product: Prod;
  n: number; // order hint: 0 = cover (bare name), N = "-N"/"_N" suffix
}

interface BulkResult {
  added: number;
  products: number;
  failed: number;
  errors: string[];
  unmatched: number;
}

const UPLOAD_CONCURRENCY = 4;

function norm(s: string) {
  return s.trim().toLowerCase();
}

function baseName(name: string) {
  const leaf = name.split("/").pop()!.split("\\").pop()!;
  return leaf.replace(/\.[^.]+$/, ""); // strip extension
}

// Pull image files out of a drop, recursing into dropped folders.
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items)
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter(Boolean) as any[];
  if (entries.length === 0) return Array.from(dt.files);

  const out: File[] = [];
  async function walk(entry: any): Promise<void> {
    if (entry.isFile) {
      await new Promise<void>((res) => entry.file((f: File) => { out.push(f); res(); }, () => res()));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      await new Promise<void>((res) => {
        const read = () =>
          reader.readEntries(async (ents: any[]) => {
            if (!ents.length) return res();
            for (const e of ents) await walk(e);
            read();
          }, () => res());
        read();
      });
    }
  }
  for (const e of entries) await walk(e);
  return out;
}

export default function BulkImageImport({ onDone }: { onDone?: () => void }) {
  const [products, setProducts] = useState<Prod[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [matched, setMatched] = useState<Matched[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/products?all=true")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .catch(() => setError("Could not load products for matching"))
      .finally(() => setLoadingProducts(false));
  }, []);

  function matchFiles(files: File[]) {
    const byCode = new Map<string, Prod>();
    const byTag = new Map<string, Prod>();
    for (const p of products) {
      if (p.productCode) byCode.set(norm(p.productCode), p);
      byTag.set(norm(p.rfidTag), p);
    }
    const found: Matched[] = [];
    const missed: string[] = [];
    for (const file of files) {
      const b = norm(baseName(file.name));
      // 1) exact match -> cover candidate
      let prod = byCode.get(b) || byTag.get(b);
      let n = 0;
      if (!prod) {
        // 2) strip a trailing -N / _N suffix and match the remainder
        const m = b.match(/^(.+)[-_](\d+)$/);
        if (m) {
          prod = byCode.get(m[1]) || byTag.get(m[1]);
          n = parseInt(m[2], 10);
        }
      }
      if (prod) found.push({ file, product: prod, n });
      else missed.push(file.name);
    }
    setResult(null);
    setError("");
    setMatched(found);
    setUnmatched(missed);
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name));
    if (files.length === 0) { setError("No image files found"); return; }
    matchFiles(files);
  }

  // group matched files per product, ordered (cover first)
  function groupMatched(): { product: Prod; files: File[] }[] {
    const map = new Map<string, { product: Prod; items: Matched[] }>();
    for (const m of matched) {
      if (!map.has(m.product.id)) map.set(m.product.id, { product: m.product, items: [] });
      map.get(m.product.id)!.items.push(m);
    }
    return Array.from(map.values()).map(({ product, items }) => ({
      product,
      files: items
        .sort((a, b) => a.n - b.n || a.file.name.localeCompare(b.file.name))
        .map((i) => i.file),
    }));
  }

  async function handleUpload() {
    const groups = groupMatched();
    const total = matched.length;
    if (total === 0) return;
    setUploading(true);
    setError("");
    setProgress({ done: 0, total });

    // 1) upload every matched file -> url (bounded concurrency), preserving per-product order
    const urlByFile = new Map<File, string>();
    const failedUploads: string[] = [];
    const queue = [...matched];
    let done = 0;
    async function worker() {
      while (queue.length) {
        const m = queue.shift()!;
        try {
          urlByFile.set(m.file, await uploadImage(m.file));
        } catch (e) {
          failedUploads.push(`${m.file.name}: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          done++;
          setProgress({ done, total });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, total) }, worker));

    // 2) send grouped urls (in order) to the bulk endpoint
    const payloadGroups = groups
      .map((g) => ({ productId: g.product.id, urls: g.files.map((f) => urlByFile.get(f)).filter(Boolean) as string[] }))
      .filter((g) => g.urls.length > 0);

    try {
      const res = await fetch("/api/products/bulk-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: payloadGroups }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || "Bulk attach failed");
      setResult({
        added: r.added,
        products: r.products,
        failed: r.failed + failedUploads.length,
        errors: [...failedUploads, ...(r.errors || [])],
        unmatched: unmatched.length,
      });
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setMatched([]);
    setUnmatched([]);
    setResult(null);
    setError("");
    setProgress({ done: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const groups = matched.length ? groupMatched() : [];

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: result.failed === 0 ? "#d1fae5" : "#fef3c7" }}>
          <svg width="28" height="28" fill="none" stroke={result.failed === 0 ? "#10b981" : "#f59e0b"} strokeWidth="2" viewBox="0 0 24 24">
            {result.failed === 0
              ? <polyline points="20 6 9 17 4 12" />
              : <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>}
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: "#4c4847" }}>
          {result.failed === 0 ? "Images imported!" : "Done — some files were skipped"}
        </h3>
        <div className="flex justify-center gap-6 my-5">
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "#10b981" }}>{result.added}</p>
            <p className="text-xs" style={{ color: "#6f5f48" }}>images added</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "#3b82f6" }}>{result.products}</p>
            <p className="text-xs" style={{ color: "#6f5f48" }}>products</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "#6f5f48" }}>{result.unmatched}</p>
            <p className="text-xs" style={{ color: "#6f5f48" }}>unmatched</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "#ef4444" }}>{result.failed}</p>
            <p className="text-xs" style={{ color: "#6f5f48" }}>failed</p>
          </div>
        </div>
        {result.errors.length > 0 && (
          <div className="text-left p-3 rounded-xl mb-4 max-h-32 overflow-y-auto" style={{ background: "#fff0f0", border: "1px solid #f5c0c0" }}>
            {result.errors.map((e, i) => <p key={i} className="text-xs" style={{ color: "#9f4a4a" }}>{e}</p>)}
          </div>
        )}
        <button onClick={reset} className="px-5 py-2.5 rounded-xl text-sm font-medium" style={{ background: "#726c5a", color: "#fff" }}>
          Import more
        </button>
      </div>
    );
  }

  // ── Picker + preview ───────────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid #e6e5d8" }}>
        <p className="text-xs font-medium mb-1" style={{ color: "#4c4847" }}>How to name your files</p>
        <p className="text-xs" style={{ color: "#6f5f48" }}>
          Name each photo after the product&apos;s <strong>Product Code</strong> or <strong>RFID tag</strong>.
          Add <code className="px-1 rounded" style={{ background: "#f5f2ee", color: "#726c5a" }}>-2</code>,
          <code className="px-1 rounded" style={{ background: "#f5f2ee", color: "#726c5a" }}> -3</code> for extra images.
        </p>
        <p className="text-xs mt-1" style={{ color: "#8f8168" }}>
          e.g. <code>PC-001.jpg</code> (cover), <code>PC-001-2.jpg</code>, <code>PC-001-3.jpg</code> · added after any existing images
        </p>
      </div>

      {/* Dropzone */}
      <div
        className="border-2 border-dashed rounded-xl p-8 text-center mb-4 cursor-pointer transition-colors"
        style={{ borderColor: matched.length || unmatched.length ? "#726c5a" : "#cdc3ad" }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => { e.preventDefault(); handleFiles(await filesFromDrop(e.dataTransfer)); }}
      >
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        <svg className="mx-auto mb-2" width="24" height="24" fill="none" stroke="#cdc3ad" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-sm" style={{ color: "#6f5f48" }}>Drag a folder of photos here, or click to select files</p>
        <p className="text-xs mt-1" style={{ color: "#8f8168" }}>
          {loadingProducts ? "Loading products…" : `${products.length} products available to match`}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>{error}</div>
      )}

      {/* Match summary */}
      {(matched.length > 0 || unmatched.length > 0) && (
        <div className="mb-4">
          <div className="flex gap-4 mb-2 text-xs">
            <span style={{ color: "#10b981" }}><strong>{matched.length}</strong> matched → {groups.length} products</span>
            {unmatched.length > 0 && <span style={{ color: "#ef4444" }}><strong>{unmatched.length}</strong> unmatched</span>}
          </div>
          <div className="overflow-auto rounded-xl max-h-56" style={{ border: "1px solid #e6e5d8" }}>
            <table className="w-full text-xs min-w-max">
              <thead>
                <tr style={{ background: "#f5f2ee", borderBottom: "1px solid #e6e5d8" }}>
                  <th className="px-3 py-2 text-left font-medium" style={{ color: "#6f5f48" }}>Product</th>
                  <th className="px-3 py-2 text-left font-medium" style={{ color: "#6f5f48" }}>Code / RFID</th>
                  <th className="px-3 py-2 text-center font-medium" style={{ color: "#6f5f48" }}>Images</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.product.id} style={{ borderBottom: "1px solid #f5f2ee" }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#4c4847" }}>{g.product.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#6f5f48" }}>{g.product.productCode || g.product.rfidTag}</td>
                    <td className="px-3 py-2 text-center" style={{ color: "#4c4847" }}>{g.files.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unmatched.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs cursor-pointer" style={{ color: "#9f4a4a" }}>Show {unmatched.length} unmatched file(s)</summary>
              <div className="mt-1 p-2 rounded-lg max-h-28 overflow-y-auto" style={{ background: "#fff7f7" }}>
                {unmatched.map((n) => <p key={n} className="text-xs" style={{ color: "#9f4a4a" }}>{n}</p>)}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Progress */}
      {uploading && (
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1" style={{ color: "#6f5f48" }}>
            <span>Uploading…</span><span>{progress.done} / {progress.total}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "#f5f2ee" }}>
            <div className="h-full rounded-full transition-all" style={{ background: "#726c5a", width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={reset} disabled={uploading}
          className="flex-1 py-2.5 rounded-xl text-sm disabled:opacity-50" style={{ background: "#f5f2ee", color: "#4c4847" }}>
          Clear
        </button>
        <button onClick={handleUpload} disabled={matched.length === 0 || uploading}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "#726c5a" }}>
          {uploading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {uploading ? "Uploading…" : `Upload ${matched.length} image${matched.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
