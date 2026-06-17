import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

if (!process.env.JWT_SECRET) {
  // Fail loudly instead of silently signing/verifying with a guessable default.
  throw new Error(
    "JWT_SECRET is not set. Refusing to start with an insecure default secret. " +
      "Set JWT_SECRET in the environment (.env)."
  );
}

const JWT_SECRET: string = process.env.JWT_SECRET;

if (JWT_SECRET.length < 32 || JWT_SECRET === "change-me-to-a-random-secret") {
  // Don't hard-fail (would take prod down on a misconfig) but make it loud: a
  // short/guessable HS256 secret lets anyone forge an admin token.
  console.warn("[auth] JWT_SECRET is weak (<32 chars or placeholder). Use a 32+ byte random secret.");
}

export const AUTH_COOKIE = "token";

// Shared cookie attributes for the session token. `secure` only in production so
// local HTTP dev still works; `sameSite: lax` blocks cross-site POST CSRF while
// still allowing top-level navigations.
export const authCookieOptions = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: { id: string; username: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; username: string; role: string };
  } catch {
    return null;
  }
}