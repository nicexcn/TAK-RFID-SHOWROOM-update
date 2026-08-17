"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// ERP stock-cut ใบเบิกรายการ (requisition slip) — one per Document No.
// Design ref: 3.jfif (header doc no + posting date, customer block, items table).
// Public (no auth) like /print/sticker. Data arrives via URL params so the page
// is self-contained and printable from already-loaded notification data.

interface ErpItem {
  code: string;
  name: string;
  qty: number;
  imageUrl?: string;
  brand?: string;
}

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok — match api/reports convention

function bkkDate(d: Date) {
  // Bangkok wall-clock YYYY-MM-DD, same convention as the takeaways `date` field.
  return new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

export default function ErpDocPrintPage() {
  const [d, setD] = useState({
    doc: "", date: "", company: "", contact: "", phone: "", project: "", customerCode: "",
  });
  const [items, setItems] = useState<ErpItem[]>([]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setD({
      doc: p.get("doc") || "",
      date: p.get("date") || bkkDate(new Date()),
      company: p.get("company") || "",
      contact: p.get("contact") || "",
      phone: p.get("phone") || "",
      project: p.get("project") || "",
      customerCode: p.get("customerCode") || "",
    });
    try {
      const raw = p.get("items");
      if (raw) setItems(JSON.parse(decodeURIComponent(raw)));
    } catch { /* malformed — render empty table */ }
  }, []);

  const archer = { fontFamily: "var(--font-archer), var(--font-heavent), sans-serif" };
  const heavent = { fontFamily: "var(--font-heavent), var(--font-archer), sans-serif", fontWeight: 300 };

  const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const dateDisplay = d.date ? new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";

  return (
    <div className="page-root" style={{ minHeight: "100vh", background: "#e9e6df", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        @page { size: A5; margin: 1cm; }
        @media print {
          .no-print { display: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .page-root { min-height: 0 !important; background: #fff !important; display: block !important; }
          .slip { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      {/* Toolbar (hidden when printing) */}
      <div className="no-print" style={{ width: "100%", maxWidth: 560, padding: "20px 16px" }}>
        <h1 style={{ ...archer, fontWeight: 600, fontSize: 20, color: "var(--color-text)", marginBottom: 4 }}>Print requisition slip</h1>
        <p style={{ ...archer, fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
          {d.doc ? `${d.doc} · ` : ""}{dateDisplay} · {items.length} item(s){totalQty ? ` · ${totalQty} pcs` : ""}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => window.close()} style={{ ...archer, padding: "10px 18px", borderRadius: 12, background: "var(--color-bg)", color: "var(--color-text)", border: "none", fontSize: 14, cursor: "pointer" }}>Close</button>
          <button onClick={() => window.print()} style={{ ...archer, flex: 1, padding: "10px 18px", borderRadius: 12, background: "var(--color-primary)", color: "var(--color-surface)", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        </div>
      </div>

      {/* The slip — A5 */}
      <div className="slip-wrap" style={{ padding: "0 16px 32px" }}>
        <div className="slip" style={{
          width: "14.8cm", minHeight: "21cm", background: "#fff", boxSizing: "border-box",
          padding: "0.8cm 0.9cm", display: "flex", flexDirection: "column",
          border: "1px solid #d8d3c6", boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "0.3cm", borderBottom: "2px solid #000", marginBottom: "0.4cm" }}>
            <div>
              <div style={{ ...archer, fontWeight: 600, fontSize: "16pt", color: "#000" }}>Product Sample Requisition</div>
              <div style={{ ...heavent, fontSize: "10pt", color: "#000" }}>Nimitr Lab</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ ...heavent, fontSize: "9pt", color: "#555" }}>Document No.</div>
              <div style={{ ...archer, fontWeight: 600, fontSize: "13pt", color: "#000" }}>{d.doc || "—"}</div>
              <div style={{ ...heavent, fontSize: "9pt", color: "#555", marginTop: 4 }}>Posting Date</div>
              <div style={{ ...heavent, fontSize: "11pt", color: "#000" }}>{dateDisplay}</div>
            </div>
          </div>

          {/* Customer block */}
          <div style={{ marginBottom: "0.4cm", fontSize: "11pt", lineHeight: 1.5 }}>
            <div style={{ display: "flex", gap: "0.1cm" }}>
              <span style={{ ...heavent, minWidth: "2.4cm", color: "#000" }}>บริษัท</span>
              <span style={{ ...heavent, color: "#000" }}>: {d.company || "—"}</span>
            </div>
            <div style={{ display: "flex", gap: "0.1cm" }}>
              <span style={{ ...heavent, minWidth: "2.4cm", color: "#000" }}>ติดต่อ</span>
              <span style={{ ...heavent, color: "#000" }}>: {[d.contact, d.phone].filter(Boolean).join(" ") || "—"}</span>
            </div>
            <div style={{ display: "flex", gap: "0.1cm" }}>
              <span style={{ ...heavent, minWidth: "2.4cm", color: "#000" }}>โครงการ</span>
              <span style={{ ...heavent, color: "#000" }}>: {d.project || "—"}</span>
            </div>
            {d.customerCode && (
              <div style={{ display: "flex", gap: "0.1cm" }}>
                <span style={{ ...heavent, minWidth: "2.4cm", color: "#000" }}>รหัสลูกค้า</span>
                <span style={{ ...heavent, color: "#000" }}>: {d.customerCode}</span>
              </div>
            )}
          </div>

          {/* Items table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5pt" }}>
            <thead>
              <tr style={{ background: "#f3f0ea" }}>
                <th style={{ ...archer, border: "1px solid #000", padding: "4px 6px", textAlign: "left", width: "0.9cm" }}>No.</th>
                <th style={{ ...archer, border: "1px solid #000", padding: "4px 6px", textAlign: "left", width: "3.4cm" }}>Item No.</th>
                <th style={{ ...archer, border: "1px solid #000", padding: "4px 6px", textAlign: "left" }}>Description</th>
                <th style={{ ...archer, border: "1px solid #000", padding: "4px 6px", textAlign: "right", width: "1.8cm" }}>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={4} style={{ ...heavent, border: "1px solid #000", padding: "8px 6px", textAlign: "center", color: "#999" }}>No items</td></tr>
              ) : items.map((it, i) => (
                <tr key={i}>
                  <td style={{ ...heavent, border: "1px solid #000", padding: "4px 6px", color: "#000" }}>{i + 1}</td>
                  <td style={{ ...heavent, border: "1px solid #000", padding: "4px 6px", color: "#000" }}>{it.code || "—"}</td>
                  <td style={{ ...heavent, border: "1px solid #000", padding: "4px 6px", color: "#000" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {it.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.imageUrl} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4, border: "1px solid #ddd" }} />
                      )}
                      <span>{it.name}{it.brand ? ` · ${it.brand}` : ""}</span>
                    </div>
                  </td>
                  <td style={{ ...heavent, border: "1px solid #000", padding: "4px 6px", textAlign: "right", color: "#000" }}>{it.qty}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ ...archer, border: "1px solid #000", padding: "4px 6px", textAlign: "right", color: "#000" }}>Total</td>
                <td style={{ ...archer, border: "1px solid #000", padding: "4px 6px", textAlign: "right", fontWeight: 600, color: "#000" }}>{totalQty}</td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures */}
          <div style={{ marginTop: "auto", paddingTop: "1cm", display: "flex", justifyContent: "space-between", fontSize: "9.5pt" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ ...heavent, color: "#000", borderBottom: "1px solid #000", width: "4cm", height: "0.8cm" }} />
              <div style={{ ...heavent, marginTop: 4, color: "#000" }}>ผู้เบิก / Requester</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ ...heavent, color: "#000", borderBottom: "1px solid #000", width: "4cm", height: "0.8cm" }} />
              <div style={{ ...heavent, marginTop: 4, color: "#000" }}>ผู้อนุมัติ / Approver</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
