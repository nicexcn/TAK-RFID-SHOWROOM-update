"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { normalizeReaders, readerUrl, type SavedReader } from "@/lib/readers";

const inputStyle = { background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" };

// Multi-tag RFID manager (16/9 restructure): a physical item can carry several chips
// (door panels: EPC1+EPC2). The FIRST tag is the product's primary (Product.rfidTag);
// the rest become RfidTag rows. Scan-to-fill picks the next tag read off the reader —
// pressing Scan repeatedly captures one chip per press, building the set.
// Used by both Add Product and Edit Product.
export default function RfidTagField({
  value,
  onChange,
  // Extra chips (beyond the primary). Pass the product's existing RfidTag EPCs on edit.
  extraTags = [],
  onExtraTagsChange,
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  extraTags?: string[];
  onExtraTagsChange?: (tags: string[]) => void;
  required?: boolean;
}) {
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [manual, setManual] = useState("");
  const [relayBase, setRelayBase] = useState("");
  const [relaySubKey, setRelaySubKey] = useState("");
  const [scanReaders, setScanReaders] = useState<SavedReader[]>([]);
  const [scanReaderId, setScanReaderId] = useState("");
  const capturedRef = useRef(false);

  useEffect(() => {
    fetch("/api/display/config").then((r) => r.json()).then((c) => {
      const cfg = String(c?.relayUrl || "").replace(/\/+$/, "");
      setRelaySubKey(String(c?.relaySubscriberKey || ""));
      // HTTPS uses the configured (wss) relay; local HTTP uses the same host on :8081.
      setRelayBase(typeof window !== "undefined" && window.location.protocol === "https:" ? cfg : `ws://${window.location.hostname}:8081`);
      const rs = normalizeReaders(c?.readers);
      setScanReaders(rs);
      setScanReaderId((id) => id || rs[0]?.id || "");
    }).catch(() => {});
  }, []);

  // Listen to the chosen saved reader (device-filtered), or all readers via the relay.
  const scanReader = scanReaders.find((r) => r.id === scanReaderId);
  const scanUrl = readerUrl(scanReader ?? {}, relayBase, relaySubKey);

  const allTags = [value, ...extraTags].filter(Boolean);

  const addTag = useCallback((epc: string) => {
    const t = epc.trim();
    if (!t || allTags.includes(t)) return false; // dedupe within this product
    if (!value) { onChange(t); setScanMsg(`✓ Primary tag: ${t}`); return true; }   // first tag = primary
    if (onExtraTagsChange) { onExtraTagsChange([...extraTags, t]); setScanMsg(`✓ Added tag: ${t}`); return true; }
    return false;
  }, [value, extraTags, allTags, onChange, onExtraTagsChange]);

  const onScannedTag = useCallback((epc: string) => {
    if (capturedRef.current || !epc) return; // capture only the first read per Scan press
    capturedRef.current = true;
    const added = addTag(epc);
    setScanning(false);
    if (!added) setScanMsg(`⚠ ${epc} is already on this product`);
  }, [addTag]);

  const scanWs = useWebSocket({ url: scanUrl, onTag: onScannedTag, enabled: scanning && !!scanUrl });
  const scanConnect = scanWs.connect;
  const scanDisconnect = scanWs.disconnect;
  useEffect(() => {
    if (scanning && scanUrl) scanConnect();
    else scanDisconnect();
  }, [scanning, scanUrl, scanConnect, scanDisconnect]);

  function toggleScan() {
    if (scanning) { setScanning(false); return; }
    setScanMsg(""); capturedRef.current = false; setScanning(true);
  }

  function removeTag(tag: string) {
    if (tag === value) {
      // removing the primary: promote the first extra tag (if any)
      const [next, ...rest] = extraTags;
      onChange(next || "");
      onExtraTagsChange?.(rest);
    } else {
      onExtraTagsChange?.(extraTags.filter((t) => t !== tag));
    }
  }

  return (
    <div>
      <label className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>
        RFID Tags {required && <span style={{ color: "var(--color-danger-soft)" }}>*</span>}
        {allTags.length > 1 && (
          <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-text-muted)" }}>{allTags.length} chips</span>
        )}
      </label>

      {/* Chip list — first chip = primary */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {allTags.map((tag, i) => (
            <span key={tag} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg text-xs"
              style={{ background: i === 0 ? "rgba(114,108,90,0.14)" : "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              title={i === 0 ? "Primary tag" : "Additional chip"}>
              {i === 0 && <span style={{ color: "var(--color-primary)" }} className="font-medium">primary</span>}
              <span className="font-mono">{tag}</span>
              <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}
                className="px-1 leading-none" style={{ color: "var(--color-danger-soft)" }}>×</button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input name="rfidTagExtra" value={manual} onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (addTag(manual)) setManual(""); } }}
          placeholder={value ? "Add another chip — scan or type, then Enter" : "Scan, or type the RFID tag"}
          className="flex-1 px-4 py-3 rounded-xl outline-none text-sm min-w-0" style={inputStyle} />
        {scanReaders.length > 0 && (
          <select aria-label="Reader" value={scanReaderId} onChange={(e) => setScanReaderId(e.target.value)} title="Reader to scan with"
            className="px-3 py-3 rounded-xl outline-none text-sm" style={inputStyle}>
            {scanReaders.map((r) => <option key={r.id} value={r.id}>{r.name || r.device || r.url}</option>)}
          </select>
        )}
        <button type="button" onClick={toggleScan} disabled={!scanning && !scanUrl}
          className="px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap text-white disabled:opacity-50"
          style={{ background: scanning ? "var(--color-danger-soft)" : "#4a6fa5" }}>
          {scanning ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
              Stop
            </>
          ) : (
            <>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                <rect x="9" y="9" width="6" height="6" />
              </svg>
              Scan
            </>
          )}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {scanning ? (
          <p className="text-xs mt-1" style={{ color: "#4a6fa5" }}>
            {scanWs.isConnected ? "Listening — hold the tag near the reader…" : "Connecting to reader…"}
          </p>
        ) : scanMsg ? (
          <p className="text-xs mt-1" style={{ color: "#4a7c59" }}>{scanMsg}</p>
        ) : !scanUrl ? (
          <p className="text-xs mt-1" style={{ color: "var(--color-text-subtle)" }}>To scan, set the Cloud Relay URL in Settings (or run a local relay). You can also just type the tag.</p>
        ) : (
          <p className="text-xs mt-1" style={{ color: "var(--color-text-subtle)" }}>
            {value
              ? "One chip per Scan press — scan again to add another chip of the same item."
              : "Hold a tag near the reader and press Scan, or type it manually."}
          </p>
        )}
      </div>
    </div>
  );
}
