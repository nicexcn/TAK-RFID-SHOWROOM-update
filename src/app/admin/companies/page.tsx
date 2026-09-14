"use client";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { toast } from "sonner";

interface Company {
  id: string; name: string; phone?: string | null; email?: string | null;
  zone?: string | null; note?: string | null;
  customerCount: number;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/companies${q}`)
      .then((r) => r.json())
      .then((d) => { setCompanies(Array.isArray(d) ? d : []); })
      .catch(() => { toast("Failed to load companies"); })
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div>
      <PageHeader
        title="Companies"
        crumbs={[{ label: "Home", href: "/admin" }, { label: "Companies" }]}
      />
      <div className="mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies…"
          className="w-full max-w-md px-4 py-2.5 rounded-xl outline-none text-sm"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
        />
      </div>
      {loading ? (
        <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Loading…</p>
      ) : companies.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>No companies yet</p>
      ) : (
        <div className="space-y-2">
          {companies.map((c) => (
            <Link key={c.id} href={`/admin/companies/${c.id}`}
              className="block p-4 rounded-xl transition-colors hover:opacity-80"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>{c.name}</p>
                  <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                    {[c.zone, c.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                  style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}>
                  {c.customerCount} customer{c.customerCount !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
