"use client";

import { useEffect, useState } from "react";

// #9: printable "Product Sample" sticker — AW size W 8 × H 5 cm (image2).
// Title in Archer Semibold; body (บริษัท / ติดต่อ / โปรเจกต์ / ผู้เบิก) in DB Heavent Light.
// Data comes from URL params (opened from a customer's page); ผู้เบิก is editable before printing.

export default function StickerPrintPage() {
  const [d, setD] = useState({ company: "", contact: "", phone: "", project: "", requester: "", code: "" });
  const [bleed, setBleed] = useState(false); // #9: 0.5cm bleed (9×6cm artwork for a die-cut print house)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setD({
      company: p.get("company") || "",
      contact: p.get("contact") || "",
      phone: p.get("phone") || "",
      project: p.get("project") || "",
      requester: p.get("requester") || p.get("contact") || "",
      code: p.get("code") || "",
    });
  }, []);

  const archer = { fontFamily: "'Archer', sans-serif" };
  const heavent = { fontFamily: "'DB Heavent', 'Archer', sans-serif", fontWeight: 300 };
  // Each row is a SINGLE line (long values truncate with … rather than wrapping) so all four
  // rows — critically the ผู้เบิก row — always fit inside the fixed 5cm height and print.
  const row = (label: string, value: string) => (
    <div style={{ display: "flex", gap: "0.1cm", marginBottom: "0.05cm", alignItems: "baseline" }}>
      <span style={{ ...heavent, flexShrink: 0, minWidth: "1.7cm", color: "#000" }}>{label}</span>
      <span title={value || undefined}
        style={{ ...heavent, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#000" }}>: {value || "—"}</span>
    </div>
  );

  return (
    <div className="page-root" style={{ minHeight: "100vh", background: "#e9e6df", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        @page { size: ${bleed ? "9cm 6cm" : "8cm 5cm"}; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: var(--color-surface) !important; }
          .page-root { min-height: 0 !important; background: var(--color-surface) !important; display: block !important; }
          .sticker-wrap { background: var(--color-surface) !important; padding: 0 !important; }
          .sticker { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      {/* Toolbar (hidden when printing) */}
      <div className="no-print" style={{ width: "100%", maxWidth: 560, padding: "20px 16px" }}>
        <h1 style={{ ...archer, fontWeight: 600, fontSize: 20, color: "var(--color-text)", marginBottom: 4 }}>Print sample sticker</h1>
        <p style={{ ...archer, fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
          Size 8 × 5 cm{d.code ? ` · ${d.code}` : ""}. Check the details, then Print. (For a die-cut print house, add 0.5 cm bleed.)
        </p>
        <label style={{ ...archer, display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>ผู้เบิก / Requester</label>
        <input value={d.requester} onChange={(e) => setD((p) => ({ ...p, requester: e.target.value }))}
          placeholder="ชื่อผู้เบิกสินค้า"
          style={{ ...archer, width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 14, outline: "none" }} />
        <label style={{ ...archer, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-text)", marginTop: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} />
          Add 0.5 cm bleed (9×6 cm artwork for a die-cut print house)
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={() => window.close()} style={{ ...archer, padding: "10px 18px", borderRadius: 12, background: "var(--color-bg)", color: "var(--color-text)", border: "none", fontSize: 14, cursor: "pointer" }}>Close</button>
          <button onClick={() => window.print()} style={{ ...archer, flex: 1, padding: "10px 18px", borderRadius: 12, background: "var(--color-primary)", color: "var(--color-surface)", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        </div>
        <p style={{ ...archer, fontSize: 12, color: "var(--color-text-subtle)", marginTop: 12 }}>
          Tip: in the print dialog set paper size to <strong>8×5 cm</strong> (or your label size) and margins to <strong>None</strong>.
        </p>
      </div>

      {/* The sticker — exact 8×5 cm */}
      <div className="sticker-wrap" style={{ padding: "0 16px 32px" }}>
        <div className="sticker" style={{
          position: "relative",
          width: bleed ? "9cm" : "8cm", height: bleed ? "6cm" : "5cm", background: "var(--color-surface)", boxSizing: "border-box",
          padding: bleed ? "0.95cm 1cm" : "0.45cm 0.5cm", display: "flex", flexDirection: "column",
          border: "1px solid #d8d3c6", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", overflow: "hidden",
        }}>
          {bleed && (
            // Trim line at the 8×5 cut (0.5cm inset) — an on-screen guide only, hidden when printing.
            <div className="no-print" style={{ position: "absolute", top: "0.5cm", left: "0.5cm", right: "0.5cm", bottom: "0.5cm", border: "1px dashed #c9a15a", pointerEvents: "none" }} />
          )}
          <div style={{ ...archer, fontWeight: 600, fontSize: "17pt", lineHeight: 1.05, color: "#000", marginBottom: "0.28cm" }}>
            Product Sample
          </div>
          <div style={{ fontSize: "12.5pt", lineHeight: 1.28 }}>
            {row("บริษัท", d.company)}
            {row("ติดต่อ", [d.contact, d.phone].filter(Boolean).join(" "))}
            {row("โปรเจกต์", d.project)}
            {row("ผู้เบิก", d.requester)}
          </div>
        </div>
      </div>
    </div>
  );
}
