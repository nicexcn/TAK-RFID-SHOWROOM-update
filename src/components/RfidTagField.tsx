"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { normalizeReaders, readerUrl, type SavedReader } from "@/lib/readers";

const inputStyle = { background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" };

// RFID Tag input with scan-to-fill: pick a saved reader (or all readers via the relay),
// press Scan, and the next tag read on that reader fills the field. Reuses the reader
// registry + relay + useWebSocket — same plumbing as the Surface Scan / Display pages.
// Used by both Add Product and Edit Product.
export default function RfidTagField({
  value,
  onChange,
  // Optional by default (TAK feedback slide 29): non-RFID items (catalogs etc.) are
  // also entered here, so the tag must not be a required field.
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
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

  const onScannedTag = useCallback((epc: string) => {
    if (capturedRef.current || !epc) return; // capture only the first read per Scan press
    capturedRef.current = true;
    onChange(epc);
    setScanning(false);
    setScanMsg(`✓ Captured tag: ${epc}`);
  }, [onChange]);

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

  return (
    <div>
      <label className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>
        RFID Tag {required && <span style={{ color: "var(--color-danger-soft)" }}>*</span>}
      </label>
      <div className="flex gap-2">
        <input name="rfidTag" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="Scan, or type the RFID tag (e.g. WY7204X)"
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
          <p className="text-xs mt-1" style={{ color: "var(--color-text-subtle)" }}>Hold a tag near the reader and press Scan, or type it manually.</p>
        )}
      </div>
    </div>
  );
}
