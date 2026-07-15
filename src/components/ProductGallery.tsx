"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { uploadImage } from "@/lib/uploadImage";

interface ProductImage {
  id: string;
  url: string;
  order: number;
}

// Multi-image manager for a single product. The FIRST image (order asc) is the
// cover/thumbnail — the server keeps Product.imageUrl in sync (syncCover). Drag a
// tile to reorder; the optional onCoverChange callback lets the parent form mirror
// the cover so a Save won't overwrite it with a stale value.
export default function ProductGallery({
  productId,
  onCoverChange,
}: {
  productId: string;
  onCoverChange?: (url: string) => void;
}) {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (productId) fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function fetchImages() {
    const res = await fetch(`/api/products/${productId}/images`);
    const data: ProductImage[] = await res.json();
    setImages(data);
    onCoverChange?.(data[0]?.url ?? "");
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    setUploading(true);
    setError("");
    const files = Array.from(e.target.files);
    try {
      let order = images.length;
      for (const file of files) {
        const url = await uploadImage(file);
        await fetch(`/api/products/${productId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, order: order++ }),
        });
      }
      await fetchImages();
    } catch {
      setError("Failed to upload one or more images");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(imageId: string) {
    if (!confirm("Delete this image?")) return;
    await fetch(`/api/products/${productId}/images`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId }),
    });
    await fetchImages();
  }

  // Persist a new order optimistically, then reconcile with the server.
  async function persistOrder(next: ProductImage[]) {
    setImages(next);
    onCoverChange?.(next[0]?.url ?? "");
    try {
      await fetch(`/api/products/${productId}/images`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next.map((i) => i.id) }),
      });
    } finally {
      fetchImages(); // re-sync (also reverts if the PUT failed)
    }
  }

  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistOrder(next);
  }

  return (
    <div>
      {/* Upload control */}
      <label
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer ${uploading ? "opacity-70 pointer-events-none" : ""}`}
        style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {uploading ? "Uploading..." : "Upload Images"}
        <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
      </label>
      <p className="text-xs mt-1" style={{ color: "#6f5f48" }}>
        Drag to reorder — the first image is the cover and they play as a slideshow on the TV.
      </p>

      {error && <p className="text-sm mt-2" style={{ color: "#9f4a4a" }}>{error}</p>}

      {/* Image grid */}
      {images.length === 0 ? (
        <div className="mt-3 rounded-xl text-center py-10" style={{ border: "1px dashed #e6e5d8" }}>
          <p className="text-sm" style={{ color: "#71654c" }}>No images yet</p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
          {images.map((img, index) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => { e.preventDefault(); if (overIndex !== index) setOverIndex(index); }}
              onDrop={() => { if (dragIndex !== null) reorder(dragIndex, index); setDragIndex(null); setOverIndex(null); }}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
              className="relative group rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
              style={{
                border: index === 0 ? "2px solid #726c5a" : "1px solid #e6e5d8",
                aspectRatio: "9/16",
                opacity: dragIndex === index ? 0.4 : 1,
                outline: overIndex === index && dragIndex !== index ? "2px dashed #726c5a" : "none",
                outlineOffset: -2,
                transition: "opacity 0.15s ease",
              }}
            >
              <Image src={img.url} alt={`Image ${index + 1}`} fill className="object-cover pointer-events-none" />
              {index === 0 ? (
                <div
                  className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: "#726c5a", color: "#fff" }}
                >
                  Cover
                </div>
              ) : (
                <div
                  className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium"
                  style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
                >
                  {index + 1}
                </div>
              )}

              {/* Make cover — touch-friendly alternative to dragging to the front */}
              {index !== 0 && (
                <button
                  type="button"
                  onClick={() => reorder(index, 0)}
                  className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
                >
                  ★ Make cover
                </button>
              )}

              <button
                type="button"
                onClick={() => handleDelete(img.id)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
