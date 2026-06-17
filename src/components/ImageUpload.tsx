"use client";

import { useState } from "react";
import Image from "next/image";

interface Props {
  value: string;
  onChange: (url: string) => void;
}

export default function ImageUpload({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (data.url) onChange(data.url);
    setUploading(false);
  }

  return (
    <div>
      {/* Preview */}
      {value ? (
        <div className="relative w-full h-48 rounded-xl overflow-hidden mb-3"
          style={{ border: "1px solid #e6e5d8" }}>
          <Image src={value} alt="Product" fill className="object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs"
            style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
            ✕
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-48 rounded-xl cursor-pointer mb-3 transition-all"
          style={{ border: "2px dashed #cdc3ad", background: "#f5f2ee" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#e6e5d8")}
          onMouseLeave={e => (e.currentTarget.style.background = "#f5f2ee")}>
          <svg width="32" height="32" fill="none" stroke="#9f886c" strokeWidth="1.5" viewBox="0 0 24 24" className="mb-2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p className="text-sm" style={{ color: "#9f886c" }}>
            {uploading ? "Uploading..." : "Click to upload image"}
          </p>
          <p className="text-xs mt-1" style={{ color: "#cdc3ad" }}>PNG, JPG, WEBP</p>
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" disabled={uploading} />
        </label>
      )}
    </div>
  );
}