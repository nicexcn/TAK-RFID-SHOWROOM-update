"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

const TITLE_OPTIONS = [
  { value: "Architect",  label: "Architect / สถาปนิก" },
  { value: "Interior",   label: "Interior Designer / มัณฑนากร" },
  { value: "Turnkey",    label: "Turnkey / รับเหมาแบบครบวงจร" },
  { value: "Contractor", label: "Contractor / ผู้รับเหมา" },
  { value: "Homeowner",  label: "Homeowner / เจ้าของบ้านหรือโครงการ" },
  { value: "Other",      label: "Other / อื่นๆ" },
] as const;
type TitleType = typeof TITLE_OPTIONS[number]["value"];

const KNOW_CHANNELS = [
  "Facebook","Instagram","Website","Google search","Friend or colleague",
  "Designer / Architect recommendation","Event or exhibition","LINE","Email","Other",
] as const;

export default function AddCustomerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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

  const toggleChannel = (ch: string) =>
    setChannels((p) => p.includes(ch) ? p.filter((c) => c !== ch) : [...p, ch]);

  async function handleSubmit() {
    setError("");
    if (!fullName || !title || !company || !phone || !email) {
      setError("กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบถ้วน"); return;
    }
    if (!pdpa) { setError("กรุณายืนยัน PDPA consent"); return; }
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
        }),
      });
      if (res.ok) { router.push("/admin/customers"); }
      else { const d = await res.json(); setError(d.error || "เกิดข้อผิดพลาด"); }
    } finally { setSaving(false); }
  }

  const inputStyle = { background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Register Customer</h1>
          <p className="text-xs mt-1" style={{ color: "#9f886c" }}>Home / Customer Management / Add New</p>
        </div>
        <button onClick={() => router.back()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
          style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }}>
          ← Back
        </button>
      </div>

      <div className="rounded-xl p-8 space-y-8" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
        {/* Personal */}
        <section>
          <h2 className="text-base font-semibold mb-5" style={{ color: "#4c4847" }}>Personal Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "#4c4847" }}>
                Full Name / ชื่อ-นามสกุล <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="กรอกชื่อ-นามสกุล"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm mb-2" style={{ color: "#4c4847" }}>
                You are a ... / คุณคือ... <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TITLE_OPTIONS.map((t) => (
                  <button key={t.value} type="button" onClick={() => setTitle(t.value)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm transition-all text-left"
                    style={{
                      borderColor: title === t.value ? "#726c5a" : "#e6e5d8",
                      background: title === t.value ? "rgba(114,108,90,0.07)" : "transparent",
                      color: title === t.value ? "#4c4847" : "#9f886c",
                    }}>
                    <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: title === t.value ? "#726c5a" : "#cdc3ad" }}>
                      {title === t.value && <div className="w-2 h-2 rounded-full" style={{ background: "#726c5a" }} />}
                    </div>
                    {t.label}
                  </button>
                ))}
              </div>
              {title === "Other" && (
                <input value={titleOther} onChange={(e) => setTitleOther(e.target.value)}
                  placeholder="ระบุตำแหน่ง..."
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm mt-2" style={inputStyle} />
              )}
            </div>
          </div>
        </section>

        <hr style={{ borderColor: "#e6e5d8" }} />

        {/* Contact */}
        <section>
          <h2 className="text-base font-semibold mb-5" style={{ color: "#4c4847" }}>Company & Contact</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm mb-1.5" style={{ color: "#4c4847" }}>
                Company / บริษัท <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input value={company} onChange={(e) => setCompany(e.target.value)}
                placeholder="ชื่อบริษัท / หน่วยงาน"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "#4c4847" }}>
                Mobile Phone <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="0XX-XXX-XXXX"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "#4c4847" }}>LINE ID</label>
              <input value={lineId} onChange={(e) => setLineId(e.target.value)}
                placeholder="LINE ID"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm mb-1.5" style={{ color: "#4c4847" }}>
                Email <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
          </div>
        </section>

        <hr style={{ borderColor: "#e6e5d8" }} />

        {/* Channels */}
        <section>
          <h2 className="text-base font-semibold mb-1" style={{ color: "#4c4847" }}>
            How do you know us? / คุณรู้จักเราจากที่ไหน
          </h2>
          <p className="text-xs mb-4" style={{ color: "#9f886c" }}>เลือกได้มากกว่า 1 ช่องทาง</p>
          <div className="grid grid-cols-2 gap-2">
            {KNOW_CHANNELS.map((ch) => {
              const active = channels.includes(ch);
              return (
                <button key={ch} type="button" onClick={() => toggleChannel(ch)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm transition-all text-left"
                  style={{
                    borderColor: active ? "#726c5a" : "#e6e5d8",
                    background: active ? "rgba(114,108,90,0.07)" : "transparent",
                    color: active ? "#4c4847" : "#9f886c",
                  }}>
                  <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ borderColor: active ? "#726c5a" : "#cdc3ad", background: active ? "#726c5a" : "transparent" }}>
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
              placeholder="ระบุช่องทางอื่นๆ..."
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mt-3" style={inputStyle} />
          )}
        </section>

        <hr style={{ borderColor: "#e6e5d8" }} />

        {/* PDPA */}
        <section>
          <button type="button" onClick={() => setPdpa(!pdpa)} className="flex items-start gap-3 w-full text-left">
            <div className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
              style={{ borderColor: pdpa ? "#726c5a" : "#cdc3ad", background: pdpa ? "#726c5a" : "transparent" }}>
              {pdpa && (
                <svg viewBox="0 0 10 8" className="w-3 h-2.5" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#726c5a" }}>
              <span style={{ color: "#dc2626" }}>*</span>{" "}
              I consent to <strong>nimitrlab</strong> collecting and using my personal data for showroom
              registration, event communication, and related promotional purposes.
            </p>
          </button>
        </section>

        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => router.back()}
            className="px-6 py-3 rounded-xl text-sm font-medium"
            style={{ background: "#f5f2ee", color: "#4c4847" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "#726c5a" }}>
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? "Saving..." : "Register Customer"}
          </button>
        </div>
      </div>
    </div>
  );
}