import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// API routes that must remain reachable WITHOUT a valid session.
// - auth login/logout: needed to obtain/clear a token
// - sessions/display: read by the public TV display page (/display), unauthenticated
const PUBLIC_API = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/sessions/display",
  "/api/display", // table-display product map (TV has no login)
  "/api/scan", // server-side scan ingest — self-authenticates via x-ingest-key, not the cookie
];

export function proxy(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const { pathname } = req.nextUrl;

  // Already-logged-in users skip the login page
  if (pathname === "/login" && token) {
    const user = verifyToken(token);
    if (user) return NextResponse.redirect(new URL("/admin", req.url));
  }

  // Admin pages -> redirect to /login when unauthenticated
  if (pathname.startsWith("/admin")) {
    if (!token) return NextResponse.redirect(new URL("/login", req.url));
    const user = verifyToken(token);
    if (!user) return NextResponse.redirect(new URL("/login", req.url));
  }

  // API routes -> 401 JSON when unauthenticated (except the public allow-list)
  if (pathname.startsWith("/api/")) {
    const isPublicPath = PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"));
    // The TV must GET /api/sessions/display without a login, but its POST
    // ("Send to Display" — a DB write that can reactivate/hijack a session) must
    // be authenticated. Only GET is public for that path.
    const isPublic = isPublicPath && !(pathname === "/api/sessions/display" && req.method !== "GET");
    if (!isPublic) {
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const user = verifyToken(token);
      if (!user) {
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login", "/api/:path*"],
};
