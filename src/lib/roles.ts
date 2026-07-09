// #6: role-based menu access. One source of truth for roles + which /admin pages each may reach.
// Enforced server-side in proxy.ts (page redirects) and in sensitive API routes; the nav in
// admin/layout.tsx filters links to match. Order of a role's paths = its landing page (index 0).

export const ROLES = [
  { key: "super_admin", label: "Super Admin" },
  { key: "management", label: "Management (Sales Director)" },
  { key: "admin", label: "Admin (Showroom Manager)" },
  { key: "user", label: "Basic (Presenter)" },
  { key: "prep", label: "Prep staff (prepare only)" },
] as const;

// Allowed /admin paths per role. "/admin" is the dashboard (exact match); others match by prefix.
// /admin/loans (Borrow/Return) is not in the sidebar — it's reached via a link on the Notifications
// page, so every role that can see Notifications must also be allowed to open it.
const ACCESS: Record<string, string[]> = {
  super_admin: ["/admin", "/admin/reports", "/admin/survey", "/admin/products", "/admin/customers", "/admin/rfid", "/admin/manual-scan", "/admin/notifications", "/admin/loans", "/admin/settings"],
  admin:       ["/admin", "/admin/reports", "/admin/survey", "/admin/products", "/admin/customers", "/admin/rfid", "/admin/manual-scan", "/admin/notifications", "/admin/loans", "/admin/settings"],
  management:  ["/admin", "/admin/reports", "/admin/survey", "/admin/customers", "/admin/notifications", "/admin/loans"],
  user:        ["/admin", "/admin/customers", "/admin/rfid", "/admin/manual-scan", "/admin/notifications", "/admin/loans"],
  prep:        ["/admin/notifications", "/admin/loans"], // takeaway-prep staff: prepare queue + returns
};

/** The paths a role may reach (falls back to the basic role for unknown roles). */
export function allowedPaths(role: string): string[] {
  return ACCESS[role] ?? ACCESS.user;
}

/** The role's landing page (first allowed path). */
export function defaultPath(role: string): string {
  return allowedPaths(role)[0] ?? "/admin";
}

/** Whether a role may access an /admin pathname (exact for the dashboard, prefix for sub-pages). */
export function canAccessPath(role: string, pathname: string): boolean {
  return allowedPaths(role).some((p) => (p === "/admin" ? pathname === "/admin" : pathname === p || pathname.startsWith(p + "/")));
}
