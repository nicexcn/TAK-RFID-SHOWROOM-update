"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface ProductImage {
  id: string;
  url: string;
  order: number;
}

interface Product {
  id: string;
  name: string;
  imageUrl: string | null;
  images: ProductImage[];
}

interface Scan {
  id: string;
  product: Product;
}

interface Session {
  id: string;
  scans: Scan[];
}

export default function DisplayPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [currentScanIndex, setCurrentScanIndex] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Poll session ทุก 3 วินาที
  useEffect(() => {
    async function fetchSession() {
      const res = await fetch("/api/sessions/display");
      const data: Session = await res.json();
      if (data?.scans?.length > 0) {
        setScans(data.scans);
      }
    }
    fetchSession();
    const interval = setInterval(fetchSession, 3000);
    return () => clearInterval(interval);
  }, []);

  // สลับรูปอัตโนมัติ
  useEffect(() => {
    if (scans.length === 0) return;

    const currentScan = scans[currentScanIndex];
    const images = currentScan?.product?.images ?? [];
    const allImages = images.length > 0
      ? images.map(i => i.url)
      : currentScan?.product?.imageUrl
        ? [currentScan.product.imageUrl]
        : [];

    if (allImages.length === 0) {
      // ไม่มีรูป ไปสินค้าถัดไปเลย
      const timer = setTimeout(() => {
        setCurrentScanIndex((prev) => (prev + 1) % scans.length);
        setCurrentImageIndex(0);
      }, 3000);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      if (currentImageIndex < allImages.length - 1) {
        // ยังมีรูปถัดไปในสินค้าเดียวกัน
        setCurrentImageIndex((prev) => prev + 1);
      } else {
        // ครบรูปแล้ว ไปสินค้าถัดไป
        setCurrentScanIndex((prev) => (prev + 1) % scans.length);
        setCurrentImageIndex(0);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [scans, currentScanIndex, currentImageIndex]);

  const currentScan = scans[currentScanIndex];
  const images = currentScan?.product?.images ?? [];
  const allImages = images.length > 0
    ? images.map(i => i.url)
    : currentScan?.product?.imageUrl
      ? [currentScan.product.imageUrl]
      : [];
  const currentImage = allImages[currentImageIndex];

  return (
    <div className="relative w-screen h-screen overflow-hidden"
      style={{ background: "#1a1a1a" }}>

      {/* Background Image */}
      {currentImage ? (
        <Image
          key={currentImage}
          src={currentImage}
          alt={currentScan?.product?.name || ""}
          fill
          className="object-cover"
          style={{ transition: "opacity 0.8s ease" }}
          priority
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center"
          style={{ background: "#f5f2ee" }}>
          <Image src="/w-logo.png" alt="nimitrlab" width={200} height={70} className="object-contain mb-4" />
          <p style={{ color: "#9f886c", fontSize: 14 }}>Waiting for scan...</p>
        </div>
      )}

      {/* Overlay gradient */}
      {currentImage && (
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 50%)" }} />
      )}

      {/* Logo top-left */}
      {currentImage && (
        <div className="absolute top-8 left-8">
          <Image src="/w-logo.png" alt="nimitrlab" width={120} height={40} className="object-contain" />
        </div>
      )}

      {/* Dots bottom - image indicator */}
      {allImages.length > 1 && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2">
          {allImages.map((_, i) => (
            <div key={i} className="rounded-full transition-all duration-300"
              style={{
                width: i === currentImageIndex ? 20 : 8,
                height: 8,
                background: i === currentImageIndex ? "#fff" : "rgba(255,255,255,0.4)",
              }} />
          ))}
        </div>
      )}
    </div>
  );
}