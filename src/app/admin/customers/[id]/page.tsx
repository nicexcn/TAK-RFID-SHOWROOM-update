"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { customerTypeLabel } from "@/lib/customerTypes";

interface ScanRow {
  id: string;
  scannedAt: string;
  prepareStatus: "NONE" | "PREPARING" | "COMPLETE";
  takeawayQty: number;
  returnedQty: number;
  isLoan?: boolean; // image3: snapshot — was this a must-return takeaway? (matches the loans board)
  product: { id: string; name: string; rfidTag: string; imageUrl: string | null; location: string | null; brand: string | null; returnable?: boolean };
}
interface SessionRow {
  id: string;
  createdAt: string;
  isActive: boolean;
  scans: ScanRow[];
}
interface Contact { id: string; name: string; phone: string; note?: string | null; }
interface Customer {
  id: string; customerCode: string; fullName: string; title: string; titleOther?: string | null;
  company: string; phone: string; email: string; lineId?: string | null; salesPerson?: string | null; project?: string | null;
  knowChannel: string[]; knowChannelOther?: string | null; pdpaConsent: boolean; createdAt: string;
  sessions: SessionRow[]; contacts?: Contact[];
}

const card = { background: "#fff", border: "1px solid #e6e5d8", borderRadius: 16 };
const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  NONE: { label: "—", bg: "#f5f2ee", color: "#9f886c" },
  PREPARING: { label: "Preparing", bg: "#dbeafe", color: "#3b82f6" },
  COMPLETE: { label: "Complete", bg: "#d1fae5", color: "#10b981" },
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]); // #8
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((d) => { setCustomer(d); setContacts(d.contacts || []); })
      .catch(() => setError("Customer not found"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!confirm("Delete this customer?")) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/customers");
    else alert("Failed to delete");
  }

  async function addContact() {
    if (!cName.trim()) return;
    try {
      const res = await fetch(`/api/customers/${id}/contacts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cName.trim(), phone: cPhone.trim() }),
      });
      if (res.ok) { const c = await res.json(); setContacts((p) => [...p, c]); setCName(""); setCPhone(""); }
      else alert("Failed to add contact");
    } catch { alert("Failed to add contact"); }
  }
  async function removeContact(cid: string) {
    const prev = contacts;
    setContacts((p) => p.filter((c) => c.id !== cid)); // optimistic
    try {
      const res = await fetch(`/api/customers/${id}/contacts`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: cid }),
      });
      if (!res.ok && res.status !== 404) setContacts(prev); // 404 = already gone (idempotent); roll back only real failures
    } catch { setContacts(prev); }
  }

  if (loading) return <p style={{ color: "#9f886c" }}>Loading…</p>;
  if (error || !customer) return (
    <div>
      <button onClick={() => router.push("/admin/customers")} className="px-4 py-2 rounded-xl text-sm mb-4" style={{ background: "#f5f2ee", color: "#4c4847", border: "1px solid #e6e5d8" }}>← Back</button>
      <p style={{ color: "#9f4a4a" }}>{error || "Not found"}</p>
    </div>
  );

  const allScans = customer.sessions.flatMap((s) => s.scans);
  const uniqueProducts = new Map(allScans.map((s) => [s.product.id, s]));
  const fields: [string, string][] = [
    ["Customer ID", customer.customerCode],
    ["Occupation", customer.title === "Other" ? customer.titleOther || "Other" : customerTypeLabel(customer.title) || "—"],
    ["Full Name", customer.fullName || "—"],
    ["Company", customer.company || "—"],
    ["Phone", customer.phone || "—"],
    ["Email", customer.email || "—"],
    ["LINE ID", customer.lineId || "—"],
    ["Source", [...(customer.knowChannel || []), customer.knowChannelOther].filter(Boolean).join(", ") || "—"],
    ["Sales", customer.salesPerson || "—"],
    ["Project", customer.project || "—"],
    ["PDPA", customer.pdpaConsent ? "Consented ✓" : "Not consented"],
    ["Created", new Date(customer.createdAt).toLocaleString("en-GB")],
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>{customer.fullName || customer.customerCode}</h1>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Customer Management", href: "/admin/customers" }, { label: customer.customerCode }]} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/admin/customers")} className="px-4 py-2 rounded-xl text-sm" style={{ background: "#f5f2ee", color: "#4c4847", border: "1px solid #e6e5d8" }}>← Back</button>
          {/* #9: print the 8×5cm sample sticker (opens a standalone print view). */}
          <a href={`/print/sticker?${new URLSearchParams({ company: customer.company || "", contact: customer.fullName || "", phone: customer.phone || "", project: customer.project || "", requester: customer.fullName || "", code: customer.customerCode || "" }).toString()}`}
            target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl text-sm" style={{ background: "#fff", color: "#4c4847", border: "1px solid #e6e5d8" }}>🖨 Print Sticker</a>
          <Link href={`/admin/rfid?customer=${customer.customerCode}&name=${encodeURIComponent(customer.fullName)}`} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: "#726c5a" }}>Start Scan</Link>
          <button onClick={handleDelete} className="px-4 py-2 rounded-xl text-sm" style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>Delete</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
        {/* Customer info */}
        <div className="p-5" style={card}>
          <h2 className="text-base font-semibold mb-3" style={{ color: "#4c4847" }}>Customer Info</h2>
          <div className="space-y-2">
            {fields.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 text-sm">
                <span style={{ color: "#9f886c" }}>{label}</span>
                <span className="text-right font-medium" style={{ color: "#4c4847" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* #8: contacts — one customer, multiple contact people */}
        <div className="p-5" style={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold" style={{ color: "#4c4847" }}>Contacts</h2>
            <span className="text-xs" style={{ color: "#9f886c" }}>{contacts.length}</span>
          </div>
          <div className="space-y-2 mb-3">
            {contacts.length === 0 ? (
              <p className="text-sm" style={{ color: "#cdc3ad" }}>No extra contacts yet</p>
            ) : contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: "#f5f2ee" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate" style={{ color: "#4c4847" }}>{c.name}</p>
                  {c.phone && <p className="text-[11px]" style={{ color: "#9f886c" }}>{c.phone}</p>}
                </div>
                <button onClick={() => removeContact(c.id)} aria-label="Remove contact" className="text-base px-2 leading-none" style={{ color: "#9f4a4a" }}>×</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={cName} onChange={(e) => setCName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addContact()}
              placeholder="Contact name" className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }} />
            <input value={cPhone} onChange={(e) => setCPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addContact()}
              placeholder="Phone" className="w-24 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }} />
            <button onClick={addContact} className="px-3 py-2 rounded-lg text-sm text-white" style={{ background: "#726c5a" }}>Add</button>
          </div>
        </div>
        </div>

        {/* Interest history */}
        <div className="lg:col-span-2 p-5" style={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold" style={{ color: "#4c4847" }}>Scan history</h2>
            <span className="text-xs" style={{ color: "#9f886c" }}>{uniqueProducts.size} items · {customer.sessions.length} sessions</span>
          </div>
          {uniqueProducts.size === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "#cdc3ad" }}>No scan history yet</p>
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
                        {[scan.product.brand, scan.product.location, new Date(scan.scannedAt).toLocaleString("en-GB")].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {scan.takeawayQty > 0 && scan.isLoan !== false && (
                      scan.returnedQty >= scan.takeawayQty ? (
                        <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: "#d1fae5", color: "#10b981" }}>Returned ✓</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: "#fdf0e3", color: "#c07a30" }}>
                          {scan.returnedQty > 0 ? `Borrowed ${scan.takeawayQty} · ${scan.returnedQty} back` : `Borrowed ${scan.takeawayQty}`}
                        </span>
                      )
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
