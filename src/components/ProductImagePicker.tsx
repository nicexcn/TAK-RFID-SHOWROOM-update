"use client";

import { useState } from "react";
import Image from "next/image";
import { uploadImage } from "@/lib/uploadImage";

// Multi-image picker for the CREATE flow (the product has no id yet). Each selected file
// is uploaded to storage immediately (signed URL → public URL) and the resulting URLs are
// held locally; the parent attaches them on save (POST /api/products { imageUrls }). The
// first image (order 0) is the cover. Mirrors ProductGallery's grid so Add looks like Edit.
export default function ProductImagePicker({
  urls,
  onChange,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    setUploading(true);
    setError("");
    const files = Array.from(e.target.files);
    try {
      const next = [...urls];
      for (const file of files) {
        next.push(await uploadImage(file)); // appended in selection order
      }
      onChange(next);
    } catch {
      setError("Failed to upload one or more images");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removeAt(index: number) {
    onChange(urls.filter((_, i) => i !== index));
  }

  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const next = [...urls];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
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
        Pick several at once — drag to reorder; the first image is the cover and they play as a slideshow on the TV.
      </p>

      {error && <p className="text-sm mt-2" style={{ color: "#9f4a4a" }}>{error}</p>}

      {/* Image grid */}
      {urls.length === 0 ? (
        <div className="mt-3 rounded-xl text-center py-10" style={{ border: "1px dashed #e6e5d8" }}>
          <p className="text-sm" style={{ color: "#8f8168" }}>No images yet</p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
          {urls.map((url, index) => (
            <div
              key={url + index}
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
              <Image src={url} alt={`Image ${index + 1}`} fill className="object-cover pointer-events-none" />
              {index === 0 ? (
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: "#726c5a", color: "#fff" }}>
                  Cover
                </div>
              ) : (
                <div className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium"
                  style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
                  {index + 1}
                </div>
              )}

              {index !== 0 && (
                <button type="button" onClick={() => reorder(index, 0)}
                  className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
                  ★ Make cover
                </button>
              )}

              <button type="button" onClick={() => removeAt(index)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
