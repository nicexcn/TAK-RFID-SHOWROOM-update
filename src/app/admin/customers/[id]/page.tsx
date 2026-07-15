"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { customerTypeLabel, CUSTOMER_TYPES } from "@/lib/customerTypes";

// Item 6: which roles may edit / delete a customer profile. The basic Presenter (`user`) and
// prep staff can view/register but not modify; deleting is limited further to admins.
const CAN_EDIT_ROLES = ["super_admin", "admin", "management"];
const CAN_DELETE_ROLES = ["super_admin"];
// Item 2: fields staff may edit after registration.
type EditForm = {
  fullName: string; title: string; titleOther: string; company: string; phone: string;
  email: string; lineId: string; salesPerson: string; project: string; source: string;
};

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
  company: string; phone: string; email: string; lineId?: string | null; salesPerson?: string | null; project?: string | null; source?: string | null;
  knowChannel: string[]; knowChannelOther?: string | null; pdpaConsent: boolean; createdAt: string;
  sessions: SessionRow[]; contacts?: Contact[];
}

const card = { background: "#fff", border: "1px solid #e6e5d8", borderRadius: 16 };
const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  NONE: { label: "—", bg: "#f5f2ee", color: "#6f5f48" },
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
  const [role, setRole] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [salesOptions, setSalesOptions] = useState<string[]>([]);
  const canEdit = CAN_EDIT_ROLES.includes(role);
  const canDelete = CAN_DELETE_ROLES.includes(role);

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((d) => { setCustomer(d); setContacts(d.contacts || []); })
      .catch(() => setError("Customer not found"))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.role) setRole(d.role); }); }, []);
  // Item 2: the "Sales owner" picker is a real dropdown fed from Settings → Salesperson.
  useEffect(() => { fetch("/api/dropdown?type=sales").then((r) => r.json()).then((d) => setSalesOptions(Array.isArray(d) ? d.map((x: { value?: string } | string) => (typeof x === "string" ? x : x.value || "")).filter(Boolean) : [])).catch(() => {}); }, []);

  function startEdit() {
    if (!customer) return;
    setForm({
      fullName: customer.fullName || "", title: customer.title || "", titleOther: customer.titleOther || "",
      company: customer.company || "", phone: customer.phone || "", email: customer.email || "",
      lineId: customer.lineId || "", salesPerson: customer.salesPerson || "", project: customer.project || "",
      source: customer.source || "",
    });
    setEditing(true);
  }
  async function saveEdit() {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (res.ok) { const updated = await res.json(); setCustomer((c) => (c ? { ...c, ...updated } : c)); setEditing(false); }
      else alert(res.status === 403 ? "You don't have permission to edit customers" : "Failed to save");
    } catch { alert("Failed to save"); }
    finally { setSaving(false); }
  }

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

  if (loading) return <p style={{ color: "#6f5f48" }}>Loading…</p>;
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
    ["Heard via", [...(customer.knowChannel || []), customer.knowChannelOther].filter(Boolean).join(", ") || "—"],
    ["Source", customer.source || "—"],
    ["Sales", customer.salesPerson || "—"],
    ["Project", customer.project || "—"],
    ["PDPA", customer.pdpaConsent ? "Consented ✓" : "Not consented"],
    ["Created", new Date(customer.createdAt).toLocaleString("en-GB")],
  ];
  // Item 6: the basic Presenter "cannot access sales information" — hide the sales/assignment fields.
  const visibleFields = role === "user" ? fields.filter(([l]) => !["Source", "Sales", "Project"].includes(l)) : fields;

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
          {/* #3: attributed survey link for this customer (opens the public survey pre-tagged). */}
          <a href={`/survey?customer=${customer.id}`} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl text-sm" style={{ background: "#fff", color: "#4c4847", border: "1px solid #e6e5d8" }}>📋 Survey</a>
          <Link href={`/admin/rfid?customer=${customer.customerCode}&name=${encodeURIComponent(customer.fullName)}`} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: "#726c5a" }}>Start Scan</Link>
          {canEdit && !editing && (
            <button onClick={startEdit} className="px-4 py-2 rounded-xl text-sm" style={{ background: "#fff", color: "#4c4847", border: "1px solid #e6e5d8" }}>✎ Edit</button>
          )}
          {canDelete && (
            <button onClick={handleDelete} className="px-4 py-2 rounded-xl text-sm" style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>Delete</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
        {/* Customer info */}
        <div className="p-5" style={card}>
          <h2 className="text-base font-semibold mb-3" style={{ color: "#4c4847" }}>Customer Info</h2>
          {editing && form ? (
            <div className="space-y-2.5">
              {([
                ["Full Name", "fullName"],
                ["Company", "company"],
                ["Phone", "phone"],
                ["Email", "email"],
                ["LINE ID", "lineId"],
                ["Source", "source"],
                ["Project", "project"],
              ] as [string, keyof EditForm][]).map(([label, key]) => (
                <label key={key} className="block">
                  <span className="text-xs" style={{ color: "#6f5f48" }}>{label}</span>
                  <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }} />
                </label>
              ))}
              {/* Occupation / customer type */}
              <label className="block">
                <span className="text-xs" style={{ color: "#6f5f48" }}>Occupation</span>
                <select aria-label="Occupation" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }}>
                  {CUSTOMER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              {form.title === "Other" && (
                <input value={form.titleOther} onChange={(e) => setForm({ ...form, titleOther: e.target.value })} placeholder="Specify occupation"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }} />
              )}
              {/* Item 2: Sales owner — a real dropdown of sales names (editable later) */}
              <label className="block">
                <span className="text-xs" style={{ color: "#6f5f48" }}>Sales (เซลล์ผู้ดูแล)</span>
                <select aria-label="Sales" value={form.salesPerson} onChange={(e) => setForm({ ...form, salesPerson: e.target.value })}
                  className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }}>
                  <option value="">— none —</option>
                  {[...new Set([form.salesPerson, ...salesOptions].filter(Boolean))].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} disabled={saving} className="flex-1 px-3 py-2 rounded-lg text-sm text-white disabled:opacity-60" style={{ background: "#726c5a" }}>{saving ? "Saving…" : "Save"}</button>
                <button onClick={() => setEditing(false)} disabled={saving} className="px-3 py-2 rounded-lg text-sm" style={{ background: "#f5f2ee", color: "#4c4847", border: "1px solid #e6e5d8" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleFields.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 text-sm">
                  <span style={{ color: "#6f5f48" }}>{label}</span>
                  <span className="text-right font-medium" style={{ color: "#4c4847" }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* #8: contacts — one customer, multiple contact people */}
        <div className="p-5" style={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold" style={{ color: "#4c4847" }}>Contacts</h2>
            <span className="text-xs" style={{ color: "#6f5f48" }}>{contacts.length}</span>
          </div>
          <div className="space-y-2 mb-3">
            {contacts.length === 0 ? (
              <p className="text-sm" style={{ color: "#71654c" }}>No extra contacts yet</p>
            ) : contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: "#f5f2ee" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate" style={{ color: "#4c4847" }}>{c.name}</p>
                  {c.phone && <p className="text-[11px]" style={{ color: "#6f5f48" }}>{c.phone}</p>}
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
            <span className="text-xs" style={{ color: "#6f5f48" }}>{uniqueProducts.size} items · {customer.sessions.length} sessions</span>
          </div>
          {uniqueProducts.size === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "#71654c" }}>No scan history yet</p>
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
                      <p className="text-xs truncate" style={{ color: "#6f5f48" }}>
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
