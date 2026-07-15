import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { canAccessPath } from "@/lib/roles";

export type AuthUser = { id: string; username: string; role: string };

/** Read and verify the JWT from the request cookie. Returns null if absent/invalid. */
export function getUserFromRequest(req: NextRequest): AuthUser | null {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Guard a route handler: require an authenticated super_admin.
 * Returns a NextResponse to short-circuit on failure, or the user on success.
 */
export function requireSuperAdmin(req: NextRequest): { user: AuthUser } | { response: NextResponse } {
  const user = getUserFromRequest(req);
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "super_admin") {
    return { response: NextResponse.json({ error: "Forbidden: super admin only" }, { status: 403 }) };
  }
  return { user };
}

/**
 * Guard a route handler: require a user whose role may reach `path` (same rule as the
 * page nav / proxy.ts). The middleware only AUTHENTICATES API calls — it does not check
 * role — so privileged write routes (settings, products) must self-guard to match the
 * page restriction, otherwise a low-tier account that can't load the page can still call
 * the API directly. Apply to write verbs only; GET/read stays open for the scan flows.
 */
export function requireAccess(
  req: NextRequest,
  path: string,
): { user: AuthUser } | { response: NextResponse } {
  const user = getUserFromRequest(req);
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!canAccessPath(user.role, path)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

/**
 * Guard a route handler: require the user's role to be one of `roles`. Use for capability
 * gates that don't map cleanly to a page path — e.g. customer profiles are viewable by the
 * basic Presenter (who registers visitors) but editing/deleting a profile is not allowed
 * for that role (customer spec item 6). Write verbs only.
 */
export function requireRole(
  req: NextRequest,
  roles: string[],
): { user: AuthUser } | { response: NextResponse } {
  const user = getUserFromRequest(req);
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!roles.includes(user.role)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}
