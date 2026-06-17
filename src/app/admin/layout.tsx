"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";

const navItems = [
  { label: "Dashboard",           href: "/admin" },
  { label: "Product Management",  href: "/admin/products" },
  { label: "Customer Management", href: "/admin/customers" },
  { label: "Surface Scan",        href: "/admin/rfid" },
  { label: "Notifications",       href: "/admin/notifications" },
  { label: "Setting",             href: "/admin/settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [username, setUsername] = useState("...");
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.username) setUsername(d.username); });
  }, []);

  useEffect(() => {
    function fetchCount() {
      fetch("/api/notifications?unread=true").then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setNotifCount(d.length); }).catch(() => {});
    }
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex" style={{ background: "#e6e5d8" }}>
      <aside className="flex flex-col py-6 px-4 transition-all duration-300 flex-shrink-0"
        style={{ width: sidebarOpen ? "14rem" : "0px", padding: sidebarOpen ? undefined : "0", overflow: "hidden", background: "#cdc3ad", minHeight: "100vh" }}>
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
              <button key={item.href} onClick={() => router.push(item.href)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap flex items-center justify-between"
                style={{ background: isActive ? "rgba(255,255,255,0.5)" : "transparent", color: "#4c4847", fontWeight: isActive ? 600 : 400, borderLeft: isActive ? "3px solid #726c5a" : "3px solid transparent" }}>
                <span>{item.label}</span>
                {item.label === "Notifications" && notifCount > 0 && (
                  <span className="text-xs font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: "#dc2626", fontSize: "10px" }}>
                    {notifCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mt-4 space-y-1 flex-shrink-0">
          <p className="px-3 text-xs" style={{ color: "#726c5a" }}>{username}</p>
          <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-lg text-sm" style={{ color: "#4c4847" }}>Logout</button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #cdc3ad", background: "#e6e5d8" }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded-lg">
            <span className="block w-5 h-0.5 rounded" style={{ background: "#726c5a" }} />
            <span className="block w-5 h-0.5 rounded" style={{ background: "#726c5a" }} />
            <span className="block w-5 h-0.5 rounded" style={{ background: "#726c5a" }} />
          </button>
        </div>
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
