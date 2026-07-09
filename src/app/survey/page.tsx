"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { SURVEY_ITEMS, SURVEY_TITLE } from "@/lib/survey";

// #3: public satisfaction survey (customers fill it — no login). Submits to POST /api/survey.
type Answer = string | string[] | number | undefined;

export default function SurveyPage() {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [link, setLink] = useState<{ customerId?: string; sessionId?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setLink({ customerId: p.get("customer") || undefined, sessionId: p.get("session") || undefined });
  }, []);

  const setRadio = (key: string, opt: string) => setAnswers((a) => ({ ...a, [key]: opt }));
  const setScale = (key: string, n: number) => setAnswers((a) => ({ ...a, [key]: n }));
  const setText = (key: string, v: string) => setAnswers((a) => ({ ...a, [key]: v }));
  const toggle = (key: string, opt: string) => setAnswers((a) => {
    const cur = Array.isArray(a[key]) ? (a[key] as string[]) : [];
    return { ...a, [key]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt] };
  });

  const hasAnswer = Object.values(answers).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ""));

  async function submit() {
    if (!hasAnswer) { setError("กรุณาตอบอย่างน้อย 1 ข้อ / Please answer at least one question"); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/survey", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, customerId: link.customerId, sessionId: link.sessionId }),
      });
      if (res.ok) setDone(true);
      else setError("ส่งแบบประเมินไม่สำเร็จ กรุณาลองใหม่");
    } catch { setError("ส่งแบบประเมินไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setSubmitting(false); }
  }

  const field = { background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" };

  if (done) return (
    <div style={{ minHeight: "100vh", background: "#f5f2ee", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "40px 28px", textAlign: "center", maxWidth: 420 }}>
        <Image src="/b-logo.png" alt="nimitrlab" width={150} height={52} className="object-contain mx-auto mb-5" />
        <p style={{ fontSize: 22, fontWeight: 600, color: "#4c4847", marginBottom: 8 }}>ขอบคุณค่ะ 🙏</p>
        <p style={{ fontSize: 14, color: "#9f886c" }}>ขอบคุณสำหรับความคิดเห็นของคุณ — Thank you for your feedback!</p>
        <button onClick={() => { setDone(false); setAnswers({}); setError(""); }}
          style={{ marginTop: 22, padding: "10px 22px", borderRadius: 12, background: "#726c5a", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          ส่งอีกครั้ง / Submit another
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f5f2ee", padding: "24px 16px 60px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <Image src="/b-logo.png" alt="nimitrlab" width={150} height={52} className="object-contain mx-auto mb-3" />
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#4c4847" }}>{SURVEY_TITLE}</h1>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {SURVEY_ITEMS.map((item, i) => {
            if (item.type === "section") return (
              <h2 key={`s${i}`} style={{ fontSize: 16, fontWeight: 600, color: "#726c5a", marginTop: 12, paddingBottom: 4, borderBottom: "2px solid #e6e5d8" }}>{item.title}</h2>
            );
            const val = answers[item.key];
            return (
              <div key={item.key} style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", border: "1px solid #e6e5d8" }}>
                <p style={{ fontSize: 14, color: "#4c4847", marginBottom: 12, lineHeight: 1.4 }}>{item.title}</p>

                {item.type === "scale" && (
                  <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                    {Array.from({ length: item.scale }, (_, n) => n + 1).map((n) => (
                      <button key={n} onClick={() => setScale(item.key, n)}
                        style={{ flex: 1, aspectRatio: "1", borderRadius: 12, fontSize: 18, fontWeight: 600, cursor: "pointer",
                          background: val === n ? "#726c5a" : "#f5f2ee", color: val === n ? "#fff" : "#9f886c", border: "1px solid #e6e5d8" }}>
                        {n}
                      </button>
                    ))}
                  </div>
                )}

                {(item.type === "radio" || item.type === "checkbox") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {item.options.map((opt) => {
                      const active = item.type === "radio" ? val === opt : Array.isArray(val) && val.includes(opt);
                      return (
                        <button key={opt} onClick={() => item.type === "radio" ? setRadio(item.key, opt) : toggle(item.key, opt)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                            border: `2px solid ${active ? "#726c5a" : "#e6e5d8"}`, background: active ? "rgba(114,108,90,0.07)" : "#fff", color: active ? "#4c4847" : "#9f886c" }}>
                          <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: item.type === "radio" ? 9 : 5, border: `2px solid ${active ? "#726c5a" : "#cdc3ad"}`, background: active && item.type === "checkbox" ? "#726c5a" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {active && item.type === "radio" && <span style={{ width: 8, height: 8, borderRadius: 5, background: "#726c5a" }} />}
                            {active && item.type === "checkbox" && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                          </span>
                          <span style={{ fontSize: 13.5 }}>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {item.type === "text" && (
                  <textarea value={(val as string) || ""} onChange={(e) => setText(item.key, e.target.value)} rows={3}
                    placeholder="…" style={{ ...field, width: "100%", borderRadius: 12, padding: "10px 12px", fontSize: 14, outline: "none", resize: "vertical" }} />
                )}
              </div>
            );
          })}
        </div>

        {error && <p style={{ color: "#dc2626", fontSize: 14, marginTop: 14, textAlign: "center" }}>{error}</p>}
        <button onClick={submit} disabled={submitting || !hasAnswer}
          style={{ width: "100%", marginTop: 20, padding: "14px", borderRadius: 14, background: "#726c5a", color: "#fff", fontSize: 16, fontWeight: 600, border: "none", cursor: "pointer", opacity: submitting || !hasAnswer ? 0.5 : 1 }}>
          {submitting ? "กำลังส่ง…" : "ส่งแบบประเมิน / Submit"}
        </button>
      </div>
    </div>
  );
}
