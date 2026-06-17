"use client";

import { useState, useEffect } from "react";

interface Notif {
  id: string; title: string; message: string; status: string; isRead: boolean; createdAt: string;
  product: { id: string; name: string; productCode: string | null; location: string | null };
  customer: { customerCode: string; fullName: string } | null;
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:   { label: "รอดำเนินการ", color: "#f59e0b", bg: "#fef3c7" },
  PREPARING: { label: "กำลังเตรียม", color: "#3b82f6", bg: "#dbeafe" },
  COMPLETE:  { label: "เสร็จสิ้น",   color: "#10b981", bg: "#d1fae5" },
};

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => { fetchNotifs(); }, []);

  async function fetchNotifs() {
    setLoading(true);
    const res = await fetch("/api/notifications");
    const data = await res.json();
    setNotifs(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, isRead: true }),
    });
    setNotifs((p) => p.map((n) => n.id === id ? { ...n, status, isRead: true } : n));
  }

  async function markAllRead() {
    await Promise.all(
      notifs.filter((n) => !n.isRead).map((n) =>
        fetch(`/api/notifications/${n.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isRead: true }),
        })
      )
    );
    setNotifs((p) => p.map((n) => ({ ...n, isRead: true })));
  }

  const filtered = notifs.filter((n) => filter === "all" || n.status === filter);
  const unread = notifs.filter((n) => !n.isRead).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Notifications</h1>
            {unread > 0 && (
              <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ background: "#dc2626" }}>
                {unread}
              </span>
            )}
          </div>
          <p className="text-xs mt-1" style={{ color: "#9f886c" }}>Home / Notifications</p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead}
            className="px-4 py-2 rounded-xl text-sm"
            style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }}>
            Mark all as read
          </button>
        )}
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
              background: filter === tab.key ? "#726c5a" : "#fff",
              color: filter === tab.key ? "#fff" : "#726c5a",
              border: "1px solid " + (filter === tab.key ? "#726c5a" : "#e6e5d8"),
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 animate-spin"
            style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 rounded-xl" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
          <p className="text-sm" style={{ color: "#cdc3ad" }}>ไม่มีการแจ้งเตือน</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const cfg = STATUS_CFG[n.status] || STATUS_CFG.PENDING;
            return (
              <div key={n.id} className="rounded-xl p-5 transition-all"
                style={{
                  background: "#fff",
                  border: `1px solid ${n.isRead ? "#e6e5d8" : "#9f886c"}`,
                  opacity: n.isRead ? 0.85 : 1,
                }}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "#f5f2ee" }}>
                    <svg width="18" height="18" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24">
                      <rect x="1" y="3" width="15" height="13" rx="2"/>
                      <path d="m16 8 5 3-5 3V8z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-sm" style={{ color: "#4c4847" }}>{n.title}</p>
                          {!n.isRead && <div className="w-2 h-2 rounded-full" style={{ background: "#dc2626" }} />}
                        </div>
                        <p className="text-sm font-medium mb-1" style={{ color: "#4c4847" }}>
                          {n.product.name}
                          {n.product.productCode && <span style={{ color: "#9f886c" }}> · {n.product.productCode}</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "#9f886c" }}>
                          {n.product.location && <span>📍 {n.product.location}</span>}
                          {n.customer && <span>👤 {n.customer.fullName} ({n.customer.customerCode})</span>}
                          <span>🕐 {new Date(n.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0"
                        style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                      </span>
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
                          style={{ background: "#d1fae5", color: "#10b981" }}>
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
