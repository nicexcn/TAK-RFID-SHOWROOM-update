"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { useWebSocket } from "@/hooks/useWebSocket";
import { normalizeReaders, readerUrl, type SavedReader } from "@/lib/readers";
import { supabaseBrowser, DISPLAY_CHANNEL, DISPLAY_EVENT } from "@/lib/supabaseBrowser";

/**
 * Unified TV display (one physical screen).
 * Two content sources, arbitrated:
 *   1. TABLE (fix reader, presence): a tile physically on the table → show it live;
 *      removed → drops after PRESENCE_TTL. This is the default/ambient mode.
 *   2. SESSION (handheld): when staff press "Send to Display", show that customer's
 *      accumulated list — but only while the table is clear (physical presence wins).
 *
 * Priority: tile-on-table  >  sent-customer-list  >  idle.
 */
const PRESENCE_TTL = 5000;
const IMAGE_MS = 5000;
const POLL_MS = 3000;
const READER_KEY = "tak-table-reader-ip";

interface ImgRef { url: string }
interface DProduct {
  rfidTag?: string; name: string; brand?: string | null; category?: string | null;
  materialType?: string | null; imageUrl?: string | null; images: ImgRef[];
}
interface SessionScan { id: string; product: DProduct }

function imagesOf(p?: DProduct): string[] {
  if (!p) return [];
  return p.images?.length ? p.images.map((i) => i.url) : p.imageUrl ? [p.imageUrl] : [];
}

export default function DisplayPage() {
  const [productMap, setProductMap] = useState<Map<string, DProduct>>(new Map());
  const [imageMs, setImageMs] = useState(IMAGE_MS); // per-image slide duration (from Settings)
  const [relayUrl, setRelayUrl] = useState(""); // Option E cloud relay base (from Settings)
  const [cloudRoom, setCloudRoom] = useState(""); // optional device_id filter for the relay (empty = all readers)
  const [savedReaders, setSavedReaders] = useState<SavedReader[]>([]); // central registry (from Settings)
  const presentRef = useRef<Map<string, number>>(new Map());
  const preloadedRef = useRef<Set<string>>(new Set());
  const unknownRef = useRef<Map<string, number>>(new Map());
  const [presentEpcs, setPresentEpcs] = useState<string[]>([]);
  const [unknownEpcs, setUnknownEpcs] = useState<string[]>([]);
  const [sessionProducts, setSessionProducts] = useState<DProduct[]>([]);
  const [idx, setIdx] = useState(0);
  const [imgIdx, setImgIdx] = useState(0);
  // Two ping-pong image layers. The incoming one always REMOUNTS (its key is the
  // src) so the fade keyframe replays every time — including for cached images,
  // which an onLoad/opacity-state approach would skip (cache → no paint at 0 →
  // no transition). The other layer keeps its previous image at opacity 1 and is
  // never unmounted, so the dark background is never exposed (no black flash).
  const [slotA, setSlotA] = useState("");
  const [slotB, setSlotB] = useState("");
  const [active, setActive] = useState<"a" | "b">("a");
  const viewRef = useRef<{ a: string; b: string; active: "a" | "b" }>({ a: "", b: "", active: "a" });

  const [readerIp, setReaderIp] = useState("");
  const [ipDraft, setIpDraft] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [simOn, setSimOn] = useState(false);

  // Product map (for presence lookup) + saved reader IP
  useEffect(() => {
    fetch("/api/display/products").then((r) => r.json()).then((items: DProduct[]) => {
      const m = new Map<string, DProduct>();
      for (const p of items || []) if (p.rfidTag) m.set(p.rfidTag, p);
      setProductMap(m);
    }).catch(() => {});
    fetch("/api/display/config").then((r) => r.json()).then((c) => {
      if (c?.slideDuration) setImageMs(Math.max(1, Number(c.slideDuration)) * 1000);
      if (c?.relayUrl) setRelayUrl(c.relayUrl);
      setSavedReaders(normalizeReaders(c?.readers));
    }).catch(() => {});
    const ip = (typeof window !== "undefined" && window.localStorage.getItem(READER_KEY)) || "";
    setReaderIp(ip); setIpDraft(ip);
  }, []);

  // Source 1: fix-reader presence
  const onTag = useCallback((epc: string) => {
    if (productMap.has(epc)) {
      presentRef.current.set(epc, Date.now());
      unknownRef.current.delete(epc);
    } else {
      // streamed by the reader but not in the DB — surface in ⚙ for setup debugging
      unknownRef.current.set(epc, Date.now());
    }
  }, [productMap]);
  const ws = useWebSocket({ url: readerIp, onTag, enabled: !!readerIp && !simOn });

  // The TV display auto-connects once a reader URL is configured (no manual
  // connect step beyond entering it / loading it from localStorage).
  const wsConnect = ws.connect;
  useEffect(() => {
    if (readerIp && !simOn) wsConnect();
  }, [readerIp, simOn, wsConnect]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      for (const [epc, seen] of presentRef.current) if (now - seen > PRESENCE_TTL) presentRef.current.delete(epc);
      const cur = [...presentRef.current.keys()];
      setPresentEpcs((prev) => {
        const set = new Set(cur);
        const kept = prev.filter((e) => set.has(e));
        const added = cur.filter((e) => !prev.includes(e));
        if (kept.length === prev.length && added.length === 0) return prev;
        return [...kept, ...added];
      });
      // Same TTL prune for unknown tags (so removing the unregistered tile clears it).
      for (const [epc, seen] of unknownRef.current) if (now - seen > PRESENCE_TTL) unknownRef.current.delete(epc);
      const unk = [...unknownRef.current.keys()];
      setUnknownEpcs((prev) => {
        const set = new Set(unk);
        const kept = prev.filter((e) => set.has(e));
        const added = unk.filter((e) => !prev.includes(e));
        if (kept.length === prev.length && added.length === 0) return prev;
        return [...kept, ...added];
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Source 2: the "Sent to Display" customer list. Driven by Supabase Realtime
  // Broadcast — the server nudges us the instant a session is sent / scanned /
  // ended, so we refetch /api/sessions/display immediately (keeping all the
  // arbitration + idle logic server-side). A slow fallback poll covers the rare
  // case where the realtime socket drops. Without realtime env, degrades to the
  // original short poll.
  useEffect(() => {
    let alive = true;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    async function load() {
      try {
        const r = await fetch("/api/sessions/display");
        const data = await r.json();
        if (!alive) return;
        const scans: SessionScan[] = data?.scans || [];
        setSessionProducts(scans.map((s) => s.product).filter(Boolean));
      } catch { /* keep last */ }
    }
    const refetch = () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(load, 150); };

    load(); // initial

    let channel: ReturnType<NonNullable<typeof supabaseBrowser>["channel"]> | null = null;
    if (supabaseBrowser) {
      channel = supabaseBrowser.channel(DISPLAY_CHANNEL);
      channel.on("broadcast", { event: DISPLAY_EVENT }, refetch).subscribe();
    }
    // Fallback: 30s when realtime is active (safety net), else the old short poll.
    const t = setInterval(load, supabaseBrowser ? 30000 : POLL_MS);

    return () => {
      alive = false;
      if (debounce) clearTimeout(debounce);
      clearInterval(t);
      if (channel && supabaseBrowser) supabaseBrowser.removeChannel(channel);
    };
  }, []);

  // Arbitration: table presence wins; else sent customer list; else idle
  const presenceProducts = presentEpcs.map((e) => productMap.get(e)).filter(Boolean) as DProduct[];
  const mode: "table" | "session" | "idle" =
    presenceProducts.length > 0 ? "table" : sessionProducts.length > 0 ? "session" : "idle";
  const products = mode === "table" ? presenceProducts : mode === "session" ? sessionProducts : [];

  useEffect(() => { if (idx >= products.length && products.length > 0) { setIdx(0); setImgIdx(0); } }, [products.length, idx]);

  // Preload ONLY the images currently on display (tiles placed on the table /
  // sent to the screen) — not the whole catalog at once. Loads incrementally as
  // tiles are added, so those rotate & crossfade smoothly without a big up-front
  // fetch burst. The ref makes each URL load at most once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    for (const p of products) {
      for (const url of imagesOf(p)) {
        if (!url || preloadedRef.current.has(url)) continue;
        preloadedRef.current.add(url);
        const img = new window.Image();
        img.decoding = "async";
        img.src = url;
      }
    }
  }, [products]);

  const current = products.length ? products[idx % products.length] : undefined;
  const curImages = imagesOf(current);
  const currentImage = curImages[imgIdx];
  // Depend on PRIMITIVES only. `curImages` is a fresh array every render, so
  // including it here made the cycle timeout reset on every unrelated re-render
  // (e.g. the 3s session poll) before the 5s timer could ever fire — the slide
  // never advanced. imgCount + curKey are stable across those re-renders.
  const imgCount = curImages.length;
  const curKey = current?.rfidTag ?? current?.name ?? "";

  useEffect(() => {
    if (products.length === 0) return;
    const t = setTimeout(() => {
      if (imgCount > 1 && imgIdx < imgCount - 1) setImgIdx(imgIdx + 1);
      else { setImgIdx(0); setIdx((i) => (i + 1) % products.length); }
    }, imgCount ? imageMs : 3000);
    return () => clearTimeout(t);
  }, [products.length, idx, imgIdx, imgCount, curKey, imageMs]);

  // Crossfade that waits for the image to actually load. The old image stays
  // fully opaque underneath; the new one is mounted hidden and only fades in
  // AFTER its onLoad fires — so a slow-loading image can never expose the dark
  // background (that was the residual black flash). Promotion to `base` happens
  // after the fade, so the old layer is never removed before the new is ready.
  useEffect(() => {
    const v = viewRef.current;
    if (!currentImage) { v.a = ""; v.b = ""; setSlotA(""); setSlotB(""); return; }
    const showing = v.active === "a" ? v.a : v.b;
    if (showing === currentImage) return;
    // Load the new image into the OTHER slot and make it active (fades in on top).
    if (v.active === "a") { v.b = currentImage; v.active = "b"; setSlotB(currentImage); setActive("b"); }
    else { v.a = currentImage; v.active = "a"; setSlotA(currentImage); setActive("a"); }
  }, [currentImage]);

  // Demo simulator (table presence)
  useEffect(() => {
    if (!simOn || productMap.size === 0) return;
    const epcs = [...productMap.keys()];
    const st = { tiles: [] as string[], holdUntil: 0, nextAt: 0 };
    const t = setInterval(() => {
      const now = Date.now();
      if (now < st.holdUntil) for (const e of st.tiles) presentRef.current.set(e, now);
      else if (now >= st.nextAt) {
        const n = 1 + Math.floor(Math.random() * 3);
        st.tiles = Array.from({ length: n }, () => epcs[Math.floor(Math.random() * epcs.length)]);
        st.holdUntil = now + 8000; st.nextAt = now + 8000 + 5000;
        for (const e of st.tiles) presentRef.current.set(e, now);
      }
    }, 700);
    return () => { clearInterval(t); presentRef.current.clear(); };
  }, [simOn, productMap]);

  function connect() {
    const ip = ipDraft.trim(); if (!ip) return;
    window.localStorage.setItem(READER_KEY, ip); setReaderIp(ip); setShowConfig(false);
  }

  // Option E: subscribe via the central relay. device_id is in every payload, so no room
  // is needed — connect to the relay base for ALL readers, or add ?device=<id> to show
  // only one reader (e.g. the table reader on this screen).
  function connectViaRelay() {
    if (!relayUrl) return;
    const base = relayUrl.replace(/\/+$/, "");
    const dev = cloudRoom.trim();
    const url = dev ? `${base}/?device=${encodeURIComponent(dev)}` : `${base}/`;
    setIpDraft(url);
    window.localStorage.setItem(READER_KEY, url); setReaderIp(url); setShowConfig(false);
  }

  // Pick a reader by NAME from the central registry → resolve to its subscriber URL + connect.
  function applySavedReader(url: string) {
    if (!url) return;
    setIpDraft(url);
    window.localStorage.setItem(READER_KEY, url); setReaderIp(url); setShowConfig(false);
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#1a1a1a" }}>
      {(slotA || slotB) ? (
        // Wrapper is its own stacking context at z-index 0 so the per-layer
        // z-indexes below stay LOCAL to it — otherwise they'd paint over the
        // gradient/label/⚙ overlay (which sits at the default z-index).
        <div className="absolute inset-0" style={{ zIndex: 0 }}>
          {slotA && (
            <Image key={"a:" + slotA} src={slotA} alt={current?.name || ""} fill priority unoptimized
              className="object-cover absolute inset-0"
              style={active === "a"
                ? { zIndex: 2, animation: "takImgFade 0.7s ease forwards" }
                : { zIndex: 1, opacity: 1 }} />
          )}
          {slotB && (
            <Image key={"b:" + slotB} src={slotB} alt={current?.name || ""} fill priority unoptimized
              className="object-cover absolute inset-0"
              style={active === "b"
                ? { zIndex: 2, animation: "takImgFade 0.7s ease forwards" }
                : { zIndex: 1, opacity: 1 }} />
          )}
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center" style={{ background: "#f5f2ee" }}>
          {/* Idle screen is light (#f5f2ee) → use the dark logo. (The over-image logo below stays white.) */}
          <Image src="/b-logo.png" alt="nimitrlab" width={200} height={70} className="object-contain mb-4" />
          <p style={{ color: "#9f886c", fontSize: 14 }}>วางสินค้าบนโต๊ะ หรือส่งรายการขึ้นจอ…</p>
        </div>
      )}

      {currentImage && (
        <>
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 45%)" }} />
          <div className="absolute top-8 left-8"><Image src="/w-logo.png" alt="nimitrlab" width={120} height={40} className="object-contain" /></div>
          <div className="absolute bottom-12 left-12 text-white">
            <p className="text-4xl font-semibold drop-shadow">{current?.name}</p>
            <p className="text-lg opacity-90 mt-1 drop-shadow">{[current?.brand, current?.materialType, current?.category].filter(Boolean).join(" · ")}</p>
          </div>
          {/* source badge + position dots */}
          <div className="absolute bottom-12 right-12 flex items-center gap-3">
            {products.length > 1 && (
              <div className="flex items-center gap-2">
                {products.map((_, i) => (
                  <div key={i} className="rounded-full transition-all" style={{ width: i === idx % products.length ? 22 : 8, height: 8, background: i === idx % products.length ? "#fff" : "rgba(255,255,255,0.4)" }} />
                ))}
              </div>
            )}
            <span className="text-white text-sm opacity-80">
              {mode === "table" ? `${products.length} ชิ้นบนโต๊ะ` : "รายการของลูกค้า"}
            </span>
          </div>
        </>
      )}

      {/* status + config */}
      <div className="absolute top-6 right-6 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: simOn ? "#c07a30" : ws.isConnected ? "#10b981" : "#9f4a4a" }} />
        <span className="text-xs" style={{ color: currentImage ? "#fff" : "#9f886c" }}>
          {mode === "table" ? "โต๊ะ (สด)" : mode === "session" ? "ส่งขึ้นจอ" : "พัก"} · {simOn ? "จำลอง" : ws.isConnected ? readerIp : readerIp ? "กำลังเชื่อม…" : "ไม่มี reader"}
        </span>
        <button onClick={() => setShowConfig((s) => !s)} className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }}>⚙</button>
      </div>

      {showConfig && (
        <div className="absolute top-14 right-6 p-4 rounded-xl" style={{ background: "rgba(20,20,20,0.92)", border: "1px solid #444", minWidth: 280 }}>
          {savedReaders.length > 0 && (
            <div className="mb-3 pb-3" style={{ borderBottom: "1px solid #444" }}>
              <p className="text-white/60 text-[11px] mb-1">Saved readers</p>
              <select value="" onChange={(e) => applySavedReader(e.target.value)}
                className="w-full px-2 py-1.5 rounded outline-none text-xs" style={{ background: "#333", color: "#fff" }}>
                <option value="">เลือก reader…</option>
                {savedReaders.map((r) => {
                  const url = readerUrl(r, relayUrl);
                  return <option key={r.id} value={url} disabled={!url}>{r.name || r.device || r.url}</option>;
                })}
              </select>
            </div>
          )}
          <p className="text-white text-sm mb-2">Fix Reader (โต๊ะ)</p>
          <input value={ipDraft} onChange={(e) => setIpDraft(e.target.value)}
            placeholder="192.168.1.104  หรือ  wss://xxx.ngrok-free.app"
            className="w-full px-2 py-1.5 rounded outline-none text-xs mb-2" style={{ background: "#333", color: "#fff" }} />
          <p className="text-white/40 text-[10px] mb-2">IP บน LAN (HTTP) หรือ wss:// (ngrok) เมื่อหน้านี้เป็น HTTPS</p>
          <div className="flex gap-2">
            <button onClick={connect} className="px-3 py-1.5 rounded text-xs text-white flex-1" style={{ background: "#4a6fa5" }}>เชื่อมต่อ</button>
            <button onClick={() => setSimOn((s) => !s)} className="px-3 py-1.5 rounded text-xs text-white flex-1" style={{ background: simOn ? "#9f4a4a" : "#726c5a" }}>{simOn ? "หยุดจำลอง" : "จำลอง"}</button>
          </div>

          {relayUrl && (
            // Option E: subscribe via the cloud relay. Leave the field empty for ALL readers,
            // or enter a device_id to show only that reader on this screen.
            <div className="mt-2 pt-2" style={{ borderTop: "1px solid #444" }}>
              <p className="text-white/60 text-[11px] mb-1">Cloud relay — device_id (empty = all readers)</p>
              <div className="flex gap-2">
                <input value={cloudRoom} onChange={(e) => setCloudRoom(e.target.value)} placeholder="empty = all readers / or mac·serial"
                  className="flex-1 px-2 py-1.5 rounded outline-none text-xs" style={{ background: "#333", color: "#fff" }} />
                <button onClick={connectViaRelay} className="px-3 py-1.5 rounded text-xs text-white whitespace-nowrap" style={{ background: "#4a7c59" }}>ใช้ relay</button>
              </div>
              <p className="text-white/30 text-[10px] mt-1 truncate">relay: {relayUrl}</p>
            </div>
          )}
          {readerIp && (
            // Disconnect: close the socket AND clear readerIp so neither the
            // hook's auto-reconnect nor the page's auto-connect effect re-opens it.
            <button onClick={() => { ws.disconnect(); setReaderIp(""); }}
              className="w-full mt-2 px-3 py-1.5 rounded text-xs text-white flex items-center justify-center gap-1"
              style={{ background: "#9f4a4a" }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>⏏</span> ตัดการเชื่อมต่อ reader
            </button>
          )}
          <p className="text-white/40 text-[11px] mt-2">สินค้า: {productMap.size} · โต๊ะ: {presenceProducts.length} · list: {sessionProducts.length}</p>

          {/* Unknown tags: streamed by the reader but not in the DB — for setup debugging */}
          {unknownEpcs.length > 0 && (
            <div className="mt-3 pt-2" style={{ borderTop: "1px solid #6b3a3a" }}>
              <p className="text-[11px] mb-1" style={{ color: "#e0a0a0" }}>⚠️ tag ไม่รู้จัก: {unknownEpcs.length} (วางอยู่แต่ไม่มีในระบบ)</p>
              <div className="overflow-y-auto" style={{ maxHeight: 120 }}>
                {unknownEpcs.map((epc) => (
                  <div key={epc} className="px-1.5 py-0.5 text-[11px]" style={{ color: "#f0c8c8", fontFamily: "monospace" }}>• {epc}</div>
                ))}
              </div>
            </div>
          )}

          {/* Queue: every item currently in the rotation, current one highlighted */}
          {products.length > 0 && (
            <div className="mt-3 pt-2" style={{ borderTop: "1px solid #444" }}>
              <p className="text-white/60 text-[11px] mb-1">คิว: {products.length} ชิ้น{mode === "table" ? " (บนโต๊ะ)" : mode === "session" ? " (รายการลูกค้า)" : ""}</p>
              <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
                {products.map((p, i) => {
                  const isCur = i === idx % products.length;
                  return (
                    <div key={(p.rfidTag || p.name) + i} className="flex items-center gap-2 px-1.5 py-1 rounded text-[11px]"
                      style={{ background: isCur ? "rgba(16,185,129,0.18)" : "transparent", color: isCur ? "#fff" : "rgba(255,255,255,0.6)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: 9, flexShrink: 0, background: isCur ? "#10b981" : "rgba(255,255,255,0.3)" }} />
                      <span className="truncate">{i + 1}. {p.name}</span>
                      {isCur && <span className="ml-auto text-[9px] whitespace-nowrap" style={{ color: "#10b981" }}>▶ กำลังโชว์</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
