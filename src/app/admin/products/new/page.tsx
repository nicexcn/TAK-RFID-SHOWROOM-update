"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import SearchableSelect from "@/components/SearchableSelect";
import AutocompleteInput from "@/components/AutocompleteInput";
import ProductImagePicker from "@/components/ProductImagePicker";
import { useWebSocket } from "@/hooks/useWebSocket";
import { normalizeReaders, readerUrl, type SavedReader } from "@/lib/readers";

interface DropdownOption {
  id: string;
  value: string;
}

export default function NewProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    rfidTag: "",
    brand: "",
    materialType: "",
    category: "",
    productCode: "",
    name: "",
    location: "",
    size: "",
    colour: "",
    description: "",
  });
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const [brands, setBrands] = useState<DropdownOption[]>([]);
  const [materialTypes, setMaterialTypes] = useState<DropdownOption[]>([]);
  const [categories, setCategories] = useState<DropdownOption[]>([]);

  useEffect(() => {
    async function fetchOptions() {
      const [b, m, c] = await Promise.all([
        fetch("/api/dropdown?type=brand").then((r) => r.json()),
        fetch("/api/dropdown?type=materialType").then((r) => r.json()),
        fetch("/api/dropdown?type=category").then((r) => r.json()),
      ]);
      setBrands(b);
      setMaterialTypes(m);
      setCategories(c);
    }
    fetchOptions();
  }, []);

  // ── Scan-to-fill the RFID tag (reuses the reader registry + relay) ─────────
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [relayBase, setRelayBase] = useState("");
  const [scanReaders, setScanReaders] = useState<SavedReader[]>([]);
  const [scanReaderId, setScanReaderId] = useState("");
  const capturedRef = useRef(false);

  useEffect(() => {
    fetch("/api/display/config").then((r) => r.json()).then((c) => {
      const cfg = String(c?.relayUrl || "").replace(/\/+$/, "");
      // HTTPS uses the configured (wss) relay; local HTTP uses the same host on :8081.
      setRelayBase(typeof window !== "undefined" && window.location.protocol === "https:" ? cfg : `ws://${window.location.hostname}:8081`);
      const rs = normalizeReaders(c?.readers);
      setScanReaders(rs);
      setScanReaderId((id) => id || rs[0]?.id || "");
    }).catch(() => {});
  }, []);

  // Listen to the chosen saved reader (or all readers via the relay if none picked).
  const scanReader = scanReaders.find((r) => r.id === scanReaderId);
  const scanUrl = scanReader ? readerUrl(scanReader, relayBase) : (relayBase ? `${relayBase}/` : "");

  const onScannedTag = useCallback((epc: string) => {
    if (capturedRef.current || !epc) return; // capture only the first read per Scan press
    capturedRef.current = true;
    setForm((p) => ({ ...p, rfidTag: epc }));
    setScanning(false);
    setScanMsg(`✓ Captured tag: ${epc}`);
  }, []);

  const scanWs = useWebSocket({ url: scanUrl, onTag: onScannedTag, enabled: scanning && !!scanUrl });
  const scanConnect = scanWs.connect;
  const scanDisconnect = scanWs.disconnect;
  useEffect(() => {
    if (scanning && scanUrl) scanConnect();
    else scanDisconnect();
  }, [scanning, scanUrl, scanConnect, scanDisconnect]);

  function toggleScan() {
    if (scanning) { setScanning(false); return; }
    setScanMsg(""); setError(""); capturedRef.current = false; setScanning(true);
  }

  const inputStyle = {
    background: "#f5f2ee",
    border: "1px solid #e6e5d8",
    color: "#4c4847",
  };

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  }

  function handleSelect(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit() {
    if (!form.rfidTag || !form.name) {
      setError("Please fill in required fields (RFID Tag, Product Name)");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, imageUrls }),
      });
      if (res.ok) {
        router.push("/admin/products");
      } else {
        const body = await res.json().catch(() => ({} as { error?: string }));
        setError(body.error || "Failed to create product");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Add Product</h1>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Product Management", href: "/admin/products" }, { label: "Add Product" }]} />
        </div>
        <button onClick={() => router.push("/admin/products")}
          className="px-5 py-2 rounded-xl text-sm"
          style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }}>
          ← Back 
        </button>
      </div>

      <div className="rounded-xl p-6 " style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
        <div className="space-y-4">

          {/* RFID Tag — scan with a reader, or type it */}
          <div>
            <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>
              RFID Tag <span style={{ color: "#9f4a4a" }}>*</span>
            </label>
            <div className="flex gap-2">
              <input name="rfidTag" value={form.rfidTag} onChange={handleChange}
                placeholder="Scan, or type the RFID tag (e.g. WY7204X)"
                className="flex-1 px-4 py-3 rounded-xl outline-none text-sm min-w-0" style={inputStyle} />
              {scanReaders.length > 0 && (
                <select value={scanReaderId} onChange={(e) => setScanReaderId(e.target.value)} title="Reader to scan with"
                  className="px-3 py-3 rounded-xl outline-none text-sm" style={inputStyle}>
                  {scanReaders.map((r) => <option key={r.id} value={r.id}>{r.name || r.device || r.url}</option>)}
                </select>
              )}
              <button type="button" onClick={toggleScan} disabled={!scanning && !scanUrl}
                className="px-4 py-3 rounded-xl text-sm font-medium whitespace-nowrap text-white disabled:opacity-50"
                style={{ background: scanning ? "#9f4a4a" : "#4a6fa5" }}>
                {scanning ? "■ Stop" : "📡 Scan"}
              </button>
            </div>
            {scanning ? (
              <p className="text-xs mt-1" style={{ color: "#4a6fa5" }}>
                {scanWs.isConnected ? "Listening — hold the tag near the reader…" : "Connecting to reader…"}
              </p>
            ) : scanMsg ? (
              <p className="text-xs mt-1" style={{ color: "#4a7c59" }}>{scanMsg}</p>
            ) : !scanUrl ? (
              <p className="text-xs mt-1" style={{ color: "#cdc3ad" }}>To scan, set the Cloud Relay URL in Settings (or run a local relay). You can also just type the tag.</p>
            ) : (
              <p className="text-xs mt-1" style={{ color: "#cdc3ad" }}>Hold a tag near the reader and press Scan, or type it manually.</p>
            )}
          </div>

          {/* Product Code */}
          <div>
            <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Product Code</label>
            <input name="productCode" value={form.productCode} onChange={handleChange}
              placeholder="e.g. WY7204X"
              className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
          </div>

          {/* Brand + Material Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Brand</label>
              <SearchableSelect
                options={brands}
                value={form.brand}
                onChange={(v) => handleSelect("brand", v)}
                placeholder="Select brand"
              />
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Material Type</label>
              <SearchableSelect
                options={materialTypes}
                value={form.materialType}
                onChange={(v) => handleSelect("materialType", v)}
                placeholder="Select material type"
              />
            </div>
          </div>

          {/* Category + Product Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Category</label>
              <SearchableSelect
                options={categories}
                value={form.category}
                onChange={(v) => handleSelect("category", v)}
                placeholder="Select category"
                searchable
              />
            </div>
            <div>
            <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>
                Product Name <span style={{ color: "#9f4a4a" }}>*</span>
            </label>
            <AutocompleteInput
                value={form.name}
                onChange={(v) => handleSelect("name", v)}
                placeholder="Type product name..."
                fetchUrl="/api/products/names"
            />
            </div>
          </div>

          {/* Location + physical attributes (customer req #2: track product location) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Location (ตำแหน่งในโชว์รูม)</label>
              <input name="location" value={form.location} onChange={handleChange} placeholder="เช่น โซน A ชั้น 2"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Size</label>
              <input name="size" value={form.size} onChange={handleChange} placeholder="เช่น 60x60 cm"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Colour</label>
              <input name="colour" value={form.colour} onChange={handleChange} placeholder="เช่น Walnut"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Description</label>
              <input name="description" value={form.description} onChange={handleChange} placeholder="รายละเอียดสั้นๆ"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
          </div>
          </div>

          {/* Images — multiple, first is the cover */}
          <div>
            <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>
              Product Images
            </label>
            <ProductImagePicker urls={imageUrls} onChange={setImageUrls} />
          </div>

          {error && <p className="text-sm" style={{ color: "#9f4a4a" }}>{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSubmit} disabled={loading}
              className="px-6 py-3 rounded-xl text-sm font-medium"
              style={{ background: "#726c5a", color: "#fff", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Saving..." : "Save Product"}
            </button>
            <button onClick={() => router.push("/admin/products")}
              className="px-6 py-3 rounded-xl text-sm"
              style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
  );
}