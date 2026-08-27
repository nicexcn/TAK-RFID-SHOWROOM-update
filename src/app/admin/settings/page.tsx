"use client";
import { PageHeader } from "@/components/PageHeader";
import Image from "next/image";
import { Spinner } from "@/components/Spinner";
import { Toggle } from "@/components/Toggle";
import { Stepper } from "@/components/Stepper";

import { useState, useEffect } from "react";
import type { SavedReader } from "@/lib/readers";
import { displayUrl, type SavedDisplay } from "@/lib/displays";
import { uploadFile } from "@/lib/uploadImage";
import { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME, isImageUrl } from "@/lib/storage";
import { ROLES } from "@/lib/roles";
import { formatDate } from "@/lib/formatDate";
import { useConfirm } from "@/components/ConfirmDialog";
import ProductImagePicker from "@/components/ProductImagePicker";
import ReaderSetupGuide from "@/components/ReaderSetupGuide";
import SecretInput from "@/components/SecretInput";
import { toast } from "sonner";

const errToast = (msg: string) =>
  toast(msg, { style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } });

// Mints a stable id for a registry row (reader or display).
const newRegistryId = () =>
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
  { key: "sales", label: "Salesperson" },
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
  { key: "walkins",         label: "Visits" },
  { key: "customerTypes",   label: "Type of Customers" },
  { key: "newVsTotal",      label: "New vs Returning" },
  { key: "comparisonGraph", label: "Visits by Month" },
  { key: "categoryGraph",   label: "Interest by Category Graph" },
];

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: "0.75rem", padding: "1.5rem", marginBottom: "1rem",
};

// ── small reusable input style ─────────────────────────────────────────────
const iS = { background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" };

export default function SettingsPage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState("dashboard");

  // Ids of rows whose DELETE request is in flight — disables the control + gates local removal on res.ok.
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [deletingOptionId, setDeletingOptionId] = useState<string | null>(null);

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
  // Sales master (slide 28): the real TWC list with ERP codes, managed instead of
  // free-text dropdown options when activeType === "sales".
  const [salesMaster, setSalesMaster] = useState<{ id: string; code: string; name: string }[]>([]);

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
  const [relaySubscriberKey, setRelaySubscriberKey] = useState(""); // relay subscriber key (paired with relayUrl)
  const [readers, setReaders] = useState<SavedReader[]>([]); // central reader registry
  const [displays, setDisplays] = useState<SavedDisplay[]>([]); // central TV screen (zone) registry
  // Snapshot of readers+displays as last saved, to flag unsaved edits (JSON compare is fine at this scale).
  const [savedRegistrySnap, setSavedRegistrySnap] = useState("[]|[]");
  const registryDirty = savedRegistrySnap !== JSON.stringify(readers) + "|" + JSON.stringify(displays);
  const [idleVideoUrl, setIdleVideoUrl] = useState(""); // /display idle-loop video
  const [idleVideoFit, setIdleVideoFit] = useState("contain"); // "contain" (Fit) | "cover" (Fill)
  const [idleImages, setIdleImages] = useState<string[]>([]); // idle slideshow (images-only); takes precedence over idleVideoUrl
  const [idleSlideSeconds, setIdleSlideSeconds] = useState(6); // seconds per idle slide
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoErr, setVideoErr] = useState("");
  const [displayRotation, setDisplayRotation] = useState(0); // /display screen rotation (deg)
  const [displaySettingsSuccess, setDisplaySettingsSuccess] = useState("");
  const [savingDisplay, setSavingDisplay] = useState(false); // Display Settings Save in-flight
  const [savingDashboard, setSavingDashboard] = useState(false); // Dashboard Settings Save in-flight
  const [savingTakeaway, setSavingTakeaway] = useState(false); // Takeaway Settings Save in-flight

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
      if (d.relaySubscriberKey !== undefined) setRelaySubscriberKey(d.relaySubscriberKey);
      if (d.idleVideoUrl !== undefined) setIdleVideoUrl(d.idleVideoUrl);
      if (d.idleVideoFit !== undefined) setIdleVideoFit(d.idleVideoFit);
      if (Array.isArray(d.idleImages)) setIdleImages(d.idleImages);
      if (d.idleSlideSeconds !== undefined) setIdleSlideSeconds(d.idleSlideSeconds);
      if (d.displayRotation !== undefined) setDisplayRotation(d.displayRotation);
      const ld = Array.isArray(d.readers) ? d.readers : [];
      const dd = Array.isArray(d.displays) ? d.displays : [];
      setReaders(ld);
      setDisplays(dd);
      setSavedRegistrySnap(JSON.stringify(ld) + "|" + JSON.stringify(dd)); // baseline for the unsaved-changes pill
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
      setCreateError("Username and Password are required"); return;
    }
    setCreateLoading(true);
    const res = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    const data = await res.json();
    if (res.ok) {
      setCreateSuccess("✓ User created");
      setCreateForm({ username: "", password: "", firstName: "", lastName: "", role: "user" });
      setShowCreate(false);
      await fetchUsers();
      setTimeout(() => setCreateSuccess(""), 3000);
    } else {
      setCreateError(data.error || "Something went wrong");
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
      setEditSuccess("✓ Saved");
      setUsers((p) => p.map((u) => u.id === data.id ? data : u));
      setTimeout(() => { setEditingUser(null); setEditSuccess(""); }, 1200);
    } else {
      setEditError(data.error || "Something went wrong");
    }
    setEditLoading(false);
  }

  async function handleDeleteUser(u: UserItem) {
    if (u.id === currentUser.id) { errToast("You cannot delete your own account."); return; }
    if (!(await confirm({ title: "Delete user?", message: `Delete user "${u.username}"?`, danger: true }))) return;
    setDeletingUserId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      if (res.ok) {
        setUsers((p) => p.filter((x) => x.id !== u.id));
      } else {
        errToast("Failed to delete user.");
      }
    } catch {
      errToast("Failed to delete user.");
    } finally {
      setDeletingUserId(null);
    }
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
    if (!(await confirm({ title: "Delete image?", message: "Delete this image?", danger: true }))) return;
    setDeletingMediaId(id);
    try {
      const res = await fetch(`/api/products/images/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMediaFiles((p) => p.filter((f) => f.id !== id));
        setMediaSuccess("✓ Image deleted"); setTimeout(() => setMediaSuccess(""), 2000);
      } else {
        errToast("Failed to delete image.");
      }
    } catch {
      errToast("Failed to delete image.");
    } finally {
      setDeletingMediaId(null);
    }
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
  const addReader = () => setReaders((rs) => [...rs, { id: newRegistryId(), name: "", device: "", url: "" }]);
  const updateReader = (id: string, patch: Partial<SavedReader>) =>
    setReaders((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  // Guard: warn if any screen is bound to this reader (deleting it silently breaks that TV's presence).
  async function removeReader(id: string) {
    const bound = displays.filter((d) => d.readerId === id);
    if (bound.length > 0) {
      const names = bound.map((d) => d.name || "(unnamed)").join(", ");
      if (!(await confirm({ title: "Remove reader?", message: `${bound.length} screen(s) use this reader (${names}). They'll lose live table presence. Remove anyway?`, danger: true }))) return;
    }
    setReaders((rs) => rs.filter((r) => r.id !== id));
  }

  // Display (TV screen) registry editor — one row per physical screen/zone.
  const addDisplay = () => setDisplays((ds) => [...ds, { id: newRegistryId(), name: "", readerId: "", rotation: 0 }]);
  const updateDisplay = (id: string, patch: Partial<SavedDisplay>) =>
    setDisplays((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  // Guard: a named display's URL may be open on a physical TV (its id is in that TV's localStorage);
  // removing it strands that screen on a dead zone id. Confirm named rows.
  async function removeDisplay(id: string) {
    const d = displays.find((x) => x.id === id);
    if (d?.name && !(await confirm({ title: "Remove display?", message: `"${d.name}" may be open on a TV — that screen will fall back to the default. Remove it?`, danger: true }))) return;
    setDisplays((ds) => ds.filter((x) => x.id !== id));
  }
  const [expandedDisplay, setExpandedDisplay] = useState("");   // which display row has its overrides open
  const identifyScreens = async () => { try { await fetch("/api/display/identify", { method: "POST" }); } catch { /* ignore */ } };

  // Idle video upload → fills idleVideoUrl (browser-direct to storage; signed URL).
  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setVideoErr("");
    // Fast client-side guard so violations don't cost an upload round-trip (server enforces too).
    if (!ALLOWED_UPLOAD_MIME.includes(file.type)) { setVideoErr("Use an image (PNG/JPG/WEBP/GIF) or video (MP4/WEBM)."); return; }
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
    if (!(await confirm({ title: "Delete option?", message: "Delete this option?", danger: true }))) return;
    setDeletingOptionId(id);
    try {
      const res = await fetch("/api/dropdown", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        await fetchOptions();
      } else {
        errToast("Failed to delete option.");
      }
    } catch {
      errToast("Failed to delete option.");
    } finally {
      setDeletingOptionId(null);
    }
  }

  // Sales master delete (slide 28) — removes from the Sale table, keeping the
  // historical customer.salesPerson strings intact (they're free text).
  async function handleDeleteSale(id: string) {
    if (!(await confirm({ title: "Remove sale?", message: "Remove this sale from the master list? Existing customer records keep the name.", danger: true }))) return;
    setDeletingOptionId(id);
    try {
      const res = await fetch("/api/sales", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setSalesMaster((list) => list.filter((s) => s.id !== id));
        setOptions((opts) => opts.filter((o) => o.id !== id));
      } else {
        errToast("Failed to remove sale.");
      }
    } catch {
      errToast("Failed to remove sale.");
    } finally {
      setDeletingOptionId(null);
    }
  }

  // When the Salesperson list is opened, load the Sale master instead of dropdown options.
  useEffect(() => {
    if (activeTab !== "product" || activeType !== "sales") return;
    let live = true;
    fetch("/api/sales").then((r) => r.json()).then((rows) => {
      if (!live || !Array.isArray(rows)) return;
      setSalesMaster(rows.map((r: { id: string; code: string; name: string }) => ({ id: r.id, code: r.code, name: r.name })));
      setOptions(rows.map((r: { id: string; name: string }) => ({ id: r.id, type: "sales", value: r.name, createdAt: "" })));
    }).catch(() => {});
    return () => { live = false; };
  }, [activeTab, activeType]);

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
      <PageHeader title="Settings" crumbs={[{ label: "Home", href: "/admin" }, { label: "Settings" }]} />


      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Sidebar */}
        <div className="w-full lg:w-52 shrink-0">
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            {TABS.filter((tab) => tab.key !== "account" || currentUser.role === "super_admin").map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className="w-full text-left px-4 py-3 text-sm transition-all"
                style={{
                  background: activeTab === tab.key ? "var(--color-bg)" : "transparent",
                  color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-text)",
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  borderLeft: activeTab === tab.key ? "3px solid var(--color-primary)" : "3px solid transparent",
                  borderBottom: "1px solid var(--color-bg)",
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
                <h2 className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>Widget Visibility</h2>
                <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>Choose which widgets appear on the Dashboard</p>
                <div className="space-y-2">
                  {WIDGETS.map((w) => {
                    const isOn = dashboardSettings.visibleWidgets[w.key as keyof typeof dashboardSettings.visibleWidgets];
                    return (
                      <div key={w.key} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "var(--color-bg)" }}>
                        <span className="text-sm" style={{ color: "var(--color-text)" }}>{w.label}</span>
                        <Toggle checked={isOn} label={w.label}
                          onChange={() => setDashboardSettings((p) => ({ ...p, visibleWidgets: { ...p.visibleWidgets, [w.key]: !isOn } }))} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={cardStyle}>
                <h2 className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>Default Filter</h2>
                <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>Set the default filter for the stats cards</p>
                <div className="flex gap-2 flex-wrap">
                  {(["daily","weekly","monthly","annually"] as const).map((f) => (
                    <button key={f} onClick={() => setDashboardSettings((p) => ({ ...p, defaultFilter: f }))}
                      className="px-4 py-2 rounded-xl text-sm font-medium"
                      style={{
                        background: dashboardSettings.defaultFilter === f ? "var(--color-primary)" : "var(--color-bg)",
                        color: dashboardSettings.defaultFilter === f ? "var(--color-surface)" : "var(--color-text-muted)",
                        border: "1px solid " + (dashboardSettings.defaultFilter === f ? "var(--color-primary)" : "var(--color-border)"),
                      }}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div style={cardStyle}>
                <h2 className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>Graph Color Theme</h2>
                <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>Choose the color theme for the Dashboard graphs</p>
                <div className="flex gap-3 flex-wrap mb-4">
                  {GRAPH_COLORS.map((color, i) => (
                    <button key={i} onClick={() => setDashboardSettings((p) => ({ ...p, graphColor: i }))}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                      style={{
                        border: dashboardSettings.graphColor === i ? `2px solid ${color.primary}` : "1px solid var(--color-border)",
                        background: dashboardSettings.graphColor === i ? "var(--color-bg)" : "var(--color-surface)",
                      }}>
                      <div className="flex gap-1">
                        <div className="w-4 h-4 rounded-full" style={{ background: color.primary }} />
                        <div className="w-4 h-4 rounded-full" style={{ background: color.secondary }} />
                      </div>
                      <span style={{ color: "var(--color-text)" }}>{color.label}</span>
                      {dashboardSettings.graphColor === i && (
                        <svg width="12" height="12" fill="none" stroke="#726c5a" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  ))}
                </div>
                <div className="p-4 rounded-xl" style={{ background: "var(--color-bg)" }}>
                  <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>Preview</p>
                  <div className="flex items-end gap-1 h-12">
                    {[60,85,45,70,90,55,75].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm transition-all duration-300"
                        style={{ height: `${h}%`, background: i % 2 === 0 ? selectedColor.primary : selectedColor.secondary }} />
                    ))}
                  </div>
                </div>
              </div>

              {dashboardSuccess && <p className="text-sm mb-3" style={{ color: "var(--color-success)" }}>{dashboardSuccess}</p>}
              <button disabled={savingDashboard}
                onClick={async () => {
                  setSavingDashboard(true);
                  try {
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
                  } finally { setSavingDashboard(false); }
                }}
                className="px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60 disabled:cursor-wait"
                style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>
                {savingDashboard ? <span className="inline-flex items-center gap-2"><Spinner size="xs" color="currentColor" /> Saving...</span> : "Save Settings"}
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
                    <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>User Management</h2>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Manage user accounts in the system</p>
                  </div>
                  <button onClick={() => { setShowCreate(true); setEditingUser(null); setCreateError(""); setCreateSuccess(""); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
                    style={{ background: "var(--color-primary)" }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add User
                  </button>
                </div>

                {/* Search */}
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4"
                  style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                  <svg width="14" height="14" fill="none" stroke="var(--color-icon-muted)" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Global Search"
                    className="outline-none text-sm w-full"
                    style={{ background: "transparent", color: "var(--color-text)" }} />
                  {userSearch && (
                    <button onClick={() => setUserSearch("")} style={{ color: "var(--color-text-subtle)" }}>✕</button>
                  )}
                </div>

                {/* Create form inline */}
                {showCreate && (
                  <div className="rounded-xl p-5 mb-4" style={{ background: "var(--color-bg)", border: "1.5px solid var(--color-primary)" }}>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Create New User</p>
                      <button onClick={() => setShowCreate(false)} style={{ color: "var(--color-text-muted)" }}>✕</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="create-username" className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Username <span style={{ color: "var(--color-danger)" }}>*</span></label>
                        <input id="create-username" value={createForm.username} onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))}
                          placeholder="username"
                          className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                      </div>
                      <div>
                        <label htmlFor="create-password" className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Password <span style={{ color: "var(--color-danger)" }}>*</span></label>
                        <input id="create-password" type="password" value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                          placeholder="password"
                          className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                      </div>
                      <div>
                        <label htmlFor="create-firstName" className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>First Name</label>
                        <input id="create-firstName" value={createForm.firstName} onChange={(e) => setCreateForm((p) => ({ ...p, firstName: e.target.value }))}
                          placeholder="First name"
                          className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                      </div>
                      <div>
                        <label htmlFor="create-lastName" className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Last Name</label>
                        <input id="create-lastName" value={createForm.lastName} onChange={(e) => setCreateForm((p) => ({ ...p, lastName: e.target.value }))}
                          placeholder="Last name"
                          className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                      </div>
                      <div className="col-span-2">
                        <label htmlFor="create-role" className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Role</label>
                        <select id="create-role" aria-label="Role" value={createForm.role} onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS}>
                          {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                      </div>
                    </div>
                    {createError && <p className="text-xs mt-3" style={{ color: "var(--color-danger)" }}>{createError}</p>}
                    {createSuccess && <p className="text-xs mt-3" style={{ color: "var(--color-success)" }}>{createSuccess}</p>}
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => setShowCreate(false)}
                        className="px-4 py-2 rounded-xl text-sm" style={{ background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                        Cancel
                      </button>
                      <button onClick={handleCreateUser} disabled={createLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60"
                        style={{ background: "var(--color-primary)" }}>
                        {createLoading ? <span className="inline-flex items-center gap-2"><Spinner size="xs" color="currentColor" /> Saving...</span> : "Create User"}
                      </button>
                    </div>
                  </div>
                )}

                {/* User list */}
                {usersLoading ? (
                  <div className="flex justify-center py-10">
                    <Spinner size="md" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-center text-sm py-8" style={{ color: "var(--color-text-subtle)" }}>
                    {userSearch ? "No users found" : "No users yet"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map((u) => (
                      <div key={u.id}>
                        <div className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all"
                          style={{ background: editingUser?.id === u.id ? "rgba(114,108,90,0.06)" : "var(--color-bg)", border: editingUser?.id === u.id ? "1.5px solid var(--color-primary)" : "1px solid transparent" }}>
                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                            style={{ background: u.role === "admin" ? "var(--color-primary)" : "var(--color-icon-muted)" }}>
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>{u.username}</p>
                              <span className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: u.role === "admin" ? "rgba(114,108,90,0.15)" : "var(--color-border)", color: u.role === "admin" ? "var(--color-primary)" : "var(--color-text-muted)" }}>
                                {u.role}
                              </span>
                              {u.id === currentUser.id && (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#dbeafe", color: "var(--color-info)" }}>You</span>
                              )}
                            </div>
                            <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                              {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"} · Created {formatDate(u.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => editingUser?.id === u.id ? setEditingUser(null) : openEdit(u)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ background: editingUser?.id === u.id ? "var(--color-primary)" : "var(--color-surface)", color: editingUser?.id === u.id ? "var(--color-surface)" : "var(--color-primary)", border: "1px solid var(--color-border)" }}>
                              {editingUser?.id === u.id ? "Cancel" : "Edit"}
                            </button>
                            <button onClick={() => handleDeleteUser(u)}
                              disabled={u.id === currentUser.id || deletingUserId === u.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30"
                              style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-soft)", border: "1px solid var(--color-danger-border)" }}>
                              {deletingUserId === u.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </div>

                        {/* Inline edit form */}
                        {editingUser?.id === u.id && (
                          <div className="rounded-xl p-4 mt-1" style={{ background: "var(--color-hover)", border: "1px solid var(--color-border)" }}>
                            <p className="text-xs font-semibold mb-3" style={{ color: "var(--color-text-muted)" }}>Edit details</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label htmlFor={`edit-username-${u.id}`} className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Username</label>
                                <input id={`edit-username-${u.id}`} value={editForm.username} onChange={(e) => setEditForm((p) => ({ ...p, username: e.target.value }))}
                                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                              </div>
                              <div>
                                <label htmlFor={`edit-password-${u.id}`} className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>New Password (if changing)</label>
                                <input id={`edit-password-${u.id}`} type="password" value={editForm.password} onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                                  placeholder="Leave blank to keep current"
                                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                              </div>
                              <div>
                                <label htmlFor={`edit-firstName-${u.id}`} className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>First Name</label>
                                <input id={`edit-firstName-${u.id}`} value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                              </div>
                              <div>
                                <label htmlFor={`edit-lastName-${u.id}`} className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Last Name</label>
                                <input id={`edit-lastName-${u.id}`} value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                              </div>
                              <div className="col-span-2">
                                <label htmlFor={`edit-role-${u.id}`} className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Role</label>
                                <select id={`edit-role-${u.id}`} aria-label="Role" value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={iS}>
                                  {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                                </select>
                              </div>
                            </div>
                            {editError && <p className="text-xs mt-2" style={{ color: "var(--color-danger)" }}>{editError}</p>}
                            {editSuccess && <p className="text-xs mt-2" style={{ color: "var(--color-success)" }}>{editSuccess}</p>}
                            <div className="flex gap-2 mt-3">
                              <button onClick={() => setEditingUser(null)}
                                className="px-4 py-2 rounded-xl text-sm" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
                                Cancel
                              </button>
                              <button onClick={handleSaveEdit} disabled={editLoading}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60"
                                style={{ background: "var(--color-primary)" }}>
                                {editLoading ? <span className="inline-flex items-center gap-2"><Spinner size="xs" color="currentColor" /> Saving...</span> : "Save"}
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
              <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>Dropdown Options</h2>
              {/* Salesperson now manages the real Sale master (ERP code + name) — slide 28 */}
              {activeType === "sales" && (
                <div className="mb-5 rounded-xl p-3" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                  <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                    Sales master — TWC staff with ERP codes. Customers reference these by name; the list also feeds the customer form picker.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <input id="sale-code" placeholder="Code (e.g. B0002)" className="w-32 px-3 py-1.5 rounded-lg outline-none text-sm"
                      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                    <input id="sale-name" placeholder="Full name" className="flex-1 min-w-40 px-3 py-1.5 rounded-lg outline-none text-sm"
                      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                    <button onClick={async () => {
                      const code = (document.getElementById("sale-code") as HTMLInputElement)?.value.trim();
                      const name = (document.getElementById("sale-name") as HTMLInputElement)?.value.trim();
                      if (!code || !name) return;
                      setDropdownLoading(true);
                      await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name }) });
                      if (document.getElementById("sale-code")) (document.getElementById("sale-code") as HTMLInputElement).value = "";
                      if (document.getElementById("sale-name")) (document.getElementById("sale-name") as HTMLInputElement).value = "";
                      // refresh list from the sale master
                      fetch("/api/sales").then((r) => r.json()).then((rows) => {
                        setSalesMaster(Array.isArray(rows) ? rows : []);
                        setOptions(rows.map((r: { id: string; name: string }) => ({ id: r.id, type: "sales", value: r.name, createdAt: "" })));
                      }).catch(() => {});
                      setDropdownLoading(false);
                    }} disabled={dropdownLoading}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>+ Add</button>
                  </div>
                  {options.length > 0 && options[0]?.type === "sales" && (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {salesMaster.map((s) => {
                        const opt = options.find((o) => o.id === s.id);
                        return (
                          <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 rounded-lg" style={{ background: "var(--color-surface)" }}>
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}>{s.code}</span>
                            <span className="text-sm flex-1 truncate" style={{ color: "var(--color-text)" }}>{s.name}</span>
                            <button onClick={() => handleDeleteSale(s.id)} disabled={deletingOptionId === s.id}
                              className="text-xs px-2 py-0.5 rounded-md disabled:opacity-40"
                              style={{ color: "var(--color-danger-soft)", background: "var(--color-danger-bg)" }}>{deletingOptionId === s.id ? "…" : "Delete"}</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                  {DROPDOWN_TYPES.map((type) => (
                    <button key={type.key} onClick={() => setActiveType(type.key)}
                      className="w-full text-left px-4 py-3 text-sm transition-all"
                      style={{
                        background: activeType === type.key ? "var(--color-bg)" : "transparent",
                        color: activeType === type.key ? "var(--color-primary)" : "var(--color-text)",
                        fontWeight: activeType === type.key ? 600 : 400,
                        borderLeft: activeType === type.key ? "3px solid var(--color-primary)" : "3px solid transparent",
                        borderBottom: "1px solid var(--color-bg)",
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
                      style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>+ Add</button>
                  </div>
                  {dropdownMessage && <p className="text-sm mb-2" style={{ color: "var(--color-success)" }}>{dropdownMessage}</p>}
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {options.length === 0 ? (
                      <p className="text-sm text-center py-6" style={{ color: "var(--color-text-subtle)" }}>No options yet</p>
                    ) : options.map((opt) => (
                      <div key={opt.id} className="flex items-center justify-between px-4 py-2 rounded-xl" style={{ background: "var(--color-bg)" }}>
                        <span className="text-sm" style={{ color: "var(--color-text)" }}>{opt.value}</span>
                        <button onClick={() => handleDeleteOption(opt.id)}
                          disabled={deletingOptionId === opt.id}
                          className="text-xs px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "var(--color-danger-soft)", background: "var(--color-danger-bg)" }}>{deletingOptionId === opt.id ? "Deleting…" : "Delete"}</button>
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
                    <h2 className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>Display Settings</h2>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Configure the TV display output</p>
                  </div>
                  <a href="/display" target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                    style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
                    Open /display ↗
                  </a>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-sm">
                  <div>
                    <label htmlFor="slide-duration" className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>Slide Duration (sec)</label>
                    <input id="slide-duration" type="number" value={slideDuration} onChange={(e) => setSlideDuration(+e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                    <p className="text-xs mt-1" style={{ color: "var(--color-text-subtle)" }}>Per image</p>
                  </div>
                  <div>
                    <label htmlFor="session-timeout" className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>Session Reset (min)</label>
                    <input id="session-timeout" type="number" value={sessionTimeout} onChange={(e) => setSessionTimeout(+e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                    <p className="text-xs mt-1" style={{ color: "var(--color-text-subtle)" }}>Auto-clear after inactivity</p>
                  </div>
                </div>
                <div className="mt-4 max-w-md">
                  <label htmlFor="relay-url" className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>Cloud Relay URL (Option E)</label>
                  <input id="relay-url" type="text" value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)}
                    placeholder="wss://relay.fly.dev (empty = use direct LAN ws://)"
                    className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-subtle)" }}>The shared base for every relay reader below — set the relay host once, then add readers by device tag. Empty = direct LAN.</p>
                </div>
                <div className="mt-4 max-w-md">
                  <label htmlFor="relay-subkey" className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>Relay Subscriber Key</label>
                  <SecretInput id="relay-subkey" value={relaySubscriberKey} onChange={setRelaySubscriberKey}
                    placeholder="subscriberKey from the relay config (needed for relay readers)"
                    secretLabel="subscriber key"
                    className="w-full px-4 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-subtle)" }}>Lets the Scan &amp; Display pages subscribe to the relay. Must match the relay&apos;s subscriberKey or reader connections close (1008). Read-only — receives scans, cannot inject.</p>
                </div>

                {/* Central reader registry — one source of truth, shown as a dropdown on Scan & Display */}
                <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>Readers</label>
                    <button onClick={addReader} className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>+ Add reader</button>
                  </div>
                  <p className="text-xs mb-3" style={{ color: "var(--color-text-subtle)" }}>
                    Named readers shown as a dropdown on Scan &amp; Display, so staff pick a name instead of typing an address.
                    Set <b>Device tag</b> for a relay reader (connects via the relay URL above), or a full <b>URL / IP</b> for a direct LAN reader.
                  </p>
                  {readers.length === 0 ? (
                    <p className="text-xs py-1" style={{ color: "var(--color-text-subtle)" }}>No readers yet — add one to get started.</p>
                  ) : (
                    <div className="space-y-2">
                      {readers.map((r) => (
                        <div key={r.id} className="rounded-lg" style={{ background: "var(--color-hover)", border: "1px solid var(--color-border)", padding: 8 }}>
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <input value={r.name} onChange={(e) => updateReader(r.id, { name: e.target.value })}
                              placeholder="Name (e.g. Table reader)" className="col-span-4 px-3 py-2 rounded-lg outline-none text-sm" style={iS} />
                            <input value={r.device} onChange={(e) => updateReader(r.id, { device: e.target.value })}
                              placeholder="Device tag (relay)" className="col-span-3 px-3 py-2 rounded-lg outline-none text-sm" style={iS} />
                            <input value={r.url} onChange={(e) => updateReader(r.id, { url: e.target.value })}
                              placeholder="or full URL / IP (direct)" className="col-span-4 px-3 py-2 rounded-lg outline-none text-sm" style={iS} />
                            <button onClick={() => removeReader(r.id)} title="Remove"
                              className="col-span-1 px-2 py-2 rounded-lg text-sm" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-soft)", border: "1px solid var(--color-danger-border)" }}>✕</button>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 pl-1">
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Type:</span>
                            {([["table", "Table (fixed)"], ["handheld", "Handheld (BLE)"], ["", "Unspecified"]] as const).map(([v, label]) => (
                              <button key={v || "none"} onClick={() => updateReader(r.id, { kind: v || undefined })}
                                className="px-2 py-1 rounded-md text-xs"
                                style={{ background: (r.kind ?? "") === v ? "var(--color-primary)" : "var(--color-surface)", color: (r.kind ?? "") === v ? "var(--color-surface)" : "var(--color-text)", border: "1px solid var(--color-border)" }}>
                                {label}
                              </button>
                            ))}
                            <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Bind a <b>Table</b> reader to a screen; use a <b>Handheld</b> at the scan station.</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <ReaderSetupGuide />
                </div>

                {/* Central display (TV screen) registry — one row per physical screen/zone */}
                <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>Displays (TV screens)</label>
                    <div className="flex items-center gap-2">
                      {displays.length > 0 && (
                        // Flash every open screen's name so you can match a row to the physical TV.
                        <button onClick={identifyScreens} className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>Identify screens</button>
                      )}
                      <button onClick={addDisplay} className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>+ Add display</button>
                    </div>
                  </div>
                  <p className="text-xs mb-3" style={{ color: "var(--color-text-subtle)" }}>
                    Each screen is a zone. Bind it to a <b>reader</b> (its live table presence) and a <b>rotation</b>, then open that TV at its <b>URL</b> below.
                    Staff pick a screen by name when they press <b>Send to Display</b>. No displays = one shared default screen.
                  </p>
                  {displays.length === 0 ? (
                    <p className="text-xs py-1" style={{ color: "var(--color-text-subtle)" }}>No displays yet — add one per TV to route lists to the right screen.</p>
                  ) : (
                    <div className="space-y-2">
                      {displays.map((d) => (
                        <div key={d.id} className="rounded-lg" style={{ background: "var(--color-hover)", border: "1px solid var(--color-border)", padding: 8 }}>
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <input value={d.name} onChange={(e) => updateDisplay(d.id, { name: e.target.value })}
                              placeholder="Name (e.g. Table A)" className="col-span-4 px-3 py-2 rounded-lg outline-none text-sm" style={iS} />
                            <select value={d.readerId} onChange={(e) => updateDisplay(d.id, { readerId: e.target.value })}
                              aria-label="Bound reader"
                              className="col-span-4 px-3 py-2 rounded-lg outline-none text-sm" style={iS}>
                              <option value="">No reader (sent lists only)</option>
                              {readers.map((r) => {
                                const k = r.kind === "table" ? " · Table" : r.kind === "handheld" ? " · Handheld" : "";
                                return <option key={r.id} value={r.id}>{(r.name || r.device || r.url || "(unnamed reader)") + k}</option>;
                              })}
                            </select>
                            <select value={d.rotation} onChange={(e) => updateDisplay(d.id, { rotation: Number(e.target.value) })}
                              aria-label="Rotation"
                              className="col-span-3 px-3 py-2 rounded-lg outline-none text-sm" style={iS}>
                              {[0, 90, 180, 270].map((deg) => <option key={deg} value={deg}>{deg}°</option>)}
                            </select>
                            <button onClick={() => removeDisplay(d.id)} title="Remove"
                              className="col-span-1 px-2 py-2 rounded-lg text-sm" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-soft)", border: "1px solid var(--color-danger-border)" }}>✕</button>
                          </div>
                          {/* Soft guardrail: a screen's bound reader is its LIVE table-presence source, which
                              wins over sent lists. A roaming handheld here would clobber sent lists with stray
                              reads — warn (don't block; setup/testing may need it). */}
                          {(() => {
                            const br = d.readerId ? readers.find((r) => r.id === d.readerId) : undefined;
                            if (br && br.kind !== "table") {
                              return <p className="text-xs mt-1.5 pl-1" style={{ color: "var(--color-danger-soft)" }}>
                                ⚠ &ldquo;{br.name || br.device || br.url}&rdquo; isn&apos;t marked a <b>Table</b> reader. Bind a fixed table reader here — a handheld&apos;s roaming reads will hide the sent customer list.
                              </p>;
                            }
                            return null;
                          })()}
                          {d.name.trim() ? (
                            // Only expose the URL once the row has a name — an unnamed row is dropped on
                            // save, and its id is baked into this URL + any session pinned to it.
                            <div className="flex items-center gap-2 mt-1.5 pl-1">
                              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>URL:</span>
                              <code className="text-xs" style={{ color: "var(--color-text-muted)", background: "var(--color-bg)", padding: "1px 6px", borderRadius: 4 }}>{displayUrl(d.id)}</code>
                              <a href={displayUrl(d.id)} target="_blank" rel="noopener noreferrer" className="text-xs font-medium" style={{ color: "#4a6fa5" }}>Open ↗</a>
                            </div>
                          ) : (
                            <p className="text-xs mt-1.5 pl-1" style={{ color: "var(--color-text-subtle)" }}>Name this screen to get its URL — unnamed rows aren&apos;t saved.</p>
                          )}

                          {/* Per-screen IDLE overrides — collapsed by default. Any control left empty
                              inherits the global idle settings above; an explicit value overrides only
                              THIS screen. Stored in the display row's JSON (no schema change). */}
                          {(() => {
                            const hasOverride = !!(d.idleVideoUrl || (d.idleImages && d.idleImages.length) || d.idleSlideSeconds || d.idleVideoFit || d.slideDuration);
                            const open = expandedDisplay === d.id;
                            return (
                              <div className="mt-1.5 pl-1">
                                <button onClick={() => setExpandedDisplay(open ? "" : d.id)}
                                  className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                  {open ? "▾" : "▸"} Override idle media for this screen{hasOverride && !open ? " (active)" : ""}
                                </button>
                                {open && (
                                  <div className="mt-2 p-3 rounded-lg space-y-3" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                                    <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Blank = inherit the global idle settings above. Set only what should differ on <b>{d.name || "this screen"}</b>.</p>
                                    {/* Idle slideshow images (per-screen) */}
                                    <div>
                                      <label className="block text-xs mb-1" style={{ color: "var(--color-text)" }}>Idle slideshow images</label>
                                      <ProductImagePicker urls={d.idleImages ?? []} onChange={(urls) => updateDisplay(d.id, { idleImages: urls.length ? urls : undefined })} />
                                    </div>
                                    {/* Single idle media URL (per-screen) */}
                                    <div>
                                      <label className="block text-xs mb-1" style={{ color: "var(--color-text)" }}>Or a single idle media URL (image/video)</label>
                                      <input value={d.idleVideoUrl ?? ""} onChange={(e) => updateDisplay(d.id, { idleVideoUrl: e.target.value.trim() || undefined })}
                                        placeholder="https://… .mp4 or .png  (blank = inherit)"
                                        className="w-full px-3 py-2 rounded-lg outline-none text-sm" style={iS} />
                                    </div>
                                    <div className="flex items-center gap-3 flex-wrap">
                                      {/* Fit/Fill */}
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Fit:</span>
                                        {(["", "contain", "cover"] as const).map((v) => (
                                          <button key={v || "inherit"} onClick={() => updateDisplay(d.id, { idleVideoFit: v || undefined })}
                                            className="px-2 py-1 rounded-md text-xs"
                                            style={{ background: (d.idleVideoFit ?? "") === v ? "var(--color-primary)" : "var(--color-surface)", color: (d.idleVideoFit ?? "") === v ? "var(--color-surface)" : "var(--color-text)", border: "1px solid var(--color-border)" }}>
                                            {v === "" ? "Inherit" : v === "contain" ? "Fit" : "Fill"}
                                          </button>
                                        ))}
                                      </div>
                                      {/* Idle slide seconds */}
                                      <label className="text-xs flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
                                        Slide secs
                                        <input type="number" min={1} max={120} value={d.idleSlideSeconds ?? ""} placeholder="—"
                                          onChange={(e) => { const n = Math.floor(Number(e.target.value)); updateDisplay(d.id, { idleSlideSeconds: Number.isFinite(n) && n >= 1 ? Math.min(120, n) : undefined }); }}
                                          className="w-16 px-2 py-1 rounded-md outline-none text-sm" style={iS} />
                                      </label>
                                      {/* Product slide duration */}
                                      <label className="text-xs flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
                                        Product secs
                                        <input type="number" min={1} max={120} value={d.slideDuration ?? ""} placeholder="—"
                                          onChange={(e) => { const n = Math.floor(Number(e.target.value)); updateDisplay(d.id, { slideDuration: Number.isFinite(n) && n >= 1 ? Math.min(120, n) : undefined }); }}
                                          className="w-16 px-2 py-1 rounded-md outline-none text-sm" style={iS} />
                                      </label>
                                    </div>
                                    {hasOverride && (
                                      <button onClick={() => updateDisplay(d.id, { idleVideoUrl: undefined, idleImages: undefined, idleSlideSeconds: undefined, idleVideoFit: undefined, slideDuration: undefined })}
                                        className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
                                        Reset to global
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Idle media — a video (loops) or a still image, full-screen on /display when no product is showing */}
                <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <label htmlFor="idle-video-url" className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Idle media — video or image (/display)</label>
                  <p className="text-xs mb-1" style={{ color: "var(--color-text-subtle)" }}>
                    Shows full-screen on the TV when idle (no product): a video loops muted, or a still image is displayed. Paste a URL, or upload a file. Empty = the logo screen.
                  </p>
                  <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                    Upload limits: <b>image</b> (PNG/JPG/WEBP/GIF) or <b>video</b> (MP4/WEBM) · max <b>{MAX_UPLOAD_MB} MB</b> · video plays <b>muted</b> (browser autoplay). Tip: a short 10–30s loop keeps a video small.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input id="idle-video-url" type="text" value={idleVideoUrl} onChange={(e) => setIdleVideoUrl(e.target.value)}
                      placeholder="https://… .mp4 or .png   (or Upload →)"
                      className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl outline-none text-sm" style={iS} />
                    <label className={`px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer whitespace-nowrap ${videoUploading ? "opacity-60 pointer-events-none" : ""}`}
                      style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
                      {videoUploading ? "Uploading…" : "Upload"}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" className="hidden" onChange={handleVideoUpload} disabled={videoUploading} />
                    </label>
                    {idleVideoUrl && (
                      <button onClick={() => setIdleVideoUrl("")} className="px-3 py-2.5 rounded-xl text-sm"
                        style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-soft)", border: "1px solid var(--color-danger-border)" }}>Remove</button>
                    )}
                  </div>
                  {videoErr && <p className="text-xs mt-1" style={{ color: "var(--color-danger-soft)" }}>{videoErr}</p>}
                  {idleVideoUrl && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>On screen:</span>
                      {([["contain", "Fit (whole media)"], ["cover", "Fill (crop to screen)"]] as const).map(([v, label]) => (
                        <button key={v} onClick={() => setIdleVideoFit(v)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{
                            background: idleVideoFit === v ? "var(--color-primary)" : "var(--color-bg)",
                            color: idleVideoFit === v ? "var(--color-surface)" : "var(--color-text)",
                            border: "1px solid " + (idleVideoFit === v ? "var(--color-primary)" : "var(--color-border)"),
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {idleVideoUrl && (
                    isImageUrl(idleVideoUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={idleVideoUrl} alt="Idle preview" className="mt-2 w-56 rounded-lg" style={{ background: "#000", objectFit: idleVideoFit as "contain" | "cover", aspectRatio: "16/9" }} />
                    ) : (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={idleVideoUrl} className="mt-2 w-56 rounded-lg" style={{ background: "#000", objectFit: idleVideoFit as "contain" | "cover", aspectRatio: "16/9" }} muted loop playsInline controls />
                    )
                  )}

                  {/* Idle slideshow — multiple images that cross-fade full-screen when idle */}
                  <div className="mt-5 pt-4" style={{ borderTop: "1px dashed var(--color-border)" }}>
                    <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Idle slideshow (images)</label>
                    <p className="text-xs mb-2" style={{ color: "var(--color-text-subtle)" }}>
                      Upload multiple images to cross-fade full-screen on the TV when idle. Drag to reorder. <b>When set, the slideshow takes precedence over the single video/image above.</b> Uses the same Fit/Fill setting. Empty = use the single media (or logo).
                    </p>
                    <ProductImagePicker urls={idleImages} onChange={setIdleImages} />
                    {idleImages.length > 0 && (
                      <div className="mt-3 flex items-center gap-2">
                        <label htmlFor="idle-slide-seconds" className="text-sm" style={{ color: "var(--color-text)" }}>Seconds per slide</label>
                        <input id="idle-slide-seconds" type="number" min={1} max={120} value={idleSlideSeconds}
                          onChange={(e) => setIdleSlideSeconds(Math.max(1, Math.min(120, Math.floor(Number(e.target.value)) || 6)))}
                          className="w-20 px-3 py-2 rounded-xl outline-none text-sm" style={iS} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Screen rotation — for portrait-mounted TVs etc. */}
                <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Screen rotation</label>
                  <p className="text-xs mb-2" style={{ color: "var(--color-text-subtle)" }}>Rotates the whole /display screen. Per-TV override: add <code style={{ background: "var(--color-bg)", padding: "0 4px", borderRadius: 4 }}>?rotate=90</code> to that screen&apos;s URL.</p>
                  <div className="flex gap-2 flex-wrap">
                    {[0, 90, 180, 270].map((deg) => (
                      <button key={deg} onClick={() => setDisplayRotation(deg)}
                        className="px-4 py-2 rounded-xl text-sm font-medium"
                        style={{
                          background: displayRotation === deg ? "var(--color-primary)" : "var(--color-bg)",
                          color: displayRotation === deg ? "var(--color-surface)" : "var(--color-text)",
                          border: "1px solid " + (displayRotation === deg ? "var(--color-primary)" : "var(--color-border)"),
                        }}>
                        {deg}°{deg === 0 ? " (normal)" : deg === 90 ? " ↻" : deg === 270 ? " ↺" : ""}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  {displaySettingsSuccess && <p className="text-sm" style={{ color: "var(--color-success)" }}>{displaySettingsSuccess}</p>}
                  {registryDirty && !displaySettingsSuccess && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-soft)", border: "1px solid var(--color-danger-border)" }}>
                      Unsaved reader/display changes
                    </span>
                  )}
                </div>
                <button disabled={savingDisplay}
                  onClick={async () => {
                    setSavingDisplay(true);
                    await saveSettings({ slideDuration, sessionTimeout, relayUrl: relayUrl.trim(), relaySubscriberKey: relaySubscriberKey.trim(), readers, displays, idleVideoUrl: idleVideoUrl.trim(), displayRotation, idleVideoFit, idleImages, idleSlideSeconds }, () => { setDisplaySettingsSuccess("✓ Saved"); setTimeout(() => setDisplaySettingsSuccess(""), 2000); setSavedRegistrySnap(JSON.stringify(readers) + "|" + JSON.stringify(displays)); });
                    setSavingDisplay(false);
                  }}
                  className="mt-4 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60 disabled:cursor-wait" style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>
                  {savingDisplay ? <span className="inline-flex items-center gap-2"><Spinner size="xs" color="currentColor" /> Saving...</span> : "Save"}
                </button>
              </div>

              <div style={cardStyle}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Media Files</h2>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Overview of all product images — upload &amp; reorder in Edit Product</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4"
                  style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                  <svg width="14" height="14" fill="none" stroke="var(--color-icon-muted)" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input value={mediaSearch} onChange={(e) => setMediaSearch(e.target.value)}
                    placeholder="Search by product name or code..."
                    className="outline-none text-sm w-full" style={{ background: "transparent", color: "var(--color-text)" }} />
                </div>
                {mediaSuccess && <p className="text-sm mb-3" style={{ color: "var(--color-success)" }}>{mediaSuccess}</p>}
                {mediaLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Spinner size="lg" />
                  </div>
                ) : filteredMedia.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>{mediaSearch ? "No results found" : "No media files yet"}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    <div className="grid grid-cols-12 px-3 pb-1 text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                      <div className="col-span-1">Image</div>
                      <div className="col-span-5">Product</div>
                      <div className="col-span-3">Code</div>
                      <div className="col-span-2 text-center">Order</div>
                      <div className="col-span-1" />
                    </div>
                    {filteredMedia.map((file) => (
                      <div key={file.id} className="grid grid-cols-12 items-center px-3 py-2 rounded-xl" style={{ background: "var(--color-bg)" }}>
                        <div className="col-span-1">
                          <div className="w-8 h-10 rounded overflow-hidden" style={{ background: "var(--color-border)" }}>
                            <Image src={file.url} alt="" width={32} height={40} className="w-full h-full object-cover" />
                          </div>
                        </div>
                        <div className="col-span-5 text-sm truncate pr-2" style={{ color: "var(--color-text)" }}>{file.product?.name ?? "–"}</div>
                        <div className="col-span-3 text-xs" style={{ color: "var(--color-text-muted)" }}>{file.product?.productCode ?? "–"}</div>
                        <div className="col-span-2 text-center text-xs" style={{ color: "var(--color-text-muted)" }}>#{file.order + 1}</div>
                        <div className="col-span-1 flex gap-1 justify-end">
                          <a href={file.url} download className="w-6 h-6 flex items-center justify-center rounded-lg" style={{ background: "var(--color-border)" }}>
                            <svg width="11" height="11" fill="none" stroke="#726c5a" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                          </a>
                          <button onClick={() => handleDeleteMedia(file.id)}
                            disabled={deletingMediaId === file.id}
                            className="w-6 h-6 flex items-center justify-center rounded-lg disabled:opacity-40" style={{ background: "var(--color-danger-bg)" }}>
                            <svg width="11" height="11" fill="none" stroke="var(--color-danger-soft)" strokeWidth="2" viewBox="0 0 24 24">
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
                <h2 className="text-base font-semibold mb-1" style={{ color: "var(--color-text)" }}>Takeaway Limit</h2>
                <p className="text-xs mb-6" style={{ color: "var(--color-text-muted)" }}>Set the maximum number of sample products a customer can take out per session</p>
                <div className="flex items-center justify-between p-4 rounded-xl mb-6" style={{ background: "var(--color-bg)" }}>
                  <div>
                    <p className="font-medium text-sm" style={{ color: "var(--color-text)" }}>Enable Takeaway Limit</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Limit how many products a customer can take out</p>
                  </div>
                  <Toggle checked={takeawayEnabled} label="Enable Takeaway Limit"
                    onChange={(v) => setTakeawayEnabled(v)} />
                </div>
                <div className={takeawayEnabled ? "" : "opacity-40 pointer-events-none"}>
                  <p className="text-sm font-medium mb-4" style={{ color: "var(--color-text)" }}>Maximum products per session</p>
                  <div className="flex items-center gap-3 mb-6">
                    <Stepper value={takeawayLimit} onChange={setTakeawayLimit} min={1} max={20} ariaLabel="Maximum products per session" />
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>items / session</span>
                  </div>
                  <div>
                    <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>Preset</p>
                    <div className="flex gap-2 flex-wrap">
                      {[1,2,3,5,10].map((preset) => (
                        <button key={preset} onClick={() => setTakeawayLimit(preset)}
                          className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                          style={{
                            background: takeawayLimit === preset ? "var(--color-primary)" : "var(--color-bg)",
                            color: takeawayLimit === preset ? "var(--color-surface)" : "var(--color-text)",
                            border: "1px solid " + (takeawayLimit === preset ? "var(--color-primary)" : "var(--color-border)"),
                          }}>
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Borrow / Return period — drives the default due date + "overdue" flag */}
                <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <p className="text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Borrow period</p>
                  <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>Default days a takeaway is due back — drives the due date &amp; “overdue” flag on the Borrow / Return page. A per-item due date still overrides this.</p>
                  <div className="flex items-center gap-3 mb-4">
                    <Stepper value={borrowDays} onChange={setBorrowDays} min={1} max={365} ariaLabel="Borrow period in days" />
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>days</span>
                  </div>
                  <div>
                    <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>Preset</p>
                    <div className="flex gap-2 flex-wrap">
                      {[7, 14, 30, 60, 90].map((preset) => (
                        <button key={preset} onClick={() => setBorrowDays(preset)}
                          className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                          style={{
                            background: borrowDays === preset ? "var(--color-primary)" : "var(--color-bg)",
                            color: borrowDays === preset ? "var(--color-surface)" : "var(--color-text)",
                            border: "1px solid " + (borrowDays === preset ? "var(--color-primary)" : "var(--color-border)"),
                          }}>
                          {preset}d
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {takeawaySuccess && <p className="text-sm mt-4" style={{ color: "var(--color-success)" }}>{takeawaySuccess}</p>}
                <button disabled={savingTakeaway}
                  onClick={async () => {
                    setSavingTakeaway(true);
                    try {
                      await fetch("/api/settings", {
                        method: "PUT", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ takeawayLimit, takeawayEnabled, borrowDays }),
                      });
                      setTakeawaySuccess("✓ Takeaway settings saved");
                      setTimeout(() => setTakeawaySuccess(""), 2000);
                    } finally { setSavingTakeaway(false); }
                  }}
                  className="mt-5 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60 disabled:cursor-wait"
                  style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>
                  {savingTakeaway ? <span className="inline-flex items-center gap-2"><Spinner size="xs" color="currentColor" /> Saving...</span> : "Save Settings"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}