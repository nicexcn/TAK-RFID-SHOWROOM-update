import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

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
