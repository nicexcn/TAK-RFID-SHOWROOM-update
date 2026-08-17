"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { SkeletonCard } from "@/components/Skeleton";
import { subscribeNotifications } from "@/lib/notifChannel";

interface Notif {
  id: string; title: string; message: string; status: string; isRead: boolean; createdAt: string;
  takeawayQty?: number | null;
  product: {
    id: string; name: string; productCode: string | null; location: string | null;
    imageUrl: string | null; brand: string | null; colour: string | null; size: string | null;
  };
  customer: { id: string; customerCode: string; fullName: string; company: string; phone: string } | null;
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:   { label: "Pending",   color: "#f59e0b", bg: "#fef3c7" },
  PREPARING: { label: "Preparing", color: "var(--color-info)", bg: "#dbeafe" },
  COMPLETE:  { label: "Complete",  color: "var(--color-success)", bg: "#d1fae5" },
};

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok — match api/reports convention
function bkkDay(iso: string) {
  // Bangkok calendar YYYY-MM-DD of a UTC instant (notification.createdAt).
  return new Date(new Date(iso).getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

// URL-safe base64 (uses -_ instead of +/, no padding) for passing the items JSON to
// /print/erp-doc. Raw JSON in the query string trips the on-prem ModSecurity WAF (the
// {" ":""} syntax looks like injection); base64 is opaque to it. Decoded in the print page.
function urlSafeB64(s: string) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromUrlSafeB64(s: string) {
  try {
    const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
    return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)));
  } catch { return ""; }
}

interface DocGroup {
  key: string;
  date: string;       // Bangkok YYYY-MM-DD
  customerCode: string;
  company: string;
  contact: string;
  phone: string;
  items: Notif[];
  docNo: string;
}

// Group take-home notifications into one Document per (customer + day).
// customerCode is the primary key so walk-ins (empty company) never merge
// different customers into one document. (Notification customers carry no
// project field, so project is not part of the key — a customer is one job
// per day, matching the ERP mockup where a doc = one customer's day.)
function groupNotifs(notifs: Notif[]): DocGroup[] {
  const map = new Map<string, Notif[]>();
  for (const n of notifs) {
    if (!(n.takeawayQty && n.takeawayQty > 0)) continue; // ERP doc = taken-home lines only
    const date = bkkDay(n.createdAt);
    const code = n.customer?.customerCode || n.customer?.fullName || "WALK-IN";
    const key = `${code}|${date}`;
    const arr = map.get(key) || [];
    arr.push(n);
    map.set(key, arr);
  }
  const groups: DocGroup[] = [...map.entries()].map(([key, items]) => {
    const first = items[0];
    const code = first.customer?.customerCode || first.customer?.fullName || "WALK-IN";
    return {
      key,
      date: bkkDay(first.createdAt),
      customerCode: first.customer?.customerCode || "",
      company: first.customer?.company || "",
      contact: first.customer?.fullName || code,
      phone: first.customer?.phone || "",
      items,
      docNo: "", // assigned below, after month-bucket sort
    };
  });
  // Sort by date desc, then customerCode — newest jobs first (display order).
  groups.sort((a, b) => b.date.localeCompare(a.date) || a.customerCode.localeCompare(b.customerCode));

  // Assign Document No. (NO + YY + MM + 4-digit seq), seq resets per (YY, MM).
  // seq is the 1-based index of the group among same-month groups, in ascending
  // (date, customerCode) order — deterministic: same data ⇒ same numbers, no DB write.
  const byMonth = new Map<string, DocGroup[]>();
  for (const g of groups) {
    const [y, m] = g.date.split("-");
    const mk = `${y}${m}`;
    const arr = byMonth.get(mk) || [];
    arr.push(g);
    byMonth.set(mk, arr);
  }
  for (const arr of byMonth.values()) {
    // ascending order for numbering: earliest job of the month = 0001
    arr.sort((a, b) => a.date.localeCompare(b.date) || a.customerCode.localeCompare(b.customerCode));
    const [y, m] = arr[0].date.split("-");
    arr.forEach((g, i) => { g.docNo = `NO${y.slice(2)}${m}${String(i + 1).padStart(4, "0")}`; });
  }
  return groups;
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifs(Array.isArray(data) ? data : []);
    } catch { /* keep current list */ }
    setLoading(false);
  }, []);

  // Apply a realtime broadcast straight to local state — no refetch round-trip.
  const applyBroadcast = useCallback((payload: { type?: string; notification?: Notif; id?: string } | null) => {
    const p = payload || {};
    if (p.type === "create" && p.notification) {
      const n0 = p.notification;
      setNotifs((prev) => [n0, ...prev.filter((n) => n.id !== n0.id)]);
    } else if (p.type === "update" && p.notification) {
      const n0 = p.notification;
      setNotifs((prev) => (prev.some((n) => n.id === n0.id) ? prev.map((n) => (n.id === n0.id ? n0 : n)) : [n0, ...prev]));
    } else if (p.type === "delete" && p.id) {
      const did = p.id;
      setNotifs((prev) => prev.filter((n) => n.id !== did));
    } else if (p.type === "readAll") {
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } else {
      fetchNotifs();
    }
  }, [fetchNotifs]);

  useEffect(() => {
    fetchNotifs();
    const t = setInterval(fetchNotifs, 8000);
    const unsub = subscribeNotifications(
      (payload) => applyBroadcast(payload as { type?: string; notification?: Notif; id?: string }),
      () => fetchNotifs(),
    );
    return () => { clearInterval(t); unsub(); };
  }, [fetchNotifs, applyBroadcast]);

  const updateStatus = useCallback((id: string, status: string) => {
    setNotifs((p) => p.map((n) => n.id === id ? { ...n, status, isRead: true } : n)); // optimistic
    fetch(`/api/notifications/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, isRead: true }),
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifs((p) => p.map((n) => ({ ...n, isRead: true })));
    fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" } });
  }, []);

  const deleteNotif = useCallback((id: string) => {
    setNotifs((p) => p.filter((n) => n.id !== id));
    fetch(`/api/notifications/${id}`, { method: "DELETE" });
  }, []);

  const filtered = notifs.filter((n) => filter === "all" || n.status === filter);
  const unread = notifs.filter((n) => !n.isRead).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>Notifications</h1>
            {unread > 0 && (
              <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ background: "var(--color-danger)" }}>
                {unread}
              </span>
            )}
          </div>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Notifications" }]} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/admin/loans"
            className="px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: "var(--color-primary)" }}>
            ↩ Borrow / Return
          </Link>
          {unread > 0 && (
            <button onClick={markAllRead}
              className="px-4 py-2 rounded-xl text-sm"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { key: "all", label: `All (${notifs.length})` },
          { key: "PENDING",   label: `Pending (${notifs.filter((n) => n.status === "PENDING").length})` },
          { key: "PREPARING", label: `Preparing (${notifs.filter((n) => n.status === "PREPARING").length})` },
          { key: "COMPLETE",  label: `Complete (${notifs.filter((n) => n.status === "COMPLETE").length})` },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: filter === tab.key ? "var(--color-primary)" : "var(--color-surface)",
              color: filter === tab.key ? "var(--color-surface)" : "var(--color-primary)",
              border: "1px solid " + (filter === tab.key ? "var(--color-primary)" : "var(--color-border)"),
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} lines={2} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>No notifications</p>
        </div>
      ) : (
        <DocGroups filtered={filtered} onUpdate={updateStatus} onDelete={deleteNotif} />
      )}
    </div>
  );
}

// Render taken-home notifications grouped into ERP documents (one Document No. per
// customer + day). Each group has a header (doc no / date / customer / totals +
// 🖨 Print requisition slip) with the per-item prep cards indented underneath.
// Notifications with no takeaway stay ungrouped at the bottom so the prep queue
// is still fully visible.
function DocGroups({
  filtered, onUpdate, onDelete,
}: { filtered: Notif[]; onUpdate: (id: string, status: string) => void; onDelete: (id: string) => void }) {
  const groups = groupNotifs(filtered);
  const groupedIds = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));
  const ungrouped = filtered.filter((n) => !groupedIds.has(n.id));

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const totalQty = g.items.reduce((s, n) => s + (n.takeawayQty || 0), 0);
        const dateDisplay = new Date(g.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
        // Items payload excludes imageUrl — it's ~130 chars/item and pushes the URL past
        // IIS's query-string limit (a 7-item doc was already 2051 chars > 2048). The slip
        // design (3.jfif) shows only Item No./Description/Quantity anyway. base64 keeps the
        // JSON off the on-prem WAF (raw JSON in a query param 403s).
        const itemsParam = urlSafeB64(JSON.stringify(g.items.map((n) => ({
          code: n.product.productCode || "", name: n.product.name, qty: n.takeawayQty || 0,
          brand: n.product.brand || "",
        }))));
        const printHref = `/print/erp-doc?${new URLSearchParams({
          doc: g.docNo, date: g.date, company: g.company, contact: g.contact,
          phone: g.phone, customerCode: g.customerCode, items: itemsParam,
        }).toString()}`;
        return (
          <div key={g.key}>
            {/* Document header */}
            <div className="rounded-xl p-4 mb-2 flex flex-wrap items-center gap-3"
              style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
              <span className="font-mono text-sm font-bold px-2 py-1 rounded-md" style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>{g.docNo}</span>
              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>📅 {dateDisplay}</span>
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {g.company || g.contact || g.customerCode || "Walk-in"}
              </span>
              {g.contact && g.company && (
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>👤 {g.contact}{g.phone ? ` · 📞 ${g.phone}` : ""}</span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
                {g.items.length} item{g.items.length !== 1 ? "s" : ""} · {totalQty} pcs
              </span>
              <a href={printHref} target="_blank" rel="noopener noreferrer" title="Print requisition slip (ใบเบิกรายการ)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-auto"
                style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>
                🖨 Print slip
              </a>
            </div>
            {/* Per-item prep cards */}
            <div className="space-y-3 pl-4" style={{ borderLeft: "2px solid var(--color-border)" }}>
              {g.items.map((n) => <NotifCard key={n.id} n={n} onUpdate={onUpdate} onDelete={onDelete} />)}
            </div>
          </div>
        );
      })}

      {ungrouped.length > 0 && (
        <div>
          {groups.length > 0 && (
            <p className="text-xs mb-2" style={{ color: "var(--color-text-subtle)" }}>Other notifications (no takeaway)</p>
          )}
          <div className="space-y-3">
            {ungrouped.map((n) => <NotifCard key={n.id} n={n} onUpdate={onUpdate} onDelete={onDelete} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifCard({
  n, onUpdate, onDelete,
}: { n: Notif; onUpdate: (id: string, status: string) => void; onDelete: (id: string) => void }) {
  const cfg = STATUS_CFG[n.status] || STATUS_CFG.PENDING;
  return (
    <div className="rounded-xl p-5 transition-all"
      style={{
        background: "var(--color-surface)",
        border: `1px solid ${n.isRead ? "var(--color-border)" : "#9f886c"}`,
        opacity: n.isRead ? 0.85 : 1,
      }}>
      <div className="flex items-start gap-4">
        {/* Product thumbnail — lets prep staff identify the right sample at a glance */}
        <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--color-bg)" }}>
          {n.product.imageUrl ? (
            <Image src={n.product.imageUrl} alt={n.product.name} width={48} height={48} className="w-full h-full object-cover" />
          ) : (
            <svg width="18" height="18" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="m21 15-5-5L5 21"/>
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{n.title}</p>
                {!!n.takeawayQty && n.takeawayQty > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold"
                    style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>×{n.takeawayQty}</span>
                )}
                {!n.isRead && <div className="w-2 h-2 rounded-full" style={{ background: "var(--color-danger)" }} />}
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
                {n.product.name}
                {n.product.productCode && <span style={{ color: "var(--color-text-muted)" }}> · {n.product.productCode}</span>}
              </p>
              {(n.product.brand || n.product.colour || n.product.size) && (
                <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>
                  {[n.product.brand, n.product.colour, n.product.size].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                {n.product.location && <span>📍 {n.product.location}</span>}
                {n.customer && (
                  <a href={`/admin/customers/${n.customer.id}`} target="_blank" rel="noopener noreferrer"
                    className="hover:underline" title="Open customer details (new tab)" style={{ color: "var(--color-text-muted)" }}>
                    👤 {n.customer.fullName} ({n.customer.customerCode})
                    {n.customer.company ? ` · ${n.customer.company}` : ""}
                    {n.customer.phone ? ` · 📞 ${n.customer.phone}` : ""}
                  </a>
                )}
                <span>🕐 {new Date(n.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ background: cfg.bg, color: cfg.color }}>
                {cfg.label}
              </span>
              <button onClick={() => onDelete(n.id)} title="Delete"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors"
                style={{ background: "#faf0f0", color: "var(--color-danger-soft)" }}>✕</button>
            </div>
          </div>

          {/* Action Buttons — Start/Done gate on status; Print Sticker shows for any
              status whenever a customer is attached (prep staff prints the envelope
              label from here, and can reprint after COMPLETE). */}
          {(n.status !== "COMPLETE" || n.customer) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {n.status === "PENDING" && (
                <button onClick={() => onUpdate(n.id, "PREPARING")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: "#dbeafe", color: "var(--color-info)" }}>
                  Start preparing
                </button>
              )}
              {n.status !== "COMPLETE" && (
                <button onClick={() => onUpdate(n.id, "COMPLETE")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: "#d1fae5", color: "var(--color-success)" }}>
                  Mark done
                </button>
              )}
              {n.customer && (
                <a href={`/print/sticker?${new URLSearchParams({ company: n.customer.company || "", contact: n.customer.fullName || "", phone: n.customer.phone || "", requester: n.customer.fullName || "", code: n.customer.customerCode || "" }).toString()}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                  🖨 Print Sticker
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
