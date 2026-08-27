"use client";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/Spinner";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CUSTOMER_TYPES } from "@/lib/customerTypes";

const TITLE_OPTIONS = CUSTOMER_TYPES.map((t) => ({ value: t.value, label: `${t.label} / ${t.labelTh}` }));
type TitleType = string;

const KNOW_CHANNELS = [
  "Facebook","Instagram","Website","Google search","Friend or colleague",
  "Designer / Architect recommendation","Event or exhibition","LINE","Email","Other",
] as const;

export default function AddCustomerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // #8: per-field feedback (red ring + helper text) keyed by field name.
  type FieldKey = "fullName" | "title" | "titleOther" | "company" | "phone" | "email" | "pdpa";
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const clearFieldError = (k: FieldKey) => setFieldErrors((p) => (p[k] ? { ...p, [k]: undefined } : p));
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState<TitleType | "">("");
  const [titleOther, setTitleOther] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [lineId, setLineId] = useState("");
  const [email, setEmail] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [channelOther, setChannelOther] = useState("");
  const [pdpa, setPdpa] = useState(false);
  const [salesPerson, setSalesPerson] = useState(""); // #2: staff-filled — who handles this customer
  const [project, setProject] = useState(""); // #4: project this customer is associated with
  const [zone, setZone] = useState(""); // slide 3: sales territory (เขต) of the customer/project
  // Source field removed (TAK feedback 6/8/26 slide 5) — the customer form no longer asks how they came in.
  const [salesOptions, setSalesOptions] = useState<{ name: string; code: string }[]>([]);
  const [me, setMe] = useState(""); // logged-in staff — the default "Sales Showroom person" for walk-ins
  // Zone suggestions from zones already on file (falls back to a sensible default set).
  const [existingZones, setExistingZones] = useState<string[]>([]);

  // Refs to move the user to the first missing required field on submit.
  const fullNameRef = useRef<HTMLInputElement>(null);
  const occupationRef = useRef<HTMLDivElement>(null);
  const titleOtherRef = useRef<HTMLInputElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const pdpaRef = useRef<HTMLElement>(null);

  const toggleChannel = (ch: string) =>
    setChannels((p) => p.includes(ch) ? p.filter((c) => c !== ch) : [...p, ch]);

  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: "smooth", block: "center" });

  // #2: options for the staff "Sales" combobox come from the Sale master (Settings →
  // Salesperson, name + ERP code so slide-28 search can match both), plus any legacy
  // managed names still referenced by existing customers.
  useEffect(() => {
    Promise.all([
      fetch("/api/sales").then((r) => r.json()).catch(() => []),
      fetch("/api/dropdown?type=sales").then((r) => r.json()).catch(() => []),
    ]).then(([master, legacy]: [{ name: string; code: string }[], { value: string }[]]) => {
      const fromMaster = (Array.isArray(master) ? master : []).map((s) => ({ name: s.name, code: s.code }));
      const masterNames = new Set(fromMaster.map((s) => s.name));
      const fromLegacy = (Array.isArray(legacy) ? legacy : [])
        .map((o) => ({ name: o.value, code: "" }))
        .filter((s) => !masterNames.has(s.name));
      setSalesOptions([...fromMaster, ...fromLegacy]);
    });
  }, []);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.username) setMe(d.username); }).catch(() => {}); }, []);
  useEffect(() => {
    fetch("/api/customers?all=true")
      .then((r) => r.json())
      .then((rows: { zone?: string | null }[]) => {
        if (!Array.isArray(rows)) return;
        setExistingZones([...new Set(rows.map((c) => c.zone).filter(Boolean) as string[])]);
      })
      .catch(() => {});
  }, []);

  // #2: the "Sales Showroom person in charge" defaults to the logged-in staff (editable later).
  // Only auto-fills when the field is still empty, so we never clobber a name the staff picked.
  // (Was gated on Source = Walk-in; Source field removed per TAK feedback slide 5.)
  useEffect(() => {
    if (me && !salesPerson) setSalesPerson(me);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    setError("");
    setFieldErrors({});
    const req = "Please fill in all required fields (*).";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    // Show the summary error AND per-field helper text; focus/scroll to the first invalid field.
    if (!fullName) { setError(req); setFieldErrors({ fullName: "Full name is required" }); fullNameRef.current?.focus(); return; }
    if (!title) { setError(req); setFieldErrors({ title: "Please select an option" }); scrollTo(occupationRef.current); return; }
    if (title === "Other" && !titleOther.trim()) { setError(req); setFieldErrors({ titleOther: "Please specify the segment" }); titleOtherRef.current?.focus(); return; }
    if (!company) { setError(req); setFieldErrors({ company: "Company is required" }); companyRef.current?.focus(); return; }
    if (!phone) { setError(req); setFieldErrors({ phone: "Mobile phone is required" }); phoneRef.current?.focus(); return; }
    if (!email) { setError(req); setFieldErrors({ email: "Email is required" }); emailRef.current?.focus(); return; }
    if (!emailOk) { setError("Please enter a valid email address."); setFieldErrors({ email: "Enter a valid email address" }); emailRef.current?.focus(); return; }
    if (!pdpa) { setError("Please confirm PDPA consent."); setFieldErrors({ pdpa: "Consent is required" }); scrollTo(pdpaRef.current); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName, title,
          titleOther: title === "Other" ? titleOther : undefined,
          company, phone, email,
          lineId: lineId || undefined,
          knowChannel: channels,
          knowChannelOther: channels.includes("Other") ? channelOther : undefined,
          pdpaConsent: pdpa,
          salesPerson: salesPerson || undefined,
          zone: zone || undefined,
          project: project || undefined,
        }),
      });
      if (res.ok) { router.push("/admin/customers"); }
      else { const d = await res.json(); setError(d.error || "Something went wrong. Please try again."); }
    } finally { setSaving(false); }
  }

  const inputStyle = { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" };
  // #8: red ring for an invalid field (merged onto inputStyle).
  const errorRing = { boxShadow: "0 0 0 2px var(--color-danger)", borderColor: "var(--color-danger)" };

  return (
    <div>
      <PageHeader
        title="Add Customer"
        crumbs={[{ label: "Home", href: "/admin" }, { label: "Customer Management", href: "/admin/customers" }, { label: "Add Customer" }]}
        actions={
          <button onClick={() => router.back()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
            ← Back
          </button>
        }
      />

      <div className="rounded-xl p-8 space-y-8" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        {/* Personal */}
        <section>
          <h2 className="text-base font-semibold mb-5" style={{ color: "var(--color-text)" }}>Personal Information</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm mb-1.5" style={{ color: "var(--color-text)" }}>
                Full Name / ชื่อ-นามสกุล <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <input id="fullName" ref={fullNameRef} value={fullName}
                onChange={(e) => { setFullName(e.target.value); clearFieldError("fullName"); }}
                aria-invalid={!!fieldErrors.fullName}
                placeholder="Enter full name"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={fieldErrors.fullName ? { ...inputStyle, ...errorRing } : inputStyle} />
              {fieldErrors.fullName && <p className="text-xs mt-1" style={{ color: "var(--color-danger)" }}>{fieldErrors.fullName}</p>}
            </div>
            <div ref={occupationRef}>
              <label className="block text-sm mb-2" style={{ color: "var(--color-text)" }}>
                You are a ... / คุณคือ... <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TITLE_OPTIONS.map((t) => (
                  <button key={t.value} type="button" onClick={() => { setTitle(t.value); clearFieldError("title"); }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm transition-all text-left"
                    style={{
                      borderColor: title === t.value ? "var(--color-primary)" : "var(--color-border)",
                      background: title === t.value ? "rgba(114,108,90,0.07)" : "transparent",
                      color: title === t.value ? "var(--color-text)" : "var(--color-text-muted)",
                    }}>
                    <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: title === t.value ? "var(--color-primary)" : "var(--color-sidebar)" }}>
                      {title === t.value && <div className="w-2 h-2 rounded-full" style={{ background: "var(--color-primary)" }} />}
                    </div>
                    {t.label}
                  </button>
                ))}
              </div>
              {fieldErrors.title && <p className="text-xs mt-1.5" style={{ color: "var(--color-danger)" }}>{fieldErrors.title}</p>}
              {title === "Other" && (
                <>
                  <input id="titleOther" ref={titleOtherRef} value={titleOther}
                    onChange={(e) => { setTitleOther(e.target.value); clearFieldError("titleOther"); }}
                    aria-invalid={!!fieldErrors.titleOther}
                    placeholder="Specify segment..."
                    className="w-full px-4 py-3 rounded-xl outline-none text-sm mt-2" style={fieldErrors.titleOther ? { ...inputStyle, ...errorRing } : inputStyle} />
                  {fieldErrors.titleOther && <p className="text-xs mt-1" style={{ color: "var(--color-danger)" }}>{fieldErrors.titleOther}</p>}
                </>
              )}
            </div>
          </div>
        </section>

        <hr style={{ borderColor: "var(--color-border)" }} />

        {/* Contact */}
        <section>
          <h2 className="text-base font-semibold mb-5" style={{ color: "var(--color-text)" }}>Company & Contact</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label htmlFor="company" className="block text-sm mb-1.5" style={{ color: "var(--color-text)" }}>
                Company / บริษัท <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <input id="company" ref={companyRef} value={company}
                onChange={(e) => { setCompany(e.target.value); clearFieldError("company"); }}
                aria-invalid={!!fieldErrors.company}
                placeholder="Company / organisation name"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={fieldErrors.company ? { ...inputStyle, ...errorRing } : inputStyle} />
              {fieldErrors.company && <p className="text-xs mt-1" style={{ color: "var(--color-danger)" }}>{fieldErrors.company}</p>}
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm mb-1.5" style={{ color: "var(--color-text)" }}>
                Mobile Phone <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <input id="phone" ref={phoneRef} value={phone}
                onChange={(e) => { setPhone(e.target.value); clearFieldError("phone"); }}
                aria-invalid={!!fieldErrors.phone}
                placeholder="0XX-XXX-XXXX"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={fieldErrors.phone ? { ...inputStyle, ...errorRing } : inputStyle} />
              {fieldErrors.phone && <p className="text-xs mt-1" style={{ color: "var(--color-danger)" }}>{fieldErrors.phone}</p>}
            </div>
            <div>
              <label htmlFor="lineId" className="block text-sm mb-1.5" style={{ color: "var(--color-text)" }}>LINE ID</label>
              <input id="lineId" value={lineId} onChange={(e) => setLineId(e.target.value)}
                placeholder="LINE ID"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div className="col-span-2">
              <label htmlFor="email" className="block text-sm mb-1.5" style={{ color: "var(--color-text)" }}>
                Email <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <input id="email" ref={emailRef} type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                aria-invalid={!!fieldErrors.email}
                placeholder="email@example.com"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={fieldErrors.email ? { ...inputStyle, ...errorRing } : inputStyle} />
              {fieldErrors.email && <p className="text-xs mt-1" style={{ color: "var(--color-danger)" }}>{fieldErrors.email}</p>}
            </div>
          </div>
        </section>

        <hr style={{ borderColor: "var(--color-border)" }} />

        {/* Channels */}
        <section>
          <h2 className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>
            How do you know us? / คุณรู้จักเราจากที่ไหน
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>You can select more than one channel</p>
          <div className="grid grid-cols-2 gap-2">
            {KNOW_CHANNELS.map((ch) => {
              const active = channels.includes(ch);
              return (
                <button key={ch} type="button" onClick={() => toggleChannel(ch)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm transition-all text-left"
                  style={{
                    borderColor: active ? "var(--color-primary)" : "var(--color-border)",
                    background: active ? "rgba(114,108,90,0.07)" : "transparent",
                    color: active ? "var(--color-text)" : "var(--color-text-muted)",
                  }}>
                  <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ borderColor: active ? "var(--color-primary)" : "var(--color-sidebar)", background: active ? "var(--color-primary)" : "transparent" }}>
                    {active && (
                      <svg viewBox="0 0 10 8" className="w-2.5 h-2" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  {ch}
                </button>
              );
            })}
          </div>
          {channels.includes("Other") && (
            <input value={channelOther} onChange={(e) => setChannelOther(e.target.value)}
              placeholder="Specify other channel..."
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mt-3" style={inputStyle} />
          )}
        </section>

        <hr style={{ borderColor: "var(--color-border)" }} />

        {/* PDPA */}
        <section ref={pdpaRef}>
          <button type="button" onClick={() => { setPdpa(!pdpa); clearFieldError("pdpa"); }} className="flex items-start gap-3 w-full text-left">
            <div className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
              style={{ borderColor: pdpa ? "var(--color-primary)" : "var(--color-sidebar)", background: pdpa ? "var(--color-primary)" : "transparent" }}>
              {pdpa && (
                <svg viewBox="0 0 10 8" className="w-3 h-2.5" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              <span style={{ color: "var(--color-danger)" }}>*</span>{" "}
              I consent to <strong>nimitrlab</strong> collecting and using my personal data for showroom
              registration, event communication, and related promotional purposes.
            </p>
          </button>
          {fieldErrors.pdpa && <p className="text-xs mt-1.5 ml-8" style={{ color: "var(--color-danger)" }}>{fieldErrors.pdpa}</p>}
        </section>

        {/* #2: staff-only section — visually separated from the customer-filled fields above */}
        <section className="rounded-xl p-5" style={{ background: "var(--color-bg)", border: "1px dashed var(--color-sidebar)" }}>
          <h2 className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>
            For staff use
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>Filled in by staff — not part of the customer form.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="salesPerson" className="block text-sm mb-1.5" style={{ color: "var(--color-text)" }}>Sales</label>
              {/* Slide 28: 60+ sales — searchable combobox (type to filter by name or staff code),
                  not a plain dropdown. datalist keeps it native; the value stored is "name". */}
              <input id="salesPerson" list="sales-options" value={salesPerson}
                onChange={(e) => setSalesPerson(e.target.value)} aria-label="Sales"
                placeholder="Type to search name or code…"
                autoComplete="off"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              <datalist id="sales-options">
                {salesOptions.map((s) => <option key={s.name} value={s.name}>{s.code}</option>)}
                {me && !salesOptions.some((s) => s.name === me) ? <option value={me} /> : null}
              </datalist>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>
                Auto-filled with the showroom sales on duty · Manage the sales list in Settings → Product Management → Salesperson
              </p>
            </div>
            <div>
              <label htmlFor="project" className="block text-sm mb-1.5" style={{ color: "var(--color-text)" }}>Project</label>
              <input id="project" value={project} onChange={(e) => setProject(e.target.value)}
                placeholder="e.g. Samsung Office"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              <p className="text-[11px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>Used in Reports search &amp; printed on the sticker</p>
            </div>
            <div>
              <label htmlFor="zone" className="block text-sm mb-1.5" style={{ color: "var(--color-text)" }}>Zone (เขต)</label>
              <input id="zone" value={zone} onChange={(e) => setZone(e.target.value)}
                list="zone-options" placeholder="e.g. กรุงเทพฯ ตะวันออก"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              <datalist id="zone-options">
                {(existingZones.length ? existingZones : ["กรุงเทพฯ", "ต่างจังหวัด", "ต่างประเทศ"]).map((z) => <option key={z} value={z} />)}
              </datalist>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>Sales territory — helps identify the covering sale</p>
            </div>
          </div>
        </section>

        {error && <p className="text-sm" style={{ color: "var(--color-danger)" }}>{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => router.back()}
            className="px-6 py-3 rounded-xl text-sm font-medium"
            style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-primary)" }}>
            {saving && <Spinner size="sm" color="#fff" />}
            {saving ? <span className="inline-flex items-center gap-2"><Spinner size="xs" color="currentColor" /> Saving...</span> : "Add Customer"}
          </button>
        </div>
      </div>
    </div>
  );
}
