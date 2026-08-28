"use client";
import { PageHeader } from "@/components/PageHeader";
import { ZoneCascade } from "@/components/ZoneCascade";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { customerTypeLabel, CUSTOMER_TYPES } from "@/lib/customerTypes";
import { formatDateTime } from "@/lib/formatDate";
import { useConfirm } from "@/components/ConfirmDialog";
import { Skeleton, SkeletonCard } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";
import { toast } from "sonner";

const errorToast = { style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } };

// Item 6: which roles may edit / delete a customer profile. The basic Presenter (`user`) and
// prep staff can view/register but not modify; deleting is limited further to admins.
const CAN_EDIT_ROLES = ["super_admin", "admin", "management"];
const CAN_DELETE_ROLES = ["super_admin"];
// Item 2: fields staff may edit after registration.
type EditForm = {
  fullName: string; title: string; titleOther: string; company: string; phone: string;
  email: string; lineId: string; salesPerson: string; zone: string; project: string; source: string;
  remark: string; // TAK 28/8: customer-level remark
};
interface ProjectRow { id: string; name: string; zone?: string | null; salesName?: string | null; note?: string | null; }

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
  company: string; phone: string; email: string; lineId?: string | null; salesPerson?: string | null; zone?: string | null; project?: string | null; source?: string | null;
  knowChannel: string[]; knowChannelOther?: string | null; pdpaConsent: boolean; createdAt: string;
  remark?: string | null;
  sessions: SessionRow[]; contacts?: Contact[]; projects?: ProjectRow[];
}

const card = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 16 };
const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  NONE: { label: "—", bg: "var(--color-bg)", color: "var(--color-text-muted)" },
  PREPARING: { label: "Preparing", bg: "#dbeafe", color: "#3b82f6" },
  COMPLETE: { label: "Complete", bg: "#d1fae5", color: "var(--color-success)" },
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
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
  const [deleting, setDeleting] = useState(false);
  const [salesOptions, setSalesOptions] = useState<{ name: string; code: string }[]>([]);
  // TAK 28/8: Start Scan asks which project this visit belongs to (F).
  const [scanPickerOpen, setScanPickerOpen] = useState(false);
  const [scanProject, setScanProject] = useState(""); // project id or "" = no project
  const [newProjectName, setNewProjectName] = useState("");
  const canEdit = CAN_EDIT_ROLES.includes(role);
  const canDelete = CAN_DELETE_ROLES.includes(role);

  // Start Scan → create the typed project first (upsert), then open Surface Scan with
  // ?project=<id> so the scan page pre-selects it.
  async function goScan() {
    if (!customer) return;
    let pid = scanProject;
    if (!pid && newProjectName.trim()) {
      try {
        const res = await fetch("/api/projects", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: customer.id, name: newProjectName.trim() }),
        });
        if (res.ok) pid = (await res.json()).id || "";
      } catch { /* fall through: start without a project */ }
    }
    const params = new URLSearchParams({ customer: customer.customerCode, name: customer.fullName || "" });
    if (pid) params.set("project", pid);
    router.push(`/admin/rfid?${params.toString()}`);
  }

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((d) => { setCustomer(d); setContacts(d.contacts || []); })
      .catch(() => setError("Customer not found"))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.role) setRole(d.role); }); }, []);
  // Item 2: the "Sales owner" picker is a real dropdown fed from Settings → Salesperson.
  // Sale master first (name + ERP code), legacy dropdown options as fallback entries.
  useEffect(() => {
    Promise.all([
      fetch("/api/sales").then((r) => r.json()).catch(() => []),
      fetch("/api/dropdown?type=sales").then((r) => r.json()).catch(() => []),
    ]).then(([master, legacy]: [{ name: string; code: string }[], { value: string }[]]) => {
      const fromMaster = (Array.isArray(master) ? master : []).map((s) => ({ name: s.name, code: s.code }));
      const names = new Set(fromMaster.map((s) => s.name));
      const fromLegacy = (Array.isArray(legacy) ? legacy : [])
        .map((o) => ({ name: o.value, code: "" }))
        .filter((s) => s.name && !names.has(s.name));
      setSalesOptions([...fromMaster, ...fromLegacy]);
    });
  }, []);

  function startEdit() {
    if (!customer) return;
    setForm({
      fullName: customer.fullName || "", title: customer.title || "", titleOther: customer.titleOther || "",
      company: customer.company || "", phone: customer.phone || "", email: customer.email || "",
      lineId: customer.lineId || "", salesPerson: customer.salesPerson || "", zone: customer.zone || "",
      project: customer.project || "", source: customer.source || "",
      remark: customer.remark || "",
    });
    setEditing(true);
  }
  async function saveEdit() {
    if (!form) return;
    setSaving(true);
    try {
      // Slide-28 combobox: datalist lets staff type an ERP staff code (e.g. "B0007") without
      // picking the option, which would store the code where a name belongs. Resolve it here.
      const codeMatch = salesOptions.find((s) => s.code && s.code === form.salesPerson.trim());
      const payload = { ...form, salesPerson: codeMatch ? codeMatch.name : form.salesPerson.trim() };
      const res = await fetch(`/api/customers/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (res.ok) { const updated = await res.json(); setCustomer((c) => (c ? { ...c, ...updated } : c)); setEditing(false); }
      else toast(res.status === 403 ? "You don't have permission to edit customers" : "Failed to save", errorToast);
    } catch { toast("Failed to save", errorToast); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (deleting) return;
    if (!(await confirm({ title: "Delete customer?", message: "This can't be undone.", danger: true }))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (res.ok) { router.push("/admin/customers"); return; }
      toast("Failed to delete", errorToast);
    } catch {
      toast("Failed to delete", errorToast);
    } finally {
      setDeleting(false);
    }
  }

  async function addContact() {
    if (!cName.trim()) return;
    try {
      const res = await fetch(`/api/customers/${id}/contacts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cName.trim(), phone: cPhone.trim() }),
      });
      if (res.ok) { const c = await res.json(); setContacts((p) => [...p, c]); setCName(""); setCPhone(""); }
      else toast("Failed to add contact", errorToast);
    } catch { toast("Failed to add contact", errorToast); }
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

  if (loading) return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <Skeleton className="h-7" style={{ width: "14rem" }} />
        <div className="flex gap-2">
          <Skeleton className="h-9" style={{ width: "5rem" }} />
          <Skeleton className="h-9" style={{ width: "7rem" }} />
          <Skeleton className="h-9" style={{ width: "6rem" }} />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1"><SkeletonCard lines={9} /></div>
        <div className="lg:col-span-2 space-y-4">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={5} />
        </div>
      </div>
    </div>
  );
  if (error || !customer) return (
    <div>
      <button onClick={() => router.push("/admin/customers")} className="px-4 py-2 rounded-xl text-sm mb-4" style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>← Back</button>
      <p style={{ color: "var(--color-danger-soft)" }}>{error || "Not found"}</p>
    </div>
  );

  const allScans = customer.sessions.flatMap((s) => s.scans);
  const uniqueProducts = new Map(allScans.map((s) => [s.product.id, s]));
  // TAK 28/8: the profile splits into COMPANY-level (this card) and PERSON-level
  // (Contact Info card) — one Customer row, two display groupings.
  const companyFields: [string, string][] = [
    ["Customer ID", customer.customerCode],
    ["Customer Segment", customer.title === "Other" ? customer.titleOther || "Other" : customerTypeLabel(customer.title) || "—"],
    ["Company", customer.company || "—"],
    ["Heard via", [...(customer.knowChannel || []), customer.knowChannelOther].filter(Boolean).join(", ") || "—"],
    ["Sales", customer.salesPerson || "—"],
    ["Zone (เขต)", customer.zone || "—"],
    ["Project", customer.project || "—"],
    ["PDPA", customer.pdpaConsent ? "Consented ✓" : "Not consented"],
    ["Remark", customer.remark || "—"],
    ["Created", formatDateTime(customer.createdAt)],
  ];
  const contactFields: [string, string][] = [
    ["Full Name", customer.fullName || "—"],
    ["Segment detail", customer.titleOther || "—"],
    ["Phone", customer.phone || "—"],
    ["Email", customer.email || "—"],
    ["LINE ID", customer.lineId || "—"],
  ];
  // Item 6: the basic Presenter "cannot access sales information" — hide the sales/assignment fields.
  const visibleCompanyFields = role === "user" ? companyFields.filter(([l]) => !["Source", "Sales", "Project"].includes(l)) : companyFields;
  const projects = customer.projects || [];

  return (
    <div>
      {/* Header */}
      <PageHeader
        title={customer.fullName || customer.customerCode}
        crumbs={[{ label: "Home", href: "/admin" }, { label: "Customer Management", href: "/admin/customers" }, { label: customer.customerCode }]}
        actions={<>
          <button onClick={() => router.push("/admin/customers")} className="px-4 py-2 rounded-xl text-sm" style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>← Back</button>
          {/* #9 sticker print removed from the header (TAK 28/8) — /print/sticker stays reachable from Notifications. */}
          {/* #3: attributed survey link for this customer (opens the public survey pre-tagged). */}
          <a href={`/survey?customer=${customer.id}`} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl text-sm" style={{ background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>📋 Survey</a>
          {/* TAK 28/8: Start Scan now asks for the project first (opens the picker below). */}
          <button onClick={() => { setScanProject(""); setNewProjectName(""); setScanPickerOpen(true); }}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: "var(--color-primary)" }}>Start Scan</button>
          {canEdit && !editing && (
            <button onClick={startEdit} className="px-4 py-2 rounded-xl text-sm" style={{ background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>✎ Edit</button>
          )}
          {canDelete && (
            <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-xl text-sm disabled:opacity-60 disabled:cursor-wait" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-soft)", border: "1px solid var(--color-danger-border)" }}>{deleting ? "Deleting…" : "Delete"}</button>
          )}
        </>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
        {/* TAK 28/8: Company Info (company-level fields) */}
        <div className="p-5" style={card}>
          <h2 className="text-base font-semibold mb-3" style={{ color: "var(--color-text)" }}>Company Info</h2>
          {editing && form ? (
            <div className="space-y-2.5">
              {([
                ["Company", "company"],
                ["Project", "project"],
                ["Remark", "remark"],
              ] as [string, keyof EditForm][]).map(([label, key]) => (
                <label key={key} className="block">
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</span>
                  <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                </label>
              ))}
              {/* Customer Segment (was "Occupation" — renamed per TAK feedback slide 22) */}
              <label className="block">
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Customer Segment</span>
                <select aria-label="Customer Segment" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                  {/* Guard: if this customer holds a legacy value not in the list, keep it as an
                      option so opening + saving doesn't silently rewrite their occupation. */}
                  {form.title && !CUSTOMER_TYPES.some((t) => t.value === form.title) && (
                    <option value={form.title}>{customerTypeLabel(form.title)}</option>
                  )}
                  {CUSTOMER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              {form.title === "Other" && (
                <input value={form.titleOther} onChange={(e) => setForm({ ...form, titleOther: e.target.value })} placeholder="Specify segment"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              )}
              {/* Slide 3: reactive จังหวัด → เขต/อำเภอ cascade */}
              <label className="block">
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Zone (จังหวัด/เขต)</span>
                <div className="mt-0.5">
                  <ZoneCascade value={form.zone} onChange={(z) => setForm({ ...form, zone: z })} idPrefix="edit" />
                </div>
              </label>
              {/* Item 2 + slide 28: Sales owner — searchable combobox of the Sale master
                  (name + ERP code in the suggestion), editable later */}
              <label className="block">
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Sales</span>
                <input list="edit-sales-options" aria-label="Sales" value={form.salesPerson}
                  onChange={(e) => setForm({ ...form, salesPerson: e.target.value })}
                  placeholder="Type to search name or code…"
                  autoComplete="off"
                  className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                <datalist id="edit-sales-options">
                  {salesOptions.map((s) => <option key={s.name} value={s.name}>{s.code}</option>)}
                  {form.salesPerson && !salesOptions.some((s) => s.name === form.salesPerson) ? <option value={form.salesPerson} /> : null}
                </datalist>
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} disabled={saving} className="flex-1 px-3 py-2 rounded-lg text-sm text-white disabled:opacity-60" style={{ background: "var(--color-primary)" }}>{saving ? <span className="inline-flex items-center gap-2"><Spinner size="xs" color="currentColor" /> Saving…</span> : "Save"}</button>
                <button onClick={() => setEditing(false)} disabled={saving} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleCompanyFields.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 text-sm">
                  <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
                  <span className="text-right font-medium" style={{ color: "var(--color-text)" }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TAK 28/8: Contact Info (the person — split out of the old Customer Info card) */}
        <div className="p-5" style={card}>
          <h2 className="text-base font-semibold mb-3" style={{ color: "var(--color-text)" }}>Contact Info</h2>
          {editing && form ? (
            <div className="space-y-2.5">
              {([
                ["Full Name", "fullName"],
                ["Phone", "phone"],
                ["Email", "email"],
                ["LINE ID", "lineId"],
              ] as [string, keyof EditForm][]).map(([label, key]) => (
                <label key={key} className="block">
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</span>
                  <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                </label>
              ))}
              {/* Customer Segment (was "Occupation" — renamed per TAK feedback slide 22) */}
              <label className="block">
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Customer Segment</span>
                <select aria-label="Customer Segment" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                  {/* Guard: if this customer holds a legacy value not in the list, keep it as an
                      option so opening + saving doesn't silently rewrite their occupation. */}
                  {form.title && !CUSTOMER_TYPES.some((t) => t.value === form.title) && (
                    <option value={form.title}>{customerTypeLabel(form.title)}</option>
                  )}
                  {CUSTOMER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              {form.title === "Other" && (
                <input value={form.titleOther} onChange={(e) => setForm({ ...form, titleOther: e.target.value })} placeholder="Specify segment"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              )}
              {/* Slide 3: reactive จังหวัด → เขต/อำเภอ cascade */}
              <label className="block">
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Zone (จังหวัด/เขต)</span>
                <div className="mt-0.5">
                  <ZoneCascade value={form.zone} onChange={(z) => setForm({ ...form, zone: z })} idPrefix="edit" />
                </div>
              </label>
              {/* Item 2 + slide 28: Sales owner — searchable combobox of the Sale master
                  (name + ERP code in the suggestion), editable later */}
              <label className="block">
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Sales</span>
                <input list="edit-sales-options" aria-label="Sales" value={form.salesPerson}
                  onChange={(e) => setForm({ ...form, salesPerson: e.target.value })}
                  placeholder="Type to search name or code…"
                  autoComplete="off"
                  className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                <datalist id="edit-sales-options">
                  {salesOptions.map((s) => <option key={s.name} value={s.name}>{s.code}</option>)}
                  {form.salesPerson && !salesOptions.some((s) => s.name === form.salesPerson) ? <option value={form.salesPerson} /> : null}
                </datalist>
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} disabled={saving} className="flex-1 px-3 py-2 rounded-lg text-sm text-white disabled:opacity-60" style={{ background: "var(--color-primary)" }}>{saving ? <span className="inline-flex items-center gap-2"><Spinner size="xs" color="currentColor" /> Saving…</span> : "Save"}</button>
                <button onClick={() => setEditing(false)} disabled={saving} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {contactFields.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 text-sm">
                  <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
                  <span className="text-right font-medium" style={{ color: "var(--color-text)" }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TAK 28/8: Projects — one row per project with an inline remark (Project.note),
            plus quick add. Start Scan picks from this list. */}
        {!editing && (
          <div className="p-5" style={card}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Projects</h2>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{projects.length}</span>
            </div>
            <div className="space-y-2">
              {projects.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>No projects yet</p>
              ) : projects.map((p) => (
                <ProjectRowCard key={p.id} project={p} canEdit={canEdit} onSaved={(note) => {
                  if (!customer) return;
                  setCustomer({ ...customer, projects: (customer.projects || []).map((x) => x.id === p.id ? { ...x, note } : x) });
                }} />
              ))}
            </div>
          </div>
        )}

        {/* #8: contacts — one customer, multiple contact people */}
        <div className="p-5" style={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Contacts</h2>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{contacts.length}</span>
          </div>
          <div className="space-y-2 mb-3">
            {contacts.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>No extra contacts yet</p>
            ) : contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: "var(--color-bg)" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate" style={{ color: "var(--color-text)" }}>{c.name}</p>
                  {c.phone && <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{c.phone}</p>}
                </div>
                <button onClick={() => removeContact(c.id)} aria-label="Remove contact" className="text-base px-2 leading-none" style={{ color: "var(--color-danger-soft)" }}>×</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={cName} onChange={(e) => setCName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addContact()}
              placeholder="Contact name" className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            <input value={cPhone} onChange={(e) => setCPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addContact()}
              placeholder="Phone" className="w-24 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            <button onClick={addContact} className="px-3 py-2 rounded-lg text-sm text-white" style={{ background: "var(--color-primary)" }}>Add</button>
          </div>
        </div>
        </div>

        {/* Interest history */}
        <div className="lg:col-span-2 p-5" style={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Scan history</h2>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{uniqueProducts.size} items · {customer.sessions.length} sessions</span>
          </div>
          {uniqueProducts.size === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "var(--color-text-subtle)" }}>No scan history yet</p>
          ) : (
            <div className="space-y-2">
              {[...uniqueProducts.values()].map((scan) => {
                const st = STATUS[scan.prepareStatus] || STATUS.NONE;
                return (
                  <div key={scan.id} className="flex items-center gap-3 p-2 rounded-xl" style={{ background: "var(--color-bg)" }}>
                    {scan.product.imageUrl ? (
                      <Image src={scan.product.imageUrl} alt="" width={48} height={48} className="w-12 h-12 rounded-lg object-cover" />
                    ) : <div className="w-12 h-12 rounded-lg" style={{ background: "var(--color-border)" }} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>{scan.product.name}</p>
                      <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                        {[scan.product.brand, scan.product.location, formatDateTime(scan.scannedAt)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {scan.takeawayQty > 0 && scan.isLoan !== false && (
                      scan.returnedQty >= scan.takeawayQty ? (
                        <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: "#d1fae5", color: "var(--color-success)" }}>Returned ✓</span>
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

      {/* TAK 28/8: Start Scan project picker — the visit is filed under one of the
          customer's projects (or a new one, or none). */}
      {scanPickerOpen && customer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.35)" }} onClick={() => setScanPickerOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>Start Scan</h3>
            <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>Which project is this visit for?</p>
            <div className="space-y-1.5 mb-3">
              <button type="button" onClick={() => setScanProject("")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                style={{ background: scanProject === "" ? "var(--color-primary-soft, #efe6d8)" : "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                No project
              </button>
              {projects.map((p) => (
                <button key={p.id} type="button" onClick={() => { setScanProject(p.id); setNewProjectName(""); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                  style={{ background: scanProject === p.id ? "var(--color-primary-soft, #efe6d8)" : "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                  {p.name}{p.zone ? ` · ${p.zone}` : ""}
                </button>
              ))}
            </div>
            <input value={newProjectName} onChange={(e) => { setNewProjectName(e.target.value); if (e.target.value.trim()) setScanProject(""); }}
              onKeyDown={(e) => e.key === "Enter" && goScan()}
              placeholder="…or new project name" className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
              style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            <div className="flex gap-2">
              <button onClick={goScan} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--color-primary)" }}>Start</button>
              <button onClick={() => setScanPickerOpen(false)} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// One project row in the Projects card: name + zone + inline editable remark (Project.note).
// PATCHes /api/projects {id, note} and reports the new value up via onSaved.
function ProjectRowCard({ project, canEdit, onSaved }: { project: ProjectRow; canEdit: boolean; onSaved: (note: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(project.note || "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, note: note.trim() }),
      });
      if (res.ok) { onSaved(note.trim() || null); setOpen(false); }
    } finally { setSaving(false); }
  }
  return (
    <div className="p-3 rounded-xl" style={{ background: "var(--color-bg)" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>{project.name}</p>
          <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
            {[project.zone, project.salesName, project.note].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => { setNote(project.note || ""); setOpen(!open); }} className="text-xs flex-shrink-0" style={{ color: "var(--color-primary)" }}>
            {open ? "Close" : "✎ Remark"}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Remark for this project…" autoFocus
            className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
          <button onClick={save} disabled={saving} className="px-3 py-2 rounded-lg text-sm text-white disabled:opacity-60" style={{ background: "var(--color-primary)" }}>Save</button>
        </div>
      )}
    </div>
  );
}
