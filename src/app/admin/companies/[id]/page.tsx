"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { customerTypeLabel } from "@/lib/customerTypes";

interface CompanyCustomer {
  id: string; customerCode: string; fullName: string; title: string;
  phone: string; email: string; company: string; salesPerson?: string | null; zone?: string | null;
}
interface Company {
  id: string; name: string; phone?: string | null; email?: string | null;
  address?: string | null; zone?: string | null; note?: string | null;
  customers: CompanyCustomer[];
}

export default function CompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", zone: "", note: "" });

  useEffect(() => {
    fetch(`/api/companies/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { toast(d.error); return; }
        setCompany(d);
        setForm({ name: d.name || "", phone: d.phone || "", email: d.email || "", address: d.address || "", zone: d.zone || "", note: d.note || "" });
      })
      .catch(() => toast("Failed to load company"))
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated = await res.json();
        setCompany({ ...company!, ...updated });
        setEditing(false);
        toast("Company saved");
      } else { toast("Save failed"); }
    } catch { toast("Save failed"); }
  }

  if (loading) return <p className="text-sm p-8" style={{ color: "var(--color-text-subtle)" }}>Loading…</p>;
  if (!company) return <p className="text-sm p-8" style={{ color: "var(--color-danger-soft)" }}>Company not found</p>;

  const card = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1rem" };
  const iS = { background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" };

  return (
    <div>
      <PageHeader
        title={company.name}
        crumbs={[{ label: "Home", href: "/admin" }, { label: "Companies", href: "/admin/companies" }, { label: company.name }]}
        actions={<>
          <button onClick={() => router.push("/admin/companies")} className="px-4 py-2 rounded-xl text-sm"
            style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>← Back</button>
          <Link href={`/admin/customers/add?companyId=${id}`}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: "var(--color-primary)" }}>+ Add customer to this company</Link>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="px-4 py-2 rounded-xl text-sm"
              style={{ background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>✎ Edit</button>
          ) : (
            <button onClick={save} className="px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{ background: "var(--color-primary)" }}>Save</button>
          )}
        </>}
      />

      {/* Company Info card */}
      <div className="p-5 mb-5" style={card}>
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>Company Info</h2>
        {editing ? (
          <div className="space-y-3">
            {([
              ["Name", "name"], ["Phone", "phone"], ["Email", "email"], ["Address", "address"],
              ["Zone (เขต)", "zone"], ["Note", "note"],
            ] as [string, keyof typeof form][]).map(([label, key]) => (
              <label key={key} className="block">
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</span>
                <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full mt-0.5 px-3 py-2 rounded-lg text-sm outline-none" style={iS} />
              </label>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-3 gap-x-6">
            {([
              ["Name", company.name], ["Phone", company.phone || "—"], ["Email", company.email || "—"],
              ["Address", company.address || "—"], ["Zone", company.zone || "—"],
              ["Note", company.note || "—"],
            ] as [string, string][]).map(([label, val]) => (
              <div key={label}>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</p>
                <p className="text-sm" style={{ color: "var(--color-text)" }}>{val}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customers in this company */}
      <div className="p-5" style={card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Customers</h2>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{company.customers.length}</span>
        </div>
        {company.customers.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--color-text-subtle)" }}>No customers yet</p>
        ) : (
          <div className="space-y-2">
            {company.customers.map((c) => (
              <Link key={c.id} href={`/admin/customers/${c.id}`}
                className="block p-3 rounded-xl transition-colors hover:opacity-80"
                style={{ background: "var(--color-bg)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                      {c.fullName || c.customerCode}
                      <span className="text-xs ml-2" style={{ color: "var(--color-text-muted)" }}>{c.customerCode}</span>
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                      {[customerTypeLabel(c.title), c.phone, c.salesPerson, c.zone].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
