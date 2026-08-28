"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Toaster, toast } from "sonner";
import { subscribeNotifications } from "@/lib/notifChannel";
import { isNotifyEnabled, setNotifyEnabled, enableNotifications, playBeep, showOsNotification } from "@/lib/notify";
import { canAccessPath } from "@/lib/roles";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { getDeviceId } from "@/lib/deviceId";

interface UnreadNotif { product?: { name?: string }; customer?: { fullName?: string } | null }

// Grouped nav: the daily floor work (Operate) sits at the top since staff live there,
// then reporting (Analyze), then admin (Manage). Items are still role-filtered per-link.
const navGroups = [
  { section: "Operate", items: [
    { label: "Surface Scan",        href: "/admin/rfid" },
    { label: "Customer Management", href: "/admin/customers" },
    { label: "Notifications",       href: "/admin/notifications" },
  ] },
  { section: "Analyze", items: [
    { label: "Dashboard",           href: "/admin" },
    { label: "Reports",             href: "/admin/reports" },
    { label: "Survey Results",      href: "/admin/survey" },
  ] },
  { section: "Manage", items: [
    { label: "Product Management",  href: "/admin/products" },
    { label: "Settings",            href: "/admin/settings" },
  ] },
];

// initialRole / initialUsername are resolved server-side (from the JWT cookie) and passed
// down so the role-filtered nav + username render correctly on the FIRST paint — no
// empty-nav flash while a client /api/auth/me round-trip resolves.
export default function AdminShell({
  children,
  initialRole,
  initialUsername,
}: {
  children: React.ReactNode;
  initialRole: string;
  initialUsername: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // Kiosk mode (TAK feedback 6/8/26 slide 2): the Add Customer form is often filled in
  // on a tablet handed to the customer — hide the sidebar/top bar there so visitors
  // can't see or tap into other pages.
  const kioskMode = pathname.startsWith("/admin/customers/add");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [username, setUsername] = useState(initialUsername || "...");
  const [role, setRole] = useState(initialRole); // #3: hide Survey Results from the basic/Sales role
  const [notifCount, setNotifCount] = useState(0);
  const [notifOn, setNotifOn] = useState(false);     // sound/alert preference (button UI)
  const [hasSession, setHasSession] = useState(false); // live Surface-Scan session on this station → nav dot
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    // Server already seeded role/username from the cookie; this refresh keeps them
    // current if the token changed (re-login) without a full reload. It's a no-op
    // re-set on the common path, so the nav never flashes empty.
    fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.username) setUsername(d.username); if (d.role) setRole(d.role); });
    setNotifOn(isNotifyEnabled());
  }, []);

  // Surface-Scan "active session" cue: poll this device's session so staff who navigate
  // away from the scan page see a dot on the nav item and can return to the live customer.
  useEffect(() => {
    const check = () => {
      fetch(`/api/sessions?deviceId=${encodeURIComponent(getDeviceId())}`)
        .then((r) => r.json()).then((d) => setHasSession(!!d?.id)).catch(() => {});
    };
    check();
    const t = setInterval(check, 12000);
    return () => clearInterval(t);
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
    <ConfirmProvider>
    <a href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium"
      style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>
      Skip to content
    </a>
    <div className="min-h-screen flex" style={{ background: "var(--color-border)" }}>
      {/* In-app toasts for new notifications — stacks, auto-dismisses, a11y live region.
          Works on iOS PWA too. */}
      <Toaster
        position="top-right"
        expand                /* show stacked toasts expanded, not collapsed into a pile */
        visibleToasts={5}     /* preparing several different products shows several toasts */
        toastOptions={{
          className: "text-sm font-medium",
          style: { background: "var(--color-primary)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" },
        }}
      />
      {/* Mobile drawer backdrop (tap to close); hidden on desktop where the sidebar is a push-panel */}
      {!kioskMode && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} aria-hidden
          className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
      )}
      {!kioskMode && <aside
        className={`fixed lg:static top-0 left-0 z-50 flex flex-col py-6 transition-all duration-300 flex-shrink-0 w-56 ${
          sidebarOpen
            ? "translate-x-0 px-4 lg:w-56"
            : "-translate-x-full px-4 lg:translate-x-0 lg:w-0 lg:px-0 lg:overflow-hidden"
        }`}
        style={{ background: "var(--color-sidebar)", minHeight: "100vh" }}>
        <div className="mb-2 px-2 flex-shrink-0 flex items-center justify-between">
          <Image src="/b-logo.png" alt="Nimitr Lab" width={160} height={38} className="object-contain" priority />
          {/* Explicit close on mobile: the open drawer covers the top-bar hamburger, so
              staff need a visible way to close it besides tapping the dimmed backdrop. */}
          <button onClick={() => setSidebarOpen(false)} aria-label="Close menu"
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
            style={{ color: "var(--color-text)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-2 mb-8 mt-4 flex-shrink-0">
          <p className="text-sm font-semibold tracking-wider" style={{ color: "var(--color-text)" }}>NimitrLog</p>
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-4 overflow-y-auto">
          {navGroups.map((group) => {
            const items = group.items.filter((item) => role !== "" && canAccessPath(role, item.href));
            if (items.length === 0) return null; // hide a whole section a role can't access
            return (
              <div key={group.section} className="space-y-1">
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>{group.section}</p>
                {items.map((item) => {
                  const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href}
                      onClick={() => { if (isMobile()) setSidebarOpen(false); }} // close the drawer on mobile
                      className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap flex items-center justify-between"
                      style={{ background: isActive ? "rgba(255,255,255,0.5)" : "transparent", color: "var(--color-text)", fontWeight: isActive ? 600 : 400, borderLeft: isActive ? "3px solid var(--color-primary)" : "3px solid transparent" }}>
                      <span>{item.label}</span>
                      {item.label === "Notifications" && notifCount > 0 && (
                        <span className="text-xs font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: "var(--color-danger)", fontSize: "10px" }}>
                          {notifCount}
                        </span>
                      )}
                      {item.label === "Surface Scan" && hasSession && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0" title="Active session on this station"
                          style={{ background: "var(--color-success)" }} aria-label="Active session" />
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="mt-4 space-y-1 flex-shrink-0">
          <p className="px-3 text-xs" style={{ color: "var(--color-text)" }}>{username}</p>
          <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-lg text-sm" style={{ color: "var(--color-text)" }}>Logout</button>
        </div>
      </aside>}
      <div className="flex-1 flex flex-col min-w-0">
        {!kioskMode && (
        <div className="flex items-center px-4 sm:px-6 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--color-sidebar)", background: "var(--color-border)" }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu" className="w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded-lg">
            <span className="block w-5 h-0.5 rounded" style={{ background: "var(--color-primary)" }} />
            <span className="block w-5 h-0.5 rounded" style={{ background: "var(--color-primary)" }} />
            <span className="block w-5 h-0.5 rounded" style={{ background: "var(--color-primary)" }} />
          </button>
          <button onClick={toggleNotify}
            title={notifOn ? "Notification sound is on" : "Sound is off — alerts still show as a toast, but no beep/pop-up until you enable sound"}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: notifOn ? "#e8f5e9" : "#fff3e0",
              color: notifOn ? "#2e7d32" : "#b26a00",
              border: `1px solid ${notifOn ? "var(--color-sidebar)" : "#f0c98a"}`,
            }}>
            {!notifOn && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#e58a00" }} aria-hidden />}
            <span>{notifOn ? "🔔" : "🔕"}</span>
            <span className="hidden sm:inline">{notifOn ? "Sound on" : "Enable sound"}</span>
          </button>
        </div>
        )}
        <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
    </ConfirmProvider>
  );
}
