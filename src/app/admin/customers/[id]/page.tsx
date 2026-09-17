"use client";
import { PageHeader } from "@/components/PageHeader";
import { ZoneCascade } from "@/components/ZoneCascade";
import { SalesCoverageHint, ZoneSalesHint, salesCoveringZone } from "@/components/SaleZoneHints";
import SalesCombobox, { type SalesOption } from "@/components/SalesCombobox";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
// update-tak 13/9 (รายชื่อ Sale ตามเขตและจังหวัด): a Contractor customer is handled by the
// contractor sales cell ONLY — these 3 people (by ERP code). Other segments see the full list.
const CONTRACTOR_SALES_CODES = ["C0120", "C0108", "C0117"]; // ไก่ / รัตน์ / เขม
// Item 2: fields staff may edit after registration.
type EditForm = {
  fullName: string; title: string; titleOther: string; company: string; phone: string;
  email: string; lineId: string; salesPerson: string; zone: string; project: string; source: string;
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
  projectId?: string | null; // update-tak 13/9 [03]: which project this visit was filed under
  scans: ScanRow[];
}
interface Contact { id: string; name: string; phone: string; note?: string | null; }
interface Customer {
  id: string; customerCode: string; fullName: string; title: string; titleOther?: string | null;
  company: string; phone: string; email: string; lineId?: string | null; salesPerson?: string | null; zone?: string | null; project?: string | null; source?: string | null;
  knowChannel: string[]; knowChannelOther?: string | null; pdpaConsent: boolean; createdAt: string;
  sessions: SessionRow[]; contacts?: Contact[]; projects?: ProjectRow[];
  companyId?: string | null;
  companyRef?: { id: string; name: string; phone?: string | null; email?: string | null; address?: string | null; zone?: string | null; note?: string | null } | null;
  // update-tak 13/9 [16]: other Customer rows in the same company (for the "other contacts" card).
  companyCustomers?: { id: string; customerCode: string; fullName: string; title: string; phone: string; email: string; company: string }[];
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
  const [role, setRole] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [salesOptions, setSalesOptions] = useState<{ name: string; code: string; province?: string | null; zone?: string | null }[]>([]);
  // 16/9: combobox options — Contractor segment sees only the contractor cell; sales
  // covering the customer's zone float to the top under "ดูแลโซนนี้".
  const comboboxOptions: SalesOption[] = useMemo(() => {
    const base = form?.title === "Contractor"
      ? salesOptions.filter((s) => CONTRACTOR_SALES_CODES.includes(s.code))
      : salesOptions;
    const covering = new Set(salesCoveringZone(form?.zone || "", base).map((s) => s.name));
    return base.map((s) => ({
      name: s.name,
      code: s.code,
      hint: s.province || s.zone || undefined,
      group: covering.has(s.name) ? "ดูแลโซนนี้" : undefined,
    }));
  }, [salesOptions, form?.title, form?.zone]);

  // Feedback round 3 (15/9): existing company names as datalist suggestions on the Company
  // field, so staff pick "Home Connect" instead of typing a case variant.
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  // TAK 28/8: Start Scan asks which project this visit belongs to (F).
  const [scanPickerOpen, setScanPickerOpen] = useState(false);
  const [scanProject, setScanProject] = useState(""); // project id or "" = no project
  const [newProjectName, setNewProjectName] = useState("");
  // update-tak 13/9 [03]: project-scoped scan view + add/hide projects.
  const [selectedProject, setSelectedProject] = useState<string | null>(null); // project id, or null = all
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(new Set());
  const [addingProject, setAddingProject] = useState(false);
  const [newProjName, setNewProjName] = useState("");
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

  // update-tak 13/9 [03]: add a new project from the Projects card (without starting a scan).
  async function addProjectFromCard() {
    if (!customer || !newProjName.trim()) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, name: newProjName.trim() }),
      });
      if (res.ok) {
        const p = await res.json();
        setCustomer({ ...customer, projects: [...(customer.projects || []), { id: p.id, name: p.name || newProjName.trim(), zone: null, salesName: null, note: null }] });
        setNewProjName(""); setAddingProject(false);
      }
    } catch { /* non-blocking */ }
  }

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((d) => { setCustomer(d); })
      .catch(() => setError("Customer not found"))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.role) setRole(d.role); }); }, []);
  useEffect(() => {
    fetch("/api/companies").then((r) => r.json())
      .then((d) => setCompanyOptions((Array.isArray(d) ? d : []).map((c: { name: string }) => c.name)))
      .catch(() => {});
  }, []);
  // Item 2: the "Sales owner" picker is a real dropdown fed from Settings → Salesperson.
  // Sale master first (name + ERP code), legacy dropdown options as fallback entries.
  useEffect(() => {
    Promise.all([
      fetch("/api/sales").then((r) => r.json()).catch(() => []),
      fetch("/api/dropdown?type=sales").then((r) => r.json()).catch(() => []),
    ]).then(([master, legacy]: [{ name: string; code: string; province?: string | null; zone?: string | null }[], { value: string }[]]) => {
      const fromMaster = (Array.isArray(master) ? master : []).map((s) => ({ name: s.name, code: s.code, province: s.province ?? null, zone: s.zone ?? null }));
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

  // update-tak 13/9 [03]: when a project is selected, show only that project's visits' scans.
  const visibleSessions = selectedProject
    ? customer.sessions.filter((s) => s.projectId === selectedProject)
    : customer.sessions;
  const allScans = visibleSessions.flatMap((s) => s.scans);
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
  // update-tak 13/9 [03]: hide finished/archived projects (toggle per project, client-side).
  const projects = (customer.projects || []).filter((p) => !hiddenProjects.has(p.id));

  return (
    <div>
      {/* Header — update-tak 13/9: company name as title, person name as subtitle */}
      <PageHeader
        title={customer.company || customer.fullName || customer.customerCode}
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

      {/* update-tak 13/9 [16]: person subtitle (company name is now the title) */}
      <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
        {customer.fullName} · {customer.customerCode}
      </p>

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
              ] as [string, keyof EditForm][]).map(([label, key]) => (
                <label key={key} className="block">
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</span>
                  <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    list={key === "company" ? "edit-company-options" : undefined} autoComplete="off"
                    className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                </label>
              ))}
              <datalist id="edit-company-options">
                {companyOptions.map((c) => <option key={c} value={c} />)}
              </datalist>
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
                <div className="mt-0.5">
                  <SalesCombobox
                    options={comboboxOptions}
                    value={form.salesPerson}
                    onChange={(v) => setForm({ ...form, salesPerson: v })}
                  />
                </div>
              </label>
              {/* 16/9: soft two-way hints (see SaleZoneHints) */}
              <SalesCoverageHint salesPerson={form.salesPerson} zone={form.zone || ""} sales={salesOptions} />
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
                <div className="mt-0.5">
                  <SalesCombobox
                    options={comboboxOptions}
                    value={form.salesPerson}
                    onChange={(v) => setForm({ ...form, salesPerson: v })}
                  />
                </div>
              </label>
              {/* 16/9: soft two-way hints (see SaleZoneHints) */}
              <SalesCoverageHint salesPerson={form.salesPerson} zone={form.zone || ""} sales={salesOptions} />
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

        {/* Feedback round 3 (15/9): the company profile page was removed — its Customers card
            lives HERE now, right after this person's Contact Info, so staff see who else is
            at the company. The current person is included at the top and highlighted. */}
        {customer.company && (
          <div className="p-5" style={card}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Everyone at {customer.company}</h2>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{1 + (customer.companyCustomers?.length || 0)}</span>
            </div>
            <div className="space-y-2">
              {/* current person first, highlighted */}
              <div className="block p-3 rounded-xl" style={{ background: "var(--color-primary-soft, #efe6d8)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                      {customer.fullName || customer.customerCode}
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}>this contact</span>
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                      {[customerTypeLabel(customer.title), customer.phone].filter(Boolean).join(" · ") || customer.customerCode}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}>{customer.customerCode}</span>
                </div>
              </div>
              {(customer.companyCustomers || []).map((c) => (
                <Link key={c.id} href={`/admin/customers/${c.id}`}
                  className="block p-3 rounded-xl transition-colors hover:opacity-80"
                  style={{ background: "var(--color-bg)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>{c.fullName || c.customerCode}</p>
                      <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                        {[customerTypeLabel(c.title), c.phone].filter(Boolean).join(" · ") || c.customerCode}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}>{c.customerCode}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Feedback round 3 (15/9): the old Contacts card (inline name+phone rows) became a
            single Add button — a new contact is a full Customer row at the same company, so
            it goes through the add-customer page with the company info prefilled. */}
        {customer.company && (
          <div className="p-5" style={card}>
            <h2 className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>Add another contact at this company</h2>
            <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
              Opens the add-customer form with {customer.company}'s details prefilled.
            </p>
            <Link
              href={customer.companyId
                ? `/admin/customers/add?companyId=${customer.companyId}`
                : `/admin/customers/add?company=${encodeURIComponent(customer.company)}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "var(--color-primary)" }}>
              + Add
            </Link>
          </div>
        )}

        {/* update-tak 13/9 [03]: Projects — click a project to filter Scan history to its
            visits; add a project; hide finished projects. Per-project description = Project.note. */}
        {!editing && (
          <div className="p-5" style={card}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Projects</h2>
              <div className="flex items-center gap-2">
                {selectedProject && (
                  <button onClick={() => setSelectedProject(null)} className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
                    Show all visits
                  </button>
                )}
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {projects.length}{hiddenProjects.size ? ` (${hiddenProjects.size} hidden)` : ""}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {projects.length === 0 && hiddenProjects.size === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>No projects yet</p>
              ) : projects.map((p) => {
                const isSel = selectedProject === p.id;
                return (
                  <div key={p.id}>
                    <ProjectRowCard project={p} canEdit={canEdit} selected={isSel}
                      onSelect={() => setSelectedProject(isSel ? null : p.id)}
                      onHide={() => setHiddenProjects((s) => { const n = new Set(s); n.add(p.id); return n; })}
                      onSaved={(note) => {
                        if (!customer) return;
                        setCustomer({ ...customer, projects: (customer.projects || []).map((x) => x.id === p.id ? { ...x, note } : x) });
                      }} />
                  </div>
                );
              })}
              {hiddenProjects.size > 0 && (
                <button onClick={() => setHiddenProjects(new Set())}
                  className="text-xs underline" style={{ color: "var(--color-text-subtle)" }}>
                  Show {hiddenProjects.size} hidden project{hiddenProjects.size > 1 ? "s" : ""}
                </button>
              )}
            </div>
            {canEdit && (addingProject ? (
              <div className="mt-3 flex gap-2">
                <input value={newProjName} onChange={(e) => setNewProjName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addProjectFromCard()}
                  placeholder="Project name" autoFocus
                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                <button onClick={addProjectFromCard} className="px-3 py-2 rounded-lg text-sm text-white" style={{ background: "var(--color-primary)" }}>Add</button>
                <button onClick={() => { setAddingProject(false); setNewProjName(""); }} className="px-2 py-2 rounded-lg text-sm" style={{ color: "var(--color-text-muted)" }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingProject(true)} className="mt-3 text-xs flex items-center gap-1" style={{ color: "var(--color-primary)" }}>+ Add project</button>
            ))}
          </div>
        )}

        </div>

        {/* Scan history (filtered to the selected project's visits when one is chosen — [03]) */}
        <div className="lg:col-span-2 p-5" style={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
              Scan history{selectedProject ? " · filtered" : ""}
            </h2>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{uniqueProducts.size} items · {visibleSessions.length} sessions</span>
          </div>
          {uniqueProducts.size === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "var(--color-text-subtle)" }}>{selectedProject ? "No scans for this project yet" : "No scan history yet"}</p>
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

// One project row in the Projects card: clickable name row (select → Scan history filters to
// this project's visits) + per-project hide + inline editable remark (Project.note).
// PATCHes /api/projects {id, note} and reports the new value up via onSaved.
function ProjectRowCard({ project, canEdit, selected, onSelect, onHide, onSaved }: {
  project: ProjectRow; canEdit: boolean; selected?: boolean;
  onSelect?: () => void; onHide?: () => void; onSaved: (note: string | null) => void;
}) {
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
    <div className="p-3 rounded-xl" style={{ background: selected ? "var(--color-primary-soft, #efe6d8)" : "var(--color-bg)" }}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onSelect} className="flex-1 text-left min-w-0"
          title="Click to show this project's visits in Scan history">
          <p className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>{project.name}</p>
          <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
            {[project.zone, project.salesName, project.note].filter(Boolean).join(" · ") || "—"}
          </p>
        </button>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onHide && (
            <button type="button" onClick={onHide} title="Hide this project (finished)"
              className="text-xs px-1.5 py-0.5 rounded" style={{ color: "var(--color-text-subtle)" }}>hide</button>
          )}
          {canEdit && (
            <button onClick={() => { setNote(project.note || ""); setOpen(!open); }} className="text-xs" style={{ color: "var(--color-primary)" }}>
              {open ? "Close" : "✎ Remark"}
            </button>
          )}
        </div>
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
