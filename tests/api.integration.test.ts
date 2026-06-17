/**
 * API integration tests — assert the auth/authorization fixes against a running
 * dev server. Opt-in: run with `npm run test:api` while `next dev` is up.
 * Skips automatically if the server is unreachable so it never breaks `npm test`.
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3458";
const ADMIN = { username: "admin", password: process.env.TEST_ADMIN_PW || "admin1234" };

async function reachable(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/auth/me`, { signal: AbortSignal.timeout(120_000) });
    return r.status === 401 || r.status === 200;
  } catch {
    return false;
  }
}

let up = false;
beforeAll(async () => {
  up = await reachable();
  if (!up) console.warn(`[api.integration] server not reachable at ${BASE} — skipping`);
}, 130_000);

describe("API auth & authorization", () => {
  it("rejects unauthenticated access to sensitive routes (401)", async () => {
    if (!up) return;
    for (const ep of ["/api/users", "/api/customers", "/api/settings", "/api/dashboard", "/api/products"]) {
      const r = await fetch(`${BASE}${ep}`);
      expect(r.status, `${ep} should require auth`).toBe(401);
    }
  });

  it("keeps the TV display endpoint public (200)", async () => {
    if (!up) return;
    const r = await fetch(`${BASE}/api/sessions/display`);
    expect(r.status).toBe(200);
  });

  it("rejects bad credentials (401) and accepts good ones", async () => {
    if (!up) return;
    const bad = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "definitely-wrong" }),
    });
    expect(bad.status).toBe(401);

    const ok = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ADMIN),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("token=");
  });

  it("blocks unauthenticated user creation / privilege escalation (401)", async () => {
    if (!up) return;
    const r = await fetch(`${BASE}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "x", password: "x", role: "super_admin" }),
    });
    expect(r.status).toBe(401);
  });

  it("lets a super_admin read the user list (200)", async () => {
    if (!up) return;
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ADMIN),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const r = await fetch(`${BASE}/api/users`, { headers: { cookie } });
    expect(r.status).toBe(200);
    const users = await r.json();
    expect(Array.isArray(users)).toBe(true);
    // never leak password hashes
    for (const u of users) expect(u).not.toHaveProperty("password");
  });
});
