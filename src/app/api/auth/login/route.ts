import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, generateToken, AUTH_COOKIE, authCookieOptions } from "@/lib/auth";

// Best-effort in-memory throttle. On serverless this is per-instance only — a real
// deployment should back it with Upstash/Redis — but it still blunts single-host
// brute-force bursts on top of bcrypt's cost.
const attempts = new Map<string, { count: number; until: number }>();
const MAX_FAILS = 8;
const WINDOW_MS = 60_000;
const LOCK_MS = 5 * 60_000;

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const key = username.toLowerCase();
    const now = Date.now();
    const rec = attempts.get(key);
    if (rec && rec.until > now && rec.count >= MAX_FAILS) {
      return NextResponse.json({ error: "Too many attempts, please try again later" }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    const isValid = user ? await comparePassword(password, user.password) : false;
    if (!user || !isValid) {
      const next = rec && rec.until > now ? rec : { count: 0, until: now + WINDOW_MS };
      next.count += 1;
      if (next.count >= MAX_FAILS) next.until = now + LOCK_MS;
      attempts.set(key, next);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    attempts.delete(key);

    const token = generateToken({ id: user.id, username: user.username, role: user.role });
    const response = NextResponse.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    response.cookies.set(AUTH_COOKIE, token, authCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
