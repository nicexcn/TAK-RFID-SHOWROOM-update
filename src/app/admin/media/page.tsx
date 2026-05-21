"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface Product {
  id: string;
  rfidTag: string;
  name: string;
  brand: string | null;
  productCode: string | null;
}

interface ProductImage {
  id: string;
  url: string;
  order: number;
}

export default function MediaPage() {
  const [rfidTag, setRfidTag] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewImageIdx, setPreviewImageIdx] = useState(0);
  const [previewFade, setPreviewFade] = useState(true);

  // Auto-slide in preview
  useEffect(() => {
    if (!showPreview || images.length === 0) return;
    const timer = setTimeout(() => {
      setPreviewFade(false);
      setTimeout(() => {
        setPreviewImageIdx((p) => (p + 1) % images.length);
        setPreviewFade(true);
      }, 400);
    }, 4000);
    return () => clearTimeout(timer);
  }, [showPreview, previewImageIdx, images]);

  async function handleSearch() {
    if (!rfidTag.trim()) return;
    setSearching(true);
    setError("");
    setProduct(null);
    setImages([]);
    try {
      const res = await fetch(`/api/products/by-rfid/${rfidTag.trim()}`);
      if (!res.ok) { setError("Product not found"); setSearching(false); return; }
      const data = await res.json();
      setProduct(data);
      fetchImages(data.id);
    } catch {
      setError("Something went wrong");
    } finally {
      setSearching(false);
    }
  }

  async function fetchImages(productId: string) {
    const res = await fetch(`/api/products/${productId}/images`);
    const data = await res.json();
    setImages(data);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!product || !e.target.files?.length) return;
    setUploading(true);
    setSuccess("");
    const files = Array.from(e.target.files);
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await uploadRes.json();
      await fetch(`/api/products/${product.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, order: images.length }),
      });
    }
    await fetchImages(product.id);
    setSuccess(`${files.length} image(s) uploaded successfully`);
    setTimeout(() => setSuccess(""), 3000);
    setUploading(false);
    e.target.value = "";
  }

  async function handleDelete(imageId: string) {
    if (!product || !confirm("Delete this image?")) return;
    await fetch(`/api/products/${product.id}/images`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId }),
    });
    await fetchImages(product.id);
  }

  const inputStyle = {
    background: "#f5f2ee",
    border: "1px solid #e6e5d8",
    color: "#4c4847",
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Upload Media</h1>
        <p className="text-xs mt-1" style={{ color: "#9f886c" }}>Home / Upload Media</p>
      </div>

      {/* Search by RFID */}
      <div className="rounded-xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "#4c4847" }}>Find Product by RFID Tag</h2>
        <div className="flex gap-2">
          <input
            value={rfidTag}
            onChange={(e) => setRfidTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Enter RFID tag..."
            className="flex-1 px-4 py-3 rounded-xl outline-none text-sm"
            style={inputStyle}
          />
          <button onClick={handleSearch} disabled={searching}
            className="px-5 py-3 rounded-xl text-sm font-medium"
            style={{ background: "#726c5a", color: "#fff", opacity: searching ? 0.7 : 1 }}>
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
        {error && <p className="text-sm mt-2" style={{ color: "#9f4a4a" }}>{error}</p>}
      </div>

      {/* Product Info + Upload */}
      {product && (
        <div className="rounded-xl p-5" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
          {/* Product Info */}
          <div className="flex items-center justify-between mb-5 pb-4"
            style={{ borderBottom: "1px solid #e6e5d8" }}>
            <div>
              <p className="text-base font-semibold" style={{ color: "#4c4847" }}>{product.name}</p>
              <p className="text-xs mt-0.5" style={{ color: "#9f886c" }}>
                {product.brand} · {product.productCode || "No code"} · RFID: {product.rfidTag}
              </p>
            </div>
            <div className="flex gap-2">
              <label className={`px-5 py-2 rounded-xl text-sm font-medium cursor-pointer flex items-center gap-2 ${uploading ? "opacity-70 pointer-events-none" : ""}`}
                style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {uploading ? "Uploading..." : "Upload Images"}
                <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
              </label>

              {images.length > 0 && (
                <button
                  onClick={() => { setPreviewImageIdx(0); setPreviewFade(true); setShowPreview(true); }}
                  className="px-5 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
                  style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                    <path d="M8 21h8M12 17v4"/>
                  </svg>
                  Preview TV
                </button>
              )}

              <button
                onClick={() => { setSuccess("✓ Images saved successfully"); setTimeout(() => setSuccess(""), 3000); }}
                className="px-5 py-2 rounded-xl text-sm font-medium"
                style={{ background: "#726c5a", color: "#fff" }}>
                Save
              </button>
            </div>
          </div>

          {success && <p className="text-sm mb-4" style={{ color: "#4a9f4a" }}>{success}</p>}

          {/* Image Grid */}
          {images.length === 0 ? (
            <div className="text-center py-12">
              <svg width="40" height="40" fill="none" stroke="#cdc3ad" strokeWidth="1.5" viewBox="0 0 24 24" className="mx-auto mb-3">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="m21 15-5-5L5 21"/>
              </svg>
              <p className="text-sm" style={{ color: "#cdc3ad" }}>No images yet</p>
              <p className="text-xs mt-1" style={{ color: "#cdc3ad" }}>Upload images to display on TV</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {images.map((img, index) => (
                <div key={img.id} className="relative group rounded-xl overflow-hidden"
                  style={{ border: "1px solid #e6e5d8", aspectRatio: "9/16" }}>
                  <Image src={img.url} alt={`Image ${index + 1}`} fill className="object-cover" />
                  <div className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                    style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
                    {index + 1}
                  </div>
                  <button
                    onClick={() => handleDelete(img.id)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TV Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowPreview(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* TV Frame */}
            <div style={{
              width: 300,
              background: "#0d0c0b",
              borderRadius: 20,
              padding: 10,
              boxShadow: "0 0 0 2px #2a2825, 0 40px 80px rgba(0,0,0,0.8), 0 0 60px rgba(114,108,90,0.15)",
            }}>
              {/* Screen */}
              <div style={{
                width: "100%",
                aspectRatio: "9/16",
                borderRadius: 12,
                overflow: "hidden",
                position: "relative",
                background: "#111",
              }}>
                {/* Image */}
                {images[previewImageIdx] && (
                  <img
                    key={images[previewImageIdx].url}
                    src={images[previewImageIdx].url}
                    alt=""
                    style={{
                      width: "100%", height: "100%",
                      objectFit: "cover",
                      opacity: previewFade ? 1 : 0,
                      transition: "opacity 0.4s ease",
                      position: "absolute", inset: 0,
                    }}
                  />
                )}

                {/* Gradient overlay */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)",
                }} />

                {/* Logo center top */}
                    <div style={{
                    position: "absolute",
                    top: 20,
                    left: 0,
                    right: 0,
                    display: "flex",
                    justifyContent: "center",
                    }}>
                <img src="/w-logo.png" alt="NimitrLog" style={{ height: 28, objectFit: "contain" }} />
                </div>
                
                {/* Product info */}
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  padding: "20px 16px 16px",
                  opacity: previewFade ? 1 : 0,
                  transition: "opacity 0.4s ease",
                }}>
                  <div style={{ color: "#fff", fontSize: 16, fontWeight: "bold", marginBottom: 2 }}>
                    {product?.name}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1 }}>
                    {product?.productCode} · {product?.brand}
                  </div>
                </div>

                {/* Dots */}
                {images.length > 1 && (
                  <div style={{
                    position: "absolute", bottom: 16, right: 14,
                    display: "flex", flexDirection: "column", gap: 3,
                  }}>
                    {images.map((_, i) => (
                      <div key={i} style={{
                        width: 3,
                        height: i === previewImageIdx ? 12 : 3,
                        borderRadius: 2,
                        background: i === previewImageIdx ? "#fff" : "rgba(255,255,255,0.3)",
                        transition: "all 0.3s ease",
                      }} />
                    ))}
                  </div>
                )}
              </div>

              {/* TV bottom bar */}
              <div style={{ display: "flex", justifyContent: "center", marginTop: 8, gap: 4, alignItems: "center" }}>
                <div style={{ width: 32, height: 2, background: "#2a2825", borderRadius: 2 }} />
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#2a2825" }} />
                <div style={{ width: 32, height: 2, background: "#2a2825", borderRadius: 2 }} />
              </div>
            </div>

            {/* Image counter + close */}
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                {previewImageIdx + 1} / {images.length}
              </span>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontSize: 13,
                  cursor: "pointer",
                }}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}