"use client";

import { useEffect, useState } from "react";

// #9: printable "Product Sample" sticker — AW size W 8 × H 5 cm (image2).
// Title in Archer Semibold; body (บริษัท / ติดต่อ / โปรเจกต์ / ผู้เบิก) in DB Heavent Light.
// Data comes from URL params (opened from a customer's page); ผู้เบิก is editable before printing.

export default function StickerPrintPage() {
  const [d, setD] = useState({ company: "", contact: "", phone: "", project: "", requester: "", code: "" });

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
  const heavent = { fontFamily: "'DB Heavent', 'Archer', sans-serif" };
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
        @page { size: 8cm 5cm; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .page-root { min-height: 0 !important; background: #fff !important; display: block !important; }
          .sticker-wrap { background: #fff !important; padding: 0 !important; }
          .sticker { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      {/* Toolbar (hidden when printing) */}
      <div className="no-print" style={{ width: "100%", maxWidth: 560, padding: "20px 16px" }}>
        <h1 style={{ ...archer, fontWeight: 600, fontSize: 20, color: "#4c4847", marginBottom: 4 }}>Print sample sticker</h1>
        <p style={{ ...archer, fontSize: 13, color: "#9f886c", marginBottom: 16 }}>
          Size 8 × 5 cm{d.code ? ` · ${d.code}` : ""}. Check the details, then Print. (For a die-cut print house, add 0.5 cm bleed.)
        </p>
        <label style={{ ...archer, display: "block", fontSize: 13, color: "#4c4847", marginBottom: 6 }}>ผู้เบิก / Requester</label>
        <input value={d.requester} onChange={(e) => setD((p) => ({ ...p, requester: e.target.value }))}
          placeholder="ชื่อผู้เบิกสินค้า"
          style={{ ...archer, width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid #e6e5d8", background: "#fff", color: "#4c4847", fontSize: 14, outline: "none" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={() => window.close()} style={{ ...archer, padding: "10px 18px", borderRadius: 12, background: "#f5f2ee", color: "#4c4847", border: "none", fontSize: 14, cursor: "pointer" }}>Close</button>
          <button onClick={() => window.print()} style={{ ...archer, flex: 1, padding: "10px 18px", borderRadius: 12, background: "#726c5a", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        </div>
        <p style={{ ...archer, fontSize: 12, color: "#cdc3ad", marginTop: 12 }}>
          Tip: in the print dialog set paper size to <strong>8×5 cm</strong> (or your label size) and margins to <strong>None</strong>.
        </p>
      </div>

      {/* The sticker — exact 8×5 cm */}
      <div className="sticker-wrap" style={{ padding: "0 16px 32px" }}>
        <div className="sticker" style={{
          width: "8cm", height: "5cm", background: "#fff", boxSizing: "border-box",
          padding: "0.45cm 0.5cm", display: "flex", flexDirection: "column",
          border: "1px solid #d8d3c6", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", overflow: "hidden",
        }}>
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
