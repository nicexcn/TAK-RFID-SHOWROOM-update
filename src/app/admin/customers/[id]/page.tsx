"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface ScanRow {
  id: string;
  scannedAt: string;
  prepareStatus: "NONE" | "PREPARING" | "COMPLETE";
  takeawayQty: number;
  product: { id: string; name: string; rfidTag: string; imageUrl: string | null; location: string | null; brand: string | null };
}
interface SessionRow {
  id: string;
  createdAt: string;
  isActive: boolean;
  scans: ScanRow[];
}
interface Customer {
  id: string; customerCode: string; fullName: string; title: string; titleOther?: string | null;
  company: string; phone: string; email: string; lineId?: string | null;
  knowChannel: string[]; knowChannelOther?: string | null; pdpaConsent: boolean; createdAt: string;
  sessions: SessionRow[];
}

const card = { background: "#fff", border: "1px solid #e6e5d8", borderRadius: 16 };
const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  NONE: { label: "—", bg: "#f5f2ee", color: "#9f886c" },
  PREPARING: { label: "กำลังเตรียม", bg: "#dbeafe", color: "#3b82f6" },
  COMPLETE: { label: "เสร็จสิ้น", bg: "#d1fae5", color: "#10b981" },
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((d) => setCustomer(d))
      .catch(() => setError("ไม่พบข้อมูลลูกค้า"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!confirm("ลบลูกค้ารายนี้?")) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/customers");
    else alert("ลบไม่สำเร็จ");
  }

  if (loading) return <p style={{ color: "#9f886c" }}>กำลังโหลด…</p>;
  if (error || !customer) return (
    <div>
      <button onClick={() => router.push("/admin/customers")} className="px-4 py-2 rounded-xl text-sm mb-4" style={{ background: "#f5f2ee", color: "#4c4847", border: "1px solid #e6e5d8" }}>← Back</button>
      <p style={{ color: "#9f4a4a" }}>{error || "ไม่พบข้อมูล"}</p>
    </div>
  );

  const allScans = customer.sessions.flatMap((s) => s.scans);
  const uniqueProducts = new Map(allScans.map((s) => [s.product.id, s]));
  const fields: [string, string][] = [
    ["Customer ID", customer.customerCode],
    ["คำนำหน้า", customer.title === "อื่นๆ" ? customer.titleOther || "อื่นๆ" : customer.title || "—"],
    ["ชื่อ-นามสกุล", customer.fullName || "—"],
    ["บริษัท", customer.company || "—"],
    ["เบอร์โทร", customer.phone || "—"],
    ["Email", customer.email || "—"],
    ["LINE ID", customer.lineId || "—"],
    ["รู้จักผ่าน", [...(customer.knowChannel || []), customer.knowChannelOther].filter(Boolean).join(", ") || "—"],
    ["PDPA", customer.pdpaConsent ? "ยินยอม ✓" : "ไม่ยินยอม"],
    ["สร้างเมื่อ", new Date(customer.createdAt).toLocaleString("th-TH")],
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>{customer.fullName || customer.customerCode}</h1>
          <p className="text-xs mt-1" style={{ color: "#9f886c" }}>Home / Customer Management / {customer.customerCode}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/admin/customers")} className="px-4 py-2 rounded-xl text-sm" style={{ background: "#f5f2ee", color: "#4c4847", border: "1px solid #e6e5d8" }}>← Back</button>
          <button onClick={() => router.push(`/admin/rfid?customer=${customer.customerCode}&name=${encodeURIComponent(customer.fullName)}`)} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: "#726c5a" }}>เริ่มสแกน</button>
          <button onClick={handleDelete} className="px-4 py-2 rounded-xl text-sm" style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>ลบ</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer info */}
        <div className="lg:col-span-1 p-5" style={card}>
          <h2 className="text-base font-semibold mb-3" style={{ color: "#4c4847" }}>ข้อมูลลูกค้า</h2>
          <div className="space-y-2">
            {fields.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 text-sm">
                <span style={{ color: "#9f886c" }}>{label}</span>
                <span className="text-right font-medium" style={{ color: "#4c4847" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Interest history */}
        <div className="lg:col-span-2 p-5" style={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold" style={{ color: "#4c4847" }}>สินค้าที่สนใจ (Scan history)</h2>
            <span className="text-xs" style={{ color: "#9f886c" }}>{uniqueProducts.size} ชิ้น · {customer.sessions.length} session</span>
          </div>
          {uniqueProducts.size === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "#cdc3ad" }}>ยังไม่มีประวัติการสแกน</p>
          ) : (
            <div className="space-y-2">
              {[...uniqueProducts.values()].map((scan) => {
                const st = STATUS[scan.prepareStatus] || STATUS.NONE;
                return (
                  <div key={scan.id} className="flex items-center gap-3 p-2 rounded-xl" style={{ background: "#f5f2ee" }}>
                    {scan.product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={scan.product.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                    ) : <div className="w-12 h-12 rounded-lg" style={{ background: "#e6e5d8" }} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#4c4847" }}>{scan.product.name}</p>
                      <p className="text-xs truncate" style={{ color: "#9f886c" }}>
                        {[scan.product.brand, scan.product.location, new Date(scan.scannedAt).toLocaleString("th-TH")].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {scan.takeawayQty > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: "#fdf0e3", color: "#c07a30" }}>Takeaway {scan.takeawayQty}</span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
