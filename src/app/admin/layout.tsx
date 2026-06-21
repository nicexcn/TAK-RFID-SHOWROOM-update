"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Toaster, toast } from "sonner";
import { subscribeNotifications } from "@/lib/notifChannel";
import { isNotifyEnabled, setNotifyEnabled, enableNotifications, playBeep, showOsNotification } from "@/lib/notify";

interface UnreadNotif { product?: { name?: string }; customer?: { fullName?: string } | null }

const navItems = [
  { label: "Dashboard",           href: "/admin" },
  { label: "Product Management",  href: "/admin/products" },
  { label: "Customer Management", href: "/admin/customers" },
  { label: "Surface Scan",        href: "/admin/rfid" },
  { label: "Notifications",       href: "/admin/notifications" },
  { label: "Settings",            href: "/admin/settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [username, setUsername] = useState("...");
  const [notifCount, setNotifCount] = useState(0);
  const [notifOn, setNotifOn] = useState(false);     // sound/alert preference (button UI)
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.username) setUsername(d.username); });
    setNotifOn(isNotifyEnabled());
  }, []);

  useEffect(() => {
    const bodyOf = (nf?: { product?: { name?: string } | null; customer?: { fullName?: string } | null } | null) =>
      nf?.product?.name
        ? `${nf.product.name}${nf.customer?.fullName ? ` · ${nf.customer.fullName}` : ""}`
        : "New item to prepare";

    // The sonner TOAST always shows (a visual alert needs no audio gesture), so a station
    // sees the alert even before pressing "Enable sound". The beep + OS pop-up stay gated
    // behind isNotifyEnabled() (browser autoplay policy requires the gesture).
    function alertNew(body: string) {
      toast(body, { icon: "🔔", duration: 4500 }); // sonner: stacks if several arrive at once
      if (isNotifyEnabled()) {
        playBeep();
        showOsNotification("Prepare sample", body);
      }
    }

    // An alert is "actionable" (worth surfacing) when it's unread and not yet completed —
    // covers both a fresh create AND a re-surfaced dedup update (re-pressing เตรียม).
    const actionable = (nf?: { isRead?: boolean; status?: string } | null) =>
      !!nf && nf.isRead === false && nf.status !== "COMPLETE";

    // silent=true: just reconcile the count — used after we've already alerted from a
    // realtime payload. silent=false: the poll fallback, which alerts on an increase we
    // missed over realtime.
    function fetchCount(silent: boolean) {
      fetch("/api/notifications?unread=true").then((r) => r.json())
        .then((d: UnreadNotif[]) => {
          if (!Array.isArray(d)) return;
          const n = d.length;
          setNotifCount(n);
          if (!silent && prevCountRef.current !== null && n > prevCountRef.current) {
            alertNew(bodyOf(d[0]));
          }
          prevCountRef.current = n;
        }).catch(() => {});
    }

    // Realtime: alert INSTANTLY from the payload on a fresh OR re-surfaced (dedup-update)
    // actionable notification; every event then reconciles the count silently.
    function onBroadcast(payload: { type?: string; notification?: { isRead?: boolean; status?: string; product?: { name?: string } | null; customer?: { fullName?: string } | null } } | null) {
      const p = payload || {};
      if ((p.type === "create" || p.type === "update") && actionable(p.notification)) {
        alertNew(bodyOf(p.notification));
      }
      fetchCount(true);
    }

    fetchCount(false);
    const t = setInterval(() => fetchCount(false), 8000); // fallback safety net (was 30s)
    // Shared channel: reconcile on every (re)connect so a nudge dropped during the load
    // race or a websocket reconnect gap is caught immediately, not 8s later.
    const unsub = subscribeNotifications(
      (payload) => onBroadcast(payload as Parameters<typeof onBroadcast>[0]),
      () => fetchCount(true),
    );
    return () => { clearInterval(t); unsub(); };
  }, []);

  async function toggleNotify() {
    if (isNotifyEnabled()) {
      setNotifyEnabled(false); setNotifOn(false);
    } else {
      await enableNotifications(); // gesture: unlock audio + request OS permission
      setNotifOn(true);
      playBeep(); // confirm the sound works
    }
  }

  // Sidebar starts as a closed drawer on phones/tablets, open push-panel on desktop.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
  }, []);

  const isMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex" style={{ background: "#e6e5d8" }}>
      {/* In-app toasts for new notifications — stacks, auto-dismisses, a11y live region.
          Works on iOS PWA too. */}
      <Toaster
        position="top-right"
        expand                /* show stacked toasts expanded, not collapsed into a pile */
        visibleToasts={5}     /* preparing several different products shows several toasts */
        toastOptions={{
          className: "text-sm font-medium",
          style: { background: "#726c5a", color: "#fff", border: "none", borderRadius: "0.75rem" },
        }}
      />
      {/* Mobile drawer backdrop (tap to close); hidden on desktop where the sidebar is a push-panel */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} aria-hidden
          className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
      )}
      <aside
        className={`fixed lg:static top-0 left-0 z-50 flex flex-col py-6 transition-all duration-300 flex-shrink-0 w-56 ${
          sidebarOpen
            ? "translate-x-0 px-4 lg:w-56"
            : "-translate-x-full px-4 lg:translate-x-0 lg:w-0 lg:px-0 lg:overflow-hidden"
        }`}
        style={{ background: "#cdc3ad", minHeight: "100vh" }}>
        <div className="mb-2 px-2 flex-shrink-0">
          <Image src="/b-logo.png" alt="Nimitr Lab" width={160} height={55} className="object-contain" />
        </div>
        <div className="px-2 mb-8 mt-4 flex-shrink-0">
          <p className="text-sm font-semibold tracking-wider" style={{ color: "#4c4847" }}>NimitrLog</p>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                onClick={() => { if (isMobile()) setSidebarOpen(false); }} // close the drawer on mobile
                className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap flex items-center justify-between"
                style={{ background: isActive ? "rgba(255,255,255,0.5)" : "transparent", color: "#4c4847", fontWeight: isActive ? 600 : 400, borderLeft: isActive ? "3px solid #726c5a" : "3px solid transparent" }}>
                <span>{item.label}</span>
                {item.label === "Notifications" && notifCount > 0 && (
                  <span className="text-xs font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: "#dc2626", fontSize: "10px" }}>
                    {notifCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 space-y-1 flex-shrink-0">
          <p className="px-3 text-xs" style={{ color: "#726c5a" }}>{username}</p>
          <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-lg text-sm" style={{ color: "#4c4847" }}>Logout</button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center px-4 sm:px-6 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #cdc3ad", background: "#e6e5d8" }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded-lg">
            <span className="block w-5 h-0.5 rounded" style={{ background: "#726c5a" }} />
            <span className="block w-5 h-0.5 rounded" style={{ background: "#726c5a" }} />
            <span className="block w-5 h-0.5 rounded" style={{ background: "#726c5a" }} />
          </button>
          <button onClick={toggleNotify}
            title={notifOn ? "Notification sound is on" : "Sound is off — alerts still show as a toast, but no beep/pop-up until you enable sound"}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: notifOn ? "#e8f5e9" : "#fff3e0",
              color: notifOn ? "#2e7d32" : "#b26a00",
              border: `1px solid ${notifOn ? "#cdc3ad" : "#f0c98a"}`,
            }}>
            {!notifOn && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#e58a00" }} aria-hidden />}
            <span>{notifOn ? "🔔" : "🔕"}</span>
            <span className="hidden sm:inline">{notifOn ? "Sound on" : "Enable sound"}</span>
          </button>
        </div>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
