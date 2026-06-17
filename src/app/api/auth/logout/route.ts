import { NextResponse } from "next/server";
import { AUTH_COOKIE, authCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  // Clear with the SAME attributes the cookie was set with so it actually expires.
  response.cookies.set(AUTH_COOKIE, "", { ...authCookieOptions, maxAge: 0 });
  return response;
}
