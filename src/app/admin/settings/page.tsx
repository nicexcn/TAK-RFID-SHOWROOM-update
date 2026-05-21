"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface DropdownOption {
  id: string;
  type: string;
  value: string;
}

interface MediaFile {
  id: string;
  productId: string;
  url: string;
  order: number;
  product?: { name: string; productCode?: string };
}

const DROPDOWN_TYPES = [
  { key: "brand", label: "Brand" },
  { key: "materialType", label: "Material Type" },
  { key: "category", label: "Category" },
];

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "account", label: "Account" },
  { key: "product", label: "Product Management" },
  { key: "media", label: "Media" },
  { key: "takeaway", label: "Takeaway Limit" },
  { key: "system", label: "System" },
];

const GRAPH_COLORS = [
  { label: "Warm Brown", primary: "#726c5a", secondary: "#cdc3ad" },
  { label: "Slate Blue", primary: "#4a6fa5", secondary: "#a8c0dd" },
  { label: "Forest Green", primary: "#4a7c59", secondary: "#a8cbb5" },
  { label: "Dusty Rose", primary: "#9f6b6b", secondary: "#d4a8a8" },
  { label: "Charcoal", primary: "#4c4847", secondary: "#9f886c" },
];

const WIDGETS = [
  { key: "walkins", label: "Walk-ins" },
  { key: "customerTypes", label: "Type of Customers" },
  { key: "newVsTotal", label: "New vs Total Customers" },
  { key: "comparisonGraph", label: "Comparison Graph by Year" },
  { key: "categoryGraph", label: "Interest by Category Graph" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e6e5d8",
  borderRadius: "0.75rem",
  padding: "1.5rem",
  marginBottom: "1rem",
};

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("dashboard");

  // ── Dashboard settings ────────────────────────────────────────────────
  const [dashboardSettings, setDashboardSettings] = useState({
    defaultFilter: "daily" as "daily" | "weekly" | "monthly" | "annually",
    comparisonYears: { yearA: 2025, yearB: 2026 },
    graphColor: 0,
    visibleWidgets: {
      walkins: true, customerTypes: true, newVsTotal: true,
      comparisonGraph: true, categoryGraph: true,
    },
  });
  const [dashboardSuccess, setDashboardSuccess] = useState("");

  // ── Dropdown ──────────────────────────────────────────────────────────
  const [options, setOptions] = useState<DropdownOption[]>([]);
  const [activeType, setActiveType] = useState("brand");
  const [newValue, setNewValue] = useState("");
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [dropdownMessage, setDropdownMessage] = useState("");

  // ── Account ───────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({ username: "" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // ── Media ─────────────────────────────────────────────────────────────
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaSuccess, setMediaSuccess] = useState("");
  const [slideDuration, setSlideDuration] = useState(5);
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const [displaySettingsSuccess, setDisplaySettingsSuccess] = useState("");

  // Scheduling
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleOn, setScheduleOn] = useState("08:00");
  const [scheduleOff, setScheduleOff] = useState("18:00");
  const [scheduleDays, setScheduleDays] = useState<string[]>(["Mon","Tue","Wed","Thu","Fri"]);
  const [scheduleSuccess, setScheduleSuccess] = useState("");

  // ── System ────────────────────────────────────────────────────────────
  const [systemSettings, setSystemSettings] = useState({ timezone: "Asia/Bangkok" });
  const [systemSuccess, setSystemSuccess] = useState("");

  // Takeaway
  const [takeawayLimit, setTakeawayLimit] = useState(3);
  const [takeawayEnabled, setTakeawayEnabled] = useState(true);
  const [takeawaySuccess, setTakeawaySuccess] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.takeawayLimit !== undefined) setTakeawayLimit(d.takeawayLimit);
      if (d.takeawayEnabled !== undefined) setTakeawayEnabled(d.takeawayEnabled);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchOptions(); }, [activeType]);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      if (data.username) setProfile({ username: data.username });
    });
  }, []);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((data) => {
      if (data.id) {
        setDashboardSettings({
          defaultFilter: data.defaultFilter,
          comparisonYears: { yearA: data.yearA, yearB: data.yearB },
          graphColor: data.graphColor,
          visibleWidgets: data.visibleWidgets,
        });
      }
    });
  }, []);

  useEffect(() => {
    if (activeTab === "media") fetchMediaFiles();
  }, [activeTab]);

  async function fetchMediaFiles() {
    setMediaLoading(true);
    try {
      const res = await fetch("/api/products/images/all");
      if (res.ok) {
        const data = await res.json();
        setMediaFiles(data);
      }
    } catch {}
    setMediaLoading(false);
  }

  async function handleDeleteMedia(id: string) {
    if (!confirm("Delete this image?")) return;
    await fetch(`/api/products/images/${id}`, { method: "DELETE" });
    setMediaFiles((p) => p.filter((f) => f.id !== id));
    setMediaSuccess("✓ Image deleted");
    setTimeout(() => setMediaSuccess(""), 2000);
  }

  async function fetchOptions() {
    const res = await fetch(`/api/dropdown?type=${activeType}`);
    const data = await res.json();
    setOptions(data);
  }

  async function handleAddOption() {
    if (!newValue.trim()) return;
    setDropdownLoading(true);
    await fetch("/api/dropdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: activeType, value: newValue.trim() }),
    });
    setNewValue("");
    await fetchOptions();
    setDropdownMessage("Added successfully");
    setTimeout(() => setDropdownMessage(""), 2000);
    setDropdownLoading(false);
  }

  async function handleDeleteOption(id: string) {
    if (!confirm("Delete this option?")) return;
    await fetch("/api/dropdown", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchOptions();
  }

  async function handleChangePassword() {
    setPwError(""); setPwSuccess("");
    if (!pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmPassword) {
      setPwError("Please fill in all fields"); return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("New passwords do not match"); return;
    }
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
    });
    if (res.ok) {
      setPwSuccess("Password changed successfully");
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => setPwSuccess(""), 3000);
    } else {
      const data = await res.json();
      setPwError(data.error || "Failed to change password");
    }
  }

  const inputStyle = { background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" };
  const selectedColor = GRAPH_COLORS[dashboardSettings.graphColor];

  const filteredMedia = mediaFiles.filter((f) =>
    !mediaSearch || f.product?.name?.toLowerCase().includes(mediaSearch.toLowerCase()) ||
    f.product?.productCode?.toLowerCase().includes(mediaSearch.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Settings</h1>
        <p className="text-xs mt-1" style={{ color: "#9f886c" }}>Home / Settings</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-52 shrink-0">
          <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
            {TABS.map((tab) => (
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
                      <div key={w.key} className="flex items-center justify-between px-4 py-3 rounded-xl"
                        style={{ background: "#f5f2ee" }}>
                        <span className="text-sm" style={{ color: "#4c4847" }}>{w.label}</span>
                        <div onClick={() => setDashboardSettings((p) => ({
                            ...p, visibleWidgets: { ...p.visibleWidgets, [w.key]: !isOn },
                          }))}
                          className="w-10 h-6 rounded-full relative cursor-pointer transition-all"
                          style={{ background: isOn ? "#726c5a" : "#cdc3ad" }}>
                          <div className="w-4 h-4 bg-white rounded-full absolute top-1 transition-all"
                            style={{ left: isOn ? "22px" : "4px" }} />
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
                  {(["daily", "weekly", "monthly", "annually"] as const).map((f) => (
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
                <h2 className="text-base font-semibold mb-1" style={{ color: "#4c4847" }}>Comparison Years</h2>
                <p className="text-xs mb-4" style={{ color: "#9f886c" }}>กำหนดปีที่ใช้เปรียบเทียบใน Comparison Graph</p>
                <div className="flex items-center gap-4 max-w-xs">
                  <div className="flex-1">
                    <label className="block text-xs mb-1" style={{ color: "#9f886c" }}>Year A</label>
                    <input type="number" value={dashboardSettings.comparisonYears.yearA}
                      onChange={(e) => setDashboardSettings((p) => ({ ...p, comparisonYears: { ...p.comparisonYears, yearA: +e.target.value } }))}
                      className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
                  </div>
                  <div style={{ color: "#cdc3ad", marginTop: 16 }}>vs</div>
                  <div className="flex-1">
                    <label className="block text-xs mb-1" style={{ color: "#9f886c" }}>Year B</label>
                    <input type="number" value={dashboardSettings.comparisonYears.yearB}
                      onChange={(e) => setDashboardSettings((p) => ({ ...p, comparisonYears: { ...p.comparisonYears, yearB: +e.target.value } }))}
                      className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
                  </div>
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
                        <svg width="12" height="12" fill="none" stroke="#726c5a" strokeWidth="2.5" viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
                <div className="p-4 rounded-xl" style={{ background: "#f5f2ee" }}>
                  <p className="text-xs mb-2" style={{ color: "#9f886c" }}>Preview</p>
                  <div className="flex items-end gap-1 h-12">
                    {[60, 85, 45, 70, 90, 55, 75].map((h, i) => (
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
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      defaultFilter: dashboardSettings.defaultFilter,
                      yearA: dashboardSettings.comparisonYears.yearA,
                      yearB: dashboardSettings.comparisonYears.yearB,
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

          {/* ── Account ── */}
          {activeTab === "account" && (
            <div>
              <div style={cardStyle}>
                <h2 className="text-base font-semibold mb-4" style={{ color: "#4c4847" }}>Profile</h2>
                <div className="space-y-3 max-w-sm">
                  <div>
                    <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Username</label>
                    <input value={profile.username} disabled
                      className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                      style={{ ...inputStyle, opacity: 0.6 }} />
                  </div>
                </div>
              </div>
              <div style={cardStyle}>
                <h2 className="text-base font-semibold mb-4" style={{ color: "#4c4847" }}>Change Password</h2>
                <div className="space-y-3 max-w-sm">
                  {(["currentPassword", "newPassword", "confirmPassword"] as const).map((field) => (
                    <div key={field}>
                      <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>
                        {field === "currentPassword" ? "Current Password" : field === "newPassword" ? "New Password" : "Confirm New Password"}
                      </label>
                      <input type="password" value={pwForm[field]}
                        onChange={(e) => setPwForm((p) => ({ ...p, [field]: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
                    </div>
                  ))}
                  {pwError && <p className="text-sm" style={{ color: "#9f4a4a" }}>{pwError}</p>}
                  {pwSuccess && <p className="text-sm" style={{ color: "#4a9f4a" }}>{pwSuccess}</p>}
                  <button onClick={handleChangePassword}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: "#726c5a", color: "#fff" }}>
                    Change Password
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Product Management ── */}
          {activeTab === "product" && (
            <div style={cardStyle}>
              <h2 className="text-base font-semibold mb-4" style={{ color: "#4c4847" }}>Dropdown Options</h2>
              <div className="grid grid-cols-3 gap-4">
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
                      className="flex-1 px-4 py-2 rounded-xl outline-none text-sm" style={inputStyle} />
                    <button onClick={handleAddOption} disabled={dropdownLoading}
                      className="px-4 py-2 rounded-xl text-sm font-medium"
                      style={{ background: "#726c5a", color: "#fff" }}>
                      + Add
                    </button>
                  </div>
                  {dropdownMessage && <p className="text-sm mb-2" style={{ color: "#4a9f4a" }}>{dropdownMessage}</p>}
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {options.length === 0 ? (
                      <p className="text-sm text-center py-6" style={{ color: "#cdc3ad" }}>No options yet</p>
                    ) : options.map((opt) => (
                      <div key={opt.id} className="flex items-center justify-between px-4 py-2 rounded-xl"
                        style={{ background: "#f5f2ee" }}>
                        <span className="text-sm" style={{ color: "#4c4847" }}>{opt.value}</span>
                        <button onClick={() => handleDeleteOption(opt.id)}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{ color: "#9f4a4a", background: "#fff0f0" }}>
                          Delete
                        </button>
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
              {/* Display Settings (ย้ายมาจาก Display tab) */}
              <div style={cardStyle}>
                <h2 className="text-base font-semibold mb-1" style={{ color: "#4c4847" }}>Display Settings</h2>
                <p className="text-xs mb-4" style={{ color: "#9f886c" }}>ตั้งค่าการแสดงผลบน TV display</p>
                <div className="grid grid-cols-2 gap-4 max-w-sm">
                  <div>
                    <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Slide Duration (sec)</label>
                    <input type="number" value={slideDuration}
                      onChange={(e) => setSlideDuration(+e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
                    <p className="text-xs mt-1" style={{ color: "#cdc3ad" }}>ต่อ 1 รูป</p>
                  </div>
                  <div>
                    <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Session Reset (min)</label>
                    <input type="number" value={sessionTimeout}
                      onChange={(e) => setSessionTimeout(+e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
                    <p className="text-xs mt-1" style={{ color: "#cdc3ad" }}>Auto-clear หลังไม่มีการใช้งาน</p>
                  </div>
                </div>
                {displaySettingsSuccess && <p className="text-sm mt-3" style={{ color: "#4a9f4a" }}>{displaySettingsSuccess}</p>}
                <button
                  onClick={() => { setDisplaySettingsSuccess("✓ Saved"); setTimeout(() => setDisplaySettingsSuccess(""), 2000); }}
                  className="mt-4 px-5 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: "#726c5a", color: "#fff" }}>
                  Save
                </button>
              </div>

              {/* Scheduling */}
              <div style={cardStyle}>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold" style={{ color: "#4c4847" }}>Display Scheduling</h2>
                  {/* Toggle */}
                  <div onClick={() => setScheduleEnabled((p) => !p)}
                    className="w-10 h-6 rounded-full relative cursor-pointer transition-all"
                    style={{ background: scheduleEnabled ? "#726c5a" : "#cdc3ad" }}>
                    <div className="w-4 h-4 bg-white rounded-full absolute top-1 transition-all"
                      style={{ left: scheduleEnabled ? "22px" : "4px" }} />
                  </div>
                </div>
                <p className="text-xs mb-4" style={{ color: "#9f886c" }}>กำหนดเวลาเปิด/ปิด display screen อัตโนมัติ</p>

                <div className={scheduleEnabled ? "" : "opacity-40 pointer-events-none"}>
                  {/* Days */}
                  <div className="mb-4">
                    <label className="block text-sm mb-2" style={{ color: "#4c4847" }}>วันที่เปิดใช้งาน</label>
                    <div className="flex gap-2 flex-wrap">
                      {DAYS.map((day) => {
                        const active = scheduleDays.includes(day);
                        return (
                          <button key={day}
                            onClick={() => setScheduleDays((p) => active ? p.filter((d) => d !== day) : [...p, day])}
                            className="w-12 py-1.5 rounded-xl text-xs font-medium transition-all"
                            style={{
                              background: active ? "#726c5a" : "#f5f2ee",
                              color: active ? "#fff" : "#9f886c",
                              border: "1px solid " + (active ? "#726c5a" : "#e6e5d8"),
                            }}>
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time range */}
                  <div className="flex items-center gap-4 max-w-xs">
                    <div className="flex-1">
                      <label className="block text-xs mb-1" style={{ color: "#9f886c" }}>เปิด (On)</label>
                      <input type="time" value={scheduleOn}
                        onChange={(e) => setScheduleOn(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
                    </div>
                    <div style={{ color: "#cdc3ad", marginTop: 16 }}>→</div>
                    <div className="flex-1">
                      <label className="block text-xs mb-1" style={{ color: "#9f886c" }}>ปิด (Off)</label>
                      <input type="time" value={scheduleOff}
                        onChange={(e) => setScheduleOff(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
                    </div>
                  </div>
                </div>

                {scheduleSuccess && <p className="text-sm mt-3" style={{ color: "#4a9f4a" }}>{scheduleSuccess}</p>}
                <button
                  onClick={() => { setScheduleSuccess("✓ Schedule saved"); setTimeout(() => setScheduleSuccess(""), 2000); }}
                  className="mt-4 px-5 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: "#726c5a", color: "#fff" }}>
                  Save Schedule
                </button>
              </div>

              {/* Media Files */}
              <div style={cardStyle}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold" style={{ color: "#4c4847" }}>Media Files</h2>
                    <p className="text-xs mt-0.5" style={{ color: "#9f886c" }}>จัดการรูปภาพ product ทั้งหมด</p>
                  </div>
                  <button onClick={() => router.push("/admin/media")}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
                    style={{ background: "#726c5a", color: "#fff" }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload Media
                  </button>
                </div>

                {/* Search */}
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4"
                  style={{ background: "#f5f2ee", border: "1px solid #e6e5d8" }}>
                  <svg width="14" height="14" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input value={mediaSearch} onChange={(e) => setMediaSearch(e.target.value)}
                    placeholder="Search by product name or code..."
                    className="outline-none text-sm w-full"
                    style={{ background: "transparent", color: "#4c4847" }} />
                </div>

                {mediaSuccess && <p className="text-sm mb-3" style={{ color: "#4a9f4a" }}>{mediaSuccess}</p>}

                {mediaLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 rounded-full border-2 animate-spin"
                      style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} />
                  </div>
                ) : filteredMedia.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm" style={{ color: "#cdc3ad" }}>
                      {mediaSearch ? "No results found" : "No media files yet"}
                    </p>
                    {!mediaSearch && (
                      <button onClick={() => router.push("/admin/media")}
                        className="mt-3 text-sm underline" style={{ color: "#726c5a" }}>
                        Upload images →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {/* Header */}
                    <div className="grid grid-cols-12 px-3 pb-1 text-xs font-medium" style={{ color: "#9f886c" }}>
                      <div className="col-span-1">Image</div>
                      <div className="col-span-5">Product</div>
                      <div className="col-span-3">Code</div>
                      <div className="col-span-2 text-center">Order</div>
                      <div className="col-span-1" />
                    </div>
                    {filteredMedia.map((file) => (
                      <div key={file.id}
                        className="grid grid-cols-12 items-center px-3 py-2 rounded-xl"
                        style={{ background: "#f5f2ee" }}>
                        {/* Thumbnail */}
                        <div className="col-span-1">
                          <div className="w-8 h-10 rounded overflow-hidden" style={{ background: "#e6e5d8" }}>
                            <img src={file.url} alt="" className="w-full h-full object-cover" />
                          </div>
                        </div>
                        <div className="col-span-5 text-sm truncate pr-2" style={{ color: "#4c4847" }}>
                          {file.product?.name ?? "–"}
                        </div>
                        <div className="col-span-3 text-xs" style={{ color: "#9f886c" }}>
                          {file.product?.productCode ?? "–"}
                        </div>
                        <div className="col-span-2 text-center text-xs" style={{ color: "#9f886c" }}>
                          #{file.order + 1}
                        </div>
                        {/* Actions */}
                        <div className="col-span-1 flex gap-1 justify-end">
                          <a href={file.url} download
                            className="w-6 h-6 flex items-center justify-center rounded-lg"
                            style={{ background: "#e6e5d8" }} title="Download">
                            <svg width="11" height="11" fill="none" stroke="#726c5a" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                          </a>
                          <button onClick={() => handleDeleteMedia(file.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg"
                            style={{ background: "#fff0f0" }} title="Delete">
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
                <p className="text-xs mb-6" style={{ color: "#9f886c" }}>
                  กำหนดจำนวนสินค้าตัวอย่างสูงสุดที่ลูกค้าสามารถนำออกได้ต่อครั้ง
                </p>

                {/* Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl mb-6"
                  style={{ background: "#f5f2ee" }}>
                  <div>
                    <p className="font-medium text-sm" style={{ color: "#4c4847" }}>เปิดใช้งาน Takeaway Limit</p>
                    <p className="text-xs mt-0.5" style={{ color: "#9f886c" }}>จำกัดจำนวนสินค้าที่ลูกค้านำออกได้</p>
                  </div>
                  <div onClick={() => setTakeawayEnabled((p) => !p)}
                    className="w-10 h-6 rounded-full relative cursor-pointer transition-all"
                    style={{ background: takeawayEnabled ? "#726c5a" : "#cdc3ad" }}>
                    <div className="w-4 h-4 bg-white rounded-full absolute top-1 transition-all"
                      style={{ left: takeawayEnabled ? "22px" : "4px" }} />
                  </div>
                </div>

                {/* Counter */}
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

                  {/* Presets */}
                  <div>
                    <p className="text-xs mb-2" style={{ color: "#9f886c" }}>Preset</p>
                    <div className="flex gap-2 flex-wrap">
                      {[1, 2, 3, 5, 10].map((preset) => (
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

                {takeawaySuccess && <p className="text-sm mt-4" style={{ color: "#4a9f4a" }}>{takeawaySuccess}</p>}
                <button
                  onClick={async () => {
                    await fetch("/api/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ takeawayLimit, takeawayEnabled }),
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

          {/* ── System ── */}
          {activeTab === "system" && (
            <div style={cardStyle}>
              <h2 className="text-base font-semibold mb-4" style={{ color: "#4c4847" }}>System Settings</h2>
              <div className="space-y-4 max-w-sm">
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Timezone</label>
                  <select value={systemSettings.timezone}
                    onChange={(e) => setSystemSettings((p) => ({ ...p, timezone: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle}>
                    <option value="Asia/Bangkok">Asia/Bangkok (UTC+7)</option>
                    <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Current Date & Time</label>
                  <div className="px-4 py-3 rounded-xl text-sm" style={{ ...inputStyle, opacity: 0.7 }}>
                    {new Date().toLocaleString("en-GB", { timeZone: systemSettings.timezone })}
                  </div>
                </div>
                {systemSuccess && <p className="text-sm" style={{ color: "#4a9f4a" }}>{systemSuccess}</p>}
                <button onClick={() => { setSystemSuccess("✓ System settings saved"); setTimeout(() => setSystemSuccess(""), 2000); }}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium"
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