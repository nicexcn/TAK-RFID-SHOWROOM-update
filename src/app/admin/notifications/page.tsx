"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Spinner } from "@/components/Spinner";
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
  PENDING:   { label: "รอดำเนินการ", color: "#f59e0b", bg: "#fef3c7" },
  PREPARING: { label: "กำลังเตรียม", color: "#3b82f6", bg: "#dbeafe" },
  COMPLETE:  { label: "เสร็จสิ้น",   color: "var(--color-success)", bg: "#d1fae5" },
};

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  // No synchronous setLoading here — `loading` starts true and is cleared when the first
  // fetch resolves; refetches (poll/realtime) update silently.
  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifs(Array.isArray(data) ? data : []);
    } catch { /* keep current list */ }
    setLoading(false);
  }, []);

  // Apply a realtime broadcast straight to local state — no refetch round-trip.
  // Unknown/legacy shapes fall back to a full refetch.
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

  // Live: apply realtime nudges instantly (a prepare alert raised on a scan station, or
  // another prep staff acting), plus a slow fallback poll for consistency.
  useEffect(() => {
    fetchNotifs();
    const t = setInterval(fetchNotifs, 8000); // fallback safety net (was 20s)
    // Shared channel; re-sync on every (re)connect so a nudge dropped during load/reconnect
    // is caught now (no second channel on the same topic → no teardown race with the badge).
    const unsub = subscribeNotifications(
      (payload) => applyBroadcast(payload as { type?: string; notification?: Notif; id?: string }),
      () => fetchNotifs(),
    );
    return () => { clearInterval(t); unsub(); };
  }, [fetchNotifs, applyBroadcast]);

  async function updateStatus(id: string, status: string) {
    setNotifs((p) => p.map((n) => n.id === id ? { ...n, status, isRead: true } : n)); // optimistic
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, isRead: true }),
    });
  }

  async function markAllRead() {
    setNotifs((p) => p.map((n) => ({ ...n, isRead: true })));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" } });
  }

  async function deleteNotif(id: string) {
    setNotifs((p) => p.filter((n) => n.id !== id));
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
  }

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
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>ไม่มีการแจ้งเตือน</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const cfg = STATUS_CFG[n.status] || STATUS_CFG.PENDING;
            return (
              <div key={n.id} className="rounded-xl p-5 transition-all"
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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.product.imageUrl} alt={n.product.name} className="w-full h-full object-cover" />
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
                          <span>🕐 {new Date(n.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                        <button onClick={() => deleteNotif(n.id)} title="Delete"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors"
                          style={{ background: "#faf0f0", color: "var(--color-danger-soft)" }}>✕</button>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {n.status !== "COMPLETE" && (
                      <div className="flex gap-2 mt-3">
                        {n.status === "PENDING" && (
                          <button onClick={() => updateStatus(n.id, "PREPARING")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            style={{ background: "#dbeafe", color: "#3b82f6" }}>
                            เริ่มเตรียมสินค้า
                          </button>
                        )}
                        <button onClick={() => updateStatus(n.id, "COMPLETE")}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: "#d1fae5", color: "var(--color-success)" }}>
                          เสร็จสิ้น
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
