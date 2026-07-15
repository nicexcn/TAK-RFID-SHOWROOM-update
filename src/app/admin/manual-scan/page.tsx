"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useState, useEffect, useRef, useMemo } from "react";
import { getDeviceId } from "@/lib/deviceId";

// #5: manual item-selection ("scan without RFID") — for back-office give-outs / souvenirs.
// Reuses the exact same session + scan APIs as Surface Scan, so records feed the same
// takeaway/report tracking. Difference: products are picked by hand, not read from a tag.
//
// Every scan op is keyed by (sessionId, productId): the PATCH route upserts on that unique
// key (so PATCH also CREATES the scan) and DELETE resolves by it too. Keying on productId —
// not a server scan id — means there is no optimistic-id/reconcile step and no add/remove race.

interface Product {
  id: string; name: string; brand: string | null; productCode: string | null;
  materialType: string | null; category: string | null; imageUrl: string | null; location: string | null;
}
interface ScanItem { product: Product; takeawayQty: number; }
interface Customer { id: string; customerCode: string; fullName: string; company: string; phone: string; }

const SEARCH_TYPES = [
  { key: "code", label: "ID" },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
] as const;

const SHOWN_CAP = 60;

export default function ManualScanPage() {
  // Customer selection
  const [searchType, setSearchType] = useState<"code" | "name" | "phone">("code");
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]); // #8
  const [contactName, setContactName] = useState("");

  // Session
  const [session, setSession] = useState<{ id: string; customerCode: string; scans: ScanItem[] } | null>(null);
  const [starting, setStarting] = useState(false);
  const activeSessionId = useRef<string | null>(null); // guards late async callbacks after finish/switch
  // Serialize network ops per productId so add / qty / remove for the SAME item can't race
  // across independent requests: a DELETE always runs after an in-flight create, and qty
  // patches commit in the order they were issued (no last-writer-wins divergence).
  const opChains = useRef<Map<string, Promise<unknown>>>(new Map());
  // productId -> a per-add token. Guards a same-tick double-click; the token lets an add's
  // cleanup skip the delete if a newer add (after a remove) has since taken the slot.
  const pendingAdd = useRef<Map<string, number>>(new Map());
  const addToken = useRef(0);
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(true);
  const notify = (text: string, ok = true) => { setNotice(text); setNoticeOk(ok); };

  // Takeaway limit (fetched from settings; server enforces too)
  const [takeawayLimit, setTakeawayLimit] = useState(3);
  const [takeawayEnabled, setTakeawayEnabled] = useState(true);

  // Catalog
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [pQuery, setPQuery] = useState("");

  useEffect(() => {
    fetch("/api/products?all=true")
      .then((r) => r.json())
      .then((d) => setCatalog(Array.isArray(d?.products) ? d.products : []))
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.takeawayLimit !== undefined) setTakeawayLimit(Number(d.takeawayLimit));
        if (d?.takeawayEnabled !== undefined) setTakeawayEnabled(!!d.takeawayEnabled);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2800);
    return () => clearTimeout(t);
  }, [notice]);

  const addedIds = useMemo(() => new Set((session?.scans || []).map((s) => s.product.id)), [session]);
  const totalTaken = (session?.scans || []).reduce((sum, s) => sum + (s.takeawayQty || 0), 0);
  const atLimit = takeawayEnabled && totalTaken >= takeawayLimit;

  const matches = useMemo(() => {
    const q = pQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((p) =>
      [p.name, p.productCode, p.brand, p.category, p.materialType].filter(Boolean).some((v) => v!.toLowerCase().includes(q))
    );
  }, [catalog, pQuery]);
  const shown = matches.slice(0, SHOWN_CAP);

  function limitMsg(d: { error?: string; limit?: number }) {
    if (typeof d?.limit === "number") return `ถึงขีดจำกัดการหยิบ (สูงสุด ${d.limit} ชิ้นต่อครั้ง)`;
    return d?.error || "อัปเดตจำนวนไม่สำเร็จ";
  }

  async function searchCustomer() {
    if (!query.trim()) return;
    setSearching(true); setSearchError(""); setCustomer(null); setContacts([]); setContactName("");
    try {
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query.trim())}&type=${searchType}`);
      const data = await res.json();
      if (data?.id) {
        setCustomer(data);
        setContactName(""); // "" = primary contact; only set when staff pick an extra contact
        fetch(`/api/customers/${data.id}/contacts`).then((r) => r.json())
          .then((cs) => setContacts(Array.isArray(cs) ? cs : [])).catch(() => setContacts([]));
      } else setSearchError("ไม่พบข้อมูลลูกค้า");
    } catch { setSearchError("ค้นหาไม่สำเร็จ"); }
    finally { setSearching(false); }
  }

  async function startSession(code: string, custId: string | null, contact?: string) {
    setStarting(true); setSearchError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode: code, customerId: custId, contactName: contact || undefined, deviceId: `${getDeviceId()}:manual` }),
      });
      const data = await res.json();
      if (!res.ok || !data?.id) { setSearchError("เริ่มรายการไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
      activeSessionId.current = data.id;
      setSession({ id: data.id, customerCode: code, scans: [] });
      // The server closes any OTHER active session for this customer (e.g. an in-progress
      // Surface Scan) — surface that so staff know they've taken the customer over.
      if (data.replacedActiveSession) notify("หมายเหตุ: ปิดรายการที่ค้างอยู่ของลูกค้ารายนี้ (สถานีอื่น) แล้ว", false);
    } catch { setSearchError("เริ่มรายการไม่สำเร็จ"); }
    finally { setStarting(false); }
  }

  // Run `op` after any in-flight op for the same product resolves (per-product serial queue).
  function enqueue<T>(productId: string, op: () => Promise<T>): Promise<T> {
    const prev = opChains.current.get(productId) ?? Promise.resolve();
    const next = prev.then(op, op); // run regardless of the previous op's outcome
    opChains.current.set(productId, next);
    next.finally(() => { if (opChains.current.get(productId) === next) opChains.current.delete(productId); });
    return next as Promise<T>;
  }

  // Upsert takeawayQty for a product (also CREATES the scan when it doesn't exist yet). Never throws.
  async function patchQty(productId: string, qty: number): Promise<boolean> {
    if (!session) return false;
    const sid = session.id;
    try {
      const res = await fetch(`/api/sessions/${sid}/scans/${productId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeawayQty: qty, productId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (activeSessionId.current === sid) notify(limitMsg(d), false); // skip if the session was already closed
      }
      return res.ok;
    } catch { return false; }
  }

  async function addProduct(p: Product) {
    if (!session || addedIds.has(p.id) || pendingAdd.current.has(p.id)) return; // pendingAdd = same-tick double-click guard
    if (atLimit) { notify(`ถึงขีดจำกัดการหยิบ (สูงสุด ${takeawayLimit} ชิ้นต่อครั้ง)`, false); return; }
    const token = ++addToken.current;
    pendingAdd.current.set(p.id, token);
    const optimistic: ScanItem = { product: p, takeawayQty: 1 };
    setSession((s) => (s ? { ...s, scans: [optimistic, ...s.scans] } : s));
    const ok = await enqueue(p.id, () => patchQty(p.id, 1)); // upsert creates the scan at qty 1 (server checks the limit first)
    const owns = pendingAdd.current.get(p.id) === token; // false if a remove→re-add has since taken the slot
    if (owns) pendingAdd.current.delete(p.id);
    // Only revert if THIS add still owns the row — else a newer re-add legitimately re-inserted it.
    if (!ok && owns) setSession((s) => (s ? { ...s, scans: s.scans.filter((sc) => sc.product.id !== p.id) } : s));
  }

  async function changeQty(scan: ScanItem, delta: number) {
    if (delta < 0 && scan.takeawayQty <= 1) { removeScan(scan); return; } // "−" at 1 removes the row
    if (delta > 0 && atLimit) { notify(`ถึงขีดจำกัดการหยิบ (สูงสุด ${takeawayLimit} ชิ้นต่อครั้ง)`, false); return; }
    const next = Math.max(0, scan.takeawayQty + delta);
    if (next === scan.takeawayQty) return;
    setSession((s) => (s ? { ...s, scans: s.scans.map((sc) => (sc.product.id === scan.product.id ? { ...sc, takeawayQty: next } : sc)) } : s));
    const ok = await enqueue(scan.product.id, () => patchQty(scan.product.id, next));
    // Reconcile from server truth rather than a captured prev — a captured value could clobber
    // a later op that already committed (correct even with concurrent qty changes on the item).
    if (!ok) enqueue(scan.product.id, () => reconcileQty(scan.product.id)); // serialize the re-sync after any queued qty op
  }

  // Re-sync ONE product's qty (or drop it) from the server — used after a rejected qty change,
  // so a stale captured value can't diverge from what actually committed. Touches only that row.
  async function reconcileQty(productId: string) {
    const sid = session?.id;
    if (!sid) return;
    try {
      const res = await fetch(`/api/sessions?deviceId=${encodeURIComponent(`${getDeviceId()}:manual`)}`);
      const data = await res.json();
      if (data?.id !== sid || activeSessionId.current !== sid || !Array.isArray(data?.scans)) return;
      const server = data.scans.find((s: { product?: { id: string }; takeawayQty: number }) => s.product?.id === productId);
      setSession((cur) => {
        if (!cur || cur.id !== sid) return cur;
        if (!server) return { ...cur, scans: cur.scans.filter((sc) => sc.product.id !== productId) };
        return { ...cur, scans: cur.scans.map((sc) => (sc.product.id === productId ? { ...sc, takeawayQty: server.takeawayQty } : sc)) };
      });
    } catch { /* keep current */ }
  }

  async function removeScan(scan: ScanItem) {
    const sid = session?.id;
    pendingAdd.current.delete(scan.product.id); // removing clears any in-flight-add guard so a fast re-add isn't blocked
    setSession((s) => (s ? { ...s, scans: s.scans.filter((sc) => sc.product.id !== scan.product.id) } : s));
    if (!sid) return;
    // Enqueued after any in-flight create/qty for this product, so the DELETE always runs
    // last → removing a just-added item can never leave an orphan row. DELETE is idempotent.
    await enqueue(scan.product.id, () =>
      fetch(`/api/sessions/${sid}/scans/${scan.product.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: scan.product.id }),
      }).then(() => {}).catch(() => {})
    );
  }

  async function closeSession(msg?: string) {
    const sid = session?.id;
    activeSessionId.current = null; // stop late callbacks from writing notices
    setSession(null); setCustomer(null); setQuery(""); setPQuery("");
    if (msg) notify(msg, true);
    if (sid) await fetch(`/api/sessions/${sid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }

  const inputStyle = { background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Manual Scan</h1>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Manual Scan" }]} />
          <p className="text-sm mt-1" style={{ color: "#6f5f48" }}>เลือกสินค้าด้วยตนเอง (ไม่ต้องใช้ RFID) — สำหรับหลังบ้าน / ของชำร่วย</p>
        </div>
      </div>

      {notice && (
        <div className="mb-4 px-4 py-2.5 rounded-xl text-sm"
          style={noticeOk
            ? { background: "#f0f7f2", border: "1px solid #cfe6d8", color: "#4a7c59" }
            : { background: "#fdf6ec", border: "1px solid #f0dcc0", color: "#9a6a2f" }}>
          {notice}
        </div>
      )}

      {!session ? (
        /* Step 1 — choose a customer (or start a walk-in) */
        <div className="rounded-xl p-6 max-w-xl" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
          <h2 className="text-base font-semibold mb-4" style={{ color: "#4c4847" }}>เลือกลูกค้า</h2>
          <div className="flex gap-2 mb-3">
            {SEARCH_TYPES.map((t) => (
              <button key={t.key} onClick={() => setSearchType(t.key)}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: searchType === t.key ? "#726c5a" : "#f5f2ee", color: searchType === t.key ? "#fff" : "#6f5f48" }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchCustomer()}
              placeholder={searchType === "code" ? "รหัสลูกค้า เช่น Ar00001" : searchType === "name" ? "ชื่อลูกค้า" : "เบอร์โทร"}
              className="flex-1 px-4 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
            <button onClick={searchCustomer} disabled={searching}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50" style={{ background: "#726c5a" }}>
              {searching ? "..." : "ค้นหา"}
            </button>
          </div>
          {searchError && <p className="text-sm mt-3" style={{ color: "#dc2626" }}>{searchError}</p>}
          {customer && (
            <div className="mt-4 p-4 rounded-xl" style={{ background: "#f5f2ee" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "#4c4847" }}>{customer.customerCode} · {customer.fullName}</p>
                  <p className="text-xs truncate" style={{ color: "#6f5f48" }}>{[customer.company, customer.phone].filter(Boolean).join(" · ")}</p>
                </div>
                <button onClick={() => startSession(customer.customerCode, customer.id, contactName)} disabled={starting}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 flex-shrink-0" style={{ background: "#4a7c59" }}>
                  {starting ? "..." : "เริ่มรายการ →"}
                </button>
              </div>
              {contacts.length > 0 && (
                <div className="mt-3">
                  <label className="block text-[11px] mb-1" style={{ color: "#6f5f48" }}>ผู้ติดต่อ / Contact</label>
                  <select aria-label="Contact" value={contactName} onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }}>
                    <option value="">{customer.fullName} (หลัก)</option>
                    {contacts.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid #f0eee6" }}>
            <button onClick={() => startSession("WALK-IN", null)} disabled={starting}
              className="text-sm underline disabled:opacity-50" style={{ color: "#6f5f48" }}>
              หรือเริ่มแบบไม่ระบุลูกค้า (Walk-in)
            </button>
          </div>
        </div>
      ) : (
        /* Step 2 — pick products + review the taken list */
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Catalog */}
          <div className="lg:col-span-3 rounded-xl p-5" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
            <div className="flex items-center gap-2 mb-3">
              <svg width="14" height="14" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input value={pQuery} onChange={(e) => setPQuery(e.target.value)}
                placeholder="ค้นหาสินค้า (ชื่อ / รหัส / แบรนด์)"
                className="flex-1 outline-none text-sm" style={{ background: "transparent", color: "#4c4847" }} />
            </div>
            {matches.length > SHOWN_CAP && (
              <p className="text-[11px] mb-2" style={{ color: "#9a6a2f" }}>
                แสดง {SHOWN_CAP} จาก {matches.length} รายการ — พิมพ์ค้นหาเพื่อจำกัดผลลัพธ์
              </p>
            )}
            {atLimit && (
              <p className="text-[11px] mb-2" style={{ color: "#9a6a2f" }}>ถึงขีดจำกัดการหยิบแล้ว (สูงสุด {takeawayLimit} ชิ้น)</p>
            )}
            {catalogLoading ? (
              <p className="text-sm py-8 text-center" style={{ color: "#71654c" }}>กำลังโหลดสินค้า…</p>
            ) : shown.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: "#71654c" }}>ไม่พบสินค้า</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                {shown.map((p) => {
                  const added = addedIds.has(p.id);
                  const disabled = added || (atLimit && !added);
                  return (
                    <button key={p.id} onClick={() => addProduct(p)} disabled={disabled}
                      className="flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ borderColor: added ? "#cfe6d8" : "#e6e5d8", background: added ? "#f0f7f2" : "#fff" }}>
                      <div className="w-11 h-11 rounded-lg flex-shrink-0 overflow-hidden" style={{ background: "#f5f2ee" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate" style={{ color: "#4c4847" }}>{p.name}</p>
                        <p className="text-xs truncate" style={{ color: "#6f5f48" }}>{[p.productCode, p.brand].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                      <span className="text-lg flex-shrink-0" style={{ color: added ? "#4a7c59" : "#726c5a" }}>{added ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Taken list */}
          <div className="lg:col-span-2 rounded-xl p-5 flex flex-col" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold" style={{ color: "#4c4847" }}>รายการที่เลือก</h2>
              <span className="text-xs" style={{ color: "#6f5f48" }}>{session.customerCode}</span>
            </div>
            <p className="text-xs mb-4" style={{ color: "#6f5f48" }}>
              {session.scans.length} รายการ · หยิบไป {totalTaken}{takeawayEnabled ? ` / ${takeawayLimit}` : ""} ชิ้น
            </p>

            <div className="flex-1 space-y-2 min-h-[200px] max-h-[52vh] overflow-y-auto">
              {session.scans.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: "#71654c" }}>ยังไม่มีสินค้า — เลือกจากด้านซ้าย</p>
              ) : (
                session.scans.map((s) => (
                  <div key={s.product.id} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: "#f5f2ee" }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate" style={{ color: "#4c4847" }}>{s.product.name}</p>
                      <p className="text-[11px] truncate" style={{ color: "#6f5f48" }}>{s.product.productCode || s.product.brand || "—"}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => changeQty(s, -1)} aria-label="ลดจำนวน" className="w-7 h-7 rounded-lg text-sm" style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#726c5a" }}>−</button>
                      <span className="w-5 text-center text-sm" style={{ color: "#4c4847" }}>{s.takeawayQty}</span>
                      <button onClick={() => changeQty(s, 1)} aria-label="เพิ่มจำนวน" disabled={atLimit} className="w-7 h-7 rounded-lg text-sm disabled:opacity-40" style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#726c5a" }}>+</button>
                      <button onClick={() => removeScan(s)} aria-label="ลบออก" className="w-7 h-7 rounded-lg text-sm" style={{ background: "#fff", border: "1px solid #e6d8d8", color: "#9f4a4a" }}>×</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 pt-4 mt-2" style={{ borderTop: "1px solid #f0eee6" }}>
              <button onClick={() => closeSession()}
                className="px-4 py-2.5 rounded-xl text-sm" style={{ background: "#f5f2ee", color: "#4c4847" }}>เปลี่ยนลูกค้า</button>
              <button onClick={() => closeSession("บันทึกรายการเรียบร้อย")}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: "#726c5a" }}>เสร็จสิ้น / บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
