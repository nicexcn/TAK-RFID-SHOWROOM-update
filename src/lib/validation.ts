// Shared server-side validation for auth/user inputs.

// #6: keep in sync with ROLES in src/lib/roles.ts.
export const VALID_ROLES = ["user", "management", "admin", "super_admin", "prep"] as const;

export function isValidRole(role: unknown): boolean {
  return typeof role === "string" && (VALID_ROLES as readonly string[]).includes(role);
}

// Minimum-strength check for any password the admin tool sets. Returns an error
// message, or null when acceptable.
export function passwordError(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!pw.trim()) return "Password cannot be blank";
  return null;
}
