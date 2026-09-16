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
// TAK 28/8: Manual Scan merged into Surface Scan (/admin/manual-scan redirects) and Borrow/Return
// retired (samples are given, not borrowed) — both paths removed from every role, so direct
// navigation redirects to the role's landing page.
// Per the customer's role matrix (post-demo doc, item 6):
//  - Admin (Showroom Manager, "Administrator Limited") = Super Admin MINUS system Settings, user
//    management, and customer-database export. So: no /admin/settings here (and /api/settings PUT,
//    which self-guards on /admin/settings, then 403s for admin — read/GET stays open for scan flows).
//  - Basic (Presenter) must NOT view analytics: no "/admin" dashboard — they land on /admin/customers.
//  - Only Super Admin may export the customer database (enforced in the UI export gates, not by path).
const ACCESS: Record<string, string[]> = {
  super_admin: ["/admin", "/admin/reports", "/admin/survey", "/admin/products", "/admin/customers", "/admin/rfid", "/admin/notifications", "/admin/settings"],
  admin:       ["/admin", "/admin/reports", "/admin/survey", "/admin/products", "/admin/customers", "/admin/rfid", "/admin/notifications"],
  management:  ["/admin", "/admin/reports", "/admin/survey", "/admin/customers", "/admin/notifications"],
  user:        ["/admin/customers", "/admin/rfid", "/admin/notifications"],
  prep:        ["/admin/notifications"], // takeaway-prep staff: prepare queue (loans retired 28/8)
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
