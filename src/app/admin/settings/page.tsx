"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useState, useEffect } from "react";
import type { SavedReader } from "@/lib/readers";
import { uploadFile } from "@/lib/uploadImage";
import { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES, ALLOWED_VIDEO_MIME } from "@/lib/storage";

const newReaderId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10);

interface DropdownOption { id: string; type: string; value: string; }
interface MediaFile {
  id: string; productId: string; url: string; order: number;
  product?: { name: string; productCode?: string };
}
interface UserItem {
  id: string; username: string; firstName: string; lastName: string;
  role: string; createdAt: string;
}

const DROPDOWN_TYPES = [
  { key: "brand", label: "Brand" },
  { key: "materialType", label: "Material Type" },
  { key: "category", label: "Category" },
];

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "account",   label: "Account" },
  { key: "product",   label: "Product Management" },
  { key: "media",     label: "Media" },
  { key: "takeaway",  label: "Takeaway Limit" },
];

const GRAPH_COLORS = [
  { label: "Warm Brown",    primary: "#726c5a", secondary: "#cdc3ad" },
  { label: "Slate Blue",    primary: "#4a6fa5", secondary: "#a8c0dd" },
  { label: "Forest Green",  primary: "#4a7c59", secondary: "#a8cbb5" },
  { label: "Dusty Rose",    primary: "#9f6b6b", secondary: "#d4a8a8" },
  { label: "Charcoal",      primary: "#4c4847", secondary: "#9f886c" },
];

const WIDGETS = [
  { key: "walkins",         label: "Walk-ins" },
  { key: "customerTypes",   label: "Type of Customers" },
  { key: "newVsTotal",      label: "New vs Total Customers" },
  { key: "comparisonGraph", label: "Walk-ins by Month" },
  { key: "categoryGraph",   label: "Interest by Category Graph" },
];

const cardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #e6e5d8",
  borderRadius: "0.75rem", padding: "1.5rem", marginBottom: "1rem",
};

// ── small reusable input style ─────────────────────────────────────────────
const iS = { background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" };

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  // Dashboard
  const [dashboardSettings, setDashboardSettings] = useState({
    defaultFilter: "daily" as "daily" | "weekly" | "monthly" | "annually",
    graphColor: 0,
    visibleWidgets: {
      walkins: true, customerTypes: true, newVsTotal: true,
      comparisonGraph: true, categoryGraph: true,
    },
  });
  const [dashboardSuccess, setDashboardSuccess] = useState("");

  // Dropdown
  const [options, setOptions] = useState<DropdownOption[]>([]);
  const [activeType, setActiveType] = useState("brand");
  const [newValue, setNewValue] = useState("");
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [dropdownMessage, setDropdownMessage] = useState("");

  // ── Account / User Management ──────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState({ id: "", username: "", role: "" });
  const [users, setUsers] = useState<UserItem[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: "", password: "", firstName: "", lastName: "", role: "user" });
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Edit user
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState({ username: "", password: "", firstName: "", lastName: "", role: "user" });
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Media
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaSuccess, setMediaSuccess] = useState("");
  const [slideDuration, setSlideDuration] = useState(5);
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const [relayUrl, setRelayUrl] = useState(""); // Option E cloud relay base
  const [readers, setReaders] = useState<SavedReader[]>([]); // central reader registry
  const [idleVideoUrl, setIdleVideoUrl] = useState(""); // /display idle-loop video
  const [idleVideoFit, setIdleVideoFit] = useState("contain"); // "contain" (Fit) | "cover" (Fill)
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoErr, setVideoErr] = useState("");
  const [displayRotation, setDisplayRotation] = useState(0); // /display screen rotation (deg)
  const [displaySettingsSuccess, setDisplaySettingsSuccess] = useState("");

  // Takeaway
  const [takeawayLimit, setTakeawayLimit] = useState(3);
  const [takeawayEnabled, setTakeawayEnabled] = useState(true);
  const [borrowDays, setBorrowDays] = useState(14); // default borrow/return period (days)
  const [takeawaySuccess, setTakeawaySuccess] = useState("");

  // ── Effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.username) setCurrentUser({ id: d.id, username: d.username, role: d.role || "" });
    });
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.takeawayLimit !== undefined) setTakeawayLimit(d.takeawayLimit);
      if (d.takeawayEnabled !== undefined) setTakeawayEnabled(d.takeawayEnabled);
      if (d.borrowDays !== undefined) setBorrowDays(d.borrowDays);
      if (d.slideDuration !== undefined) setSlideDuration(d.slideDuration);
      if (d.sessionTimeout !== undefined) setSessionTimeout(d.sessionTimeout);
      if (d.relayUrl !== undefined) setRelayUrl(d.relayUrl);
      if (d.idleVideoUrl !== undefined) setIdleVideoUrl(d.idleVideoUrl);
      if (d.idleVideoFit !== undefined) setIdleVideoFit(d.idleVideoFit);
      if (d.displayRotation !== undefined) setDisplayRotation(d.displayRotation);
      if (Array.isArray(d.readers)) setReaders(d.readers);
      if (d.id) {
        setDashboardSettings({
          defaultFilter: d.defaultFilter,
          graphColor: d.graphColor,
          visibleWidgets: d.visibleWidgets,
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchOptions(); }, [activeType]);

  useEffect(() => {
    if (activeTab === "media") fetchMediaFiles();
    if (activeTab === "account") fetchUsers();
  }, [activeTab]);

  // ── Functions ──────────────────────────────────────────────────────────
  async function fetchUsers() {
    setUsersLoading(true);
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setUsersLoading(false);
  }

  async function handleCreateUser() {
    setCreateError(""); setCreateSuccess("");
    if (!createForm.username || !createForm.password) {
      setCreateError("Username และ Password จำเป็นต้องกรอก"); return;
    }
    setCreateLoading(true);
    const res = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    const data = await res.json();
    if (res.ok) {
      setCreateSuccess("✓ สร้าง user สำเร็จ");
      setCreateForm({ username: "", password: "", firstName: "", lastName: "", role: "user" });
      setShowCreate(false);
      await fetchUsers();
      setTimeout(() => setCreateSuccess(""), 3000);
    } else {
      setCreateError(data.error || "เกิดข้อผิดพลาด");
    }
    setCreateLoading(false);
  }

  function openEdit(u: UserItem) {
    setEditingUser(u);
    setEditForm({ username: u.username, password: "", firstName: u.firstName, lastName: u.lastName, role: u.role });
    setEditError(""); setEditSuccess("");
  }

  async function handleSaveEdit() {
    if (!editingUser) return;
    setEditError(""); setEditSuccess(""); setEditLoading(true);
    const body: Record<string, string> = {
      username: editForm.username,
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      role: editForm.role,
    };
    if (editForm.password) body.password = editForm.password;
    const res = await fetch(`/api/users/${editingUser.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setEditSuccess("✓ บันทึกสำเร็จ");
      setUsers((p) => p.map((u) => u.id === data.id ? data : u));
      setTimeout(() => { setEditingUser(null); setEditSuccess(""); }, 1200);
    } else {
      setEditError(data.error || "เกิดข้อผิดพลาด");
    }
    setEditLoading(false);
  }

  async function handleDeleteUser(u: UserItem) {
    if (u.id === currentUser.id) { alert("ไม่สามารถลบ account ของตัวเองได้"); return; }
    if (!confirm(`ลบ user "${u.username}" ?`)) return;
    await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    setUsers((p) => p.filter((x) => x.id !== u.id));
  }

  async function fetchMediaFiles() {
    setMediaLoading(true);
    try {
      const res = await fetch("/api/products/images/all");
      if (res.ok) setMediaFiles(await res.json());
    } catch {}
    setMediaLoading(false);
  }

  async function handleDeleteMedia(id: string) {
    if (!confirm("Delete this image?")) return;
    await fetch(`/api/products/images/${id}`, { method: "DELETE" });
    setMediaFiles((p) => p.filter((f) => f.id !== id));
    setMediaSuccess("✓ Image deleted"); setTimeout(() => setMediaSuccess(""), 2000);
  }

  // Persist a partial AppSettings patch (the Display Settings Save button used to
  // only show a fake success toast without calling the API).
  async function saveSettings(patch: Record<string, unknown>, onDone: () => void) {
    try {
      await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      onDone();
    } catch { /* keep prior state */ }
  }

  // Reader registry editor
  const addReader = () => setReaders((rs) => [...rs, { id: newReaderId(), name: "", device: "", url: "" }]);
  const updateReader = (id: string, patch: Partial<SavedReader>) =>
    setReaders((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeReader = (id: string) => setReaders((rs) => rs.filter((r) => r.id !== id));

  // Idle video upload → fills idleVideoUrl (browser-direct to storage; signed URL).
  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setVideoErr("");
    // Fast client-side guard so violations don't cost an upload round-trip (server enforces too).
    if (!ALLOWED_VIDEO_MIME.includes(file.type)) { setVideoErr("Use an MP4 or WEBM video."); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setVideoErr(`File too large — max ${MAX_UPLOAD_MB} MB.`); return; }
    setVideoUploading(true);
    try {
      setIdleVideoUrl(await uploadFile(file));
    } catch (err) {
      setVideoErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setVideoUploading(false);
    }
  }

  async function fetchOptions() {
    const res = await fetch(`/api/dropdown?type=${activeType}`);
    setOptions(await res.json());
  }

  async function handleAddOption() {
    if (!newValue.trim()) return;
    setDropdownLoading(true);
    await fetch("/api/dropdown", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: activeType, value: newValue.trim() }),
    });
    setNewValue(""); await fetchOptions();
    setDropdownMessage("Added successfully"); setTimeout(() => setDropdownMessage(""), 2000);
    setDropdownLoading(false);
  }

  async function handleDeleteOption(id: string) {
    if (!confirm("Delete this option?")) return;
    await fetch("/api/dropdown", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchOptions();
  }

  const selectedColor = GRAPH_COLORS[dashboardSettings.graphColor];
  const filteredMedia = mediaFiles.filter((f) =>
    !mediaSearch || f.product?.name?.toLowerCase().includes(mediaSearch.toLowerCase()) ||
    f.product?.productCode?.toLowerCase().includes(mediaSearch.toLowerCase())
  );
  const filteredUsers = users.filter((u) =>
    !userSearch || u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.firstName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.lastName.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Settings</h1>
        <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Settings" }]} />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Sidebar */}
        <div className="w-full lg:w-52 shrink-0">
          <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
            {TABS.filter((tab) => tab.key !== "account" || currentUser.role === "super_admin").map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className="w-full text-left px-4 py-3 text-sm transition-all"
                style={{
                  background: activeTab === tab.key ? "#f5f2ee" : "transparent",
                  color: activeTab === tab.key ? "#726c5a" : "#4c4847",
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  borderLeft: activeTab === tab.key ? "3px solid #726c5a" : "3px solid transparent",
                  borderBottom: "1px solid #f5f2ee",
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* ── Dashboard ── */}
          {activeTab === "dashboard" && (
            <div>
              <div style={cardStyle}>
                <h2 className="text-base font-semibold mb-1" style={{ color: "#4c4847" }}>Widget Visibility</h2>
                <p className="text-xs mb-4" style={{ color: "#9f886c" }}>เลือก widget ที่จะแสดงบน Dashboard</p>
                <div className="space-y-2">
                  {WIDGETS.map((w) => {
                    const isOn = dashboardSettings.visibleWidgets[w.key as keyof typeof dashboardSettings.visibleWidgets];
                    return (
                      <div key={w.key} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "#f5f2ee" }}>
                        <span className="text-sm" style={{ color: "#4c4847" }}>{w.label}</span>
                        <div onClick={() => setDashboardSettings((p) => ({ ...p, visibleWidgets: { ...p.visibleWidgets, [w.key]: !isOn } }))}
                          className="w-10 h-6 rounded-full relative cursor-pointer transition-all"
                          style={{ background: isOn ? "#726c5a" : "#cdc3ad" }}>
                          <div className="w-4 h-4 bg-white rounded-full absolute top-1 transition-all" style={{ left: isOn ? "22px" : "4px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={cardStyle}>
                <h2 className="text-base font-semibold mb-1" style={{ color: "#4c4847" }}>Default Filter</h2>
                <p className="text-xs mb-4" style={{ color: "#9f886c" }}>ตั้งค่า filter เริ่มต้นของ stats cards</p>
                <div className="flex gap-2 flex-wrap">
                  {(["daily","weekly","monthly","annually"] as const).map((f) => (
                    <button key={f} onClick={() => setDashboardSettings((p) => ({ ...p, defaultFilter: f }))}
                      className="px-4 py-2 rounded-xl text-sm font-medium"
                      style={{
                        background: dashboardSettings.defaultFilter === f ? "#726c5a" : "#f5f2ee",
                        color: dashboardSettings.defaultFilter === f ? "#fff" : "#9f886c",
                        border: "1px solid " + (dashboardSettings.defaultFilter === f ? "#726c5a" : "#e6e5d8"),
                      }}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div style={cardStyle}>
                <h2 className="text-base font-semibold mb-1" style={{ color: "#4c4847" }}>Graph Color Theme</h2>
                <p className="text-xs mb-4" style={{ color: "#9f886c" }}>เลือก color theme สำหรับ graph บน Dashboard</p>
                <div className="flex gap-3 flex-wrap mb-4">
                  {GRAPH_COLORS.map((color, i) => (
                    <button key={i} onClick={() => setDashboardSettings((p) => ({ ...p, graphColor: i }))}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                      style={{
                        border: dashboardSettings.graphColor === i ? `2px solid ${color.primary}` : "1px solid #e6e5d8",
                        background: dashboardSettings.graphColor === i ? "#f5f2ee" : "#fff",
                      }}>
                      <div className="flex gap-1">
                        <div className="w-4 h-4 rounded-full" style={{ background: color.primary }} />
                        <div className="w-4 h-4 rounded-full" style={{ background: color.secondary }} />
                      </div>
                      <span style={{ color: "#4c4847" }}>{color.label}</span>
                      {dashboardSettings.graphColor === i && (
                        <svg width="12" height="12" fill="none" stroke="#726c5a" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  ))}
                </div>
                <div className="p-4 rounded-xl" style={{ background: "#f5f2ee" }}>
                  <p className="text-xs mb-2" style={{ color: "#9f886c" }}>Preview</p>
                  <div className="flex items-end gap-1 h-12">
                    {[60,85,45,70,90,55,75].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm transition-all duration-300"
                        style={{ height: `${h}%`, background: i % 2 === 0 ? selectedColor.primary : selectedColor.secondary }} />
                    ))}
                  </div>
                </div>
              </div>

              {dashboardSuccess && <p className="text-sm mb-3" style={{ color: "#4a9f4a" }}>{dashboardSuccess}</p>}
              <button
                onClick={async () => {
                  await fetch("/api/settings", {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      defaultFilter: dashboardSettings.defaultFilter,
                      graphColor: dashboardSettings.graphColor,
                      visibleWidgets: dashboardSettings.visibleWidgets,
                    }),
                  });
                  setDashboardSuccess("✓ Dashboard settings saved");
                  setTimeout(() => setDashboardSuccess(""), 2000);
                }}
                className="px-5 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "#726c5a", color: "#fff" }}>
                Save Settings
              </button>
            </div>
          )}

          {/* ── Account / User Management (super_admin only) ── */}
          {activeTab === "account" && currentUser.role === "super_admin" && (
            <div>
              {/* User list header */}
              <div style={cardStyle}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold" style={{ color: "#4c4847" }}>User Management</h2>
                    <p className="text-xs mt-0.5" style={{ color: "#9f886c" }}>จัดการ account ผู้ใช้งานในระบบ</p>
                  </div>
                  <button onClick={() => { setShowCreate(true); setEditingUser(null); setCreateError(""); setCreateSuccess(""); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
                    style={{ background: "#726c5a" }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add User
                  </button>
                </div>

                {/* Search */}
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4"
                  style={{ background: "#f5f2ee", border: "1px solid #e6e5d8" }}>
                  <svg width="14" height="14" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Global Search"
                    className="outline-none text-sm w-full"
                    style={{ background: "transparent", color: "#4c4847" }} />
                  {userSearch && (
                    <button onClick={() => setUserSearch("")} style={{ color: "#cdc3ad" }}>✕</button>
                  )}
                </div>

                {/* Create form inline */}
                {showCreate && (
                  <div className="rounded-xl p-5 mb-4" style={{ background: "#f5f2ee", border: "1.5px solid #726c5a" }}>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold" style={{ color: "#4c4847" }}>สร้าง User ใหม่</p>
                      <button onClick={() => setShowCreate(false)} style={{ color: "#9f886c" }}>✕</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs mb-1" style={{ color: "#726c5a" }}>Username <span style={{ color: "#dc2626" }}>*</span></label>
                        <input value={createForm.username} onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))}
                          placeholder="username"
                          className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: "#726c5a" }}>Password <span style={{ color: "#dc2626" }}>*</span></label>
                        <input type="password" value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                          placeholder="password"
                          className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: "#726c5a" }}>First Name</label>
                        <input value={createForm.firstName} onChange={(e) => setCreateForm((p) => ({ ...p, firstName: e.target.value }))}
                          placeholder="ชื่อ"
                          className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: "#726c5a" }}>Last Name</label>
                        <input value={createForm.lastName} onChange={(e) => setCreateForm((p) => ({ ...p, lastName: e.target.value }))}
                          placeholder="นามสกุล"
                          className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs mb-1" style={{ color: "#726c5a" }}>Role</label>
                        <div className="flex gap-2">
                          {["user","admin"].map((r) => (
                            <button key={r} onClick={() => setCreateForm((p) => ({ ...p, role: r }))}
                              className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                              style={{
                                background: createForm.role === r ? "#726c5a" : "#fff",
                                color: createForm.role === r ? "#fff" : "#9f886c",
                                border: "1px solid " + (createForm.role === r ? "#726c5a" : "#e6e5d8"),
                              }}>
                              {r === "admin" ? "Admin" : "User"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {createError && <p className="text-xs mt-3" style={{ color: "#dc2626" }}>{createError}</p>}
                    {createSuccess && <p className="text-xs mt-3" style={{ color: "#4a9f4a" }}>{createSuccess}</p>}
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => setShowCreate(false)}
                        className="px-4 py-2 rounded-xl text-sm" style={{ background: "#fff", color: "#4c4847", border: "1px solid #e6e5d8" }}>
                        Cancel
                      </button>
                      <button onClick={handleCreateUser} disabled={createLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60"
                        style={{ background: "#726c5a" }}>
                        {createLoading && <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />}
                        {createLoading ? "Saving..." : "Create User"}
                      </button>
                    </div>
                  </div>
                )}

                {/* User list */}
                {usersLoading ? (
                  <div className="flex justify-center py-10">
                    <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-center text-sm py-8" style={{ color: "#cdc3ad" }}>
                    {userSearch ? "ไม่พบ user" : "ยังไม่มี user"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map((u) => (
                      <div key={u.id}>
                        <div className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all"
                          style={{ background: editingUser?.id === u.id ? "rgba(114,108,90,0.06)" : "#f5f2ee", border: editingUser?.id === u.id ? "1.5px solid #726c5a" : "1px solid transparent" }}>
                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                            style={{ background: u.role === "admin" ? "#726c5a" : "#9f886c" }}>
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate" style={{ color: "#4c4847" }}>{u.username}</p>
                              <span className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: u.role === "admin" ? "rgba(114,108,90,0.15)" : "#e6e5d8", color: u.role === "admin" ? "#726c5a" : "#9f886c" }}>
                                {u.role}
                              </span>
                              {u.id === currentUser.id && (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#dbeafe", color: "#3b82f6" }}>คุณ</span>
                              )}
                            </div>
                            <p className="text-xs truncate" style={{ color: "#9f886c" }}>
                              {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"} · สร้าง {new Date(u.createdAt).toLocaleDateString("th-TH")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => editingUser?.id === u.id ? setEditingUser(null) : openEdit(u)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ background: editingUser?.id === u.id ? "#726c5a" : "#fff", color: editingUser?.id === u.id ? "#fff" : "#726c5a", border: "1px solid #e6e5d8" }}>
                              {editingUser?.id === u.id ? "ยกเลิก" : "แก้ไข"}
                            </button>
                            <button onClick={() => handleDeleteUser(u)}
                              disabled={u.id === currentUser.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30"
                              style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>
                              ลบ
                            </button>
                          </div>
                        </div>

                        {/* Inline edit form */}
                        {editingUser?.id === u.id && (
                          <div className="rounded-xl p-4 mt-1" style={{ background: "#faf9f7", border: "1px solid #e6e5d8" }}>
                            <p className="text-xs font-semibold mb-3" style={{ color: "#9f886c" }}>แก้ไขข้อมูล</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs mb-1" style={{ color: "#726c5a" }}>Username</label>
                                <input value={editForm.username} onChange={(e) => setEditForm((p) => ({ ...p, username: e.target.value }))}
                                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: "#726c5a" }}>Password ใหม่ (ถ้าต้องการเปลี่ยน)</label>
                                <input type="password" value={editForm.password} onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                                  placeholder="เว้นว่างถ้าไม่ต้องการเปลี่ยน"
                                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: "#726c5a" }}>First Name</label>
                                <input value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: "#726c5a" }}>Last Name</label>
                                <input value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-xs mb-1" style={{ color: "#726c5a" }}>Role</label>
                                <div className="flex gap-2">
                                  {["user","admin"].map((r) => (
                                    <button key={r} onClick={() => setEditForm((p) => ({ ...p, role: r }))}
                                      className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                                      style={{
                                        background: editForm.role === r ? "#726c5a" : "#fff",
                                        color: editForm.role === r ? "#fff" : "#9f886c",
                                        border: "1px solid " + (editForm.role === r ? "#726c5a" : "#e6e5d8"),
                                      }}>
                                      {r === "admin" ? "Admin" : "User"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {editError && <p className="text-xs mt-2" style={{ color: "#dc2626" }}>{editError}</p>}
                            {editSuccess && <p className="text-xs mt-2" style={{ color: "#4a9f4a" }}>{editSuccess}</p>}
                            <div className="flex gap-2 mt-3">
                              <button onClick={() => setEditingUser(null)}
                                className="px-4 py-2 rounded-xl text-sm" style={{ background: "#f5f2ee", color: "#4c4847" }}>
                                Cancel
                              </button>
                              <button onClick={handleSaveEdit} disabled={editLoading}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60"
                                style={{ background: "#726c5a" }}>
                                {editLoading && <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />}
                                {editLoading ? "Saving..." : "บันทึก"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Product Management ── */}
          {activeTab === "product" && (
            <div style={cardStyle}>
              <h2 className="text-base font-semibold mb-4" style={{ color: "#4c4847" }}>Dropdown Options</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e6e5d8" }}>
                  {DROPDOWN_TYPES.map((type) => (
                    <button key={type.key} onClick={() => setActiveType(type.key)}
                      className="w-full text-left px-4 py-3 text-sm transition-all"
                      style={{
                        background: activeType === type.key ? "#f5f2ee" : "transparent",
                        color: activeType === type.key ? "#726c5a" : "#4c4847",
                        fontWeight: activeType === type.key ? 600 : 400,
                        borderLeft: activeType === type.key ? "3px solid #726c5a" : "3px solid transparent",
                        borderBottom: "1px solid #f5f2ee",
                      }}>
                      {type.label}
                    </button>
                  ))}
                </div>
                <div className="col-span-2">
                  <div className="flex gap-2 mb-3">
                    <input value={newValue} onChange={(e) => setNewValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddOption()}
                      placeholder="Add new option..."
                      className="flex-1 px-4 py-2 rounded-xl outline-none text-sm" style={iS} />
                    <button onClick={handleAddOption} disabled={dropdownLoading}
                      className="px-4 py-2 rounded-xl text-sm font-medium"
                      style={{ background: "#726c5a", color: "#fff" }}>+ Add</button>
                  </div>
                  {dropdownMessage && <p className="text-sm mb-2" style={{ color: "#4a9f4a" }}>{dropdownMessage}</p>}
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {options.length === 0 ? (
                      <p className="text-sm text-center py-6" style={{ color: "#cdc3ad" }}>No options yet</p>
                    ) : options.map((opt) => (
                      <div key={opt.id} className="flex items-center justify-between px-4 py-2 rounded-xl" style={{ background: "#f5f2ee" }}>
                        <span className="text-sm" style={{ color: "#4c4847" }}>{opt.value}</span>
                        <button onClick={() => handleDeleteOption(opt.id)}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{ color: "#9f4a4a", background: "#fff0f0" }}>Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Media ── */}
          {activeTab === "media" && (
            <div>
              <div style={cardStyle}>
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div>
                    <h2 className="text-base font-semibold mb-1" style={{ color: "#4c4847" }}>Display Settings</h2>
                    <p className="text-xs" style={{ color: "#9f886c" }}>ตั้งค่าการแสดงผลบน TV display</p>
                  </div>
                  <a href="/display" target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                    style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>
                    Open /display ↗
                  </a>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-sm">
                  <div>
                    <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Slide Duration (sec)</label>
                    <input type="number" value={slideDuration} onChange={(e) => setSlideDuration(+e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                    <p className="text-xs mt-1" style={{ color: "#cdc3ad" }}>ต่อ 1 รูป</p>
                  </div>
                  <div>
                    <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Session Reset (min)</label>
                    <input type="number" value={sessionTimeout} onChange={(e) => setSessionTimeout(+e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                    <p className="text-xs mt-1" style={{ color: "#cdc3ad" }}>Auto-clear หลังไม่มีการใช้งาน</p>
                  </div>
                </div>
                <div className="mt-4 max-w-md">
                  <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Cloud Relay URL (Option E)</label>
                  <input type="text" value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)}
                    placeholder="wss://relay.fly.dev (empty = use direct LAN ws://)"
                    className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                  <p className="text-xs mt-1" style={{ color: "#cdc3ad" }}>The shared base for every relay reader below — set the relay host once, then add readers by device tag. Empty = direct LAN.</p>
                </div>

                {/* Central reader registry — one source of truth, shown as a dropdown on Scan & Display */}
                <div className="mt-5 pt-4" style={{ borderTop: "1px solid #e6e5d8" }}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium" style={{ color: "#4c4847" }}>Readers</label>
                    <button onClick={addReader} className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>+ Add reader</button>
                  </div>
                  <p className="text-xs mb-3" style={{ color: "#cdc3ad" }}>
                    Named readers shown as a dropdown on Scan &amp; Display, so staff pick a name instead of typing an address.
                    Set <b>Device tag</b> for a relay reader (connects via the relay URL above), or a full <b>URL / IP</b> for a direct LAN reader.
                  </p>
                  {readers.length === 0 ? (
                    <p className="text-xs py-1" style={{ color: "#cdc3ad" }}>No readers yet — add one to get started.</p>
                  ) : (
                    <div className="space-y-2">
                      {readers.map((r) => (
                        <div key={r.id} className="grid grid-cols-12 gap-2 items-center">
                          <input value={r.name} onChange={(e) => updateReader(r.id, { name: e.target.value })}
                            placeholder="Name (e.g. Table reader)" className="col-span-4 px-3 py-2 rounded-lg outline-none text-sm" style={iS} />
                          <input value={r.device} onChange={(e) => updateReader(r.id, { device: e.target.value })}
                            placeholder="Device tag (relay)" className="col-span-3 px-3 py-2 rounded-lg outline-none text-sm" style={iS} />
                          <input value={r.url} onChange={(e) => updateReader(r.id, { url: e.target.value })}
                            placeholder="or full URL / IP (direct)" className="col-span-4 px-3 py-2 rounded-lg outline-none text-sm" style={iS} />
                          <button onClick={() => removeReader(r.id)} title="Remove"
                            className="col-span-1 px-2 py-2 rounded-lg text-sm" style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Idle video — loops full-screen on /display when no product is showing */}
                <div className="mt-5 pt-4" style={{ borderTop: "1px solid #e6e5d8" }}>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#4c4847" }}>Idle video (/display)</label>
                  <p className="text-xs mb-1" style={{ color: "#cdc3ad" }}>
                    Loops muted, full-screen on the TV when idle (no product). Paste a URL, or upload a file. Empty = the logo screen.
                  </p>
                  <p className="text-xs mb-2" style={{ color: "#9f886c" }}>
                    Upload limits: <b>MP4 or WEBM</b> only · max <b>{MAX_UPLOAD_MB} MB</b> · plays <b>muted</b> (browser autoplay). Tip: a short 10–30s loop keeps the file small.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="text" value={idleVideoUrl} onChange={(e) => setIdleVideoUrl(e.target.value)}
                      placeholder="https://… .mp4   (or Upload →)"
                      className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                    <label className={`px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer whitespace-nowrap ${videoUploading ? "opacity-60 pointer-events-none" : ""}`}
                      style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>
                      {videoUploading ? "Uploading…" : "Upload"}
                      <input type="file" accept="video/mp4,video/webm" className="hidden" onChange={handleVideoUpload} disabled={videoUploading} />
                    </label>
                    {idleVideoUrl && (
                      <button onClick={() => setIdleVideoUrl("")} className="px-3 py-2.5 rounded-xl text-sm"
                        style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>Remove</button>
                    )}
                  </div>
                  {videoErr && <p className="text-xs mt-1" style={{ color: "#9f4a4a" }}>{videoErr}</p>}
                  {idleVideoUrl && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-xs" style={{ color: "#9f886c" }}>On screen:</span>
                      {([["contain", "Fit (whole video)"], ["cover", "Fill (crop to screen)"]] as const).map(([v, label]) => (
                        <button key={v} onClick={() => setIdleVideoFit(v)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{
                            background: idleVideoFit === v ? "#726c5a" : "#f5f2ee",
                            color: idleVideoFit === v ? "#fff" : "#4c4847",
                            border: "1px solid " + (idleVideoFit === v ? "#726c5a" : "#e6e5d8"),
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {idleVideoUrl && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={idleVideoUrl} className="mt-2 w-56 rounded-lg" style={{ background: "#000", objectFit: idleVideoFit as "contain" | "cover", aspectRatio: "16/9" }} muted loop playsInline controls />
                  )}
                </div>

                {/* Screen rotation — for portrait-mounted TVs etc. */}
                <div className="mt-5 pt-4" style={{ borderTop: "1px solid #e6e5d8" }}>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#4c4847" }}>Screen rotation</label>
                  <p className="text-xs mb-2" style={{ color: "#cdc3ad" }}>Rotates the whole /display screen. Per-TV override: add <code style={{ background: "#f5f2ee", padding: "0 4px", borderRadius: 4 }}>?rotate=90</code> to that screen&apos;s URL.</p>
                  <div className="flex gap-2 flex-wrap">
                    {[0, 90, 180, 270].map((deg) => (
                      <button key={deg} onClick={() => setDisplayRotation(deg)}
                        className="px-4 py-2 rounded-xl text-sm font-medium"
                        style={{
                          background: displayRotation === deg ? "#726c5a" : "#f5f2ee",
                          color: displayRotation === deg ? "#fff" : "#4c4847",
                          border: "1px solid " + (displayRotation === deg ? "#726c5a" : "#e6e5d8"),
                        }}>
                        {deg}°{deg === 0 ? " (normal)" : deg === 90 ? " ↻" : deg === 270 ? " ↺" : ""}
                      </button>
                    ))}
                  </div>
                </div>

                {displaySettingsSuccess && <p className="text-sm mt-3" style={{ color: "#4a9f4a" }}>{displaySettingsSuccess}</p>}
                <button onClick={() => saveSettings({ slideDuration, sessionTimeout, relayUrl: relayUrl.trim(), readers, idleVideoUrl: idleVideoUrl.trim(), displayRotation, idleVideoFit }, () => { setDisplaySettingsSuccess("✓ Saved"); setTimeout(() => setDisplaySettingsSuccess(""), 2000); })}
                  className="mt-4 px-5 py-2.5 rounded-xl text-sm font-medium" style={{ background: "#726c5a", color: "#fff" }}>
                  Save
                </button>
              </div>

              <div style={cardStyle}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold" style={{ color: "#4c4847" }}>Media Files</h2>
                    <p className="text-xs mt-0.5" style={{ color: "#9f886c" }}>Overview of all product images — upload &amp; reorder in Edit Product</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4"
                  style={{ background: "#f5f2ee", border: "1px solid #e6e5d8" }}>
                  <svg width="14" height="14" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input value={mediaSearch} onChange={(e) => setMediaSearch(e.target.value)}
                    placeholder="Search by product name or code..."
                    className="outline-none text-sm w-full" style={{ background: "transparent", color: "#4c4847" }} />
                </div>
                {mediaSuccess && <p className="text-sm mb-3" style={{ color: "#4a9f4a" }}>{mediaSuccess}</p>}
                {mediaLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} />
                  </div>
                ) : filteredMedia.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm" style={{ color: "#cdc3ad" }}>{mediaSearch ? "No results found" : "No media files yet"}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    <div className="grid grid-cols-12 px-3 pb-1 text-xs font-medium" style={{ color: "#9f886c" }}>
                      <div className="col-span-1">Image</div>
                      <div className="col-span-5">Product</div>
                      <div className="col-span-3">Code</div>
                      <div className="col-span-2 text-center">Order</div>
                      <div className="col-span-1" />
                    </div>
                    {filteredMedia.map((file) => (
                      <div key={file.id} className="grid grid-cols-12 items-center px-3 py-2 rounded-xl" style={{ background: "#f5f2ee" }}>
                        <div className="col-span-1">
                          <div className="w-8 h-10 rounded overflow-hidden" style={{ background: "#e6e5d8" }}>
                            <img src={file.url} alt="" className="w-full h-full object-cover" />
                          </div>
                        </div>
                        <div className="col-span-5 text-sm truncate pr-2" style={{ color: "#4c4847" }}>{file.product?.name ?? "–"}</div>
                        <div className="col-span-3 text-xs" style={{ color: "#9f886c" }}>{file.product?.productCode ?? "–"}</div>
                        <div className="col-span-2 text-center text-xs" style={{ color: "#9f886c" }}>#{file.order + 1}</div>
                        <div className="col-span-1 flex gap-1 justify-end">
                          <a href={file.url} download className="w-6 h-6 flex items-center justify-center rounded-lg" style={{ background: "#e6e5d8" }}>
                            <svg width="11" height="11" fill="none" stroke="#726c5a" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                          </a>
                          <button onClick={() => handleDeleteMedia(file.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg" style={{ background: "#fff0f0" }}>
                            <svg width="11" height="11" fill="none" stroke="#9f4a4a" strokeWidth="2" viewBox="0 0 24 24">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Takeaway Limit ── */}
          {activeTab === "takeaway" && (
            <div>
              <div style={cardStyle}>
                <h2 className="text-base font-semibold mb-1" style={{ color: "#4c4847" }}>Takeaway Limit</h2>
                <p className="text-xs mb-6" style={{ color: "#9f886c" }}>กำหนดจำนวนสินค้าตัวอย่างสูงสุดที่ลูกค้าสามารถนำออกได้ต่อครั้ง</p>
                <div className="flex items-center justify-between p-4 rounded-xl mb-6" style={{ background: "#f5f2ee" }}>
                  <div>
                    <p className="font-medium text-sm" style={{ color: "#4c4847" }}>เปิดใช้งาน Takeaway Limit</p>
                    <p className="text-xs mt-0.5" style={{ color: "#9f886c" }}>จำกัดจำนวนสินค้าที่ลูกค้านำออกได้</p>
                  </div>
                  <div onClick={() => setTakeawayEnabled((p) => !p)}
                    className="w-10 h-6 rounded-full relative cursor-pointer transition-all"
                    style={{ background: takeawayEnabled ? "#726c5a" : "#cdc3ad" }}>
                    <div className="w-4 h-4 bg-white rounded-full absolute top-1 transition-all" style={{ left: takeawayEnabled ? "22px" : "4px" }} />
                  </div>
                </div>
                <div className={takeawayEnabled ? "" : "opacity-40 pointer-events-none"}>
                  <p className="text-sm font-medium mb-4" style={{ color: "#4c4847" }}>จำนวนสินค้าสูงสุดต่อครั้ง</p>
                  <div className="flex items-center gap-6 mb-6">
                    <button onClick={() => setTakeawayLimit((v) => Math.max(1, v - 1))}
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-medium"
                      style={{ background: "#f5f2ee", color: "#4c4847", border: "1px solid #e6e5d8" }}>−</button>
                    <div className="text-center">
                      <p className="text-5xl font-bold" style={{ color: "#4c4847" }}>{takeawayLimit}</p>
                      <p className="text-xs mt-1" style={{ color: "#9f886c" }}>ชิ้น / ครั้ง</p>
                    </div>
                    <button onClick={() => setTakeawayLimit((v) => Math.min(20, v + 1))}
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-medium text-white"
                      style={{ background: "#726c5a" }}>+</button>
                  </div>
                  <div>
                    <p className="text-xs mb-2" style={{ color: "#9f886c" }}>Preset</p>
                    <div className="flex gap-2 flex-wrap">
                      {[1,2,3,5,10].map((preset) => (
                        <button key={preset} onClick={() => setTakeawayLimit(preset)}
                          className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                          style={{
                            background: takeawayLimit === preset ? "#726c5a" : "#f5f2ee",
                            color: takeawayLimit === preset ? "#fff" : "#4c4847",
                            border: "1px solid " + (takeawayLimit === preset ? "#726c5a" : "#e6e5d8"),
                          }}>
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Borrow / Return period — drives the default due date + "overdue" flag */}
                <div className="mt-6 pt-5" style={{ borderTop: "1px solid #e6e5d8" }}>
                  <p className="text-sm font-medium mb-1" style={{ color: "#4c4847" }}>ระยะเวลายืม / Borrow period</p>
                  <p className="text-xs mb-4" style={{ color: "#9f886c" }}>Default days a takeaway is due back — drives the due date &amp; “overdue” flag on the Borrow / Return page. A per-item due date still overrides this.</p>
                  <div className="flex items-center gap-6 mb-4">
                    <button onClick={() => setBorrowDays((v) => Math.max(1, v - 1))}
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-medium"
                      style={{ background: "#f5f2ee", color: "#4c4847", border: "1px solid #e6e5d8" }}>−</button>
                    <div className="text-center">
                      <p className="text-5xl font-bold" style={{ color: "#4c4847" }}>{borrowDays}</p>
                      <p className="text-xs mt-1" style={{ color: "#9f886c" }}>days</p>
                    </div>
                    <button onClick={() => setBorrowDays((v) => Math.min(365, v + 1))}
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-medium text-white"
                      style={{ background: "#726c5a" }}>+</button>
                  </div>
                  <div>
                    <p className="text-xs mb-2" style={{ color: "#9f886c" }}>Preset</p>
                    <div className="flex gap-2 flex-wrap">
                      {[7, 14, 30, 60, 90].map((preset) => (
                        <button key={preset} onClick={() => setBorrowDays(preset)}
                          className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                          style={{
                            background: borrowDays === preset ? "#726c5a" : "#f5f2ee",
                            color: borrowDays === preset ? "#fff" : "#4c4847",
                            border: "1px solid " + (borrowDays === preset ? "#726c5a" : "#e6e5d8"),
                          }}>
                          {preset}d
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {takeawaySuccess && <p className="text-sm mt-4" style={{ color: "#4a9f4a" }}>{takeawaySuccess}</p>}
                <button
                  onClick={async () => {
                    await fetch("/api/settings", {
                      method: "PUT", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ takeawayLimit, takeawayEnabled, borrowDays }),
                    });
                    setTakeawaySuccess("✓ Takeaway settings saved");
                    setTimeout(() => setTakeawaySuccess(""), 2000);
                  }}
                  className="mt-5 px-5 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: "#726c5a", color: "#fff" }}>
                  Save Settings
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}