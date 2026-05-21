import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

export function proxy(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const { pathname } = req.nextUrl;

  if (pathname === "/login" && token) {
    const user = verifyToken(token);
    if (user) return NextResponse.redirect(new URL("/admin", req.url));
  }

  if (pathname.startsWith("/admin")) {
    if (!token) return NextResponse.redirect(new URL("/login", req.url));
    const user = verifyToken(token);
    if (!user) return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};